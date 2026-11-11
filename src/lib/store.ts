import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuid } from "uuid";
import type { Baseline, ID, Project, Resource, ScheduleSettings, Task } from "./types";
import {
  hasChildren,
  indentTask,
  insertAfterSubtree,
  insertAsLastChild,
  moveTask,
  outdentTask,
  removeSubtree,
} from "./tree";
import { snapToBusinessDay, toISO } from "./schedule";
import { scheduleProject, projectCal, effectiveDuration } from "./cpm";
import { normalizeProject, defaultScheduleSettings } from "./normalize";
import { TaskCal, dayNum, isoOf } from "./calendar";
import {
  createBaseline,
  recordSnapshot,
  rescheduleRemaining,
  taskFinishISO,
  updateAsScheduled,
} from "./tracking";
import { buildMsProjectXml } from "./msproject";
import { RESOURCE_COLORS } from "./colors";
import {
  isFileSystemAccessSupported,
  parseProjectFile,
  PROJECT_FILE_PICKER_TYPES,
  serializeProjectFile,
} from "./projectFile";
import { decodeImportBuffer, parseImportedContent } from "./importFormats";

export { RESOURCE_COLORS };

function newTask(name: string, parentId: ID | null): Task {
  return {
    id: uuid(),
    name,
    start: snapToBusinessDay(toISO(new Date())),
    duration: 1,
    progress: 0,
    parentId,
    resourceIds: [],
    predecessors: [],
  };
}

/** New tasks start on the project start date (CPM would move them there anyway). */
function startFor(project: Project): string {
  const cal = projectCal(project);
  return cal.snapISO(project.schedule?.startDate ?? toISO(new Date()));
}

function touch(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}

/** Re-runs the schedule so successors follow (the Gantt always does this). */
function withDependencies(project: Project): Project {
  return scheduleProject(project);
}

function cleanupReferences(tasks: Task[], removedIds: Set<ID>): Task[] {
  return tasks.map((t) => ({
    ...t,
    predecessors: t.predecessors.filter((l) => !removedIds.has(l.predecessorId)),
  }));
}

/** Keeps physical progress and actual dates consistent: progress > 0 sets the actual
 * start; 100 sets the actual finish; an actual finish means 100 %. */
function applyProgressRules(project: Project, before: Task, after: Task, patch: Partial<Task>): Task {
  let t = after;
  if ("actualFinish" in patch && t.actualFinish) {
    t = { ...t, progress: 100, actualStart: t.actualStart ?? t.start };
  }
  if ("actualStart" in patch && t.actualStart) {
    t = { ...t, start: t.actualStart };
  }
  if ("progress" in patch) {
    if (t.progress > 0 && !t.actualStart) t = { ...t, actualStart: t.start };
    if (t.progress >= 100 && !t.actualFinish) {
      t = { ...t, actualFinish: taskFinishISO({ ...t, actualFinish: undefined }, project) };
    }
    if (t.progress < 100 && before.progress >= 100 && t.actualFinish && !("actualFinish" in patch)) {
      t = { ...t, actualFinish: undefined };
    }
    if (t.progress <= 0 && !("actualStart" in patch)) {
      t = { ...t, actualStart: undefined, actualFinish: undefined };
    }
  }
  return t;
}

export interface UpdateOptions {
  /** Run the scheduler after the change. Defaults to true (Gantt edits always move
   * successors); the task form passes the project's automatic-scheduling setting. */
  reschedule?: boolean;
  /** Edits sharing a key within a short window collapse into one undo step. */
  historyKey?: string;
}

