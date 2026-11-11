export type ID = string;

/** MO (mano de obra), MAT (material), EQ (maquinaria / equipo), SC (subcontrata). */
export type ResourceKind = "labor" | "material" | "equipment" | "subcontract";

export interface Resource {
  id: ID;
  name: string;
  color: string;
  role?: string;
  /** Labor / material / equipment classification, used by schedule-adjustment heuristics. */
  kind?: ResourceKind;
  /** Unit of measure (h, m², kg…). */
  unit?: string;
  /** Default unit price. */
  price?: number;
  /** Resource code (e.g. BC3 concept code). */
  code?: string;
  /** "Máx. unidades": how many people/machines of this resource can work at the same time.
   * 0 or undefined = unlimited. Capacity per day = maxUnits × calendar hours per day. */
  maxUnits?: number;
  /** UID of the <Resource> this was imported from, if any. Used to patch the source file on export. */
  sourceUid?: string;
}

/** Link types: Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish.
 * Spanish UI codes: FC, CC, FF, CF. */
export type LinkType = "FS" | "SS" | "FF" | "SF";
/** Lag measured in working days of the calendar, elapsed (calendar) days, or % of the
 * predecessor's duration. */
export type LagUnit = "wd" | "ed" | "pct";

export interface Link {
  /** Predecessor task id. May be a summary task (chapter): the link then applies to every
   * leaf task beneath it. */
  predecessorId: ID;
  type: LinkType;
  /** Positive = wait, negative = overlap. */
  lag: number;
  lagUnit: LagUnit;
}

/** The eight MS Project constraint types. */
export type ConstraintType =
  | "ASAP" // Lo antes posible
  | "ALAP" // Lo más tarde posible
  | "SNET" // No comenzar antes del
  | "SNLT" // No comenzar después del
  | "FNET" // No terminar antes del
  | "FNLT" // No terminar después del
  | "MSO" // Debe comenzar el
  | "MFO"; // Debe terminar el

/** A period in which a task does not work (rain, scaffold inspection, waiting for material).
 * The task keeps its duration and its finish moves back by the same amount. */
export interface Interruption {
  id: ID;
  /** ISO date. */
  from: string;
  /** ISO date, inclusive. Empty/undefined = single day. */
  to?: string;
  reason?: string;
}

/** Per-task details of a resource assignment ("Recursos de la partida"). */
export interface AssignmentInfo {
  /** Quantity of the resource per unit of the task (BC3 decomposition yield, e.g. h/m²). */
  quantity?: number;
  /** Unit price override for this task (defaults to the resource price). */
  price?: number;
  /** Crew size / units working simultaneously (default 1). */
  units?: number;
}

export interface Holiday {
  id: ID;
  /** ISO date. */
  from: string;
  /** ISO date, inclusive. Empty = single day. */
  to?: string;
  name?: string;
}

export interface WorkCalendar {
  name: string;
  /** Index 0 = Sunday … 6 = Saturday. */
  workDays: boolean[];
  /** "HH:mm" — start and end of the working day. Defaults 08:00 / 17:00. */
  dayStart: string;
  dayEnd: string;
  /** Working hours per day (capacity of one resource unit). Default 8. */
  hoursPerDay: number;
  holidays: Holiday[];
}

/** How durations are decided:
 *  - performance: duration = quantity ÷ performance (rounded up), locked;
 *  - date: dates rule, the duration is the working days between them;
 *  - manual: duration rules; moving the start moves the finish. */
export type DurationType = "performance" | "date" | "manual";

export interface ScheduleSettings {
  durationType: DurationType;
  calendar: WorkCalendar;
  scheduleFrom: "start" | "finish";
  /** Project start date ("Fecha Inicio"). */
  startDate?: string;
  /** Project finish date ("Fecha Fin"), used when scheduling from the finish. */
  finishDate?: string;
  /** When on, edits from the task form also move successors. The Gantt always does. */
  autoSchedule: boolean;
  /** Day up to which actual progress is reported. */
  statusDate?: string;
  /** Baseline used for comparison (grey bars, variances, earned value). */
  activeBaselineId?: ID;
}

export interface BaselineTask {
  start: string;
  finish: string;
  duration: number;
  cost: number;
}

export interface Baseline {
  id: ID;
  name: string;
  createdAt: string;
  tasks: Record<ID, BaselineTask>;
  /** Sum of leaf task costs at the time it was saved (BAC). */
  total: number;
}

