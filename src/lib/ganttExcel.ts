import { getComputedTasks } from "./schedule";
import { projectCal } from "./cpm";
import { dayNum, isoOf, todayISO, weekdayOf } from "./calendar";
import { DEFAULT_TASK_COLOR } from "./colors";
import { downloadBlob, localeOf, safeFileName } from "./format";
import { translate, type Language } from "./i18n";
import { buildXlsx, XLSX_MIME, colLetter, type CellInput } from "./xlsx";
import type { ComputedTask, ID, Project, Zoom } from "./types";

/** "Excel" button of the Gantt (manual chapter 06): an .xlsx with the task table and the
 * Gantt painted in cells at the chosen scale (day, week or month), ready to print on A4
 * landscape. */

export interface GanttExcelOptions {
  collapsedIds?: Set<ID>;
  onlyCritical?: boolean;
  /** Paint critical tasks red (default true). */
  showCritical?: boolean;
}

interface Bucket {
  start: number;
  end: number;
  label: string;
  group: string;
  nonWorking: boolean;
  today: boolean;
}

const CHAPTER_FILL = "#262626";
const CRITICAL_FILL = "#dc2626";
const NONWORK_FILL = "#eef2f6";
const HEADER_FILL = "#16a34a";

function visibleRows(computed: ComputedTask[], opts: GanttExcelOptions): ComputedTask[] {
  const parentById = new Map(computed.map((t) => [t.id, t.parentId]));
  const collapsed = opts.collapsedIds ?? new Set<ID>();
  let rows = computed.filter((t) => {
    let p = t.parentId;
    while (p) {
      if (collapsed.has(p)) return false;
      p = parentById.get(p) ?? null;
    }
    return true;
  });
  if (opts.onlyCritical) {
    const keep = new Set<ID>();
    for (const t of computed) {
      if (t.isSummary || !t.critical) continue;
      keep.add(t.id);
      let p = t.parentId;
      while (p) {
        keep.add(p);
        p = parentById.get(p) ?? null;
      }
    }
    rows = rows.filter((t) => keep.has(t.id));
  }
  return rows;
}

