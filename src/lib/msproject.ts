import { v4 as uuid } from "uuid";
import { RESOURCE_COLORS } from "./colors";
import { getComputedTasks, activeBaseline, projectDateRange, taskCost, toISO } from "./schedule";
import { Cal, dayNum, defaultCalendar, isoOf } from "./calendar";
import { insertAsLastChild } from "./tree";
import type {
  Baseline,
  BaselineTask,
  ConstraintType,
  Holiday,
  ID,
  LagUnit,
  Link,
  LinkType,
  Project,
  Resource,
  ScheduleSettings,
  Task,
  WorkCalendar,
} from "./types";

/** Microsoft Project XML (MSPDI) import / export.
 *
 * Export patches the project's original XML when it came from MS Project (untouched data
 * survives byte-for-byte) and otherwise starts from a minimal MSPDI skeleton and runs the
 * same patch path. Everything the scheduling module knows travels: hierarchy, dates,
 * durations (incl. elapsed), milestones, FS/SS/FF/SF links with lags in days, elapsed days
 * or %, constraints, deadline, progress, actual dates, calendar with holidays, baseline 0,
 * resources (max units, rate) and assignments. New elements are inserted in schema order so
 * MS Project accepts the file. */

const NS = "http://schemas.microsoft.com/project";

// ---------------------------------------------------------------------------------------
// Durations and small helpers

function parsePTDuration(pt: string): number {
  const m = /^-?PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(pt.trim());
  if (!m) return 0;
  const h = parseFloat(m[1] || "0");
  const mi = parseFloat(m[2] || "0");
  const s = parseFloat(m[3] || "0");
  return h * 60 + mi + s / 60;
}

function formatPTDuration(totalMinutes: number): string {
  const totalSeconds = Math.max(0, Math.round(totalMinutes * 60));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `PT${h}H${m}M${s}S`;
}

function timeOf(dt: string | undefined | null, fallback: string): string {
  if (!dt) return fallback;
  const t = dt.split("T")[1];
  return t || fallback;
}

