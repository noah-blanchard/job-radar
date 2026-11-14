import type { Profile } from "../config";
import { countryCode } from "../normalize/location";

/**
 * Search plans for the keyword aggregators, generated from config/profile.yaml
 * (domains x locations). Each connector maps them to its own API parameters.
 */

/** Seniority words searched in titles, by language. */
export const SENIORITY_TERMS = {
  en: ["junior", "graduate", "new grad", "entry level"],
  fr: ["junior", "débutant", "jeune diplômé"],
} as const;

/** Words too generic to be useful in an "any of these words" search. */
const GENERIC = new Set([
  "engineer",
  "engineering",
  "developer",
  "programmer",
  "digital",
  "processing",
  "signal",
]);

/** profile.yaml keyword (a case-insensitive regex) -> plain search term. */
export function plainTerm(pattern: string): string {
  return pattern
    .replace(/\[([^\]]*)\]\?/g, (_m, cls: string) => (cls.includes("-") ? "-" : ""))
    .replace(/\[([^\]]*)\]/g, (_m, cls: string) => (cls.includes("-") ? "-" : (cls[0] ?? "")))
    .replace(/\\(.)/g, "$1")
    .replace(/[()?*^$|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DomainTerms {
  domain: string;
  /** Plain terms, in profile order. */
  terms: string[];
  /** Distinct single words (for OR searches), generic words removed. */
  words: string[];
}

export function domainTerms(profile: Profile): DomainTerms[] {
  return Object.entries(profile.domains).map(([domain, patterns]) => {
    const terms = [...new Set(patterns.map(plainTerm).filter(Boolean))];
    const words = [
      ...new Set(
        terms
          .flatMap((t) => t.toLowerCase().split(" "))
          .filter((w) => w.length > 1 && !GENERIC.has(w)),
      ),
    ];
    return { domain, terms, words };
  });
}

/** ISO2 countries named in profile.locations (explicit `country`, or a city match), in order. */
export function profileCountries(profile: Profile): string[] {
  const out: string[] = [];
  for (const l of profile.locations) {
    const cc = l.country ? countryCode(l.country) : null;
    if (cc && !out.includes(cc)) out.push(cc);
  }
  return out;
}

/** Wants remote jobs (a `remote: true` location entry). */
export function profileWantsRemote(profile: Profile): boolean {
  return profile.locations.some((l) => l.remote === true);
}

/**
 * Places by decreasing weight: cities from `match` (first ASCII alternative, "Montréal|Montreal"
 * -> "Montreal") and country names. Used by JSearch-style free-text queries ("... in Toronto").
 */
export function profilePlaces(profile: Profile, countryNames: Record<string, string>): string[] {
  const out: string[] = [];
  const sorted = [...profile.locations].sort((a, b) => b.weight - a.weight);
  for (const l of sorted) {
    let place: string | undefined;
    if (l.match) {
      const alts = l.match.split("|").map((s) => plainTerm(s));
      place = alts.find((s) => /^[\x20-\x7e]+$/.test(s)) ?? alts[0];
    } else if (l.country && !l.remote) {
      place = countryNames[countryCode(l.country) ?? ""];
    }
    if (place && !out.includes(place)) out.push(place);
  }
  return out;
}

export const COUNTRY_NAMES: Record<string, string> = {
  CA: "Canada",
  US: "United States",
  FR: "France",
  GB: "United Kingdom",
  DE: "Germany",
};

/** Days ago as a Date. */
export const daysAgo = (days: number, now = new Date()) =>
  new Date(now.getTime() - days * 86_400_000);

/**
 * Oldest publication date worth paging back to: one day before the last successful run, or
 * `fallbackDays` ago on the first run.
 */
export function pagingCutoff(
  since: Date | undefined,
  fallbackDays: number,
  now = new Date(),
): Date {
  return since ? new Date(since.getTime() - 86_400_000) : daysAgo(fallbackDays, now);
}
