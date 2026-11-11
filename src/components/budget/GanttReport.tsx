"use client";

import { useMemo } from "react";
import { getComputedTasks } from "@/lib/schedule";
import { dayNum, isoOf } from "@/lib/calendar";
import { formatLinks } from "@/lib/links";
import { formatShortDate } from "@/lib/format";
import { DEFAULT_TASK_COLOR } from "@/lib/colors";
import { useLanguage, useT } from "@/lib/useT";
import type { ComputedTask, Project, Zoom } from "@/lib/types";

export type GanttReportLevel = "chapters" | "items";

const MONTHS: Record<string, string[]> = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

/** Rows shown by the schedule report (also used by the Excel export's collapse set). */
export function ganttReportRows(
  computed: ComputedTask[],
  level: GanttReportLevel,
  onlyCritical: boolean,
): ComputedTask[] {
  const parentOf = new Map(computed.map((c) => [c.id, c.parentId]));
  let keep: Set<string> | null = null;
  if (onlyCritical) {
    keep = new Set();
    for (const c of computed) {
      if (c.isSummary || !c.critical) continue;
      keep.add(c.id);
      let p = c.parentId;
      while (p) {
        keep.add(p);
        p = parentOf.get(p) ?? null;
      }
    }
  }
  return computed.filter((c) => {
    if (keep && !keep.has(c.id)) return false;
    if (level === "chapters") return c.isSummary || (!c.parentId && !c.isSummary);
    return true;
  });
}

