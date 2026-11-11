"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { RESOURCE_KIND_COLORS } from "@/lib/constants";
import { useLanguage, useT } from "@/lib/useT";
import { getComputedTasks } from "@/lib/schedule";
import { dayNum, isoOf, weekdayOf } from "@/lib/calendar";
import { formatNumber, formatShortDate, localeOf } from "@/lib/format";
import {
  clearLeveling,
  computeDailyLoads,
  isTimeResource,
  levelResources,
  overallocationsFromLoads,
  type DailyLoad,
} from "@/lib/resources";
import type { ID, Project, ResourceKind } from "@/lib/types";
import FullScreenPanel from "./FullScreenPanel";

type Scale = "day" | "week" | "month";

const KIND_COLOR: Record<ResourceKind, string> = RESOURCE_KIND_COLORS;

const C_WITHIN = "#3b82f6";
const C_OVER = "#dc2626";
const C_OTHER = "#bfdbfe";
const C_OTHER_OVER = "#fecaca";

interface Bucket {
  key: string;
  label: string;
  hours: number;
  other: number;
  /** null = unlimited */
  capacity: number | null;
  over: boolean;
}

function bucketKey(iso: string, scale: Scale): string {
  if (scale === "day") return iso;
  if (scale === "month") return iso.slice(0, 7);
  const n = dayNum(iso);
  const wd = weekdayOf(n);
  return isoOf(n - ((wd + 6) % 7)); // Monday
}

function bucketLabel(key: string, scale: Scale, lang: string): string {
  if (scale === "month") {
    const [y, m] = key.split("-").map(Number);
    return new Intl.DateTimeFormat(localeOf(lang), { month: "short", year: "2-digit", timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, 1)),
    );
  }
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

