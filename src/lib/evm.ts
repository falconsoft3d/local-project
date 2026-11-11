import { TaskCal, dayNum, isoOf, todayISO } from "./calendar";
import { effectiveDuration, projectCal } from "./cpm";
import { activeBaseline, getComputedTasks, taskCost } from "./schedule";
import { earnedValueAt, plannedFraction, taskFinishISO, type EvValues } from "./tracking";
import type { ComputedTask, ID, Project } from "./types";

/** Earned-value series for the S-curve (manual chapter 10) and the delayed-task analysis
 * used by the tracking report (chapter 09). */

export type SCurveScale = "week" | "month";

export interface SCurvePeriod {
  /** Last day of the period (ISO). Values are cumulative up to and including this day. */
  date: string;
  /** First day of the period (ISO). */
  from: string;
  /** Planned value from the active baseline (current schedule when there is none). */
  pv: number;
  /** "Programación actual": same as PV but with the current dates. */
  pvCurrent: number;
  /** Cumulative actual cost, null after the cut-off (status date / last cost). */
  ac: number | null;
  /** Earned value of the last photo inside the period, if any. */
  ev: number | null;
  certified: number | null;
}

export interface SCurvePoint {
  date: string;
  value: number;
}

export interface SCurveData {
  start: string;
  end: string;
  scale: SCurveScale;
  periods: SCurvePeriod[];
  /** Cumulative curves sampled at period ends (with a zero point at the start). */
  pv: SCurvePoint[];
  pvCurrent: SCurvePoint[];
  ac: SCurvePoint[];
  /** One point per photo ("Registrar avance") plus the live status-date value. */
  ev: SCurvePoint[];
  certified: SCurvePoint[];
  bac: number;
  /** Sum of the current task amounts. */
  budget: number;
  hasBaseline: boolean;
  statusDate?: string;
  /** Live earned value at the status date (null without a status date). */
  live: EvValues | null;
}

function leafIds(project: Project): Set<ID> {
  const parentIds = new Set(project.tasks.map((t) => t.parentId).filter(Boolean) as ID[]);
  return new Set(project.tasks.filter((t) => !parentIds.has(t.id)).map((t) => t.id));
}

/** Adds `amount` spread evenly over the task's working days in [start, finish]. */
function spread(
  daily: Map<number, number>,
  tc: TaskCal,
  startISO: string,
  finishISO: string,
  duration: number,
  amount: number,
) {
  if (!amount) return;
  const s = dayNum(startISO);
  const f = dayNum(finishISO);
  const days = duration > 0 && f >= s ? tc.workDaysIn(s, f + 1) : [];
  if (days.length === 0) {
    daily.set(s, (daily.get(s) ?? 0) + amount);
    return;
  }
  const per = amount / days.length;
  for (const d of days) daily.set(d, (daily.get(d) ?? 0) + per);
}

export { plannedFraction };

