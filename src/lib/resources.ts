import { TaskCal, isoOf, type Cal } from "./calendar";
import { effectiveDuration, isPerformanceDriven, projectCal, runCpm, scheduleProject } from "./cpm";
import { expandLinks } from "./links";
import type { ID, Project, Resource, Task } from "./types";

/** Resource loading, over-allocation detection and leveling (manual chapter 08).
 *
 * Load model: for every leaf task and every labor/equipment resource assigned to it, the
 * total hours are spread evenly over the task's own working days (calendar minus
 * interruptions; every day for elapsed durations). Materials carry no hours. */

export interface ResourceLoadOptions {
  /** Other projects whose load on same-named resources is added ("Incluir otras obras"). */
  otherProjects?: Project[];
}

export interface DailyLoad {
  resourceId: ID;
  /** ISO date. */
  day: string;
  /** Hours requested by this project on that day. */
  hours: number;
  /** Hours requested by other projects (only with otherProjects). */
  otherHours: number;
  /** Capacity in hours (maxUnits × calendar hours), 0 on non-working days; null = unlimited. */
  capacity: number | null;
  taskIds: ID[];
}

export interface Overallocation {
  resourceId: ID;
  resourceName: string;
  from: string;
  to: string;
  peakHours: number;
  capacityHours: number;
  taskIds: ID[];
}

const EPS = 1e-6;

