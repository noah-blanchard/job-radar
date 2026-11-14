import { parseProfile, type Profile } from "../config";
import { countryCode } from "../normalize/location";

/**
 * Search plans for the keyword aggregators, generated from config/profile.yaml
 * (domains x locations). Each connector maps them to its own API parameters.
 */

/** Search of a profile that sets no `search_titles` (the original single-user search). */
export const DEFAULT_SEARCH_TITLE = "new grad software engineer";

/** Free-text aggregator searches of a profile. */
export function searchTitles(profile: Profile): string[] {
  return profile.search_titles.length > 0 ? profile.search_titles : [DEFAULT_SEARCH_TITLE];
}

/** [a1, a2], [b1] -> [a1, b1, a2]: each list gets its turn before any gets a second one. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++)
    for (const l of lists) if (i < l.length) out.push(l[i]!);
  return out;
}

/**
 * One search profile for the aggregators from every user's profile: locations, domains and
 * search titles of all of them, interleaved (first domain of each user, then the second...) so a
 * daily quota spent in order is shared fairly. A single profile comes back unchanged (same
 * queries as before accounts existed).
 */
export function mergeSearchProfiles(profiles: readonly Profile[]): Profile {
  if (profiles.length === 0) return parseProfile({});
  if (profiles.length === 1) return profiles[0]!;
  const seenLoc = new Set<string>();
  const locations = interleave(profiles.map((p) => p.locations)).filter((l) => {
    const k = JSON.stringify([l.match ?? "", l.country ?? "", l.remote ?? null]);
    if (seenLoc.has(k)) return false;
    seenLoc.add(k);
    return true;
  });
  const domains: Profile["domains"] = {};
  for (const [name, kws] of interleave(profiles.map((p) => Object.entries(p.domains)))) {
    let key = name;
    for (let n = 2; key in domains; n++) key = `${name}#${n}`;
    domains[key] = kws;
  }
  return parseProfile({
    locations,
    domains,
    languages: [...new Set(profiles.flatMap((p) => p.languages))],
    search_titles: [...new Set(interleave(profiles.map(searchTitles)))],
  });
}

/** Seniority words searched in titles, by language. */
export const SENIORITY_TERMS = {
  en: ["junior", "graduate", "new grad", "entry level"],
  fr: ["junior", "débutant", "jeune diplômé"],
} as const;

/**
 * Words too generic to be useful in an "any of these words" search: job nouns in both languages
 * and the small words of French and English phrases ("ingénieur de données").
 */
const GENERIC = new Set([
  "engineer",
  "engineering",
  "developer",
  "programmer",
  "digital",
  "processing",
  "signal",
  "ingénieur",
  "ingénieure",
  "ingénierie",
  "développeur",
  "développeuse",
  "programmeur",
  "programmeuse",
  "numérique",
  "traitement",
  "logiciel",
  ...["of", "the", "and", "for", "in", "on", "to", "with"],
  ...["de", "des", "du", "la", "le", "les", "en", "et", "pour", "au", "aux", "à", "un", "une"],
]);

/**
 * Top-level alternatives of a keyword: "data engineer|ingénieur de données" gives both, while
 * "audio (software|engine)" stays one. A bilingual keyword then yields one clean term per
 * language instead of the two glued together.
 */
export function alternatives(pattern: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inClass = false;
  let start = 0;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") i++;
    else if (inClass) inClass = c !== "]";
    else if (c === "[") inClass = true;
    else if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === "|" && depth === 0) {
      out.push(pattern.slice(start, i));
      start = i + 1;
    }
  }
  out.push(pattern.slice(start));
  return out.map((a) => a.trim()).filter(Boolean);
}

/** Variants kept per keyword: "(a|b) (c|d)" already gives four. */
const MAX_VARIANTS = 4;

/** Parentheses of the first group of `pattern` that holds alternatives. */
function alternationGroup(pattern: string): { open: number; close: number } | null {
  const stack: { open: number; bar: boolean }[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") i++;
    else if (inClass) inClass = c !== "]";
    else if (c === "[") inClass = true;
    else if (c === "(") stack.push({ open: i, bar: false });
    else if (c === "|" && stack.length > 0) stack[stack.length - 1]!.bar = true;
    else if (c === ")") {
      const group = stack.pop();
      if (group?.bar) return { open: group.open, close: i };
    }
  }
  return null;
}

/**
 * One pattern per choice of the alternatives inside groups: "data warehous(e|ing)" gives
 * "data warehous(e)" and "data warehous(ing)", so each search term is a real phrase instead of
 * "data warehouse ing". First choices come first; at most `max` variants are kept.
 */
export function expandGroups(pattern: string, max = MAX_VARIANTS): string[] {
  const group = alternationGroup(pattern);
  if (!group) return [pattern];
  const inner = pattern.slice(group.open + 1, group.close).replace(/^\?:/, "");
  const choices = alternatives(inner);
  const out: string[] = [];
  for (const choice of choices.length > 0 ? choices : [""]) {
    if (out.length >= max) break;
    const variant = `${pattern.slice(0, group.open)}(${choice})${pattern.slice(group.close + 1)}`;
    out.push(...expandGroups(variant, max - out.length));
  }
  return out;
}

/** profile.yaml keyword (a case-insensitive regex) -> plain search term. */
export function plainTerm(pattern: string): string {
  return pattern
    .replace(/\[([^\]]*)\]\?/g, (_m, cls: string) => (cls.includes("-") ? "-" : ""))
    .replace(/\[([^\]]*)\]/g, (_m, cls: string) => (cls.includes("-") ? "-" : (cls[0] ?? "")))
    .replace(/\\(.)/g, "$1")
    .replace(/\|/g, " ") // a leftover alternative: separate words, never glued together
    .replace(/[()?*^$]/g, "")
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
    const variants = patterns.flatMap(alternatives).flatMap((p) => expandGroups(p));
    const terms = [...new Set(variants.map(plainTerm).filter(Boolean))];
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
