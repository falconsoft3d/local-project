import { v4 as uuid } from "uuid";
import { RESOURCE_COLORS } from "./colors";
import { snapToBusinessDay, toISO } from "./schedule";
import type { Project, Resource, ResourceKind, Task } from "./types";

/** FIEBDC-3 (BC3) import — Spanish construction cost-breakdown format.
 *
 * Record types we use:
 *  ~V  version header ("FIEBDC-3/....")
 *  ~C  concept: code|unit|summary|price|date|type  (type: 0=partida/chapter, 1=mano de obra,
 *      2=maquinaria, 3=material)
 *  ~D  decomposition: parentCode|child\factor\qty\child2\factor2\qty2\...
 *      (the parent field conventionally carries a trailing "#" even when the concept's own
 *      code has none — we resolve it by trying the field as-is, then with the "#" stripped)
 *  ~T  long text/description for a concept
 * ~K (config) and ~M (mediciones/measurements) are not used — BC3 carries no scheduling
 * data at all, so imported tasks get a default 1-day duration; the "Adjust" feature is the
 * intended next step to size and chain them.
 */

interface RawConcept {
  code: string;
  unit: string;
  summary: string;
  type: number;
}

interface DecompChild {
  child: string;
  qty: number;
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
      const [code, unit, summary, , , typeStr] = fields;
      if (!code) continue;
      concepts.set(code, {
        code,
        unit: unit ?? "",
        summary: summary ?? "",
        type: Number(typeStr) || 0,
      });
    } else if (tag === "D") {
      const [parentRaw, childrenRaw] = fields;
      if (!parentRaw || !childrenRaw) continue;
      const tokens = childrenRaw.split("\\");
      const list: DecompChild[] = [];
      for (let i = 0; i + 1 < tokens.length; i += 3) {
        const child = tokens[i];
        const qty = Number(tokens[i + 2]) || 0;
        if (child) list.push({ child, qty });
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
      sourceUid: code,
    });
    resourceIdByCode.set(code, id);
    return id;
  }

  function collectResources(code: string, seen: Set<string>): Set<string> {
    const result = new Set<string>();
    for (const { child } of decomp.get(code) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      const concept = concepts.get(child);
      if (!concept) continue;
      if (concept.type === 0) {
        for (const rid of collectResources(child, seen)) result.add(rid);
      } else {
        const rid = getOrCreateResource(child);
        if (rid) result.add(rid);
      }
    }
    return result;
  }

  const tasks: Task[] = [];
  const today = snapToBusinessDay(toISO(new Date()));

  function buildNode(code: string, parentId: string | null, visiting: Set<string>) {
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
        predecessorIds: [],
        sourceUid: code,
      });
      for (const { child } of decomp.get(code) ?? []) {
        buildNode(child, id, nextVisiting);
      }
    } else {
      const resourceIds = Array.from(collectResources(code, new Set(nextVisiting)));
      tasks.push({
        id,
        name: concept.summary || code,
        start: today,
        duration: 1,
        progress: 0,
        parentId,
        resourceIds,
        predecessorIds: [],
        notes: texts.get(code),
        sourceUid: code,
      });
    }
  }

  for (const { child } of decomp.get(rootCode) ?? []) {
    buildNode(child, null, new Set([rootCode]));
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
