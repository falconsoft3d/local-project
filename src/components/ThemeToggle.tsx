"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSettingsStore, type Theme } from "@/lib/settings-store";
import { useT } from "@/lib/useT";

function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** The theme actually shown: the saved choice, or the OS preference. */
export function useResolvedTheme(): Theme {
  const saved = useSettingsStore((s) => s.theme);
  const system = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
      mq?.addEventListener("change", cb);
      return () => mq?.removeEventListener("change", cb);
    },
    systemTheme,
    () => "light" as Theme,
  );
  return saved ?? system;
}

/** Keeps <html data-theme> and <html lang> in sync with the settings (the inline script in
 * the root layout sets them before the first paint; this follows later changes). */
export function HtmlSettingsSync() {
  const theme = useResolvedTheme();
  const language = useSettingsStore((s) => s.language);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.setAttribute("lang", language);
  }, [language]);
  return null;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/** Light / dark switch, next to the language switcher. */
export default function ThemeToggle({ variant = "light" }: { variant?: "light" | "dark" }) {
  const theme = useResolvedTheme();
  const setTheme = useSettingsStore((s) => s.setTheme);
  const t = useT();
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? t("themeSwitchToDark") : t("themeSwitchToLight");
  return (
    <button
      onClick={() => setTheme(next)}
      title={label}
      aria-label={label}
      className={`flex h-[30px] w-[30px] items-center justify-center rounded-md border ${
        variant === "dark"
          ? "border-white/30 text-white hover:bg-white/10"
          : "border-neutral-200 text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
