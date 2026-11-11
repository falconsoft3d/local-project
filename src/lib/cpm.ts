import { Cal, TaskCal, dayNum, isoOf } from "./calendar";
import { expandLinks, type ExpandedLink } from "./links";
import type { ID, Link, Project, Task } from "./types";

/** Critical Path Method engine.
 *
 * Works on leaf tasks only (summary tasks span their children). Times are integer "moments"
 * (see calendar.ts): a task working days [S..F] starts at moment S and finishes at F + 1.
 *
 * Supports FS/SS/FF/SF links with lags in working days, elapsed days or % of the
 * predecessor; the eight MS Project constraints; deadlines; interruptions; elapsed
 * durations; actual start/finish (started tasks never move); resource-leveling delays;
 * scheduling from the project start (ASAP) or from the project finish (ALAP). */

export interface CpmTaskResult {
  /** Scheduled start / finish moments (current or newly applied position). */
  s: number;
  f: number;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  /** Total and free float in working days. */
  tf: number;
  ff: number;
  critical: boolean;
  milestone: boolean;
  /** Milestone displayed at the end of the previous day (it follows a finish). */
  endAnchored: boolean;
}

export interface CpmResult {
  byId: Map<ID, CpmTaskResult>;
  projectStart: number;
  projectFinish: number;
  /** Leaf ids involved in a dependency cycle (their looping links are ignored). */
  cyclic: Set<ID>;
}

const NEG = -1e9;
const POS = 1e9;

export function projectCal(project: Project): Cal {
  return new Cal(project.schedule?.calendar);
}

/** Duration in working days for a leaf task, applying the project's duration type. */
export function effectiveDuration(task: Task, project: Project, cal?: Cal): number {
  if (isPerformanceDriven(task, project)) {
    const hpd = task.hoursPerDay && task.hoursPerDay > 0 ? task.hoursPerDay : (cal ?? projectCal(project)).hoursPerDay;
    const days =
      task.performanceUnit === "hour"
        ? task.quantity! / task.performance! / hpd
        : task.quantity! / task.performance!;
    return Math.max(1, Math.ceil(days - 1e-9));
  }
  return Math.max(0, task.duration);
}

export function isPerformanceDriven(task: Task, project: Project): boolean {
  return (
    project.schedule?.durationType === "performance" &&
    !!task.performance &&
    task.performance > 0 &&
    !!task.quantity &&
    task.quantity > 0
  );
}

interface Node {
  id: ID;
  task: Task;
  tc: TaskCal;
  dur: number;
  milestone: boolean;
  finished: boolean;
  started: boolean;
  preds: ExpandedLink[];
  succs: ExpandedLink[];
  /** Has a finish-type incoming link (FS/FF): milestone sits at the end of a day. */
  finishAnchored: boolean;
}

function buildNodes(project: Project, cal: Cal) {
  const tasks = project.tasks;
  const parentIds = new Set(tasks.map((t) => t.parentId).filter(Boolean) as ID[]);
  const leaves = tasks.filter((t) => !parentIds.has(t.id));
  const edges = expandLinks(tasks);
  const nodes = new Map<ID, Node>();
  for (const t of leaves) {
    const dur = effectiveDuration(t, project, cal);
    const finished = !!t.actualFinish || (t.progress >= 100 && !!t.actualStart);
    nodes.set(t.id, {
      id: t.id,
      task: t,
      tc: new TaskCal(cal, t.elapsed, t.interruptions),
      dur,
      milestone: dur === 0,
      finished,
      started: !!t.actualStart || finished,
      preds: [],
      succs: [],
      finishAnchored: false,
    });
  }
  for (const e of edges) {
    const p = nodes.get(e.predecessorId);
    const s = nodes.get(e.successorId);
    if (!p || !s) continue;
    p.succs.push(e);
    s.preds.push(e);
    if (e.type === "FS" || e.type === "FF") s.finishAnchored = true;
  }

  // Kahn topological order; nodes left over are in cycles.
  const indeg = new Map<ID, number>();
  nodes.forEach((n) => indeg.set(n.id, n.preds.length));
  const queue: ID[] = [];
  for (const t of leaves) if (indeg.get(t.id) === 0) queue.push(t.id);
  const order: ID[] = [];
  const seen = new Set<ID>();
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    seen.add(id);
    for (const e of nodes.get(id)!.succs) {
      const d = indeg.get(e.successorId)! - 1;
      indeg.set(e.successorId, d);
      if (d === 0) queue.push(e.successorId);
    }
  }
  const cyclic = new Set<ID>();
  for (const t of leaves) {
    if (!seen.has(t.id)) {
      cyclic.add(t.id);
      order.push(t.id);
    }
  }
  return { nodes, order, cyclic };
}