function buildBuckets(start: number, end: number, zoom: Zoom, lang: string, isWork: (d: number) => boolean): Bucket[] {
  const locale = localeOf(lang);
  const monthLong = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const monthShort = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const dateOf = (d: number) => new Date(d * 86400000);
  const today = dayNum(todayISO());
  const out: Bucket[] = [];
  if (zoom === "day") {
    // Whole weeks, Monday to Sunday.
    const s = start - ((weekdayOf(start) + 6) % 7);
    const e = end + ((7 - weekdayOf(end)) % 7);
    for (let d = s; d <= e && out.length < 3000; d++) {
      out.push({
        start: d,
        end: d,
        label: String(dateOf(d).getUTCDate()),
        group: monthLong.format(dateOf(d)),
        nonWorking: !isWork(d),
        today: d === today,
      });
    }
  } else if (zoom === "week") {
    const s = start - ((weekdayOf(start) + 6) % 7);
    for (let d = s; d <= end && out.length < 1000; d += 7) {
      const iso = isoOf(d);
      out.push({
        start: d,
        end: d + 6,
        label: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`,
        group: monthLong.format(dateOf(d)),
        nonWorking: false,
        today: today >= d && today <= d + 6,
      });
    }
  } else {
    const first = dateOf(start);
    let y = first.getUTCFullYear();
    let m = first.getUTCMonth();
    for (let i = 0; i < 400; i++) {
      const s = Math.round(Date.UTC(y, m, 1) / 86400000);
      if (s > end) break;
      const e = Math.round(Date.UTC(y, m + 1, 1) / 86400000) - 1;
      out.push({
        start: s,
        end: e,
        label: monthShort.format(dateOf(s)).replace(".", ""),
        group: String(y),
        nonWorking: false,
        today: today >= s && today <= e,
      });
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
  }
  return out;
}

export function buildGanttXlsx(project: Project, zoom: Zoom, lang: string, opts: GanttExcelOptions = {}): Uint8Array {
  const t = (key: string) => translate((lang === "es" ? "es" : "en") as Language, key);
  const cal = projectCal(project);
  const computed = getComputedTasks(project);
  const rows = visibleRows(computed, opts);
  const showCritical = opts.showCritical ?? true;

  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    min = Math.min(min, dayNum(r.computedStart));
    max = Math.max(max, dayNum(r.computedEnd));
  }
  if (!Number.isFinite(min)) {
    min = dayNum(todayISO());
    max = min + 30;
  }
  const buckets = buildBuckets(min, max, zoom, lang, (d) => cal.isWork(d));

  const tableHeaders = [
    t("exColCode"),
    t("exColName"),
    t("exColDur"),
    t("exColStart"),
    t("exColFinish"),
    t("exColPhys"),
    t("exColFloat"),
  ];
  const TABLE_COLS = tableHeaders.length;
  const bucketWidth = zoom === "day" ? 2.7 : zoom === "week" ? 4.2 : 5;

  const head = { bold: true, fill: HEADER_FILL, color: "#ffffff", align: "center" as const, border: true };
  const title: CellInput[] = [
    { v: `${t("exGanttTitle")} · ${project.name}`, s: { bold: true, size: 13 } },
  ];
  const groupRow: CellInput[] = Array.from({ length: TABLE_COLS }, () => ({ v: null, s: head }));
  // Table headers live in row 2, merged down over row 3 (row 3 cells stay empty).
  const tickRow: CellInput[] = tableHeaders.map(() => ({ v: null, s: head }));
  const merges: string[] = [`A1:${colLetter(TABLE_COLS - 1)}1`];
  for (let c = 0; c < TABLE_COLS; c++) merges.push(`${colLetter(c)}2:${colLetter(c)}3`);
  // Table headers sit in row 2 (merged down to row 3).
  tableHeaders.forEach((h, i) => (groupRow[i] = { v: h, s: head }));

  let groupStart = 0;
  buckets.forEach((b, i) => {
    const col = TABLE_COLS + i;
    groupRow[col] = { v: i === groupStart ? b.group : null, s: { ...head, size: 9 } };
    tickRow[col] = {
      v: b.label,
      s: {
        bold: true,
        size: 8,
        align: "center",
        border: true,
        fill: b.today ? "#fee2e2" : b.nonWorking ? "#d4d4d4" : "#f5f5f5",
        color: b.today ? CRITICAL_FILL : "#404040",
      },
    };
    const next = buckets[i + 1];
    if (!next || next.group !== b.group) {
      if (i > groupStart) merges.push(`${colLetter(TABLE_COLS + groupStart)}2:${colLetter(col)}2`);
      groupStart = i + 1;
    }
  });

  const sheetRows: CellInput[][] = [title, groupRow, tickRow];
  for (const r of rows) {
    const bold = r.isSummary || undefined;
    const border = true;
    const row: CellInput[] = [
      { v: r.displayCode, s: { bold, border } },
      { v: `${"   ".repeat(r.depth)}${r.isMilestone ? "◆ " : ""}${r.name}`, s: { bold, border } },
      { v: r.computedDuration, s: { bold, border, align: "center", italic: r.elapsed || undefined } },
      { v: r.computedStart, date: true, s: { bold, border, align: "center" } },
      { v: r.computedEnd, date: true, s: { bold, border, align: "center" } },
      { v: Math.round(r.isSummary ? r.computedProgress : r.progress), s: { bold, border, align: "center" } },
      {
        v: r.totalFloat ?? null,
        s: { bold, border, align: "center", color: !r.isSummary && r.critical ? CRITICAL_FILL : undefined },
      },
    ];
    const s = dayNum(r.computedStart);
    const e = dayNum(r.computedEnd);
    const fill = r.isSummary
      ? CHAPTER_FILL
      : showCritical && r.critical
        ? CRITICAL_FILL
        : r.color || DEFAULT_TASK_COLOR;
    buckets.forEach((b) => {
      if (r.isMilestone) {
        if (s >= b.start && s <= b.end) {
          row.push({ v: "◆", s: { align: "center", bold: true, color: showCritical && r.critical ? CRITICAL_FILL : "#171717" } });
        } else row.push(b.nonWorking ? { v: null, s: { fill: NONWORK_FILL } } : null);
        return;
      }
      if (b.start <= e && b.end >= s) row.push({ v: null, s: { fill } });
      else row.push(b.nonWorking ? { v: null, s: { fill: NONWORK_FILL } } : null);
    });
    sheetRows.push(row);
  }

  return buildXlsx([
    {
      name: "Gantt",
      rows: sheetRows,
      colWidths: [9, 38, 6, 10, 10, 6, 7, ...buckets.map(() => bucketWidth)],
      freeze: { rows: 3, cols: TABLE_COLS },
      merges,
      landscape: true,
      fitToWidth: true,
      rowHeights: { 0: 20 },
      printTitleRows: [2, 3],
    },
  ]);
}

/** Downloads the Gantt as an .xlsx. */
export function exportGanttExcel(project: Project, zoom: Zoom, lang: string, opts?: GanttExcelOptions): void {
  const bytes = buildGanttXlsx(project, zoom, lang, opts);
  downloadBlob(new Blob([bytes as BlobPart], { type: XLSX_MIME }), `${safeFileName(project.name)}_gantt.xlsx`);
}
