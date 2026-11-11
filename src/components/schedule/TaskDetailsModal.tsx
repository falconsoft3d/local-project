"use client";

import { useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import { useStore } from "@/lib/store";
import { useLanguage, useT } from "@/lib/useT";
import { cycleBlockedIds, linkTypeLabel } from "@/lib/links";
import { formatMoney } from "@/lib/format";
import { resourceUnitPrice, taskUnitPrice } from "@/lib/schedule";
import { SWATCH_PALETTE } from "@/lib/colors";
import type {
  ComputedTask,
  ConstraintType,
  ID,
  Interruption,
  LagUnit,
  Link,
  LinkType,
  Project,
  Task,
} from "@/lib/types";
import Modal from "../Modal";

const CONSTRAINTS: ConstraintType[] = ["ASAP", "ALAP", "SNET", "SNLT", "FNET", "FNLT", "MSO", "MFO"];
const LINK_TYPES: LinkType[] = ["FS", "SS", "FF", "SF"];
const LAG_UNITS: LagUnit[] = ["wd", "ed", "pct"];

const inputCls =
  "w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-green-500 disabled:bg-neutral-50 disabled:text-neutral-500";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-snug text-neutral-400">{hint}</span>}
    </label>
  );
}

function ReadOnly({ value, tone }: { value: React.ReactNode; tone?: "red" | "green" }) {
  return (
    <span
      className={`rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-sm ${
        tone === "red" ? "font-semibold text-red-600" : tone === "green" ? "text-green-700" : "text-neutral-700"
      }`}
    >
      {value}
    </span>
  );
}