/** Printable Gantt: schedule table plus bars scaled to the page width (A4 landscape). */
export default function GanttReport({
  project,
  level,
  zoom,
  onlyCritical,
  showCritical,
  showBaseline,
}: {
  project: Project;
  level: GanttReportLevel;
  zoom: Zoom;
  onlyCritical: boolean;
  showCritical: boolean;
  showBaseline: boolean;
}) {
  const t = useT();
  const lang = useLanguage();
  const computed = useMemo(() => getComputedTasks(project), [project]);
  const rows = useMemo(() => ganttReportRows(computed, level, onlyCritical), [computed, level, onlyCritical]);
  const codeById = useMemo(() => new Map(computed.map((c) => [c.id, c.displayCode])), [computed]);
  const statusDate = project.schedule?.statusDate;

  // Timeline range: whole months (or whole weeks) around the visible tasks.
  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    min = Math.min(min, dayNum(r.computedStart), r.baselineStart && showBaseline ? dayNum(r.baselineStart) : Infinity);
    max = Math.max(max, dayNum(r.computedEnd), r.baselineFinish && showBaseline ? dayNum(r.baselineFinish) : -Infinity);
  }
  if (statusDate) {
    min = Math.min(min, dayNum(statusDate));
    max = Math.max(max, dayNum(statusDate));
  }
  if (!Number.isFinite(min)) {
    return <p className="py-10 text-center text-neutral-400">{t("noTasksYet")}</p>;
  }
  const startIso = isoOf(min);
  const endIso = isoOf(max);
  const start = dayNum(`${startIso.slice(0, 7)}-01`);
  const endDate = new Date(`${endIso.slice(0, 7)}-01T00:00:00Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  const end = Math.round(endDate.getTime() / 86400000); // exclusive
  const span = end - start;
  const x = (day: number) => `${((day - start) / span) * 100}%`;
  const w = (a: number, b: number) => `${Math.max(((b - a) / span) * 100, 0.25)}%`;

  const months: { label: string; from: number; to: number }[] = [];
  for (let d = new Date(start * 86400000); Math.round(d.getTime() / 86400000) < end; ) {
    const from = Math.round(d.getTime() / 86400000);
    const label = `${MONTHS[lang === "es" ? "es" : "en"][d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    months.push({ label, from, to: Math.round(d.getTime() / 86400000) });
  }
  // Week ticks (Mondays) for the week/day scales.
  const weeks: number[] = [];
  if (zoom !== "month") {
    for (let d = start; d < end; d++) if (new Date(d * 86400000).getUTCDay() === 1) weeks.push(d);
  }

  const th = "border-b-2 border-neutral-800 px-1.5 py-1 text-left text-[10px] font-semibold uppercase text-neutral-600";

  return (
    <table className="w-full table-fixed border-collapse text-[10.5px]">
      <colgroup>
        <col style={{ width: 52 }} />
        <col style={{ width: 190 }} />
        <col style={{ width: 38 }} />
        <col style={{ width: 58 }} />
        <col style={{ width: 58 }} />
        {level === "items" && <col style={{ width: 78 }} />}
        <col style={{ width: 38 }} />
        <col />
      </colgroup>
      <thead className="table-header-group">
        <tr>
          <th className={th}>{t("budCode")}</th>
          <th className={th}>{t("colTaskName")}</th>
          <th className={`${th} text-right`}>{t("repDur")}</th>
          <th className={th}>{t("colStart")}</th>
          <th className={th}>{t("colFinish")}</th>
          {level === "items" && <th className={th}>{t("colPreds")}</th>}
          <th className={`${th} text-right`}>{t("colFloat")}</th>
          <th className="border-b-2 border-neutral-800 p-0">
            <div className="relative h-[22px]">
              {months.map((m) => (
                <div
                  key={m.from}
                  className="absolute top-0 h-full overflow-hidden border-l border-neutral-300 pl-1 text-[9px] font-semibold uppercase leading-[22px] text-neutral-600"
                  style={{ left: x(m.from), width: w(m.from, m.to) }}
                >
                  {m.label}
                </div>
              ))}
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const s = dayNum(r.computedStart);
          const f = dayNum(r.computedEnd) + 1;
          const crit = showCritical && !r.isSummary && r.critical;
          const color = crit ? "#dc2626" : r.color || DEFAULT_TASK_COLOR;
          return (
            <tr key={r.id} className={`border-b border-neutral-200 ${r.isSummary ? "bg-neutral-100 font-semibold" : ""}`}>
              <td className="truncate px-1.5 py-0.5">{r.displayCode}</td>
              <td className={`truncate px-1.5 py-0.5 ${crit ? "text-red-600" : ""}`} style={{ paddingLeft: 6 + r.depth * 8 }}>
                {r.isMilestone ? "◆ " : ""}
                {r.name}
              </td>
              <td className="px-1.5 py-0.5 text-right tabular-nums">
                {r.computedDuration}
                {r.elapsed ? "dt" : ""}
              </td>
              <td className="px-1.5 py-0.5 tabular-nums">{formatShortDate(r.computedStart)}</td>
              <td className="px-1.5 py-0.5 tabular-nums">{formatShortDate(r.computedEnd)}</td>
              {level === "items" && (
                <td className="truncate px-1.5 py-0.5 text-neutral-500">
                  {r.isSummary ? "" : formatLinks(r.predecessors, codeById, lang)}
                </td>
              )}
              <td className={`px-1.5 py-0.5 text-right tabular-nums ${(r.totalFloat ?? 0) < 0 || crit ? "text-red-600" : ""}`}>
                {r.isFinished || r.totalFloat === undefined ? "" : r.totalFloat}
              </td>
              <td className="p-0">
                <div className="relative h-[18px]">
                  {weeks.map((d) => (
                    <div key={d} className="absolute top-0 h-full border-l border-neutral-100" style={{ left: x(d) }} />
                  ))}
                  {months.map((m) => (
                    <div key={m.from} className="absolute top-0 h-full border-l border-neutral-200" style={{ left: x(m.from) }} />
                  ))}
                  {showBaseline && r.baselineStart && r.baselineFinish && (
                    <div
                      className="absolute bottom-[1px] h-[3px] bg-neutral-400"
                      style={{ left: x(dayNum(r.baselineStart)), width: w(dayNum(r.baselineStart), dayNum(r.baselineFinish) + 1) }}
                    />
                  )}
                  {r.isMilestone ? (
                    <div
                      className="absolute top-[4px] h-[9px] w-[9px] -translate-x-1/2 rotate-45"
                      style={{ left: x(s + 0.5), backgroundColor: crit ? "#dc2626" : "#171717" }}
                    />
                  ) : r.isSummary ? (
                    <div className="absolute top-[6px] h-[5px] bg-neutral-800" style={{ left: x(s), width: w(s, f) }} />
                  ) : (
                    <div
                      className="absolute top-[4px] h-[9px] overflow-hidden rounded-[2px]"
                      style={{ left: x(s), width: w(s, f), backgroundColor: color, opacity: r.isFinished ? 0.55 : 1 }}
                    >
                      <div className="h-full bg-black/30" style={{ width: `${Math.min(100, r.progress)}%` }} />
                    </div>
                  )}
                  {statusDate && (
                    <div className="absolute top-0 h-full border-l-2 border-dashed border-blue-500" style={{ left: x(dayNum(statusDate) + 1) }} />
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
