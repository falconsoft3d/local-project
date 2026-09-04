"use client";

import { useSettingsStore } from "@/lib/settings-store";
import type { Language } from "@/lib/i18n";

const OPTIONS: { code: Language; label: string }[] = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
];

export default function LanguageSwitcher({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const dark = variant === "dark";

  return (
    <div
      className={`flex items-center gap-1 rounded-md border p-0.5 ${
        dark ? "border-white/30" : "border-neutral-200"
      }`}
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.code}
          onClick={() => setLanguage(opt.code)}
          className={`rounded px-2.5 py-1 text-xs font-medium ${
            language === opt.code
              ? dark
                ? "bg-white text-green-700"
                : "bg-green-600 text-white"
              : dark
                ? "text-green-100 hover:bg-white/10"
                : "text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
