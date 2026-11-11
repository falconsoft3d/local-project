/** Number / money / date formatting shared by the scheduling views. */

export function localeOf(lang: string): string {
  return lang === "es" ? "es-ES" : "en-GB";
}

export function formatMoney(n: number | null | undefined, lang: string, decimals = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(localeOf(lang), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    // Spanish budgets group thousands also in 4-digit amounts (6.960,00 €).
    useGrouping: "always",
  } as Intl.NumberFormatOptions).format(n);
}

export function formatNumber(n: number | null | undefined, lang: string, decimals = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(localeOf(lang), {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
    useGrouping: "always",
  } as Intl.NumberFormatOptions).format(n);
}

/** dd/mm/yyyy (es) or dd/mm/yyyy (en-GB) from an ISO date. */
export function formatDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return lang === "es" || lang === "en" ? `${d}/${m}/${y}` : iso;
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

/** Downloads a Blob as a file. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, "_") || "project";
}
