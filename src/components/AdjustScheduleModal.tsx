"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/useT";
import type { ID } from "@/lib/types";
import Modal from "./Modal";

export default function AdjustScheduleModal({
  projectId,
  onClose,
}: {
  projectId: ID;
  onClose: () => void;
}) {
  const adjustSchedule = useStore((s) => s.adjustSchedule);
  const t = useT();
  const [days, setDays] = useState(8);
  const effectiveDays = Math.max(1, Math.round(days) || 8);

  function apply(mode: "fixed" | "labor") {
    adjustSchedule(projectId, mode, effectiveDays);
    onClose();
  }

  return (
    <Modal title={t("adjustModalTitle")} onClose={onClose} width="max-w-md">
      <p className="mb-4 text-xs text-neutral-500">{t("adjustModalIntro")}</p>

      <label className="mb-4 flex items-center gap-2 text-sm text-neutral-700">
        {t("adjustDaysLabel")}
        <input
          type="number"
          min={1}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-green-500"
        />
      </label>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => apply("fixed")}
          className="rounded-md border border-neutral-200 p-3 text-left hover:border-green-500 hover:bg-green-50"
        >
          <div className="text-sm font-medium text-neutral-800">
            {t("adjustFixedTitle")}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {t("adjustFixedDesc", { days: effectiveDays })}
          </div>
        </button>
        <button
          onClick={() => apply("labor")}
          className="rounded-md border border-neutral-200 p-3 text-left hover:border-green-500 hover:bg-green-50"
        >
          <div className="text-sm font-medium text-neutral-800">
            {t("adjustLaborTitle")}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {t("adjustLaborDesc", { days: effectiveDays })}
          </div>
        </button>
      </div>
    </Modal>
  );
}
