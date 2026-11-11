import { v4 as uuid } from "uuid";
import { getComputedTasks, toISO } from "./schedule";
import { formatLinks, parseLinks } from "./links";
import { projectCal, isPerformanceDriven } from "./cpm";
import { taskFinishISO } from "./tracking";
import { insertAsLastChild } from "./tree";
import { buildXlsx, excelSerialToISO, type CellInput, type CellValue } from "./xlsx";
import type { MergeSummary } from "./msproject";
import type { ConstraintType, ID, Project, Task } from "./types";

/** Schedule table exchange with Excel (.xlsx) and CSV (manual chapter 11).
 * One row per chapter/task in outline order; tasks are recognised by their code on import. */

type ColumnKey =
  | "code"
  | "level"
  | "name"
  | "duration"
  | "elapsed"
  | "start"
  | "finish"
  | "predecessors"
  | "constraint"
  | "constraintDate"
  | "deadline"
  | "physical"
  | "certified"
  | "actualStart"
  | "actualFinish"
  | "color";

const COLUMNS: { key: ColumnKey; es: string; en: string; aliases: string[] }[] = [
  { key: "code", es: "Código", en: "Code", aliases: ["cod", "codigo", "code", "wbs", "edt", "id"] },
  { key: "level", es: "Nivel", en: "Level", aliases: ["nivel", "level", "outline level", "nivel de esquema"] },
  { key: "name", es: "Nombre", en: "Name", aliases: ["nombre", "name", "task name", "nombre de tarea", "resumen"] },
  { key: "duration", es: "Duración", en: "Duration", aliases: ["duracion", "duration", "dur", "dias", "days"] },
  { key: "elapsed", es: "Transcurrida", en: "Elapsed", aliases: ["transcurrida", "elapsed", "dt"] },
  { key: "start", es: "Inicio", en: "Start", aliases: ["inicio", "start", "comienzo", "fecha inicio"] },
  { key: "finish", es: "Fin", en: "Finish", aliases: ["fin", "finish", "end", "fecha fin"] },
  { key: "predecessors", es: "Predecesoras", en: "Predecessors", aliases: ["predecesoras", "predec", "predec.", "predecessors", "preds"] },
  { key: "constraint", es: "Restricción", en: "Constraint", aliases: ["restriccion", "constraint", "tipo de restriccion", "constraint type"] },
  { key: "constraintDate", es: "Fecha restricción", en: "Constraint date", aliases: ["fecha restriccion", "fecha de restriccion", "constraint date"] },
  { key: "deadline", es: "Fecha límite", en: "Deadline", aliases: ["fecha limite", "deadline"] },
  { key: "physical", es: "% Físico", en: "Physical %", aliases: ["% fisico", "% fis.", "% fis", "avance fisico", "physical %", "% complete", "% comp", "% completado", "progress"] },
  { key: "certified", es: "% Cert.", en: "% Cert.", aliases: ["% cert.", "% cert", "% certificado", "certified %", "certified"] },
  { key: "actualStart", es: "Comienzo real", en: "Actual start", aliases: ["comienzo real", "inicio real", "actual start"] },
  { key: "actualFinish", es: "Fin real", en: "Actual finish", aliases: ["fin real", "actual finish"] },
  { key: "color", es: "Color", en: "Color", aliases: ["color", "colour", "color en gantt"] },
];