/** Moment of a stored task (current position). */
function currentMoments(n: Node): { s: number; f: number } {
  const t = n.task;
  if (n.finished) {
    const s = n.milestone ? milestoneMoment(n, t.actualStart ?? t.start) : dayNum(t.actualStart ?? t.start);
    const f = t.actualFinish && !n.milestone ? dayNum(t.actualFinish) + 1 : n.tc.finishOf(s, n.dur);
    return { s, f: Math.max(s, f) };
  }
  if (n.milestone) {
    const m = milestoneMoment(n, t.actualStart ?? t.start);
    return { s: m, f: m };
  }
  const s = dayNum(t.actualStart ?? t.start);
  return { s, f: n.tc.finishOf(s, n.dur) };
}

/** A milestone that follows a finish (FS/FF link or "Must finish on") sits at the end of
 * its day; otherwise at the beginning. */
function isEndAnchored(n: Node): boolean {
  const c = n.task.constraint;
  if (c === "MFO") return true;
  if (c === "MSO") return false;
  return n.finishAnchored;
}

function milestoneMoment(n: Node, iso: string): number {
  const d = dayNum(iso);
  return isEndAnchored(n) ? d + 1 : d;
}

/** ISO date a milestone moment is displayed on. */
function milestoneDay(m: number, endAnchored: boolean): number {
  return endAnchored ? m - 1 : m;
}

function shift(cal: Cal, m: number, lag: number, unit: Link["lagUnit"], predDur: number, predElapsed: boolean): number {
  if (!lag) return m;
  if (unit === "ed") return m + Math.round(lag);
  const days = unit === "pct" ? Math.round((lag / 100) * predDur) : Math.round(lag);
  if (unit === "pct" && predElapsed) return m + days;
  return cal.shiftWork(m, days);
}

/** Smallest finish moment ≥ m that is the end of a working day of the task. */
function snapFinishUp(tc: TaskCal, m: number): number {
  let d = m;
  for (let i = 0; i < 4000 && !tc.isWork(d - 1); i++) d++;
  return d;
}

/** Largest start moment ≤ m that is the beginning of a working day of the task. */
function snapStartDown(tc: TaskCal, m: number): number {
  let d = m;
  for (let i = 0; i < 4000 && !tc.isWork(d); i++) d--;
  return d;
}

interface PassOptions {
  projectStart: number;
  /** Extra earliest-start floors (ALAP second pass). */
  floors?: Map<ID, number>;
  /** Use the stored position for every task (analysis without moving anything). */
  fixed?: boolean;
}