export function isTimeResource(r: Resource | undefined): boolean {
  // Only labor and equipment carry hours; materials and subcontracts don't load the histogram.
  const k = r?.kind ?? "labor";
  return !!r && (k === "labor" || k === "equipment");
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

function leafTasks(project: Project): Task[] {
  const parentIds = new Set(project.tasks.map((t) => t.parentId).filter(Boolean) as ID[]);
  return project.tasks.filter((t) => !parentIds.has(t.id));
}

/** Total hours a task asks of a resource. */
export function taskResourceHours(
  task: Task,
  resource: Resource,
  project: Project,
  cal: Cal,
  workDays: number,
): number {
  if (!isTimeResource(resource)) return 0;
  const a = task.resourceAssignments?.[resource.id];
  const crew = a?.units && a.units > 0 ? a.units : 1;
  if (isPerformanceDriven(task, project)) {
    const hpd = task.hoursPerDay && task.hoursPerDay > 0 ? task.hoursPerDay : cal.hoursPerDay;
    if (task.performanceUnit === "hour") return crew * (task.quantity! / task.performance!);
    return crew * hpd * (task.quantity! / task.performance!);
  }
  if (a?.quantity && a.quantity > 0 && task.quantity && task.quantity > 0) {
    return a.quantity * task.quantity;
  }
  return crew * cal.hoursPerDay * workDays;
}

/** Per-day hours of one task on each of its time resources, given a start moment. */
export interface TaskLoad {
  taskId: ID;
  days: number[];
  /** resourceId → hours per working day */
  perDay: Map<ID, number>;
}

function taskLoadAt(task: Task, project: Project, cal: Cal, s: number, f: number, resById: Map<ID, Resource>): TaskLoad | null {
  const dur = effectiveDuration(task, project, cal);
  if (dur <= 0) return null;
  const tc = new TaskCal(cal, task.elapsed, task.interruptions);
  const days = tc.workDaysIn(s, f);
  if (days.length === 0) return null;
  const perDay = new Map<ID, number>();
  for (const rid of task.resourceIds) {
    const r = resById.get(rid);
    if (!r || !isTimeResource(r)) continue;
    const h = taskResourceHours(task, r, project, cal, days.length);
    if (h > 0) perDay.set(rid, (perDay.get(rid) ?? 0) + h / days.length);
  }
  if (perDay.size === 0) return null;
  return { taskId: task.id, days, perDay };
}

/** Loads of every leaf task at its current scheduled position. */
export function projectTaskLoads(project: Project): TaskLoad[] {
  const cal = projectCal(project);
  const cpm = runCpm(project, false);
  const resById = new Map(project.resources.map((r) => [r.id, r]));
  const out: TaskLoad[] = [];
  for (const t of leafTasks(project)) {
    const r = cpm.byId.get(t.id);
    if (!r) continue;
    const l = taskLoadAt(t, project, cal, r.s, r.f, resById);
    if (l) out.push(l);
  }
  return out;
}

type DayMap = Map<number, { hours: number; taskIds: ID[] }>;

function accumulate(loads: TaskLoad[]): Map<ID, DayMap> {
  const byRes = new Map<ID, DayMap>();
  for (const l of loads) {
    for (const [rid, h] of l.perDay) {
      let m = byRes.get(rid);
      if (!m) byRes.set(rid, (m = new Map()));
      for (const d of l.days) {
        const cur = m.get(d) ?? { hours: 0, taskIds: [] };
        cur.hours += h;
        if (!cur.taskIds.includes(l.taskId)) cur.taskIds.push(l.taskId);
        m.set(d, cur);
      }
    }
  }
  return byRes;
}

/** Hours other projects put on this project's resources (matched by name), per day. */
function otherLoads(project: Project, others: Project[] | undefined): Map<ID, Map<number, number>> {
  const out = new Map<ID, Map<number, number>>();
  if (!others?.length) return out;
  const idByName = new Map<string, ID>();
  for (const r of project.resources) if (isTimeResource(r)) idByName.set(nameKey(r.name), r.id);
  for (const op of others) {
    if (op.id === project.id) continue;
    const opRes = new Map(op.resources.map((r) => [r.id, r]));
    let loads: TaskLoad[];
    try {
      loads = projectTaskLoads(op);
    } catch {
      continue;
    }
    for (const l of loads) {
      for (const [rid, h] of l.perDay) {
        const r = opRes.get(rid);
        const target = r ? idByName.get(nameKey(r.name)) : undefined;
        if (!target) continue;
        let m = out.get(target);
        if (!m) out.set(target, (m = new Map()));
        for (const d of l.days) m.set(d, (m.get(d) ?? 0) + h);
      }
    }
  }
  return out;
}

export function capacityOn(resource: Resource, cal: Cal, day: number): number | null {
  if (!resource.maxUnits || resource.maxUnits <= 0) return null;
  return cal.isWork(day) ? resource.maxUnits * cal.hoursPerDay : 0;
}

/** One entry per time resource and per day of the loaded range. */
export function computeDailyLoads(project: Project, opts?: ResourceLoadOptions): DailyLoad[] {
  const cal = projectCal(project);
  const own = accumulate(projectTaskLoads(project));
  const other = otherLoads(project, opts?.otherProjects);
  let min = Infinity;
  let max = -Infinity;
  for (const m of [...own.values()]) for (const d of m.keys()) { min = Math.min(min, d); max = Math.max(max, d); }
  for (const m of [...other.values()]) for (const d of m.keys()) { min = Math.min(min, d); max = Math.max(max, d); }
  if (!Number.isFinite(min)) return [];
  const out: DailyLoad[] = [];
  for (const r of project.resources) {
    if (!isTimeResource(r)) continue;
    const m = own.get(r.id);
    const o = other.get(r.id);
    if (!m && !o) continue;
    for (let d = min; d <= max; d++) {
      const e = m?.get(d);
      out.push({
        resourceId: r.id,
        day: isoOf(d),
        hours: e?.hours ?? 0,
        otherHours: o?.get(d) ?? 0,
        capacity: capacityOn(r, cal, d),
        taskIds: e?.taskIds ?? [],
      });
    }
  }
  return out;
}

export function overallocationsFromLoads(project: Project, loads: DailyLoad[]): Overallocation[] {
  const resById = new Map(project.resources.map((r) => [r.id, r]));
  const byRes = new Map<ID, DailyLoad[]>();
  for (const l of loads) {
    const list = byRes.get(l.resourceId) ?? [];
    list.push(l);
    byRes.set(l.resourceId, list);
  }
  const out: Overallocation[] = [];
  for (const [rid, list] of byRes) {
    list.sort((a, b) => a.day.localeCompare(b.day));
    let cur: Overallocation | null = null;
    for (const l of list) {
      const total = l.hours + l.otherHours;
      const over = l.capacity !== null && l.hours > EPS && total > l.capacity + EPS;
      if (over) {
        if (!cur) {
          cur = {
            resourceId: rid,
            resourceName: resById.get(rid)?.name ?? "",
            from: l.day,
            to: l.day,
            peakHours: 0,
            capacityHours: l.capacity!,
            taskIds: [],
          };
        }
        cur.to = l.day;
        if (total > cur.peakHours) {
          cur.peakHours = total;
          cur.capacityHours = l.capacity!;
        }
        for (const id of l.taskIds) if (!cur.taskIds.includes(id)) cur.taskIds.push(id);
      } else if (cur && (total > EPS || (l.capacity ?? 0) > 0)) {
        // A loaded or working day within capacity closes the range; idle weekends don't.
        out.push(cur);
        cur = null;
      }
    }
    if (cur) out.push(cur);
  }
  return out.sort((a, b) => a.from.localeCompare(b.from) || a.resourceName.localeCompare(b.resourceName));
}

export function findOverallocations(project: Project, opts?: ResourceLoadOptions): Overallocation[] {
  return overallocationsFromLoads(project, computeDailyLoads(project, opts));
}

export interface LevelingResult {
  project: Project;
  /** Number of tasks whose start moved. */
  moved: number;
  /** Over-allocations left after leveling. */
  remaining: number;
}

/** Removes every leveling delay and reschedules ("Quitar redistribución"). */
export function clearLeveling(project: Project): Project {
  const cleared = {
    ...project,
    tasks: project.tasks.map((t) => {
      if (!t.levelingStart) return t;
      const rest = { ...t };
      delete rest.levelingStart;
      return rest;
    }),
  };
  return scheduleProject(cleared);
}

/** "Redistribuir recursos": tasks are placed in start order (critical first) on the first day
 * their resources fit within capacity, respecting links, calendar and constraints. With
 * `withinFloat` no task goes beyond its late start, so the project finish does not move.
 * Started tasks and tasks with "Must start/finish on" never move. */
export function levelResources(
  project: Project,
  opts: { withinFloat: boolean; otherProjects?: Project[] },
): LevelingResult {
  let p = clearLeveling(project);
  const cal = projectCal(p);
  const resById = new Map(p.resources.map((r) => [r.id, r]));
  const initialStart = new Map(p.tasks.map((t) => [t.id, t.start]));
  const leaves = leafTasks(p);
  const leafIds = new Set(leaves.map((t) => t.id));
  const preds = new Map<ID, Set<ID>>();
  for (const e of expandLinks(p.tasks)) {
    if (!leafIds.has(e.successorId)) continue;
    const s = preds.get(e.successorId) ?? new Set<ID>();
    s.add(e.predecessorId);
    preds.set(e.successorId, s);
  }

  // Committed load: other projects + already placed tasks.
  const committed = new Map<ID, Map<number, number>>();
  for (const [rid, m] of otherLoads(p, opts.otherProjects)) committed.set(rid, new Map(m));
  const addLoad = (l: TaskLoad | null) => {
    if (!l) return;
    for (const [rid, h] of l.perDay) {
      let m = committed.get(rid);
      if (!m) committed.set(rid, (m = new Map()));
      for (const d of l.days) m.set(d, (m.get(d) ?? 0) + h);
    }
  };
  const fits = (l: TaskLoad | null): boolean => {
    if (!l) return true;
    for (const [rid, h] of l.perDay) {
      const r = resById.get(rid)!;
      if (!r.maxUnits || r.maxUnits <= 0) continue;
      const m = committed.get(rid);
      for (const d of l.days) {
        const cap = capacityOn(r, cal, d);
        if (cap === null) continue;
        // Elapsed tasks may work on non-working days; capacity there is not enforced.
        if (!cal.isWork(d)) continue;
        if ((m?.get(d) ?? 0) + h > cap + EPS) return false;
      }
    }
    return true;
  };

  const placed = new Set<ID>();
  let cpm = runCpm(p, false);
  const pFinish = cpm.projectFinish;
  let guard = 0;
  while (placed.size < leaves.length && guard++ < leaves.length * 2 + 10) {
    let candidates = leaves.filter(
      (t) => !placed.has(t.id) && [...(preds.get(t.id) ?? [])].every((id) => placed.has(id)),
    );
    if (candidates.length === 0) candidates = leaves.filter((t) => !placed.has(t.id)); // cycles
    candidates.sort((a, b) => {
      const ra = cpm.byId.get(a.id);
      const rb = cpm.byId.get(b.id);
      const sa = ra?.s ?? 0;
      const sb = rb?.s ?? 0;
      if (sa !== sb) return sa - sb;
      return Number(!!rb?.critical) - Number(!!ra?.critical);
    });
    const task = p.tasks.find((t) => t.id === candidates[0].id)!;
    const r = cpm.byId.get(task.id);
    placed.add(task.id);
    if (!r) continue;
    const dur = effectiveDuration(task, p, cal);
    const fixed =
      !!task.actualStart ||
      task.progress > 0 ||
      task.constraint === "MSO" ||
      task.constraint === "MFO" ||
      dur <= 0;
    const tc = new TaskCal(cal, task.elapsed, task.interruptions);
    const loadAt = (s: number) => taskLoadAt(task, p, cal, s, tc.finishOf(s, dur), resById);
    const current = loadAt(r.s);
    if (fixed || !current || fits(current)) {
      addLoad(taskLoadAt(task, p, cal, r.s, r.f, resById));
      continue;
    }
    // In "within float" mode the late start is bounded by the original project finish.
    const limit = opts.withinFloat ? Math.min(r.ls, tc.startOf(pFinish, dur)) : r.s + 730;
    let found: number | null = null;
    for (let d = r.s + 1; d <= limit; d++) {
      if (!tc.isWork(d)) continue;
      if (fits(loadAt(d))) {
        found = d;
        break;
      }
    }
    if (found === null) {
      addLoad(current);
      continue;
    }
    const iso = isoOf(found);
    p = scheduleProject({
      ...p,
      tasks: p.tasks.map((t) => (t.id === task.id ? { ...t, levelingStart: iso } : t)),
    });
    cpm = runCpm(p, false);
    const nr = cpm.byId.get(task.id)!;
    const placedTask = p.tasks.find((t) => t.id === task.id)!;
    addLoad(taskLoadAt(placedTask, p, cal, nr.s, nr.f, resById));
  }

  p = scheduleProject(p);
  const moved = p.tasks.filter((t) => leafIds.has(t.id) && t.start !== initialStart.get(t.id)).length;
  const remaining = findOverallocations(p, { otherProjects: opts.otherProjects }).length;
  return { project: p, moved, remaining };
}
