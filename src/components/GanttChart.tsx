"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays } from "date-fns";
import { es, enUS } from "date-fns/locale";
import type { ComputedTask, ID, Project, Zoom } from "@/lib/types";
import { HEADER_HEIGHT, ROW_HEIGHT } from "@/lib/constants";
import { useLanguage, useT } from "@/lib/useT";
import { useStore } from "@/lib/store";
import { DEFAULT_TASK_COLOR, hexToRgba } from "@/lib/colors";
import { fromISO, toISO } from "@/lib/schedule";
import { Cal, dayNum, isoOf } from "@/lib/calendar";
import {
  buildHeader,
  buildTimelineRange,
  isoToX,
  todayX,
  weekendBands,
} from "@/lib/timeline";

type DragMode = "move" | "resize";

interface DragInfo {
  taskId: ID;
  mode: DragMode;
  startClientX: number;
  originStart: string;
  originEnd: string;
}

const CRITICAL_COLOR = "#dc2626";

/** Darker shade of a hex colour (for the certified fill). */
function shade(hex: string, factor: number): string {
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export default function GanttChart({
  projectId,
  project,
  rows,
  zoom,
  selectedId,
  onSelect,
  showCritical,
  showBaseline,
  cal,
}: {
  projectId: ID;
  project: Project;
  rows: ComputedTask[];
  zoom: Zoom;
  selectedId: ID | null;
  onSelect: (id: ID) => void;
  showCritical: boolean;
  showBaseline: boolean;
  cal: Cal;
}) {
  const setTaskStart = useStore((s) => s.setTaskStart);
  const setTaskFinish = useStore((s) => s.setTaskFinish);
  const statusDate = project.schedule?.statusDate;

  let rawStart: string | null = null;
  let rawEnd: string | null = null;
  for (const t of rows) {
    const s = showBaseline && t.baselineStart && t.baselineStart < t.computedStart ? t.baselineStart : t.computedStart;
    const e = showBaseline && t.baselineFinish && t.baselineFinish > t.computedEnd ? t.baselineFinish : t.computedEnd;
    if (!rawStart || s < rawStart) rawStart = s;
    if (!rawEnd || e > rawEnd) rawEnd = e;
  }
  if (statusDate && rawStart && rawEnd) {
    if (statusDate < rawStart) rawStart = statusDate;
    if (statusDate > rawEnd) rawEnd = statusDate;
  }

  const language = useLanguage();
  const tr = useT();
  const dateLocale = language === "es" ? es : enUS;

  const now = new Date();
  const start = rawStart ? new Date(`${rawStart}T00:00:00`) : now;
  const end = rawEnd ? new Date(`${rawEnd}T00:00:00`) : now;
  const range = buildTimelineRange(start, end, zoom);
  const header = buildHeader(range, zoom, dateLocale, cal);
  // Weekends and holidays are shaded in Day and Week scale.
  const bands = zoom === "month" ? [] : weekendBands(range, cal);
  const bodyHeight = rows.length * ROW_HEIGHT;

  const dragRef = useRef<DragInfo | null>(null);
  const [dragTaskId, setDragTaskId] = useState<ID | null>(null);
  const [deltaPx, setDeltaPx] = useState(0);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);

  function beginDrag(e: React.PointerEvent, task: ComputedTask, mode: DragMode) {
    e.stopPropagation();
    e.preventDefault();
    onSelect(task.id);
    // Started tasks keep their actual start: they can't be dragged.
    if (mode === "move" && task.actualStart) return;
    if (mode === "resize" && (task.durationLocked || task.actualFinish)) return;
    dragRef.current = {
      taskId: task.id,
      mode,
      startClientX: e.clientX,
      originStart: task.computedStart,
      originEnd: task.computedEnd,
    };
    setDragTaskId(task.id);
    setDragMode(mode);
    setDeltaPx(0);
  }

  useEffect(() => {
    if (!dragTaskId || !dragMode) return;

    // Intentional global DOM side effect (drag cursor), scoped to this effect and cleaned up below.
    // eslint-disable-next-line react-hooks/immutability
    document.body.style.cursor = dragMode === "resize" ? "ew-resize" : "grabbing";
    // eslint-disable-next-line react-hooks/immutability
    document.body.style.userSelect = "none";

    function handleMove(e: PointerEvent) {
      if (!dragRef.current) return;
      setDeltaPx(e.clientX - dragRef.current.startClientX);
    }

    function handleUp(e: PointerEvent) {
      const d = dragRef.current;
      dragRef.current = null;
      setDragTaskId(null);
      setDragMode(null);
      setDeltaPx(0);
      if (!d) return;
      const deltaCalendarDays = Math.round((e.clientX - d.startClientX) / range.pxPerDay);
      if (deltaCalendarDays === 0) return;
      if (d.mode === "move") {
        setTaskStart(projectId, d.taskId, toISO(addDays(fromISO(d.originStart), deltaCalendarDays)));
      } else {
        const newEnd = toISO(addDays(fromISO(d.originEnd), deltaCalendarDays));
        if (newEnd >= d.originStart) setTaskFinish(projectId, d.taskId, newEnd);
      }
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragTaskId, dragMode, range.pxPerDay, projectId]);

  const indexById = useMemo(() => new Map(rows.map((t, i) => [t.id, i])), [rows]);

  const xStart = (iso: string) => isoToX(range, iso);
  const xEnd = (iso: string) => isoToX(range, iso) + range.pxPerDay;

  // Connectors follow the link type: FS end→start, SS start→start, FF end→end, SF start→end.
  const connectors: { d: string; key: string; critical: boolean }[] = [];
  rows.forEach((t) => {
    if (t.isSummary) return;
    const succIdx = indexById.get(t.id);
    if (succIdx === undefined) return;
    t.predecessors.forEach((l) => {
      const predIdx = indexById.get(l.predecessorId);
      if (predIdx === undefined) return;
      const pred = rows[predIdx];
      const fromEnd = l.type === "FS" || l.type === "FF";
      const toEnd = l.type === "FF" || l.type === "SF";
      const px = pred.isMilestone
        ? xStart(pred.computedStart) + range.pxPerDay / 2
        : fromEnd
          ? xEnd(pred.computedEnd)
          : xStart(pred.computedStart);
      const sx = t.isMilestone
        ? xStart(t.computedStart) + range.pxPerDay / 2 - 6
        : toEnd
          ? xEnd(t.computedEnd)
          : xStart(t.computedStart);
      const py = predIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      const sy = succIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      const out = fromEnd ? px + 6 : px - 6;
      const into = toEnd ? sx + 6 : sx - 6;
      const d =
        !toEnd && into >= out
          ? `M ${px} ${py} H ${out} V ${sy} H ${sx}`
          : `M ${px} ${py} H ${out} V ${sy + (sy > py ? -ROW_HEIGHT / 2 + 2 : ROW_HEIGHT / 2 - 2)} H ${into} V ${sy} H ${sx}`;
      connectors.push({
        key: `${l.predecessorId}->${t.id}`,
        d,
        critical: showCritical && pred.critical && t.critical,
      });
    });
  });

  const statusX = statusDate ? xEnd(statusDate) : null;

  return (
    <div style={{ width: range.totalWidth }} className="relative shrink-0">
      <div
        style={{ height: HEADER_HEIGHT }}
        className="sticky top-0 z-20 border-b border-neutral-300 bg-neutral-100"
      >
        <div className="relative h-[22px]">
          {header.groups.map((g) => (
            <div
              key={g.key}
              style={{ left: g.left, width: g.width }}
              className="absolute top-0 flex h-full items-center overflow-hidden text-ellipsis whitespace-nowrap border-r border-neutral-200 pl-1.5 text-[11px] font-semibold text-neutral-600"
            >
              {g.label}
            </div>
          ))}
        </div>
        <div className="relative h-[22px] border-t border-neutral-200">
          {header.ticks.map((tk) => (
            <div
              key={tk.key}
              style={{ left: tk.left, width: tk.width }}
              className={`absolute top-0 flex h-full items-center justify-center overflow-hidden whitespace-nowrap border-r text-[10px] ${
                tk.isWeekend
                  ? "border-neutral-200 bg-neutral-200/60 text-neutral-400"
                  : "border-neutral-200 text-neutral-500"
              } ${tk.isToday ? "font-bold text-red-500" : ""}`}
            >
              {tk.label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: bodyHeight }} className="relative">
        {bands.map((b, i) => (
          <div
            key={i}
            style={{ left: b.left, width: b.width, height: bodyHeight }}
            className="absolute top-0 bg-neutral-100/70"
          />
        ))}

        {rows.map((t, i) => (
          <div
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT, width: range.totalWidth }}
            className={`absolute left-0 cursor-pointer border-b ${
              t.id === selectedId ? "bg-green-50/70" : "border-neutral-50"
            }`}
          />
        ))}

        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={range.totalWidth}
          height={bodyHeight}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill="#a3a3a3" />
            </marker>
            <marker id="arrow-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill={CRITICAL_COLOR} />
            </marker>
          </defs>
          {connectors.map((c) => (
            <path
              key={c.key}
              d={c.d}
              fill="none"
              stroke={c.critical ? CRITICAL_COLOR : "#a3a3a3"}
              strokeOpacity={c.critical ? 0.8 : 1}
              strokeWidth={1.3}
              markerEnd={c.critical ? "url(#arrow-crit)" : "url(#arrow)"}
            />
          ))}
        </svg>

        {/* Today (red) and status date (dashed blue) lines. */}
        <div
          id="gantt-today-marker"
          style={{ left: todayX(range), height: bodyHeight }}
          className="pointer-events-none absolute top-0 z-[5] w-px bg-red-500"
        />
        {statusX !== null && (
          <div
            style={{ left: statusX, height: bodyHeight }}
            title={`${tr("statusDate")} ${statusDate}`}
            className="pointer-events-none absolute top-0 z-[5] w-0 border-l-2 border-dashed border-blue-500"
          />
        )}

        {rows.map((t, i) => {
          const isDraggingThis = dragTaskId === t.id;
          const liveDelta = isDraggingThis ? deltaPx : 0;
          const activeDragMode = isDraggingThis ? dragMode : undefined;

          let x = xStart(t.computedStart);
          let width = Math.max(xEnd(t.computedEnd) - x, 4);
          const top = i * ROW_HEIGHT;

          if (isDraggingThis && activeDragMode === "move") x += liveDelta;
          if (isDraggingThis && activeDragMode === "resize") {
            width = Math.max(range.pxPerDay, width + liveDelta);
          }

          const baselineBar =
            showBaseline && t.baselineStart && t.baselineFinish ? (
              <div
                key={`${t.id}-bl`}
                style={{
                  top: top + ROW_HEIGHT - 9,
                  left: xStart(t.baselineStart),
                  width: Math.max(xEnd(t.baselineFinish) - xStart(t.baselineStart), 3),
                }}
                title={`${tr("baselineToggle")}: ${t.baselineStart} → ${t.baselineFinish}`}
                className="pointer-events-none absolute h-[4px] rounded-sm bg-neutral-400/80"
              />
            ) : null;

          if (t.isMilestone) {
            const color = showCritical && t.critical ? CRITICAL_COLOR : t.color || undefined;
            return (
              <div key={t.id}>
                {baselineBar}
                <div style={{ top, left: x, height: ROW_HEIGHT }} className="absolute flex items-center">
                  <div
                    onPointerDown={(e) => beginDrag(e, t, "move")}
                    style={{ marginLeft: range.pxPerDay / 2 - 6, backgroundColor: color }}
                    className={`h-3 w-3 rotate-45 ${t.actualStart ? "cursor-pointer" : "cursor-grab"} ${
                      color ? "" : "bg-neutral-800"
                    } ${t.id === selectedId ? "ring-2 ring-neutral-900" : ""}`}
                  />
                  <span className="ml-2 whitespace-nowrap text-[11px] text-neutral-600">
                    {t.name} {t.computedStart.slice(8, 10)}/{t.computedStart.slice(5, 7)}
                  </span>
                </div>
              </div>
            );
          }

          if (t.isSummary) {
            return (
              <div key={t.id}>
                {baselineBar}
                <div style={{ top, left: x, width, height: ROW_HEIGHT }} className="absolute flex items-center">
                  <div className="relative w-full">
                    <div className="h-[7px] w-full rounded-[1px] bg-neutral-800" />
                    <div className="absolute -top-[3px] left-0 h-[13px] w-[3px] bg-neutral-800" />
                    <div className="absolute -top-[3px] right-0 h-[13px] w-[3px] bg-neutral-800" />
                  </div>
                  <span className="absolute left-full ml-2 whitespace-nowrap text-[11px] font-medium text-neutral-600">
                    {t.computedCertified}%
                  </span>
                </div>
              </div>
            );
          }

          const critical = showCritical && t.critical;
          const base = critical ? CRITICAL_COLOR : t.color || DEFAULT_TASK_COLOR;
          const trackColor = hexToRgba(base, critical || t.color ? 0.45 : 0.75);
          const certColor = shade(base, critical ? 0.85 : 0.7);
          const physColor = shade(base, 0.35);

          // Interruptions: dotted gaps inside the bar.
          const gaps: { left: number; width: number }[] = [];
          for (const it of t.interruptions ?? []) {
            const a = dayNum(it.from);
            const b = it.to ? dayNum(it.to) : a;
            const s = dayNum(t.computedStart);
            const e = dayNum(t.computedEnd);
            const from = Math.max(a, s);
            const to = Math.min(b, e);
            if (to < from) continue;
            gaps.push({
              left: xStart(isoOf(from)) - x + (isDraggingThis && activeDragMode === "move" ? liveDelta : 0),
              width: (to - from + 1) * range.pxPerDay,
            });
          }

          return (
            <div key={t.id}>
              {baselineBar}
              <div
                style={{ top, left: x, width, height: ROW_HEIGHT }}
                className="group absolute flex items-center"
              >
                <div
                  onPointerDown={(e) => beginDrag(e, t, "move")}
                  style={{ backgroundColor: trackColor }}
                  title={`${t.displayCode} ${t.name}\n${t.computedStart} → ${t.computedEnd}`}
                  className={`relative -mt-1 h-[14px] w-full overflow-hidden rounded-sm ${
                    t.actualStart ? "cursor-pointer" : "cursor-grab"
                  } ${t.id === selectedId ? "ring-2 ring-neutral-900" : ""}`}
                >
                  {/* Certified % fill */}
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, t.certified ?? 0))}%`,
                      backgroundColor: certColor,
                    }}
                    className="h-full"
                  />
                  {/* Physical progress: dark strip at the base */}
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, t.progress))}%`,
                      backgroundColor: physColor,
                    }}
                    className="absolute bottom-0 left-0 h-[4px]"
                  />
                  {gaps.map((g, gi) => (
                    <div
                      key={gi}
                      style={{ left: g.left, width: g.width }}
                      className="absolute top-0 h-full border-x border-dotted border-neutral-500 bg-white"
                    >
                      <div className="mt-[6px] h-0 border-t-2 border-dotted border-neutral-400" />
                    </div>
                  ))}
                </div>
                {!t.durationLocked && !t.actualFinish && (
                  <div
                    onPointerDown={(e) => beginDrag(e, t, "resize")}
                    className="absolute right-0 top-0 h-full w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
                  >
                    <div className="mx-auto h-full w-0.5 bg-neutral-900/40" />
                  </div>
                )}
                <span className="absolute left-full ml-2 whitespace-nowrap text-[11px] text-neutral-600">
                  {t.name}
                  {t.deadline && t.deadline < t.computedEnd && (
                    <span className="ml-1 text-red-600" title={`${tr("deadline")} ${t.deadline}`}>
                      ⚑
                    </span>
                  )}
                </span>
              </div>
              {t.deadline && (
                <div
                  style={{ top: top + 4, left: xEnd(t.deadline) - 4 }}
                  title={`${tr("deadline")} ${t.deadline}`}
                  className="pointer-events-none absolute text-[9px] leading-none text-red-500"
                >
                  ▼
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
