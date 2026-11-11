import type { ID, LagUnit, Link, LinkType, Task } from "./types";

/** Link type codes accepted when typing predecessors. Spanish and English codes never
 * collide: FC/FS → FS, CC/SS → SS, FF → FF, CF/SF → SF. */
const TYPE_CODES: Record<string, LinkType> = {
  FC: "FS",
  FS: "FS",
  CC: "SS",
  SS: "SS",
  FF: "FF",
  CF: "SF",
  SF: "SF",
};

const LABELS: Record<"es" | "en", Record<LinkType, string>> = {
  es: { FS: "FC", SS: "CC", FF: "FF", SF: "CF" },
  en: { FS: "FS", SS: "SS", FF: "FF", SF: "SF" },
};

export function linkTypeLabel(type: LinkType, lang: string): string {
  return (lang === "es" ? LABELS.es : LABELS.en)[type];
}

/** "02.02FC+7dt", "03.03CC+5", "04.01CC+50%", "05.02FF", "01.02". */
export function formatLink(link: Link, code: string, lang: string): string {
  const plain = link.type === "FS" && link.lag === 0;
  if (plain) return code;
  let s = code + linkTypeLabel(link.type, lang);
  if (link.lag !== 0) {
    s += (link.lag > 0 ? "+" : "") + formatNumber(link.lag);
    if (link.lagUnit === "ed") s += lang === "es" ? "dt" : "ed";
    if (link.lagUnit === "pct") s += "%";
  }
  return s;
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function formatLinks(
  links: Link[],
  codeById: Map<ID, string>,
  lang: string,
): string {
  return links
    .map((l) => {
      const code = codeById.get(l.predecessorId);
      return code ? formatLink(l, code, lang) : null;
    })
    .filter(Boolean)
    .join(", ");
}

export interface ParsedLinkToken {
  code: string;
  type: LinkType;
  lag: number;
  lagUnit: LagUnit;
}

/** Parses one token. Returns null when the syntax is invalid. */
export function parseLinkToken(token: string): ParsedLinkToken | null {
  const t = token.trim();
  if (!t) return null;
  // code, optional type (2 letters), optional signed lag, optional unit
  const m = /^(.+?)(FC|FS|CC|SS|FF|CF|SF)?(?:([+-]\s*\d+(?:[.,]\d+)?)\s*(dt|ed|d|%)?)?$/i.exec(t);
  if (!m) return null;
  let code = m[1].trim();
  let typeCode = m[2]?.toUpperCase();
  // "01.02FF" could also be read with the regex as code "01.02F" + type... the lazy match
  // already prefers the shortest code, but a code that itself ends in letters followed by
  // nothing (e.g. "A1FS") is ambiguous; accept the type reading.
  if (!typeCode && /[A-Za-z]{2}$/.test(code)) {
    const tail = code.slice(-2).toUpperCase();
    if (TYPE_CODES[tail]) {
      typeCode = tail;
      code = code.slice(0, -2);
    }
  }
  if (!code) return null;
  const type = typeCode ? TYPE_CODES[typeCode] : "FS";
  if (!type) return null;
  const lag = m[3] ? Number(m[3].replace(/\s/g, "").replace(",", ".")) : 0;
  if (!Number.isFinite(lag)) return null;
  const unitRaw = m[4]?.toLowerCase();
  const lagUnit: LagUnit = unitRaw === "dt" || unitRaw === "ed" ? "ed" : unitRaw === "%" ? "pct" : "wd";
  return { code, type, lag, lagUnit };
}

export interface ParsedLinks {
  links: Link[];
  errors: string[];
}

/** Parses a comma/semicolon separated predecessor string against the task list.
 * Codes are matched against `code`, WBS number or display code. Chapters (summary tasks),
 * unknown codes, self references and links that would create a cycle are reported as errors
 * and not applied. */
export function parseLinks(
  input: string,
  taskId: ID,
  codeIndex: Map<string, ID>,
  summaryIds: Set<ID>,
  tasks: Task[],
): ParsedLinks {
  const links: Link[] = [];
  const errors: string[] = [];
  const tokens = input
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const token of tokens) {
    const p = parseLinkToken(token);
    if (!p) {
      errors.push(token);
      continue;
    }
    const id = codeIndex.get(p.code) ?? codeIndex.get(p.code.toUpperCase());
    if (!id || id === taskId || summaryIds.has(id)) {
      errors.push(token);
      continue;
    }
    if (links.some((l) => l.predecessorId === id)) continue;
    const candidate: Link = { predecessorId: id, type: p.type, lag: p.lag, lagUnit: p.lagUnit };
    if (wouldCreateCycle(tasks, taskId, id)) {
      errors.push(token);
      continue;
    }
    links.push(candidate);
  }
  return { links, errors };
}