function forwardPass(
  cal: Cal,
  nodes: Map<ID, Node>,
  order: ID[],
  opts: PassOptions,
): Map<ID, { s: number; f: number; endAnchored: boolean }> {
  const res = new Map<ID, { s: number; f: number; endAnchored: boolean }>();
  for (const id of order) {
    const n = nodes.get(id)!;
    const t = n.task;
    if (n.started) {
      const cur = currentMoments(n);
      res.set(id, { ...cur, endAnchored: isEndAnchored(n) });
      continue;
    }
    let sb = opts.projectStart;
    let fb = NEG;
    for (const e of n.preds) {
      const p = res.get(e.predecessorId);
      if (!p) continue; // cyclic edge: ignored
      const pn = nodes.get(e.predecessorId)!;
      const base = e.type === "FS" || e.type === "FF" ? p.f : p.s;
      const m = shift(cal, base, e.lag, e.lagUnit, pn.dur, !!pn.task.elapsed);
      if (e.type === "FS" || e.type === "SS") {
        sb = Math.max(sb, m);
      } else {
        fb = Math.max(fb, m);
      }
    }
    const c = t.constraint ?? "ASAP";
    const cd = t.constraintDate ? dayNum(t.constraintDate) : null;
    if (c === "SNET" && cd !== null) sb = Math.max(sb, cd);
    if (c === "FNET" && cd !== null) fb = Math.max(fb, cd + 1);
    if (t.levelingStart) sb = Math.max(sb, dayNum(t.levelingStart));
    const floor = opts.floors?.get(id);
    if (floor !== undefined) sb = Math.max(sb, floor);

    let s: number;
    let f: number;
    const endAnchored = n.milestone && isEndAnchored(n);
    if (n.milestone) {
      s = Math.max(sb, fb);
      if (c === "MSO" && cd !== null) s = cd;
      if (c === "MFO" && cd !== null) s = cd + 1;
      if (c === "SNLT" && cd !== null && s > cd) s = cd;
      if (c === "FNLT" && cd !== null && s > cd + 1) s = cd + 1;
      f = s;
    } else {
      s = n.tc.snapStart(sb);
      if (fb > NEG) s = Math.max(s, n.tc.startOf(snapFinishUp(n.tc, fb), n.dur));
      if (c === "MSO" && cd !== null) s = n.tc.snapStart(cd);
      if (c === "MFO" && cd !== null) s = n.tc.startOf(snapFinishUp(n.tc, cd + 1), n.dur);
      if (c === "SNLT" && cd !== null && s > cd) s = snapStartDown(n.tc, cd);
      f = n.tc.finishOf(s, n.dur);
      if (c === "FNLT" && cd !== null && f > cd + 1) {
        s = n.tc.startOf(n.tc.snapFinish(cd + 1), n.dur);
        f = n.tc.finishOf(s, n.dur);
      }
    }
    if (opts.fixed) {
      const cur = currentMoments(n);
      res.set(id, { s: cur.s, f: cur.f, endAnchored });
    } else {
      res.set(id, { s, f, endAnchored });
    }
  }
  return res;
}

/** Earliest positions only (no fixed tasks), used to compute ES/EF for floats. */
function earlyPass(cal: Cal, nodes: Map<ID, Node>, order: ID[], projectStart: number, floors?: Map<ID, number>) {
  return forwardPass(cal, nodes, order, { projectStart, floors });
}

function backwardPass(
  cal: Cal,
  nodes: Map<ID, Node>,
  order: ID[],
  projectFinish: number,
  positions: Map<ID, { s: number; f: number }>,
  withDeadlines = true,
): Map<ID, { ls: number; lf: number }> {
  const res = new Map<ID, { ls: number; lf: number }>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const n = nodes.get(id)!;
    const t = n.task;
    if (n.finished) {
      const p = positions.get(id)!;
      res.set(id, { ls: p.s, lf: p.f });
      continue;
    }
    let lfb = projectFinish;
    let lsb = POS;
    for (const e of n.succs) {
      const q = res.get(e.successorId);
      if (!q) continue;
      const base = e.type === "FS" || e.type === "SS" ? q.ls : q.lf;
      const m = shift(cal, base, -e.lag, e.lagUnit, n.dur, !!t.elapsed);
      if (e.type === "FS" || e.type === "FF") lfb = Math.min(lfb, m);
      else lsb = Math.min(lsb, m);
    }
    const c = t.constraint ?? "ASAP";
    const cd = t.constraintDate ? dayNum(t.constraintDate) : null;
    if ((c === "MSO" || c === "SNLT") && cd !== null) lsb = Math.min(lsb, cd);
    if ((c === "MFO" || c === "FNLT") && cd !== null) lfb = Math.min(lfb, cd + 1);
    // A deadline warns (negative float) but never moves the task.
    if (withDeadlines && t.deadline) lfb = Math.min(lfb, dayNum(t.deadline) + 1);

    let ls: number;
    let lf: number;
    if (n.milestone) {
      ls = lf = Math.min(lfb, lsb);
    } else {
      lf = n.tc.snapFinish(lfb);
      if (lsb < POS) lf = Math.min(lf, n.tc.finishOf(snapStartDown(n.tc, lsb), n.dur));
      ls = n.tc.startOf(lf, n.dur);
    }
    res.set(id, { ls, lf });
  }
  return res;
}

