"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { getComputedTasks } from "@/lib/schedule";
import { projectCal } from "@/lib/cpm";
import { useLanguage, useT } from "@/lib/useT";
import { serializeProjectFile } from "@/lib/projectFile";
import { downloadBlob, formatDate, safeFileName } from "@/lib/format";
import { exportGanttExcel } from "@/lib/ganttExcel";
import type { ComputedTask, ID, Zoom } from "@/lib/types";
import TaskTable from "./TaskTable";
import GanttChart from "./GanttChart";
import ResourcePanel from "./ResourcePanel";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeToggle from "./ThemeToggle";
import AdjustScheduleModal from "./AdjustScheduleModal";
import SchedulingPanel from "./schedule/SchedulingPanel";
import CalendarModal from "./schedule/CalendarModal";
import TaskDetailsModal from "./schedule/TaskDetailsModal";
import TaskResourcesModal from "./schedule/TaskResourcesModal";
import NetworkDiagram from "./schedule/NetworkDiagram";
import ResourceHistogram from "./schedule/ResourceHistogram";
import ScheduleChecks from "./schedule/ScheduleChecks";
import SCurve from "./schedule/SCurve";
import VarianceTable from "./schedule/VarianceTable";
import TrackingReport from "./schedule/TrackingReport";
import ExchangeModal from "./schedule/ExchangeModal";
import BudgetView from "./budget/BudgetView";
import BudgetReports from "./budget/BudgetReports";
import { FolderIcon } from "./icons";