/** "08:00" → "08:00:00". */
function hms(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${(h ?? "08").padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}:00`;
}

function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function hhmmFromMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function datePart(dt: string | undefined | null): string | undefined {
  if (!dt || dt === "NA") return undefined;
  const d = dt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Elapsed duration formats (em, eh, ed, ew, emo, e% and their "estimated" variants). */
const ELAPSED_FORMATS = new Set([4, 6, 8, 10, 12, 20, 36, 38, 40, 42, 44, 54]);
const PERCENT_FORMATS = new Set([19, 20, 51, 52, 53, 54]);

const LINK_TYPE_FROM: Record<string, LinkType> = { "0": "FF", "1": "FS", "2": "SF", "3": "SS" };
const LINK_TYPE_TO: Record<LinkType, string> = { FF: "0", FS: "1", SF: "2", SS: "3" };

const CONSTRAINT_FROM: Record<string, ConstraintType> = {
  "0": "ASAP",
  "1": "ALAP",
  "2": "MSO",
  "3": "MFO",
  "4": "SNET",
  "5": "SNLT",
  "6": "FNET",
  "7": "FNLT",
};
const CONSTRAINT_TO: Record<ConstraintType, string> = {
  ASAP: "0",
  ALAP: "1",
  MSO: "2",
  MFO: "3",
  SNET: "4",
  SNLT: "5",
  FNET: "6",
  FNLT: "7",
};
const DATED_CONSTRAINTS = new Set<ConstraintType>(["MSO", "MFO", "SNET", "SNLT", "FNET", "FNLT"]);
const FINISH_CONSTRAINTS = new Set<ConstraintType>(["MFO", "FNET", "FNLT"]);

// ---------------------------------------------------------------------------------------
// DOM helpers (direct children only — <Baseline> and <PredecessorLink> also contain
// <Start>, <Finish>, <Duration>…)

function kids(parent: Element): Element[] {
  return Array.from(parent.children);
}

function child(parent: Element | null | undefined, tag: string): Element | undefined {
  if (!parent) return undefined;
  return kids(parent).find((c) => c.localName === tag);
}

function childrenNamed(parent: Element | null | undefined, tag: string): Element[] {
  if (!parent) return [];
  return kids(parent).filter((c) => c.localName === tag);
}

function ctext(parent: Element | null | undefined, tag: string, fallback = ""): string {
  return child(parent, tag)?.textContent?.trim() ?? fallback;
}

/** Element orders from the MSPDI schema (sequences): new elements are inserted before the
 * first sibling that comes later in the sequence. */
const PROJECT_ORDER = [
  "SaveVersion", "UID", "Name", "Title", "Subject", "Category", "Company", "Manager", "Author",
  "CreationDate", "Revision", "LastSaved", "ScheduleFromStart", "StartDate", "FinishDate",
  "FYStartDate", "CriticalSlackLimit", "CurrencyDigits", "CurrencySymbol", "CurrencyCode",
  "CurrencySymbolPosition", "CalendarUID", "DefaultStartTime", "DefaultFinishTime",
  "MinutesPerDay", "MinutesPerWeek", "DaysPerMonth", "DefaultTaskType",
  "DefaultFixedCostAccrual", "DefaultStandardRate", "DefaultOvertimeRate", "DurationFormat",
  "WorkFormat", "EditableActualCosts", "HonorConstraints", "EarnedValueMethod",
  "InsertedProjectsLikeSummary", "MultipleCriticalPaths", "NewTasksEffortDriven",
  "NewTasksEstimated", "SplitsInProgressTasks", "SpreadActualCost", "SpreadPercentComplete",
  "TaskUpdatesResource", "FiscalYearStart", "WeekStartDay", "MoveCompletedEndsBack",
  "MoveRemainingStartsBack", "MoveRemainingStartsForward", "MoveCompletedEndsForward",
  "BaselineForEarnedValue", "AutoAddNewResourcesAndTasks", "StatusDate", "CurrentDate",
  "MicrosoftProjectServerURL", "Autolink", "NewTaskStartDate", "NewTasksAreManual",
  "DefaultTaskEVMethod", "ProjectExternallyEdited", "ExtendedCreationDate", "ActualsInSync",
  "RemoveFileProperties", "AdminProject", "UpdateManuallyScheduledTasksWhenEditingLinks",
  "KeepTaskOnNearestWorkingTimeWhenMadeAutoScheduled", "OutlineCodes", "WBSMasks",
  "ExtendedAttributes", "Calendars", "Tasks", "Resources", "Assignments",
];

const TASK_ORDER = [
  "UID", "ID", "Name", "Type", "IsNull", "CreateDate", "Contact", "WBS", "WBSLevel",
  "OutlineNumber", "OutlineLevel", "Priority", "Start", "Finish", "Duration", "ManualStart",
  "ManualFinish", "ManualDuration", "DurationFormat", "Work", "Stop", "Resume", "ResumeValid",
  "EffortDriven", "Recurring", "OverAllocated", "Estimated", "Milestone", "Summary",
  "DisplayAsSummary", "Critical", "IsSubproject", "IsSubprojectReadOnly", "SubprojectName",
  "ExternalTask", "ExternalTaskProject", "EarlyStart", "EarlyFinish", "LateStart",
  "LateFinish", "StartVariance", "FinishVariance", "WorkVariance", "FreeSlack", "TotalSlack",
  "StartSlack", "FinishSlack", "FixedCost", "FixedCostAccrual", "PercentComplete",
  "PercentWorkComplete", "Cost", "OvertimeCost", "OvertimeWork", "ActualStart",
  "ActualFinish", "ActualDuration", "ActualCost", "ActualOvertimeCost", "ActualWork",
  "ActualOvertimeWork", "RegularWork", "RemainingDuration", "RemainingCost", "RemainingWork",
  "RemainingOvertimeCost", "RemainingOvertimeWork", "ACWP", "CV", "ConstraintType",
  "CalendarUID", "ConstraintDate", "Deadline", "LevelAssignments", "LevelingCanSplit",
  "LevelingDelay", "LevelingDelayFormat", "PreLeveledStart", "PreLeveledFinish", "Hyperlink",
  "HyperlinkAddress", "HyperlinkSubAddress", "IgnoreResourceCalendar", "Notes", "HideBar",
  "Rollup", "BCWS", "BCWP", "PhysicalPercentComplete", "EarnedValueMethod", "PredecessorLink",
  "StartDriver", "Active", "Manual", "IsPublished", "StatusManager", "CommitmentStart",
  "CommitmentFinish", "CommitmentType", "ExtendedAttribute", "Baseline", "OutlineCode",
  "TimephasedData",
];

const RESOURCE_ORDER = [
  "UID", "ID", "Name", "Type", "IsNull", "Initials", "Phonetics", "NTAccount", "MaterialLabel",
  "Code", "Group", "WorkGroup", "EmailAddress", "Hyperlink", "HyperlinkAddress",
  "HyperlinkSubAddress", "MaxUnits", "PeakUnits", "OverAllocated", "AvailableFrom",
  "AvailableTo", "Start", "Finish", "CanLevel", "AccrueAt", "Work", "RegularWork",
  "OvertimeWork", "ActualWork", "RemainingWork", "ActualOvertimeWork", "RemainingOvertimeWork",
  "PercentWorkComplete", "StandardRate", "StandardRateFormat", "Cost", "OvertimeRate",
  "OvertimeRateFormat", "OvertimeCost", "CostPerUse", "ActualCost", "ActualOvertimeCost",
  "RemainingCost", "RemainingOvertimeCost", "WorkVariance", "CostVariance", "SV", "CV", "ACWP",
  "CalendarUID", "Notes", "BCWS", "BCWP", "IsGeneric", "IsInactive", "IsEnterprise",
  "BookingType", "ActualWorkProtected", "ActualOvertimeWorkProtected", "ActiveDirectoryGUID",
  "CreationDate", "CostCenter", "IsCostResource", "AssnOwner", "AssnOwnerGuid", "IsBudget",
  "ExtendedAttribute", "Baseline", "OutlineCode", "AvailabilityPeriods", "Rates",
  "TimephasedData",
];

const ASSIGNMENT_ORDER = [
  "UID", "TaskUID", "ResourceUID", "PercentWorkComplete", "ActualCost", "ActualFinish",
  "ActualOvertimeCost", "ActualOvertimeWork", "ActualStart", "ActualWork", "ACWP", "Confirmed",
  "Cost", "CostRateTable", "RateScale", "CostVariance", "CV", "Delay", "Finish",
  "FinishVariance", "Hyperlink", "HyperlinkAddress", "HyperlinkSubAddress", "WorkVariance",
  "HasFixedRateUnits", "FixedMaterial", "LevelingDelay", "LevelingDelayFormat", "LinkedFields",
  "Milestone", "Notes", "Overallocated", "OvertimeCost", "OvertimeWork", "PeakUnits",
  "RegularWork", "RemainingCost", "RemainingOvertimeCost", "RemainingOvertimeWork",
  "RemainingWork", "ResponsePending", "Start", "Stop", "Resume", "StartVariance", "Units",
  "UpdateNeeded", "VAC", "Work", "WorkContour", "BCWS", "BCWP", "BookingType",
  "ActualWorkProtected", "ActualOvertimeWorkProtected", "CreationDate", "AssnOwner",
  "AssnOwnerGuid", "BudgetCost", "BudgetWork", "ExtendedAttribute", "Baseline",
  "TimephasedData",
];

const CALENDAR_ORDER = [
  "UID", "GUID", "Name", "IsBaseCalendar", "IsBaselineCalendar", "BaseCalendarUID",
  "WeekDays", "Exceptions", "WorkWeeks",
];

class XmlPatcher {
  constructor(
    readonly doc: Document,
    readonly ns: string,
  ) {}

  create(tag: string, value?: string): Element {
    const e = this.doc.createElementNS(this.ns, tag);
    if (value !== undefined) e.textContent = value;
    return e;
  }

  /** Inserts `el` into `parent` respecting the schema order. */
  insert(parent: Element, el: Element, order: string[]) {
    const idx = order.indexOf(el.localName);
    if (idx === -1) {
      parent.appendChild(el);
      return;
    }
    const next = kids(parent).find((c) => {
      const ci = order.indexOf(c.localName);
      return ci > idx;
    });
    if (next) parent.insertBefore(el, next);
    else parent.appendChild(el);
  }

  upsert(parent: Element, tag: string, value: string, order: string[]) {
    const existing = child(parent, tag);
    if (existing) {
      if (existing.textContent !== value) existing.textContent = value;
      return existing;
    }
    const e = this.create(tag, value);
    this.insert(parent, e, order);
    return e;
  }

  remove(parent: Element, tag: string) {
    childrenNamed(parent, tag).forEach((e) => e.remove());
  }

  /** Get or create a container element (Tasks, Resources…). */
  container(parent: Element, tag: string, order: string[]): Element {
    const existing = child(parent, tag);
    if (existing) return existing;
    const e = this.create(tag);
    this.insert(parent, e, order);
    return e;
  }
}

// ---------------------------------------------------------------------------------------
// Reading

interface MspLink {
  uid: string;
  type: LinkType;
  lag: number;
  lagUnit: LagUnit;
}

export interface MspTask {
  uid: string;
  outlineLevel: number;
  name: string;
  wbs: string;
  outlineNumber: string;
  start?: string;
  durationDays: number;
  elapsed: boolean;
  milestone: boolean;
  summary: boolean;
  manual: boolean;
  links: MspLink[];
  constraint?: ConstraintType;
  constraintDate?: string;
  deadline?: string;
  percent: number;
  physical: number;
  actualStart?: string;
  actualFinish?: string;
  cost: number;
  notes?: string;
  baseline?: { start?: string; finish?: string; durationDays?: number; cost?: number };
}

interface MspResource {
  uid: string;
  name: string;
  kind: Resource["kind"];
  maxUnits?: number;
  price?: number;
  code?: string;
}

interface MspAssignment {
  taskUid: string;
  resUid: string;
  units?: number;
}

export interface MspRead {
  title: string;
  minutesPerDay: number;
  calendar: WorkCalendar | null;
  startDate?: string;
  finishDate?: string;
  statusDate?: string;
  scheduleFromStart: boolean;
  tasks: MspTask[];
  resources: MspResource[];
  assignments: MspAssignment[];
  counters: { task: number; resource: number; assignment: number };
}

export function isMsProjectXml(content: string): boolean {
  return content.includes("schemas.microsoft.com/project");
}

function parseDoc(xmlText: string): Document {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Invalid MS Project XML file.");
  }
  return doc;
}

/** Day a "finish" timestamp belongs to: a finish at or before the start of the working day
 * (e.g. "…T08:00:00") really ended the previous day. */
function finishDay(dt: string | undefined, dayStartMin: number): string | undefined {
  const d = datePart(dt);
  if (!d || !dt) return d;
  const t = dt.split("T")[1];
  if (t && minutesOfDay(t) <= dayStartMin && minutesOfDay(t) > 0) {
    return isoOf(dayNum(d) - 1);
  }
  return d;
}

/** Day a "start" timestamp belongs to: a start at or after the end of the working day
 * really begins the next day. */
function startDay(dt: string | undefined, dayEndMin: number): string | undefined {
  const d = datePart(dt);
  if (!d || !dt) return d;
  const t = dt.split("T")[1];
  if (t && minutesOfDay(t) >= dayEndMin) return isoOf(dayNum(d) + 1);
  return d;
}

function readCalendar(root: Element, minutesPerDay: number): WorkCalendar | null {
  const calendars = childrenNamed(child(root, "Calendars"), "Calendar");
  if (!calendars.length) return null;
  const projectCalUid = ctext(root, "CalendarUID", "1");
  const byUid = new Map(calendars.map((c) => [ctext(c, "UID"), c]));
  const cal =
    byUid.get(projectCalUid) ??
    calendars.find((c) => ctext(c, "IsBaseCalendar") === "1") ??
    calendars[0];

  const result = defaultCalendar();
  result.name = ctext(cal, "Name") || result.name;
  result.hoursPerDay = minutesPerDay / 60;
  const defStart = ctext(root, "DefaultStartTime");
  const defEnd = ctext(root, "DefaultFinishTime");
  if (defStart) result.dayStart = defStart.slice(0, 5);
  if (defEnd) result.dayEnd = defEnd.slice(0, 5);

  const holidays: Holiday[] = [];
  let hasWeek = false;
  let minFrom = Infinity;
  let maxTo = -Infinity;

  const readWeek = (c: Element) => {
    for (const wd of childrenNamed(child(c, "WeekDays"), "WeekDay")) {
      const type = Number(ctext(wd, "DayType", "-1"));
      const working = ctext(wd, "DayWorking") === "1";
      if (type >= 1 && type <= 7) {
        hasWeek = true;
        result.workDays[type - 1] = working;
        for (const wt of childrenNamed(child(wd, "WorkingTimes"), "WorkingTime")) {
          const from = ctext(wt, "FromTime");
          const to = ctext(wt, "ToTime");
          if (from) minFrom = Math.min(minFrom, minutesOfDay(from));
          if (to) maxTo = Math.max(maxTo, minutesOfDay(to) === 0 ? 1440 : minutesOfDay(to));
        }
      } else if (type === 0 && !working) {
        const tp = child(wd, "TimePeriod");
        const from = datePart(ctext(tp, "FromDate"));
        const to = datePart(ctext(tp, "ToDate"));
        if (from) holidays.push({ id: uuid(), from, to: to && to !== from ? to : undefined });
      }
    }
  };

  const base = byUid.get(ctext(cal, "BaseCalendarUID"));
  if (base && base !== cal) readWeek(base);
  readWeek(cal);

  for (const ex of childrenNamed(child(cal, "Exceptions"), "Exception")) {
    const working = ctext(ex, "DayWorking") === "1" || !!child(ex, "WorkingTimes");
    if (working) continue;
    const tp = child(ex, "TimePeriod");
    const from = datePart(ctext(tp, "FromDate"));
    const to = datePart(ctext(tp, "ToDate"));
    if (from) {
      holidays.push({
        id: uuid(),
        from,
        to: to && to !== from ? to : undefined,
        name: ctext(ex, "Name") || undefined,
      });
    }
  }

  if (!hasWeek) result.workDays = [...defaultCalendar().workDays];
  if (Number.isFinite(minFrom) && Number.isFinite(maxTo) && maxTo > minFrom) {
    result.dayStart = hhmmFromMinutes(minFrom);
    result.dayEnd = hhmmFromMinutes(Math.min(maxTo, 1439));
  }
  result.holidays = holidays;
  return result;
}

function readLag(link: Element, minutesPerDay: number): { lag: number; lagUnit: LagUnit } {
  const raw = Number(ctext(link, "LinkLag", "0")) || 0;
  if (!raw) return { lag: 0, lagUnit: "wd" };
  const fmt = Number(ctext(link, "LagFormat", "7"));
  if (PERCENT_FORMATS.has(fmt)) return { lag: round2(raw / 10), lagUnit: "pct" };
  const minutes = raw / 10;
  if (ELAPSED_FORMATS.has(fmt)) return { lag: round2(minutes / 1440), lagUnit: "ed" };
  return { lag: round2(minutes / minutesPerDay), lagUnit: "wd" };
}

export function readMsProjectXml(xmlText: string): MspRead {
  const doc = parseDoc(xmlText);
  const root = doc.documentElement;
  const minutesPerDay = parseFloat(ctext(root, "MinutesPerDay", "480")) || 480;
  const title = ctext(root, "Title") || ctext(root, "Name").replace(/\.xml$/i, "") || "Imported project";
  const calendar = readCalendar(root, minutesPerDay);
  const dayStartMin = minutesOfDay(calendar?.dayStart ?? ctext(root, "DefaultStartTime", "08:00"));
  const dayEndMin = minutesOfDay(calendar?.dayEnd ?? ctext(root, "DefaultFinishTime", "17:00"));

  const counters = { task: 0, resource: 0, assignment: 0 };

  const resources: MspResource[] = [];
  for (const rEl of childrenNamed(child(root, "Resources"), "Resource")) {
    const uid = ctext(rEl, "UID");
    counters.resource = Math.max(counters.resource, Number(uid) || 0);
    const name = ctext(rEl, "Name");
    if (!name || ctext(rEl, "IsNull") === "1") continue;
    const initials = ctext(rEl, "Initials").toUpperCase();
    const type = ctext(rEl, "Type", "1");
    const kind: Resource["kind"] =
      initials === "SC"
        ? "subcontract"
        : initials === "H"
        ? "labor"
        : initials === "Q"
          ? "equipment"
          : initials === "M"
            ? "material"
            : type === "0"
              ? "material"
              : "labor";
    const maxUnits = child(rEl, "MaxUnits") ? Number(ctext(rEl, "MaxUnits")) : undefined;
    const rate = child(rEl, "StandardRate") ? Number(ctext(rEl, "StandardRate")) : undefined;
    resources.push({
      uid,
      name,
      kind,
      maxUnits: maxUnits !== undefined && Number.isFinite(maxUnits) ? round2(maxUnits) : undefined,
      price: rate !== undefined && Number.isFinite(rate) && rate > 0 ? rate : undefined,
      code: ctext(rEl, "Code") || undefined,
    });
  }

  const assignments: MspAssignment[] = [];
  for (const aEl of childrenNamed(child(root, "Assignments"), "Assignment")) {
    counters.assignment = Math.max(counters.assignment, Number(ctext(aEl, "UID")) || 0);
    const units = child(aEl, "Units") ? Number(ctext(aEl, "Units")) : undefined;
    assignments.push({
      taskUid: ctext(aEl, "TaskUID"),
      resUid: ctext(aEl, "ResourceUID"),
      units: units !== undefined && Number.isFinite(units) ? units : undefined,
    });
  }

  const tasks: MspTask[] = [];
  for (const tEl of childrenNamed(child(root, "Tasks"), "Task")) {
    const uid = ctext(tEl, "UID");
    counters.task = Math.max(counters.task, Number(uid) || 0);
    if (ctext(tEl, "IsNull") === "1") continue;
    const outlineLevel = Number(ctext(tEl, "OutlineLevel", "1"));
    const fmt = Number(ctext(tEl, "DurationFormat", "7"));
    const elapsed = ELAPSED_FORMATS.has(fmt);
    const minutes = parsePTDuration(ctext(tEl, "Duration", "PT0H0M0S"));
    const milestone = ctext(tEl, "Milestone") === "1";
    const perDay = elapsed ? 1440 : minutesPerDay;
    const durationDays = milestone || minutes <= 0 ? 0 : Math.max(1, Math.ceil(minutes / perDay - 1e-6));
    const constraintCode = ctext(tEl, "ConstraintType", "0");
    const constraint = CONSTRAINT_FROM[constraintCode];
    const rawConstraintDate = ctext(tEl, "ConstraintDate");
    const constraintDate =
      constraint && DATED_CONSTRAINTS.has(constraint)
        ? FINISH_CONSTRAINTS.has(constraint)
          ? finishDay(rawConstraintDate, dayStartMin)
          : startDay(rawConstraintDate, dayEndMin)
        : undefined;

    const links: MspLink[] = childrenNamed(tEl, "PredecessorLink").map((l) => ({
      uid: ctext(l, "PredecessorUID"),
      type: LINK_TYPE_FROM[ctext(l, "Type", "1")] ?? "FS",
      ...readLag(l, minutesPerDay),
    }));

    let baseline: MspTask["baseline"];
    for (const b of childrenNamed(tEl, "Baseline")) {
      if (ctext(b, "Number", "0") !== "0") continue;
      const bMin = parsePTDuration(ctext(b, "Duration", "PT0H0M0S"));
      const bFmt = Number(ctext(b, "DurationFormat", "7"));
      const bElapsed = ELAPSED_FORMATS.has(bFmt);
      baseline = {
        start: startDay(ctext(b, "Start"), dayEndMin),
        finish: finishDay(ctext(b, "Finish"), dayStartMin),
        durationDays: bMin > 0 ? Math.ceil(bMin / (bElapsed ? 1440 : minutesPerDay) - 1e-6) : 0,
        cost: Number(ctext(b, "Cost", "0")) || 0,
      };
    }

    const start = milestone ? datePart(ctext(tEl, "Start")) : startDay(ctext(tEl, "Start"), dayEndMin);
    tasks.push({
      uid,
      outlineLevel,
      name: ctext(tEl, "Name", "Untitled"),
      wbs: ctext(tEl, "WBS"),
      outlineNumber: ctext(tEl, "OutlineNumber"),
      start,
      durationDays,
      elapsed,
      milestone,
      summary: ctext(tEl, "Summary") === "1",
      manual: ctext(tEl, "Manual") === "1",
      links,
      constraint: constraint && constraint !== "ASAP" ? constraint : undefined,
      constraintDate,
      deadline: finishDay(ctext(tEl, "Deadline"), dayStartMin),
      percent: Number(ctext(tEl, "PercentComplete", "0")) || 0,
      physical: Number(ctext(tEl, "PhysicalPercentComplete", "0")) || 0,
      actualStart: startDay(ctext(tEl, "ActualStart"), dayEndMin),
      actualFinish: finishDay(ctext(tEl, "ActualFinish"), dayStartMin),
      cost: Number(ctext(tEl, "Cost", "0")) || 0,
      notes: ctext(tEl, "Notes") || undefined,
      baseline,
    });
  }

  const statusRaw = ctext(root, "StatusDate");
  return {
    title,
    minutesPerDay,
    calendar,
    startDate: datePart(ctext(root, "StartDate")),
    finishDate: finishDay(ctext(root, "FinishDate"), dayStartMin),
    statusDate: datePart(statusRaw),
    scheduleFromStart: ctext(root, "ScheduleFromStart", "1") !== "0",
    tasks,
    resources,
    assignments,
    counters,
  };
}

/** Scheduling fields of a file task, in the app's terms. */
function taskFieldsFromFile(ft: MspTask, cal: Cal): Partial<Task> {
  const progress = Math.min(100, Math.max(0, ft.physical > 0 ? ft.physical : ft.percent));
  let start = ft.actualStart ?? ft.start ?? toISO(new Date());
  if (!ft.milestone && !ft.elapsed) start = cal.snapISO(start);
  const fields: Partial<Task> = {
    start,
    duration: ft.milestone ? 0 : ft.durationDays,
    elapsed: ft.elapsed || undefined,
    constraint: ft.constraint,
    constraintDate: ft.constraint ? ft.constraintDate : undefined,
    deadline: ft.deadline,
    progress,
    actualStart: ft.actualStart ?? (progress > 0 ? start : undefined),
    actualFinish: ft.actualFinish ?? undefined,
  };
  if (fields.actualFinish) fields.progress = 100;
  if (fields.progress === 100 && !fields.actualFinish) fields.actualFinish = undefined;
  // A manually scheduled task keeps its date under CPM: pin it with "Start No Earlier Than".
  if (ft.manual && !ft.summary && !fields.constraint && !fields.actualStart) {
    fields.constraint = "SNET";
    fields.constraintDate = start;
  }
  return fields;
}

/** Chapters (summary tasks) only keep a start date: their dates, progress and actual dates
 * roll up from their tasks. */
function summaryOrLeafFields(ft: MspTask, cal: Cal): Partial<Task> {
  const fields = taskFieldsFromFile(ft, cal);
  if (!ft.summary) return fields;
  return { start: fields.start, duration: fields.duration, progress: 0 };
}

function linksFromFile(ft: MspTask, idByUid: Map<string, ID>): Link[] {
  const out: Link[] = [];
  for (const l of ft.links) {
    const id = idByUid.get(l.uid);
    if (!id || out.some((x) => x.predecessorId === id)) continue;
    out.push({ predecessorId: id, type: l.type, lag: l.lag, lagUnit: l.lagUnit });
  }
  return out;
}

function baselineFromFile(
  r: MspRead,
  idByUid: Map<string, ID>,
  leafIds: Set<ID>,
  cal: Cal,
  name: string,
  fallbackCost?: (id: ID) => number,
): Baseline | null {
  const tasks: Record<ID, BaselineTask> = {};
  let total = 0;
  for (const ft of r.tasks) {
    const id = idByUid.get(ft.uid);
    const b = ft.baseline;
    if (!id || !b?.start || !b.finish) continue;
    const cost = b.cost || (fallbackCost && leafIds.has(id) ? fallbackCost(id) : 0);
    tasks[id] = {
      start: b.start,
      finish: b.finish < b.start ? b.start : b.finish,
      duration: b.durationDays ?? cal.workDaysInclusive(b.start, b.finish),
      cost,
    };
    if (leafIds.has(id)) total += cost;
  }
  if (!Object.keys(tasks).length) return null;
  return { id: uuid(), name, createdAt: new Date().toISOString(), tasks, total };
}

export function parseMsProjectXml(xmlText: string): Project {
  const r = readMsProjectXml(xmlText);
  const cal = new Cal(r.calendar);

  const resources: Resource[] = [];
  const resourceIdByUid = new Map<string, ID>();
  for (const mr of r.resources) {
    const id = uuid();
    resourceIdByUid.set(mr.uid, id);
    resources.push({
      id,
      name: mr.name,
      color: RESOURCE_COLORS[resources.length % RESOURCE_COLORS.length],
      kind: mr.kind,
      maxUnits: mr.maxUnits,
      price: mr.price,
      code: mr.code,
      sourceUid: mr.uid,
    });
  }

  const assignmentsByTask = new Map<string, { resId: ID; units?: number }[]>();
  for (const a of r.assignments) {
    const resId = resourceIdByUid.get(a.resUid);
    if (!resId) continue;
    const list = assignmentsByTask.get(a.taskUid) ?? [];
    if (!list.some((x) => x.resId === resId)) list.push({ resId, units: a.units });
    assignmentsByTask.set(a.taskUid, list);
  }

  const tasks: Task[] = [];
  const idByUid = new Map<string, ID>();
  const parentStack: (string | null)[] = [];
  for (const ft of r.tasks) {
    if (ft.outlineLevel <= 0) continue; // project summary task
    const depth = ft.outlineLevel - 1;
    parentStack.length = depth;
    const parentId = depth > 0 ? parentStack[depth - 1] ?? null : null;
    const id = uuid();
    parentStack[depth] = id;
    idByUid.set(ft.uid, id);

    const assigned = assignmentsByTask.get(ft.uid) ?? [];
    const resourceAssignments: Task["resourceAssignments"] = {};
    for (const a of assigned) {
      if (a.units !== undefined && a.units !== 1) resourceAssignments[a.resId] = { units: a.units };
    }
    tasks.push({
      id,
      name: ft.name,
      code: ft.wbs && ft.wbs !== ft.outlineNumber ? ft.wbs : undefined,
      parentId,
      resourceIds: assigned.map((a) => a.resId),
      resourceAssignments: Object.keys(resourceAssignments).length ? resourceAssignments : undefined,
      predecessors: [],
      notes: ft.notes,
      unitPrice: !ft.summary && ft.cost > 0 ? round2(ft.cost) : undefined,
      quantity: !ft.summary && ft.cost > 0 ? 1 : undefined,
      sourceUid: ft.uid,
      sourceDurationDays: ft.milestone ? 0 : ft.durationDays,
      progress: 0,
      duration: 0,
      start: "",
      ...summaryOrLeafFields(ft, cal),
    } as Task);
  }
  const fileByUid = new Map(r.tasks.map((ft) => [ft.uid, ft]));
  for (const t of tasks) {
    const ft = fileByUid.get(t.sourceUid!)!;
    t.predecessors = linksFromFile(ft, idByUid);
  }

  const parentIds = new Set(tasks.map((t) => t.parentId).filter(Boolean) as ID[]);
  const leafIds = new Set(tasks.filter((t) => !parentIds.has(t.id)).map((t) => t.id));
  const now = new Date().toISOString();
  const project: Project = {
    id: uuid(),
    name: r.title,
    createdAt: now,
    updatedAt: now,
    tasks,
    resources,
    schedule: {
      durationType: "manual",
      calendar: r.calendar ?? defaultCalendar(),
      scheduleFrom: r.scheduleFromStart ? "start" : "finish",
      startDate: r.startDate,
      finishDate: r.scheduleFromStart ? undefined : r.finishDate,
      autoSchedule: false,
      statusDate: r.statusDate,
    },
    source: {
      format: "msproject-xml",
      xml: xmlText,
      counters: r.counters,
    },
  };
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const baseline = baselineFromFile(r, idByUid, leafIds, cal, "Línea base 0 (MS Project)", (id) =>
    taskCost(byId.get(id)!, project),
  );
  if (baseline) {
    project.baselines = [baseline];
    project.schedule!.activeBaselineId = baseline.id;
  }
  return project;
}

// ---------------------------------------------------------------------------------------
// Import into an existing project ("Importar Gantt")

export interface MergeOptions {
  importCalendar?: boolean;
  importBaseline?: boolean;
  createMissing?: boolean;
  /** Copy % complete into the certified % (stands in for "Importar etapas"). */
  progressToCertified?: boolean;
}

export interface MergeSummary {
  updated: number;
  created: number;
  notFound: number;
}

export function mergeMsProjectXml(
  project: Project,
  xmlText: string,
  opts: MergeOptions,
): { project: Project; summary: MergeSummary } {
  const r = readMsProjectXml(xmlText);
  const cal = opts.importCalendar && r.calendar ? new Cal(r.calendar) : new Cal(project.schedule?.calendar);
  const computed = getComputedTasks(project);
  const bySourceUid = new Map<string, ID>();
  const byCode = new Map<string, ID>();
  const byWbs = new Map<string, ID>();
  for (const c of computed) {
    if (c.sourceUid) bySourceUid.set(c.sourceUid, c.id);
    if (c.displayCode) byCode.set(c.displayCode, c.id);
    if (c.wbs) byWbs.set(c.wbs, c.id);
  }
  const summaryIds = new Set(computed.filter((c) => c.isSummary).map((c) => c.id));

  let tasks = [...project.tasks];
  const idByUid = new Map<string, ID>();
  const matched = new Set<ID>();
  const created = new Set<ID>();
  let notFound = 0;
  const parentStack: (ID | null)[] = [];

  for (const ft of r.tasks) {
    if (ft.outlineLevel <= 0) continue;
    const depth = ft.outlineLevel - 1;
    parentStack.length = depth;
    let id =
      bySourceUid.get(ft.uid) ??
      (ft.wbs ? byCode.get(ft.wbs) : undefined) ??
      (ft.outlineNumber ? byWbs.get(ft.outlineNumber) : undefined) ??
      (ft.outlineNumber ? byCode.get(ft.outlineNumber) : undefined);
    if (id && matched.has(id)) id = undefined; // two file tasks resolved to the same task
    if (id) {
      matched.add(id);
    } else if (opts.createMissing) {
      const parentId = depth > 0 ? parentStack[depth - 1] ?? null : null;
      if (depth > 0 && !parentId) {
        notFound++;
        parentStack[depth] = null;
        continue;
      }
      id = uuid();
      const t: Task = {
        id,
        name: ft.name,
        code: ft.wbs && ft.wbs !== ft.outlineNumber ? ft.wbs : undefined,
        parentId,
        resourceIds: [],
        predecessors: [],
        progress: 0,
        duration: 1,
        start: cal.snapISO(project.schedule?.startDate ?? toISO(new Date())),
      };
      tasks = parentId ? insertAsLastChild(tasks, parentId, t) : [...tasks, t];
      created.add(id);
    } else {
      notFound++;
      parentStack[depth] = null;
      continue;
    }
    parentStack[depth] = id;
    idByUid.set(ft.uid, id);
  }

  const parentIds = new Set(tasks.map((t) => t.parentId).filter(Boolean) as ID[]);
  const fileByUid = new Map(r.tasks.map((ft) => [ft.uid, ft]));
  const fileTaskById = new Map<ID, MspTask>();
  idByUid.forEach((id, uid) => fileTaskById.set(id, fileByUid.get(uid)!));

  tasks = tasks.map((t) => {
    const ft = fileTaskById.get(t.id);
    if (!ft) return t;
    // Links in the file replace the task's predecessors (chapters keep theirs too).
    let next: Task = { ...t, predecessors: linksFromFile(ft, idByUid) };
    const isLeaf = !parentIds.has(t.id) && !summaryIds.has(t.id);
    if (isLeaf) {
      const fields = taskFieldsFromFile(ft, cal);
      next = { ...next, ...fields };
      if (opts.progressToCertified) next.certified = Math.min(100, Math.max(0, ft.percent));
    }
    return next;
  });

  let schedule: ScheduleSettings | undefined = project.schedule;
  if (opts.importCalendar && r.calendar && schedule) {
    schedule = { ...schedule, calendar: r.calendar };
  }

  let baselines = project.baselines ?? [];
  const merged: Project = { ...project, tasks, schedule };
  if (opts.importBaseline) {
    const leafIds = new Set(tasks.filter((t) => !parentIds.has(t.id)).map((t) => t.id));
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const b = baselineFromFile(
      r,
      idByUid,
      leafIds,
      cal,
      `Línea base ${baselines.length + 1} (MS Project)`,
      (id) => taskCost(byId.get(id)!, merged),
    );
    if (b) {
      baselines = [...baselines, b];
      merged.baselines = baselines;
      if (merged.schedule) merged.schedule = { ...merged.schedule, activeBaselineId: b.id };
    }
  }

  return {
    project: merged,
    summary: { updated: matched.size, created: created.size, notFound },
  };
}

// ---------------------------------------------------------------------------------------
// Writing

function skeletonXml(project: Project): string {
  const s = project.schedule;
  const cal = s?.calendar ?? defaultCalendar();
  const now = new Date().toISOString().slice(0, 19);
  const mpd = Math.round((cal.hoursPerDay || 8) * 60);
  const mpw = mpd * Math.max(1, cal.workDays.filter(Boolean).length);
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Project xmlns="${NS}">` +
    `<SaveVersion>14</SaveVersion>` +
    `<Name>${escapeXml(project.name)}.xml</Name>` +
    `<Title>${escapeXml(project.name)}</Title>` +
    `<CreationDate>${now}</CreationDate>` +
    `<LastSaved>${now}</LastSaved>` +
    `<ScheduleFromStart>1</ScheduleFromStart>` +
    `<CurrencySymbol>€</CurrencySymbol>` +
    `<CurrencyCode>EUR</CurrencyCode>` +
    `<CalendarUID>1</CalendarUID>` +
    `<DefaultStartTime>${hms(cal.dayStart)}</DefaultStartTime>` +
    `<DefaultFinishTime>${hms(cal.dayEnd)}</DefaultFinishTime>` +
    `<MinutesPerDay>${mpd}</MinutesPerDay>` +
    `<MinutesPerWeek>${mpw}</MinutesPerWeek>` +
    `<DaysPerMonth>20</DaysPerMonth>` +
    `<DefaultTaskType>1</DefaultTaskType>` +
    `<HonorConstraints>1</HonorConstraints>` +
    `<WeekStartDay>1</WeekStartDay>` +
    `<Calendars><Calendar><UID>1</UID><Name>${escapeXml(cal.name || "Estándar")}</Name>` +
    `<IsBaseCalendar>1</IsBaseCalendar><BaseCalendarUID>-1</BaseCalendarUID></Calendar></Calendars>` +
    `<Tasks></Tasks><Resources></Resources><Assignments></Assignments>` +
    `</Project>`
  );
}

