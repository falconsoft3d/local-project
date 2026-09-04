"use client";

import { useSettingsStore } from "@/lib/settings-store";
import { useT } from "@/lib/useT";

export default function CookieBanner() {
  const t = useT();
  const cookieConsent = useSettingsStore((s) => s.cookieConsent);
  const setCookieConsent = useSettingsStore((s) => s.setCookieConsent);

  if (cookieConsent) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-neutral-500">
          {t("cookieBannerText")}{" "}
          <a href="/cookies" className="font-medium text-green-700 underline hover:text-green-800">
            {t("cookieBannerPolicyLink")}
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => setCookieConsent(true)}
          className="shrink-0 rounded-md bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-700"
        >
          {t("cookieBannerAccept")}
        </button>
      </div>
    </div>
  );
}
