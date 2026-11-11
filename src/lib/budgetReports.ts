import { hasChildren, wbsNumbers } from "./tree";
import { taskCost, taskUnitPrice } from "./schedule";
import { KIND_ORDER, assignmentPrice, budgetSummary, resourceUsage } from "./budget";
import { buildXlsx, XLSX_MIME, type CellInput, type CellStyle } from "./xlsx";
import { downloadBlob, safeFileName } from "./format";
import type { ID, Project, ResourceKind } from "./types";

/** Budget reports (PDF via print and Excel):
 *  - Budget down to chapters, items or resources (unit-price breakdowns).
 *  - Resource quantity report grouped by type (MO, MAT, EQ, SC).
 * Both share one row model so the on-screen/PDF view and the Excel file always match. */

export type BudgetLevel = "chapters" | "items" | "resources";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface BudgetRow {
  kind: "chapter" | "item" | "resource";
  depth: number;
  code: string;
  /** Resource type (resource rows). */
  resourceKind?: ResourceKind;
  name: string;
  unit?: string;
  /** Item quantity, or yield per item unit for resource rows. */
  quantity?: number;
  price?: number;
  /** Item / chapter amount, or amount per item unit for resource rows. */
  amount: number;
}

export interface BudgetReport {
  rows: BudgetRow[];
  /** Top-level chapters (and loose items) with their amount — the summary page. */
  chapters: { code: string; name: string; amount: number }[];
  byKind: Record<ResourceKind, number>;
  unbroken: number;
  total: number;
}

export function buildBudgetReport(project: Project, level: BudgetLevel): BudgetReport {
  const tasks = project.tasks;
  const wbs = wbsNumbers(tasks);
  const parentIds = new Set(tasks.map((t) => t.parentId).filter(Boolean) as ID[]);
  const depth = new Map<ID, number>();
  const amounts = new Map<ID, number>();
  // Amounts bottom-up (tasks are kept in pre-order, so walk backwards).
  for (let i = tasks.length - 1; i >= 0; i--) {
    const t = tasks[i];
    const own = parentIds.has(t.id) ? amounts.get(t.id) ?? 0 : taskCost(t, project);
    amounts.set(t.id, own);
    if (t.parentId) amounts.set(t.parentId, (amounts.get(t.parentId) ?? 0) + own);
  }
  const rows: BudgetRow[] = [];
  for (const t of tasks) {
    const d = t.parentId ? (depth.get(t.parentId) ?? 0) + 1 : 0;
    depth.set(t.id, d);
    const code = t.code?.trim() || wbs.get(t.id) || "";
    if (hasChildren(tasks, t.id)) {
      rows.push({ kind: "chapter", depth: d, code, name: t.name, amount: amounts.get(t.id) ?? 0 });
      continue;
    }
    // Milestones carry no budget.
    if (t.duration === 0 && t.resourceIds.length === 0 && taskCost(t, project) === 0) continue;
    if (level === "chapters") continue;
    rows.push({
      kind: "item",
      depth: d,
      code,
      name: t.name,
      unit: t.unit,
      quantity: t.quantity ?? 1,
      price: taskUnitPrice(t, project),
      amount: amounts.get(t.id) ?? 0,
    });
    if (level !== "resources") continue;
    for (const rid of t.resourceIds) {
      const r = project.resources.find((x) => x.id === rid);
      if (!r) continue;
      const q = t.resourceAssignments?.[rid]?.quantity ?? 0;
      const price = assignmentPrice(t, r);
      rows.push({
        kind: "resource",
        depth: d + 1,
        code: r.code ?? "",
        resourceKind: r.kind ?? "labor",
        name: r.name,
        unit: r.unit,
        quantity: q,
        price,
        amount: q * price,
      });
    }
  }
  const chapters = tasks
    .filter((t) => !t.parentId)
    .map((t) => ({ code: t.code?.trim() || wbs.get(t.id) || "", name: t.name, amount: amounts.get(t.id) ?? 0 }))
    .filter((c) => c.amount !== 0 || rows.some((r) => r.code === c.code));
  const s = budgetSummary(project);
  return { rows, chapters, byKind: s.byKind, unbroken: s.unbroken, total: s.total };
}

export interface QuantityRow {
  id: ID;
  code: string;
  name: string;
  unit?: string;
  quantity: number;
  price: number;
  amount: number;
  items: number;
}

