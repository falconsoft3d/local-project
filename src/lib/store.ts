import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuid } from "uuid";
import type { ID, Project, Resource, Task } from "./types";
import {
  hasChildren,
  indentTask,
  insertAfterSubtree,
  insertAsLastChild,
  moveTask,
  outdentTask,
  removeSubtree,
} from "./tree";
import { applyDependencies, snapToBusinessDay, toISO } from "./schedule";
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
    predecessorIds: [],
  };
}

function touch(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}

function withDependencies(project: Project): Project {
  return { ...project, tasks: applyDependencies(project.tasks) };
}

function cleanupReferences(tasks: Task[], removedIds: Set<ID>): Task[] {
  return tasks.map((t) => ({
    ...t,
    predecessorIds: t.predecessorIds.filter((id) => !removedIds.has(id)),
  }));
}

function omit<T extends Record<string, unknown>>(obj: T, key: string): T {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

type FileStatus = "saved" | "saving" | "error";

interface StoreState {
  projects: Project[];
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

  addTask: (projectId: ID, afterId: ID | null) => ID;
  addSubtask: (projectId: ID, parentId: ID) => ID;
  addMilestone: (projectId: ID, afterId: ID | null) => ID;
  deleteTask: (projectId: ID, taskId: ID) => void;
  updateTask: (projectId: ID, taskId: ID, patch: Partial<Task>) => void;
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
  fn: (project: Project) => Project
) {
  let updated: Project | null = null;
  set((s) => ({
    projects: s.projects.map((p) => {
      if (p.id !== projectId) return p;
      updated = touch(fn(p));
      return updated;
    }),
  }));
  if (updated) scheduleFileWrite(get, set, projectId, updated);
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      projects: [],
      fileHandles: {},
      fileStatus: {},
      projectUrls: {},

      createProject: (name) => {
        const id = uuid();
        const now = new Date().toISOString();
        const project: Project = {
          id,
          name: name.trim() || "Untitled project",
          createdAt: now,
          updatedAt: now,
          tasks: [],
          resources: [],
        };
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
        mutateProject(get, set, id, (p) => ({ ...p, name: name.trim() || p.name }));
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
          predecessorIds: t.predecessorIds.map((pid) => idMap.get(pid)).filter(Boolean) as ID[],
        }));
        const now = new Date().toISOString();
        const copy: Project = {
          ...source,
          id: uuid(),
          name: `${source.name} (copy)`,
          createdAt: now,
          updatedAt: now,
          tasks: remapped,
          resources: source.resources.map((r) => ({ ...r })),
        };
        set((s) => ({ projects: [...s.projects, copy] }));
        return copy.id;
      },

      importProject: (content, fileName) => {
        try {
          // Imported "as a copy": reuse each format's field validation but always assign a
          // fresh id, so re-importing a file whose project is already open never collides.
          const now = new Date().toISOString();
          const parsed = parseImportedContent(content, fileName ?? "Imported project");
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
          const project = parseProjectFile(await file.text());
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
          const parsed = parseImportedContent(content, fileNameGuess);
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
          const parsed = parseImportedContent(content, url);
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

      addTask: (projectId, afterId) => {
        const id = uuid();
        mutateProject(get, set, projectId, (p) => {
          const parentId = afterId
            ? p.tasks.find((t) => t.id === afterId)?.parentId ?? null
            : null;
          const t = { ...newTask("New Task", parentId), id };
          return { ...p, tasks: insertAfterSubtree(p.tasks, afterId, t) };
        });
        return id;
      },

      addSubtask: (projectId, parentId) => {
        const id = uuid();
        mutateProject(get, set, projectId, (p) => {
          const t = { ...newTask("New Subtask", parentId), id };
          return { ...p, tasks: insertAsLastChild(p.tasks, parentId, t) };
        });
        return id;
      },

      addMilestone: (projectId, afterId) => {
        const id = uuid();
        mutateProject(get, set, projectId, (p) => {
          const parentId = afterId
            ? p.tasks.find((t) => t.id === afterId)?.parentId ?? null
            : null;
          const t = { ...newTask("New Milestone", parentId), id, duration: 0 };
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

      updateTask: (projectId, taskId, patch) => {
        mutateProject(get, set, projectId, (p) => {
          const tasks = p.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t));
          return withDependencies({ ...p, tasks });
        });
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
          const anchor = chainable[0].start;

          let prevId: ID | null = null;
          const tasks = p.tasks.map((task) => {
            if (!chainableIds.has(task.id)) return task;
            let duration = baseDays;
            if (mode === "labor") {
              const laborCount = task.resourceIds.filter((id) => laborIds.has(id)).length;
              duration = laborCount > 0 ? Math.max(1, Math.ceil(baseDays / laborCount)) : baseDays;
            }
            const predecessorIds = prevId ? [prevId] : [];
            prevId = task.id;
            return { ...task, start: anchor, duration, predecessorIds };
          });
          return withDependencies({ ...p, tasks });
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
          tasks: p.tasks.map((t) => ({
            ...t,
            resourceIds: t.resourceIds.filter((id) => id !== resourceId),
          })),
        }));
      },
    }),
    {
      name: "local-project.projects.v1",
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