function freeFloat(
  cal: Cal,
  n: Node,
  positions: Map<ID, { s: number; f: number }>,
  tf: number,
): number {
  if (n.succs.length === 0) return tf;
  const own = positions.get(n.id)!;
  let ff = POS;
  for (const e of n.succs) {
    const q = positions.get(e.successorId);
    if (!q) continue;
    const base = e.type === "FS" || e.type === "SS" ? q.s : q.f;
    const m = shift(cal, base, -e.lag, e.lagUnit, n.dur, !!n.task.elapsed);
    const slack = e.type === "FS" || e.type === "FF" ? cal.workDiff(own.f, m) : cal.workDiff(own.s, m);
    ff = Math.min(ff, slack);
  }
  return ff === POS ? tf : Math.min(ff, tf);
}

function projectStartMoment(project: Project, nodes: Map<ID, Node>, cal: Cal): number {
  const sd = project.schedule?.startDate;
  if (sd) return cal.nextWork(dayNum(sd));
  let min = POS;
  nodes.forEach((n) => {
    min = Math.min(min, dayNum(n.task.actualStart ?? n.task.start));
  });
  return min === POS ? cal.nextWork(dayNum(isoOf(Math.floor(Date.now() / 86400000)))) : min;
}

/** Runs CPM. With `apply`, tasks are placed at their early dates (or late dates when
 * scheduling from the finish / ALAP); otherwise the current positions are kept and floats
 * are measured against them. */
export function runCpm(project: Project, apply: boolean): CpmResult {
  const cal = projectCal(project);
  const { nodes, order, cyclic } = buildNodes(project, cal);
  const fromFinish = project.schedule?.scheduleFrom === "finish";
  const pStart = projectStartMoment(project, nodes, cal);

  const early = earlyPass(cal, nodes, order, pStart);
  let positions: Map<ID, { s: number; f: number; endAnchored: boolean }>;
  let late: Map<ID, { ls: number; lf: number }>;
  let pFinish: number;
  let earlyFinishMode: Map<ID, { s: number; f: number; endAnchored: boolean }> | null = null;

  const maxF = (m: Map<ID, { f: number }>) => {
    let v = NEG;
    m.forEach((x) => (v = Math.max(v, x.f)));
    return v === NEG ? pStart : v;
  };

  if (fromFinish) {
    const fd = project.schedule?.finishDate;
    pFinish = fd ? dayNum(fd) + 1 : maxF(early);
    if (apply) {
      // Place everything as late as possible: backward pass on the early positions' graph.
      const placement = backwardPass(cal, nodes, order, pFinish, early, false);
      late = backwardPass(cal, nodes, order, pFinish, early);
      positions = new Map();
      for (const id of order) {
        const n = nodes.get(id)!;
        if (n.started) {
          const cur = currentMoments(n);
          positions.set(id, { ...cur, endAnchored: n.milestone && isEndAnchored(n) });
        } else {
          const l = placement.get(id)!;
          positions.set(id, { s: l.ls, f: l.lf, endAnchored: n.milestone && isEndAnchored(n) });
        }
      }
    } else {
      positions = forwardPass(cal, nodes, order, { projectStart: pStart, fixed: true });
      late = backwardPass(cal, nodes, order, pFinish, positions);
    }
    // Early dates measured from the project start (or the earliest placed task).
    let minS = POS;
    positions.forEach((p) => (minS = Math.min(minS, p.s)));
    const fStart = project.schedule?.startDate ? pStart : minS === POS ? pStart : minS;
    earlyFinishMode = forwardPass(cal, nodes, order, { projectStart: fStart });
  } else {
    if (apply) {
      positions = early;
      pFinish = maxF(positions);
      late = backwardPass(cal, nodes, order, pFinish, positions);
      // ALAP tasks: move to their late start, then re-run the passes so successors follow.
      const floors = new Map<ID, number>();
      const alapLate = backwardPass(cal, nodes, order, pFinish, positions, false);
      nodes.forEach((n) => {
        if (!n.started && n.task.constraint === "ALAP") {
          const l = alapLate.get(n.id)!;
          floors.set(n.id, l.ls);
        }
      });
      if (floors.size) {
        positions = forwardPass(cal, nodes, order, { projectStart: pStart, floors });
        pFinish = maxF(positions);
        late = backwardPass(cal, nodes, order, pFinish, positions);
      }
    } else {
      positions = forwardPass(cal, nodes, order, { projectStart: pStart, fixed: true });
      pFinish = Math.max(maxF(positions), maxF(early));
      late = backwardPass(cal, nodes, order, pFinish, positions);
    }
  }

  const byId = new Map<ID, CpmTaskResult>();
  for (const id of order) {
    const n = nodes.get(id)!;
    const p = positions.get(id)!;
    const e = (earlyFinishMode ?? early).get(id) ?? p;
    const l = late.get(id)!;
    // From the start: float = late start − scheduled start. From the finish (tasks sit at
    // their late dates): float = late start − early start, or negative when a task is
    // placed beyond its late start.
    const tf = earlyFinishMode
      ? p.s > l.ls
        ? cal.workDiff(p.s, l.ls)
        : cal.workDiff(e.s, l.ls)
      : cal.workDiff(p.s, l.ls);
    const ff = freeFloat(cal, n, positions, tf);
    byId.set(id, {
      s: p.s,
      f: p.f,
      es: e.s,
      ef: e.f,
      ls: l.ls,
      lf: l.lf,
      tf: n.finished ? 0 : tf,
      ff: n.finished ? 0 : ff,
      critical: !n.finished && tf <= 0,
      milestone: n.milestone,
      endAnchored: p.endAnchored,
    });
  }
  return { byId, projectStart: pStart, projectFinish: pFinish, cyclic };
}

