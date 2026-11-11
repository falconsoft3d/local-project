"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useLanguage, useT } from "@/lib/useT";
import { formatMoney } from "@/lib/format";
import { taskCost, taskUnitPrice } from "@/lib/schedule";
import { RESOURCE_KIND_COLORS } from "@/lib/constants";
import type { AssignmentInfo, ID, Project, ResourceKind } from "@/lib/types";
import Modal from "../Modal";

/** "Recursos de la partida": change type, quantity and price, remove a resource or add one
 * by name or code. Changes apply immediately and recompute the task amount. */
export default function TaskResourcesModal({
  projectId,
  project,
  taskId,
  onClose,
}: {
  projectId: ID;
  project: Project;
  taskId: ID;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const updateTask = useStore((s) => s.updateTask);
  const updateResource = useStore((s) => s.updateResource);
  const addResource = useStore((s) => s.addResource);
  const [query, setQuery] = useState("");
  const task = project.tasks.find((x) => x.id === taskId);
  if (!task) return null;

  const assigned = task.resourceIds
    .map((id) => project.resources.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r);

  function setAssignment(rid: ID, patch: Partial<AssignmentInfo>) {
    const current = task!.resourceAssignments ?? {};
    updateTask(
      projectId,
      taskId,
      // Editing resources recalculates the amount from them.
      { resourceAssignments: { ...current, [rid]: { ...current[rid], ...patch } }, unitPrice: undefined },
      { reschedule: false, historyKey: `${taskId}:assign:${rid}:${Object.keys(patch).join(",")}` },
    );
  }

  function assign(rid: ID) {
    if (task!.resourceIds.includes(rid)) return;
    updateTask(projectId, taskId, { resourceIds: [...task!.resourceIds, rid], unitPrice: undefined }, { reschedule: false });
    setQuery("");
  }

  function unassign(rid: ID) {
    const rest = { ...(task!.resourceAssignments ?? {}) };
    delete rest[rid];
    updateTask(
      projectId,
      taskId,
      { resourceIds: task!.resourceIds.filter((x) => x !== rid), resourceAssignments: rest, unitPrice: undefined },
      { reschedule: false },
    );
  }

  const q = query.trim().toLowerCase();
  const matches = q
    ? project.resources.filter(
        (r) =>
          !task.resourceIds.includes(r.id) &&
          (r.name.toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q)),
      )
    : [];

  return (
    <Modal title={t("taskResourcesTitleFor", { name: `${task.code ?? ""} ${task.name}`.trim() })} onClose={onClose} width="max-w-4xl">
      <div className="flex max-h-[75vh] flex-col gap-4 overflow-auto text-[12px]">
        {assigned.length === 0 ? (
          <p className="py-4 text-center text-neutral-400">{t("noResourcesOnTask")}</p>
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-neutral-200 text-[11px] text-neutral-500">
              <tr>
                <th className="py-1.5 pr-2 font-medium">{t("resourceType")}</th>
                <th className="py-1.5 pr-2 font-medium">{t("colCode")}</th>
                <th className="py-1.5 pr-2 font-medium">{t("resourceName")}</th>
                <th className="py-1.5 pr-2 font-medium">{t("unit")}</th>
                <th className="py-1.5 pr-2 text-right font-medium" title={t("quantityPerUnitHint")}>
                  {t("quantityPerUnit")}
                </th>
                <th className="py-1.5 pr-2 text-right font-medium">{t("price")}</th>
                <th className="py-1.5 pr-2 text-right font-medium">{t("amountPerUnit")}</th>
                <th className="py-1.5 pr-2 text-right font-medium" title={t("crewHint")}>
                  {t("crew")}
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assigned.map((r) => {
                const a = task.resourceAssignments?.[r.id] ?? {};
                const price = a.price ?? r.price ?? 0;
                return (
                  <tr key={r.id} className="border-b border-neutral-100">
                    <td className="py-1 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RESOURCE_KIND_COLORS[r.kind ?? "labor"] }} />
                        <select
                          value={r.kind ?? "labor"}
                          onChange={(e) => updateResource(projectId, r.id, { kind: e.target.value as ResourceKind })}
                          className="rounded border border-neutral-200 px-1 py-0.5 outline-none focus:border-green-500"
                        >
                          <option value="labor">{t("resourceKindLabor")}</option>
                          <option value="material">{t("resourceKindMaterial")}</option>
                          <option value="equipment">{t("resourceKindEquipment")}</option>
                          <option value="subcontract">{t("resourceKindSubcontract")}</option>
                        </select>
                      </div>
                    </td>
                    <td className="py-1 pr-2 text-neutral-500">{r.code ?? ""}</td>
                    <td className="py-1 pr-2">{r.name}</td>
                    <td className="py-1 pr-2">
                      <input
                        value={r.unit ?? ""}
                        onChange={(e) => updateResource(projectId, r.id, { unit: e.target.value || undefined })}
                        className="w-12 rounded border border-neutral-200 px-1 py-0.5 outline-none focus:border-green-500"
                      />
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={a.quantity ?? ""}
                        onChange={(e) =>
                          setAssignment(r.id, { quantity: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })
                        }
                        className="w-20 rounded border border-neutral-200 px-1 py-0.5 text-right outline-none focus:border-green-500"
                      />
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={a.price ?? r.price ?? ""}
                        onChange={(e) =>
                          setAssignment(r.id, { price: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })
                        }
                        className="w-20 rounded border border-neutral-200 px-1 py-0.5 text-right outline-none focus:border-green-500"
                      />
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">{formatMoney((a.quantity ?? 0) * price, lang)}</td>
                    <td className="py-1 pr-2 text-right">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={a.units ?? 1}
                        onChange={(e) => setAssignment(r.id, { units: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-14 rounded border border-neutral-200 px-1 py-0.5 text-right outline-none focus:border-green-500"
                      />
                    </td>
                    <td className="py-1 text-right">
                      <button onClick={() => unassign(r.id)} className="rounded px-1.5 text-red-500 hover:bg-red-50" aria-label={t("delete")}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchResource")}
              className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-green-500"
            />
            <button
              disabled={!query.trim()}
              onClick={() => {
                const id = addResource(projectId, query.trim());
                assign(id);
              }}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40"
            >
              + {t("createResource")}
            </button>
          </div>
          {matches.length > 0 && (
            <div className="flex max-h-40 flex-col overflow-auto rounded-md border border-neutral-200">
              {matches.slice(0, 30).map((r) => (
                <button
                  key={r.id}
                  onClick={() => assign(r.id)}
                  className="flex items-center gap-2 px-2 py-1 text-left hover:bg-green-50"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RESOURCE_KIND_COLORS[r.kind ?? "labor"] }} />
                  <span className="w-20 shrink-0 text-neutral-400">{r.code ?? ""}</span>
                  <span className="truncate">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-6 border-t border-neutral-200 pt-3 text-[12px]">
          <span>
            {t("quantity")}: <strong>{task.quantity ?? 1}</strong> {task.unit ?? ""}
          </span>
          <span>
            {t("unitPrice")}: <strong>{formatMoney(taskUnitPrice(task, project), lang)}</strong>
          </span>
          <span>
            {t("amount")}: <strong>{formatMoney(taskCost(task, project), lang)}</strong>
          </span>
        </div>
      </div>
    </Modal>
  );
}
