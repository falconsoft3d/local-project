"use client";

import { useStore } from "@/lib/store";
import { useLanguage, useT } from "@/lib/useT";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { defaultScheduleSettings } from "@/lib/normalize";
import type { DurationType, ID, Project } from "@/lib/types";
import Modal from "../Modal";

type ViewName = "network" | "histogram" | "scurve" | "variance" | "report";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-snug text-neutral-400">{hint}</span>}
    </label>
  );
}

const inputCls =
  "rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-green-500 disabled:bg-neutral-50";

function ActionButton({
  onClick,
  children,
  hint,
  disabled,
  primary,
}: {
  onClick: () => void;
  children: React.ReactNode;
  hint: string;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-start rounded-md border p-2.5 text-left disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? "border-green-600 bg-green-600 text-white hover:bg-green-700"
          : "border-neutral-200 hover:border-green-500 hover:bg-green-50"
      }`}
    >
      <span className="text-[13px] font-medium">{children}</span>
      <span className={`mt-0.5 text-[11px] leading-snug ${primary ? "text-green-50" : "text-neutral-500"}`}>{hint}</span>
    </button>
  );
}

/** "Pestaña Programación" of the budget: configuration, tracking actions, baselines and
 * earned-value photos (manual chapter 04). */
export default function SchedulingPanel({
  projectId,
  project,
  onClose,
  onOpenCalendar,
  onOpenView,
  onOpenChecks,
}: {
  projectId: ID;
  project: Project;
  onClose: () => void;
  onOpenCalendar: () => void;
  onOpenView: (v: ViewName) => void;
  onOpenChecks: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const update = useStore((s) => s.updateScheduleSettings);
  const scheduleNow = useStore((s) => s.scheduleNow);
  const saveBaseline = useStore((s) => s.saveBaseline);
  const updateBaseline = useStore((s) => s.updateBaseline);
  const deleteBaseline = useStore((s) => s.deleteBaseline);
  const updateAsScheduled = useStore((s) => s.updateAsScheduled);
  const rescheduleRemaining = useStore((s) => s.rescheduleRemaining);
  const recordProgress = useStore((s) => s.recordProgress);
  const changeProject = useStore((s) => s.changeProject);

  const settings = defaultScheduleSettings(project.schedule);
  const baselines = project.baselines ?? [];
  const snapshots = project.evSnapshots ?? [];
  const noStatus = !settings.statusDate;
  const auto = settings.autoSchedule;

  return (
    <Modal title={`${t("schedulingTab")} · ${project.name}`} onClose={onClose} width="max-w-4xl">
      <div className="flex max-h-[78vh] flex-col gap-6 overflow-auto pr-1">
        <section>
          <h3 className="mb-3 text-sm font-semibold text-neutral-800">{t("configuration")}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t("durationType")} hint={t(`durationTypeHint_${settings.durationType}`)}>
              <select
                value={settings.durationType}
                onChange={(e) => update(projectId, { durationType: e.target.value as DurationType }, auto)}
                className={inputCls}
              >
                <option value="performance">{t("durationTypePerformance")}</option>
                <option value="date">{t("durationTypeDate")}</option>
                <option value="manual">{t("durationTypeManual")}</option>
              </select>
            </Field>
            <Field label={t("calendar")} hint={t("calendarHint")}>
              <div className="flex gap-2">
                <span className={`${inputCls} flex-1 truncate bg-neutral-50`}>{settings.calendar.name}</span>
                <button
                  onClick={onOpenCalendar}
                  className="rounded-md border border-neutral-300 px-2 text-xs hover:bg-neutral-100"
                >
                  {t("edit")}
                </button>
              </div>
            </Field>
            <Field label={t("scheduleFrom")} hint={t(`scheduleFromHint_${settings.scheduleFrom}`)}>
              <select
                value={settings.scheduleFrom}
                onChange={(e) => update(projectId, { scheduleFrom: e.target.value as "start" | "finish" }, auto)}
                className={inputCls}
              >
                <option value="start">{t("scheduleFromStart")}</option>
                <option value="finish">{t("scheduleFromFinish")}</option>
              </select>
            </Field>
            <Field label={t("projectStartDate")}>
              <input
                type="date"
                value={settings.startDate ?? ""}
                onChange={(e) => update(projectId, { startDate: e.target.value || undefined }, auto)}
                className={inputCls}
              />
            </Field>
            <Field label={t("projectFinishDate")} hint={t("projectFinishDateHint")}>
              <input
                type="date"
                value={settings.finishDate ?? ""}
                onChange={(e) => update(projectId, { finishDate: e.target.value || undefined }, auto)}
                className={inputCls}
              />
            </Field>
            <Field label={t("autoSchedule")} hint={t("autoScheduleHint")}>
              <label className="flex items-center gap-2 py-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={settings.autoSchedule}
                  onChange={(e) => update(projectId, { autoSchedule: e.target.checked }, e.target.checked)}
                />
                {settings.autoSchedule ? t("enabled") : t("disabled")}
              </label>
            </Field>
            <Field label={t("statusDate")} hint={t("statusDateHint")}>
              <input
                type="date"
                value={settings.statusDate ?? ""}
                onChange={(e) => update(projectId, { statusDate: e.target.value || undefined })}
                className={inputCls}
              />
            </Field>
            <Field label={t("compareWith")} hint={t("compareWithHint")}>
              <select
                value={settings.activeBaselineId ?? ""}
                onChange={(e) => update(projectId, { activeBaselineId: e.target.value || undefined })}
                className={inputCls}
              >
                <option value="">—</option>
                {baselines.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-neutral-800">{t("actions")}</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <ActionButton
              primary
              onClick={() => {
                if (confirm(t("scheduleConfirm"))) scheduleNow(projectId);
              }}
              hint={t("scheduleHint")}
            >
              {t("scheduleButton")}
            </ActionButton>
            <ActionButton onClick={() => saveBaseline(projectId, t("baselineDefaultName", { n: baselines.length + 1 }))} hint={t("saveBaselineHint")}>
              {t("saveBaseline")}
            </ActionButton>
            <ActionButton
              disabled={noStatus}
              onClick={() => {
                if (confirm(t("updateAsScheduledConfirm", { date: formatDate(settings.statusDate, lang) })))
                  updateAsScheduled(projectId);
              }}
              hint={noStatus ? t("needsStatusDate") : t("updateAsScheduledHint")}
            >
              {t("updateAsScheduled")}
            </ActionButton>
            <ActionButton
              disabled={noStatus}
              onClick={() => {
                if (confirm(t("rescheduleRemainingConfirm", { date: formatDate(settings.statusDate, lang) })))
                  rescheduleRemaining(projectId);
              }}
              hint={noStatus ? t("needsStatusDate") : t("rescheduleRemainingHint")}
            >
              {t("rescheduleRemaining")}
            </ActionButton>
            <ActionButton onClick={() => onOpenView("variance")} hint={t("varianceHint")}>
              {t("varianceView")}
            </ActionButton>
            <ActionButton
              disabled={noStatus}
              onClick={() => recordProgress(projectId)}
              hint={noStatus ? t("needsStatusDate") : t("recordProgressHint")}
            >
              {t("recordProgress")}
            </ActionButton>
            <ActionButton onClick={() => onOpenView("histogram")} hint={t("resourcesViewHint")}>
              {t("resourcesView")}
            </ActionButton>
            <ActionButton onClick={() => onOpenView("histogram")} hint={t("levelResourcesHint")}>
              {t("levelResources")}
            </ActionButton>
            <ActionButton onClick={() => onOpenView("network")} hint={t("networkHint")}>
              {t("networkDiagram")}
            </ActionButton>
            <ActionButton onClick={() => onOpenView("scurve")} hint={t("sCurveHint")}>
              {t("sCurve")}
            </ActionButton>
            <ActionButton onClick={() => onOpenView("report")} hint={t("reportHint")}>
              {t("trackingReport")}
            </ActionButton>
            <ActionButton onClick={onOpenChecks} hint={t("checksHint")}>
              {t("checksButton")}
            </ActionButton>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-neutral-800">{t("baselines")}</h3>
          {baselines.length === 0 ? (
            <p className="text-xs text-neutral-400">{t("noBaselineYet")}</p>
          ) : (
            <table className="w-full text-left text-[12px]">
              <thead className="border-b border-neutral-200 text-[11px] text-neutral-500">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">{t("name")}</th>
                  <th className="py-1.5 pr-2 font-medium">{t("savedOn")}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{t("amount")}</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {baselines.map((b) => {
                  const active = b.id === settings.activeBaselineId;
                  return (
                    <tr key={b.id} className="border-b border-neutral-100">
                      <td className="py-1 pr-2">
                        <input
                          value={b.name}
                          onChange={(e) => updateBaseline(projectId, b.id, { name: e.target.value })}
                          className="w-full rounded border border-transparent px-1 py-0.5 outline-none hover:border-neutral-200 focus:border-green-500"
                        />
                      </td>
                      <td className="py-1 pr-2 text-neutral-500">{formatDate(b.createdAt.slice(0, 10), lang)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{formatMoney(b.total, lang)}</td>
                      <td className="py-1 text-right">
                        {active ? (
                          <span className="mr-2 rounded bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                            {t("active")}
                          </span>
                        ) : (
                          <button
                            onClick={() => update(projectId, { activeBaselineId: b.id })}
                            className="mr-1 rounded border border-neutral-200 px-2 py-0.5 text-[11px] hover:bg-neutral-100"
                          >
                            {t("compare")}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(t("deleteBaselineConfirm", { name: b.name }))) deleteBaseline(projectId, b.id);
                          }}
                          className="rounded px-2 py-0.5 text-[11px] text-red-500 hover:bg-red-50"
                        >
                          {t("delete")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-neutral-800">{t("earnedValueSnapshots")}</h3>
          {snapshots.length === 0 ? (
            <p className="text-xs text-neutral-400">{t("noSnapshotsYet")}</p>
          ) : (
            <table className="w-full text-left text-[12px] tabular-nums">
              <thead className="border-b border-neutral-200 text-[11px] text-neutral-500">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">{t("statusDate")}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">PV</th>
                  <th className="py-1.5 pr-2 text-right font-medium">EV</th>
                  <th className="py-1.5 pr-2 text-right font-medium">AC</th>
                  <th className="py-1.5 pr-2 text-right font-medium">SPI</th>
                  <th className="py-1.5 pr-2 text-right font-medium">CPI</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => {
                  const spi = s.pv > 0 ? s.ev / s.pv : null;
                  const cpi = s.ac > 0 ? s.ev / s.ac : null;
                  return (
                    <tr key={s.id} className="border-b border-neutral-100">
                      <td className="py-1 pr-2">{formatDate(s.date, lang)}</td>
                      <td className="py-1 pr-2 text-right">{formatMoney(s.pv, lang, 0)}</td>
                      <td className="py-1 pr-2 text-right">{formatMoney(s.ev, lang, 0)}</td>
                      <td className="py-1 pr-2 text-right">{formatMoney(s.ac, lang, 0)}</td>
                      <td className={`py-1 pr-2 text-right ${spi !== null && spi < 1 ? "text-red-600" : ""}`}>
                        {formatNumber(spi, lang)}
                      </td>
                      <td className={`py-1 pr-2 text-right ${cpi !== null && cpi < 1 ? "text-red-600" : ""}`}>
                        {formatNumber(cpi, lang)}
                      </td>
                      <td className="py-1 text-right">
                        <button
                          onClick={() =>
                            changeProject(projectId, (p) => ({
                              ...p,
                              evSnapshots: (p.evSnapshots ?? []).filter((x) => x.id !== s.id),
                            }))
                          }
                          className="rounded px-2 py-0.5 text-[11px] text-red-500 hover:bg-red-50"
                        >
                          {t("delete")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
          <strong>{t("important")}:</strong> {t("schedulingNeverChangesBudget")}
        </p>
      </div>
    </Modal>
  );
}