export const CONSTRAINT_LABELS: Record<"es" | "en", Record<ConstraintType, string>> = {
  es: {
    ASAP: "Lo antes posible",
    ALAP: "Lo más tarde posible",
    SNET: "No comenzar antes del",
    SNLT: "No comenzar después del",
    FNET: "No terminar antes del",
    FNLT: "No terminar después del",
    MSO: "Debe comenzar el",
    MFO: "Debe terminar el",
  },
  en: {
    ASAP: "As Soon As Possible",
    ALAP: "As Late As Possible",
    SNET: "Start No Earlier Than",
    SNLT: "Start No Later Than",
    FNET: "Finish No Earlier Than",
    FNLT: "Finish No Later Than",
    MSO: "Must Start On",
    MFO: "Must Finish On",
  },
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseConstraint(v: string): ConstraintType | undefined {
  const n = norm(v);
  if (!n) return undefined;
  const upper = v.trim().toUpperCase();
  if (["ASAP", "ALAP", "SNET", "SNLT", "FNET", "FNLT", "MSO", "MFO"].includes(upper)) {
    return upper as ConstraintType;
  }
  for (const lang of ["es", "en"] as const) {
    for (const [code, label] of Object.entries(CONSTRAINT_LABELS[lang])) {
      if (norm(label) === n) return code as ConstraintType;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------
// Export

interface TableRow {
  summary: boolean;
  color?: string;
  values: Record<ColumnKey, string | number | null>;
}

function tableRows(project: Project, lang: string): TableRow[] {
  const l = lang === "es" ? "es" : "en";
  const computed = getComputedTasks(project);
  const codeById = new Map(computed.map((c) => [c.id, c.displayCode]));
  return computed.map((c) => ({
    summary: c.isSummary,
    color: c.color,
    values: {
      code: c.displayCode,
      level: c.depth + 1,
      name: c.name,
      duration: c.computedDuration,
      elapsed: !c.isSummary && c.elapsed ? (l === "es" ? "Sí" : "Yes") : "",
      start: c.computedStart,
      finish: c.computedEnd,
      predecessors: formatLinks(c.predecessors, codeById, lang),
      constraint: c.constraint && c.constraint !== "ASAP" ? CONSTRAINT_LABELS[l][c.constraint] : "",
      constraintDate: c.constraint && c.constraint !== "ASAP" && c.constraint !== "ALAP" ? c.constraintDate ?? "" : "",
      deadline: c.deadline ?? "",
      physical: c.isSummary ? c.computedProgress : c.progress,
      certified: Math.round((c.isSummary ? c.computedCertified : c.certified ?? 0) * 10) / 10,
      actualStart: c.isSummary ? "" : c.actualStart ?? "",
      actualFinish: c.isSummary ? "" : c.actualFinish ?? "",
      color: c.isSummary ? "" : c.color ?? "",
    },
  }));
}

function headers(lang: string): string[] {
  return COLUMNS.map((c) => (lang === "es" ? c.es : c.en));
}

function csvField(v: string | number | null, lang: string): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? (lang === "es" ? String(v).replace(".", ",") : String(v)) : v;
  if (/[;",\n\r]/.test(s) || s !== s.trim()) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV with ";" separator and a UTF-8 BOM so Spanish Excel opens it straight away. */
export function exportScheduleCsv(project: Project, lang: string): string {
  const lines = [headers(lang).map((h) => csvField(h, lang)).join(";")];
  for (const r of tableRows(project, lang)) {
    lines.push(COLUMNS.map((c) => csvField(r.values[c.key], lang)).join(";"));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

const DATE_KEYS = new Set<ColumnKey>(["start", "finish", "constraintDate", "deadline", "actualStart", "actualFinish"]);

export function exportScheduleXlsx(project: Project, lang: string): Uint8Array {
  const head: CellInput[] = headers(lang).map((h) => ({
    v: h,
    s: { bold: true, fill: "#16a34a", color: "#ffffff", border: true, align: "center", wrap: true },
  }));
  const rows: CellInput[][] = [head];
  for (const r of tableRows(project, lang)) {
    rows.push(
      COLUMNS.map((c) => {
        const v = r.values[c.key];
        const base = { border: true, bold: r.summary || undefined };
        if (DATE_KEYS.has(c.key) && v) return { v, date: true, s: { ...base, align: "center" as const } };
        if (c.key === "color" && typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) {
          return { v, s: { ...base, fill: v, color: "#ffffff" } };
        }
        return { v, s: base };
      }),
    );
  }
  return buildXlsx([
    {
      name: lang === "es" ? "Programación" : "Schedule",
      rows,
      colWidths: [10, 7, 42, 9, 11, 11, 11, 22, 22, 12, 12, 9, 9, 12, 12, 9],
      freeze: { rows: 1, cols: 3 },
      landscape: true,
      fitToWidth: true,
      rowHeights: { 0: 30 },
      printTitleRows: [1, 1],
    },
  ]);
}

// ---------------------------------------------------------------------------------------
// Parsing

/** Tolerant CSV parser: quotes, "" escapes, ; , or tab separators, CRLF/LF. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => {
    let n = 0;
    let inQ = false;
    for (const c of firstLine) {
      if (c === '"') inQ = !inQ;
      else if (c === ch && !inQ) n++;
    }
    return n;
  };
  const counts: [string, number][] = [
    [";", count(";")],
    [",", count(",")],
    ["\t", count("\t")],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  const sep = counts[0][1] > 0 ? counts[0][0] : ";";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

function cellString(v: CellValue): string {
  if (v === null || v === undefined) return "";
  return typeof v === "number" ? String(v) : String(v).trim();
}

function parseNumber(v: CellValue): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  let s = v.trim().replace(/%$/, "").replace(/\s*(dt|ed|d|días|dias|days?)$/i, "").trim();
  if (!s) return undefined;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function parseDateCell(v: CellValue): string | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") {
    return v > 20000 && v < 80000 ? excelSerialToISO(v) : undefined;
  }
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) return excelSerialToISO(n);
  return undefined;
}

function truthy(v: CellValue): boolean {
  const n = norm(cellString(v));
  return ["si", "s", "yes", "y", "1", "x", "true", "verdadero", "dt", "ed"].includes(n);
}

export interface TableImportOptions {
  createMissing?: boolean;
}

export interface TableImportSummary extends MergeSummary {
  invalidLinks: string[];
}

/** Imports an Excel/CSV schedule table into an existing project. Rows are matched by code
 * (budget code or WBS); the predecessors of every row present in the file are replaced. */
export function importScheduleTable(
  project: Project,
  grid: CellValue[][],
  opts: TableImportOptions,
): { project: Project; summary: TableImportSummary } {
  // Header detection.
  let headerRow = -1;
  let colOf = new Map<ColumnKey, number>();
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const found = new Map<ColumnKey, number>();
    (grid[r] ?? []).forEach((cell, ci) => {
      const h = norm(cellString(cell));
      if (!h) return;
      const col = COLUMNS.find((c) => norm(c.es) === h || norm(c.en) === h || c.aliases.includes(h));
      if (col && !found.has(col.key)) found.set(col.key, ci);
    });
    if (found.size >= 2 && found.has("code")) {
      headerRow = r;
      colOf = found;
      break;
    }
  }
  if (headerRow === -1) {
    // No recognisable header: assume the export's column order.
    COLUMNS.forEach((c, i) => colOf.set(c.key, i));
  }
  const has = (k: ColumnKey) => colOf.has(k);
  const val = (row: CellValue[], k: ColumnKey): CellValue => {
    const i = colOf.get(k);
    return i === undefined ? null : row[i] ?? null;
  };

  const cal = projectCal(project);
  const computed = getComputedTasks(project);
  const byCode = new Map<string, ID>();
  const byWbs = new Map<string, ID>();
  for (const c of computed) {
    if (c.displayCode) byCode.set(c.displayCode, c.id);
    if (c.wbs) byWbs.set(c.wbs, c.id);
  }
  const depthById = new Map(computed.map((c) => [c.id, c.depth]));

  let tasks = [...project.tasks];
  const matched = new Set<ID>();
  const created = new Set<ID>();
  let notFound = 0;
  const rowTask: { row: CellValue[]; id: ID }[] = [];
  const parentStack: (ID | null)[] = [];

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const code = cellString(val(row, "code"));
    const name = cellString(val(row, "name"));
    if (!code && !name) continue;
    const levelNum = parseNumber(val(row, "level"));
    let id = code ? byCode.get(code) ?? byWbs.get(code) : undefined;
    if (id && matched.has(id)) id = undefined;
    let depth = levelNum !== undefined ? Math.max(0, Math.round(levelNum) - 1) : id ? depthById.get(id) ?? 0 : 0;
    if (id) {
      matched.add(id);
    } else if (opts.createMissing && name) {
      depth = Math.min(depth, parentStack.length);
      const parentId = depth > 0 ? parentStack[depth - 1] ?? null : null;
      id = uuid();
      const t: Task = {
        id,
        name,
        code: code || undefined,
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
      parentStack.length = depth;
      parentStack[depth] = null;
      continue;
    }
    parentStack.length = depth;
    parentStack[depth] = id;
    rowTask.push({ row, id });
  }

  const parentIds = new Set(tasks.map((t) => t.parentId).filter(Boolean) as ID[]);
  const working: Project = { ...project, tasks };
  const updates = new Map<ID, Task>();
  for (const { row, id } of rowTask) {
    const t0 = tasks.find((t) => t.id === id)!;
    if (parentIds.has(id)) continue; // chapters: dates roll up from their tasks
    const t: Task = { ...t0 };
    if (has("elapsed")) t.elapsed = truthy(val(row, "elapsed")) || undefined;
    const durCell = val(row, "duration");
    if (typeof durCell === "string" && /\b(dt|ed)\s*$/i.test(durCell.trim())) t.elapsed = true;
    const dur = parseNumber(durCell);
    const locked = isPerformanceDriven(t, working);
    const start = parseDateCell(val(row, "start"));
    if (start) t.start = t.elapsed || dur === 0 ? start : cal.snapISO(start);
    if (dur !== undefined && !locked) t.duration = Math.max(0, Math.round(dur));
    else if (!locked && has("finish") && (dur === undefined || !has("duration"))) {
      const finish = parseDateCell(val(row, "finish"));
      if (finish && finish >= t.start) {
        t.duration = Math.max(1, t.elapsed ? Math.round((Date.parse(finish) - Date.parse(t.start)) / 86400000) + 1 : cal.workDaysInclusive(t.start, finish));
      }
    }
    if (has("constraint")) {
      const c = parseConstraint(cellString(val(row, "constraint")));
      t.constraint = c && c !== "ASAP" ? c : undefined;
      t.constraintDate = t.constraint && t.constraint !== "ALAP" ? parseDateCell(val(row, "constraintDate")) ?? t.constraintDate : undefined;
      if (t.constraint && t.constraint !== "ALAP" && !t.constraintDate) t.constraint = undefined;
    }
    if (has("deadline")) t.deadline = parseDateCell(val(row, "deadline"));
    if (has("physical")) {
      const p = parseNumber(val(row, "physical"));
      t.progress = Math.min(100, Math.max(0, p ?? 0));
    }
    if (has("certified")) {
      const c = parseNumber(val(row, "certified"));
      t.certified = c ? Math.min(100, Math.max(0, c)) : t0.certified !== undefined ? 0 : undefined;
    }
    if (has("actualStart")) t.actualStart = parseDateCell(val(row, "actualStart"));
    if (has("actualFinish")) t.actualFinish = parseDateCell(val(row, "actualFinish"));
    if (has("color")) {
      const c = cellString(val(row, "color"));
      t.color = /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : undefined;
    }
    // Progress ↔ actual dates, as in the Gantt.
    if (t.actualFinish) t.progress = 100;
    if (t.progress > 0 && !t.actualStart) t.actualStart = t.start;
    if (t.actualStart) t.start = t.actualStart;
    if (t.progress >= 100 && !t.actualFinish) t.actualFinish = taskFinishISO(t, working, cal);
    if (t.progress <= 0 && !t.actualFinish) t.actualStart = has("actualStart") ? t.actualStart : undefined;
    updates.set(id, t);
  }
  tasks = tasks.map((t) => updates.get(t.id) ?? t);

  // Predecessors: clear those of every row first, then parse (so cycle checks see the
  // file's graph, not the old one).
  const invalidLinks: string[] = [];
  if (has("predecessors")) {
    const rowIds = new Set(rowTask.map((r) => r.id));
    tasks = tasks.map((t) => (rowIds.has(t.id) ? { ...t, predecessors: [] } : t));
    const fresh = getComputedTasks({ ...project, tasks });
    const codeIndex = new Map<string, ID>();
    for (const c of fresh) {
      if (c.wbs) codeIndex.set(c.wbs, c.id);
    }
    for (const c of fresh) {
      if (c.displayCode) codeIndex.set(c.displayCode, c.id);
    }
    const summaryIds = new Set(fresh.filter((c) => c.isSummary).map((c) => c.id));
    for (const { row, id } of rowTask) {
      const input = cellString(val(row, "predecessors"));
      if (!input) continue;
      const parsed = parseLinks(input, id, codeIndex, summaryIds, tasks);
      invalidLinks.push(...parsed.errors);
      tasks = tasks.map((t) => (t.id === id ? { ...t, predecessors: parsed.links } : t));
    }
  }

  return {
    project: { ...project, tasks },
    summary: { updated: matched.size, created: created.size, notFound, invalidLinks },
  };
}
