import { v4 as uuid } from "uuid";
import { RESOURCE_COLORS } from "./colors";
import { snapToBusinessDay, toISO } from "./schedule";
import type { Project, Resource, ResourceKind, Task } from "./types";

/** FIEBDC-3 (BC3) import — Spanish construction cost-breakdown format.
 *
 * Record types we use:
 *  ~V  version header ("FIEBDC-3/....")
 *  ~C  concept: code|unit|summary|price|date|type  (type: 0=partida/chapter, 1=mano de obra,
 *      2=maquinaria, 3=material). Price may hold several values separated by "\"; the first
 *      is used.
 *  ~D  decomposition: parentCode|child\factor\qty\child2\factor2\qty2\...
 *      For a chapter, qty is the measured quantity of each partida; for a partida, the yield
 *      of each resource per unit of the partida.
 *      (the parent field conventionally carries a trailing "#" even when the concept's own
 *      code has none — we resolve it by trying the field as-is, then with the "#" stripped)
 *  ~T  long text/description for a concept
 * ~K (config) and ~M (mediciones/measurements) are not used — BC3 carries no scheduling
 * data at all, so imported tasks get a default 1-day duration; the "Adjust" feature is the
 * intended next step to size and chain them. Quantities, units and prices are imported so
 * amounts, earned value and the resource histogram work straight away. */

interface RawConcept {
  code: string;
  unit: string;
  summary: string;
  price: number;
  type: number;
}

interface DecompChild {
  child: string;
  qty: number;
}

