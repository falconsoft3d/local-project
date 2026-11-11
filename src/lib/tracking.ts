import { v4 as uuid } from "uuid";
import { Cal, TaskCal, dayNum, isoOf } from "./calendar";
import { effectiveDuration, projectCal } from "./cpm";
import { activeBaseline, getComputedTasks, taskCost } from "./schedule";
import type { Baseline, BaselineTask, EvSnapshot, ID, Project, Task } from "./types";

/** Baselines, monthly tracking actions (chapter 09) and earned value at a date (chapter 10). */

function leafSet(project: Project): Set<ID> {
  const parentIds = new Set(project.tasks.map((t) => t.parentId).filter(Boolean) as ID[]);
  return new Set(project.tasks.filter((t) => !parentIds.has(t.id)).map((t) => t.id));
}

/** Inclusive finish date of a leaf task from its stored start/duration (honoring elapsed
 * durations and interruptions). */
export function taskFinishISO(task: Task, project: Project, cal?: Cal): string {
  const c = cal ?? projectCal(project);
  const dur = effectiveDuration(task, project, c);
  if (task.actualFinish) return task.actualFinish;
  const s = dayNum(task.actualStart ?? task.start);
  if (dur <= 0) return isoOf(s);
  const tc = new TaskCal(c, task.elapsed, task.interruptions);
  return isoOf(tc.finishOf(s, dur) - 1);
}

/** "Guardar línea base": stores dates, durations and amounts of every chapter and task. */
export function createBaseline(project: Project, name?: string): Baseline {
  const computed = getComputedTasks(project);
  const leaves = leafSet(project);
  const tasks: Record<ID, BaselineTask> = {};
  let total = 0;
  for (const c of computed) {
    tasks[c.id] = {
      start: c.computedStart,
      finish: c.computedEnd,
      duration: c.computedDuration,
      cost: c.cost,
    };
    if (leaves.has(c.id)) total += c.cost;
  }
  const n = (project.baselines?.length ?? 0) + 1;
  return {
    id: uuid(),
    name: name?.trim() || `Línea base ${n}`,
    createdAt: new Date().toISOString(),
    tasks,
    total,
  };
}

/** Proportion (0..1) of a task's working days that fall on or before `date`. */
export function plannedFraction(tc: TaskCal, startISO: string, finishISO: string, duration: number, date: number): number {
  const s = dayNum(startISO);
  const f = dayNum(finishISO);
  if (duration <= 0 || f < s) return date >= s ? 1 : 0;
  if (date < s) return 0;
  if (date >= f) return 1;
  const all = tc.workDaysIn(s, f + 1).length;
  if (all === 0) return date >= f ? 1 : 0;
  const done = tc.workDaysIn(s, date + 1).length;
  return done / all;
}

/** "Actualizar según lo programado": what should have started before the status date is
 * marked as started and what should have finished as finished, with proportional
 * progress. Never lowers progress already entered. */
export function updateAsScheduled(project: Project): Project {
  const status = project.schedule?.statusDate;
  if (!status) return project;
  const cal = projectCal(project);
  const leaves = leafSet(project);
  const st = dayNum(status);
  const tasks = project.tasks.map((t) => {
    if (!leaves.has(t.id) || t.actualFinish) return t;
    const finish = taskFinishISO(t, project, cal);
    const s = dayNum(t.actualStart ?? t.start);
    if (s > st) return t;
    if (dayNum(finish) <= st) {
      return {
        ...t,
        progress: 100,
        actualStart: t.actualStart ?? t.start,
        actualFinish: finish,
      };
    }
    const tc = new TaskCal(cal, t.elapsed, t.interruptions);
    const frac = plannedFraction(tc, t.actualStart ?? t.start, finish, effectiveDuration(t, project, cal), st);
    const pct = Math.max(t.progress, Math.min(99, Math.round(frac * 100)));
    return { ...t, progress: pct, actualStart: t.actualStart ?? t.start };
  });
  return { ...project, tasks };
}

/** "Reprogramar lo pendiente": work not started does not start before the status date
 * (a "Start No Earlier Than" on the next working day), and started work that is behind gets
 * its remaining duration after the status date. Actual dates never move. */