/** Converts CPM moments to ISO dates for display. */
export function momentsToDates(r: CpmTaskResult): { start: string; finish: string } {
  if (r.milestone) {
    const d = isoOf(milestoneDay(r.s, r.endAnchored));
    return { start: d, finish: d };
  }
  return { start: isoOf(r.s), finish: isoOf(r.f - 1) };
}

export function lateDates(r: CpmTaskResult): { start: string; finish: string } {
  if (r.milestone) {
    const d = isoOf(milestoneDay(r.ls, r.endAnchored));
    return { start: d, finish: d };
  }
  return { start: isoOf(r.ls), finish: isoOf(r.lf - 1) };
}

export function earlyDates(r: CpmTaskResult): { start: string; finish: string } {
  if (r.milestone) {
    const d = isoOf(milestoneDay(r.es, r.endAnchored));
    return { start: d, finish: d };
  }
  return { start: isoOf(r.es), finish: isoOf(r.ef - 1) };
}

/** Programs the whole project ("Programar"): every leaf task moves to the date its links,
 * constraints and calendar allow. In performance mode, durations are refreshed from
 * quantity ÷ performance first. Never changes quantities, prices or amounts. */
export function scheduleProject(project: Project): Project {
  const cal = projectCal(project);
  const parentIds = new Set(project.tasks.map((t) => t.parentId).filter(Boolean) as ID[]);
  let tasks = project.tasks.map((t) => {
    if (parentIds.has(t.id)) return t;
    const d = effectiveDuration(t, project, cal);
    return d !== t.duration ? { ...t, duration: d } : t;
  });
  const withDur = { ...project, tasks };
  const result = runCpm(withDur, true);
  tasks = tasks.map((t) => {
    const r = result.byId.get(t.id);
    if (!r) return t;
    const { start } = momentsToDates(r);
    return start !== t.start ? { ...t, start } : t;
  });
  return { ...project, tasks };
}

/** Light propagation used after interactive edits when automatic scheduling is off for the
 * form: same as scheduleProject (the Gantt always moves successors). Kept as a separate
 * name so call sites read clearly. */
export const propagateSchedule = scheduleProject;