function buildBuckets(loads: DailyLoad[], scale: Scale, lang: string): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const l of loads) {
    const key = bucketKey(l.day, scale);
    let b = map.get(key);
    if (!b) {
      b = { key, label: bucketLabel(key, scale, lang), hours: 0, other: 0, capacity: 0, over: false };
      map.set(key, b);
    }
    b.hours += l.hours;
    b.other += l.otherHours;
    if (l.capacity === null) b.capacity = null;
    else if (b.capacity !== null) b.capacity += l.capacity;
    if (l.capacity !== null && l.hours > 1e-6 && l.hours + l.otherHours > l.capacity + 1e-6) b.over = true;
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

function LoadChart({ buckets, title, t }: { buckets: Bucket[]; title: string; t: (k: string) => string }) {
  const barW = buckets.length > 60 ? 10 : buckets.length > 30 ? 16 : 26;
  const left = 44;
  const top = 12;
  const plotH = 200;
  const width = Math.max(560, left + buckets.length * (barW + 4) + 16);
  const height = top + plotH + 34;
  const maxV = niceMax(
    Math.max(1, ...buckets.map((b) => b.hours + b.other), ...buckets.map((b) => b.capacity ?? 0)) * 1.05,
  );
  const y = (v: number) => top + plotH - (v / maxV) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxV);
  const labelEvery = Math.max(1, Math.ceil(buckets.length / Math.floor((width - left) / 48)));
  const hasCapacity = buckets.some((b) => b.capacity !== null);
  let capPath = "";
  buckets.forEach((b, i) => {
    if (b.capacity === null) return;
    const x0 = left + i * (barW + 4);
    const x1 = x0 + barW + 4;
    const yy = y(b.capacity);
    capPath += `${capPath && buckets[i - 1]?.capacity !== null ? "L" : "M"} ${x0} ${yy} L ${x1} ${yy} `;
  });
  const hasOthers = buckets.some((b) => b.other > 0);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-600">
        <span className="text-sm font-semibold text-neutral-800">{title}</span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: C_WITHIN }} />
          {t("resLegendWithin")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: C_OVER }} />
          {t("resLegendOver")}
        </span>
        {hasOthers && (
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: C_OTHER }} />
            {t("resLegendOthers")}
          </span>
        )}
        <span className="flex items-center gap-1">
          <svg width="18" height="6">
            <line x1="0" y1="3" x2="18" y2="3" stroke="#404040" strokeWidth="1.5" strokeDasharray="3 2" />
          </svg>
          {hasCapacity ? t("resLegendCapacity") : t("resUnlimited")}
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg width={width} height={height} className="text-neutral-500">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={left} x2={width - 8} y1={y(v)} y2={y(v)} stroke="#e5e5e5" />
              <text x={left - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="currentColor">
                {Math.round(v)}
              </text>
            </g>
          ))}
          {buckets.map((b, i) => {
            const x = left + i * (barW + 4) + 2;
            const hOwn = (b.hours / maxV) * plotH;
            const hOther = (b.other / maxV) * plotH;
            return (
              <g key={b.key}>
                <title>
                  {`${b.label}: ${formatNumber(b.hours, "es", 1)} h${b.other ? ` + ${formatNumber(b.other, "es", 1)} h` : ""}${
                    b.capacity !== null ? ` / ${formatNumber(b.capacity, "es", 1)} h` : ""
                  }`}
                </title>
                {b.hours > 0 && (
                  <rect x={x} y={top + plotH - hOwn} width={barW} height={hOwn} fill={b.over ? C_OVER : C_WITHIN} rx={1} />
                )}
                {b.other > 0 && (
                  <rect
                    x={x}
                    y={top + plotH - hOwn - hOther}
                    width={barW}
                    height={hOther}
                    fill={b.over ? C_OTHER_OVER : C_OTHER}
                    rx={1}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={top + plotH + 14} textAnchor="middle" fontSize="10" fill="currentColor">
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={left} x2={width - 8} y1={top + plotH} y2={top + plotH} stroke="#a3a3a3" />
          {capPath && <path d={capPath} fill="none" stroke="#404040" strokeWidth={1.5} strokeDasharray="4 3" />}
        </svg>
      </div>
    </div>
  );
}

export default function ResourceHistogram({
  projectId,
  project,
  onClose,
}: {
  projectId: ID;
  project: Project;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const allProjects = useStore((s) => s.projects);
  const updateResource = useStore((s) => s.updateResource);
  const changeProject = useStore((s) => s.changeProject);

  const [scale, setScale] = useState<Scale>("week");
  const [includeOthers, setIncludeOthers] = useState(false);
  const [withinFloat, setWithinFloat] = useState(true);
  const [selected, setSelected] = useState<ID | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const others = useMemo(
    () => (includeOthers ? allProjects.filter((p) => p.id !== project.id) : undefined),
    [includeOthers, allProjects, project.id],
  );
  const loads = useMemo(() => computeDailyLoads(project, { otherProjects: others }), [project, others]);
  const overs = useMemo(() => overallocationsFromLoads(project, loads), [project, loads]);
  const taskInfo = useMemo(() => {
    const m = new Map<ID, { code: string; name: string }>();
    for (const c of getComputedTasks(project)) m.set(c.id, { code: c.displayCode, name: c.name });
    return m;
  }, [project]);

  const loadsByRes = useMemo(() => {
    const m = new Map<ID, DailyLoad[]>();
    for (const l of loads) {
      const list = m.get(l.resourceId) ?? [];
      list.push(l);
      m.set(l.resourceId, list);
    }
    return m;
  }, [loads]);

  const timeResources = project.resources.filter(
    (r) => isTimeResource(r) && (loadsByRes.has(r.id) || project.tasks.some((tk) => tk.resourceIds.includes(r.id))),
  );
  const overRes = new Set(overs.map((o) => o.resourceId));
  const selectedId =
    selected && timeResources.some((r) => r.id === selected)
      ? selected
      : (timeResources.find((r) => overRes.has(r.id)) ?? timeResources[0])?.id ?? null;
  const selectedRes = timeResources.find((r) => r.id === selectedId);

  const bucketsByRes = useMemo(() => {
    const m = new Map<ID, Bucket[]>();
    for (const [rid, list] of loadsByRes) m.set(rid, buildBuckets(list, scale, lang));
    return m;
  }, [loadsByRes, scale, lang]);
  const columns = useMemo(() => {
    const keys = new Map<string, string>();
    for (const list of bucketsByRes.values()) for (const b of list) keys.set(b.key, b.label);
    return [...keys.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [bucketsByRes]);

  function level() {
    if (!confirm(t("resLevelConfirm"))) return;
    const current = useStore.getState().projects.find((p) => p.id === projectId);
    if (!current) return;
    const res = levelResources(current, { withinFloat, otherProjects: others });
    changeProject(projectId, () => res.project);
    setMessage(t("resLevelDone", { moved: res.moved, remaining: res.remaining }));
  }

  function clear() {
    if (!confirm(t("resClearConfirm"))) return;
    changeProject(projectId, (p) => clearLeveling(p));
    setMessage(null);
  }

  const hasLeveling = project.tasks.some((tk) => tk.levelingStart);

  const toolbar = (
    <>
      <div className="flex items-center gap-1 rounded-md border border-neutral-200 p-0.5">
        {(["day", "week", "month"] as Scale[]).map((s) => (
          <button
            key={s}
            onClick={() => setScale(s)}
            className={`rounded px-2.5 py-1 text-xs font-medium ${
              scale === s ? "bg-green-600 text-white" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {t(s === "day" ? "resScaleDay" : s === "week" ? "resScaleWeek" : "resScaleMonth")}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-neutral-700">
        <input type="checkbox" checked={includeOthers} onChange={(e) => setIncludeOthers(e.target.checked)} />
        {t("resIncludeOthers")}
      </label>
      <div className="mx-1 h-5 w-px bg-neutral-200" />
      <button
        onClick={level}
        className="rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700"
      >
        {t("resLevel")}
      </button>
      <label className="flex items-center gap-1.5 text-xs text-neutral-700">
        <input type="checkbox" checked={withinFloat} onChange={(e) => setWithinFloat(e.target.checked)} />
        {t("resWithinFloat")}
      </label>
      {hasLeveling && (
        <button
          onClick={clear}
          className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
        >
          {t("resClearLeveling")}
        </button>
      )}
      {message && (
        <span className="ml-auto rounded bg-green-50 px-2 py-1 text-xs text-green-800">{message}</span>
      )}
    </>
  );

  const cellH = (v: number) => formatNumber(v, lang, 1);

  return (
    <FullScreenPanel title={`${t("resHistTitle")} · ${project.name}`} subtitle={t("resHistSubtitle")} onClose={onClose} toolbar={toolbar}>
      {timeResources.length === 0 ? (
        <p className="p-8 text-center text-sm text-neutral-400">{t("resNoTimeResources")}</p>
      ) : (
        <div className="flex flex-col gap-6 p-4">
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="shrink-0 overflow-auto rounded-md border border-neutral-200 lg:w-[400px]" style={{ maxHeight: 320 }}>
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-neutral-100 text-[11px] text-neutral-600">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold">{t("resColResource")}</th>
                    <th className="px-2 py-1.5 text-right font-semibold">{t("resColTotal")}</th>
                    <th className="px-2 py-1.5 text-right font-semibold">{t("resColPeak")}</th>
                    <th className="px-2 py-1.5 text-right font-semibold" title={t("resMaxUnitsHint")}>
                      {t("resColMaxUnits")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {timeResources.map((r) => {
                    const list = loadsByRes.get(r.id) ?? [];
                    const total = list.reduce((s, l) => s + l.hours, 0);
                    const peak = list.reduce((m, l) => Math.max(m, l.hours + l.otherHours), 0);
                    const isSel = r.id === selectedId;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r.id)}
                        className={`cursor-pointer border-t border-neutral-100 ${isSel ? "bg-green-50" : "hover:bg-neutral-50"}`}
                      >
                        <td className="max-w-[180px] px-2 py-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: KIND_COLOR[r.kind ?? "labor"] }}
                            />
                            <span className="truncate" title={r.name}>
                              {r.name}
                            </span>
                            {overRes.has(r.id) && (
                              <span
                                title={t("resOverIcon")}
                                className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white"
                              >
                                !
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{cellH(total)} h</td>
                        <td className="px-2 py-1 text-right tabular-nums text-neutral-500">
                          {cellH(peak)} {t("resHoursPerDay")}
                        </td>
                        <td className="px-2 py-1 text-right" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={r.maxUnits ?? 0}
                            title={t("resMaxUnitsHint")}
                            onChange={(e) =>
                              updateResource(projectId, r.id, {
                                maxUnits: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="w-14 rounded border border-neutral-200 px-1 py-0.5 text-right outline-none focus:border-green-500"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="min-w-0 flex-1 rounded-md border border-neutral-200 p-3">
              {selectedRes && (
                <LoadChart
                  buckets={bucketsByRes.get(selectedRes.id) ?? []}
                  title={t("resChartTitle", { name: selectedRes.name })}
                  t={t}
                />
              )}
            </div>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-neutral-800">{t("resOverTitle")}</h3>
            {overs.length === 0 ? (
              <p className="text-xs text-neutral-400">{t("resOverNone")}</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-neutral-200">
                <table className="w-full text-[12px]">
                  <thead className="bg-neutral-100 text-[11px] text-neutral-600">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold">{t("resColResource")}</th>
                      <th className="px-2 py-1.5 text-left font-semibold">{t("resColDates")}</th>
                      <th className="px-2 py-1.5 text-left font-semibold">{t("resColPeakCap")}</th>
                      <th className="px-2 py-1.5 text-left font-semibold">{t("resColTasks")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overs.map((o, i) => (
                      <tr key={i} className="border-t border-neutral-100 align-top">
                        <td className="px-2 py-1">{o.resourceName}</td>
                        <td className="whitespace-nowrap px-2 py-1">
                          {formatShortDate(o.from)} – {formatShortDate(o.to)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 font-medium text-red-600">
                          {cellH(o.peakHours)} / {cellH(o.capacityHours)} {t("resHoursPerDay")}
                        </td>
                        <td className="px-2 py-1 text-neutral-600">
                          {o.taskIds
                            .map((id) => taskInfo.get(id))
                            .filter(Boolean)
                            .map((x) => `${x!.code} ${x!.name}`)
                            .join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-neutral-800">{t("resUsageTitle")}</h3>
            <div className="overflow-x-auto rounded-md border border-neutral-200">
              <table className="text-[11px]">
                <thead className="bg-neutral-100 text-neutral-600">
                  <tr>
                    <th className="sticky left-0 z-10 bg-neutral-100 px-2 py-1.5 text-left font-semibold">
                      {t("resColResource")}
                    </th>
                    {columns.map(([key, label]) => (
                      <th key={key} className="whitespace-nowrap px-2 py-1.5 text-right font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeResources.map((r) => {
                    const byKey = new Map((bucketsByRes.get(r.id) ?? []).map((b) => [b.key, b]));
                    return (
                      <tr
                        key={r.id}
                        className={`border-t border-neutral-100 ${r.id === selectedId ? "bg-green-50/60" : ""}`}
                      >
                        <td className="sticky left-0 z-10 max-w-[200px] truncate bg-white px-2 py-1" title={r.name}>
                          {r.name}
                        </td>
                        {columns.map(([key]) => {
                          const b = byKey.get(key);
                          const v = b ? b.hours + b.other : 0;
                          return (
                            <td
                              key={key}
                              className={`px-2 py-1 text-right tabular-nums ${
                                b?.over ? "bg-red-50 font-semibold text-red-600" : "text-neutral-700"
                              }`}
                            >
                              {v > 0.05 ? Math.round(v) : ""}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </FullScreenPanel>
  );
}