function parsePrice(raw: string | undefined): number {
  const first = (raw ?? "").split("\\")[0].trim();
  const n = Number(first.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function isBc3(content: string): boolean {
  const head = content.slice(0, 400);
  return head.includes("~V|") && head.toUpperCase().includes("FIEBDC");
}

/** ~D parent/child code references don't always match a concept's own ~C code exactly —
 * exporters commonly add or drop a trailing "#" (e.g. a concept coded "A1#" gets referenced
 * as "A1", or a concept coded "A11" gets referenced as "A11#"). Try both directions. */
function resolveCode(field: string, concepts: Map<string, RawConcept>): string {
  if (concepts.has(field)) return field;
  const stripped = field.replace(/#+$/, "");
  if (concepts.has(stripped)) return stripped;
  const withHash = `${field}#`;
  if (concepts.has(withHash)) return withHash;
  return field;
}

export function parseBc3(content: string, fileName: string): Project {
  const lines = content.split(/\r\n|\r|\n/);
  const concepts = new Map<string, RawConcept>();
  const rawDecomp = new Map<string, DecompChild[]>();
  const texts = new Map<string, string>();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("~") || line.length < 2) continue;
    const tag = line[1];
    const parts = line.split("|");
    const fields = parts.slice(1, parts.length - 1);

    if (tag === "C") {
      const [code, unit, summary, priceStr, , typeStr] = fields;
      if (!code) continue;
      concepts.set(code, {
        code,
        unit: unit ?? "",
        summary: summary ?? "",
        price: parsePrice(priceStr),
        type: Number(typeStr) || 0,
      });
    } else if (tag === "D") {
      const [parentRaw, childrenRaw] = fields;
      if (!parentRaw || !childrenRaw) continue;
      const tokens = childrenRaw.split("\\");
      const list: DecompChild[] = [];
      for (let i = 0; i + 1 < tokens.length; i += 3) {
        const child = tokens[i];
        const factorRaw = (tokens[i + 1] ?? "").trim();
        const factor = factorRaw === "" ? 1 : Number(factorRaw.replace(",", ".")) || 0;
        const qty = Number((tokens[i + 2] ?? "").replace(",", ".")) || 0;
        if (child) list.push({ child, qty: factor * qty });
      }
      if (list.length) rawDecomp.set(parentRaw, list);
    } else if (tag === "T") {
      const [code, text] = fields;
      if (code && text) {
        texts.set(code, texts.has(code) ? `${texts.get(code)} ${text}` : text);
      }
    }
    // ~V, ~K, ~M are not needed for scheduling and are skipped.
  }

  if (concepts.size === 0 || rawDecomp.size === 0) {
    throw new Error("Invalid or unsupported BC3 file.");
  }

  const decomp = new Map<string, DecompChild[]>();
  for (const [parentRaw, list] of rawDecomp) {
    const resolvedList = list.map(({ child, qty }) => ({
      child: resolveCode(child, concepts),
      qty,
    }));
    decomp.set(resolveCode(parentRaw, concepts), resolvedList);
  }

  const allParents = new Set(decomp.keys());
  const allChildren = new Set<string>();
  for (const list of decomp.values()) {
    for (const { child } of list) allChildren.add(child);
  }
  let rootCode = [...allParents].find((c) => !allChildren.has(c));
  if (!rootCode) rootCode = [...decomp.keys()][decomp.size - 1];

  function isChapter(code: string): boolean {
    const concept = concepts.get(code);
    if (!concept || concept.type !== 0) return false;
    const children = decomp.get(code);
    if (!children || children.length === 0) return false;
    return children.every(({ child }) => concepts.get(child)?.type === 0);
  }

  const resources: Resource[] = [];
  const resourceIdByCode = new Map<string, string>();

  function getOrCreateResource(code: string): string | null {
    const existing = resourceIdByCode.get(code);
    if (existing) return existing;
    const concept = concepts.get(code);
    if (!concept) return null;
    const kind: ResourceKind =
      concept.type === 1 ? "labor" : concept.type === 2 ? "equipment" : "material";
    const id = uuid();
    resources.push({
      id,
      name: concept.summary || code,
      color: RESOURCE_COLORS[resources.length % RESOURCE_COLORS.length],
      kind,
      code: code.replace(/#+$/, ""),
      unit: concept.unit || undefined,
      price: concept.price || undefined,
      sourceUid: code,
    });
    resourceIdByCode.set(code, id);
    return id;
  }

  /** Resources of a partida with their yield per unit of the partida. Auxiliary
   * sub-partidas (type 0 with their own decomposition) are flattened, multiplying yields. */
  function collectResources(code: string, path: Set<string>, multiplier = 1, result = new Map<string, number>()): Map<string, number> {
    for (const { child, qty } of decomp.get(code) ?? []) {
      if (path.has(child)) continue;
      const concept = concepts.get(child);
      if (!concept) continue;
      if (concept.type === 0) {
        if (decomp.has(child)) {
          collectResources(child, new Set(path).add(child), multiplier * qty, result);
        }
      } else {
        const rid = getOrCreateResource(child);
        if (rid) result.set(rid, (result.get(rid) ?? 0) + multiplier * qty);
      }
    }
    return result;
  }

  const tasks: Task[] = [];
  const today = snapToBusinessDay(toISO(new Date()));

  const cleanCode = (code: string) => code.replace(/#+$/, "");
  const round = (n: number) => Math.round(n * 1e6) / 1e6;

  function buildNode(code: string, parentId: string | null, visiting: Set<string>, quantity: number) {
    if (visiting.has(code)) return;
    const concept = concepts.get(code);
    if (!concept) return;
    const id = uuid();
    const nextVisiting = new Set(visiting).add(code);

    if (isChapter(code)) {
      tasks.push({
        id,
        name: concept.summary || code,
        start: today,
        duration: 1,
        progress: 0,
        parentId,
        resourceIds: [],
        predecessors: [],
        code: cleanCode(code),
        sourceUid: code,
      });
      for (const { child, qty } of decomp.get(code) ?? []) {
        buildNode(child, id, nextVisiting, qty);
      }
    } else {
      const yields = collectResources(code, new Set(nextVisiting));
      const resourceIds = Array.from(yields.keys());
      const resourceAssignments: NonNullable<Task["resourceAssignments"]> = {};
      for (const [rid, y] of yields) resourceAssignments[rid] = { quantity: round(y) };
      tasks.push({
        id,
        name: concept.summary || code,
        start: today,
        duration: 1,
        progress: 0,
        parentId,
        resourceIds,
        resourceAssignments,
        predecessors: [],
        notes: texts.get(code),
        code: cleanCode(code),
        unit: concept.unit || undefined,
        quantity: round(quantity),
        unitPrice: concept.price || undefined,
        sourceUid: code,
      });
    }
  }

  for (const { child, qty } of decomp.get(rootCode) ?? []) {
    buildNode(child, null, new Set([rootCode]), qty || 1);
  }

  const rootConcept = concepts.get(rootCode);
  const name =
    rootConcept?.summary?.trim() ||
    fileName.replace(/\.bc3$/i, "").trim() ||
    "Imported BC3 project";

  const now = new Date().toISOString();
  return {
    id: uuid(),
    name,
    createdAt: now,
    updatedAt: now,
    tasks,
    resources,
  };
}
