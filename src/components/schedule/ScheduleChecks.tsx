"use client";

import { useMemo, useState } from "react";
import { useLanguage, useT } from "@/lib/useT";
import { getComputedTasks } from "@/lib/schedule";
import { runCpm } from "@/lib/cpm";
import { expandLinks } from "@/lib/links";
import { findOverallocations, isTimeResource } from "@/lib/resources";
import { formatDate, formatShortDate } from "@/lib/format";
import type { ComputedTask, Project } from "@/lib/types";
import Modal from "../Modal";

type Status = "ok" | "warn" | "info";

interface Check {
  key: string;
  status: Status;
  label: string;
  detail?: string;
  items?: string[];
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "ok")
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-[11px] font-bold text-green-700">
        ✓
      </span>
    );
  if (status === "warn")
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700">
        ⚠
      </span>
    );
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-500">
      i
    </span>
  );
}

function CheckRow({ check, t }: { check: Check; t: (k: string) => string }) {
  const [open, setOpen] = useState(false);
  const hasItems = !!check.items?.length;
  return (
    <li className="border-b border-neutral-100 py-2 last:border-b-0">
      <div className="flex items-start gap-2">
        <StatusIcon status={check.status} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-neutral-800">{check.label}</div>
          {check.detail && <div className="text-xs text-neutral-500">{check.detail}</div>}
        </div>
        {hasItems && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 rounded px-2 py-0.5 text-[11px] text-green-700 hover:bg-green-50"
          >
            {open ? t("chkHide") : `${t("chkShow")} (${check.items!.length})`}
          </button>
        )}
      </div>
      {open && hasItems && (
        <ul className="ml-7 mt-1 max-h-40 overflow-auto rounded bg-neutral-50 p-2 text-[12px] text-neutral-700">
          {check.items!.map((it, i) => (
            <li key={i} className="truncate">
              {it}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function ScheduleChecks({ project, onClose }: { project: Project; onClose: () => void }) {
  const t = useT();
  const lang = useLanguage();

  const checks = useMemo<Check[]>(() => {
    const computed = getComputedTasks(project);
    const leaves = computed.filter((c) => !c.isSummary);
    const label = (c: ComputedTask) => `${c.displayCode} ${c.name}`;
    const out: Check[] = [];
    const settings = project.schedule;

    const holidays = settings?.calendar.holidays ?? [];
    out.push({
      key: "cal",
      status: holidays.length ? "ok" : "warn",
      label: t("chkCalendarHolidays"),
      detail: holidays.length ? `${settings?.calendar.name ?? ""} · ${holidays.length}` : t("chkCalendarHolidaysNone"),
    });

    const manual =
      settings?.durationType === "performance" ? leaves.filter((c) => !c.durationLocked && !c.isMilestone) : [];
    out.push({
      key: "dur",
      status: manual.length ? "info" : "ok",
      label: t("chkDurations"),
      detail: manual.length ? t("chkDurationsManual", { count: manual.length }) : undefined,
      items: manual.map(label),
    });

    const edges = expandLinks(project.tasks);
    const hasPred = new Set(edges.map((e) => e.successorId));
    const hasSucc = new Set(edges.map((e) => e.predecessorId));
    const byStart = [...leaves].sort((a, b) => a.computedStart.localeCompare(b.computedStart));
    const byEnd = [...leaves].sort((a, b) => b.computedEnd.localeCompare(a.computedEnd));
    const first = byStart[0]?.id;
    const last = byEnd[0]?.id;
    const noPred = leaves.filter((c) => !hasPred.has(c.id) && c.id !== first);
    const noSucc = leaves.filter((c) => !hasSucc.has(c.id) && c.id !== last);
    out.push({
      key: "links",
      status: noPred.length || noSucc.length ? "warn" : "ok",
      label: t("chkLinks"),
      detail:
        noPred.length || noSucc.length
          ? `${t("chkNoPred")}: ${noPred.length} · ${t("chkNoSucc")}: ${noSucc.length}`
          : undefined,
      items: [
        ...noPred.map((c) => `${t("chkNoPred")} — ${label(c)}`),
        ...noSucc.map((c) => `${t("chkNoSucc")} — ${label(c)}`),
      ],
    });

    const cyclic = runCpm(project, false).cyclic;
    out.push({
      key: "cycles",
      status: cyclic.size ? "warn" : "ok",
      label: t("chkCycles"),
      items: leaves.filter((c) => cyclic.has(c.id)).map(label),
    });

    const constrained = leaves.filter((c) => c.constraint && c.constraint !== "ASAP");
    out.push({
      key: "constraints",
      status: "info",
      label: t("chkConstraints"),
      detail: t("chkConstraintsInfo", { count: constrained.length }),
      items: constrained.map(
        (c) => `${label(c)} — ${c.constraint}${c.constraintDate ? ` ${formatShortDate(c.constraintDate)}` : ""}`,
      ),
    });

    const neg = leaves.filter((c) => (c.totalFloat ?? 0) < 0);
    out.push({
      key: "neg",
      status: neg.length ? "warn" : "ok",
      label: t("chkNegFloat"),
      items: neg.map((c) => `${label(c)} (${c.totalFloat} d)`),
    });

    const missed = leaves.filter((c) => c.deadline && c.computedEnd > c.deadline);
    out.push({
      key: "deadlines",
      status: missed.length ? "warn" : "ok",
      label: t("chkDeadlines"),
      items: missed.map(
        (c) => `${label(c)} — ${formatShortDate(c.computedEnd)} > ${formatShortDate(c.deadline)}`,
      ),
    });

    const assigned = new Set(project.tasks.flatMap((tk) => tk.resourceIds));
    const noMax = project.resources.filter((r) => isTimeResource(r) && assigned.has(r.id) && !r.maxUnits);
    out.push({
      key: "maxunits",
      status: noMax.length ? "warn" : "ok",
      label: t("chkMaxUnits"),
      items: noMax.map((r) => r.name),
    });

    const overs = findOverallocations(project);
    out.push({
      key: "over",
      status: overs.length ? "warn" : "ok",
      label: t("chkOveralloc"),
      items: overs.map(
        (o) =>
          `${o.resourceName}: ${formatShortDate(o.from)} – ${formatShortDate(o.to)} (${Math.round(o.peakHours)}/${Math.round(o.capacityHours)} h)`,
      ),
    });

    const finish = leaves.reduce((m, c) => (c.computedEnd > m ? c.computedEnd : m), "");
    const limit = settings?.finishDate;
    out.push({
      key: "finish",
      status: !limit ? "info" : finish && finish > limit ? "warn" : "ok",
      label: t("chkFinish"),
      detail: !limit
        ? t("chkFinishNoDate")
        : finish > limit
          ? t("chkFinishLate", { finish: formatDate(finish, lang), limit: formatDate(limit, lang) })
          : formatDate(finish, lang),
    });

    out.push({ key: "sense", status: "info", label: t("chkCriticalSense") });
    return out;
  }, [project, t, lang]);

  const monthly = ["chkM1", "chkM2", "chkM3", "chkM4", "chkM5", "chkM6", "chkM7", "chkM8", "chkM9"];
  const errors = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <Modal title={t("chkTitle")} onClose={onClose} width="max-w-2xl">
      <div className="max-h-[75vh] overflow-auto pr-1">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-700">{t("chkBeforeBaseline")}</h3>
        <ul className="mb-5">
          {checks.map((c) => (
            <CheckRow key={c.key} check={c} t={t} />
          ))}
        </ul>

        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-700">{t("chkMonthly")}</h3>
        <ol className="mb-5 list-decimal space-y-0.5 pl-5 text-sm text-neutral-700">
          {monthly.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ol>

        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-700">{t("chkCommonErrors")}</h3>
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="w-full text-[12px]">
            <thead className="bg-neutral-100 text-[11px] text-neutral-600">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold">{t("chkSymptom")}</th>
                <th className="px-2 py-1.5 text-left font-semibold">{t("chkCause")}</th>
                <th className="px-2 py-1.5 text-left font-semibold">{t("chkSolution")}</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((n) => (
                <tr key={n} className="border-t border-neutral-100 align-top">
                  <td className="px-2 py-1 font-medium text-neutral-800">{t(`chkE${n}s`)}</td>
                  <td className="px-2 py-1 text-neutral-600">{t(`chkE${n}c`)}</td>
                  <td className="px-2 py-1 text-neutral-600">{t(`chkE${n}x`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