/** Leaf descendants of a task (the task itself if it is a leaf). */
export function leafIdsOf(tasks: Task[], id: ID): ID[] {
  const childrenByParent = new Map<ID | null, Task[]>();
  for (const t of tasks) {
    const list = childrenByParent.get(t.parentId) ?? [];
    list.push(t);
    childrenByParent.set(t.parentId, list);
  }
  const out: ID[] = [];
  const stack = [id];
  const seen = new Set<ID>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const kids = childrenByParent.get(cur);
    if (!kids || kids.length === 0) out.push(cur);
    else for (const k of kids) stack.push(k.id);
  }
  return out;
}

export interface ExpandedLink extends Link {
  successorId: ID;
}

/** Expands all links into leaf → leaf edges (a link with a chapter applies to all its
 * leaves; links declared on a chapter apply to every leaf of the chapter as successor). */
export function expandLinks(tasks: Task[]): ExpandedLink[] {
  const parentIds = new Set(tasks.map((t) => t.parentId).filter(Boolean) as ID[]);
  const leafCache = new Map<ID, ID[]>();
  const leaves = (id: ID) => {
    let v = leafCache.get(id);
    if (!v) {
      v = parentIds.has(id) ? leafIdsOf(tasks, id) : [id];
      leafCache.set(id, v);
    }
    return v;
  };
  const exists = new Set(tasks.map((t) => t.id));
  const out: ExpandedLink[] = [];
  const seen = new Set<string>();
  for (const t of tasks) {
    for (const l of t.predecessors ?? []) {
      if (!exists.has(l.predecessorId)) continue;
      for (const succ of leaves(t.id)) {
        for (const pred of leaves(l.predecessorId)) {
          if (pred === succ) continue;
          const key = `${pred}>${succ}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ ...l, predecessorId: pred, successorId: succ });
        }
      }
    }
  }
  return out;
}

/** True when making `predId` a predecessor of `taskId` would close a loop (i.e. `taskId`
 * already, directly or indirectly, precedes `predId`). Works on the expanded leaf graph,
 * including chapter links. */
export function wouldCreateCycle(tasks: Task[], taskId: ID, predId: ID): boolean {
  if (taskId === predId) return true;
  const succLeaves = new Set(leafIdsOf(tasks, taskId));
  const predLeaves = leafIdsOf(tasks, predId);
  if (predLeaves.some((p) => succLeaves.has(p))) return true;
  // Successor map of the existing graph.
  const succMap = new Map<ID, ID[]>();
  for (const e of expandLinks(tasks)) {
    const list = succMap.get(e.predecessorId) ?? [];
    list.push(e.successorId);
    succMap.set(e.predecessorId, list);
  }
  // Is any pred leaf reachable from any succ leaf?
  const targets = new Set(predLeaves);
  const stack = [...succLeaves];
  const seen = new Set<ID>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (targets.has(cur)) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const n of succMap.get(cur) ?? []) stack.push(n);
  }
  return false;
}

/** Ids of every task that `taskId` cannot take as predecessor without a cycle. */
export function cycleBlockedIds(tasks: Task[], taskId: ID): Set<ID> {
  const blocked = new Set<ID>();
  for (const t of tasks) {
    if (t.id === taskId || wouldCreateCycle(tasks, taskId, t.id)) blocked.add(t.id);
  }
  return blocked;
}

/** Converts the legacy `predecessorIds: ID[]` shape into Finish-to-Start links. */
export function linksFromIds(ids: ID[] | undefined): Link[] {
  return (ids ?? []).map((id) => ({ predecessorId: id, type: "FS", lag: 0, lagUnit: "wd" }));
}
