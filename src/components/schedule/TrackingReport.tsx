"use client";

import { useMemo } from "react";
import { todayISO } from "@/lib/calendar";
import { compareCodes, delayedTasks, type DelayReason } from "@/lib/evm";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { findOverallocations } from "@/lib/resources";
import { activeBaseline, getComputedTasks } from "@/lib/schedule";
import { earnedValueAt } from "@/lib/tracking";
import { useLanguage, useT } from "@/lib/useT";
import type { Project } from "@/lib/types";
import FullScreenPanel from "./FullScreenPanel";

/** "Informe de seguimiento": earned value at the status date, delayed tasks with their
 * reason, unfinished critical tasks and over-allocated resources. Prints on A4. */
export default function TrackingReport({ project, onClose }: { project: Project; onClose: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const statusDate = project.schedule?.statusDate;
  const date = statusDate ?? todayISO();
  const baseline = activeBaseline(project);

  const computed = useMemo(() => getComputedTasks(project), [project]);
  const ev = useMemo(() => earnedValueAt(project, date), [project, date]);
  const delayed = useMemo(() => delayedTasks(project, computed), [project, computed]);
  const critical = useMemo(
    () =>
      computed
        .filter((c) => !c.isSummary && c.critical && !c.isFinished)
        .sort((a, b) => compareCodes(a.displayCode, b.displayCode)),
    [computed],
  );
  const over = useMemo(() => {
    try {
      return findOverallocations(project);
    } catch {
      return [];
    }
  }, [project]);
  const byId = useMemo(() => new Map(computed.map((c) => [c.id, c])), [computed]);
  const scheduledFinish = computed.reduce<string | undefined>(
    (m, c) => (!m || c.computedEnd > m ? c.computedEnd : m),
    undefined,
  );

  const reasonText = (r: DelayReason) => {
    if (r.kind === "late") return r.days === 1 ? t("evmReasonLate1") : t("evmReasonLate", { days: r.days });
    if (r.kind === "behind") return t("evmReasonBehind", { progress: r.progress, expected: r.expected });
    return t("evmReasonNegFloat", { float: r.float });
  };

  const th = "border-b border-neutral-300 px-2 py-1.5 text-left text-[11px] font-semibold text-neutral-600";
  const td = "border-b border-neutral-100 px-2 py-1 align-top";

  return (
    <FullScreenPanel
      title={`${t("evmReportTitle")} · ${project.name}`}
      onClose={onClose}
      toolbar={
        <button
          onClick={() => window.print()}
          className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
        >
          {t("evmPrint")}
        </button>
      }
    >
      {/* Print only the report: hide the rest of the app and use A4 margins. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body * { visibility: hidden !important; }
          .tracking-report, .tracking-report * { visibility: visible !important; }
          .tracking-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
        }
      `}</style>
      <div className="tracking-report mx-auto max-w-4xl p-6 text-[12px] text-neutral-800">
        <div className="mb-4 border-b-2 border-neutral-800 pb-2">
          <h1 className="text-xl font-bold">{t("evmReportTitle")}</h1>
          <p className="font-semibold">{project.name}</p>
          <p className="text-neutral-600">
            {t("evmReportStatusDate")}: {formatDate(date, lang)} · {t("evmReportComparedWith")}:{" "}
            {baseline?.name ?? t("evmReportNoBaseline")} · {t("evmReportScheduledFinish")}:{" "}
            {formatDate(scheduledFinish, lang)}
          </p>
          {!statusDate && (
            <p className="mt-1 text-amber-700 print:text-neutral-600">
              {t("evmReportNoStatusDate", { date: formatDate(date, lang) })}
            </p>
          )}
        </div>

        <h2 className="mb-1 mt-4 text-sm font-semibold">{t("evmReportEvTitle")}</h2>
        <table className="w-full break-inside-avoid">
          <thead>
            <tr>
              <th className={th}>{t("evmBac")}</th>
              <th className={th}>{t("evmPv")}</th>
              <th className={th}>{t("evmEv")}</th>
              <th className={th}>{t("evmAc")}</th>
              <th className={th}>SPI</th>
              <th className={th}>CPI</th>
              <th className={th}>{t("evmEac")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={td}>{formatMoney(ev.bac, lang)}</td>
              <td className={td}>{formatMoney(ev.pv, lang)}</td>
              <td className={td}>{formatMoney(ev.ev, lang)}</td>
              <td className={td}>{formatMoney(ev.ac, lang)}</td>
              <td className={`${td} ${ev.spi !== null && ev.spi < 1 ? "text-red-600" : ""}`}>
                {ev.spi !== null ? formatNumber(ev.spi, lang) : "—"}
              </td>
              <td className={`${td} ${ev.cpi !== null && ev.cpi < 1 ? "text-red-600" : ""}`}>
                {ev.cpi !== null ? formatNumber(ev.cpi, lang) : "—"}
              </td>
              <td className={td}>{ev.eac !== null ? formatMoney(ev.eac, lang) : "—"}</td>
            </tr>
          </tbody>
        </table>
        {ev.ac <= 0 && <p className="mt-1 text-[11px] text-neutral-500">{t("evmNoAcNote")}</p>}

        <h2 className="mb-1 mt-5 text-sm font-semibold">{t("evmReportDelayedTitle")}</h2>
        <p className="mb-1 text-[11px] text-neutral-500">{t("evmReportDelayedRule")}</p>
        {delayed.length === 0 ? (
          <p className="text-neutral-500">{t("evmReportNone")}</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>{t("evmColCode")}</th>
                <th className={th}>{t("evmColTask")}</th>
                <th className={th}>{t("evmColBaselineFinish")}</th>
                <th className={th}>{t("evmColFinish")}</th>
                <th className={`${th} text-right`}>{t("evmColProgress")}</th>
                <th className={th}>{t("evmColReason")}</th>
              </tr>
            </thead>
            <tbody>
              {delayed.map((d) => (
                <tr key={d.task.id} className="break-inside-avoid">
                  <td className={`${td} whitespace-nowrap`}>{d.task.displayCode}</td>
                  <td className={td}>{d.task.name}</td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(d.task.baselineFinish, lang)}</td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(d.task.computedEnd, lang)}</td>
                  <td className={`${td} text-right`}>{d.task.progress}</td>
                  <td className={td}>{d.reasons.map(reasonText).join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 className="mb-1 mt-5 text-sm font-semibold">{t("evmReportCriticalTitle")}</h2>
        {critical.length === 0 ? (
          <p className="text-neutral-500">{t("evmReportNone")}</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>{t("evmColCode")}</th>
                <th className={th}>{t("evmColTask")}</th>
                <th className={th}>{t("evmColStart")}</th>
                <th className={th}>{t("evmColFinish")}</th>
                <th className={`${th} text-right`}>{t("evmColTotalFloat")}</th>
              </tr>
            </thead>
            <tbody>
              {critical.map((c) => (
                <tr key={c.id} className="break-inside-avoid">
                  <td className={`${td} whitespace-nowrap`}>{c.displayCode}</td>
                  <td className={td}>{c.name}</td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(c.computedStart, lang)}</td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(c.computedEnd, lang)}</td>
                  <td className={`${td} text-right ${(c.totalFloat ?? 0) < 0 ? "text-red-600" : ""}`}>
                    {c.totalFloat ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 className="mb-1 mt-5 text-sm font-semibold">{t("evmReportOverTitle")}</h2>
        {over.length === 0 ? (
          <p className="text-neutral-500">{t("evmReportNone")}</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>{t("evmColResource")}</th>
                <th className={th}>{t("evmColFrom")}</th>
                <th className={th}>{t("evmColTo")}</th>
                <th className={`${th} text-right`}>{t("evmColPeak")}</th>
                <th className={th}>{t("evmColTasks")}</th>
              </tr>
            </thead>
            <tbody>
              {over.map((o, i) => (
                <tr key={`${o.resourceId}-${o.from}-${i}`} className="break-inside-avoid">
                  <td className={td}>{o.resourceName}</td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(o.from, lang)}</td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(o.to, lang)}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <span className="text-red-600">{formatNumber(o.peakHours, lang, 1)}</span> /{" "}
                    {formatNumber(o.capacityHours, lang, 1)}
                  </td>
                  <td className={td}>
                    {o.taskIds
                      .map((id) => byId.get(id))
                      .filter(Boolean)
                      .map((c) => `${c!.displayCode} ${c!.name}`)
                      .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </FullScreenPanel>
  );
}
