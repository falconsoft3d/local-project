import { hasChildren } from "./tree";
import { resourceUnitPrice } from "./schedule";
import type { ID, Project, Resource, ResourceKind, Task } from "./types";

/** Budget mode: resources carry the costs and are classified as MO (labor), MAT (material),
 * EQ (equipment) or SC (subcontract). An item's unit price is the sum of its resources
 * (quantity per unit × price) unless it has an explicit budget price; its amount is
 * quantity × unit price. Chapters are only organisational: their amount is the sum of
 * their items. */

export const KIND_ORDER: ResourceKind[] = ["labor", "material", "equipment", "subcontract"];

export type KindTotals = Record<ResourceKind, number>;

export function emptyTotals(): KindTotals {
  return { labor: 0, material: 0, equipment: 0, subcontract: 0 };
}

export function assignmentPrice(task: Task, resource: Resource): number {
  return task.resourceAssignments?.[resource.id]?.price ?? resource.price ?? 0;
}

/** Per-unit cost of the task split by resource type. */
export function unitBreakdown(task: Task, project: Project): KindTotals {
  const out = emptyTotals();
  for (const rid of task.resourceIds) {
    const r = project.resources.find((x) => x.id === rid);
    const a = task.resourceAssignments?.[rid];
    if (!r || !a?.quantity) continue;
    out[r.kind ?? "labor"] += a.quantity * assignmentPrice(task, r);
  }
  return out;
}

/** True when the item's price comes from its resources (no explicit budget price). */
export function isPriceFromResources(task: Task, project: Project): boolean {
  return (task.unitPrice === undefined || task.unitPrice === null) && resourceUnitPrice(task, project) !== null;
}

export interface BudgetSummary {
  /** Amount per resource type, for items priced from their resources. */
  byKind: KindTotals;
  /** Items with their own price (no breakdown, or price overriding the resources). */
  unbroken: number;
  total: number;
  itemCount: number;
}

export function budgetSummary(project: Project): BudgetSummary {
  const byKind = emptyTotals();
  let unbroken = 0;
  let itemCount = 0;
  for (const t of project.tasks) {
    if (hasChildren(project.tasks, t.id)) continue;
    const qty = t.quantity ?? 1;
    if (isPriceFromResources(t, project)) {
      const b = unitBreakdown(t, project);
      for (const k of KIND_ORDER) byKind[k] += qty * b[k];
      itemCount++;
    } else if (t.unitPrice) {
      unbroken += qty * t.unitPrice;
      itemCount++;
    }
  }
  const total = KIND_ORDER.reduce((s, k) => s + byKind[k], 0) + unbroken;
  return { byKind, unbroken, total, itemCount };
}

export interface ResourceUsage {
  /** Total quantity of the resource in the whole budget (Σ item quantity × quantity per unit). */
  quantity: number;
  amount: number;
  items: number;
}

export function resourceUsage(project: Project): Map<ID, ResourceUsage> {
  const out = new Map<ID, ResourceUsage>();
  for (const t of project.tasks) {
    if (hasChildren(project.tasks, t.id)) continue;
    const qty = t.quantity ?? 1;
    for (const rid of t.resourceIds) {
      const r = project.resources.find((x) => x.id === rid);
      const a = t.resourceAssignments?.[rid];
      if (!r) continue;
      const u = out.get(rid) ?? { quantity: 0, amount: 0, items: 0 };
      const q = (a?.quantity ?? 0) * qty;
      u.quantity += q;
      u.amount += q * assignmentPrice(t, r);
      u.items += 1;
      out.set(rid, u);
    }
  }
  return out;
}

/** "Recalcular precios": drops explicit prices of items that have a resource breakdown, so
 * every such item is priced from its resources. */
export function recalcPricesFromResources(project: Project): Project {
  return {
    ...project,
    tasks: project.tasks.map((t) =>
      t.unitPrice !== undefined && resourceUnitPrice(t, project) !== null ? { ...t, unitPrice: undefined } : t,
    ),
  };
}