function sameCalendar(a: WorkCalendar | null, b: WorkCalendar): boolean {
  if (!a) return false;
  const hol = (c: WorkCalendar) =>
    c.holidays
      .map((h) => `${h.from}|${h.to && h.to !== h.from ? h.to : ""}`)
      .sort()
      .join(",");
  return (
    a.workDays.join() === b.workDays.join() &&
    a.dayStart === b.dayStart &&
    a.dayEnd === b.dayEnd &&
    hol(a) === hol(b)
  );
}

function writeCalendar(x: XmlPatcher, calEl: Element, cal: WorkCalendar) {
  x.remove(calEl, "WeekDays");
  x.remove(calEl, "Exceptions");
  x.remove(calEl, "WorkWeeks");
  const weekDays = x.create("WeekDays");
  const startMin = minutesOfDay(cal.dayStart);
  const endMin = minutesOfDay(cal.dayEnd);
  const hpdMin = Math.round((cal.hoursPerDay || 8) * 60);
  const periods: [number, number][] =
    endMin - startMin > hpdMin + 1
      ? [
          [startMin, startMin + Math.round(hpdMin / 2)],
          [endMin - (hpdMin - Math.round(hpdMin / 2)), endMin],
        ]
      : [[startMin, endMin]];
  for (let d = 1; d <= 7; d++) {
    const wd = x.create("WeekDay");
    const working = !!cal.workDays[d - 1];
    wd.appendChild(x.create("DayType", String(d)));
    wd.appendChild(x.create("DayWorking", working ? "1" : "0"));
    if (working) {
      const wts = x.create("WorkingTimes");
      for (const [a, b] of periods) {
        const wt = x.create("WorkingTime");
        wt.appendChild(x.create("FromTime", `${hhmmFromMinutes(a)}:00`));
        wt.appendChild(x.create("ToTime", `${hhmmFromMinutes(b)}:00`));
        wts.appendChild(wt);
      }
      wd.appendChild(wts);
    }
    weekDays.appendChild(wd);
  }
  for (const h of cal.holidays) {
    if (!h.from) continue;
    const wd = x.create("WeekDay");
    wd.appendChild(x.create("DayType", "0"));
    wd.appendChild(x.create("DayWorking", "0"));
    const tp = x.create("TimePeriod");
    tp.appendChild(x.create("FromDate", `${h.from}T00:00:00`));
    tp.appendChild(x.create("ToDate", `${h.to && h.to >= h.from ? h.to : h.from}T23:59:00`));
    wd.appendChild(tp);
    weekDays.appendChild(wd);
  }
  x.insert(calEl, weekDays, CALENDAR_ORDER);
}

