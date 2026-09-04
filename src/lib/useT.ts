"use client";

import { useSettingsStore } from "./settings-store";
import { translate } from "./i18n";

export function useT() {
  const language = useSettingsStore((s) => s.language);
  return (key: string, params?: Record<string, string | number>) =>
    translate(language, key, params);
}

export function useLanguage() {
  return useSettingsStore((s) => s.language);
}