function ToolbarButton({
  onClick,
  disabled,
  children,
  title,
  active,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
          : "border-neutral-200 text-neutral-700 hover:bg-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="mx-1 h-5 w-px bg-neutral-200" />;
}

type Modal =
  | "resources"
  | "adjust"
  | "settings"
  | "calendar"
  | "details"
  | "taskResources"
  | "exchange-import"
  | "exchange-export"
  | "checks"
  | null;
type View = "network" | "histogram" | "scurve" | "variance" | "report" | "budgetReports" | "ganttReport" | null;
type Filter = "all" | "critical" | "negative";

export default function ProjectView({ projectId }: { projectId: ID }) {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const addTask = useStore((s) => s.addTask);
  const addSubtask = useStore((s) => s.addSubtask);
  const addMilestone = useStore((s) => s.addMilestone);
  const addChapter = useStore((s) => s.addChapter);
  const deleteTask = useStore((s) => s.deleteTask);
  const indent = useStore((s) => s.indent);
  const outdent = useStore((s) => s.outdent);
  const move = useStore((s) => s.move);
  const renameProject = useStore((s) => s.renameProject);
  const undo = useStore((s) => s.undo);
  const undoDepth = useStore((s) => s.undoDepth[projectId] ?? 0);
  const scheduleNow = useStore((s) => s.scheduleNow);
  const fileHandle = useStore((s) => s.fileHandles[projectId]);
  const fileStatus = useStore((s) => s.fileStatus[projectId]);
  const t = useT();
  const lang = useLanguage();

  const [selectedId, setSelectedId] = useState<ID | null>(null);
  const [zoom, setZoom] = useState<Zoom>("week");
  const [collapsedIds, setCollapsedIds] = useState<Set<ID>>(new Set());
  const [modal, setModal] = useState<Modal>(null);
  const [modalTaskId, setModalTaskId] = useState<ID | null>(null);
  const [view, setView] = useState<View>(null);
  const [showCritical, setShowCritical] = useState(false);
  const [showBaseline, setShowBaseline] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [mode, setMode] = useState<"schedule" | "budget">("schedule");

  const allComputed = useMemo<ComputedTask[]>(
    () => (project ? getComputedTasks(project) : []),
    [project],
  );
  const cal = useMemo(() => (project ? projectCal(project) : null), [project]);

  const parentById = useMemo(
    () => new Map(allComputed.map((task) => [task.id, task.parentId])),
    [allComputed],
  );

  // Ctrl/Cmd+Z undoes the last change when not typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      e.preventDefault();
      undo(projectId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [projectId, undo]);

  const hasBaseline = !!project?.schedule?.activeBaselineId;
  const baselineVisible = showBaseline && hasBaseline;

  // Filters keep the matching tasks plus their chapters.
  const filteredIds = useMemo(() => {
    if (filter === "all") return null;
    const keep = new Set<ID>();
    for (const c of allComputed) {
      if (c.isSummary) continue;
      const match =
        filter === "critical" ? c.critical : (c.totalFloat ?? 0) < 0 && !c.isFinished;
      if (!match) continue;
      keep.add(c.id);
      let p = c.parentId;
      while (p) {
        keep.add(p);
        p = parentById.get(p) ?? null;
      }
    }
    return keep;
  }, [filter, allComputed, parentById]);

  function isVisible(task: ComputedTask): boolean {
    if (filteredIds && !filteredIds.has(task.id)) return false;
    let p = task.parentId;
    while (p) {
      if (collapsedIds.has(p)) return false;
      p = parentById.get(p) ?? null;
    }
    return true;
  }

  const visibleRows = allComputed.filter(isVisible);

  function toggleCollapse(id: ID) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportJson() {
    if (!project) return;
    downloadBlob(
      new Blob([serializeProjectFile(project)], { type: "application/json" }),
      `${safeFileName(project.name)}.json`,
    );
  }

  function scrollToToday() {
    document
      .getElementById("gantt-today-marker")
      ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  function addItem() {
    if (!project) return;
    const sel = allComputed.find((c) => c.id === selectedId);
    if (!sel) {
      alert(t("selectChapterFirst"));
      return;
    }
    const id = sel.isSummary
      ? addSubtask(projectId, sel.id, t("newItemName"))
      : addTask(projectId, sel.id, t("newItemName"));
    setSelectedId(id);
  }

  if (!project || !cal) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-neutral-500">
        <p>{t("projectNotFound")}</p>
        <Link href="/" className="text-green-600 hover:underline">
          {t("backToProjects")}
        </Link>
      </div>
    );
  }

  const selectedTask = allComputed.find((task) => task.id === selectedId) ?? null;
  const statusDate = project.schedule?.statusDate;
  const openDetails = (id: ID) => {
    setModalTaskId(id);
    setModal("details");
  };
  const openTaskResources = (id: ID) => {
    setModalTaskId(id);
    setModal("taskResources");
  };
  const closeModal = () => setModal(null);
  const closeView = () => setView(null);

  return (
    <div className="flex h-screen flex-col bg-white print:h-auto">
      <header className="flex items-center gap-3 bg-green-600 px-4 py-3 shadow-sm print:hidden">
        <Link href="/" className="text-sm text-green-100 hover:text-white">
          {t("backToProjects")}
        </Link>
        <input
          value={project.name}
          onChange={(e) => renameProject(projectId, e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-white outline-none placeholder:text-green-100"
        />
        {statusDate && (
          <span className="hidden text-xs text-green-100 md:inline" title={t("statusDate")}>
            {t("statusDate")}: {formatDate(statusDate, lang)}
          </span>
        )}
        {fileHandle && (
          <span className="flex items-center gap-1 text-xs text-green-100" title={t("linkedToFile")}>
            <FolderIcon className="h-3.5 w-3.5" />
            {fileStatus === "saving"
              ? t("fileSaving")
              : fileStatus === "error"
                ? t("fileErrorStatus")
                : t("fileSaved")}
          </span>
        )}
        <div className="flex items-center gap-0.5 rounded-md border border-white/30 p-0.5">
          {(["schedule", "budget"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded px-2.5 py-1 text-xs font-semibold ${
                mode === m ? "bg-white text-green-700" : "text-green-100 hover:bg-white/10"
              }`}
            >
              {t(m === "schedule" ? "modeSchedule" : "modeBudget")}
            </button>
          ))}
        </div>
        <LanguageSwitcher variant="dark" />
        <ThemeToggle variant="dark" />
        <button
          onClick={() => setModal("settings")}
          className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50"
        >
          {t("schedulingTab")}
        </button>
        <button
          onClick={() => setModal("resources")}
          className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
        >
          {t("resourcesButton", { count: project.resources.length })}
        </button>
        <button
          onClick={() => setModal("exchange-import")}
          className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
        >
          {t("importGantt")}
        </button>
        <button
          onClick={() => setModal("exchange-export")}
          className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
        >
          {t("exportGantt")}
        </button>
        <button
          onClick={exportJson}
          title={t("exportJsonHint")}
          className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
        >
          JSON
        </button>
      </header>

      {/* Row 1: structure */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-200 px-4 py-1.5 print:hidden">
        <ToolbarButton
          onClick={() =>
            setSelectedId(
              addChapter(projectId, selectedId, { chapter: t("newChapterName"), item: t("newItemName") }),
            )
          }
        >
          {t("addChapter")}
        </ToolbarButton>
        <ToolbarButton onClick={addItem} title={t("addItemHint")}>
          {t("addItem")}
        </ToolbarButton>
        <ToolbarButton
          disabled={!selectedId}
          onClick={() => selectedId && setSelectedId(addSubtask(projectId, selectedId, t("newItemName")))}
          title={t("addSubtaskHint")}
        >
          {t("addSubtask")}
        </ToolbarButton>
        <ToolbarButton onClick={() => setSelectedId(addMilestone(projectId, selectedId, t("newMilestoneName")))}>
          {t("addMilestone")}
        </ToolbarButton>
        <Sep />
        <ToolbarButton disabled={!selectedId} onClick={() => selectedId && indent(projectId, selectedId)} title={t("indent")}>
          →
        </ToolbarButton>
        <ToolbarButton disabled={!selectedId} onClick={() => selectedId && outdent(projectId, selectedId)} title={t("outdent")}>
          ←
        </ToolbarButton>
        <ToolbarButton disabled={!selectedId} onClick={() => selectedId && move(projectId, selectedId, "up")} title={t("moveUp")}>
          ↑
        </ToolbarButton>
        <ToolbarButton disabled={!selectedId} onClick={() => selectedId && move(projectId, selectedId, "down")} title={t("moveDown")}>
          ↓
        </ToolbarButton>
        <ToolbarButton disabled={!selectedId} onClick={() => selectedId && openDetails(selectedId)}>
          {t("taskForm")}
        </ToolbarButton>
        <ToolbarButton
          disabled={!selectedId}
          onClick={() => {
            if (
              selectedId &&
              confirm(
                t("deleteTaskConfirm", {
                  name: selectedTask?.name ?? "",
                  andSubtasks: selectedTask?.isSummary ? t("andItsSubtasks") : "",
                }),
              )
            ) {
              deleteTask(projectId, selectedId);
              setSelectedId(null);
            }
          }}
        >
          {t("delete")}
        </ToolbarButton>
        <Sep />
        <ToolbarButton disabled={undoDepth === 0} onClick={() => undo(projectId)} title="Ctrl+Z">
          ↶ {t("undo")}
        </ToolbarButton>
        <ToolbarButton onClick={() => setCollapsedIds(new Set())}>{t("expandAll")}</ToolbarButton>
        <ToolbarButton
          onClick={() => setCollapsedIds(new Set(allComputed.filter((c) => c.isSummary).map((c) => c.id)))}
        >
          {t("collapseAll")}
        </ToolbarButton>
        <Sep />
        <ToolbarButton onClick={() => setModal("calendar")}>{t("calendarButton")}</ToolbarButton>
        <ToolbarButton onClick={() => setModal("checks")}>{t("checksButton")}</ToolbarButton>
      </div>

      {/* Row 2: scheduling */}
      <div className={`${mode === "budget" ? "hidden" : "flex"} flex-wrap items-center gap-1.5 border-b border-neutral-200 px-4 py-1.5 print:hidden`}>
        <ToolbarButton onClick={() => setModal("adjust")} title={t("adjustHint")}>
          {t("adjust")}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => {
            if (confirm(t("scheduleConfirm"))) scheduleNow(projectId);
          }}
          title={t("scheduleHint")}
        >
          {t("scheduleButton")}
        </ToolbarButton>
        <Sep />
        <ToolbarButton active={showCritical} onClick={() => setShowCritical((v) => !v)} title={t("criticalPathHint")}>
          {t("criticalPath")}
        </ToolbarButton>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className={`rounded-md border px-2 py-1.5 text-xs font-medium outline-none ${
            filter === "all" ? "border-neutral-200 text-neutral-700" : "border-red-500 bg-red-50 text-red-700"
          }`}
          title={t("filterHint")}
        >
          <option value="all">{t("filterAll")}</option>
          <option value="critical">{t("onlyCritical")}</option>
          <option value="negative">{t("negativeFloat")}</option>
        </select>
        <ToolbarButton
          disabled={!hasBaseline}
          onClick={() => setShowBaseline((v) => !v)}
          title={hasBaseline ? t("baselineToggleHint") : t("noBaselineYet")}
        >
          <span className={baselineVisible ? "text-green-700" : ""}>
            {baselineVisible ? "✓ " : ""}
            {t("baselineToggle")}
          </span>
        </ToolbarButton>
        <ToolbarButton onClick={scrollToToday}>{t("today")}</ToolbarButton>
        <Sep />
        <ToolbarButton
          onClick={() =>
            exportGanttExcel(project, zoom, lang, {
              collapsedIds,
              onlyCritical: filter === "critical",
            })
          }
        >
          Excel
        </ToolbarButton>
        <ToolbarButton onClick={() => window.print()}>PDF</ToolbarButton>
        <Sep />
        <ToolbarButton onClick={() => setView("scurve")}>{t("sCurve")}</ToolbarButton>
        <ToolbarButton onClick={() => setView("histogram")}>{t("resourcesView")}</ToolbarButton>
        <ToolbarButton onClick={() => setView("network")}>{t("networkView")}</ToolbarButton>
        <ToolbarButton onClick={() => setView("variance")}>{t("varianceView")}</ToolbarButton>
        <ToolbarButton onClick={() => setView("ganttReport")}>{t("reportsButton")}</ToolbarButton>

        <div className="ml-auto flex items-center gap-1 rounded-md border border-neutral-200 p-0.5">
          {(["day", "week", "month"] as Zoom[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                zoom === z ? "bg-green-600 text-white" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {t(z)}
            </button>
          ))}
        </div>
      </div>

      {linkError && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-1.5 text-xs text-red-700 print:hidden">
          <span className="flex-1">{linkError}</span>
          <button onClick={() => setLinkError(null)} className="rounded px-1 hover:bg-red-100" aria-label="Close">
            ✕
          </button>
        </div>
      )}

      {/* Print header (PDF) */}
      <div className="hidden px-2 pb-2 print:block">
        <h1 className="text-base font-semibold">{project.name}</h1>
        <p className="text-[11px] text-neutral-500">
          {statusDate ? `${t("statusDate")}: ${formatDate(statusDate, lang)} · ` : ""}
          {new Date().toLocaleDateString(lang === "es" ? "es-ES" : "en-GB")}
        </p>
      </div>

      {allComputed.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-neutral-400">
          <p>{t("noTasksYet")}</p>
          <div className="flex gap-2">
            <ToolbarButton
              onClick={() =>
                setSelectedId(addChapter(projectId, null, { chapter: t("newChapterName"), item: t("newItemName") }))
              }
            >
              {t("addChapter")}
            </ToolbarButton>
            <ToolbarButton onClick={() => setSelectedId(addTask(projectId, null, t("newItemName")))}>
              {t("addFirstTask")}
            </ToolbarButton>
          </div>
        </div>
      ) : mode === "budget" ? (
        <BudgetView
          projectId={projectId}
          project={project}
          allComputed={allComputed}
          selectedId={selectedId}
          onSelect={setSelectedId}
          collapsedIds={collapsedIds}
          onToggleCollapse={toggleCollapse}
          onOpenResources={openTaskResources}
          onOpenReports={() => setView("budgetReports")}
        />
      ) : (
        <div className="gantt-scroll flex flex-1 overflow-auto print:overflow-visible">
          <TaskTable
            projectId={projectId}
            project={project}
            rows={visibleRows}
            allComputed={allComputed}
            selectedId={selectedId}
            onSelect={setSelectedId}
            collapsedIds={collapsedIds}
            onToggleCollapse={toggleCollapse}
            showCritical={showCritical}
            onOpenDetails={openDetails}
            onOpenResources={openTaskResources}
            onLinkError={setLinkError}
          />
          <GanttChart
            projectId={projectId}
            project={project}
            rows={visibleRows}
            zoom={zoom}
            selectedId={selectedId}
            onSelect={setSelectedId}
            showCritical={showCritical}
            showBaseline={baselineVisible}
            cal={cal}
          />
        </div>
      )}

      {modal === "resources" && (
        <ResourcePanel projectId={projectId} project={project} onClose={closeModal} />
      )}
      {modal === "adjust" && <AdjustScheduleModal projectId={projectId} onClose={closeModal} />}
      {modal === "settings" && (
        <SchedulingPanel
          projectId={projectId}
          project={project}
          onClose={closeModal}
          onOpenCalendar={() => setModal("calendar")}
          onOpenView={(v) => {
            setModal(null);
            setView(v);
          }}
          onOpenChecks={() => setModal("checks")}
        />
      )}
      {modal === "calendar" && <CalendarModal projectId={projectId} project={project} onClose={closeModal} />}
      {modal === "details" && modalTaskId && (
        <TaskDetailsModal
          projectId={projectId}
          project={project}
          taskId={modalTaskId}
          allComputed={allComputed}
          onClose={closeModal}
          onOpenResources={() => setModal("taskResources")}
        />
      )}
      {modal === "taskResources" && modalTaskId && (
        <TaskResourcesModal projectId={projectId} project={project} taskId={modalTaskId} onClose={closeModal} />
      )}
      {(modal === "exchange-import" || modal === "exchange-export") && (
        <ExchangeModal
          projectId={projectId}
          project={project}
          initialMode={modal === "exchange-import" ? "import" : "export"}
          onClose={closeModal}
        />
      )}
      {modal === "checks" && <ScheduleChecks project={project} onClose={closeModal} />}

      {view === "network" && <NetworkDiagram project={project} onClose={closeView} />}
      {view === "histogram" && <ResourceHistogram projectId={projectId} project={project} onClose={closeView} />}
      {view === "scurve" && <SCurve projectId={projectId} project={project} onClose={closeView} />}
      {view === "variance" && <VarianceTable projectId={projectId} project={project} onClose={closeView} />}
      {view === "report" && <TrackingReport project={project} onClose={closeView} />}
      {view === "budgetReports" && <BudgetReports project={project} onClose={closeView} />}
      {view === "ganttReport" && <BudgetReports project={project} onClose={closeView} initial="gantt" />}
    </div>
  );
}
