"use client";

import { useRef, useState } from "react";
import Modal from "../Modal";
import { useStore } from "@/lib/store";
import { useLanguage, useT } from "@/lib/useT";
import { scheduleProject } from "@/lib/cpm";
import { downloadBlob, safeFileName } from "@/lib/format";
import { mergeMsProjectXml } from "@/lib/msproject";
import {
  exportScheduleCsv,
  exportScheduleXlsx,
  importScheduleTable,
  parseCsv,
} from "@/lib/exchange";
import { readXlsx, XLSX_MIME, type CellValue } from "@/lib/xlsx";
import type { ID, Project } from "@/lib/types";

type Format = "msp" | "xlsx" | "csv";

interface ResultSummary {
  updated: number;
  created: number;
  notFound: number;
  invalidLinks?: string[];
}

const ACCEPT: Record<Format, string> = {
  msp: ".xml,application/xml,text/xml",
  xlsx: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: ".csv,text/csv,text/plain",
};

/** CSV from Spanish Excel is often Windows-1252; fall back when the bytes aren't UTF-8. */
function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function Option({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex gap-2 text-sm ${disabled ? "opacity-40" : ""}`}>
      <input
        type="checkbox"
        className="mt-0.5 accent-green-600"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium text-neutral-800">{label}</span>
        <span className="block text-xs text-neutral-500">{hint}</span>
      </span>
    </label>
  );
}

export default function ExchangeModal({
  projectId,
  project,
  initialMode = "export",
  onClose,
}: {
  projectId: ID;
  project: Project;
  initialMode?: "import" | "export";
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const [mode, setMode] = useState<"import" | "export">(initialMode);
  const [format, setFormat] = useState<Format>("msp");
  const [file, setFile] = useState<File | null>(null);
  const [importCalendar, setImportCalendar] = useState(false);
  const [importBaseline, setImportBaseline] = useState(false);
  const [createMissing, setCreateMissing] = useState(false);
  const [progressToCertified, setProgressToCertified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ResultSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const base = safeFileName(project.name);

  function doExport() {
    setError(null);
    try {
      if (format === "msp") {
        const xml = useStore.getState().exportMsProjectXml(projectId);
        if (!xml) throw new Error("export failed");
        downloadBlob(new Blob([xml], { type: "application/xml" }), `${base}.xml`);
      } else if (format === "xlsx") {
        const bytes = exportScheduleXlsx(project, lang);
        downloadBlob(new Blob([bytes as BlobPart], { type: XLSX_MIME }), `${base}.xlsx`);
      } else {
        const csv = exportScheduleCsv(project, lang);
        downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${base}.csv`);
      }
    } catch (err) {
      console.error(err);
      setError(t("exExportFailed"));
    }
  }

  async function doImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const buffer = await file.arrayBuffer();
      let grid: CellValue[][] | null = null;
      let xml: string | null = null;
      if (format === "msp") xml = new TextDecoder("utf-8").decode(buffer);
      else if (format === "xlsx") grid = await readXlsx(buffer);
      else grid = parseCsv(decodeText(buffer));

      let result: ResultSummary | null = null;
      let failure: unknown = null;
      useStore.getState().changeProject(projectId, (p) => {
        try {
          const merged =
            xml !== null
              ? mergeMsProjectXml(p, xml, { importCalendar, importBaseline, createMissing, progressToCertified })
              : importScheduleTable(p, grid!, { createMissing });
          result = merged.summary;
          return p.schedule?.autoSchedule ? scheduleProject(merged.project) : merged.project;
        } catch (err) {
          failure = err;
          return p;
        }
      });
      if (failure || !result) throw failure ?? new Error("import failed");
      setSummary(result);
    } catch (err) {
      console.error(err);
      setError(t("exImportFailed"));
    } finally {
      setBusy(false);
    }
  }

  const formats: { key: Format; label: string; hint: string }[] = [
    { key: "msp", label: t("exFormatMsp"), hint: t("exFormatMspHint") },
    { key: "xlsx", label: t("exFormatXlsx"), hint: t("exFormatXlsxHint") },
    { key: "csv", label: t("exFormatCsv"), hint: t("exFormatCsvHint") },
  ];

  return (
    <Modal title={t("exTitle")} onClose={onClose} width="max-w-lg">
      <div className="mb-4 flex gap-1 rounded-md border border-neutral-200 p-0.5">
        {(["export", "import"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError(null);
              setSummary(null);
            }}
            className={`flex-1 rounded px-3 py-1.5 text-xs font-medium ${
              mode === m ? "bg-green-600 text-white" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {m === "export" ? t("exTabExport") : t("exTabImport")}
          </button>
        ))}
      </div>

      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">{t("exFormat")}</p>
      <div className="mb-4 flex flex-col gap-1.5">
        {formats.map((f) => (
          <label
            key={f.key}
            className={`flex cursor-pointer gap-2 rounded-md border p-2.5 ${
              format === f.key ? "border-green-500 bg-green-50" : "border-neutral-200 hover:bg-neutral-50"
            }`}
          >
            <input
              type="radio"
              name="exchange-format"
              className="mt-0.5 accent-green-600"
              checked={format === f.key}
              onChange={() => {
                setFormat(f.key);
                setFile(null);
                setSummary(null);
                setError(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <span>
              <span className="text-sm font-medium text-neutral-800">{f.label}</span>
              <span className="block text-xs text-neutral-500">{f.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {mode === "export" ? (
        <div className="flex justify-end">
          <button
            onClick={doExport}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            {t("exDownload")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">{t("exFile")}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
              >
                {t("exChooseFile")}
              </button>
              <span className="truncate text-xs text-neutral-500">{file?.name ?? t("exNoFile")}</span>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT[format]}
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setSummary(null);
                  setError(null);
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Option
              checked={importCalendar}
              onChange={setImportCalendar}
              label={t("exImportCalendar")}
              hint={t("exImportCalendarHint")}
              disabled={format !== "msp"}
            />
            <Option
              checked={importBaseline}
              onChange={setImportBaseline}
              label={t("exImportBaseline")}
              hint={t("exImportBaselineHint")}
              disabled={format !== "msp"}
            />
            <Option
              checked={createMissing}
              onChange={setCreateMissing}
              label={t("exCreateMissing")}
              hint={t("exCreateMissingHint")}
            />
            <Option
              checked={progressToCertified}
              onChange={setProgressToCertified}
              label={t("exProgressToCert")}
              hint={t("exProgressToCertHint")}
              disabled={format !== "msp"}
            />
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            <p className="mb-1 font-semibold">⚠ {t("exWarning")}</p>
            <p>{project.schedule?.autoSchedule ? t("exAutoNote") : t("exManualNote")}</p>
          </div>

          {summary && (
            <div className="rounded-md border border-green-200 bg-green-50 p-2.5 text-xs text-green-800">
              <p className="font-medium">
                {t("exSummary", {
                  updated: summary.updated,
                  created: summary.created,
                  notFound: summary.notFound,
                })}
              </p>
              {!!summary.invalidLinks?.length && (
                <p className="mt-1 text-amber-700">
                  {t("exInvalidLinks", { list: summary.invalidLinks.slice(0, 12).join(", ") })}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            {summary && (
              <button
                onClick={onClose}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                {t("exClose")}
              </button>
            )}
            <button
              onClick={doImport}
              disabled={!file || busy}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? t("exImporting") : t("exImportButton")}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </Modal>
  );
}
