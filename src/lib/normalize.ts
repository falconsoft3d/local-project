import { defaultCalendar } from "./calendar";
import { linksFromIds } from "./links";
import type { Link, Project, ScheduleSettings, Task, WorkCalendar } from "./types";

/** Brings any project (old browser storage, old JSON exports, fresh imports) to the current
 * shape: Link objects instead of `predecessorIds`, scheduling settings with a calendar, etc.
 * Idempotent. */

function normalizeCalendar(c: Partial<WorkCalendar> | undefined): WorkCalendar {
  const base = defaultCalendar();
  if (!c) return base;
  return {
    name: c.name || base.name,
    workDays:
      Array.isArray(c.workDays) && c.workDays.length === 7 ? c.workDays.map(Boolean) : base.workDays,
    dayStart: c.dayStart || base.dayStart,
    dayEnd: c.dayEnd || base.dayEnd,
    hoursPerDay: Number(c.hoursPerDay) > 0 ? Number(c.hoursPerDay) : base.hoursPerDay,
    holidays: Array.isArray(c.holidays) ? c.holidays.filter((h) => h && h.from) : [],
  };
}

function normalizeLinks(raw: unknown, legacy: unknown): Link[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((l) => l && typeof l.predecessorId === "string")
      .map((l) => ({
        predecessorId: l.predecessorId,
        type: ["FS", "SS", "FF", "SF"].includes(l.type) ? l.type : "FS",
        lag: Number(l.lag) || 0,
        lagUnit: ["wd", "ed", "pct"].includes(l.lagUnit) ? l.lagUnit : "wd",
      }));
  }
  return linksFromIds(Array.isArray(legacy) ? (legacy as string[]) : []);
}

export function normalizeTask(raw: Task & { predecessorIds?: string[] }): Task {
  const { predecessorIds, ...rest } = raw;
  return {
    ...rest,
    name: typeof raw.name === "string" ? raw.name : "",
    start: typeof raw.start === "string" && raw.start ? raw.start.slice(0, 10) : new Date().toISOString().slice(0, 10),
    duration: Math.max(0, Number(raw.duration) || 0),
    progress: Math.min(100, Math.max(0, Number(raw.progress) || 0)),
    parentId: raw.parentId ?? null,
    resourceIds: Array.isArray(raw.resourceIds) ? raw.resourceIds : [],
    predecessors: normalizeLinks(raw.predecessors, predecessorIds),
  };
}

export function defaultScheduleSettings(partial?: Partial<ScheduleSettings>): ScheduleSettings {
  return {
    durationType: "manual",
    scheduleFrom: "start",
    autoSchedule: false,
    ...partial,
    calendar: normalizeCalendar(partial?.calendar),
  };
}

export function normalizeProject(raw: Project): Project {
  const legacy = !raw.schedule;
  let tasks = (raw.tasks ?? []).map((t) => normalizeTask(t as Task & { predecessorIds?: string[] }));
  const schedule = defaultScheduleSettings(raw.schedule);

  if (legacy && tasks.length) {
    // Older projects had no project start: tasks without predecessors simply sat on their
    // own date. Keep that layout under CPM by anchoring the project start on the earliest
    // task and giving later unlinked tasks a "Start No Earlier Than" on their current date.
    const parentIds = new Set(tasks.map((t) => t.parentId).filter(Boolean));
    const leaves = tasks.filter((t) => !parentIds.has(t.id));
    const minStart = leaves.reduce((m, t) => (t.start < m ? t.start : m), leaves[0]?.start ?? tasks[0].start);
    schedule.startDate = schedule.startDate ?? minStart;
    tasks = tasks.map((t) =>
      !parentIds.has(t.id) && t.predecessors.length === 0 && t.start > minStart && !t.constraint
        ? { ...t, constraint: "SNET", constraintDate: t.start }
        : t,
    );
  }

  return {
    ...raw,
    tasks,
    resources: Array.isArray(raw.resources) ? raw.resources : [],
    schedule,
    baselines: Array.isArray(raw.baselines) ? raw.baselines : [],
    evSnapshots: Array.isArray(raw.evSnapshots) ? raw.evSnapshots : [],
    actualCosts: Array.isArray(raw.actualCosts) ? raw.actualCosts : [],
  };
}