export interface QuantityGroup {
  kind: ResourceKind;
  rows: QuantityRow[];
  amount: number;
}

export interface QuantityReport {
  groups: QuantityGroup[];
  total: number;
}

/** "Cuantitativo de recursos": total quantity of every resource in the budget (Σ item
 * quantity × yield), grouped by type. Only resources used in the budget are listed. */
export function buildQuantityReport(project: Project, kinds: ResourceKind[] = KIND_ORDER): QuantityReport {
  const usage = resourceUsage(project);
  const groups: QuantityGroup[] = [];
  for (const kind of KIND_ORDER) {
    if (!kinds.includes(kind)) continue;
    const rows: QuantityRow[] = project.resources
      .filter((r) => (r.kind ?? "labor") === kind)
      .map((r) => {
        const u = usage.get(r.id);
        const quantity = u?.quantity ?? 0;
        const amount = u?.amount ?? 0;
        return {
          id: r.id,
          code: r.code ?? "",
          name: r.name,
          unit: r.unit,
          quantity,
          // Average price actually applied (per-item overrides included).
          price: quantity > 0 ? amount / quantity : r.price ?? 0,
          amount,
          items: u?.items ?? 0,
        };
      })
      .filter((r) => r.quantity > 0 || r.amount > 0)
      .sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, undefined, { numeric: true }));
    if (rows.length === 0) continue;
    groups.push({ kind, rows, amount: rows.reduce((s, r) => s + r.amount, 0) });
  }
  return { groups, total: groups.reduce((s, g) => s + g.amount, 0) };
}

// ── Excel ───────────────────────────────────────────────────────────────────────────────

const HEAD: CellStyle = { bold: true, fill: "#E5E7EB", border: true };
const TITLE: CellStyle = { bold: true, size: 14 };
const SUB: CellStyle = { italic: true, color: "#6B7280" };
const CHAPTER: CellStyle = { bold: true, fill: "#F3F4F6" };
const TOTAL: CellStyle = { bold: true, fill: "#DCFCE7", border: true };
const MONEY: CellStyle = { numFmt: "money" };
const DEC: CellStyle = { numFmt: "dec2" };

function cell(v: string | number | undefined, s?: CellStyle): CellInput {
  return v === undefined ? null : { v, s };
}

function headerRows(project: Project, title: string, subtitle: string, t: Translate, cols: number): CellInput[][] {
  const pad = (n: number) => Array.from({ length: Math.max(0, n) }, () => null as CellInput);
  return [
    [cell(project.name, TITLE), ...pad(cols - 1)],
    [cell(`${title} · ${subtitle}`, { bold: true }), ...pad(cols - 1)],
    [cell(`${t("repGenerated")}: ${new Date().toLocaleDateString()}`, SUB), ...pad(cols - 1)],
    pad(cols),
  ];
}

