import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Language } from "./i18n";

interface SettingsState {
  language: Language;
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
      heroCollapsed: false,
      setHeroCollapsed: (heroCollapsed) => set({ heroCollapsed }),
      cookieConsent: false,
      setCookieConsent: (cookieConsent) => set({ cookieConsent }),
    }),
    { name: "local-project.settings.v1" }
  )
);
