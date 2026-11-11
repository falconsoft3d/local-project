"use client";

import { useMemo, useState } from "react";
import type { ComputedTask, ID, Project } from "@/lib/types";
import {
  COLUMNS,
  HEADER_HEIGHT,
  RESOURCE_KIND_COLORS,
  ROW_HEIGHT,
  TABLE_WIDTH,
} from "@/lib/constants";
import { useStore } from "@/lib/store";
import { useLanguage, useT } from "@/lib/useT";
import { SWATCH_PALETTE } from "@/lib/colors";
import { cycleBlockedIds, formatLinks, parseLinks } from "@/lib/links";
import { formatDate } from "@/lib/format";
import Popover from "./Popover";

function ResourceChip({ color, name }: { color: string; name: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      title={name}
      className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 fill-neutral-400" aria-hidden>
      <path d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4Zm2 0h4V5a2 2 0 1 0-4 0v2Z" />
    </svg>
  );
}

/** Cell editor for the predecessors column: free text with code syntax ("02.02FC+7dt"),
 * validated on Enter/blur, plus a picker with search where cycle-creating tasks are
 * disabled. */
function PredecessorCell({
  projectId,
  project,
  task,
  allComputed,
  codeById,
  onError,
}: {
  projectId: ID;
  project: Project;
  task: ComputedTask;
  allComputed: ComputedTask[];
  codeById: Map<ID, string>;
  onError: (msg: string | null) => void;
}) {
  const updateTask = useStore((s) => s.updateTask);
  const tr = useT();
  const lang = useLanguage();
  const formatted = formatLinks(task.predecessors, codeById, lang);
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [query, setQuery] = useState("");

  function commit() {
    if (draft === null) return;
    const value = draft;
    setDraft(null);
    if (value.trim() === formatted.trim()) return;
    const codeIndex = new Map<string, ID>();
    for (const c of allComputed) {
      codeIndex.set(c.displayCode, c.id);
      codeIndex.set(c.wbs, c.id);
      if (c.code) codeIndex.set(c.code.trim(), c.id);
    }
    const summaryIds = new Set(allComputed.filter((c) => c.isSummary).map((c) => c.id));
    const { links, errors } = parseLinks(value, task.id, codeIndex, summaryIds, project.tasks);
    // Keep links to chapters that were set from the task form (not typeable here).
    const chapterLinks = task.predecessors.filter((l) => summaryIds.has(l.predecessorId));
    updateTask(projectId, task.id, { predecessors: [...links, ...chapterLinks] });
    if (errors.length) {
      setInvalid(true);
      onError(tr("predInvalid", { code: task.displayCode, tokens: errors.join(", ") }));
    } else {
      setInvalid(false);
      onError(null);
    }
  }

  return (
    <div className="flex w-full items-center">
      <input
        value={draft ?? formatted}
        placeholder="—"
        onClick={(e) => e.stopPropagation()}
        onFocus={() => setDraft(formatted)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
        title={tr("predHelp")}
        className={`w-full min-w-0 truncate rounded bg-transparent px-1 text-[11px] outline-none focus:bg-white focus:ring-1 focus:ring-green-500 ${
          invalid ? "text-red-600 ring-1 ring-red-400" : "text-neutral-600"
        }`}
      />
      <Popover
        trigger={(toggle) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setQuery("");
              toggle();
            }}
            className="shrink-0 rounded px-0.5 text-[10px] text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label={tr("choosePredecessors")}
          >
            ▾
          </button>
        )}
      >
        {() => (
          <PredecessorPicker
            projectId={projectId}
            project={project}
            task={task}
            allComputed={allComputed}
            query={query}
            setQuery={setQuery}
          />
        )}
      </Popover>
    </div>
  );
}

