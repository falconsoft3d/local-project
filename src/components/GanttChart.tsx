"use client";

import { useEffect, useRef, useState } from "react";
import { addDays } from "date-fns";
import { es, enUS } from "date-fns/locale";
import type { ComputedTask, ID, Zoom } from "@/lib/types";
import { HEADER_HEIGHT, ROW_HEIGHT } from "@/lib/constants";
import { useLanguage } from "@/lib/useT";
import { useStore } from "@/lib/store";
import { hexToRgba } from "@/lib/colors";
import {
  businessDaysBetweenInclusive,
  computeEndDate,
  fromISO,
  snapToBusinessDay,
  toISO,
} from "@/lib/schedule";
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
  originDuration: number;
}

export default function GanttChart({
  projectId,
  rows,
  zoom,
  selectedId,
  onSelect,
}: {
  projectId: ID;
  rows: ComputedTask[];
  zoom: Zoom;
  selectedId: ID | null;
  onSelect: (id: ID) => void;
}) {
  const updateTask = useStore((s) => s.updateTask);
  const rawStart = rows.length
    ? rows.reduce(
        (m, t) => (t.computedStart < m ? t.computedStart : m),
        rows[0].computedStart,
      )
    : null;
  const rawEnd = rows.length
    ? rows.reduce(
        (m, t) => (t.computedEnd > m ? t.computedEnd : m),
        rows[0].computedEnd,
      )
    : null;

  const language = useLanguage();
  const dateLocale = language === "es" ? es : enUS;

  const now = new Date();
  const start = rawStart ? new Date(`${rawStart}T00:00:00`) : now;
  const end = rawEnd ? new Date(`${rawEnd}T00:00:00`) : now;
  const range = buildTimelineRange(start, end, zoom);
  const header = buildHeader(range, zoom, dateLocale);
  const bands = weekendBands(range);
  const bodyHeight = rows.length * ROW_HEIGHT;

  const dragRef = useRef<DragInfo | null>(null);
  const [dragTaskId, setDragTaskId] = useState<ID | null>(null);
  const [deltaPx, setDeltaPx] = useState(0);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);

  function beginDrag(
    e: React.PointerEvent,
    task: ComputedTask,
    mode: DragMode,
  ) {
    e.stopPropagation();
    e.preventDefault();
    onSelect(task.id);
    dragRef.current = {
      taskId: task.id,
      mode,
      startClientX: e.clientX,
      originStart: task.start,
      originDuration: task.duration,
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
      const deltaCalendarDays = Math.round(
        (e.clientX - d.startClientX) / range.pxPerDay,
      );
      if (deltaCalendarDays === 0) return;
      if (d.mode === "move") {
        const newStart = snapToBusinessDay(
          toISO(addDays(fromISO(d.originStart), deltaCalendarDays)),
        );
        updateTask(projectId, d.taskId, { start: newStart });
      } else {
        const originEnd = computeEndDate(d.originStart, d.originDuration);
        const newEndCandidate = toISO(
          addDays(fromISO(originEnd), deltaCalendarDays),
        );
        const newDuration = Math.max(
          1,
          businessDaysBetweenInclusive(d.originStart, newEndCandidate),
        );
        updateTask(projectId, d.taskId, { duration: newDuration });
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

  const indexById = new Map(rows.map((t, i) => [t.id, i]));

  const connectors: { d: string; key: string }[] = [];
  rows.forEach((t) => {
    if (t.isSummary) return;
    const succIdx = indexById.get(t.id);
    if (succIdx === undefined) return;
    t.predecessorIds.forEach((pid) => {
      const predIdx = indexById.get(pid);
      if (predIdx === undefined) return;
      const pred = rows[predIdx];
      const predEndX = isoToX(range, pred.computedEnd) + range.pxPerDay;
      const predY = predIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      const succX = isoToX(range, t.computedStart);
      const succY = succIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      const midX = predEndX + 8;
      connectors.push({
        key: `${pid}->${t.id}`,
        d: `M ${predEndX} ${predY} H ${midX} V ${succY} H ${succX}`,
      });
    });
  });

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
            style={{
              top: i * ROW_HEIGHT,
              height: ROW_HEIGHT,
              width: range.totalWidth,
            }}
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
            <marker
              id="arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L8,4 L0,8 z" className="fill-neutral-400" />
            </marker>
          </defs>
          {connectors.map((c) => (
            <path
              key={c.key}
              d={c.d}
              fill="none"
              className="stroke-neutral-400"
              strokeWidth={1.5}
              markerEnd="url(#arrow)"
            />
          ))}
        </svg>

        <div
          style={{ left: todayX(range), height: bodyHeight }}
          className="pointer-events-none absolute top-0 w-px bg-red-400"
        />

        {rows.map((t, i) => {
          const isDraggingThis = dragTaskId === t.id;
          const liveDelta = isDraggingThis ? deltaPx : 0;
          const activeDragMode = isDraggingThis ? dragMode : undefined;

          let x = isoToX(range, t.computedStart);
          const xEnd = isoToX(range, t.computedEnd) + range.pxPerDay;
          let width = Math.max(xEnd - x, 4);
          const top = i * ROW_HEIGHT;

          if (isDraggingThis && activeDragMode === "move") x += liveDelta;
          if (isDraggingThis && activeDragMode === "resize") {
            width = Math.max(range.pxPerDay, width + liveDelta);
          }

          if (t.isMilestone) {
            return (
              <div
                key={t.id}
                style={{ top, left: x, height: ROW_HEIGHT }}
                className="absolute flex items-center"
              >
                <div
                  onPointerDown={(e) => beginDrag(e, t, "move")}
                  style={{
                    marginLeft: range.pxPerDay / 2 - 6,
                    backgroundColor: t.color || undefined,
                  }}
                  className={`h-3 w-3 rotate-45 cursor-grab ${
                    t.color
                      ? ""
                      : t.id === selectedId
                        ? "bg-green-600"
                        : "bg-neutral-800"
                  } ${t.id === selectedId ? "ring-2 ring-neutral-900" : ""}`}
                />
                <span className="ml-2 whitespace-nowrap text-[11px] text-neutral-600">
                  {t.name}
                </span>
              </div>
            );
          }

          if (t.isSummary) {
            return (
              <div
                key={t.id}
                style={{ top, left: x, width, height: ROW_HEIGHT }}
                className="absolute flex items-center"
              >
                <div className="relative w-full">
                  <div className="h-[7px] w-full rounded-[1px] bg-neutral-800" />
                  <div className="absolute -top-[3px] left-0 h-[13px] w-[3px] bg-neutral-800" />
                  <div className="absolute -top-[3px] right-0 h-[13px] w-[3px] bg-neutral-800" />
                </div>
                <span className="absolute left-full ml-2 whitespace-nowrap text-[11px] font-medium text-neutral-600">
                  {t.computedProgress}%
                </span>
              </div>
            );
          }

          const trackStyle = t.color
            ? { backgroundColor: hexToRgba(t.color, 0.35) }
            : undefined;
          const fillStyle = {
            width: `${Math.min(100, Math.max(0, t.progress))}%`,
            backgroundColor: t.color || undefined,
          };

          return (
            <div
              key={t.id}
              style={{ top, left: x, width, height: ROW_HEIGHT }}
              className="group absolute flex items-center"
            >
              <div
                onPointerDown={(e) => beginDrag(e, t, "move")}
                style={trackStyle}
                className={`relative h-4 w-full cursor-grab overflow-hidden rounded ${
                  t.color
                    ? ""
                    : t.id === selectedId
                      ? "bg-green-400"
                      : "bg-green-400/90"
                } ${t.id === selectedId ? "ring-2 ring-neutral-900" : ""}`}
              >
                <div
                  style={fillStyle}
                  className={`h-full ${t.color ? "" : "bg-green-700"}`}
                />
              </div>
              <div
                onPointerDown={(e) => beginDrag(e, t, "resize")}
                className="absolute right-0 top-0 h-full w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
              >
                <div className="mx-auto h-full w-0.5 bg-neutral-900/40" />
              </div>
              <span className="absolute left-full ml-2 whitespace-nowrap text-[11px] text-neutral-600">
                {t.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
