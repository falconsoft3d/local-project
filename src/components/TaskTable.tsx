"use client";

import type { ComputedTask, ID, Project } from "@/lib/types";
import {
  COLUMNS,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  TABLE_WIDTH,
} from "@/lib/constants";
import { useStore } from "@/lib/store";
import { snapToBusinessDay } from "@/lib/schedule";
import { useT } from "@/lib/useT";
import { SWATCH_PALETTE } from "@/lib/colors";
import Popover from "./Popover";

function ResourceChip({ color, name }: { color: string; name: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      title={name}
      className="inline-flex h-5 items-center rounded-full px-1.5 text-[10px] font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
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
}: {
  projectId: ID;
  project: Project;
  rows: ComputedTask[];
  allComputed: ComputedTask[];
  selectedId: ID | null;
  onSelect: (id: ID) => void;
  collapsedIds: Set<ID>;
  onToggleCollapse: (id: ID) => void;
}) {
  const updateTask = useStore((s) => s.updateTask);
  const tr = useT();
  const wbsById = new Map(allComputed.map((task) => [task.id, task.wbs]));

  return (
    <div
      style={{ width: TABLE_WIDTH }}
      className="sticky left-0 z-10 shrink-0 select-none bg-white"
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
        return (
          <div
            key={t.id}
            onClick={() => onSelect(t.id)}
            onFocus={() => onSelect(t.id)}
            style={{ height: ROW_HEIGHT }}
            className={`flex border-b text-[12px] ${
              isSelected ? "bg-green-50" : "bg-white hover:bg-neutral-50"
            } border-neutral-100`}
          >
            <div
              style={{ width: COLUMNS[0].width }}
              className="flex items-center border-r border-neutral-100 px-2 text-neutral-400"
            >
              {t.wbs}
            </div>

            <div
              style={{ width: COLUMNS[1].width, paddingLeft: 8 + t.depth * 14 }}
              className="flex items-center gap-1 border-r border-neutral-100 pr-1"
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
                    <div className="flex flex-wrap gap-1 p-1" style={{ maxWidth: 140 }}>
                      <button
                        onClick={() => {
                          updateTask(projectId, t.id, { color: undefined });
                          close();
                        }}
                        title={tr("defaultColor")}
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-neutral-300 text-[10px] text-neutral-400"
                      >
                        ×
                      </button>
                      {SWATCH_PALETTE.map((c) => (
                        <button
                          key={c}
                          onClick={() => {
                            updateTask(projectId, t.id, { color: c });
                            close();
                          }}
                          style={{ backgroundColor: c }}
                          className={`h-5 w-5 rounded-full ${
                            t.color === c
                              ? "ring-2 ring-offset-1 ring-neutral-400"
                              : ""
                          }`}
                          aria-label={`Set color ${c}`}
                        />
                      ))}
                    </div>
                  )}
                </Popover>
              )}
              {t.isMilestone && (
                <span className="shrink-0 text-neutral-500">◆</span>
              )}
              <input
                value={t.name}
                onChange={(e) =>
                  updateTask(projectId, t.id, { name: e.target.value })
                }
                onClick={(e) => e.stopPropagation()}
                className={`w-full truncate bg-transparent outline-none ${
                  t.isSummary ? "font-semibold" : ""
                }`}
              />
            </div>

            <div
              style={{ width: COLUMNS[2].width }}
              className="flex items-center border-r border-neutral-100 px-2"
            >
              {leaf ? (
                <input
                  type="number"
                  min={0}
                  value={t.duration}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    updateTask(projectId, t.id, {
                      duration: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full bg-transparent outline-none"
                />
              ) : (
                <span className="text-neutral-400">{t.computedDuration}d</span>
              )}
            </div>

            <div
              style={{ width: COLUMNS[3].width }}
              className="flex items-center border-r border-neutral-100 px-2"
            >
              {leaf ? (
                <input
                  type="date"
                  value={t.start}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    e.target.value &&
                    updateTask(projectId, t.id, {
                      start: snapToBusinessDay(e.target.value),
                    })
                  }
                  className="w-full bg-transparent text-[11px] outline-none"
                />
              ) : (
                <span className="text-[11px] text-neutral-400">
                  {t.computedStart}
                </span>
              )}
            </div>

            <div
              style={{ width: COLUMNS[4].width }}
              className="flex items-center border-r border-neutral-100 px-2"
            >
              {leaf && t.isMilestone ? (
                <input
                  type="date"
                  value={t.computedEnd}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    e.target.value &&
                    updateTask(projectId, t.id, {
                      start: snapToBusinessDay(e.target.value),
                    })
                  }
                  className="w-full bg-transparent text-[11px] outline-none"
                />
              ) : leaf ? (
                <input
                  type="date"
                  value={t.computedEnd}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const days =
                      Math.max(
                        0,
                        Math.round(
                          (new Date(e.target.value).getTime() -
                            new Date(t.start).getTime()) /
                            86400000,
                        ),
                      ) + 1;
                    updateTask(projectId, t.id, {
                      duration: Math.max(1, days),
                    });
                  }}
                  className="w-full bg-transparent text-[11px] outline-none"
                />
              ) : (
                <span className="text-[11px] text-neutral-400">
                  {t.computedEnd}
                </span>
              )}
            </div>

            <div
              style={{ width: COLUMNS[5].width }}
              className="flex items-center border-r border-neutral-100 px-1"
            >
              {leaf && (
                <Popover
                  trigger={(toggle) => (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle();
                      }}
                      className="w-full truncate rounded px-1 text-left text-[11px] text-neutral-500 hover:bg-neutral-100"
                    >
                      {t.predecessorIds
                        .map((id) => wbsById.get(id))
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </button>
                  )}
                >
                  {() => (
                    <div className="flex max-h-56 flex-col gap-0.5 overflow-auto text-[12px]">
                      {allComputed
                        .filter((o) => o.id !== t.id && !o.isSummary)
                        .map((o) => (
                          <label
                            key={o.id}
                            className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-neutral-100"
                          >
                            <input
                              type="checkbox"
                              checked={t.predecessorIds.includes(o.id)}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...t.predecessorIds, o.id]
                                  : t.predecessorIds.filter(
                                      (id) => id !== o.id,
                                    );
                                updateTask(projectId, t.id, {
                                  predecessorIds: next,
                                });
                              }}
                            />
                            <span className="text-neutral-400">{o.wbs}</span>
                            <span className="truncate">{o.name}</span>
                          </label>
                        ))}
                    </div>
                  )}
                </Popover>
              )}
            </div>

            <div
              style={{ width: COLUMNS[6].width }}
              className="flex items-center gap-1 overflow-hidden border-r border-neutral-100 px-1"
            >
              {leaf && (
                <Popover
                  trigger={(toggle) => (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle();
                      }}
                      className="flex w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 hover:bg-neutral-100"
                    >
                      {t.resourceIds.length === 0 && (
                        <span className="text-[11px] text-neutral-400">—</span>
                      )}
                      {t.resourceIds.slice(0, 3).map((id) => {
                        const r = project.resources.find((r) => r.id === id);
                        return r ? (
                          <ResourceChip
                            key={id}
                            color={r.color}
                            name={r.name}
                          />
                        ) : null;
                      })}
                      {t.resourceIds.length > 3 && (
                        <span className="text-[10px] text-neutral-400">
                          +{t.resourceIds.length - 3}
                        </span>
                      )}
                    </button>
                  )}
                >
                  {() => (
                    <div className="flex max-h-56 flex-col gap-0.5 overflow-auto text-[12px]">
                      {project.resources.length === 0 && (
                        <p className="px-1 py-1 text-neutral-400">
                          {tr("noResourcesYet")}
                        </p>
                      )}
                      {project.resources.map((r) => (
                        <label
                          key={r.id}
                          className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-neutral-100"
                        >
                          <input
                            type="checkbox"
                            checked={t.resourceIds.includes(r.id)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...t.resourceIds, r.id]
                                : t.resourceIds.filter((id) => id !== r.id);
                              updateTask(projectId, t.id, {
                                resourceIds: next,
                              });
                            }}
                          />
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: r.color }}
                          />
                          <span className="truncate">{r.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </Popover>
              )}
            </div>

            <div
              style={{ width: COLUMNS[7].width }}
              className="flex items-center px-2"
            >
              {leaf ? (
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={t.progress}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    updateTask(projectId, t.id, {
                      progress: Math.min(
                        100,
                        Math.max(0, Number(e.target.value) || 0),
                      ),
                    })
                  }
                  className="w-full bg-transparent outline-none"
                />
              ) : (
                <span className="text-neutral-400">{t.computedProgress}%</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
