import { addDays, format, parseISO } from "date-fns";
import type { ComputedTask, ID, Project, Task } from "./types";
import { childrenOf, depthMap, hasChildren, wbsNumbers } from "./tree";

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

/** Rolls a date forward to the next business day (Mon-Fri). */
export function snapToBusinessDay(iso: string): string {
  let d = parseISO(iso);
  while (isWeekend(d)) d = addDays(d, 1);
  return toISO(d);
}

export function addBusinessDays(start: Date, days: number): Date {
  let d = new Date(start);
  let remaining = days;
  while (remaining > 0) {
    d = addDays(d, 1);
    if (!isWeekend(d)) remaining--;
  }
  return d;
}

/** End date (inclusive) for a task starting at `startISO` running `duration` business days. */
export function computeEndDate(startISO: string, duration: number): string {
  if (duration <= 0) return startISO;
  const start = parseISO(startISO);
  return toISO(addBusinessDays(start, duration - 1));
}

/** Count of business days between two ISO dates, inclusive of both ends. */
export function businessDaysBetweenInclusive(startISO: string, endISO: string): number {
  let d = parseISO(startISO);
  const end = parseISO(endISO);
  if (d > end) return 0;
  let count = isWeekend(d) ? 0 : 1;
  while (d < end) {
    d = addDays(d, 1);
    if (!isWeekend(d)) count++;
  }
  return count;
}

function minISO(a: string, b: string): string {
  return a < b ? a : b;
}
function maxISO(a: string, b: string): string {
  return a > b ? a : b;
}

/** Pushes leaf task start dates forward so they never start before their predecessors finish.
 * Predecessors must be leaf tasks (enforced by the UI). Never pulls a start date earlier. */
export function applyDependencies(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const summary = new Set(tasks.filter((t) => hasChildren(tasks, t.id)).map((t) => t.id));

  const order: Task[] = [];
  const visited = new Set<ID>();
  const visiting = new Set<ID>();
  function visit(t: Task) {
    if (visited.has(t.id) || visiting.has(t.id)) return;
    visiting.add(t.id);
    for (const pid of t.predecessorIds) {
      const p = byId.get(pid);
      if (p) visit(p);
    }
    visiting.delete(t.id);
    visited.add(t.id);
    order.push(t);
  }
  tasks.forEach(visit);

  const updated = new Map<ID, Task>();
  for (const original of order) {
    let t = original;
    if (t.predecessorIds.length && !summary.has(t.id)) {
      let minStart: string | null = null;
      for (const pid of t.predecessorIds) {
        const p = updated.get(pid) ?? byId.get(pid);
        if (!p || summary.has(pid)) continue;
        const pEnd = computeEndDate(p.start, p.duration);
        const nextStart = snapToBusinessDay(toISO(addDays(parseISO(pEnd), 1)));
        minStart = minStart ? maxISO(minStart, nextStart) : nextStart;
      }
      if (minStart && minStart > t.start) {
        t = { ...t, start: minStart };
      }
    }
    updated.set(t.id, t);
  }
  return tasks.map((t) => updated.get(t.id)!);
}

interface RollupInfo {
  start: string;
  end: string;
  duration: number;
  progress: number;
}

export function getComputedTasks(project: Project): ComputedTask[] {
  const tasks = project.tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depths = depthMap(tasks);
  const wbs = wbsNumbers(tasks);
  const cache = new Map<ID, RollupInfo>();

  function info(id: ID): RollupInfo {
    if (cache.has(id)) return cache.get(id)!;
    const t = byId.get(id)!;
    const kids = childrenOf(tasks, id);
    let result: RollupInfo;
    if (kids.length === 0) {
      result = {
        start: t.start,
        end: computeEndDate(t.start, t.duration),
        duration: t.duration,
        progress: t.progress,
      };
    } else {
      const kidInfos = kids.map((k) => info(k.id));
      const start = kidInfos.reduce((m, k) => minISO(m, k.start), kidInfos[0].start);
      const end = kidInfos.reduce((m, k) => maxISO(m, k.end), kidInfos[0].end);
      const duration = businessDaysBetweenInclusive(start, end);
      const weightTotal = kidInfos.reduce((s, k) => s + Math.max(k.duration, 0.001), 0);
      const progress = Math.round(
        kidInfos.reduce((s, k) => s + k.progress * Math.max(k.duration, 0.001), 0) / weightTotal
      );
      result = { start, end, duration, progress };
    }
    cache.set(id, result);
    return result;
  }

  return tasks.map((t) => {
    const i = info(t.id);
    const isSummary = hasChildren(tasks, t.id);
    return {
      ...t,
      computedStart: i.start,
      computedEnd: i.end,
      computedDuration: i.duration,
      computedProgress: i.progress,
      isSummary,
      isMilestone: !isSummary && t.duration === 0,
      depth: depths.get(t.id) ?? 0,
      wbs: wbs.get(t.id) ?? "",
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
