import { v4 as uuid } from "uuid";
import { RESOURCE_COLORS } from "./colors";
import { getComputedTasks, projectDateRange, snapToBusinessDay, toISO } from "./schedule";
import type { Project, Resource, Task } from "./types";

const FALLBACK_NS = "http://schemas.microsoft.com/project";

function parsePTDuration(pt: string): number {
  const m = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(pt.trim());
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

function el(parent: Element | Document, ns: string, tag: string): Element | null {
  const found = parent.getElementsByTagNameNS(ns, tag);
  return found.length ? found[0] : null;
}

function text(parent: Element | Document | null, ns: string, tag: string, fallback = ""): string {
  if (!parent) return fallback;
  return el(parent, ns, tag)?.textContent?.trim() ?? fallback;
}

export function isMsProjectXml(content: string): boolean {
  return content.includes("schemas.microsoft.com/project");
}

export function parseMsProjectXml(xmlText: string): Project {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Invalid MS Project XML file.");
  }
  const root = doc.documentElement;
  const ns = root.namespaceURI || FALLBACK_NS;

  const minutesPerDay = parseFloat(text(root, ns, "MinutesPerDay", "480")) || 480;
  const title = text(root, ns, "title") || text(root, ns, "name") || "Imported project";

  const tasksParent = el(root, ns, "Tasks");
  const taskEls = tasksParent ? Array.from(tasksParent.getElementsByTagNameNS(ns, "Task")) : [];
  const resourcesParent = el(root, ns, "Resources");
  const resourceEls = resourcesParent
    ? Array.from(resourcesParent.getElementsByTagNameNS(ns, "Resource"))
    : [];
  const assignmentsParent = el(root, ns, "Assignments");
  const assignmentEls = assignmentsParent
    ? Array.from(assignmentsParent.getElementsByTagNameNS(ns, "Assignment"))
    : [];

  const resources: Resource[] = [];
  const resourceIdByUid = new Map<string, string>();
  let maxResourceUid = 0;
  for (const rEl of resourceEls) {
    const uid = text(rEl, ns, "UID");
    maxResourceUid = Math.max(maxResourceUid, Number(uid) || 0);
    const name = text(rEl, ns, "Name");
    if (!name) continue;
    const id = uuid();
    resourceIdByUid.set(uid, id);
    const initials = text(rEl, ns, "Initials").toUpperCase();
    const kind: Resource["kind"] =
      initials === "H" ? "labor" : initials === "Q" ? "equipment" : "material";
    resources.push({
      id,
      name,
      color: RESOURCE_COLORS[resources.length % RESOURCE_COLORS.length],
      kind,
      sourceUid: uid,
    });
  }

  const assignmentsByTask = new Map<string, string[]>();
  let maxAssignmentUid = 0;
  for (const aEl of assignmentEls) {
    const auid = text(aEl, ns, "UID");
    maxAssignmentUid = Math.max(maxAssignmentUid, Number(auid) || 0);
    const taskUid = text(aEl, ns, "TaskUID");
    const resUid = text(aEl, ns, "ResourceUID");
    const internalResId = resourceIdByUid.get(resUid);
    if (!internalResId) continue;
    const list = assignmentsByTask.get(taskUid) ?? [];
    if (!list.includes(internalResId)) list.push(internalResId);
    assignmentsByTask.set(taskUid, list);
  }

  const tasks: Task[] = [];
  let maxTaskUid = 0;
  const parentStack: (string | null)[] = [];
  for (const tEl of taskEls) {
    const uid = text(tEl, ns, "UID");
    maxTaskUid = Math.max(maxTaskUid, Number(uid) || 0);
    const outlineLevel = Number(text(tEl, ns, "OutlineLevel", "0"));
    if (outlineLevel <= 0) continue;
    const depth = outlineLevel - 1;

    const name = text(tEl, ns, "Name", "Untitled");
    const startRaw = text(tEl, ns, "Start");
    const start = startRaw ? startRaw.split("T")[0] : toISO(new Date());
    const durationRaw = text(tEl, ns, "Duration");
    const totalMinutes = durationRaw ? parsePTDuration(durationRaw) : 0;
    const durationDays = totalMinutes > 0 ? Math.max(1, Math.ceil(totalMinutes / minutesPerDay)) : 0;

    parentStack.length = depth;
    const parentId = depth > 0 ? parentStack[depth - 1] ?? null : null;

    const id = uuid();
    parentStack[depth] = id;

    tasks.push({
      id,
      name,
      start: snapToBusinessDay(start),
      duration: durationDays,
      progress: 0,
      parentId,
      resourceIds: assignmentsByTask.get(uid) ?? [],
      predecessorIds: [],
      sourceUid: uid,
      sourceDurationDays: durationDays,
    });
  }

  const now = new Date().toISOString();
  return {
    id: uuid(),
    name: title,
    createdAt: now,
    updatedAt: now,
    tasks,
    resources,
    source: {
      format: "msproject-xml",
      xml: xmlText,
      counters: { task: maxTaskUid, resource: maxResourceUid, assignment: maxAssignmentUid },
    },
  };
}