/** "Ficha de partida": scheduling fields, predecessors and interruptions (chapter 05). */
export default function TaskDetailsModal({
  projectId,
  project,
  taskId,
  allComputed,
  onClose,
  onOpenResources,
}: {
  projectId: ID;
  project: Project;
  taskId: ID;
  allComputed: ComputedTask[];
  onClose: () => void;
  onOpenResources: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const updateTask = useStore((s) => s.updateTask);
  const [tab, setTab] = useState<"general" | "links" | "breaks">("general");
  const c = allComputed.find((x) => x.id === taskId);
  const auto = project.schedule?.autoSchedule ?? false;
  const blocked = useMemo(() => cycleBlockedIds(project.tasks, taskId), [project.tasks, taskId]);

  if (!c) return null;
  const leaf = !c.isSummary;

  function update(patch: Partial<Task>, key?: string) {
    updateTask(projectId, taskId, patch, { reschedule: auto, historyKey: key ? `${taskId}:${key}` : undefined });
  }

  function setStart(iso: string) {
    if (!c || !iso) return;
    const patch: Partial<Task> = { start: iso };
    const k = c.constraint ?? "ASAP";
    if (k === "ASAP" || k === "SNET") {
      patch.constraint = "SNET";
      patch.constraintDate = iso;
    }
    update(patch, "start");
  }

  function setLinks(links: Link[]) {
    update({ predecessors: links }, "links");
  }

  function setBreaks(list: Interruption[]) {
    update({ interruptions: list }, "breaks");
  }

  const needsDate = c.constraint && c.constraint !== "ASAP" && c.constraint !== "ALAP";
  const unitPrice = taskUnitPrice(c, project);
  const fromResources = resourceUnitPrice(c, project);
  const derivedPrice = c.unitPrice === undefined && fromResources !== null;
  const candidates = allComputed.filter((o) => o.id !== taskId);

  return (
    <Modal title={`${c.displayCode} · ${c.name || t("untitled")}`} onClose={onClose} width="max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {c.critical && (
          <span className="rounded bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">{t("critical")}</span>
        )}
        {c.isFinished && (
          <span className="rounded bg-neutral-200 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">{t("finished")}</span>
        )}
        {c.finishVariance !== undefined && c.finishVariance !== 0 && (
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
              c.finishVariance > 0 ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
            }`}
          >
            {t("finishVarianceBadge", { n: c.finishVariance > 0 ? `+${c.finishVariance}` : c.finishVariance })}
          </span>
        )}
        {!auto && <span className="text-[11px] text-neutral-400">{t("autoOffNote")}</span>}
        <div className="ml-auto flex rounded-md border border-neutral-200 p-0.5 text-xs">
          {(["general", "links", "breaks"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded px-2.5 py-1 font-medium ${tab === k ? "bg-green-600 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
            >
              {t(`tab_${k}`)}
              {k === "links" && c.predecessors.length ? ` (${c.predecessors.length})` : ""}
              {k === "breaks" && c.interruptions?.length ? ` (${c.interruptions.length})` : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[68vh] overflow-auto pr-1">
        {tab === "general" && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Field label={t("colCode")}>
                <input value={c.code ?? ""} placeholder={c.wbs} onChange={(e) => update({ code: e.target.value || undefined }, "code")} className={inputCls} />
              </Field>
              <div className="sm:col-span-3">
                <Field label={t("name")}>
                  <input value={c.name} onChange={(e) => update({ name: e.target.value }, "name")} className={inputCls} />
                </Field>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label={t("colStart")}>
                {leaf && !c.actualStart ? (
                  <input type="date" value={c.computedStart} onChange={(e) => setStart(e.target.value)} className={inputCls} />
                ) : (
                  <ReadOnly value={c.computedStart} />
                )}
              </Field>
              <Field label={t("colFinish")}>
                <ReadOnly value={c.computedEnd} />
              </Field>
              <Field label={t("durationDays")} hint={c.durationLocked ? t("durationLockedHint") : undefined}>
                {leaf && !c.durationLocked ? (
                  <input
                    type="number"
                    min={0}
                    value={c.duration}
                    onChange={(e) => update({ duration: Math.max(0, Math.round(Number(e.target.value) || 0)) }, "duration")}
                    className={inputCls}
                  />
                ) : (
                  <ReadOnly value={`${c.computedDuration} ${c.elapsed ? "dt" : "d"}`} />
                )}
              </Field>
              <Field label={t("elapsedDuration")}>
                <label className="flex items-center gap-2 py-1.5 text-sm">
                  <input type="checkbox" disabled={!leaf} checked={!!c.elapsed} onChange={(e) => update({ elapsed: e.target.checked || undefined })} />
                  {t("elapsedDurationHint")}
                </label>
              </Field>
            </div>

            {leaf && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label={t("constraint")}>
                  <select
                    value={c.constraint ?? "ASAP"}
                    onChange={(e) => {
                      const k = e.target.value as ConstraintType;
                      update({
                        constraint: k === "ASAP" ? undefined : k,
                        constraintDate: k === "ASAP" || k === "ALAP" ? undefined : c.constraintDate ?? c.computedStart,
                      });
                    }}
                    className={inputCls}
                  >
                    {CONSTRAINTS.map((k) => (
                      <option key={k} value={k}>
                        {t(`constraint_${k}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("constraintDate")}>
                  <input
                    type="date"
                    disabled={!needsDate}
                    value={needsDate ? c.constraintDate ?? "" : ""}
                    onChange={(e) => update({ constraintDate: e.target.value || undefined }, "cdate")}
                    className={inputCls}
                  />
                </Field>
                <Field label={t("deadline")} hint={t("deadlineHint")}>
                  <input type="date" value={c.deadline ?? ""} onChange={(e) => update({ deadline: e.target.value || undefined }, "deadline")} className={inputCls} />
                </Field>
                <Field label={t("ganttColor")}>
                  <div className="flex flex-wrap items-center gap-1 py-1">
                    {SWATCH_PALETTE.map((col) => (
                      <button
                        key={col}
                        onClick={() => update({ color: col })}
                        style={{ backgroundColor: col }}
                        className={`h-4 w-4 rounded-full ${c.color === col ? "ring-2 ring-neutral-400 ring-offset-1" : ""}`}
                        aria-label={col}
                      />
                    ))}
                    <button onClick={() => update({ color: undefined })} className="ml-1 text-[11px] text-neutral-500 underline">
                      {t("defaultColor")}
                    </button>
                  </div>
                </Field>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label={t("totalFloat")}>
                <ReadOnly value={c.totalFloat !== undefined ? `${c.totalFloat} d` : "—"} tone={(c.totalFloat ?? 0) < 0 ? "red" : undefined} />
              </Field>
              <Field label={t("freeFloat")}>
                <ReadOnly value={c.freeFloat !== undefined ? `${c.freeFloat} d` : "—"} />
              </Field>
              <Field label={t("earlyDates")}>
                <ReadOnly value={c.earlyStart ? `${c.earlyStart} → ${c.earlyFinish}` : "—"} />
              </Field>
              <Field label={t("lateDates")}>
                <ReadOnly value={c.lateStart ? `${c.lateStart} → ${c.lateFinish}` : "—"} />
              </Field>
            </div>

            {leaf && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label={t("physicalProgress")} hint={t("physicalProgressHint")}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={c.progress}
                    onChange={(e) => update({ progress: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }, "progress")}
                    className={inputCls}
                  />
                </Field>
                <Field label={t("colCertified")}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={c.certified ?? 0}
                    onChange={(e) => update({ certified: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }, "certified")}
                    className={inputCls}
                  />
                </Field>
                <Field label={t("actualStart")}>
                  <input type="date" value={c.actualStart ?? ""} onChange={(e) => update({ actualStart: e.target.value || undefined }, "astart")} className={inputCls} />
                </Field>
                <Field label={t("actualFinish")} hint={t("actualFinishHint")}>
                  <input type="date" value={c.actualFinish ?? ""} onChange={(e) => update({ actualFinish: e.target.value || undefined }, "afinish")} className={inputCls} />
                </Field>
                <Field label={t("remainingDuration")}>
                  <ReadOnly value={`${c.remainingDuration} d`} />
                </Field>
                <Field label={t("baselineStart")}>
                  <ReadOnly value={c.baselineStart ?? "—"} />
                </Field>
                <Field label={t("baselineFinish")}>
                  <ReadOnly value={c.baselineFinish ?? "—"} />
                </Field>
                <Field label={t("finishVariance")} hint={t("finishVarianceHint")}>
                  <ReadOnly
                    value={c.finishVariance !== undefined ? `${c.finishVariance > 0 ? "+" : ""}${c.finishVariance} d` : "—"}
                    tone={(c.finishVariance ?? 0) > 0 ? "red" : (c.finishVariance ?? 0) < 0 ? "green" : undefined}
                  />
                </Field>
              </div>
            )}

            {leaf && (
              <div>
                <h4 className="mb-2 text-xs font-semibold text-neutral-700">{t("budgetAndPerformance")}</h4>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label={t("quantity")}>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={c.quantity ?? ""}
                      onChange={(e) => update({ quantity: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) }, "qty")}
                      className={inputCls}
                    />
                  </Field>
                  <Field label={t("unit")}>
                    <input value={c.unit ?? ""} onChange={(e) => update({ unit: e.target.value || undefined }, "unit")} className={inputCls} placeholder="m², ud, h…" />
                  </Field>
                  <Field
                    label={t("unitPrice")}
                    hint={
                      derivedPrice
                        ? t("unitPriceFromResources")
                        : fromResources !== null
                          ? t("unitPriceResourcesDiffer", { amount: formatMoney(fromResources, lang) })
                          : undefined
                    }
                  >
                    {derivedPrice ? (
                      <div className="flex items-center gap-2">
                        <ReadOnly value={formatMoney(unitPrice, lang)} />
                        <button
                          onClick={() => update({ unitPrice: unitPrice })}
                          className="text-[11px] text-neutral-500 underline"
                        >
                          {t("edit")}
                        </button>
                      </div>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={c.unitPrice ?? ""}
                        onChange={(e) => update({ unitPrice: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) }, "price")}
                        className={inputCls}
                      />
                    )}
                  </Field>
                  <Field label={t("amount")}>
                    <ReadOnly value={formatMoney(c.cost, lang)} />
                  </Field>
                  <Field label={t("performance")} hint={t("performanceHint")}>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={c.performance ?? ""}
                      onChange={(e) => update({ performance: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) }, "perf")}
                      className={inputCls}
                    />
                  </Field>
                  <Field label={t("performanceType")}>
                    <select
                      value={c.performanceUnit ?? "day"}
                      onChange={(e) => update({ performanceUnit: e.target.value as "day" | "hour" })}
                      className={inputCls}
                    >
                      <option value="day">{t("perDay")}</option>
                      <option value="hour">{t("perHour")}</option>
                    </select>
                  </Field>
                  <Field label={t("hoursPerDayTask")}>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={c.hoursPerDay ?? ""}
                      placeholder={String(project.schedule?.calendar.hoursPerDay ?? 8)}
                      onChange={(e) => update({ hoursPerDay: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) }, "hpd")}
                      className={inputCls}
                    />
                  </Field>
                  <Field label={t("colResources")}>
                    <button
                      onClick={onOpenResources}
                      className="rounded-md border border-neutral-300 px-2 py-1.5 text-left text-sm hover:bg-neutral-50"
                    >
                      {c.resourceIds.length} · {t("manage")} →
                    </button>
                  </Field>
                </div>
                {project.schedule?.durationType !== "performance" && c.performance ? (
                  <p className="mt-2 text-[11px] text-neutral-400">{t("performanceOnlyInPerformanceMode")}</p>
                ) : null}
              </div>
            )}

            <Field label={t("notes")}>
              <textarea
                value={c.notes ?? ""}
                rows={2}
                onChange={(e) => update({ notes: e.target.value || undefined }, "notes")}
                className={inputCls}
              />
            </Field>
          </div>
        )}

        {tab === "links" && (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] text-neutral-500">{t("linksIntro")}</p>
            <table className="w-full text-left text-[12px]">
              <thead className="border-b border-neutral-200 text-[11px] text-neutral-500">
                <tr>
                  <th className="py-1 pr-2 font-medium">{t("predecessor")}</th>
                  <th className="py-1 pr-2 font-medium">{t("linkType")}</th>
                  <th className="py-1 pr-2 font-medium">{t("lagDays")}</th>
                  <th className="py-1 pr-2 font-medium">{t("lagUnit")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {c.predecessors.map((l, idx) => (
                  <tr key={`${l.predecessorId}-${idx}`} className="border-b border-neutral-100">
                    <td className="py-1 pr-2">
                      <select
                        value={l.predecessorId}
                        onChange={(e) => {
                          const next = [...c.predecessors];
                          next[idx] = { ...l, predecessorId: e.target.value };
                          setLinks(next);
                        }}
                        className="w-full rounded border border-neutral-200 px-1 py-1 outline-none focus:border-green-500"
                      >
                        {candidates.map((o) => (
                          <option
                            key={o.id}
                            value={o.id}
                            disabled={o.id !== l.predecessorId && (blocked.has(o.id) || c.predecessors.some((x) => x.predecessorId === o.id))}
                          >
                            {" ".repeat(o.depth * 2)}
                            {o.displayCode} {o.name}
                            {o.isSummary ? ` (${t("chapter")})` : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        value={l.type}
                        onChange={(e) => {
                          const next = [...c.predecessors];
                          next[idx] = { ...l, type: e.target.value as LinkType };
                          setLinks(next);
                        }}
                        className="rounded border border-neutral-200 px-1 py-1 outline-none focus:border-green-500"
                      >
                        {LINK_TYPES.map((k) => (
                          <option key={k} value={k}>
                            {linkTypeLabel(k, lang)} · {t(`linkType_${k}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="number"
                        step="any"
                        value={l.lag}
                        onChange={(e) => {
                          const next = [...c.predecessors];
                          next[idx] = { ...l, lag: Number(e.target.value) || 0 };
                          setLinks(next);
                        }}
                        className="w-20 rounded border border-neutral-200 px-1 py-1 outline-none focus:border-green-500"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        value={l.lagUnit}
                        onChange={(e) => {
                          const next = [...c.predecessors];
                          next[idx] = { ...l, lagUnit: e.target.value as LagUnit };
                          setLinks(next);
                        }}
                        className="rounded border border-neutral-200 px-1 py-1 outline-none focus:border-green-500"
                      >
                        {LAG_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {t(`lagUnit_${u}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 text-right">
                      <button
                        onClick={() => setLinks(c.predecessors.filter((_, i) => i !== idx))}
                        className="rounded px-1.5 text-red-500 hover:bg-red-50"
                        aria-label={t("delete")}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <button
                onClick={() => {
                  const first = candidates.find(
                    (o) => !blocked.has(o.id) && !c.predecessors.some((x) => x.predecessorId === o.id),
                  );
                  if (!first) return;
                  setLinks([...c.predecessors, { predecessorId: first.id, type: "FS", lag: 0, lagUnit: "wd" }]);
                }}
                className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
              >
                + {t("addLink")}
              </button>
            </div>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800">{t("noCircularLinks")}</p>
            <div className="text-[11px] text-neutral-500">
              <p className="font-semibold">{t("successors")}</p>
              <p>
                {allComputed
                  .filter((o) => o.predecessors.some((l) => l.predecessorId === taskId))
                  .map((o) => `${o.displayCode} ${o.name}`)
                  .join(" · ") || "—"}
              </p>
            </div>
          </div>
        )}

        {tab === "breaks" && (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] text-neutral-500">{t("interruptionsIntro")}</p>
            {!leaf ? (
              <p className="text-xs text-neutral-400">{t("interruptionsLeafOnly")}</p>
            ) : (
              <>
                <table className="w-full text-left text-[12px]">
                  <thead className="border-b border-neutral-200 text-[11px] text-neutral-500">
                    <tr>
                      <th className="py-1 pr-2 font-medium">{t("from")}</th>
                      <th className="py-1 pr-2 font-medium">{t("to")}</th>
                      <th className="py-1 pr-2 font-medium">{t("reason")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(c.interruptions ?? []).map((it) => (
                      <tr key={it.id} className="border-b border-neutral-100">
                        <td className="py-1 pr-2">
                          <input
                            type="date"
                            value={it.from}
                            onChange={(e) =>
                              e.target.value &&
                              setBreaks((c.interruptions ?? []).map((x) => (x.id === it.id ? { ...x, from: e.target.value } : x)))
                            }
                            className="rounded border border-neutral-200 px-1 py-0.5 outline-none focus:border-green-500"
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            type="date"
                            value={it.to ?? ""}
                            min={it.from}
                            onChange={(e) =>
                              setBreaks((c.interruptions ?? []).map((x) => (x.id === it.id ? { ...x, to: e.target.value || undefined } : x)))
                            }
                            className="rounded border border-neutral-200 px-1 py-0.5 outline-none focus:border-green-500"
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            value={it.reason ?? ""}
                            placeholder={t("reasonPlaceholder")}
                            onChange={(e) =>
                              setBreaks((c.interruptions ?? []).map((x) => (x.id === it.id ? { ...x, reason: e.target.value } : x)))
                            }
                            className="w-full rounded border border-neutral-200 px-1 py-0.5 outline-none focus:border-green-500"
                          />
                        </td>
                        <td className="py-1 text-right">
                          <button
                            onClick={() => setBreaks((c.interruptions ?? []).filter((x) => x.id !== it.id))}
                            className="rounded px-1.5 text-red-500 hover:bg-red-50"
                            aria-label={t("delete")}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div>
                  <button
                    onClick={() =>
                      setBreaks([...(c.interruptions ?? []), { id: uuid(), from: c.computedStart, reason: "" }])
                    }
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                  >
                    + {t("addInterruption")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
