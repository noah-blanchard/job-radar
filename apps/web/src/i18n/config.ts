/**
 * Interface languages. This list is the only place a language is declared: to add one, add an
 * entry here and a `messages/<code>.ts` typed `Messages` (typecheck lists every missing string).
 * Only the interface is translated: offer content, profiles, score details and alerts are not.
 */
export const LOCALES = [
  { code: "fr", label: "Français", intl: "fr-CA" },
  { code: "en", label: "English", intl: "en-CA" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "fr";

/** Last language chosen in this browser: keeps the login page in that language after logout. */
export const LOCALE_COOKIE = "jr-locale";

/** BCP 47 tag for `Intl` (dates, numbers, plural rules). */
export function intlTag(locale: Locale): string {
  return LOCALES.find((l) => l.code === locale)!.intl;
}

export function parseLocale(v: string | null | undefined): Locale | null {
  return LOCALES.find((l) => l.code === v)?.code ?? null;
}

/** Best supported language from an Accept-Language header ("en-US,en;q=0.9,fr;q=0.8"). */
export function negotiate(acceptLanguage: string | null | undefined): Locale {
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, i) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return {
        lang: tag.split("-")[0]!.toLowerCase(),
        weight: Number.isNaN(weight) ? 0 : weight,
        i,
      };
    })
    .filter((r) => r.lang && r.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.i - b.i);
  for (const r of ranked) {
    const found = parseLocale(r.lang);
    if (found) return found;
  }
  return DEFAULT_LOCALE;
}