/** Patches the project's original MS Project XML with the current app state (dates, structure, names,
 * resource assignments) while leaving everything the user never touched byte-identical. Returns the new
 * XML plus an updated Project (sourceUid/sourceDurationDays filled in for anything created in-app). */
export function buildMsProjectXml(project: Project): { xml: string; project: Project } {
  if (!project.source || project.source.format !== "msproject-xml") {
    throw new Error("This project has no MS Project XML source to export back to.");
  }
  const doc = new DOMParser().parseFromString(project.source.xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Stored source XML is invalid.");
  }
  const root = doc.documentElement;
  const ns = root.namespaceURI || FALLBACK_NS;
  const minutesPerDay = parseFloat(text(root, ns, "MinutesPerDay", "480")) || 480;

  const tasksParent = el(root, ns, "Tasks");
  const resourcesParent = el(root, ns, "Resources");
  const assignmentsParent = el(root, ns, "Assignments");
  if (!tasksParent || !resourcesParent || !assignmentsParent) {
    throw new Error("Source XML is missing Tasks, Resources, or Assignments.");
  }

  function child(parent: Element, tag: string, value: string) {
    const e = doc.createElementNS(ns, tag);
    e.textContent = value;
    parent.appendChild(e);
  }

  function setText(parent: Element, tag: string, value: string) {
    const existing = Array.from(parent.children).find((c) => c.localName === tag) as
      | Element
      | undefined;
    if (existing) {
      existing.textContent = value;
    } else {
      child(parent, tag, value);
    }
  }

  const counters = { ...project.source.counters };

  const existingTaskNodesByUid = new Map<string, Element>();
  Array.from(tasksParent.getElementsByTagNameNS(ns, "Task")).forEach((e) => {
    const uid = text(e, ns, "UID");
    if (uid) existingTaskNodesByUid.set(uid, e as Element);
  });
  const existingResourceNodesByUid = new Map<string, Element>();
  Array.from(resourcesParent.getElementsByTagNameNS(ns, "Resource")).forEach((e) => {
    const uid = text(e, ns, "UID");
    if (uid) existingResourceNodesByUid.set(uid, e as Element);
  });
  const existingAssignmentEls = Array.from(
    assignmentsParent.getElementsByTagNameNS(ns, "Assignment")
  ) as Element[];

  // Remove tasks/resources that no longer exist, plus any assignments referencing them.
  const currentTaskUids = new Set(project.tasks.map((t) => t.sourceUid).filter(Boolean) as string[]);
  for (const [uid, e] of existingTaskNodesByUid) {
    if (!currentTaskUids.has(uid)) {
      e.remove();
      existingAssignmentEls
        .filter((a) => text(a, ns, "TaskUID") === uid)
        .forEach((a) => a.remove());
    }
  }
  const currentResUids = new Set(
    project.resources.map((r) => r.sourceUid).filter(Boolean) as string[]
  );
  for (const [uid, e] of existingResourceNodesByUid) {
    if (!currentResUids.has(uid)) {
      e.remove();
      existingAssignmentEls
        .filter((a) => text(a, ns, "ResourceUID") === uid)
        .forEach((a) => a.remove());
    }
  }

  // Resources: patch existing, create new.
  const resources: Resource[] = [];
  const resourceUidByInternalId = new Map<string, string>();
  for (const r of project.resources) {
    if (r.sourceUid && existingResourceNodesByUid.has(r.sourceUid)) {
      const e = existingResourceNodesByUid.get(r.sourceUid)!;
      setText(e, "Name", r.name);
      resourceUidByInternalId.set(r.id, r.sourceUid);
      resources.push(r);
    } else {
      counters.resource += 1;
      const newUid = String(counters.resource);
      const e = doc.createElementNS(ns, "Resource");
      child(e, "UID", newUid);
      child(e, "ID", newUid);
      child(e, "Name", r.name);
      child(e, "Initials", r.name.slice(0, 1).toUpperCase());
      child(e, "Type", "1");
      child(e, "IsNull", "0");
      child(e, "MaxUnits", "1.00");
      child(e, "Work", "PT0H0M0S");
      child(e, "RegularWork", "PT0H0M0S");
      child(e, "StandardRate", "0");
      child(e, "StandardRateFormat", "2");
      child(e, "Cost", "0");
      child(e, "CostPerUse", "0");
      child(e, "IsCostResource", "0");
      resourcesParent.appendChild(e);
      resourceUidByInternalId.set(r.id, newUid);
      resources.push({ ...r, sourceUid: newUid });
    }
  }

  // Tasks: patch existing, create new, then re-append in current app order.
  const computed = getComputedTasks(project);
  const computedByTaskId = new Map(computed.map((t) => [t.id, t]));

  const tasks: Task[] = [];
  const taskUidByInternalId = new Map<string, string>();
  const orderedTaskEls: Element[] = [];
  for (const t of project.tasks) {
    const c = computedByTaskId.get(t.id)!;
    let taskEl: Element;
    if (t.sourceUid && existingTaskNodesByUid.has(t.sourceUid)) {
      taskEl = existingTaskNodesByUid.get(t.sourceUid)!;
      setText(taskEl, "Name", t.name);
      const origStart = el(taskEl, ns, "Start")?.textContent?.trim();
      const origFinish = el(taskEl, ns, "Finish")?.textContent?.trim();
      setText(taskEl, "Start", `${c.computedStart}T${timeOf(origStart, "09:00:00")}`);
      setText(taskEl, "Finish", `${c.computedEnd}T${timeOf(origFinish, "18:00:00")}`);
      if (!c.isSummary && t.duration !== t.sourceDurationDays) {
        setText(taskEl, "Duration", formatPTDuration(t.duration * minutesPerDay));
      }
      setText(taskEl, "WBS", c.wbs);
      setText(taskEl, "OutlineNumber", c.wbs);
      setText(taskEl, "OutlineLevel", String(c.depth + 1));
      taskUidByInternalId.set(t.id, t.sourceUid);
      tasks.push(t);
    } else {
      counters.task += 1;
      const newUid = String(counters.task);
      taskEl = doc.createElementNS(ns, "Task");
      child(taskEl, "UID", newUid);
      child(taskEl, "ID", newUid);
      child(taskEl, "Name", t.name);
      child(taskEl, "CreateDate", new Date().toISOString().slice(0, 19));
      child(taskEl, "Start", `${c.computedStart}T09:00:00`);
      child(taskEl, "Finish", `${c.computedEnd}T18:00:00`);
      if (!c.isSummary) child(taskEl, "Duration", formatPTDuration(t.duration * minutesPerDay));
      child(taskEl, "WBS", c.wbs);
      child(taskEl, "OutlineNumber", c.wbs);
      child(taskEl, "OutlineLevel", String(c.depth + 1));
      child(taskEl, "CalendarUID", "1");
      taskUidByInternalId.set(t.id, newUid);
      tasks.push({ ...t, sourceUid: newUid, sourceDurationDays: t.duration });
    }
    orderedTaskEls.push(taskEl);
  }
  orderedTaskEls.forEach((e) => tasksParent.appendChild(e));

  // Assignments: reconcile to match current task/resource pairings.
  const desired = new Set<string>();
  for (const t of project.tasks) {
    const taskUid = taskUidByInternalId.get(t.id)!;
    for (const rid of t.resourceIds) {
      const resUid = resourceUidByInternalId.get(rid);
      if (resUid) desired.add(`${taskUid}:${resUid}`);
    }
  }
  const existingPairs = new Map<string, Element>();
  Array.from(assignmentsParent.getElementsByTagNameNS(ns, "Assignment")).forEach((e) => {
    const tu = text(e, ns, "TaskUID");
    const ru = text(e, ns, "ResourceUID");
    if (tu && ru) existingPairs.set(`${tu}:${ru}`, e as Element);
  });
  for (const [key, e] of existingPairs) {
    if (!desired.has(key)) e.remove();
  }
  for (const key of desired) {
    if (existingPairs.has(key)) continue;
    const [tu, ru] = key.split(":");
    counters.assignment += 1;
    const e = doc.createElementNS(ns, "Assignment");
    child(e, "UID", String(counters.assignment));
    child(e, "TaskUID", tu);
    child(e, "ResourceUID", ru);
    child(e, "Units", "1.0");
    child(e, "Cost", "0");
    child(e, "HasFixedRateUnits", "0");
    child(e, "FixedMaterial", "1");
    child(e, "Work", "PT0H0M0S");
    assignmentsParent.appendChild(e);
  }

  // Project-level dates.
  const range = projectDateRange(computed);
  setText(root, "StartDate", `${toISO(range.start)}T00:00:00`);
  setText(root, "FinishDate", `${toISO(range.end)}T00:00:00`);
  setText(root, "LastSaved", new Date().toISOString().slice(0, 19));

  const xml = '<?xml version="1.0" encoding="utf-8"?>' + new XMLSerializer().serializeToString(doc);

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
