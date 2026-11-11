import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Language } from "./i18n";

export type Theme = "light" | "dark";

interface SettingsState {
  language: Language;
  /** null = follow the operating system until the user picks one. */
  theme: Theme | null;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
  heroCollapsed: boolean;
  setHeroCollapsed: (collapsed: boolean) => void;
  cookieConsent: boolean;
  setCookieConsent: (accepted: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: "es",
      setLanguage: (language) => set({ language }),
      theme: null,
      setTheme: (theme) => set({ theme }),
      heroCollapsed: false,
      setHeroCollapsed: (heroCollapsed) => set({ heroCollapsed }),
      cookieConsent: false,
      setCookieConsent: (cookieConsent) => set({ cookieConsent }),
    }),
    { name: "local-project.settings.v1" }
  )
);
