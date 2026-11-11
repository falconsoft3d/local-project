"use client";

import { Fragment, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useLanguage, useT } from "@/lib/useT";
import { formatMoney, formatNumber } from "@/lib/format";
import { RESOURCE_KIND_COLORS } from "@/lib/constants";
import { resourceUnitPrice, taskUnitPrice } from "@/lib/schedule";
import {
  KIND_ORDER,
  assignmentPrice,
  budgetSummary,
  isPriceFromResources,
  recalcPricesFromResources,
  resourceUsage,
} from "@/lib/budget";
import type { ComputedTask, ID, Project, ResourceKind } from "@/lib/types";

const num =
  "w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-right tabular-nums outline-none hover:border-neutral-200 focus:border-green-500 focus:bg-white";
const txt =
  "w-full rounded border border-transparent bg-transparent px-1 py-0.5 outline-none hover:border-neutral-200 focus:border-green-500 focus:bg-white";

function KindBadge({ kind }: { kind: ResourceKind }) {
  const t = useT();
  return (
    <span
      className="inline-flex min-w-[34px] justify-center rounded px-1 py-0.5 text-[10px] font-bold text-white"
      style={{ backgroundColor: RESOURCE_KIND_COLORS[kind] }}
      title={t(`kindLong_${kind}`)}
    >
      {t(`kindShort_${kind}`)}
    </span>
  );
}

function numOrUndef(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, n) : undefined;
}

