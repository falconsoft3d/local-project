export type ID = string;

export type ResourceKind = "labor" | "material" | "equipment";

export interface Resource {
  id: ID;
  name: string;
  color: string;
  role?: string;
  /** Labor / material / equipment classification, used by schedule-adjustment heuristics. */
  kind?: ResourceKind;
  /** UID of the <Resource> this was imported from, if any. Used to patch the source file on export. */
  sourceUid?: string;
}

export interface Task {
  id: ID;
  name: string;
  /** ISO date (yyyy-MM-dd). Ignored for summary tasks (derived from children). */
  start: string;
  /** Business days. 0 = milestone. Ignored for summary tasks (derived from children). */
  duration: number;
  /** 0-100. Ignored for summary tasks (derived from children). */
  progress: number;
  parentId: ID | null;
  resourceIds: ID[];
  predecessorIds: ID[];
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
  /** Present when this project was imported from an MS Project XML file, enabling round-trip export. */
  source?: MsProjectSource;
}

export type Zoom = "day" | "week" | "month";

export interface ComputedTask extends Task {
  computedStart: string;
  computedEnd: string;
  computedDuration: number;
  computedProgress: number;
  isSummary: boolean;
  isMilestone: boolean;
  depth: number;
  wbs: string;
}
