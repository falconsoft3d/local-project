"use client";

import { useMemo, useRef, useState } from "react";
import type { ComputedTask, ID, Project } from "@/lib/types";
import { getComputedTasks } from "@/lib/schedule";
import { expandLinks, formatLink, type ExpandedLink } from "@/lib/links";
import { formatShortDate } from "@/lib/format";
import { useLanguage, useT } from "@/lib/useT";
import FullScreenPanel from "./FullScreenPanel";

/** Network (PERT/precedence) diagram — manual chapter 07. One box per task with early and
 * late dates and float; columns follow the link order (first column = tasks without
 * predecessors); critical path in red, finished work in grey. */

const BOX_W = 210;
const BOX_H = 86;
const GAP_X = 80;
const GAP_Y = 26;
const PAD = 30;

const COLORS = {
  critical: { stroke: "#dc2626", header: "#fee2e2", text: "#171717" },
  finished: { stroke: "#a3a3a3", header: "#f5f5f5", text: "#737373" },
  normal: { stroke: "#a3a3a3", header: "#dcfce7", text: "#171717" },
};

interface NodeLayout {
  task: ComputedTask;
  col: number;
  row: number;
  x: number;
  y: number;
}

interface Layout {
  nodes: Map<ID, NodeLayout>;
  edges: ExpandedLink[];
  width: number;
  height: number;
}

function buildLayout(tasks: ComputedTask[], allEdges: ExpandedLink[]): Layout {
  const ids = new Set(tasks.map((t) => t.id));
  const edges = allEdges.filter((e) => ids.has(e.predecessorId) && ids.has(e.successorId));
  const order = new Map(tasks.map((t, i) => [t.id, i]));
  const preds = new Map<ID, ID[]>();
  const succs = new Map<ID, ID[]>();
  for (const e of edges) {
    (preds.get(e.successorId) ?? preds.set(e.successorId, []).get(e.successorId)!).push(e.predecessorId);
    (succs.get(e.predecessorId) ?? succs.set(e.predecessorId, []).get(e.predecessorId)!).push(e.successorId);
  }

  // Longest-path rank via Kahn; nodes in cycles get the rank of their processed preds.
  const indeg = new Map<ID, number>();
  for (const t of tasks) indeg.set(t.id, preds.get(t.id)?.length ?? 0);
  const rank = new Map<ID, number>();
  const queue = tasks.filter((t) => indeg.get(t.id) === 0).map((t) => t.id);
  for (const id of queue) rank.set(id, 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const s of succs.get(id) ?? []) {
      rank.set(s, Math.max(rank.get(s) ?? 0, (rank.get(id) ?? 0) + 1));
      const d = indeg.get(s)! - 1;
      indeg.set(s, d);
      if (d === 0) queue.push(s);
    }
  }
  for (const t of tasks) if (!rank.has(t.id)) rank.set(t.id, 0);

  const columns: ID[][] = [];
  for (const t of tasks) {
    const c = rank.get(t.id)!;
    (columns[c] ??= []).push(t.id);
  }

  // Order rows by the barycenter of predecessors' rows to keep arrows short.
  const rowOf = new Map<ID, number>();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  columns.forEach((col, ci) => {
    if (!col) return;
    const key = (id: ID) => {
      if (ci === 0) return order.get(id)!;
      const ps = (preds.get(id) ?? []).filter((p) => rowOf.has(p));
      if (!ps.length) return 1e6 + order.get(id)!;
      return ps.reduce((s, p) => s + rowOf.get(p)!, 0) / ps.length;
    };
    col.sort((a, b) => {
      const d = key(a) - key(b);
      if (d !== 0) return d;
      const sa = byId.get(a)!.computedStart;
      const sb = byId.get(b)!.computedStart;
      return sa < sb ? -1 : sa > sb ? 1 : order.get(a)! - order.get(b)!;
    });
    col.forEach((id, r) => rowOf.set(id, r));
  });

  const nodes = new Map<ID, NodeLayout>();
  let maxRows = 0;
  columns.forEach((col, ci) => {
    if (!col) return;
    maxRows = Math.max(maxRows, col.length);
    col.forEach((id, r) => {
      nodes.set(id, {
        task: byId.get(id)!,
        col: ci,
        row: r,
        x: PAD + ci * (BOX_W + GAP_X),
        y: PAD + r * (BOX_H + GAP_Y),
      });
    });
  });
  const width = PAD * 2 + Math.max(1, columns.length) * (BOX_W + GAP_X) - GAP_X;
  const height = PAD * 2 + Math.max(1, maxRows) * (BOX_H + GAP_Y) - GAP_Y;
  return { nodes, edges, width, height };
}

