import type { ID, Task } from "./types";

/** The task array is always kept in preorder (depth-first) display order:
 * a task is immediately followed by all of its descendants before the next sibling. */

export function depthOf(tasks: Task[], id: ID): number {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let depth = 0;
  let current = byId.get(id);
  while (current?.parentId) {
    depth++;
    current = byId.get(current.parentId);
  }
  return depth;
}

function depthMap(tasks: Task[]): Map<ID, number> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const cache = new Map<ID, number>();
  function get(id: ID): number {
    if (cache.has(id)) return cache.get(id)!;
    const t = byId.get(id)!;
    const d = t.parentId ? get(t.parentId) + 1 : 0;
    cache.set(id, d);
    return d;
  }
  tasks.forEach((t) => get(t.id));
  return cache;
}

/** Returns [startIndex, endIndex] inclusive, covering the task and all of its descendants. */
export function subtreeRange(tasks: Task[], id: ID): [number, number] {
  const depths = depthMap(tasks);
  const start = tasks.findIndex((t) => t.id === id);
  if (start === -1) throw new Error(`Task ${id} not found`);
  const baseDepth = depths.get(id)!;
  let end = start;
  for (let i = start + 1; i < tasks.length; i++) {
    if (depths.get(tasks[i].id)! <= baseDepth) break;
    end = i;
  }
  return [start, end];
}

export function childrenOf(tasks: Task[], parentId: ID | null): Task[] {
  return tasks.filter((t) => t.parentId === parentId);
}

export function descendantIds(tasks: Task[], id: ID): ID[] {
  const [start, end] = subtreeRange(tasks, id);
  return tasks.slice(start, end + 1).map((t) => t.id);
}

export function hasChildren(tasks: Task[], id: ID): boolean {
  return tasks.some((t) => t.parentId === id);
}

export function insertAfterSubtree(
  tasks: Task[],
  afterId: ID | null,
  newTask: Task
): Task[] {
  if (afterId === null) {
    return [...tasks, newTask];
  }
  const [, end] = subtreeRange(tasks, afterId);
  const result = [...tasks];
  result.splice(end + 1, 0, newTask);
  return result;
}

export function insertAsLastChild(
  tasks: Task[],
  parentId: ID,
  newTask: Task
): Task[] {
  const [, end] = subtreeRange(tasks, parentId);
  const result = [...tasks];
  result.splice(end + 1, 0, newTask);
  return result;
}

export function removeSubtree(tasks: Task[], id: ID): Task[] {
  const [start, end] = subtreeRange(tasks, id);
  return [...tasks.slice(0, start), ...tasks.slice(end + 1)];
}

function previousSibling(tasks: Task[], id: ID): Task | null {
  const depths = depthMap(tasks);
  const idx = tasks.findIndex((t) => t.id === id);
  const task = tasks[idx];
  const baseDepth = depths.get(id)!;
  let i = idx - 1;
  while (i >= 0 && depths.get(tasks[i].id)! > baseDepth) i--;
  if (i < 0) return null;
  if (depths.get(tasks[i].id)! === baseDepth && tasks[i].parentId === task.parentId) {
    return tasks[i];
  }
  return null;
}

export function indentTask(tasks: Task[], id: ID): Task[] {
  const sib = previousSibling(tasks, id);
  if (!sib) return tasks;
  return tasks.map((t) => (t.id === id ? { ...t, parentId: sib.id } : t));
}

export function outdentTask(tasks: Task[], id: ID): Task[] {
  const task = tasks.find((t) => t.id === id);
  if (!task || !task.parentId) return tasks;
  const parent = tasks.find((t) => t.id === task.parentId)!;
  const grandparentId = parent.parentId;

  const [tStart, tEnd] = subtreeRange(tasks, id);
  const [, pEnd] = subtreeRange(tasks, parent.id);
  const blockLength = tEnd - tStart + 1;

  const block = tasks
    .slice(tStart, tEnd + 1)
    .map((t) => (t.id === id ? { ...t, parentId: grandparentId } : t));

  const withoutBlock = [...tasks.slice(0, tStart), ...tasks.slice(tEnd + 1)];
  const insertIdx = pEnd - blockLength + 1;

  return [
    ...withoutBlock.slice(0, insertIdx),
    ...block,
    ...withoutBlock.slice(insertIdx),
  ];
}

export function moveTask(tasks: Task[], id: ID, direction: "up" | "down"): Task[] {
  const task = tasks.find((t) => t.id === id);
  if (!task) return tasks;

  if (direction === "down") {
    const siblings = childrenOf(tasks, task.parentId);
    const idx = siblings.findIndex((t) => t.id === id);
    if (idx === -1 || idx === siblings.length - 1) return tasks;
    return moveTask(tasks, siblings[idx + 1].id, "up");
  }

  const sib = previousSibling(tasks, id);
  if (!sib) return tasks;

  const [sStart] = subtreeRange(tasks, sib.id);
  const [tStart, tEnd] = subtreeRange(tasks, id);
  const taskBlock = tasks.slice(tStart, tEnd + 1);
  const sibBlock = tasks.slice(sStart, tStart);

  return [
    ...tasks.slice(0, sStart),
    ...taskBlock,
    ...sibBlock,
    ...tasks.slice(tEnd + 1),
  ];
}

export function wbsNumbers(tasks: Task[]): Map<ID, string> {
  const result = new Map<ID, string>();
  function walk(parentId: ID | null, prefix: string) {
    const kids = childrenOf(tasks, parentId);
    kids.forEach((k, i) => {
      const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      result.set(k.id, num);
      walk(k.id, num);
    });
  }
  walk(null, "");
  return result;
}

export { depthMap };
