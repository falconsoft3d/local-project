"use client";

import { useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import { dayNum, todayISO } from "@/lib/calendar";
import { buildSCurve, type SCurvePoint, type SCurveScale } from "@/lib/evm";
import { earnedValueAt } from "@/lib/tracking";
import { formatDate, formatMoney, formatNumber, localeOf } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useLanguage, useT } from "@/lib/useT";
import type { CostEntry, ID, Project } from "@/lib/types";
import FullScreenPanel from "./FullScreenPanel";

type SeriesKey = "current" | "pv" | "certified" | "ev" | "ac";

const SERIES: { key: SeriesKey; labelKey: string; color: string; dash?: string; markers?: boolean }[] = [
  { key: "current", labelKey: "evmSeriesCurrent", color: "#2563eb" },
  { key: "pv", labelKey: "evmSeriesPv", color: "#64748b", dash: "5 4" },
  { key: "certified", labelKey: "evmSeriesCertified", color: "#d97706", markers: true },
  { key: "ev", labelKey: "evmSeriesEv", color: "#16a34a", markers: true },
  { key: "ac", labelKey: "evmSeriesAc", color: "#dc2626" },
];

function compactMoney(n: number, lang: string): string {
  return new Intl.NumberFormat(localeOf(lang), {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function pctOf(part: number, whole: number, lang: string): string {
  if (!whole) return "0";
  return formatNumber((part / whole) * 100, lang, 1);
}

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bad" | "good" }) {
  return (
    <div className="rounded-md border border-neutral-200 px-3 py-2">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div
        className={`text-base font-semibold ${
          tone === "bad" ? "text-red-600" : tone === "good" ? "text-green-700" : "text-neutral-800"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className={`text-[11px] ${tone === "bad" ? "text-red-500" : tone === "good" ? "text-green-600" : "text-neutral-400"}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function SCurve({
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
  const [scale, setScale] = useState<SCurveScale>("month");
  const [showTable, setShowTable] = useState(false);
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());

  const data = useMemo(() => buildSCurve(project, scale), [project, scale]);
  const today = todayISO();
  const atToday = useMemo(() => earnedValueAt(project, today), [project, today]);
  const live = data.live;
  const statusDate = project.schedule?.statusDate;

  const changeProject = (fn: (p: Project) => Project, key?: string) =>
    useStore.getState().changeProject(projectId, fn, key);

  function recordProgress() {
    if (!statusDate) {
      alert(t("evmRecordProgressNeedsStatus"));
      return;
    }
    useStore.getState().recordProgress(projectId);
  }

  // ---- chart geometry ----
  const W = 1000;
  const H = 360;
  const padL = 72;
  const padR = 24;
  const padT = 16;
  const padB = 34;
  const d0 = dayNum(data.start);
  const d1 = Math.max(dayNum(data.end), d0 + 1);
  const seriesData: Record<SeriesKey, SCurvePoint[]> = {
    current: data.pvCurrent,
    pv: data.hasBaseline ? data.pv : [],
    certified: data.certified,
    ev: data.ev,
    ac: data.ac,
  };
  let yMax = 0;
  for (const s of SERIES) {
    if (hidden.has(s.key)) continue;
    for (const p of seriesData[s.key]) yMax = Math.max(yMax, p.value);
  }
  yMax = yMax > 0 ? yMax * 1.06 : 1;
  const x = (iso: string) => padL + ((dayNum(iso) - d0) / (d1 - d0)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / yMax) * (H - padT - padB);
  const yTicks = Array.from({ length: 6 }, (_, i) => (yMax / 1.06) * (i / 5));
  const step = Math.max(1, Math.ceil(data.periods.length / 10));
  const xTicks = data.periods.filter((_, i) => i % step === 0 || i === data.periods.length - 1);
  const tickLabel = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return scale === "month"
      ? d.toLocaleDateString(localeOf(lang), { month: "short", year: "2-digit" })
      : d.toLocaleDateString(localeOf(lang), { day: "2-digit", month: "2-digit" });
  };
  const inRange = (iso?: string) => !!iso && dayNum(iso) >= d0 && dayNum(iso) <= d1;

  const costs = project.actualCosts ?? [];
  const costsTotal = costs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const snapshots = [...(project.evSnapshots ?? [])].sort((a, b) => a.date.localeCompare(b.date));

  const deviation = atToday.certified - atToday.pv;
  const pct = (part: number, whole: number) => pctOf(part, whole, lang);

  return (
    <FullScreenPanel
      title={`${t("evmSCurveTitle")} · ${project.name}`}
      subtitle={statusDate ? `${t("evmReportStatusDate")}: ${formatDate(statusDate, lang)}` : undefined}
      onClose={onClose}
      toolbar={
        <>
          <div className="flex items-center gap-1 rounded-md border border-neutral-200 p-0.5">
            {(["week", "month"] as SCurveScale[]).map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className={`rounded px-2.5 py-1 text-xs font-medium ${
                  scale === s ? "bg-green-600 text-white" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {t(s === "week" ? "evmWeek" : "evmMonth")}
              </button>
            ))}
          </div>
          <button
            onClick={recordProgress}
            className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            {t("evmRecordProgress")}
          </button>
          <button
            onClick={() => setShowTable((v) => !v)}
            className="ml-auto rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            {showTable ? t("evmHideTable") : t("evmShowTable")}
          </button>
        </>
      }
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card label={t("evmTotalBudget")} value={formatMoney(data.budget, lang)} />
          <Card
            label={t("evmPlannedToday")}
            value={formatMoney(atToday.pv, lang)}
            sub={t("evmOfBudget", { pct: pct(atToday.pv, data.bac || data.budget) })}
          />
          <Card
            label={t("evmCertified")}
            value={formatMoney(atToday.certified, lang)}
            sub={t("evmOfBudget", { pct: pct(atToday.certified, data.budget) })}
          />
          <Card
            label={t("evmScheduleDeviationToday")}
            value={formatMoney(deviation, lang)}
            sub={
              atToday.pv > 0
                ? t(deviation < 0 ? "evmBelowPlan" : "evmAbovePlan", {
                    pct: pct(Math.abs(deviation), atToday.pv),
                  })
                : undefined
            }
            tone={deviation < 0 ? "bad" : deviation > 0 ? "good" : undefined}
          />
        </div>

        <section className="rounded-md border border-neutral-200 p-3">
          {live && statusDate ? (
            <>
              <h3 className="mb-2 text-xs font-semibold text-neutral-700">
                {t("evmEvAt", { date: formatDate(statusDate, lang) })}
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                <Card label={t("evmBac")} value={formatMoney(live.bac, lang)} />
                <Card
                  label={t("evmPv")}
                  value={formatMoney(live.pv, lang)}
                  sub={t("evmOfBudget", { pct: pct(live.pv, live.bac) })}
                />
                <Card
                  label={t("evmEv")}
                  value={formatMoney(live.ev, lang)}
                  sub={t("evmOfBudget", { pct: pct(live.ev, live.bac) })}
                />
                <Card label={t("evmAc")} value={formatMoney(live.ac, lang)} />
                <Card
                  label={t("evmSv")}
                  value={formatMoney(live.sv, lang)}
                  sub={
                    live.spi !== null
                      ? `SPI ${formatNumber(live.spi, lang)} · ${t(
                          live.spi < 1 ? "evmBehind" : live.spi > 1 ? "evmAhead" : "evmOnTime",
                        )}`
                      : undefined
                  }
                  tone={live.spi !== null ? (live.spi < 1 ? "bad" : "good") : undefined}
                />
                <Card
                  label={t("evmCv")}
                  value={live.cv !== null ? formatMoney(live.cv, lang) : "—"}
                  sub={
                    live.cpi !== null
                      ? `CPI ${formatNumber(live.cpi, lang)} · ${t(live.cpi < 1 ? "evmOverrun" : "evmSaving")}`
                      : undefined
                  }
                  tone={live.cpi !== null ? (live.cpi < 1 ? "bad" : "good") : undefined}
                />
                <Card
                  label={t("evmEac")}
                  value={live.eac !== null ? formatMoney(live.eac, lang) : "—"}
                  sub={
                    live.eac !== null && live.bac > 0
                      ? `${live.eac > live.bac ? "+" : ""}${pct(live.eac - live.bac, live.bac)} %`
                      : undefined
                  }
                />
              </div>
              {live.ac <= 0 && <p className="mt-2 text-[11px] text-amber-700">{t("evmNoAcNote")}</p>}
            </>
          ) : (
            <p className="text-xs text-neutral-500">{t("evmNoStatusDate")}</p>
          )}
          {!data.hasBaseline && <p className="mt-1 text-[11px] text-amber-700">{t("evmNoBaselineNote")}</p>}
        </section>

        <section className="rounded-md border border-neutral-200 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <h3 className="text-xs font-semibold text-neutral-700">{t("evmChartTitle")}</h3>
            <div className="ml-auto flex flex-wrap gap-3">
              {SERIES.filter((s) => s.key !== "pv" || data.hasBaseline).map((s) => (
                <button
                  key={s.key}
                  onClick={() =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.key)) next.delete(s.key);
                      else next.add(s.key);
                      return next;
                    })
                  }
                  className={`flex items-center gap-1.5 text-[11px] ${
                    hidden.has(s.key) ? "text-neutral-300 line-through" : "text-neutral-600"
                  }`}
                >
                  <svg width="18" height="6">
                    <line x1="0" y1="3" x2="18" y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />
                  </svg>
                  {t(s.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("evmChartTitle")}>
            {yTicks.map((v, i) => (
              <g key={i}>
                <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#e5e5e5" strokeWidth="1" />
                <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#737373">
                  {compactMoney(v, lang)}
                </text>
              </g>
            ))}
            {xTicks.map((p) => (
              <text key={p.date} x={x(p.date)} y={H - padB + 16} textAnchor="middle" fontSize="10" fill="#737373">
                {tickLabel(p.date)}
              </text>
            ))}
            <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="#a3a3a3" />
            {inRange(statusDate) && (
              <g>
                <line
                  x1={x(statusDate!)}
                  x2={x(statusDate!)}
                  y1={padT}
                  y2={H - padB}
                  stroke="#2563eb"
                  strokeDasharray="4 3"
                />
                <text x={x(statusDate!) + 3} y={padT + 9} fontSize="9" fill="#2563eb">
                  {t("evmStatusLine")}
                </text>
              </g>
            )}
            {inRange(today) && (
              <g>
                <line x1={x(today)} x2={x(today)} y1={padT} y2={H - padB} stroke="#ef4444" />
                <text x={x(today) + 3} y={H - padB - 4} fontSize="9" fill="#ef4444">
                  {t("evmTodayLine")}
                </text>
              </g>
            )}
            {SERIES.map((s) => {
              const pts = seriesData[s.key];
              if (hidden.has(s.key) || pts.length === 0) return null;
              const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
              const last = pts[pts.length - 1];
              return (
                <g key={s.key}>
                  <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash} />
                  {s.markers &&
                    pts.slice(1).map((p) => (
                      <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r="3.5" fill={s.color}>
                        <title>{`${t(s.labelKey)} · ${formatDate(p.date, lang)}: ${formatMoney(p.value, lang)}`}</title>
                      </circle>
                    ))}
                  <text x={Math.min(x(last.date) + 4, W - padR - 40)} y={y(last.value) - 4} fontSize="9" fill={s.color}>
                    {compactMoney(last.value, lang)}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="mt-2 text-[11px] leading-snug text-neutral-500">{t("evmFootnote")}</p>
        </section>

        {showTable && (
          <section className="overflow-auto rounded-md border border-neutral-200">
            <table className="w-full text-[12px]">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">{t("evmPeriod")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t("evmSeriesPv")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t("evmSeriesCurrent")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t("evmSeriesEv")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t("evmSeriesCertified")}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t("evmSeriesAc")}</th>
                </tr>
              </thead>
              <tbody>
                {data.periods.map((p) => (
                  <tr key={p.date} className="border-t border-neutral-100">
                    <td className="px-2 py-1 text-neutral-600">
                      {formatDate(p.from, lang)} – {formatDate(p.date, lang)}
                    </td>
                    <td className="px-2 py-1 text-right">{formatMoney(p.pv, lang)}</td>
                    <td className="px-2 py-1 text-right">{formatMoney(p.pvCurrent, lang)}</td>
                    <td className="px-2 py-1 text-right">{p.ev !== null ? formatMoney(p.ev, lang) : ""}</td>
                    <td className="px-2 py-1 text-right">{p.certified !== null ? formatMoney(p.certified, lang) : ""}</td>
                    <td className="px-2 py-1 text-right">{p.ac !== null ? formatMoney(p.ac, lang) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-md border border-neutral-200 p-3">
            <div className="mb-1 flex items-center">
              <h3 className="text-xs font-semibold text-neutral-700">{t("evmCostsTitle")}</h3>
              <button
                onClick={() =>
                  changeProject((p) => ({
                    ...p,
                    actualCosts: [
                      ...(p.actualCosts ?? []),
                      { id: uuid(), date: p.schedule?.statusDate ?? todayISO(), amount: 0 } as CostEntry,
                    ],
                  }))
                }
                className="ml-auto rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100"
              >
                {t("evmAddCost")}
              </button>
            </div>
            <p className="mb-2 text-[11px] text-neutral-500">{t("evmCostsHelp")}</p>
            {costs.length === 0 ? (
              <p className="py-3 text-center text-[12px] text-neutral-400">{t("evmNoCosts")}</p>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="text-neutral-500">
                  <tr>
                    <th className="py-1 text-left font-medium">{t("evmDate")}</th>
                    <th className="py-1 text-right font-medium">{t("evmAmount")}</th>
                    <th className="py-1 pl-2 text-left font-medium">{t("evmDescription")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...costs]
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((c) => {
                      const update = (patch: Partial<CostEntry>) =>
                        changeProject(
                          (p) => ({
                            ...p,
                            actualCosts: (p.actualCosts ?? []).map((x) => (x.id === c.id ? { ...x, ...patch } : x)),
                          }),
                          `cost:${c.id}:${Object.keys(patch).join(",")}`,
                        );
                      return (
                        <tr key={c.id} className="border-t border-neutral-100">
                          <td className="py-1">
                            <input
                              type="date"
                              value={c.date}
                              onChange={(e) => e.target.value && update({ date: e.target.value })}
                              className="bg-transparent text-[11px] outline-none"
                            />
                          </td>
                          <td className="py-1 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={Number.isFinite(c.amount) ? c.amount : 0}
                              onChange={(e) => update({ amount: Number(e.target.value) || 0 })}
                              className="w-28 bg-transparent text-right outline-none"
                            />
                          </td>
                          <td className="py-1 pl-2">
                            <input
                              value={c.description ?? ""}
                              onChange={(e) => update({ description: e.target.value })}
                              className="w-full bg-transparent outline-none"
                            />
                          </td>
                          <td className="py-1 text-right">
                            <button
                              onClick={() =>
                                changeProject((p) => ({
                                  ...p,
                                  actualCosts: (p.actualCosts ?? []).filter((x) => x.id !== c.id),
                                }))
                              }
                              aria-label={t("evmDelete")}
                              className="rounded px-1.5 text-red-500 hover:bg-red-50"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  <tr className="border-t border-neutral-200 font-medium">
                    <td className="py-1">{t("evmTotal")}</td>
                    <td className="py-1 text-right">{formatMoney(costsTotal, lang)}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            )}
          </section>

          <section className="rounded-md border border-neutral-200 p-3">
            <h3 className="mb-2 text-xs font-semibold text-neutral-700">{t("evmSnapshotsTitle")}</h3>
            {snapshots.length === 0 ? (
              <p className="py-3 text-center text-[12px] text-neutral-400">{t("evmNoSnapshots")}</p>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="text-neutral-500">
                  <tr>
                    <th className="py-1 text-left font-medium">{t("evmDate")}</th>
                    <th className="py-1 text-right font-medium">PV</th>
                    <th className="py-1 text-right font-medium">EV</th>
                    <th className="py-1 text-right font-medium">AC</th>
                    <th className="py-1 text-right font-medium">SPI</th>
                    <th className="py-1 text-right font-medium">CPI</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => (
                    <tr key={s.id} className="border-t border-neutral-100">
                      <td className="py-1">{formatDate(s.date, lang)}</td>
                      <td className="py-1 text-right">{formatMoney(s.pv, lang, 0)}</td>
                      <td className="py-1 text-right">{formatMoney(s.ev, lang, 0)}</td>
                      <td className="py-1 text-right">{formatMoney(s.ac, lang, 0)}</td>
                      <td className="py-1 text-right">{s.pv > 0 ? formatNumber(s.ev / s.pv, lang) : "—"}</td>
                      <td className="py-1 text-right">{s.ac > 0 ? formatNumber(s.ev / s.ac, lang) : "—"}</td>
                      <td className="py-1 text-right">
                        <button
                          onClick={() =>
                            changeProject((p) => ({
                              ...p,
                              evSnapshots: (p.evSnapshots ?? []).filter((x) => x.id !== s.id),
                            }))
                          }
                          title={t("evmDeleteSnapshot")}
                          aria-label={t("evmDeleteSnapshot")}
                          className="rounded px-1.5 text-red-500 hover:bg-red-50"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </FullScreenPanel>
  );
}
