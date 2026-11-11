"use client";

import { useMemo, useState } from "react";
import { useLanguage, useT } from "@/lib/useT";
import { formatMoney, formatNumber } from "@/lib/format";
import { RESOURCE_KIND_COLORS } from "@/lib/constants";
import { KIND_ORDER } from "@/lib/budget";
import {
  buildBudgetReport,
  buildQuantityReport,
  budgetReportXlsx,
  downloadXlsx,
  quantityReportXlsx,
  type BudgetLevel,
} from "@/lib/budgetReports";
import type { ID, Project, ResourceKind, Zoom } from "@/lib/types";
import FullScreenPanel from "../schedule/FullScreenPanel";
import GanttReport, { type GanttReportLevel } from "./GanttReport";
import { exportGanttExcel } from "@/lib/ganttExcel";

export type ReportKind = "budget" | "quantities" | "gantt";

const LEVELS: BudgetLevel[] = ["chapters", "items", "resources"];

/** Budget reports: budget down to chapters / items / resources, and the resource quantity
 * report by type. PDF through the browser print dialog (A4), Excel as .xlsx. */
export default function BudgetReports({
  project,
  onClose,
  initial = "budget",
}: {
  project: Project;
  onClose: () => void;
  initial?: ReportKind;
}) {
  const t = useT();
  const lang = useLanguage();
  const [report, setReport] = useState<ReportKind>(initial);
  const [level, setLevel] = useState<BudgetLevel>("items");
  const [kinds, setKinds] = useState<ResourceKind[]>(KIND_ORDER);
  const [gLevel, setGLevel] = useState<GanttReportLevel>("items");
  const [gZoom, setGZoom] = useState<Zoom>("week");
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [showCritical, setShowCritical] = useState(true);
  const [showBaseline, setShowBaseline] = useState(!!project.schedule?.activeBaselineId);

  const budget = useMemo(() => buildBudgetReport(project, level), [project, level]);
  const quantities = useMemo(() => buildQuantityReport(project, kinds), [project, kinds]);
  const money = (v: number | undefined) => (v === undefined ? "" : formatMoney(v, lang));
  const qty = (v: number | undefined) => (v === undefined ? "" : formatNumber(v, lang, 3));
  const pct = (v: number) => (budget.total > 0 ? `${formatNumber((v / budget.total) * 100, lang, 2)} %` : "—");

  const subtitle =
    report === "gantt"
      ? [
          t(`repLevel_${gLevel}`),
          project.schedule?.statusDate ? `${t("statusDate")}: ${project.schedule.statusDate.split("-").reverse().join("/")}` : "",
          onlyCritical ? t("onlyCritical") : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : report === "budget"
      ? t(`repLevel_${level}`)
      : kinds.length === KIND_ORDER.length
        ? t("budAll")
        : kinds.map((k) => t(`kindShort_${k}`)).join(", ");

  function exportExcel() {
    if (report === "gantt") {
      // "Down to chapters": collapse the chapters that only contain items.
      const collapsedIds = new Set<ID>();
      if (gLevel === "chapters") {
        const parents = new Set(project.tasks.map((x) => x.parentId).filter(Boolean) as ID[]);
        for (const id of parents) {
          const hasSubChapter = project.tasks.some((x) => x.parentId === id && parents.has(x.id));
          if (!hasSubChapter) collapsedIds.add(id);
        }
      }
      exportGanttExcel(project, gZoom, lang, { collapsedIds, onlyCritical, showCritical });
      return;
    }
    if (report === "budget") downloadXlsx(budgetReportXlsx(project, level, t), project, `${t("repBudgetFile")}_${level}`);
    else downloadXlsx(quantityReportXlsx(project, kinds, t), project, t("repQuantityFile"));
  }

  const seg = (active: boolean) =>
    `rounded px-2.5 py-1 text-xs font-medium ${active ? "bg-green-600 text-white" : "text-neutral-600 hover:bg-neutral-100"}`;
  const th = "border-b-2 border-neutral-800 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-600";

  return (
    <FullScreenPanel
      title={`${t("repTitle")} · ${project.name}`}
      onClose={onClose}
      toolbar={
        <>
          <div className="flex rounded-md border border-neutral-200 p-0.5">
            <button onClick={() => setReport("budget")} className={seg(report === "budget")}>
              {t("repBudgetTitle")}
            </button>
            <button onClick={() => setReport("quantities")} className={seg(report === "quantities")}>
              {t("repQuantityTitle")}
            </button>
            <button onClick={() => setReport("gantt")} className={seg(report === "gantt")}>
              {t("repGanttTitle")}
            </button>
          </div>
          {report === "gantt" ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600">
              <div className="flex rounded-md border border-neutral-200 p-0.5">
                {(["chapters", "items"] as const).map((l) => (
                  <button key={l} onClick={() => setGLevel(l)} className={seg(gLevel === l)}>
                    {t(`repLevel_${l}`)}
                  </button>
                ))}
              </div>
              <div className="flex rounded-md border border-neutral-200 p-0.5">
                {(["week", "month"] as const).map((z) => (
                  <button key={z} onClick={() => setGZoom(z)} className={seg(gZoom === z)}>
                    {t(z)}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={showCritical} onChange={(e) => setShowCritical(e.target.checked)} />
                {t("criticalPath")}
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={onlyCritical} onChange={(e) => setOnlyCritical(e.target.checked)} />
                {t("onlyCritical")}
              </label>
              <label className={`flex items-center gap-1 ${project.schedule?.activeBaselineId ? "" : "opacity-40"}`}>
                <input
                  type="checkbox"
                  disabled={!project.schedule?.activeBaselineId}
                  checked={showBaseline}
                  onChange={(e) => setShowBaseline(e.target.checked)}
                />
                {t("baselineToggle")}
              </label>
            </div>
          ) : report === "budget" ? (
            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
              {t("repLevel")}
              <div className="flex rounded-md border border-neutral-200 p-0.5">
                {LEVELS.map((l) => (
                  <button key={l} onClick={() => setLevel(l)} className={seg(level === l)}>
                    {t(`repLevel_${l}`)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              {KIND_ORDER.map((k) => (
                <label key={k} className="flex cursor-pointer items-center gap-1">
                  <input
                    type="checkbox"
                    checked={kinds.includes(k)}
                    onChange={(e) =>
                      setKinds((prev) =>
                        e.target.checked ? KIND_ORDER.filter((x) => x === k || prev.includes(x)) : prev.filter((x) => x !== k),
                      )
                    }
                  />
                  <span className="font-bold" style={{ color: RESOURCE_KIND_COLORS[k] }}>
                    {t(`kindShort_${k}`)}
                  </span>
                  <span className="text-neutral-500">{t(`kindLong_${k}`)}</span>
                </label>
              ))}
            </div>
          )}
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => window.print()}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
            >
              PDF
            </button>
            <button
              onClick={exportExcel}
              className="rounded-md border border-green-600 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50"
            >
              Excel
            </button>
          </div>
        </>
      }
    >
      {/* Print only the report, on A4 portrait. */}
      <style>{`
        @media print {
          @page { size: ${report === "gantt" ? "A4 landscape" : "A4"}; margin: ${report === "gantt" ? "8mm" : "12mm"}; }
          body * { visibility: hidden !important; }
          .budget-report, .budget-report * { visibility: visible !important; }
          .budget-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
          .budget-report tr { break-inside: avoid; }
        }
      `}</style>
      <div
        className={`budget-report mx-auto p-6 text-[12px] text-neutral-800 ${report === "gantt" ? "max-w-[1400px]" : "max-w-5xl"}`}
      >
        <div className="mb-4 border-b-2 border-neutral-800 pb-2">
          <h1 className="text-xl font-bold">
            {t(report === "budget" ? "repBudgetTitle" : report === "gantt" ? "repGanttTitle" : "repQuantityTitle")}
          </h1>
          <p className="font-semibold">{project.name}</p>
          <p className="text-neutral-500">
            {subtitle} · {t("repGenerated")}: {new Date().toLocaleDateString(lang === "es" ? "es-ES" : "en-GB")}
          </p>
        </div>

        {report === "gantt" ? (
          <>
            <GanttReport
              project={project}
              level={gLevel}
              zoom={gZoom}
              onlyCritical={onlyCritical}
              showCritical={showCritical}
              showBaseline={showBaseline}
            />
            <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-neutral-600">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-5 rounded-sm" style={{ backgroundColor: "#4ade80" }} /> {t("repLegendTask")}
              </span>
              {showCritical && (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-5 rounded-sm bg-red-600" /> {t("critical")}
                </span>
              )}
              <span className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-5 bg-neutral-800" /> {t("budChapter")}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rotate-45 bg-neutral-900" /> {t("repLegendMilestone")}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-5 rounded-sm bg-green-400">
                  <span className="block h-full w-1/2 bg-black/30" />
                </span>{" "}
                {t("physicalProgress")}
              </span>
              {showBaseline && (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-[3px] w-5 bg-neutral-400" /> {t("baselineToggle")}
                </span>
              )}
              {project.schedule?.statusDate && (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 border-l-2 border-dashed border-blue-500" /> {t("statusDate")}
                </span>
              )}
            </div>
          </>
        ) : report === "budget" ? (
          <>
            <table className="w-full border-collapse">
              <thead className="table-header-group">
                <tr>
                  <th className={`${th} w-[90px]`}>{t("budCode")}</th>
                  <th className={th}>{t("budSummary")}</th>
                  <th className={`${th} w-[50px]`}>{t("budUnit")}</th>
                  <th className={`${th} w-[90px] text-right`}>{t("budQuantity")}</th>
                  <th className={`${th} w-[100px] text-right`}>{t("budPrice")}</th>
                  <th className={`${th} w-[120px] text-right`}>{t("budAmount")}</th>
                </tr>
              </thead>
              <tbody>
                {budget.rows.map((r, i) =>
                  r.kind === "chapter" ? (
                    <tr key={i} className="border-b border-neutral-300 bg-neutral-100">
                      <td className="px-2 py-1.5 font-bold">{r.code}</td>
                      <td className="px-2 py-1.5 font-bold uppercase" style={{ paddingLeft: 8 + r.depth * 12 }} colSpan={4}>
                        {r.name}
                      </td>
                      <td className="px-2 py-1.5 text-right font-bold tabular-nums">{money(r.amount)}</td>
                    </tr>
                  ) : r.kind === "item" ? (
                    <tr key={i} className={`border-b border-neutral-200 ${level === "resources" ? "font-semibold" : ""}`}>
                      <td className="px-2 py-1 align-top">{r.code}</td>
                      <td className="px-2 py-1" style={{ paddingLeft: 8 + r.depth * 12 }}>
                        {r.name}
                      </td>
                      <td className="px-2 py-1">{r.unit}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{qty(r.quantity)}</td>
                      <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{money(r.price)}</td>
                      <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{money(r.amount)}</td>
                    </tr>
                  ) : (
                    <tr key={i} className="text-[11px] text-neutral-600">
                      <td className="px-2 py-0.5 pl-4">{r.code}</td>
                      <td className="px-2 py-0.5" style={{ paddingLeft: 8 + r.depth * 12 }}>
                        <span className="mr-1.5 font-bold" style={{ color: RESOURCE_KIND_COLORS[r.resourceKind ?? "labor"] }}>
                          {t(`kindShort_${r.resourceKind}`)}
                        </span>
                        {r.name}
                      </td>
                      <td className="px-2 py-0.5">{r.unit}</td>
                      <td className="px-2 py-0.5 text-right tabular-nums">{qty(r.quantity)}</td>
                      <td className="px-2 py-0.5 text-right tabular-nums">{money(r.price)}</td>
                      <td className="px-2 py-0.5 text-right tabular-nums">{money(r.amount)}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            {level === "resources" && <p className="mt-1 text-[10px] text-neutral-400">{t("repResourcesNote")}</p>}

            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2">
              <div>
                <h2 className="mb-1 text-sm font-bold">{t("repChapterSummary")}</h2>
                <table className="w-full border-collapse">
                  <tbody>
                    {budget.chapters.map((c, i) => (
                      <tr key={i} className="border-b border-neutral-200">
                        <td className="px-2 py-1 font-medium">{c.code}</td>
                        <td className="px-2 py-1">{c.name}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-neutral-500">{pct(c.amount)}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{money(c.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h2 className="mb-1 text-sm font-bold">{t("repByType")}</h2>
                <table className="w-full border-collapse">
                  <tbody>
                    {KIND_ORDER.map((k) => (
                      <tr key={k} className="border-b border-neutral-200">
                        <td className="px-2 py-1 font-bold" style={{ color: RESOURCE_KIND_COLORS[k] }}>
                          {t(`kindShort_${k}`)}
                        </td>
                        <td className="px-2 py-1">{t(`kindLong_${k}`)}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-neutral-500">{pct(budget.byKind[k])}</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{money(budget.byKind[k])}</td>
                      </tr>
                    ))}
                    <tr className="border-b border-neutral-200">
                      <td />
                      <td className="px-2 py-1">{t("budUnbroken")}</td>
                      <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-neutral-500">{pct(budget.unbroken)}</td>
                      <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{money(budget.unbroken)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-4 flex justify-between border-y-2 border-neutral-800 px-2 py-2 text-sm font-bold">
              <span>{t("budTotal")}</span>
              <span className="tabular-nums">{money(budget.total)}</span>
            </div>
          </>
        ) : quantities.groups.length === 0 ? (
          <p className="py-10 text-center text-neutral-400">{t("repNoQuantities")}</p>
        ) : (
          <>
            <table className="w-full border-collapse">
              <thead className="table-header-group">
                <tr>
                  <th className={`${th} w-[100px]`}>{t("budCode")}</th>
                  <th className={th}>{t("budSummary")}</th>
                  <th className={`${th} w-[50px]`}>{t("budUnit")}</th>
                  <th className={`${th} w-[110px] text-right`}>{t("repTotalQuantity")}</th>
                  <th className={`${th} w-[100px] text-right`}>{t("budPrice")}</th>
                  <th className={`${th} w-[120px] text-right`}>{t("budAmount")}</th>
                  <th className={`${th} w-[60px] text-right`}>{t("budUsedIn")}</th>
                </tr>
              </thead>
              {quantities.groups.map((g) => (
                <tbody key={g.kind}>
                  <tr className="border-b border-neutral-300 bg-neutral-100">
                    <td className="px-2 py-1.5 font-bold" style={{ color: RESOURCE_KIND_COLORS[g.kind] }}>
                      {t(`kindShort_${g.kind}`)}
                    </td>
                    <td className="px-2 py-1.5 font-bold uppercase" colSpan={4}>
                      {t(`kindLong_${g.kind}`)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums">{money(g.amount)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500">
                      {quantities.total > 0 ? `${formatNumber((g.amount / quantities.total) * 100, lang, 1)} %` : ""}
                    </td>
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.id} className="border-b border-neutral-200">
                      <td className="px-2 py-1">{r.code}</td>
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1">{r.unit}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{qty(r.quantity)}</td>
                      <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{money(r.price)}</td>
                      <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{money(r.amount)}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-neutral-500">{r.items}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
            <div className="mt-4 flex justify-between border-y-2 border-neutral-800 px-2 py-2 text-sm font-bold">
              <span>{t("repQuantityTotal")}</span>
              <span className="tabular-nums">{money(quantities.total)}</span>
            </div>
          </>
        )}
      </div>
    </FullScreenPanel>
  );
}