/** "Registrar avance": a photo of earned value at a status date. */
export interface EvSnapshot {
  id: ID;
  /** Status date the snapshot belongs to. */
  date: string;
  createdAt: string;
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  certified: number;
}

/** Actual cost entry (stands in for supplier invoices charged to the job). */
export interface CostEntry {
  id: ID;
  date: string;
  amount: number;
  description?: string;
}

export interface Task {
  id: ID;
  name: string;
  /** Optional budget code (e.g. "01.02"). When empty the WBS number is used as the code. */
  code?: string;
  /** ISO date (yyyy-MM-dd). Ignored for summary tasks (derived from children). */
  start: string;
  /** Working days (or elapsed days if `elapsed`). 0 = milestone. Ignored for summary tasks. */
  duration: number;
  /** Duration counts every calendar day (curing, setting, drying). */
  elapsed?: boolean;
  /** Physical progress 0-100 ("Avance físico"). Ignored for summary tasks (derived). */
  progress: number;
  /** Certified percentage 0-100 ("% Cert."). Not the physical progress. */
  certified?: number;
  parentId: ID | null;
  resourceIds: ID[];
  /** Quantity / price / crew per assigned resource, keyed by resource id. */
  resourceAssignments?: Record<ID, AssignmentInfo>;
  /** Predecessor links. */
  predecessors: Link[];
  constraint?: ConstraintType;
  constraintDate?: string;
  /** Warns without moving the task: finishing after it makes total float negative. */
  deadline?: string;
  actualStart?: string;
  actualFinish?: string;
  interruptions?: Interruption[];
  /** Budget quantity and unit price ("Importe" = quantity × unit price). */
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  /** Performance ("Rendimiento"): units of quantity produced per day or per hour. */
  performance?: number;
  performanceUnit?: "day" | "hour";
  /** Working hours per day for the performance calculation (defaults to calendar hours). */
  hoursPerDay?: number;
  /** Earliest start set by resource leveling (acts like "Start No Earlier Than"). */
  levelingStart?: string;
  notes?: string;
  /** Custom bar color (hex). Ignored for summary tasks, which stay neutral. */
  color?: string;
  /** UID of the <Task> this was imported from, if any. Used to patch the source file on export. */
  sourceUid?: string;
  /** Duration (in whole days, as imported) at the time of import — lets export detect whether the
   * user changed it, so an untouched task's original sub-day <Duration> is preserved byte-exact. */
  sourceDurationDays?: number;
}

export interface MsProjectSource {
  format: "msproject-xml";
  /** The full original (or last-exported) MS Project XML document, used as the base for patching on export. */
  xml: string;
  /** Next-available UID per element type, so new tasks/resources/assignments never collide with imported ones. */
  counters: { task: number; resource: number; assignment: number };
}

export interface Project {
  id: ID;
  name: string;
  createdAt: string;
  updatedAt: string;
  tasks: Task[];
  resources: Resource[];
  /** Scheduling configuration ("pestaña Programación"). Always present after normalization. */
  schedule?: ScheduleSettings;
  baselines?: Baseline[];
  evSnapshots?: EvSnapshot[];
  actualCosts?: CostEntry[];
  /** Present when this project was imported from an MS Project XML file, enabling round-trip export. */
  source?: MsProjectSource;
}

export type Zoom = "day" | "week" | "month";

export interface ComputedTask extends Task {
  computedStart: string;
  computedEnd: string;
  computedDuration: number;
  computedProgress: number;
  /** Rolled-up certified % (summary = weighted by cost, falling back to duration). */
  computedCertified: number;
  isSummary: boolean;
  isMilestone: boolean;
  depth: number;
  wbs: string;
  /** `code` if set, else the WBS number. Used in predecessor codes. */
  displayCode: string;
  /** Duration is derived from quantity ÷ performance (locked). */
  durationLocked: boolean;
  /** Budget amount: quantity × unit price (summaries: sum of children). */
  cost: number;
  /** CPM results (leaf tasks; summaries roll up min float / any critical). */
  earlyStart?: string;
  earlyFinish?: string;
  lateStart?: string;
  lateFinish?: string;
  totalFloat?: number;
  freeFloat?: number;
  critical: boolean;
  remainingDuration: number;
  isStarted: boolean;
  isFinished: boolean;
  /** Active baseline values, if any. */
  baselineStart?: string;
  baselineFinish?: string;
  baselineDuration?: number;
  baselineCost?: number;
  /** Working days between baseline finish and current finish (positive = later). */
  finishVariance?: number;
}
