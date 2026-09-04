"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "@/lib/store";
import { useSettingsStore } from "@/lib/settings-store";
import { getComputedTasks, projectDateRange } from "@/lib/schedule";
import { useT, useLanguage } from "@/lib/useT";
import { plural } from "@/lib/i18n";
import { isFileSystemAccessSupported, serializeProjectFile } from "@/lib/projectFile";
import { decodeImportBuffer } from "@/lib/importFormats";
import Modal from "./Modal";
import LanguageSwitcher from "./LanguageSwitcher";
import {
  PencilIcon,
  CopyIcon,
  DownloadIcon,
  FileCodeIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  FolderIcon,
  XCircleIcon,
  LinkIcon,
  RefreshIcon,
} from "./icons";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";

export default function ProjectList() {
  const projects = useStore((s) => s.projects);
  const fileHandles = useStore((s) => s.fileHandles);
  const fileStatus = useStore((s) => s.fileStatus);
  const projectUrls = useStore((s) => s.projectUrls);
  const createProject = useStore((s) => s.createProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const renameProject = useStore((s) => s.renameProject);
  const duplicateProject = useStore((s) => s.duplicateProject);
  const importProject = useStore((s) => s.importProject);
  const exportMsProjectXml = useStore((s) => s.exportMsProjectXml);
  const openProjectFromFile = useStore((s) => s.openProjectFromFile);
  const saveProjectAsFile = useStore((s) => s.saveProjectAsFile);
  const closeFileProject = useStore((s) => s.closeFileProject);
  const addProjectFromUrl = useStore((s) => s.addProjectFromUrl);
  const refreshProjectFromUrl = useStore((s) => s.refreshProjectFromUrl);
  const t = useT();
  const language = useLanguage();
  const dateLocale = language === "es" ? es : enUS;
  const heroCollapsed = useSettingsStore((s) => s.heroCollapsed);
  const setHeroCollapsed = useSettingsStore((s) => s.setHeroCollapsed);

  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [addingUrl, setAddingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The server snapshot is always "unsupported" (window is undefined during SSR); the client
  // snapshot reflects the real browser capability. This is exactly what useSyncExternalStore
  // is for, and avoids a hydration mismatch on the File System Access button.
  const fsSupported = useSyncExternalStore(
    () => () => {},
    () => isFileSystemAccessSupported(),
    () => false,
  );

  const sorted = [...projects].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  async function importFile(file: File) {
    const content = await decodeImportBuffer(await file.arrayBuffer());
    const id = importProject(content, file.name);
    if (!id) alert(t("importInvalidFile"));
  }

  async function handleAddFromUrl(e: React.FormEvent) {
    e.preventDefault();
    setUrlError(null);
    setUrlLoading(true);
    const id = await addProjectFromUrl(urlInput);
    setUrlLoading(false);
    if (!id) {
      setUrlError(t("addFromUrlFailed"));
      return;
    }
    setAddingUrl(false);
    setUrlInput("");
  }

  async function handleRefresh(projectId: string, name: string) {
    if (!confirm(t("refreshConfirm", { name }))) return;
    setRefreshingId(projectId);
    const ok = await refreshProjectFromUrl(projectId);
    setRefreshingId(null);
    if (!ok) alert(t("refreshFailed"));
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await importFile(file);
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await importFile(file);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      {heroCollapsed ? (
        <button
          onClick={() => setHeroCollapsed(false)}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`mb-8 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-xs font-medium hover:bg-neutral-50 ${
            dragOver
              ? "border-green-500 bg-green-50 text-green-700"
              : "border-neutral-300 text-neutral-400"
          }`}
        >
          <ChevronDownIcon className="h-3.5 w-3.5" />
          {dragOver ? t("dropToImport") : t("showImage")}
        </button>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative mb-8 overflow-hidden rounded-xl border shadow-sm ${
            dragOver ? "border-green-500 ring-2 ring-green-500" : "border-neutral-200"
          }`}
        >
          <Image
            src="/home.jpg"
            alt={t("appName")}
            width={1024}
            height={559}
            priority
            className="h-auto w-full"
          />
          {dragOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-900/40 text-lg font-semibold text-white">
              {t("dropToImport")}
            </div>
          )}
          <button
            onClick={() => setHeroCollapsed(true)}
            title={t("hideImage")}
            aria-label={t("hideImage")}
            className="absolute right-2 top-2 rounded-md bg-white/90 p-1.5 text-neutral-600 shadow hover:bg-white"
          >
            <ChevronUpIcon />
          </button>
        </div>
      )}

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            {t("appName")}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">{t("appTagline")}</p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json,.xml,text/xml,application/xml,.bc3"
            className="hidden"
            onChange={handleImport}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            {t("import")}
          </button>
          {fsSupported && (
            <button
              onClick={() => openProjectFromFile()}
              title={t("openFromFolderHint")}
              className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <FolderIcon className="h-4 w-4" />
              {t("openFromFolder")}
            </button>
          )}
          <button
            onClick={() => {
              setUrlInput("");
              setUrlError(null);
              setAddingUrl(true);
            }}
            title={t("addFromUrlTitle")}
            className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <LinkIcon className="h-4 w-4" />
            {t("addFromUrl")}
          </button>
          <button
            onClick={() => {
              setName(t("defaultNewProjectName"));
              setCreating(true);
            }}
            className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            {t("newProject")}
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 py-20 text-center text-neutral-400">
          {t("noProjectsYet")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((p) => {
            const computed = getComputedTasks(p);
            const range = computed.length ? projectDateRange(computed) : null;
            const linked = !!fileHandles[p.id];
            const status = fileStatus[p.id];
            const statusLabel =
              status === "saving"
                ? t("fileSaving")
                : status === "error"
                  ? t("fileErrorStatus")
                  : t("fileSaved");
            const fromUrl = !!projectUrls[p.id];
            return (
              <div
                key={p.id}
                className="group relative flex flex-col rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <Link href={`/project/${p.id}`} className="flex-1">
                  <h3 className="truncate pr-6 text-base font-semibold text-neutral-900">
                    {p.name}
                  </h3>
                  <p className="mt-1 text-xs text-neutral-500">
                    {plural(language, computed.length, "tasksCount", "tasksCountPlural")} ·{" "}
                    {plural(language, p.resources.length, "resourcesCount", "resourcesCountPlural")}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {range
                      ? `${format(range.start, "MMM d, yyyy", { locale: dateLocale })} – ${format(range.end, "MMM d, yyyy", { locale: dateLocale })}`
                      : t("noTasksYetShort")}
                  </p>
                  <p className="mt-3 text-[11px] text-neutral-400">
                    {t("updated", {
                      date: format(new Date(p.updatedAt), "MMM d, yyyy p", {
                        locale: dateLocale,
                      }),
                    })}
                  </p>
                  {linked && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-green-700">
                      <FolderIcon className="h-3 w-3" />
                      {t("linkedToFile")} · {statusLabel}
                    </p>
                  )}
                  {fromUrl && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-neutral-400">
                      <LinkIcon className="h-3 w-3" />
                      {t("fromUrl")}
                    </p>
                  )}
                </Link>
                <div className="mt-3 flex items-center gap-1 border-t border-neutral-100 pt-3 text-xs">
                  <button
                    onClick={() => {
                      setRenamingId(p.id);
                      setName(p.name);
                    }}
                    title={t("rename")}
                    aria-label={t("rename")}
                    className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100"
                  >
                    <PencilIcon />
                  </button>
                  <button
                    onClick={() => duplicateProject(p.id)}
                    title={t("duplicate")}
                    aria-label={t("duplicate")}
                    className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100"
                  >
                    <CopyIcon />
                  </button>
                  <button
                    onClick={() => {
                      const blob = new Blob([serializeProjectFile(p)], {
                        type: "application/json",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${p.name.replace(/[^a-z0-9-_]+/gi, "_")}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    title={t("export")}
                    aria-label={t("export")}
                    className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100"
                  >
                    <DownloadIcon />
                  </button>
                  {!linked && fsSupported && (
                    <button
                      onClick={() => saveProjectAsFile(p.id)}
                      title={t("saveToFolder")}
                      aria-label={t("saveToFolder")}
                      className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100"
                    >
                      <FolderIcon />
                    </button>
                  )}
                  {fromUrl && (
                    <button
                      onClick={() => handleRefresh(p.id, p.name)}
                      disabled={refreshingId === p.id}
                      title={t("refresh")}
                      aria-label={t("refresh")}
                      className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-40"
                    >
                      <RefreshIcon
                        className={refreshingId === p.id ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                      />
                    </button>
                  )}
                  {p.source?.format === "msproject-xml" && (
                    <button
                      onClick={() => {
                        const xml = exportMsProjectXml(p.id);
                        if (!xml) {
                          alert(t("exportMsProjectXmlFailed"));
                          return;
                        }
                        const blob = new Blob([xml], {
                          type: "application/xml",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${p.name.replace(/[^a-z0-9-_]+/gi, "_")}.xml`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      title={t("exportXml")}
                      aria-label={t("exportXml")}
                      className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100"
                    >
                      <FileCodeIcon />
                    </button>
                  )}
                  {linked ? (
                    <button
                      onClick={() => {
                        if (confirm(t("closeFileProjectConfirm", { name: p.name }))) {
                          closeFileProject(p.id);
                        }
                      }}
                      title={t("closeProject")}
                      aria-label={t("closeProject")}
                      className="ml-auto rounded p-1.5 text-neutral-500 hover:bg-neutral-100"
                    >
                      <XCircleIcon />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (confirm(t("deleteProjectConfirm", { name: p.name }))) {
                          deleteProject(p.id);
                        }
                      }}
                      title={t("delete")}
                      aria-label={t("delete")}
                      className="ml-auto rounded p-1.5 text-red-500 hover:bg-red-50"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <Modal title={t("newProjectTitle")} onClose={() => setCreating(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createProject(name);
              setCreating(false);
            }}
          >
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              {t("projectName")}
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-green-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                {t("create")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {renamingId && (
        <Modal title={t("renameProjectTitle")} onClose={() => setRenamingId(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              renameProject(renamingId, name);
              setRenamingId(null);
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-green-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenamingId(null)}
                className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                {t("save")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {addingUrl && (
        <Modal title={t("addFromUrlTitle")} onClose={() => setAddingUrl(false)}>
          <form onSubmit={handleAddFromUrl}>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              {t("urlLabel")}
            </label>
            <input
              autoFocus
              type="url"
              required
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-green-500"
            />
            <p className="mt-2 text-[11px] text-neutral-400">{t("addFromUrlHelp")}</p>
            {urlError && <p className="mt-2 text-xs text-red-500">{urlError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddingUrl(false)}
                className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                disabled={urlLoading}
                className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                {t("add")}
              </button>
            </div>
          </form>
        </Modal>
      )}

    </div>
  );
}
