"use client";

import { useEffect, type ReactNode } from "react";

/** Full-screen view used by the scheduling tools (network, histogram, S-curve, variance,
 * report). Green header like the project workspace, optional toolbar row, scrollable body.
 * Escape closes it. Printing hides the chrome marked with `print:hidden`. */
export default function FullScreenPanel({
  title,
  subtitle,
  onClose,
  toolbar,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white print:static print:block">
      <header className="flex items-center gap-3 bg-green-600 px-4 py-2.5 shadow-sm print:bg-white print:shadow-none">
        <button
          onClick={onClose}
          className="text-sm text-green-100 hover:text-white print:hidden"
        >
          ← Gantt
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-white print:text-neutral-900">{title}</h2>
          {subtitle && (
            <p className="truncate text-[11px] text-green-100 print:text-neutral-500">{subtitle}</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1 text-green-100 hover:bg-white/10 hover:text-white print:hidden"
        >
          ✕
        </button>
      </header>
      {toolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-2 print:hidden">
          {toolbar}
        </div>
      )}
      <div className="flex-1 overflow-auto print:overflow-visible">{children}</div>
    </div>
  );
}
