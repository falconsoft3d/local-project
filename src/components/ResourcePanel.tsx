"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import type { ID, Project, Resource } from "@/lib/types";
import { useT } from "@/lib/useT";
import { SWATCH_PALETTE as PALETTE } from "@/lib/colors";
import Modal from "./Modal";

export default function ResourcePanel({
  projectId,
  project,
  onClose,
}: {
  projectId: ID;
  project: Project;
  onClose: () => void;
}) {
  const addResource = useStore((s) => s.addResource);
  const updateResource = useStore((s) => s.updateResource);
  const deleteResource = useStore((s) => s.deleteResource);
  const [newName, setNewName] = useState("");
  const t = useT();

  const usage = new Map<ID, number>();
  project.tasks.forEach((task) =>
    task.resourceIds.forEach((id) => usage.set(id, (usage.get(id) ?? 0) + 1)),
  );

  return (
    <Modal title={t("resourcesTitle")} onClose={onClose} width="max-w-lg">
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          addResource(projectId, newName);
          setNewName("");
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("newResourceName")}
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-green-500"
        />
        <button
          type="submit"
          className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          {t("add")}
        </button>
      </form>

      {project.resources.length === 0 && (
        <p className="py-6 text-center text-sm text-neutral-400">
          {t("noResourcesYet")}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {project.resources.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-2 rounded-md border border-neutral-200 p-2"
          >
            <div className="flex gap-1">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => updateResource(projectId, r.id, { color: c })}
                  style={{ backgroundColor: c }}
                  className={`h-4 w-4 rounded-full ${
                    r.color === c ? "ring-2 ring-offset-1 ring-neutral-400" : ""
                  }`}
                  aria-label={`Set color ${c}`}
                />
              ))}
            </div>
            <input
              value={r.name}
              onChange={(e) =>
                updateResource(projectId, r.id, { name: e.target.value })
              }
              className="flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm outline-none hover:border-neutral-200 focus:border-green-500"
            />
            <select
              value={r.kind ?? "labor"}
              onChange={(e) =>
                updateResource(projectId, r.id, {
                  kind: e.target.value as Resource["kind"],
                })
              }
              className="rounded border border-neutral-200 bg-transparent px-1 py-1 text-[11px] text-neutral-600 outline-none"
            >
              <option value="labor">{t("resourceKindLabor")}</option>
              <option value="material">{t("resourceKindMaterial")}</option>
              <option value="equipment">{t("resourceKindEquipment")}</option>
            </select>
            <span className="text-[11px] text-neutral-400">
              {usage.get(r.id) ?? 0}{" "}
              {(usage.get(r.id) ?? 0) === 1
                ? t("tasksSuffix")
                : t("tasksSuffixPlural")}
            </span>
            <button
              onClick={() => {
                if (
                  !usage.get(r.id) ||
                  confirm(t("removeResourceConfirm", { name: r.name }))
                ) {
                  deleteResource(projectId, r.id);
                }
              }}
              className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
            >
              {t("delete")}
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
