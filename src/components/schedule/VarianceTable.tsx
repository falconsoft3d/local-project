"use client";

import { useMemo } from "react";
import { dayNum } from "@/lib/calendar";
import { projectCal } from "@/lib/cpm";
import { compareCodes } from "@/lib/evm";
import { formatDate } from "@/lib/format";
import { activeBaseline, getComputedTasks } from "@/lib/schedule";
import { useStore } from "@/lib/store";
import { useLanguage, useT } from "@/lib/useT";
import type { ID, Project, Task } from "@/lib/types";
import FullScreenPanel from "./FullScreenPanel";

/** "Variación": tracking list of the leaf tasks against the active baseline, where actual
 * dates and physical progress are entered during the monthly close (manual chapter 09). */
export default function VarianceTable({
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
  const baseline = activeBaseline(project);
  const cal = useMemo(() => projectCal(project), [project]);
  const rows = useMemo(
    () =>
      getComputedTasks(project)
        .filter((c) => !c.isSummary)
        .sort((a, b) => compareCodes(a.displayCode, b.displayCode)),
    [project],
  );

  const update = (id: ID, patch: Partial<Task>) =>
    useStore.getState().updateTask(projectId, id, patch, {
      reschedule: project.schedule?.autoSchedule ?? false,
    });

  const th = "px-2 py-1.5 font-medium align-bottom";

  return (
    <FullScreenPanel
      title={`${t("evmVarianceTitle")} · ${project.name}`}
      subtitle={baseline ? `${t("evmReportComparedWith")}: ${baseline.name}` : undefined}
      onClose={onClose}
    >
      <div className="p-4">
        {!baseline && (
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {t("evmNoBaselineHint")}
          </p>
        )}
        <p className="mb-2 text-[11px] text-neutral-500">{t("evmVarianceLegend")}</p>
        <div className="overflow-auto rounded-md border border-neutral-200">
          <table className="w-full min-w-[1200px] text-[12px]">
            <thead className="sticky top-0 bg-neutral-50 text-[11px] text-neutral-500">
              <tr>
                <th className={`${th} text-left`}>{t("evmColCode")}</th>
                <th className={`${th} text-left`}>{t("evmColName")}</th>
                <th className={`${th} text-left`}>{t("evmColBaselineStart")}</th>
                <th className={`${th} text-left`}>{t("evmColStart")}</th>
                <th className={`${th} text-right`}>{t("evmColStartVar")}</th>
                <th className={`${th} text-left`}>{t("evmColBaselineFinish")}</th>
                <th className={`${th} text-left`}>{t("evmColFinish")}</th>
                <th className={`${th} text-right`}>{t("evmColFinishVar")}</th>
                <th className={`${th} text-right`}>{t("evmColTotalFloat")}</th>
                <th className={`${th} text-left`}>{t("evmColActualStart")}</th>
                <th className={`${th} text-left`}>{t("evmColActualFinish")}</th>
                <th className={`${th} text-left`}>{t("evmColProgress")}</th>
                <th className={`${th} text-right`}>{t("evmColRemaining")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const late = (r.finishVariance ?? 0) > 0;
                const tone = r.isFinished ? "text-neutral-400" : late ? "text-red-600" : "text-neutral-800";
                const startVar =
                  r.baselineStart !== undefined ? cal.workDiff(dayNum(r.baselineStart), dayNum(r.computedStart)) : undefined;
                return (
                  <tr key={r.id} className={`border-t border-neutral-100 ${tone}`}>
                    <td className="px-2 py-1 whitespace-nowrap">{r.displayCode}</td>
                    <td className="max-w-[260px] truncate px-2 py-1" title={r.name}>
                      {r.name}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">{formatDate(r.baselineStart, lang)}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{formatDate(r.computedStart, lang)}</td>
                    <td className="px-2 py-1 text-right">{startVar ?? "—"}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{formatDate(r.baselineFinish, lang)}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{formatDate(r.computedEnd, lang)}</td>
                    <td className="px-2 py-1 text-right">{r.finishVariance ?? "—"}</td>
                    <td className={`px-2 py-1 text-right ${(r.totalFloat ?? 0) < 0 ? "font-semibold text-red-600" : ""}`}>
                      {r.isFinished ? "—" : (r.totalFloat ?? "—")}
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="date"
                        value={r.actualStart ?? ""}
                        onChange={(e) => update(r.id, { actualStart: e.target.value || undefined })}
                        className="bg-transparent text-[11px] outline-none"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="date"
                        value={r.actualFinish ?? ""}
                        onChange={(e) => update(r.id, { actualFinish: e.target.value || undefined })}
                        className="bg-transparent text-[11px] outline-none"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded bg-neutral-200">
                          <div
                            className={r.isFinished ? "h-full bg-neutral-400" : "h-full bg-purple-800"}
                            style={{ width: `${Math.min(100, Math.max(0, r.progress))}%` }}
                          />
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={r.progress}
                          onChange={(e) =>
                            update(r.id, {
                              progress: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                            })
                          }
                          className="w-12 bg-transparent text-right outline-none"
                        />
                        <span>%</span>
                      </div>
                    </td>
                    <td className="px-2 py-1 text-right">{r.remainingDuration}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </FullScreenPanel>
  );
}