/** Patches the project's MS Project XML (or a fresh skeleton) with the current app state.
 * Returns the new XML plus an updated Project (sourceUid/sourceDurationDays filled in for
 * anything created in-app, and `source` pointing at the exported document). */
export function buildMsProjectXml(project: Project): { xml: string; project: Project } {
  const hasSource = project.source?.format === "msproject-xml";
  const doc = parseDoc(hasSource ? project.source!.xml : skeletonXml(project));
  const root = doc.documentElement;
  const ns = root.namespaceURI || NS;
  const x = new XmlPatcher(doc, ns);
  const settings = project.schedule;
  const calendar = settings?.calendar ?? defaultCalendar();
  const dayStartT = hms(calendar.dayStart);
  const dayEndT = hms(calendar.dayEnd);

  // Minutes per day: keep the file's value unless the calendar says otherwise.
  const fileMpd = parseFloat(ctext(root, "MinutesPerDay", "480")) || 480;
  const calMpd = Math.round((calendar.hoursPerDay || 8) * 60);
  if (Math.abs(fileMpd - calMpd) > 0.5) {
    x.upsert(root, "MinutesPerDay", String(calMpd), PROJECT_ORDER);
    x.upsert(root, "MinutesPerWeek", String(calMpd * Math.max(1, calendar.workDays.filter(Boolean).length)), PROJECT_ORDER);
  }
  const minutesPerDay = calMpd;

  const calendarsEl = x.container(root, "Calendars", PROJECT_ORDER);
  const tasksParent = x.container(root, "Tasks", PROJECT_ORDER);
  const resourcesParent = x.container(root, "Resources", PROJECT_ORDER);
  const assignmentsParent = x.container(root, "Assignments", PROJECT_ORDER);

  // Calendar: rewrite the project calendar only when it differs from the file's.
  const fileCal = readCalendar(root, fileMpd);
  if (!sameCalendar(fileCal, calendar)) {
    const calUid = ctext(root, "CalendarUID", "1") || "1";
    let calEl = childrenNamed(calendarsEl, "Calendar").find((c) => ctext(c, "UID") === calUid);
    if (!calEl) {
      calEl = x.create("Calendar");
      calEl.appendChild(x.create("UID", calUid));
      calEl.appendChild(x.create("Name", calendar.name || "Estándar"));
      calEl.appendChild(x.create("IsBaseCalendar", "1"));
      calEl.appendChild(x.create("BaseCalendarUID", "-1"));
      calendarsEl.appendChild(calEl);
      x.upsert(root, "CalendarUID", calUid, PROJECT_ORDER);
    }
    x.upsert(calEl, "Name", calendar.name || ctext(calEl, "Name") || "Estándar", CALENDAR_ORDER);
    writeCalendar(x, calEl, calendar);
    x.upsert(root, "DefaultStartTime", dayStartT, PROJECT_ORDER);
    x.upsert(root, "DefaultFinishTime", dayEndT, PROJECT_ORDER);
  }

  const counters = hasSource ? { ...project.source!.counters } : { task: 0, resource: 0, assignment: 0 };

  const existingTaskNodesByUid = new Map<string, Element>();
  childrenNamed(tasksParent, "Task").forEach((e) => {
    const uid = ctext(e, "UID");
    if (uid) existingTaskNodesByUid.set(uid, e);
  });
  const existingResourceNodesByUid = new Map<string, Element>();
  childrenNamed(resourcesParent, "Resource").forEach((e) => {
    const uid = ctext(e, "UID");
    if (uid) existingResourceNodesByUid.set(uid, e);
  });
  const existingAssignmentEls = childrenNamed(assignmentsParent, "Assignment");

  // Remove tasks/resources that no longer exist, plus any assignments referencing them.
  // The project summary task (UID 0 / OutlineLevel 0) always stays.
  const currentTaskUids = new Set(project.tasks.map((t) => t.sourceUid).filter(Boolean) as string[]);
  for (const [uid, e] of existingTaskNodesByUid) {
    if (ctext(e, "OutlineLevel") === "0") continue;
    if (!currentTaskUids.has(uid)) {
      e.remove();
      existingTaskNodesByUid.delete(uid);
      existingAssignmentEls.filter((a) => ctext(a, "TaskUID") === uid).forEach((a) => a.remove());
    }
  }
  const currentResUids = new Set(project.resources.map((r) => r.sourceUid).filter(Boolean) as string[]);
  for (const [uid, e] of existingResourceNodesByUid) {
    if (uid === "0") continue;
    if (!currentResUids.has(uid)) {
      e.remove();
      existingResourceNodesByUid.delete(uid);
      existingAssignmentEls.filter((a) => ctext(a, "ResourceUID") === uid).forEach((a) => a.remove());
    }
  }

  // Resources: patch existing, create new.
  const resources: Resource[] = [];
  const resourceUidByInternalId = new Map<string, string>();
  for (const r of project.resources) {
    let e: Element;
    if (r.sourceUid && existingResourceNodesByUid.has(r.sourceUid)) {
      e = existingResourceNodesByUid.get(r.sourceUid)!;
      x.upsert(e, "Name", r.name, RESOURCE_ORDER);
      resourceUidByInternalId.set(r.id, r.sourceUid);
      resources.push(r);
    } else {
      counters.resource += 1;
      const newUid = String(counters.resource);
      e = x.create("Resource");
      const isMaterial = r.kind === "material" || r.kind === "subcontract";
      for (const [tag, value] of [
        ["UID", newUid],
        ["ID", newUid],
        ["Name", r.name],
        ["Type", isMaterial ? "0" : "1"],
        ["IsNull", "0"],
        ["Initials", r.kind === "equipment" ? "Q" : r.kind === "subcontract" ? "SC" : isMaterial ? "M" : "H"],
        ["StandardRateFormat", "2"],
        ["CostPerUse", "0"],
        ["IsCostResource", "0"],
      ] as const) {
        x.upsert(e, tag, value, RESOURCE_ORDER);
      }
      if (isMaterial && r.unit) x.upsert(e, "MaterialLabel", r.unit, RESOURCE_ORDER);
      resourcesParent.appendChild(e);
      resourceUidByInternalId.set(r.id, newUid);
      resources.push({ ...r, sourceUid: newUid });
    }
    if (r.code) x.upsert(e, "Code", r.code, RESOURCE_ORDER);
    if (r.maxUnits !== undefined) {
      x.upsert(e, "MaxUnits", (r.maxUnits > 0 ? r.maxUnits : 1).toFixed(2), RESOURCE_ORDER);
    } else if (!child(e, "MaxUnits") && r.kind !== "material" && r.kind !== "subcontract") {
      x.upsert(e, "MaxUnits", "1.00", RESOURCE_ORDER);
    }
    if (r.price !== undefined) x.upsert(e, "StandardRate", String(round2(r.price)), RESOURCE_ORDER);
  }

  // Tasks: first give every task a UID (links need them), then patch.
  const computed = getComputedTasks(project);
  const computedByTaskId = new Map(computed.map((t) => [t.id, t]));
  const baseline = activeBaseline(project);

  const taskUidByInternalId = new Map<string, string>();
  const isNewTask = new Set<ID>();
  for (const t of project.tasks) {
    if (t.sourceUid && existingTaskNodesByUid.has(t.sourceUid)) {
      taskUidByInternalId.set(t.id, t.sourceUid);
    } else {
      counters.task += 1;
      taskUidByInternalId.set(t.id, String(counters.task));
      isNewTask.add(t.id);
    }
  }

  const tasks: Task[] = [];
  const orderedTaskEls: Element[] = [];
  project.tasks.forEach((t, index) => {
    const c = computedByTaskId.get(t.id)!;
    const uid = taskUidByInternalId.get(t.id)!;
    const isNew = isNewTask.has(t.id);
    let taskEl: Element;
    let origDurationFormat = 7;
    if (!isNew) {
      taskEl = existingTaskNodesByUid.get(uid)!;
      origDurationFormat = Number(ctext(taskEl, "DurationFormat", "7"));
    } else {
      taskEl = x.create("Task");
      for (const [tag, value] of [
        ["UID", uid],
        ["Name", t.name],
        ["Type", "1"],
        ["IsNull", "0"],
        ["CreateDate", new Date().toISOString().slice(0, 19)],
        ["CalendarUID", "-1"],
      ] as const) {
        x.upsert(taskEl, tag, value, TASK_ORDER);
      }
    }
    const T = (tag: string, value: string) => x.upsert(taskEl, tag, value, TASK_ORDER);

    T("ID", String(index + 1));
    T("Name", t.name);
    T("WBS", c.displayCode || c.wbs);
    T("OutlineNumber", c.wbs);
    T("OutlineLevel", String(c.depth + 1));

    const origStart = ctext(taskEl, "Start");
    const origFinish = ctext(taskEl, "Finish");
    const startTime = isNew || !origStart ? dayStartT : timeOf(origStart, dayStartT);
    const finishTime = isNew || !origFinish ? dayEndT : timeOf(origFinish, dayEndT);
    if (c.isMilestone) {
      const time = isNew ? (t.predecessors.some((l) => l.type === "FS" || l.type === "FF") ? dayEndT : dayStartT) : startTime;
      T("Start", `${c.computedStart}T${time}`);
      T("Finish", `${c.computedEnd}T${time}`);
    } else {
      T("Start", `${c.computedStart}T${startTime}`);
      T("Finish", `${c.computedEnd}T${c.elapsed ? startTime : finishTime}`);
    }

    // Duration: keep the original sub-day value unless the user changed it.
    const elapsed = !c.isSummary && !!t.elapsed;
    const wasElapsed = ELAPSED_FORMATS.has(origDurationFormat);
    if (c.isSummary) {
      if (isNew) {
        T("Duration", formatPTDuration(c.computedDuration * minutesPerDay));
        T("DurationFormat", "7");
      }
    } else if (isNew || c.computedDuration !== t.sourceDurationDays || elapsed !== wasElapsed) {
      T("Duration", formatPTDuration(c.computedDuration * (elapsed ? 1440 : minutesPerDay)));
      T("DurationFormat", elapsed ? "8" : "7");
    }

    T("Milestone", c.isMilestone ? "1" : "0");
    T("Summary", c.isSummary ? "1" : "0");
    T("PercentComplete", String(Math.round(c.isSummary ? c.computedProgress : t.progress)));
    if (!c.isSummary) {
      if (c.cost > 0) T("Cost", String(round2(c.cost)));
      if (t.actualStart) T("ActualStart", `${t.actualStart}T${dayStartT}`);
      else x.remove(taskEl, "ActualStart");
      if (t.actualFinish) T("ActualFinish", `${t.actualFinish}T${dayEndT}`);
      else x.remove(taskEl, "ActualFinish");
      T("PhysicalPercentComplete", String(Math.round(t.progress)));
    }

    const constraint = t.constraint ?? "ASAP";
    if (isNew || constraint !== "ASAP" || child(taskEl, "ConstraintType")) {
      T("ConstraintType", CONSTRAINT_TO[constraint]);
    }
    if (DATED_CONSTRAINTS.has(constraint) && t.constraintDate) {
      T("ConstraintDate", `${t.constraintDate}T${FINISH_CONSTRAINTS.has(constraint) ? dayEndT : dayStartT}`);
    } else {
      x.remove(taskEl, "ConstraintDate");
    }
    if (t.deadline) T("Deadline", `${t.deadline}T${dayEndT}`);
    else x.remove(taskEl, "Deadline");
    if (isNew && t.notes) T("Notes", t.notes);

    // Links: rewrite only when they differ from the file.
    const desired = t.predecessors
      .map((l) => {
        const pu = taskUidByInternalId.get(l.predecessorId);
        if (!pu) return null;
        let linkLag = 0;
        let lagFormat = "7";
        if (l.lag) {
          if (l.lagUnit === "pct") {
            linkLag = Math.round(l.lag * 10);
            lagFormat = "19";
          } else if (l.lagUnit === "ed") {
            linkLag = Math.round(l.lag * 1440 * 10);
            lagFormat = "8";
          } else {
            linkLag = Math.round(l.lag * minutesPerDay * 10);
          }
        }
        return { pu, type: LINK_TYPE_TO[l.type], linkLag, lagFormat };
      })
      .filter(Boolean) as { pu: string; type: string; linkLag: number; lagFormat: string }[];
    const existingLinks = childrenNamed(taskEl, "PredecessorLink");
    const sig = (pu: string, type: string, lag: number, fmt: string) =>
      `${pu}|${type}|${lag}|${lag ? fmt : ""}`;
    const existingSig = existingLinks
      .map((l) => sig(ctext(l, "PredecessorUID"), ctext(l, "Type", "1"), Number(ctext(l, "LinkLag", "0")) || 0, ctext(l, "LagFormat", "7")))
      .sort()
      .join(",");
    const desiredSig = desired.map((d) => sig(d.pu, d.type, d.linkLag, d.lagFormat)).sort().join(",");
    if (existingSig !== desiredSig) {
      existingLinks.forEach((l) => l.remove());
      for (const d of desired) {
        const link = x.create("PredecessorLink");
        link.appendChild(x.create("PredecessorUID", d.pu));
        link.appendChild(x.create("Type", d.type));
        link.appendChild(x.create("CrossProject", "0"));
        link.appendChild(x.create("LinkLag", String(d.linkLag)));
        link.appendChild(x.create("LagFormat", d.lagFormat));
        x.insert(taskEl, link, TASK_ORDER);
      }
    }

    // Baseline 0 from the active baseline (other baselines in the file are left alone).
    const b = baseline?.tasks[t.id];
    if (b) {
      const existing = childrenNamed(taskEl, "Baseline").find((e) => ctext(e, "Number", "0") === "0");
      const same =
        existing &&
        datePart(ctext(existing, "Start")) === b.start &&
        datePart(ctext(existing, "Finish")) === b.finish &&
        Math.abs((Number(ctext(existing, "Cost", "0")) || 0) - b.cost) < 0.005;
      if (!same) {
        existing?.remove();
        const be = x.create("Baseline");
        be.appendChild(x.create("Number", "0"));
        be.appendChild(x.create("Start", `${b.start}T${dayStartT}`));
        be.appendChild(x.create("Finish", `${b.finish}T${dayEndT}`));
        be.appendChild(x.create("Duration", formatPTDuration(b.duration * minutesPerDay)));
        be.appendChild(x.create("DurationFormat", "7"));
        be.appendChild(x.create("Cost", String(round2(b.cost))));
        x.insert(taskEl, be, TASK_ORDER);
      }
    }

    tasks.push(isNew ? { ...t, sourceUid: uid, sourceDurationDays: c.computedDuration } : { ...t, sourceDurationDays: c.isSummary ? t.sourceDurationDays : c.computedDuration });
    orderedTaskEls.push(taskEl);
  });
  orderedTaskEls.forEach((e) => tasksParent.appendChild(e));

  // Assignments: reconcile to match current task/resource pairings.
  const resourceById = new Map(project.resources.map((r) => [r.id, r]));
  const desiredAssignments = new Map<string, number | undefined>();
  for (const t of project.tasks) {
    const taskUid = taskUidByInternalId.get(t.id)!;
    for (const rid of t.resourceIds) {
      const resUid = resourceUidByInternalId.get(rid);
      if (!resUid) continue;
      const a = t.resourceAssignments?.[rid];
      const r = resourceById.get(rid);
      let units = a?.units;
      if (r?.kind === "material" && a?.quantity) units = round2(a.quantity * (t.quantity ?? 1));
      desiredAssignments.set(`${taskUid}:${resUid}`, units);
    }
  }
  const existingPairs = new Map<string, Element>();
  childrenNamed(assignmentsParent, "Assignment").forEach((e) => {
    const tu = ctext(e, "TaskUID");
    const ru = ctext(e, "ResourceUID");
    if (tu && ru) existingPairs.set(`${tu}:${ru}`, e);
  });
  for (const [key, e] of existingPairs) {
    if (!desiredAssignments.has(key)) e.remove();
    else {
      const units = desiredAssignments.get(key);
      if (units !== undefined) x.upsert(e, "Units", String(units), ASSIGNMENT_ORDER);
    }
  }
  for (const [key, units] of desiredAssignments) {
    if (existingPairs.has(key)) continue;
    const [tu, ru] = key.split(":");
    counters.assignment += 1;
    const e = x.create("Assignment");
    for (const [tag, value] of [
      ["UID", String(counters.assignment)],
      ["TaskUID", tu],
      ["ResourceUID", ru],
      ["Cost", "0"],
      ["HasFixedRateUnits", "1"],
      ["FixedMaterial", "0"],
      ["Units", String(units ?? 1)],
      ["Work", "PT0H0M0S"],
    ] as const) {
      x.upsert(e, tag, value, ASSIGNMENT_ORDER);
    }
    assignmentsParent.appendChild(e);
  }

  // Project-level properties.
  const range = projectDateRange(computed);
  const fromStart = settings?.scheduleFrom !== "finish";
  if (child(root, "Title") || !hasSource) x.upsert(root, "Title", project.name, PROJECT_ORDER);
  x.upsert(root, "ScheduleFromStart", fromStart ? "1" : "0", PROJECT_ORDER);
  x.upsert(root, "StartDate", `${settings?.startDate ?? toISO(range.start)}T${dayStartT}`, PROJECT_ORDER);
  x.upsert(
    root,
    "FinishDate",
    `${!fromStart && settings?.finishDate ? settings.finishDate : toISO(range.end)}T${dayEndT}`,
    PROJECT_ORDER,
  );
  if (settings?.statusDate) x.upsert(root, "StatusDate", `${settings.statusDate}T${dayEndT}`, PROJECT_ORDER);
  x.upsert(root, "LastSaved", new Date().toISOString().slice(0, 19), PROJECT_ORDER);

  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>/, "");

  return {
    xml,
    project: {
      ...project,
      tasks,
      resources,
      source: { format: "msproject-xml", xml, counters },
    },
  };
}