function PredecessorPicker({
  projectId,
  project,
  task,
  allComputed,
  query,
  setQuery,
}: {
  projectId: ID;
  project: Project;
  task: ComputedTask;
  allComputed: ComputedTask[];
  query: string;
  setQuery: (q: string) => void;
}) {
  const updateTask = useStore((s) => s.updateTask);
  const tr = useT();
  const blocked = useMemo(() => cycleBlockedIds(project.tasks, task.id), [project.tasks, task.id]);
  const q = query.trim().toLowerCase();
  const options = allComputed.filter(
    (o) =>
      o.id !== task.id &&
      !o.isSummary &&
      (!q || o.name.toLowerCase().includes(q) || o.displayCode.toLowerCase().includes(q)),
  );
  const selected = new Set(task.predecessors.map((l) => l.predecessorId));
  return (
    <div className="flex w-72 flex-col gap-1 text-[12px]">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tr("search")}
        className="mb-1 rounded border border-neutral-300 px-2 py-1 text-[12px] outline-none focus:border-green-500"
      />
      <div className="flex max-h-60 flex-col gap-0.5 overflow-auto">
        {options.map((o) => {
          const isSel = selected.has(o.id);
          const disabled = !isSel && blocked.has(o.id);
          return (
            <label
              key={o.id}
              title={disabled ? tr("wouldCreateCycle") : undefined}
              className={`flex items-center gap-2 rounded px-1 py-0.5 ${
                disabled ? "cursor-not-allowed opacity-40" : "hover:bg-neutral-100"
              }`}
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={isSel}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...task.predecessors, { predecessorId: o.id, type: "FS" as const, lag: 0, lagUnit: "wd" as const }]
                    : task.predecessors.filter((l) => l.predecessorId !== o.id);
                  updateTask(projectId, task.id, { predecessors: next });
                }}
              />
              <span className="w-12 shrink-0 text-neutral-400">{o.displayCode}</span>
              <span className="truncate">{o.name}</span>
            </label>
          );
        })}
        {options.length === 0 && <p className="px-1 py-2 text-neutral-400">—</p>}
      </div>
    </div>
  );
}