/** Period end days between start and end (inclusive), aligned on Sundays (week) or month ends. */
function periodEnds(start: number, end: number, scale: SCurveScale): number[] {
  const out: number[] = [];
  if (scale === "week") {
    // weekday 0 = Sunday (1970-01-01 = Thursday → (n + 4) % 7).
    let d = start;
    while (((d + 4) % 7 + 7) % 7 !== 0) d++;
    for (; d < end; d += 7) out.push(d);
  } else {
    const s = new Date(start * 86400000);
    let y = s.getUTCFullYear();
    let m = s.getUTCMonth();
    for (let i = 0; i < 600; i++) {
      const last = Math.round(Date.UTC(y, m + 1, 0) / 86400000);
      if (last >= end) break;
      if (last >= start) out.push(last);
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
  }
  out.push(end);
  return out;
}

function cumulativeAt(sortedDays: [number, number][], upTo: number, cursor: { i: number; sum: number }): number {
  while (cursor.i < sortedDays.length && sortedDays[cursor.i][0] <= upTo) {
    cursor.sum += sortedDays[cursor.i][1];
    cursor.i++;
  }
  return cursor.sum;
}

export function buildSCurve(project: Project, scale: SCurveScale): SCurveData {
  const cal = projectCal(project);
  const leaves = leafIds(project);
  const baseline = activeBaseline(project);
  const statusDate = project.schedule?.statusDate;
  const pvDaily = new Map<number, number>();
  const curDaily = new Map<number, number>();
  let minDay = Infinity;
  let maxDay = -Infinity;
  let budget = 0;
  let bacFromTasks = 0;

  for (const t of project.tasks) {
    if (!leaves.has(t.id)) continue;
    const cost = taskCost(t, project);
    const tc = new TaskCal(cal, t.elapsed, t.interruptions);
    const dur = effectiveDuration(t, project, cal);
    const curStart = t.actualStart ?? t.start;
    const curFinish = taskFinishISO(t, project, cal);
    budget += cost;
    spread(curDaily, tc, curStart, curFinish, dur, cost);
    minDay = Math.min(minDay, dayNum(curStart));
    maxDay = Math.max(maxDay, dayNum(curFinish));
    const b = baseline?.tasks[t.id];
    if (b) {
      spread(pvDaily, tc, b.start, b.finish, b.duration, b.cost);
      bacFromTasks += b.cost;
      minDay = Math.min(minDay, dayNum(b.start));
      maxDay = Math.max(maxDay, dayNum(b.finish));
    }
  }
  const pvSource = baseline ? pvDaily : curDaily;
  const costs = (project.actualCosts ?? []).filter((c) => c.date);
  const snaps = [...(project.evSnapshots ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  for (const c of costs) {
    minDay = Math.min(minDay, dayNum(c.date));
    maxDay = Math.max(maxDay, dayNum(c.date));
  }
  for (const s of snaps) maxDay = Math.max(maxDay, dayNum(s.date));
  if (statusDate) maxDay = Math.max(maxDay, dayNum(statusDate));
  if (!Number.isFinite(minDay)) {
    const today = dayNum(todayISO());
    minDay = today;
    maxDay = today + 30;
  }
  if (maxDay <= minDay) maxDay = minDay + 1;

  const live = statusDate ? earnedValueAt(project, statusDate) : null;
  const bac = baseline ? baseline.total || bacFromTasks : budget;

  const sortDaily = (m: Map<number, number>) => [...m.entries()].sort((a, b) => a[0] - b[0]);
  const pvSorted = sortDaily(pvSource);
  const curSorted = sortDaily(curDaily);
  const acDaily = new Map<number, number>();
  for (const c of costs) acDaily.set(dayNum(c.date), (acDaily.get(dayNum(c.date)) ?? 0) + (Number(c.amount) || 0));
  const acSorted = sortDaily(acDaily);
  const lastCost = acSorted.length ? acSorted[acSorted.length - 1][0] : -Infinity;
  const acCutoff = Math.max(statusDate ? dayNum(statusDate) : dayNum(todayISO()), lastCost);

  // EV / certified points: photos plus the live status-date value.
  const evPoints: SCurvePoint[] = [];
  const certPoints: SCurvePoint[] = [];
  const startISO = isoOf(minDay - 1);
  evPoints.push({ date: startISO, value: 0 });
  certPoints.push({ date: startISO, value: 0 });
  for (const s of snaps) {
    evPoints.push({ date: s.date, value: s.ev });
    certPoints.push({ date: s.date, value: s.certified });
  }
  if (live && statusDate && !snaps.some((s) => s.date === statusDate)) {
    evPoints.push({ date: statusDate, value: live.ev });
    certPoints.push({ date: statusDate, value: live.certified });
    evPoints.sort((a, b) => a.date.localeCompare(b.date));
    certPoints.sort((a, b) => a.date.localeCompare(b.date));
  }

  const ends = periodEnds(minDay, maxDay, scale);
  const pvC = { i: 0, sum: 0 };
  const curC = { i: 0, sum: 0 };
  const acC = { i: 0, sum: 0 };
  const periods: SCurvePeriod[] = [];
  const pv: SCurvePoint[] = [{ date: startISO, value: 0 }];
  const pvCurrent: SCurvePoint[] = [{ date: startISO, value: 0 }];
  const ac: SCurvePoint[] = [{ date: startISO, value: 0 }];
  let prev = minDay - 1;
  for (const end of ends) {
    const date = isoOf(end);
    const pvv = cumulativeAt(pvSorted, end, pvC);
    const curv = cumulativeAt(curSorted, end, curC);
    let acv: number | null = null;
    if (end <= acCutoff) {
      acv = cumulativeAt(acSorted, end, acC);
      ac.push({ date, value: acv });
    } else if (prev < acCutoff) {
      // Close the AC curve exactly at the cut-off.
      const v = cumulativeAt(acSorted, acCutoff, acC);
      ac.push({ date: isoOf(acCutoff), value: v });
    }
    const inPeriod = snaps.filter((s) => dayNum(s.date) > prev && dayNum(s.date) <= end);
    const lastSnap = inPeriod[inPeriod.length - 1];
    const liveIn = live && statusDate && dayNum(statusDate) > prev && dayNum(statusDate) <= end;
    periods.push({
      date,
      from: isoOf(prev + 1),
      pv: pvv,
      pvCurrent: curv,
      ac: acv,
      ev: liveIn ? live!.ev : lastSnap ? lastSnap.ev : null,
      certified: liveIn ? live!.certified : lastSnap ? lastSnap.certified : null,
    });
    pv.push({ date, value: pvv });
    pvCurrent.push({ date, value: curv });
    prev = end;
  }

  return {
    start: startISO,
    end: isoOf(maxDay),
    scale,
    periods,
    pv,
    pvCurrent,
    ac,
    ev: evPoints,
    certified: certPoints,
    bac,
    budget,
    hasBaseline: !!baseline,
    statusDate,
    live,
  };
}

/** Planned value (baseline, or current dates without a baseline) at an arbitrary date. */
export function plannedValueAt(project: Project, dateISO: string): number {
  return earnedValueAt(project, dateISO).pv;
}

export type DelayReason =
  | { kind: "late"; days: number }
  | { kind: "behind"; progress: number; expected: number }
  | { kind: "negativeFloat"; float: number };

export interface DelayedTask {
  task: ComputedTask;
  reasons: DelayReason[];
  /** Expected progress (%) at the status date. */
  expected: number;
}

/** Expected physical progress (0-100) of a leaf task at a date, from its baseline dates
 * (current dates when it has no baseline). */
export function expectedProgress(project: Project, task: ComputedTask, dateISO: string): number {
  const cal = projectCal(project);
  const tc = new TaskCal(cal, task.elapsed, task.interruptions);
  const start = task.baselineStart ?? task.computedStart;
  const finish = task.baselineFinish ?? task.computedEnd;
  const dur = task.baselineDuration ?? task.computedDuration;
  return Math.round(plannedFraction(tc, start, finish, dur, dayNum(dateISO)) * 100);
}

/** Leaf tasks that are delayed at the status date (or today): finishing after the baseline,
 * progress ≥ 5 points below plan, or negative total float. Sorted by code. */
export function delayedTasks(project: Project, computed?: ComputedTask[]): DelayedTask[] {
  const rows = computed ?? getComputedTasks(project);
  const date = project.schedule?.statusDate ?? todayISO();
  const out: DelayedTask[] = [];
  for (const t of rows) {
    if (t.isSummary) continue;
    const reasons: DelayReason[] = [];
    if (t.finishVariance !== undefined && t.finishVariance > 0) {
      reasons.push({ kind: "late", days: t.finishVariance });
    }
    const expected = expectedProgress(project, t, date);
    if (!t.isFinished && expected - t.progress >= 5) {
      reasons.push({ kind: "behind", progress: t.progress, expected });
    }
    if (!t.isFinished && t.totalFloat !== undefined && t.totalFloat < 0) {
      reasons.push({ kind: "negativeFloat", float: t.totalFloat });
    }
    if (reasons.length) out.push({ task: t, reasons, expected });
  }
  return out.sort((a, b) => compareCodes(a.task.displayCode, b.task.displayCode));
}

/** Natural sort for budget codes ("01.10" after "01.9"). */
export function compareCodes(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
