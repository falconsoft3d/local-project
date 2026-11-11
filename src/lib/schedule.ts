import { addDays, format, parseISO } from "date-fns";
import type { ComputedTask, ID, Project, Task } from "./types";
import { childrenOf, depthMap, hasChildren, wbsNumbers } from "./tree";
import { Cal, dayNum } from "./calendar";
import {
  earlyDates,
  effectiveDuration,
  isPerformanceDriven,
  lateDates,
  momentsToDates,
  projectCal,
  runCpm,
} from "./cpm";

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function toISO(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function fromISO(iso: string): Date {
  return parseISO(iso);
}

/** Rolls a date forward to the next working day of the calendar (Mon-Fri by default). */
export function snapToBusinessDay(iso: string, cal?: Cal): string {
  return (cal ?? new Cal()).snapISO(iso);
}

/** End date (inclusive) for a task starting at `startISO` running `duration` working days. */
export function computeEndDate(startISO: string, duration: number, cal?: Cal): string {
  return (cal ?? new Cal()).endISO(startISO, duration);
}

/** Count of working days between two ISO dates, inclusive of both ends. */
export function businessDaysBetweenInclusive(startISO: string, endISO: string, cal?: Cal): number {
  return (cal ?? new Cal()).workDaysInclusive(startISO, endISO);
}

function minISO(a: string, b: string): string {
  return a < b ? a : b;
}
function maxISO(a: string, b: string): string {
  return a > b ? a : b;
}

/** Sum of the task's resources (quantity × price per unit of task), or null when no
 * resource has a quantity. */
export function resourceUnitPrice(task: Task, project: Project): number | null {
  let derived = 0;
  let hasQty = false;
  for (const rid of task.resourceIds) {
    const a = task.resourceAssignments?.[rid];
    if (!a?.quantity) continue;
    hasQty = true;
    const r = project.resources.find((x) => x.id === rid);
    derived += a.quantity * (a.price ?? r?.price ?? 0);
  }
  return hasQty ? derived : null;
}

/** Unit price of a task: the explicit budget price when set (e.g. from BC3), otherwise the
 * sum of its resources. Editing the task's resources clears the explicit price so the amount
 * is recalculated from them. */
export function taskUnitPrice(task: Task, project: Project): number {
  if (task.unitPrice !== undefined && task.unitPrice !== null) return task.unitPrice;
  return resourceUnitPrice(task, project) ?? 0;
}

/** Budget amount of a leaf task ("Importe"). */
export function taskCost(task: Task, project: Project): number {
  const price = taskUnitPrice(task, project);
  if (!price) return 0;
  return (task.quantity ?? 1) * price;
}

export function activeBaseline(project: Project) {
  const id = project.schedule?.activeBaselineId;
  return id ? project.baselines?.find((b) => b.id === id) : undefined;
}

export function getComputedTasks(project: Project): ComputedTask[] {
  const tasks = project.tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depths = depthMap(tasks);
  const wbs = wbsNumbers(tasks);
  const cal = projectCal(project);
  const cpm = runCpm(project, false);
  const baseline = activeBaseline(project);

  interface Info {
    start: string;
    end: string;
    duration: number;
    progress: number;
    certified: number;
    cost: number;
    tf?: number;
    critical: boolean;
    bStart?: string;
    bFinish?: string;
    bCost?: number;
  }
  const cache = new Map<ID, Info>();

  function info(id: ID): Info {
    const cached = cache.get(id);
    if (cached) return cached;
    const t = byId.get(id)!;
    const kids = childrenOf(tasks, id);
    let result: Info;
    const b = baseline?.tasks[id];
    if (kids.length === 0) {
      const r = cpm.byId.get(id);
      const dates = r ? momentsToDates(r) : { start: t.start, finish: cal.endISO(t.start, t.duration) };
      result = {
        start: dates.start,
        end: dates.finish,
        duration: effectiveDuration(t, project, cal),
        progress: t.progress,
        certified: t.certified ?? 0,
        cost: taskCost(t, project),
        tf: r?.tf,
        critical: r?.critical ?? false,
        bStart: b?.start,
        bFinish: b?.finish,
        bCost: b?.cost,
      };
    } else {
      const kidInfos = kids.map((k) => info(k.id));
      const start = kidInfos.reduce((m, k) => minISO(m, k.start), kidInfos[0].start);
      const end = kidInfos.reduce((m, k) => maxISO(m, k.end), kidInfos[0].end);
      const duration = cal.workDaysInclusive(start, end);
      const weightTotal = kidInfos.reduce((s, k) => s + Math.max(k.duration, 0.001), 0);
      const progress = Math.round(
        kidInfos.reduce((s, k) => s + k.progress * Math.max(k.duration, 0.001), 0) / weightTotal,
      );
      const cost = kidInfos.reduce((s, k) => s + k.cost, 0);
      const certified =
        cost > 0
          ? Math.round((kidInfos.reduce((s, k) => s + k.certified * k.cost, 0) / cost) * 10) / 10
          : Math.round(kidInfos.reduce((s, k) => s + k.certified * Math.max(k.duration, 0.001), 0) / weightTotal);
      const floats = kidInfos.map((k) => k.tf).filter((v): v is number => v !== undefined);
      const bStarts = kidInfos.map((k) => k.bStart).filter(Boolean) as string[];
      const bFinishes = kidInfos.map((k) => k.bFinish).filter(Boolean) as string[];
      result = {
        start,
        end,
        duration,
        progress,
        certified,
        cost,
        tf: floats.length ? Math.min(...floats) : undefined,
        critical: kidInfos.some((k) => k.critical),
        bStart: b?.start ?? (bStarts.length ? bStarts.reduce(minISO) : undefined),
        bFinish: b?.finish ?? (bFinishes.length ? bFinishes.reduce(maxISO) : undefined),
        bCost: b?.cost ?? (kidInfos.some((k) => k.bCost !== undefined) ? kidInfos.reduce((s, k) => s + (k.bCost ?? 0), 0) : undefined),
      };
    }
    cache.set(id, result);
    return result;
  }

  return tasks.map((t) => {
    const i = info(t.id);
    const isSummary = hasChildren(tasks, t.id);
    const r = isSummary ? undefined : cpm.byId.get(t.id);
    const early = r ? earlyDates(r) : undefined;
    const late = r ? lateDates(r) : undefined;
    const finished = !isSummary && (!!t.actualFinish || t.progress >= 100);
    const started = !isSummary && (!!t.actualStart || t.progress > 0);
    const remaining = isSummary
      ? 0
      : finished
        ? 0
        : Math.ceil(i.duration * (1 - Math.min(100, t.progress) / 100));
    const finishVariance =
      i.bFinish !== undefined ? cal.workDiff(dayNum(i.bFinish), dayNum(i.end)) : undefined;
    return {
      ...t,
      computedStart: i.start,
      computedEnd: i.end,
      computedDuration: i.duration,
      computedProgress: i.progress,
      computedCertified: i.certified,
      isSummary,
      isMilestone: !isSummary && i.duration === 0,
      depth: depths.get(t.id) ?? 0,
      wbs: wbs.get(t.id) ?? "",
      displayCode: t.code?.trim() || wbs.get(t.id) || "",
      durationLocked: !isSummary && isPerformanceDriven(t, project),
      cost: i.cost,
      earlyStart: early?.start,
      earlyFinish: early?.finish,
      lateStart: late?.start,
      lateFinish: late?.finish,
      totalFloat: i.tf,
      freeFloat: r?.ff,
      critical: isSummary ? false : i.critical,
      remainingDuration: remaining,
      isStarted: started,
      isFinished: finished,
      baselineStart: i.bStart,
      baselineFinish: i.bFinish,
      baselineDuration: i.bStart && i.bFinish ? cal.workDaysInclusive(i.bStart, i.bFinish) : undefined,
      baselineCost: i.bCost,
      finishVariance,
    };
  });
}

export function projectDateRange(computed: ComputedTask[]): { start: Date; end: Date } {
  if (computed.length === 0) {
    const now = new Date();
    return { start: addDays(now, -3), end: addDays(now, 24) };
  }
  let min = computed[0].computedStart;
  let max = computed[0].computedEnd;
  for (const t of computed) {
    min = minISO(min, t.computedStart);
    max = maxISO(max, t.computedEnd);
  }
  return { start: parseISO(min), end: parseISO(max) };
}