export function rescheduleRemaining(project: Project): Project {
  const status = project.schedule?.statusDate;
  if (!status) return project;
  const cal = projectCal(project);
  const leaves = leafSet(project);
  const st = dayNum(status);
  const resume = isoOf(cal.nextWork(st + 1));
  const tasks = project.tasks.map((t) => {
    if (!leaves.has(t.id) || t.actualFinish || t.progress >= 100) return t;
    const dur = effectiveDuration(t, project, cal);
    if (!t.actualStart && t.progress <= 0) {
      if (dayNum(t.start) > st) return t;
      const c = t.constraint ?? "ASAP";
      if (c === "MSO" || c === "MFO") return t;
      if (c === "SNET" && t.constraintDate && t.constraintDate >= resume) return t;
      return { ...t, constraint: "SNET" as const, constraintDate: resume };
    }
    // Started: remaining work goes after the status date.
    const start = t.actualStart ?? t.start;
    const tc = new TaskCal(cal, t.elapsed, t.interruptions);
    const s = dayNum(start);
    const remaining = Math.ceil(dur * (1 - t.progress / 100));
    const doneDays = dur - remaining;
    const workedUntilStatus = tc.workDaysIn(s, st + 1).length;
    if (doneDays >= workedUntilStatus) return t; // on time or ahead
    const newDuration = workedUntilStatus + remaining;
    return newDuration !== t.duration ? { ...t, duration: newDuration, actualStart: start } : t;
  });
  return { ...project, tasks };
}

export interface EvValues {
  date: string;
  bac: number;
  pv: number;
  /** Planned value using the current dates instead of the baseline. */
  pvCurrent: number;
  ev: number;
  ac: number;
  certified: number;
  sv: number;
  spi: number | null;
  cv: number | null;
  cpi: number | null;
  eac: number | null;
}

/** Earned value at a date. PV uses the active baseline (or the current schedule when there is
 * none), spread evenly over the task's working days. EV = physical progress × baseline
 * amount. AC = actual cost entries up to the date. */
export function earnedValueAt(project: Project, dateISO: string): EvValues {
  const cal = projectCal(project);
  const leaves = leafSet(project);
  const baseline = activeBaseline(project);
  const date = dayNum(dateISO);
  let bac = 0;
  let pv = 0;
  let pvCurrent = 0;
  let ev = 0;
  let certified = 0;
  for (const t of project.tasks) {
    if (!leaves.has(t.id)) continue;
    const cost = taskCost(t, project);
    const b = baseline?.tasks[t.id];
    const bc = b ? b.cost : cost;
    const tc = new TaskCal(cal, t.elapsed, t.interruptions);
    const dur = effectiveDuration(t, project, cal);
    const curStart = t.actualStart ?? t.start;
    const curFinish = taskFinishISO(t, project, cal);
    bac += bc;
    if (b) pv += bc * plannedFraction(tc, b.start, b.finish, b.duration, date);
    pvCurrent += cost * plannedFraction(tc, curStart, curFinish, dur, date);
    ev += bc * (Math.min(100, t.progress) / 100);
    certified += cost * ((t.certified ?? 0) / 100);
  }
  if (!baseline) pv = pvCurrent;
  if (baseline) bac = baseline.total || bac;
  const ac = (project.actualCosts ?? [])
    .filter((c) => c.date <= dateISO)
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const cpi = ac > 0 ? ev / ac : null;
  return {
    date: dateISO,
    bac,
    pv,
    pvCurrent,
    ev,
    ac,
    certified,
    sv: ev - pv,
    spi: pv > 0 ? ev / pv : null,
    cv: ac > 0 ? ev - ac : null,
    cpi,
    eac: cpi && cpi > 0 ? bac / cpi : null,
  };
}

/** "Registrar avance": photo of PV / EV / AC at the status date (replaces an existing photo
 * of the same date). */
export function recordSnapshot(project: Project): Project {
  const date = project.schedule?.statusDate;
  if (!date) return project;
  const v = earnedValueAt(project, date);
  const snap: EvSnapshot = {
    id: uuid(),
    date,
    createdAt: new Date().toISOString(),
    bac: v.bac,
    pv: v.pv,
    ev: v.ev,
    ac: v.ac,
    certified: v.certified,
  };
  const others = (project.evSnapshots ?? []).filter((s) => s.date !== date);
  return {
    ...project,
    evSnapshots: [...others, snap].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
