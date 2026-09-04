"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { getComputedTasks } from "@/lib/schedule";
import { useT } from "@/lib/useT";
import { serializeProjectFile } from "@/lib/projectFile";
import type { ComputedTask, ID, Zoom } from "@/lib/types";
import TaskTable from "./TaskTable";
import GanttChart from "./GanttChart";
import ResourcePanel from "./ResourcePanel";
import LanguageSwitcher from "./LanguageSwitcher";
import AdjustScheduleModal from "./AdjustScheduleModal";
import { FolderIcon } from "./icons";

function ToolbarButton({
  onClick,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export default function ProjectView({ projectId }: { projectId: ID }) {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const addTask = useStore((s) => s.addTask);
  const addSubtask = useStore((s) => s.addSubtask);
  const addMilestone = useStore((s) => s.addMilestone);
  const deleteTask = useStore((s) => s.deleteTask);
  const indent = useStore((s) => s.indent);
  const outdent = useStore((s) => s.outdent);
  const move = useStore((s) => s.move);
  const renameProject = useStore((s) => s.renameProject);
  const exportMsProjectXml = useStore((s) => s.exportMsProjectXml);
  const fileHandle = useStore((s) => s.fileHandles[projectId]);
  const fileStatus = useStore((s) => s.fileStatus[projectId]);
  const t = useT();

  const [selectedId, setSelectedId] = useState<ID | null>(null);
  const [zoom, setZoom] = useState<Zoom>("week");
  const [collapsedIds, setCollapsedIds] = useState<Set<ID>>(new Set());
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const allComputed = useMemo<ComputedTask[]>(
    () => (project ? getComputedTasks(project) : []),
    [project],
  );

  const parentById = useMemo(
    () => new Map(allComputed.map((task) => [task.id, task.parentId])),
    [allComputed],
  );

  function isVisible(task: ComputedTask): boolean {
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
    const blob = new Blob([serializeProjectFile(project)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9-_]+/gi, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportXml() {
    if (!project) return;
    const xml = exportMsProjectXml(project.id);
    if (!xml) {
      alert(t("exportMsProjectXmlFailed"));
      return;
    }
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9-_]+/gi, "_")}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!project) {
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

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex items-center gap-3 bg-green-600 px-4 py-3 shadow-sm">
        <Link
          href="/"
          className="text-sm text-green-100 hover:text-white"
        >
          {t("backToProjects")}
        </Link>
        <input
          value={project.name}
          onChange={(e) => renameProject(projectId, e.target.value)}
          className="flex-1 bg-transparent text-lg font-semibold text-white outline-none placeholder:text-green-100"
        />
        {fileHandle && (
          <span
            className="flex items-center gap-1 text-xs text-green-100"
            title={t("linkedToFile")}
          >
            <FolderIcon className="h-3.5 w-3.5" />
            {fileStatus === "saving"
              ? t("fileSaving")
              : fileStatus === "error"
                ? t("fileErrorStatus")
                : t("fileSaved")}
          </span>
        )}
        <LanguageSwitcher variant="dark" />
        <button
          onClick={() => setResourcesOpen(true)}
          className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
        >
          {t("resourcesButton", { count: project.resources.length })}
        </button>
        <button
          onClick={exportJson}
          className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
        >
          {t("export")}
        </button>
        {project.source?.format === "msproject-xml" && (
          <button
            onClick={exportXml}
            title="Export back to the original MS Project XML format"
            className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
          >
            {t("exportMsProjectXml")}
          </button>
        )}
      </header>

      <div className="flex items-center gap-1.5 border-b border-neutral-200 px-4 py-2">
        <ToolbarButton
          onClick={() => setSelectedId(addTask(projectId, selectedId))}
        >
          {t("addTask")}
        </ToolbarButton>
        <ToolbarButton
          disabled={!selectedId}
          onClick={() =>
            selectedId && setSelectedId(addSubtask(projectId, selectedId))
          }
        >
          {t("addSubtask")}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => setSelectedId(addMilestone(projectId, selectedId))}
        >
          {t("addMilestone")}
        </ToolbarButton>
        <div className="mx-1 h-5 w-px bg-neutral-200" />
        <ToolbarButton
          disabled={!selectedId}
          onClick={() => selectedId && indent(projectId, selectedId)}
          title={t("indent")}
        >
          →
        </ToolbarButton>
        <ToolbarButton
          disabled={!selectedId}
          onClick={() => selectedId && outdent(projectId, selectedId)}
          title={t("outdent")}
        >
          ←
        </ToolbarButton>
        <ToolbarButton
          disabled={!selectedId}
          onClick={() => selectedId && move(projectId, selectedId, "up")}
          title={t("moveUp")}
        >
          ↑
        </ToolbarButton>
        <ToolbarButton
          disabled={!selectedId}
          onClick={() => selectedId && move(projectId, selectedId, "down")}
          title={t("moveDown")}
        >
          ↓
        </ToolbarButton>
        <div className="mx-1 h-5 w-px bg-neutral-200" />
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
        <div className="mx-1 h-5 w-px bg-neutral-200" />
        <ToolbarButton onClick={() => setAdjustOpen(true)}>
          {t("adjust")}
        </ToolbarButton>

        <div className="ml-auto flex items-center gap-1 rounded-md border border-neutral-200 p-0.5">
          {(["day", "week", "month"] as Zoom[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                zoom === z
                  ? "bg-green-600 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {t(z)}
            </button>
          ))}
        </div>
      </div>

      {allComputed.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-neutral-400">
          <p>{t("noTasksYet")}</p>
          <ToolbarButton
            onClick={() => setSelectedId(addTask(projectId, null))}
          >
            {t("addFirstTask")}
          </ToolbarButton>
        </div>
      ) : (
        <div className="flex flex-1 overflow-auto">
          <TaskTable
            projectId={projectId}
            project={project}
            rows={visibleRows}
            allComputed={allComputed}
            selectedId={selectedId}
            onSelect={setSelectedId}
            collapsedIds={collapsedIds}
            onToggleCollapse={toggleCollapse}
          />
          <GanttChart
            projectId={projectId}
            rows={visibleRows}
            zoom={zoom}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      )}

      {resourcesOpen && (
        <ResourcePanel
          projectId={projectId}
          project={project}
          onClose={() => setResourcesOpen(false)}
        />
      )}

      {adjustOpen && (
        <AdjustScheduleModal
          projectId={projectId}
          onClose={() => setAdjustOpen(false)}
        />
      )}
    </div>
  );
}