export default function TaskTable({
  projectId,
  project,
  rows,
  allComputed,
  selectedId,
  onSelect,
  collapsedIds,
  onToggleCollapse,
  showCritical,
  onOpenDetails,
  onOpenResources,
  onLinkError,
}: {
  projectId: ID;
  project: Project;
  rows: ComputedTask[];
  allComputed: ComputedTask[];
  selectedId: ID | null;
  onSelect: (id: ID) => void;
  collapsedIds: Set<ID>;
  onToggleCollapse: (id: ID) => void;
  showCritical: boolean;
  onOpenDetails: (id: ID) => void;
  onOpenResources: (id: ID) => void;
  onLinkError: (msg: string | null) => void;
}) {
  const updateTask = useStore((s) => s.updateTask);
  const setTaskStart = useStore((s) => s.setTaskStart);
  const setTaskFinish = useStore((s) => s.setTaskFinish);
  const setTaskDuration = useStore((s) => s.setTaskDuration);
  const tr = useT();
  const lang = useLanguage();
  const codeById = useMemo(
    () => new Map(allComputed.map((task) => [task.id, task.displayCode])),
    [allComputed],
  );
  const resourceById = useMemo(
    () => new Map(project.resources.map((r) => [r.id, r])),
    [project.resources],
  );
  const w = (key: (typeof COLUMNS)[number]["key"]) => COLUMNS.find((c) => c.key === key)!.width;
  const cell = "flex items-center border-r border-neutral-100";

  return (
    <div
      style={{ width: TABLE_WIDTH }}
      className="sticky left-0 z-10 shrink-0 select-none bg-white print:static"
    >
      <div
        style={{ height: HEADER_HEIGHT }}
        className="sticky top-0 z-30 flex border-b border-neutral-300 bg-neutral-100 text-[11px] font-semibold text-neutral-600"
      >
        {COLUMNS.map((c) => (
          <div
            key={c.key}
            style={{ width: c.width }}
            className="flex items-center border-r border-neutral-200 px-2"
          >
            {tr(c.labelKey)}
          </div>
        ))}
      </div>

      {rows.map((t) => {
        const isSelected = t.id === selectedId;
        const leaf = !t.isSummary;
        const critical = showCritical && leaf && t.critical;
        return (
          <div
            key={t.id}
            onClick={() => onSelect(t.id)}
            onDoubleClick={() => onOpenDetails(t.id)}
            onFocus={() => onSelect(t.id)}
            style={{ height: ROW_HEIGHT }}
            className={`group/row flex border-b text-[12px] ${
              isSelected ? "bg-green-50" : t.isSummary ? "bg-neutral-50/70 hover:bg-neutral-100/70" : "bg-white hover:bg-neutral-50"
            } border-neutral-100 ${t.isFinished ? "text-neutral-400" : ""}`}
          >
            <div style={{ width: w("code") }} className={`${cell} px-1`}>
              <input
                value={t.code ?? ""}
                placeholder={t.wbs}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => updateTask(projectId, t.id, { code: e.target.value || undefined }, { reschedule: false })}
                className={`w-full bg-transparent text-[11px] outline-none placeholder:text-neutral-400 ${
                  t.isSummary ? "font-semibold" : "text-neutral-500"
                }`}
              />
            </div>

            <div
              style={{ width: w("name"), paddingLeft: 6 + t.depth * 14 }}
              className={`${cell} gap-1 pr-1`}
            >
              {t.isSummary ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse(t.id);
                  }}
                  className="w-3 shrink-0 text-neutral-500"
                >
                  {collapsedIds.has(t.id) ? "▸" : "▾"}
                </button>
              ) : (
                <span className="w-3 shrink-0" />
              )}
              {leaf && (
                <Popover
                  trigger={(toggle) => (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle();
                      }}
                      title={tr("taskColor")}
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-neutral-300"
                      style={{ backgroundColor: t.color || "transparent" }}
                    />
                  )}
                >
                  {(close) => (
                    <div className="flex flex-col gap-1.5 p-1" style={{ maxWidth: 160 }}>
                      <div className="flex flex-wrap gap-1">
                        {SWATCH_PALETTE.map((c) => (
                          <button
                            key={c}
                            onClick={() => {
                              updateTask(projectId, t.id, { color: c }, { reschedule: false });
                              close();
                            }}
                            style={{ backgroundColor: c }}
                            className={`h-5 w-5 rounded-full ${
                              t.color === c ? "ring-2 ring-neutral-400 ring-offset-1" : ""
                            }`}
                            aria-label={`Set color ${c}`}
                          />
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          updateTask(projectId, t.id, { color: undefined }, { reschedule: false });
                          close();
                        }}
                        className="rounded border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-50"
                      >
                        {tr("defaultColor")}
                      </button>
                    </div>
                  )}
                </Popover>
              )}
              {t.isMilestone && <span className="shrink-0 text-neutral-500">◆</span>}
              <input
                value={t.name}
                onChange={(e) => updateTask(projectId, t.id, { name: e.target.value }, { reschedule: false })}
                onClick={(e) => e.stopPropagation()}
                className={`w-full min-w-0 truncate bg-transparent outline-none ${
                  t.isSummary ? "font-semibold" : ""
                } ${critical ? "text-red-600" : ""}`}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetails(t.id);
                }}
                title={tr("openTaskForm")}
                className="shrink-0 rounded px-1 text-[11px] text-neutral-400 opacity-0 hover:bg-neutral-200 hover:text-neutral-700 group-hover/row:opacity-100"
              >
                ⓘ
              </button>
            </div>

            <div style={{ width: w("duration") }} className={`${cell} gap-1 px-2`}>
              {leaf ? (
                t.durationLocked ? (
                  <span className="flex items-center gap-1" title={tr("durationLockedHint")}>
                    <LockIcon />
                    {t.computedDuration}
                  </span>
                ) : (
                  <>
                    <input
                      type="number"
                      min={0}
                      value={t.duration}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setTaskDuration(projectId, t.id, Math.max(0, Number(e.target.value) || 0))}
                      className={`w-full min-w-0 bg-transparent outline-none ${t.elapsed ? "italic" : ""}`}
                    />
                    {t.elapsed && <span className="text-[10px] italic text-neutral-500">dt</span>}
                  </>
                )
              ) : (
                <span className="text-neutral-400">{t.computedDuration}d</span>
              )}
            </div>

            <div style={{ width: w("start") }} className={`${cell} px-1.5`}>
              {leaf && !t.actualStart ? (
                <input
                  type="date"
                  value={t.computedStart}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => e.target.value && setTaskStart(projectId, t.id, e.target.value)}
                  className="w-full bg-transparent text-[11px] outline-none"
                />
              ) : (
                <span
                  className={`text-[11px] ${leaf ? "text-neutral-700" : "text-neutral-400"}`}
                  title={leaf ? tr("actualStartFixed") : undefined}
                >
                  {formatDate(t.computedStart, lang)}
                  {leaf && <span className="ml-1 text-green-600">●</span>}
                </span>
              )}
            </div>

            <div style={{ width: w("finish") }} className={`${cell} px-1.5`}>
              {leaf && !t.durationLocked ? (
                <input
                  type="date"
                  value={t.computedEnd}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => e.target.value && setTaskFinish(projectId, t.id, e.target.value)}
                  className="w-full bg-transparent text-[11px] outline-none"
                />
              ) : (
                <span className="text-[11px] text-neutral-400">{formatDate(t.computedEnd, lang)}</span>
              )}
            </div>

            <div style={{ width: w("predecessors") }} className={`${cell} px-1`}>
              {leaf && (
                <PredecessorCell
                  projectId={projectId}
                  project={project}
                  task={t}
                  allComputed={allComputed}
                  codeById={codeById}
                  onError={onLinkError}
                />
              )}
            </div>

            <div style={{ width: w("resources") }} className={`${cell} overflow-hidden px-1`}>
              {leaf && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenResources(t.id);
                  }}
                  className="flex w-full items-center gap-0.5 overflow-hidden rounded px-0.5 py-0.5 hover:bg-neutral-100"
                  title={tr("taskResourcesTitle")}
                >
                  {t.resourceIds.length === 0 && (
                    <span className="text-[11px] text-neutral-400">—</span>
                  )}
                  {t.resourceIds.slice(0, 3).map((id) => {
                    const r = resourceById.get(id);
                    return r ? (
                      <ResourceChip
                        key={id}
                        color={RESOURCE_KIND_COLORS[r.kind ?? "labor"]}
                        name={r.name}
                      />
                    ) : null;
                  })}
                  {t.resourceIds.length > 3 && (
                    <span className="text-[10px] text-neutral-400">+{t.resourceIds.length - 3}</span>
                  )}
                </button>
              )}
            </div>

            <div style={{ width: w("certified") }} className={`${cell} px-1.5`}>
              {leaf ? (
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={t.certified ?? 0}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    updateTask(
                      projectId,
                      t.id,
                      { certified: Math.min(100, Math.max(0, Number(e.target.value) || 0)) },
                      { reschedule: false },
                    )
                  }
                  className="w-full bg-transparent text-[11px] outline-none"
                />
              ) : (
                <span className="text-[11px] text-neutral-400">{t.computedCertified}%</span>
              )}
            </div>

            <div style={{ width: w("progress") }} className={`${cell} px-1.5`}>
              {leaf ? (
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={t.progress}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    updateTask(projectId, t.id, {
                      progress: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                    })
                  }
                  className="w-full bg-transparent text-[11px] outline-none"
                />
              ) : (
                <span className="text-[11px] text-neutral-400">{t.computedProgress}%</span>
              )}
            </div>

            <div style={{ width: w("float") }} className="flex items-center px-2">
              {t.totalFloat !== undefined && !t.isFinished && (
                <span
                  className={`text-[11px] ${
                    t.totalFloat < 0
                      ? "font-semibold text-red-600"
                      : leaf && t.critical
                        ? "font-medium text-red-500"
                        : "text-neutral-500"
                  }`}
                >
                  {t.totalFloat}d
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