function omit<T extends Record<string, unknown>>(obj: T, key: string): T {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

type FileStatus = "saved" | "saving" | "error";

const HISTORY_LIMIT = 60;
/** In-memory undo history per project (never persisted). */
const history: Record<ID, Project[]> = {};
const lastHistoryPush: Record<ID, { key?: string; at: number }> = {};

function pushHistory(projectId: ID, previous: Project, key?: string) {
  const now = Date.now();
  const last = lastHistoryPush[projectId];
  if (key && last && last.key === key && now - last.at < 1500) {
    last.at = now;
    return;
  }
  const stack = (history[projectId] ??= []);
  stack.push(previous);
  if (stack.length > HISTORY_LIMIT) stack.shift();
  lastHistoryPush[projectId] = { key, at: now };
}

interface StoreState {
  projects: Project[];
  /** Number of undo steps per project (mirrors the in-memory history for re-rendering). */
  undoDepth: Partial<Record<ID, number>>;
  /** Projects linked to a file on disk (via the File System Access API). Never persisted —
   * these projects live only in the file; browser storage only tracks the handle in memory
   * for the current tab session. */
  fileHandles: Partial<Record<ID, FileSystemFileHandle>>;
  fileStatus: Partial<Record<ID, FileStatus>>;
  /** Projects linked to a public URL instead of a local file. Persisted (it's just a string) —
   * read/refresh only, since a browser can't write back to most file-sharing links. */
  projectUrls: Partial<Record<ID, string>>;
  createProject: (name: string) => ID;
  deleteProject: (id: ID) => void;
  renameProject: (id: ID, name: string) => void;
  duplicateProject: (id: ID) => ID;
  importProject: (content: string, fileName?: string) => ID | null;
  exportMsProjectXml: (projectId: ID) => string | null;
  openProjectFromFile: () => Promise<ID | null>;
  saveProjectAsFile: (projectId: ID) => Promise<boolean>;
  closeFileProject: (projectId: ID) => void;
  addProjectFromUrl: (url: string) => Promise<ID | null>;
  refreshProjectFromUrl: (projectId: ID) => Promise<boolean>;

  addTask: (projectId: ID, afterId: ID | null, name?: string) => ID;
  addSubtask: (projectId: ID, parentId: ID, name?: string) => ID;
  addMilestone: (projectId: ID, afterId: ID | null, name?: string) => ID;
  addChapter: (projectId: ID, afterId: ID | null, names?: { chapter: string; item: string }) => ID;
  deleteTask: (projectId: ID, taskId: ID) => void;
  updateTask: (projectId: ID, taskId: ID, patch: Partial<Task>, opts?: UpdateOptions) => void;
  /** Table/bar edits with the semantics of the project's duration type. */
  setTaskStart: (projectId: ID, taskId: ID, startISO: string) => void;
  setTaskFinish: (projectId: ID, taskId: ID, finishISO: string) => void;
  setTaskDuration: (projectId: ID, taskId: ID, duration: number) => void;
  /** Generic mutation used by feature modules (leveling, imports…). One undo step. */
  changeProject: (projectId: ID, fn: (p: Project) => Project, historyKey?: string) => void;
  undo: (projectId: ID) => void;
  updateScheduleSettings: (projectId: ID, patch: Partial<ScheduleSettings>, reschedule?: boolean) => void;
  scheduleNow: (projectId: ID) => void;
  saveBaseline: (projectId: ID, name?: string) => void;
  updateBaseline: (projectId: ID, baselineId: ID, patch: Partial<Baseline>) => void;
  deleteBaseline: (projectId: ID, baselineId: ID) => void;
  updateAsScheduled: (projectId: ID) => void;
  rescheduleRemaining: (projectId: ID) => void;
  recordProgress: (projectId: ID) => void;
  indent: (projectId: ID, taskId: ID) => void;
  outdent: (projectId: ID, taskId: ID) => void;
  move: (projectId: ID, taskId: ID, direction: "up" | "down") => void;
  adjustSchedule: (projectId: ID, mode: "fixed" | "labor", days: number) => void;

  addResource: (projectId: ID, name: string) => ID;
  updateResource: (projectId: ID, resourceId: ID, patch: Partial<Resource>) => void;
  deleteResource: (projectId: ID, resourceId: ID) => void;
}

const writeTimers: Partial<Record<ID, ReturnType<typeof setTimeout>>> = {};

/** Debounces writing a file-linked project back to disk, so rapid edits (e.g. dragging a
 * Gantt bar) don't hammer the filesystem with a write per pixel. No-op for projects that
 * aren't linked to a file. */
function scheduleFileWrite(
  get: () => StoreState,
  set: (fn: (s: StoreState) => Partial<StoreState>) => void,
  projectId: ID,
  project: Project
) {
  const handle = get().fileHandles[projectId];
  if (!handle) return;
  const existing = writeTimers[projectId];
  if (existing) clearTimeout(existing);
  writeTimers[projectId] = setTimeout(async () => {
    set((s) => ({ fileStatus: { ...s.fileStatus, [projectId]: "saving" } }));
    try {
      const writable = await handle.createWritable();
      await writable.write(serializeProjectFile(project));
      await writable.close();
      set((s) => ({ fileStatus: { ...s.fileStatus, [projectId]: "saved" } }));
    } catch (err) {
      console.error("Failed to save project file", err);
      set((s) => ({ fileStatus: { ...s.fileStatus, [projectId]: "error" } }));
    }
  }, 400);
}

function mutateProject(
  get: () => StoreState,
  set: (fn: (s: StoreState) => Partial<StoreState>) => void,
  projectId: ID,
  fn: (project: Project) => Project,
  historyKey?: string
) {
  let updated: Project | null = null;
  set((s) => ({
    projects: s.projects.map((p) => {
      if (p.id !== projectId) return p;
      const next = fn(p);
      if (next === p) return p;
      pushHistory(projectId, p, historyKey);
      updated = touch(next);
      return updated;
    }),
    undoDepth: { ...s.undoDepth, [projectId]: history[projectId]?.length ?? 0 },
  }));
  if (updated) scheduleFileWrite(get, set, projectId, updated);
}

function patchTask(
  project: Project,
  taskId: ID,
  patch: Partial<Task>,
  reschedule: boolean
): Project {
  const before = project.tasks.find((t) => t.id === taskId);
  if (!before) return project;
  const after = applyProgressRules(project, before, { ...before, ...patch }, patch);
  const tasks = project.tasks.map((t) => (t.id === taskId ? after : t));
  const next = { ...project, tasks };
  return reschedule ? withDependencies(next) : next;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      projects: [],
      undoDepth: {},
      fileHandles: {},
      fileStatus: {},
      projectUrls: {},

      createProject: (name) => {
        const id = uuid();
        const now = new Date().toISOString();
        const project: Project = normalizeProject({
          id,
          name: name.trim() || "Untitled project",
          createdAt: now,
          updatedAt: now,
          tasks: [],
          resources: [],
          schedule: defaultScheduleSettings({
            durationType: "performance",
            startDate: snapToBusinessDay(toISO(new Date())),
          }),
        });
        set((s) => ({ projects: [...s.projects, project] }));
        return id;
      },

      deleteProject: (id) => {
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          fileHandles: omit(s.fileHandles, id),
          fileStatus: omit(s.fileStatus, id),
          projectUrls: omit(s.projectUrls, id),
        }));
      },

      renameProject: (id, name) => {
        mutateProject(get, set, id, (p) => ({ ...p, name: name.trim() || p.name }), "rename");
      },

      duplicateProject: (id) => {
        const source = get().projects.find((p) => p.id === id);
        if (!source) return "";
        const idMap = new Map<ID, ID>();
        const tasks = source.tasks.map((t) => {
          const newId = uuid();
          idMap.set(t.id, newId);
          return { ...t, id: newId };
        });
        const remapped = tasks.map((t) => ({
          ...t,
          parentId: t.parentId ? idMap.get(t.parentId) ?? null : null,
          predecessors: t.predecessors
            .filter((l) => idMap.has(l.predecessorId))
            .map((l) => ({ ...l, predecessorId: idMap.get(l.predecessorId)! })),
        }));
        const remapRecord = <T,>(rec: Record<ID, T>) =>
          Object.fromEntries(
            Object.entries(rec).map(([k, v]) => [idMap.get(k) ?? k, v])
          ) as Record<ID, T>;
        const now = new Date().toISOString();
        const copy: Project = {
          ...source,
          id: uuid(),
          name: `${source.name} (copy)`,
          createdAt: now,
          updatedAt: now,
          tasks: remapped,
          resources: source.resources.map((r) => ({ ...r })),
          baselines: (source.baselines ?? []).map((b) => ({ ...b, tasks: remapRecord(b.tasks) })),
        };
        set((s) => ({ projects: [...s.projects, copy] }));
        return copy.id;
      },

      importProject: (content, fileName) => {
        try {
          // Imported "as a copy": reuse each format's field validation but always assign a
          // fresh id, so re-importing a file whose project is already open never collides.
          const now = new Date().toISOString();
          const parsed = normalizeProject(parseImportedContent(content, fileName ?? "Imported project"));
          const project: Project = { ...parsed, id: uuid(), createdAt: now, updatedAt: now };
          set((s) => ({ projects: [...s.projects, project] }));
          return project.id;
        } catch {
          return null;
        }
      },

      exportMsProjectXml: (projectId) => {
        const project = get().projects.find((p) => p.id === projectId);
        if (!project) return null;
        try {
          const { xml, project: updated } = buildMsProjectXml(project);
          set((s) => ({
            projects: s.projects.map((p) => (p.id === projectId ? touch(updated) : p)),
          }));
          scheduleFileWrite(get, set, projectId, updated);
          return xml;
        } catch {
          return null;
        }
      },

      openProjectFromFile: async () => {
        if (!isFileSystemAccessSupported()) return null;
        let handle: FileSystemFileHandle;
        try {
          [handle] = await window.showOpenFilePicker!({ types: PROJECT_FILE_PICKER_TYPES });
        } catch {
          return null; // user cancelled the picker
        }
        try {
          const file = await handle.getFile();
          const project = normalizeProject(parseProjectFile(await file.text()));
          set((s) => {
            const exists = s.projects.some((p) => p.id === project.id);
            return {
              projects: exists
                ? s.projects.map((p) => (p.id === project.id ? project : p))
                : [...s.projects, project],
              fileHandles: { ...s.fileHandles, [project.id]: handle },
              fileStatus: { ...s.fileStatus, [project.id]: "saved" },
            };
          });
          return project.id;
        } catch (err) {
          console.error("Failed to open project file", err);
          return null;
        }
      },

      saveProjectAsFile: async (projectId) => {
        if (!isFileSystemAccessSupported()) return false;
        const project = get().projects.find((p) => p.id === projectId);
        if (!project) return false;
        let handle: FileSystemFileHandle;
        try {
          handle = await window.showSaveFilePicker!({
            types: PROJECT_FILE_PICKER_TYPES,
            suggestedName: `${project.name.replace(/[^a-z0-9-_]+/gi, "_")}.json`,
          });
        } catch {
          return false; // user cancelled the picker
        }
        try {
          const writable = await handle.createWritable();
          await writable.write(serializeProjectFile(project));
          await writable.close();
          set((s) => ({
            fileHandles: { ...s.fileHandles, [projectId]: handle },
            fileStatus: { ...s.fileStatus, [projectId]: "saved" },
          }));
          return true;
        } catch (err) {
          console.error("Failed to save project file", err);
          return false;
        }
      },

      closeFileProject: (projectId) => {
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== projectId),
          fileHandles: omit(s.fileHandles, projectId),
          fileStatus: omit(s.fileStatus, projectId),
        }));
      },

      addProjectFromUrl: async (url) => {
        const trimmedUrl = url.trim();
        if (!trimmedUrl) return null;
        // Adding the same URL again refreshes the existing entry instead of duplicating it.
        const existingId = Object.entries(get().projectUrls).find(
          ([, u]) => u === trimmedUrl
        )?.[0];
        try {
          const res = await fetch(trimmedUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const content = await decodeImportBuffer(await res.arrayBuffer());
          const fileNameGuess = trimmedUrl.split("/").pop()?.split("?")[0] || "project";
          const parsed = normalizeProject(parseImportedContent(content, fileNameGuess));
          if (existingId) {
            const updated = { ...parsed, id: existingId, updatedAt: new Date().toISOString() };
            set((s) => ({
              projects: s.projects.map((p) => (p.id === existingId ? updated : p)),
            }));
            return existingId;
          }
          set((s) => ({
            projects: [...s.projects, parsed],
            projectUrls: { ...s.projectUrls, [parsed.id]: trimmedUrl },
          }));
          return parsed.id;
        } catch (err) {
          console.error("Failed to add project from URL", err);
          return null;
        }
      },

      refreshProjectFromUrl: async (projectId) => {
        const url = get().projectUrls[projectId];
        if (!url) return false;
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const content = await decodeImportBuffer(await res.arrayBuffer());
          const parsed = normalizeProject(parseImportedContent(content, url));
          const updated = { ...parsed, id: projectId, updatedAt: new Date().toISOString() };
          set((s) => ({
            projects: s.projects.map((p) => (p.id === projectId ? updated : p)),
          }));
          return true;
        } catch (err) {
          console.error("Failed to refresh project from URL", err);
          return false;
        }
      },

      addTask: (projectId, afterId, name) => {
        const id = uuid();
        mutateProject(get, set, projectId, (p) => {
          const parentId = afterId
            ? p.tasks.find((t) => t.id === afterId)?.parentId ?? null
            : null;
          const t = { ...newTask(name ?? "New Task", parentId), id, start: startFor(p) };
          return { ...p, tasks: insertAfterSubtree(p.tasks, afterId, t) };
        });
        return id;
      },

      addChapter: (projectId, afterId, names) => {
        const id = uuid();
        mutateProject(get, set, projectId, (p) => {
          // A chapter is a top-level task; insert it after the top-level ancestor of the selection.
          let anchor: ID | null = afterId;
          while (anchor) {
            const a = p.tasks.find((t) => t.id === anchor);
            if (!a?.parentId) break;
            anchor = a.parentId;
          }
          const chapter = { ...newTask(names?.chapter ?? "New chapter", null), id };
          const item = { ...newTask(names?.item ?? "New item", id), id: uuid() };
          if (p.schedule?.startDate) {
            chapter.start = projectCal(p).snapISO(p.schedule.startDate);
            item.start = chapter.start;
          }
          const tasks = insertAfterSubtree(p.tasks, anchor, chapter);
          return withDependencies({ ...p, tasks: insertAsLastChild(tasks, id, item) });
        });
        return id;
      },

      addSubtask: (projectId, parentId, name) => {
        const id = uuid();
        mutateProject(get, set, projectId, (p) => {
          const t = { ...newTask(name ?? "New Subtask", parentId), id, start: startFor(p) };
          return { ...p, tasks: insertAsLastChild(p.tasks, parentId, t) };
        });
        return id;
      },

      addMilestone: (projectId, afterId, name) => {
        const id = uuid();
        mutateProject(get, set, projectId, (p) => {
          const parentId = afterId
            ? p.tasks.find((t) => t.id === afterId)?.parentId ?? null
            : null;
          const t = { ...newTask(name ?? "New Milestone", parentId), id, duration: 0, start: startFor(p) };
          return { ...p, tasks: insertAfterSubtree(p.tasks, afterId, t) };
        });
        return id;
      },

      deleteTask: (projectId, taskId) => {
        mutateProject(get, set, projectId, (p) => {
          const removed = new Set(
            p.tasks
              .filter((t) => t.id === taskId || isDescendant(p.tasks, t.id, taskId))
              .map((t) => t.id)
          );
          const remaining = removeSubtree(p.tasks, taskId);
          return withDependencies({ ...p, tasks: cleanupReferences(remaining, removed) });
        });
      },

      updateTask: (projectId, taskId, patch, opts) => {
        mutateProject(
          get,
          set,
          projectId,
          (p) => patchTask(p, taskId, patch, opts?.reschedule ?? true),
          opts?.historyKey ?? `${taskId}:${Object.keys(patch).join(",")}`
        );
      },

      setTaskStart: (projectId, taskId, startISO) => {
        mutateProject(get, set, projectId, (p) => {
          const t = p.tasks.find((x) => x.id === taskId);
          if (!t) return p;
          const cal = projectCal(p);
          const start = cal.snapISO(startISO);
          const patch: Partial<Task> = { start };
          if (t.actualStart) patch.actualStart = start;
          // Moving a task by hand pins it, like MS Project: "Start No Earlier Than".
          const c = t.constraint ?? "ASAP";
          if (!t.actualStart && (c === "ASAP" || c === "SNET")) {
            patch.constraint = "SNET";
            patch.constraintDate = start;
          } else if (!t.actualStart && (c === "MSO" || c === "SNLT")) {
            patch.constraintDate = start;
          }
          if (p.schedule?.durationType === "date" && t.duration > 0 && !t.elapsed) {
            // Dates rule: the finish stays, the duration absorbs the change.
            const finish = taskFinishISO(t, p, cal);
            if (finish >= start) patch.duration = Math.max(1, cal.workDaysInclusive(start, finish));
          }
          return patchTask(p, taskId, patch, true);
        }, `${taskId}:start`);
      },

      setTaskFinish: (projectId, taskId, finishISO) => {
        mutateProject(get, set, projectId, (p) => {
          const t = p.tasks.find((x) => x.id === taskId);
          if (!t) return p;
          const cal = projectCal(p);
          if (t.duration === 0) {
            return patchTask(p, taskId, { start: cal.snapISO(finishISO), constraint: "SNET", constraintDate: cal.snapISO(finishISO) }, true);
          }
          if (effectiveDuration(t, p, cal) !== t.duration) return p; // locked by performance
          const tc = new TaskCal(cal, t.elapsed, t.interruptions);
          const s = dayNum(t.actualStart ?? t.start);
          const f = dayNum(finishISO);
          if (f < s) return p;
          const duration = Math.max(1, tc.workDaysIn(s, f + 1).length);
          const patch: Partial<Task> = { duration };
          if (t.actualFinish) patch.actualFinish = isoOf(tc.finishOf(s, duration) - 1);
          return patchTask(p, taskId, patch, true);
        }, `${taskId}:finish`);
      },

      setTaskDuration: (projectId, taskId, duration) => {
        mutateProject(get, set, projectId, (p) => {
          const t = p.tasks.find((x) => x.id === taskId);
          if (!t) return p;
          if (effectiveDuration(t, p) !== t.duration && t.performance) return p;
          return patchTask(p, taskId, { duration: Math.max(0, Math.round(duration)) }, true);
        }, `${taskId}:duration`);
      },

      changeProject: (projectId, fn, historyKey) => {
        mutateProject(get, set, projectId, fn, historyKey);
      },

      undo: (projectId) => {
        const stack = history[projectId];
        if (!stack?.length) return;
        const previous = stack.pop()!;
        lastHistoryPush[projectId] = { at: 0 };
        let restored: Project | null = null;
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== projectId) return p;
            restored = touch(previous);
            return restored;
          }),
          undoDepth: { ...s.undoDepth, [projectId]: stack.length },
        }));
        if (restored) scheduleFileWrite(get, set, projectId, restored);
      },

      updateScheduleSettings: (projectId, patch, reschedule) => {
        mutateProject(get, set, projectId, (p) => {
          const next = {
            ...p,
            schedule: { ...defaultScheduleSettings(p.schedule), ...patch },
          };
          return reschedule ? withDependencies(next) : next;
        }, `settings:${Object.keys(patch).join(",")}`);
      },

      scheduleNow: (projectId) => {
        mutateProject(get, set, projectId, (p) => withDependencies(p));
      },

      saveBaseline: (projectId, name) => {
        mutateProject(get, set, projectId, (p) => {
          const b = createBaseline(p, name);
          return {
            ...p,
            baselines: [...(p.baselines ?? []), b],
            schedule: { ...defaultScheduleSettings(p.schedule), activeBaselineId: b.id },
          };
        });
      },

      updateBaseline: (projectId, baselineId, patch) => {
        mutateProject(get, set, projectId, (p) => ({
          ...p,
          baselines: (p.baselines ?? []).map((b) => (b.id === baselineId ? { ...b, ...patch } : b)),
        }), `baseline:${baselineId}`);
      },

      deleteBaseline: (projectId, baselineId) => {
        mutateProject(get, set, projectId, (p) => {
          const schedule = defaultScheduleSettings(p.schedule);
          return {
            ...p,
            baselines: (p.baselines ?? []).filter((b) => b.id !== baselineId),
            schedule:
              schedule.activeBaselineId === baselineId
                ? { ...schedule, activeBaselineId: undefined }
                : schedule,
          };
        });
      },

      updateAsScheduled: (projectId) => {
        mutateProject(get, set, projectId, (p) => recordSnapshot(updateAsScheduled(p)));
      },

      rescheduleRemaining: (projectId) => {
        mutateProject(get, set, projectId, (p) => withDependencies(rescheduleRemaining(p)));
      },

      recordProgress: (projectId) => {
        mutateProject(get, set, projectId, (p) => recordSnapshot(p));
      },

      indent: (projectId, taskId) => {
        mutateProject(get, set, projectId, (p) => ({ ...p, tasks: indentTask(p.tasks, taskId) }));
      },

      outdent: (projectId, taskId) => {
        mutateProject(get, set, projectId, (p) => ({ ...p, tasks: outdentTask(p.tasks, taskId) }));
      },

      move: (projectId, taskId, direction) => {
        mutateProject(get, set, projectId, (p) => ({
          ...p,
          tasks: moveTask(p.tasks, taskId, direction),
        }));
      },

      adjustSchedule: (projectId, mode, days) => {
        const baseDays = Math.max(1, Math.round(days) || 8);
        mutateProject(get, set, projectId, (p) => {
          const laborIds = new Set(
            p.resources.filter((r) => r.kind === "labor").map((r) => r.id)
          );
          const chainable = p.tasks.filter(
            (task) => !hasChildren(p.tasks, task.id) && task.duration !== 0
          );
          if (chainable.length === 0) return p;
          const chainableIds = new Set(chainable.map((task) => task.id));
          const anchor = p.schedule?.startDate ?? chainable[0].start;

          let prevId: ID | null = null;
          const tasks = p.tasks.map((task) => {
            if (!chainableIds.has(task.id)) return task;
            let duration = baseDays;
            if (mode === "labor") {
              const laborCount = task.resourceIds.filter((id) => laborIds.has(id)).length;
              duration = laborCount > 0 ? Math.max(1, Math.ceil(baseDays / laborCount)) : baseDays;
            }
            const predecessors = prevId
              ? [{ predecessorId: prevId, type: "FS" as const, lag: 0, lagUnit: "wd" as const }]
              : [];
            prevId = task.id;
            // Ajustar replaces every link with a single Finish-to-Start chain.
            return {
              ...task,
              start: anchor,
              duration: task.actualStart ? task.duration : duration,
              predecessors,
              constraint: undefined,
              constraintDate: undefined,
              levelingStart: undefined,
            };
          });
          // Links declared on chapters would fight the chain: drop them too.
          const cleaned = tasks.map((task) =>
            chainableIds.has(task.id) ? task : { ...task, predecessors: [] }
          );
          return withDependencies({
            ...p,
            tasks: cleaned,
            schedule: { ...defaultScheduleSettings(p.schedule), startDate: anchor },
          });
        });
      },

      addResource: (projectId, name) => {
        const id = uuid();
        mutateProject(get, set, projectId, (p) => {
          const color = RESOURCE_COLORS[p.resources.length % RESOURCE_COLORS.length];
          const resource: Resource = {
            id,
            name: name.trim() || "New Resource",
            color,
            kind: "labor",
          };
          return { ...p, resources: [...p.resources, resource] };
        });
        return id;
      },

      updateResource: (projectId, resourceId, patch) => {
        mutateProject(get, set, projectId, (p) => ({
          ...p,
          resources: p.resources.map((r) => (r.id === resourceId ? { ...r, ...patch } : r)),
        }));
      },

      deleteResource: (projectId, resourceId) => {
        mutateProject(get, set, projectId, (p) => ({
          ...p,
          resources: p.resources.filter((r) => r.id !== resourceId),
          tasks: p.tasks.map((t) => {
            const rest = { ...(t.resourceAssignments ?? {}) };
            delete rest[resourceId];
            return {
              ...t,
              resourceIds: t.resourceIds.filter((id) => id !== resourceId),
              resourceAssignments: rest,
            };
          }),
        }));
      },
    }),
    {
      name: "local-project.projects.v1",
      version: 2,
      // v0/v1 projects used `predecessorIds` and had no scheduling settings.
      migrate: (persisted, version) => {
        const state = persisted as { projects?: Project[]; projectUrls?: Record<ID, string> };
        if (version < 2 && Array.isArray(state?.projects)) {
          state.projects = state.projects.map((p) => normalizeProject(p));
        }
        return state as unknown as StoreState;
      },
      merge: (persisted, current) => {
        const state = (persisted ?? {}) as Partial<StoreState>;
        return {
          ...current,
          ...state,
          projects: (state.projects ?? current.projects).map((p) => normalizeProject(p)),
        };
      },
      // File-linked projects live only in their file — never write them into browser storage.
      partialize: (s) => ({
        projects: s.projects.filter((p) => !s.fileHandles[p.id]),
        projectUrls: s.projectUrls,
      }),
    }
  )
);

function isDescendant(tasks: Task[], candidateId: ID, ancestorId: ID): boolean {
  let current = tasks.find((t) => t.id === candidateId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = tasks.find((t) => t.id === current!.parentId);
  }
  return false;
}
