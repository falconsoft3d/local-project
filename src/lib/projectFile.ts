import { v4 as uuid } from "uuid";
import type { Project } from "./types";

/** Self-describing JSON format for a project saved to disk — the same shape whether it
 * comes from the plain "Export" button or a file-linked "Open/Save to folder" project, so
 * any file this app ever wrote can be opened back by this app. */
export const PROJECT_FILE_FORMAT = "local-project";
export const PROJECT_FILE_VERSION = 1;

export interface ProjectFile extends Project {
  fileFormat: typeof PROJECT_FILE_FORMAT;
  fileVersion: typeof PROJECT_FILE_VERSION;
}

export function serializeProjectFile(project: Project): string {
  const file: ProjectFile = {
    fileFormat: PROJECT_FILE_FORMAT,
    fileVersion: PROJECT_FILE_VERSION,
    ...project,
  };
  return JSON.stringify(file, null, 2);
}

/** Parses a local-project JSON file. Accepts both the wrapped ProjectFile shape and the
 * older bare-Project shape (files exported before the wrapper existed). Preserves the
 * original id/createdAt when present, since file-linked projects need a stable identity
 * across saves. */
export function parseProjectFile(content: string): Project {
  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.tasks)) {
    throw new Error("Not a valid local-project file.");
  }
  const now = new Date().toISOString();
  return {
    id: typeof parsed.id === "string" && parsed.id ? parsed.id : uuid(),
    name: typeof parsed.name === "string" && parsed.name ? parsed.name : "Untitled project",
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : now,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : now,
    tasks: parsed.tasks,
    resources: Array.isArray(parsed.resources) ? parsed.resources : [],
    source: parsed.source,
  };
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && !!window.showOpenFilePicker && !!window.showSaveFilePicker;
}

export const PROJECT_FILE_PICKER_TYPES: FilePickerAcceptType[] = [
  {
    description: "LoocalProject file",
    accept: { "application/json": [".json"] },
  },
];