export function budgetReportXlsx(project: Project, level: BudgetLevel, t: Translate): Uint8Array {
  const r = buildBudgetReport(project, level);
  const cols = 7;
  const rows: CellInput[][] = headerRows(project, t("repBudgetTitle"), t(`repLevel_${level}`), t, cols);
  const headIndex = rows.length;
  rows.push(
    [t("budCode"), t("budType"), t("budSummary"), t("budUnit"), t("budQuantity"), t("budPrice"), t("budAmount")].map((h) =>
      cell(h, HEAD),
    ),
  );
  for (const row of r.rows) {
    const indent = "   ".repeat(row.depth);
    if (row.kind === "chapter") {
      rows.push([
        cell(row.code, CHAPTER),
        cell(t("budChapter"), CHAPTER),
        cell(indent + row.name, CHAPTER),
        cell("", CHAPTER),
        cell("", CHAPTER),
        cell("", CHAPTER),
        cell(row.amount, { ...CHAPTER, numFmt: "money" }),
      ]);
    } else if (row.kind === "item") {
      rows.push([
        cell(row.code),
        cell(t("budItem")),
        cell(indent + row.name),
        cell(row.unit ?? ""),
        cell(row.quantity, DEC),
        cell(row.price, MONEY),
        cell(row.amount, { ...MONEY, bold: level === "resources" }),
      ]);
    } else {
      const s: CellStyle = { italic: true, color: "#4B5563" };
      rows.push([
        cell(row.code, s),
        cell(t(`kindShort_${row.resourceKind}`), { ...s, bold: true }),
        cell(indent + row.name, s),
        cell(row.unit ?? "", s),
        cell(row.quantity, { ...s, numFmt: "dec2" }),
        cell(row.price, { ...s, numFmt: "money" }),
        cell(row.amount, { ...s, numFmt: "money" }),
      ]);
    }
  }
  rows.push(Array.from({ length: cols }, () => null));
  // Summary by chapter and by resource type.
  rows.push([cell(t("repChapterSummary"), { bold: true }), null, null, null, null, null, null]);
  for (const c of r.chapters) {
    rows.push([cell(c.code), null, cell(c.name), null, null, cell(r.total > 0 ? c.amount / r.total : 0, { numFmt: "pct" }), cell(c.amount, MONEY)]);
  }
  rows.push(Array.from({ length: cols }, () => null));
  rows.push([cell(t("repByType"), { bold: true }), null, null, null, null, null, null]);
  for (const k of KIND_ORDER) {
    rows.push([null, cell(t(`kindShort_${k}`), { bold: true }), cell(t(`kindLong_${k}`)), null, null, cell(r.total > 0 ? r.byKind[k] / r.total : 0, { numFmt: "pct" }), cell(r.byKind[k], MONEY)]);
  }
  rows.push([null, null, cell(t("budUnbroken")), null, null, cell(r.total > 0 ? r.unbroken / r.total : 0, { numFmt: "pct" }), cell(r.unbroken, MONEY)]);
  rows.push([cell("", TOTAL), cell("", TOTAL), cell(t("budTotal"), TOTAL), cell("", TOTAL), cell("", TOTAL), cell("", TOTAL), cell(r.total, { ...TOTAL, numFmt: "money" })]);

  return buildXlsx([
    {
      name: t("repBudgetSheet"),
      rows,
      colWidths: [12, 10, 54, 7, 12, 14, 16],
      freeze: { rows: headIndex + 1, cols: 0 },
      fitToWidth: true,
      printTitleRows: [headIndex + 1, headIndex + 1],
    },
  ]);
}

export function quantityReportXlsx(project: Project, kinds: ResourceKind[], t: Translate): Uint8Array {
  const r = buildQuantityReport(project, kinds);
  const cols = 7;
  const subtitle = kinds.length === KIND_ORDER.length ? t("budAll") : kinds.map((k) => t(`kindShort_${k}`)).join(", ");
  const rows: CellInput[][] = headerRows(project, t("repQuantityTitle"), subtitle, t, cols);
  const headIndex = rows.length;
  rows.push(
    [t("budCode"), t("budSummary"), t("budUnit"), t("repTotalQuantity"), t("budPrice"), t("budAmount"), t("budUsedIn")].map((h) =>
      cell(h, HEAD),
    ),
  );
  for (const g of r.groups) {
    rows.push([
      cell(t(`kindShort_${g.kind}`), CHAPTER),
      cell(t(`kindLong_${g.kind}`), CHAPTER),
      cell("", CHAPTER),
      cell("", CHAPTER),
      cell("", CHAPTER),
      cell(g.amount, { ...CHAPTER, numFmt: "money" }),
      cell("", CHAPTER),
    ]);
    for (const row of g.rows) {
      rows.push([cell(row.code), cell(row.name), cell(row.unit ?? ""), cell(row.quantity, DEC), cell(row.price, MONEY), cell(row.amount, MONEY), cell(row.items, { numFmt: "int" })]);
    }
  }
  rows.push([cell("", TOTAL), cell(t("repQuantityTotal"), TOTAL), cell("", TOTAL), cell("", TOTAL), cell("", TOTAL), cell(r.total, { ...TOTAL, numFmt: "money" }), cell("", TOTAL)]);
  return buildXlsx([
    {
      name: t("repQuantitySheet"),
      rows,
      colWidths: [12, 50, 7, 14, 14, 16, 9],
      freeze: { rows: headIndex + 1, cols: 0 },
      fitToWidth: true,
      printTitleRows: [headIndex + 1, headIndex + 1],
    },
  ]);
}

export function downloadXlsx(bytes: Uint8Array, project: Project, suffix: string) {
  downloadBlob(new Blob([bytes as BlobPart], { type: XLSX_MIME }), `${safeFileName(project.name)}_${suffix}.xlsx`);
}