function reach(start: ID, adj: Map<ID, ID[]>): Set<ID> {
  const out = new Set<ID>();
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of adj.get(cur) ?? []) {
      if (!out.has(n)) {
        out.add(n);
        stack.push(n);
      }
    }
  }
  return out;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export default function NetworkDiagram({ project, onClose }: { project: Project; onClose: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [scale, setScale] = useState(1);
  const [selected, setSelected] = useState<ID | null>(null);

  const computed = useMemo(() => getComputedTasks(project), [project]);
  const leaves = useMemo(() => computed.filter((c) => !c.isSummary), [computed]);
  const allEdges = useMemo(() => expandLinks(project.tasks), [project.tasks]);

  const visible = useMemo(
    () => (onlyCritical ? leaves.filter((l) => l.critical) : leaves),
    [leaves, onlyCritical],
  );
  const layout = useMemo(() => buildLayout(visible, allEdges), [visible, allEdges]);

  const highlight = useMemo(() => {
    if (!selected || !layout.nodes.has(selected)) return null;
    const succ = new Map<ID, ID[]>();
    const pred = new Map<ID, ID[]>();
    for (const e of allEdges) {
      (succ.get(e.predecessorId) ?? succ.set(e.predecessorId, []).get(e.predecessorId)!).push(e.successorId);
      (pred.get(e.successorId) ?? pred.set(e.successorId, []).get(e.successorId)!).push(e.predecessorId);
    }
    const set = new Set<ID>([selected, ...reach(selected, pred), ...reach(selected, succ)]);
    return set;
  }, [selected, layout, allEdges]);

  function fit() {
    const el = containerRef.current;
    if (!el) return;
    const s = Math.min(1.5, (el.clientWidth - 16) / layout.width, (el.clientHeight - 16) / layout.height);
    setScale(Math.max(0.15, Math.round(s * 100) / 100));
  }

  const elapsedUnit = lang === "es" ? "dt" : "ed";

  const toolbar = (
    <>
      <button
        onClick={() => {
          setOnlyCritical((v) => !v);
          setSelected(null);
        }}
        className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
          onlyCritical
            ? "border-red-600 bg-red-600 text-white"
            : "border-neutral-200 text-neutral-700 hover:bg-neutral-100"
        }`}
      >
        {t("netOnlyCritical")}
      </button>
      <div className="flex items-center rounded-md border border-neutral-200">
        <button
          title={t("netZoomOut")}
          onClick={() => setScale((s) => Math.max(0.15, Math.round((s / 1.25) * 100) / 100))}
          className="px-2.5 py-1 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          −
        </button>
        <button
          onClick={fit}
          className="border-x border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
        >
          {t("netFit")}
        </button>
        <button
          title={t("netZoomIn")}
          onClick={() => setScale((s) => Math.min(3, Math.round(s * 1.25 * 100) / 100))}
          className="px-2.5 py-1 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          +
        </button>
      </div>
      <span className="w-10 text-[11px] text-neutral-500">{Math.round(scale * 100)}%</span>
      {selected && (
        <button
          onClick={() => setSelected(null)}
          className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
        >
          {t("netClearSelection")}
        </button>
      )}
      <span className="hidden text-[11px] text-neutral-400 md:inline">{t("netHint")}</span>
      <div className="ml-auto flex items-center gap-3 text-[11px] text-neutral-600">
        {(["critical", "normal", "finished"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span
              className="inline-block h-3 w-4 rounded-sm border"
              style={{ borderColor: COLORS[k].stroke, backgroundColor: COLORS[k].header }}
            />
            {t(k === "critical" ? "netLegendCritical" : k === "normal" ? "netLegendFloat" : "netLegendFinished")}
          </span>
        ))}
      </div>
    </>
  );

  const edgePaths = layout.edges.map((e) => {
    const a = layout.nodes.get(e.predecessorId)!;
    const b = layout.nodes.get(e.successorId)!;
    const fromStart = e.type === "SS" || e.type === "SF";
    const toStart = e.type === "FS" || e.type === "SS";
    const x1 = fromStart ? a.x : a.x + BOX_W;
    const y1 = a.y + BOX_H / 2;
    const x2 = toStart ? b.x : b.x + BOX_W;
    const y2 = b.y + BOX_H / 2;
    const dir1 = fromStart ? -1 : 1;
    const dir2 = toStart ? -1 : 1;
    const bend = Math.max(36, Math.min(120, Math.abs(x2 - x1) / 2));
    const c1x = x1 + dir1 * bend;
    const c2x = x2 + dir2 * bend;
    const d = `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
    // Midpoint of the cubic (t = 0.5).
    const mx = (x1 + 3 * c1x + 3 * c2x + x2) / 8;
    const my = (y1 + 3 * y1 + 3 * y2 + y2) / 8;
    const plain = e.type === "FS" && e.lag === 0;
    const label = plain ? "" : formatLink(e, "", lang);
    const critical = a.task.critical && b.task.critical;
    const dim = highlight ? !(highlight.has(e.predecessorId) && highlight.has(e.successorId)) : false;
    return { key: `${e.predecessorId}>${e.successorId}`, d, mx, my, label, critical, dim };
  });

  return (
    <FullScreenPanel
      title={t("netTitle")}
      subtitle={`${project.name} · ${t("netSubtitle", { count: visible.length })}`}
      onClose={onClose}
      toolbar={toolbar}
    >
      <div ref={containerRef} className="h-full w-full overflow-auto bg-neutral-50">
        {visible.length === 0 ? (
          <p className="p-10 text-center text-sm text-neutral-400">
            {onlyCritical ? t("netEmptyCritical") : t("netEmpty")}
          </p>
        ) : (
          <svg
            width={layout.width * scale}
            height={layout.height * scale}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            onClick={() => setSelected(null)}
            className="select-none"
          >
            <defs>
              {(["red", "grey"] as const).map((c) => (
                <marker
                  key={c}
                  id={`net-arrow-${c}`}
                  viewBox="0 0 8 8"
                  refX="7.5"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L8,4 L0,8 z" fill={c === "red" ? "#dc2626" : "#a3a3a3"} />
                </marker>
              ))}
            </defs>

            <g>
              {edgePaths.map((p) => (
                <g key={p.key} opacity={p.dim ? 0.12 : 1}>
                  <path
                    d={p.d}
                    fill="none"
                    stroke={p.critical ? "#dc2626" : "#a3a3a3"}
                    strokeWidth={p.critical ? 1.6 : 1.1}
                    markerEnd={`url(#net-arrow-${p.critical ? "red" : "grey"})`}
                  />
                  {p.label && (
                    <text
                      x={p.mx}
                      y={p.my - 4}
                      textAnchor="middle"
                      fontSize={9}
                      fill={p.critical ? "#b91c1c" : "#525252"}
                      stroke="#fafafa"
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      {p.label}
                    </text>
                  )}
                </g>
              ))}
            </g>

            {[...layout.nodes.values()].map(({ task: n, x, y }) => {
              const pal = n.isFinished ? COLORS.finished : n.critical ? COLORS.critical : COLORS.normal;
              const dim = highlight ? !highlight.has(n.id) : false;
              const isSel = selected === n.id;
              const tf = n.totalFloat;
              const dur = `${n.computedDuration}${n.elapsed ? elapsedUnit : "d"}`;
              const cells: [string, string, string][][] = [
                [
                  [t("netEarlyStart"), formatShortDate(n.earlyStart ?? n.computedStart), pal.text],
                  [t("netDuration"), dur, pal.text],
                  [t("netEarlyFinish"), formatShortDate(n.earlyFinish ?? n.computedEnd), pal.text],
                ],
                [
                  [t("netLateStart"), formatShortDate(n.lateStart), pal.text],
                  [
                    t("netFloat"),
                    tf === undefined ? "—" : `${tf}d`,
                    !n.isFinished && tf !== undefined && tf <= 0 ? "#dc2626" : pal.text,
                  ],
                  [t("netLateFinish"), formatShortDate(n.lateFinish), pal.text],
                ],
              ];
              return (
                <g
                  key={n.id}
                  transform={`translate(${x},${y})`}
                  opacity={dim ? 0.2 : 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected((cur) => (cur === n.id ? null : n.id));
                  }}
                  className="cursor-pointer"
                >
                  <title>{`${n.displayCode} ${n.name}`}</title>
                  <rect
                    width={BOX_W}
                    height={BOX_H}
                    rx={4}
                    fill="#ffffff"
                    stroke={isSel ? "#171717" : pal.stroke}
                    strokeWidth={isSel ? 2.2 : n.critical && !n.isFinished ? 1.6 : 1}
                  />
                  <path
                    d={`M 0 4 a 4 4 0 0 1 4 -4 h ${BOX_W - 8} a 4 4 0 0 1 4 4 v 12 h ${-BOX_W} z`}
                    fill={pal.header}
                  />
                  <text x={7} y={11.5} fontSize={9.5} fontWeight={700} fill={pal.text}>
                    {truncate(n.displayCode, 30)}
                    {n.isMilestone ? " ◆" : ""}
                  </text>
                  <text x={7} y={29} fontSize={10.5} fontWeight={500} fill={pal.text}>
                    {truncate(n.name, 34)}
                  </text>
                  {cells.map((row, ri) =>
                    row.map(([label, value, color], ci) => {
                      const cx = 7 + ci * ((BOX_W - 14) / 3);
                      const cy = 44 + ri * 21;
                      return (
                        <g key={`${ri}-${ci}`}>
                          <text x={cx} y={cy} fontSize={7.5} fill="#a3a3a3">
                            {label}
                          </text>
                          <text x={cx} y={cy + 10} fontSize={9.5} fill={color} fontWeight={color === "#dc2626" ? 600 : 400}>
                            {value}
                          </text>
                        </g>
                      );
                    }),
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </FullScreenPanel>
  );
}
