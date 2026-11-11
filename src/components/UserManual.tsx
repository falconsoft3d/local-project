"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { manualContent, type ManualBlock } from "@/lib/manual-content";
import { useLanguage } from "@/lib/useT";

/** Renders `**label**` as an on-screen label (green, semibold), like the printed manual. */
function rich(text: string): ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-green-700">
        {part}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

const NOTE_STYLES = {
  note: "border-green-500 bg-green-50 text-neutral-800",
  warn: "border-amber-500 bg-amber-50 text-neutral-800",
  important: "border-red-500 bg-red-50 text-neutral-800",
} as const;

const NOTE_LABEL_STYLES = {
  note: "text-green-700",
  warn: "text-amber-700",
  important: "text-red-700",
} as const;

function Block({ block, labels }: { block: ManualBlock; labels: Record<"note" | "warn" | "important", string> }) {
  if ("p" in block) return <p className="leading-relaxed text-neutral-700">{rich(block.p)}</p>;
  if ("list" in block)
    return (
      <ul className="list-disc space-y-1.5 pl-5 text-neutral-700">
        {block.list.map((item, i) => (
          <li key={i}>{rich(item)}</li>
        ))}
      </ul>
    );
  if ("steps" in block)
    return (
      <ol className="space-y-2">
        {block.steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-neutral-700">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-semibold text-white">
              {i + 1}
            </span>
            <span className="pt-0.5 leading-relaxed">{rich(step)}</span>
          </li>
        ))}
      </ol>
    );
  if ("table" in block)
    return (
      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-neutral-100 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              {block.table.head.map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.table.rows.map((row, i) => (
              <tr key={i} className="border-t border-neutral-200 align-top">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2 ${j === 0 ? "font-medium text-neutral-900" : "text-neutral-700"} ${
                      j === 0 && /^[0-9.,\sA-Z+%dt-]+$/i.test(cell) && /\d/.test(cell) ? "font-mono text-[13px]" : ""
                    }`}
                  >
                    {rich(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  const { kind, text } = block.note;
  return (
    <div className={`rounded-r-lg border-l-4 px-4 py-3 text-sm ${NOTE_STYLES[kind]}`}>
      <p className={`mb-1 text-[11px] font-bold uppercase tracking-wider ${NOTE_LABEL_STYLES[kind]}`}>{labels[kind]}</p>
      <p className="leading-relaxed">{rich(text)}</p>
    </div>
  );
}

/** The in-app user manual (/manual), in the current language. */
export default function UserManual() {
  const lang = useLanguage();
  const m = manualContent[lang === "en" ? "en" : "es"];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-10 rounded-xl bg-green-600 px-6 py-8 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-100">LoocalProject</p>
        <h1 className="mt-2 text-3xl font-bold">{m.title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-green-50">{m.subtitle}</p>
        <div className="mt-5 flex flex-wrap gap-2 print:hidden">
          <Link
            href="/"
            className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50"
          >
            {m.openApp} →
          </Link>
          <button
            onClick={() => window.print()}
            className="rounded-md border border-white/40 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            PDF
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-10 lg:flex-row">
        <nav className="shrink-0 lg:w-60 print:hidden">
          <div className="rounded-lg border border-neutral-200 bg-white p-4 lg:sticky lg:top-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{m.tocTitle}</p>
            <ol className="space-y-1 text-sm">
              {m.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="flex gap-2 rounded px-1.5 py-1 text-neutral-700 hover:bg-neutral-100 hover:text-green-700">
                    <span className="w-6 shrink-0 font-mono text-xs leading-5 text-green-600">{s.num}</span>
                    <span>{s.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <main className="min-w-0 flex-1 space-y-14">
          {m.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-6">
              <div className="mb-4 flex items-baseline gap-3 border-b border-neutral-200 pb-2">
                <span className="font-mono text-2xl font-bold text-green-600">{s.num}</span>
                <h2 className="text-xl font-semibold text-neutral-900">{s.title}</h2>
              </div>
              <p className="mb-5 text-[15px] font-medium leading-relaxed text-neutral-600">{rich(s.lead)}</p>
              <div className="space-y-5 text-sm">
                {s.blocks.map((b, i) => (
                  <Block key={i} block={b} labels={m.noteLabels} />
                ))}
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