/** Budget mode: chapters → items → resource breakdown, with totals by resource type. */
export default function BudgetView({
  projectId,
  project,
  allComputed,
  selectedId,
  onSelect,
  collapsedIds,
  onToggleCollapse,
  onOpenResources,
  onOpenReports,
}: {
  projectId: ID;
  project: Project;
  allComputed: ComputedTask[];
  selectedId: ID | null;
  onSelect: (id: ID) => void;
  collapsedIds: Set<ID>;
  onToggleCollapse: (id: ID) => void;
  onOpenResources: (id: ID) => void;
  onOpenReports: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const updateTask = useStore((s) => s.updateTask);
  const updateResource = useStore((s) => s.updateResource);
  const addResource = useStore((s) => s.addResource);
  const changeProject = useStore((s) => s.changeProject);
  const [tab, setTab] = useState<"items" | "resources">("items");
  const [open, setOpen] = useState<Set<ID>>(new Set());
  const [kindFilter, setKindFilter] = useState<ResourceKind | "all">("all");
  const [newName, setNewName] = useState("");

  const summary = useMemo(() => budgetSummary(project), [project]);
  const usage = useMemo(() => resourceUsage(project), [project]);
  const resById = useMemo(() => new Map(project.resources.map((r) => [r.id, r])), [project.resources]);
  const parentById = useMemo(() => new Map(allComputed.map((c) => [c.id, c.parentId])), [allComputed]);
  const total = summary.total;
  const pct = (v: number) => (total > 0 ? `${formatNumber((v / total) * 100, lang, 1)} %` : "—");

  const rows = allComputed.filter((c) => {
    if (c.isMilestone) return false;
    let p = c.parentId;
    while (p) {
      if (collapsedIds.has(p)) return false;
      p = parentById.get(p) ?? null;
    }
    return true;
  });

  function patchItem(id: ID, patch: Parameters<typeof updateTask>[2], key: string, reschedule = false) {
    updateTask(projectId, id, patch, { reschedule, historyKey: `${id}:bud:${key}` });
  }

  function setAssignment(task: ComputedTask, rid: ID, patch: { quantity?: number; price?: number }) {
    const current = task.resourceAssignments ?? {};
    // Editing the breakdown prices the item from its resources again.
    patchItem(
      task.id,
      { resourceAssignments: { ...current, [rid]: { ...current[rid], ...patch } }, unitPrice: undefined },
      `assign:${rid}:${Object.keys(patch).join(",")}`,
    );
  }

  const leafIds = allComputed.filter((c) => !c.isSummary && !c.isMilestone).map((c) => c.id);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Summary by resource type */}
      <div className="grid grid-cols-2 gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-3 sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-6">
        {KIND_ORDER.map((k) => (
          <div key={k} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <KindBadge kind={k} /> {t(`kindLong_${k}`)}
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums text-neutral-900">{formatMoney(summary.byKind[k], lang)}</div>
            <div className="text-[11px] text-neutral-400">{pct(summary.byKind[k])}</div>
          </div>
        ))}
        <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
          <div className="text-[11px] text-neutral-500">{t("budUnbroken")}</div>
          <div className="mt-1 text-sm font-semibold tabular-nums text-neutral-900">{formatMoney(summary.unbroken, lang)}</div>
          <div className="text-[11px] text-neutral-400">{pct(summary.unbroken)}</div>
        </div>
        <div className="rounded-lg border border-green-600 bg-green-600 px-3 py-2 text-white">
          <div className="text-[11px] text-green-50">{t("budTotal")}</div>
          <div className="mt-1 text-base font-bold tabular-nums">{formatMoney(total, lang)}</div>
          <div className="text-[11px] text-green-50">{summary.itemCount} {t("budItems").toLowerCase()}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-2 print:hidden">
        <div className="flex rounded-md border border-neutral-200 p-0.5 text-xs">
          {(["items", "resources"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded px-2.5 py-1 font-medium ${tab === k ? "bg-green-600 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
            >
              {t(k === "items" ? "budItems" : "budResources")}
            </button>
          ))}
        </div>
        {tab === "items" ? (
          <>
            <button
              onClick={() => setOpen(open.size ? new Set() : new Set(leafIds))}
              className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
            >
              {open.size ? t("budCollapseBreakdowns") : t("budExpandBreakdowns")}
            </button>
            <button
              onClick={() => {
                if (confirm(t("budRecalcConfirm"))) changeProject(projectId, recalcPricesFromResources);
              }}
              className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Σ {t("budRecalc")}
            </button>
          </>
        ) : (
          <>
            <div className="flex rounded-md border border-neutral-200 p-0.5 text-xs">
              {(["all", ...KIND_ORDER] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKindFilter(k)}
                  className={`rounded px-2 py-1 font-medium ${kindFilter === k ? "bg-neutral-800 text-neutral-50" : "text-neutral-600 hover:bg-neutral-100"}`}
                >
                  {k === "all" ? t("budAll") : t(`kindShort_${k}`)}
                </button>
              ))}
            </div>
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                const id = addResource(projectId, newName.trim());
                if (kindFilter !== "all") updateResource(projectId, id, { kind: kindFilter });
                setNewName("");
              }}
            >
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("budNewResource")}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-green-500"
              />
              <button type="submit" className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700">
                + {t("add")}
              </button>
            </form>
          </>
        )}
        <span className="ml-auto hidden text-[11px] text-neutral-400 lg:inline">{t("budChapterHint")}</span>
        <button
          onClick={onOpenReports}
          className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
        >
          {t("repButton")} · PDF / Excel
        </button>
      </div>

      <div className="flex-1 overflow-auto print:overflow-visible">
        {tab === "items" ? (
          rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-400">{t("budNoItems")}</p>
          ) : (
            <table className="w-full min-w-[900px] text-left text-[12px]">
              <thead className="sticky top-0 z-10 bg-neutral-100 text-[11px] text-neutral-600">
                <tr>
                  <th className="w-[110px] px-2 py-2 font-semibold">{t("budCode")}</th>
                  <th className="w-[70px] px-2 py-2 font-semibold">{t("budType")}</th>
                  <th className="px-2 py-2 font-semibold">{t("budSummary")}</th>
                  <th className="w-[64px] px-2 py-2 font-semibold">{t("budUnit")}</th>
                  <th className="w-[100px] px-2 py-2 text-right font-semibold">{t("budQuantity")}</th>
                  <th className="w-[130px] px-2 py-2 text-right font-semibold">{t("budPrice")}</th>
                  <th className="w-[130px] px-2 py-2 text-right font-semibold">{t("budAmount")}</th>
                  <th className="w-[64px] px-2 py-2 text-right font-semibold">{t("budPercent")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const sel = c.id === selectedId;
                  if (c.isSummary) {
                    return (
                      <tr
                        key={c.id}
                        onClick={() => onSelect(c.id)}
                        className={`border-b border-neutral-200 ${sel ? "bg-green-50" : "bg-neutral-50"}`}
                      >
                        <td className="px-2 py-1.5 font-bold text-neutral-900" style={{ paddingLeft: 8 + c.depth * 14 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleCollapse(c.id);
                            }}
                            className="mr-1 text-neutral-500"
                          >
                            {collapsedIds.has(c.id) ? "▸" : "▾"}
                          </button>
                          {c.displayCode}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-50">{t("budChapter")}</span>
                        </td>
                        <td className="px-2 py-1.5 font-bold text-neutral-900" colSpan={4}>
                          <input
                            value={c.name}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => patchItem(c.id, { name: e.target.value }, "name")}
                            className={`${txt} font-bold`}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold tabular-nums text-neutral-900">{formatMoney(c.cost, lang)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500">{pct(c.cost)}</td>
                      </tr>
                    );
                  }
                  const fromRes = isPriceFromResources(c, project);
                  const resSum = resourceUnitPrice(c, project);
                  const overridden = !fromRes && resSum !== null && Math.abs(resSum - (c.unitPrice ?? 0)) > 0.005;
                  const isOpen = open.has(c.id);
                  const resources = c.resourceIds.map((id) => resById.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
                  return (
                    <Fragment key={c.id}>
                      <tr
                        onClick={() => onSelect(c.id)}
                        className={`border-b border-neutral-100 ${sel ? "bg-green-50" : "hover:bg-neutral-50"}`}
                      >
                        <td className="px-2 py-1 text-neutral-600" style={{ paddingLeft: 8 + c.depth * 14 }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpen((prev) => {
                                const next = new Set(prev);
                                if (next.has(c.id)) next.delete(c.id);
                                else next.add(c.id);
                                return next;
                              });
                            }}
                            className="mr-1 text-neutral-400 hover:text-neutral-700"
                            title={t("budExpandBreakdowns")}
                          >
                            {isOpen ? "▾" : "▸"}
                          </button>
                          {c.displayCode}
                        </td>
                        <td className="px-2 py-1">
                          <span className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{t("budItem")}</span>
                        </td>
                        <td className="px-1 py-1">
                          <input value={c.name} onClick={(e) => e.stopPropagation()} onChange={(e) => patchItem(c.id, { name: e.target.value }, "name")} className={txt} />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            value={c.unit ?? ""}
                            placeholder="ud"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => patchItem(c.id, { unit: e.target.value || undefined }, "unit")}
                            className={txt}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            step="any"
                            min={0}
                            value={c.quantity ?? ""}
                            placeholder="1"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => patchItem(c.id, { quantity: numOrUndef(e.target.value) }, "qty", true)}
                            className={num}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex items-center gap-1">
                            {fromRes ? (
                              <span className="shrink-0 text-[11px] font-bold text-green-600" title={t("budPriceFromResources")}>
                                Σ
                              </span>
                            ) : overridden ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  patchItem(c.id, { unitPrice: undefined }, "price");
                                }}
                                className="shrink-0 rounded bg-amber-100 px-1 text-[11px] font-bold text-amber-700"
                                title={t("budPriceOverride", { amount: formatMoney(resSum, lang) })}
                              >
                                Σ
                              </button>
                            ) : null}
                            <input
                              type="number"
                              step="any"
                              min={0}
                              value={Math.round(taskUnitPrice(c, project) * 100) / 100}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => patchItem(c.id, { unitPrice: numOrUndef(e.target.value) ?? 0 }, "price")}
                              className={`${num} ${fromRes ? "text-green-700" : ""}`}
                            />
                          </div>
                        </td>
                        <td className="px-2 py-1 text-right font-medium tabular-nums text-neutral-900">{formatMoney(c.cost, lang)}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-neutral-400">{pct(c.cost)}</td>
                      </tr>
                      {isOpen && (
                        <>
                          {resources.map((r) => {
                            const a = c.resourceAssignments?.[r.id] ?? {};
                            const price = assignmentPrice(c, r);
                            return (
                              <tr key={`${c.id}-${r.id}`} className="border-b border-neutral-100 bg-neutral-50/60 text-[11px]">
                                <td className="px-2 py-0.5 text-neutral-400" style={{ paddingLeft: 30 + c.depth * 14 }}>
                                  <input
                                    value={r.code ?? ""}
                                    placeholder="—"
                                    onChange={(e) => updateResource(projectId, r.id, { code: e.target.value || undefined })}
                                    className={txt}
                                  />
                                </td>
                                <td className="px-2 py-0.5">
                                  <select
                                    value={r.kind ?? "labor"}
                                    onChange={(e) => updateResource(projectId, r.id, { kind: e.target.value as ResourceKind })}
                                    className="rounded border border-neutral-200 bg-transparent px-0.5 py-0.5 text-[10px] font-bold outline-none"
                                    style={{ color: RESOURCE_KIND_COLORS[r.kind ?? "labor"] }}
                                  >
                                    {KIND_ORDER.map((k) => (
                                      <option key={k} value={k}>
                                        {t(`kindShort_${k}`)}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-1 py-0.5 text-neutral-700">
                                  <input value={r.name} onChange={(e) => updateResource(projectId, r.id, { name: e.target.value })} className={txt} />
                                </td>
                                <td className="px-1 py-0.5">
                                  <input
                                    value={r.unit ?? ""}
                                    placeholder="ud"
                                    onChange={(e) => updateResource(projectId, r.id, { unit: e.target.value || undefined })}
                                    className={txt}
                                  />
                                </td>
                                <td className="px-1 py-0.5" title={t("budYield")}>
                                  <input
                                    type="number"
                                    step="any"
                                    min={0}
                                    value={a.quantity ?? ""}
                                    placeholder="0"
                                    onChange={(e) => setAssignment(c, r.id, { quantity: numOrUndef(e.target.value) })}
                                    className={num}
                                  />
                                </td>
                                <td className="px-1 py-0.5">
                                  <input
                                    type="number"
                                    step="any"
                                    min={0}
                                    value={price}
                                    onChange={(e) => {
                                      const v = numOrUndef(e.target.value) ?? 0;
                                      // The cost belongs to the resource; a per-item override is edited in place.
                                      if (a.price !== undefined) setAssignment(c, r.id, { price: v });
                                      else {
                                        updateResource(projectId, r.id, { price: v });
                                        if (c.unitPrice !== undefined) patchItem(c.id, { unitPrice: undefined }, "price");
                                      }
                                    }}
                                    className={num}
                                  />
                                </td>
                                <td className="px-2 py-0.5 text-right tabular-nums text-neutral-600">{formatMoney((a.quantity ?? 0) * price, lang)}</td>
                                <td />
                              </tr>
                            );
                          })}
                          <tr className="border-b border-neutral-200 bg-neutral-50/60">
                            <td colSpan={8} className="py-1" style={{ paddingLeft: 30 + c.depth * 14 }}>
                              <button
                                onClick={() => onOpenResources(c.id)}
                                className="text-[11px] font-medium text-green-700 hover:underline"
                              >
                                + {t("budAddResource")}
                              </button>
                            </td>
                          </tr>
                        </>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-neutral-800">
                  <td colSpan={6} className="px-2 py-2 text-right text-[12px] font-bold text-neutral-900">
                    {t("budTotal")}
                  </td>
                  <td className="px-2 py-2 text-right text-[13px] font-bold tabular-nums text-neutral-900">{formatMoney(total, lang)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )
        ) : (
          <table className="w-full min-w-[820px] text-left text-[12px]">
            <thead className="sticky top-0 z-10 bg-neutral-100 text-[11px] text-neutral-600">
              <tr>
                <th className="w-[80px] px-2 py-2 font-semibold">{t("budType")}</th>
                <th className="w-[120px] px-2 py-2 font-semibold">{t("budCode")}</th>
                <th className="px-2 py-2 font-semibold">{t("budSummary")}</th>
                <th className="w-[64px] px-2 py-2 font-semibold">{t("budUnit")}</th>
                <th className="w-[120px] px-2 py-2 text-right font-semibold">{t("budPrice")}</th>
                <th className="w-[110px] px-2 py-2 text-right font-semibold">{t("budResourceTotalQty")}</th>
                <th className="w-[130px] px-2 py-2 text-right font-semibold">{t("budAmount")}</th>
                <th className="w-[70px] px-2 py-2 text-right font-semibold">{t("budUsedIn")}</th>
              </tr>
            </thead>
            <tbody>
              {project.resources
                .filter((r) => kindFilter === "all" || (r.kind ?? "labor") === kindFilter)
                .sort((a, b) => KIND_ORDER.indexOf(a.kind ?? "labor") - KIND_ORDER.indexOf(b.kind ?? "labor") || (a.code ?? a.name).localeCompare(b.code ?? b.name))
                .map((r) => {
                  const u = usage.get(r.id);
                  return (
                    <tr key={r.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                      <td className="px-2 py-1">
                        <select
                          value={r.kind ?? "labor"}
                          onChange={(e) => updateResource(projectId, r.id, { kind: e.target.value as ResourceKind })}
                          className="rounded border border-neutral-200 bg-transparent px-1 py-0.5 text-[11px] font-bold outline-none"
                          style={{ color: RESOURCE_KIND_COLORS[r.kind ?? "labor"] }}
                        >
                          {KIND_ORDER.map((k) => (
                            <option key={k} value={k}>
                              {t(`kindShort_${k}`)} · {t(`kindLong_${k}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-1">
                        <input value={r.code ?? ""} placeholder="—" onChange={(e) => updateResource(projectId, r.id, { code: e.target.value || undefined })} className={txt} />
                      </td>
                      <td className="px-1 py-1">
                        <input value={r.name} onChange={(e) => updateResource(projectId, r.id, { name: e.target.value })} className={txt} />
                      </td>
                      <td className="px-1 py-1">
                        <input value={r.unit ?? ""} placeholder="ud" onChange={(e) => updateResource(projectId, r.id, { unit: e.target.value || undefined })} className={txt} />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          step="any"
                          min={0}
                          value={r.price ?? ""}
                          placeholder="0"
                          onChange={(e) => updateResource(projectId, r.id, { price: numOrUndef(e.target.value) })}
                          className={num}
                        />
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-neutral-600">{u ? formatNumber(u.quantity, lang, 3) : "—"}</td>
                      <td className="px-2 py-1 text-right font-medium tabular-nums text-neutral-900">{u ? formatMoney(u.amount, lang) : "—"}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-neutral-500">{u?.items ?? 0}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </div>
      <p className="border-t border-neutral-200 px-4 py-1.5 text-[11px] text-neutral-500 print:hidden">{t("budIntro")}</p>
    </div>
  );
}
