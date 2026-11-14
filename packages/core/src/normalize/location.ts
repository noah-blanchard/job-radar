import { CA_PROVINCES, CITIES, COUNTRIES, ISO2, US_STATES } from "./geo";
import { normKey } from "./text";

export type RemoteKind = "onsite" | "hybrid" | "remote" | "unknown";

export interface ParsedLocation {
  city: string | null;
  region: string | null;
  /** ISO 3166-1 alpha-2. */
  country: string | null;
  remote: RemoteKind;
}

export interface LocationHints {
  /** Country from a structured API field (alpha-2 or name). */
  country?: string | null;
  remote?: "onsite" | "hybrid" | "remote" | null;
}

const REMOTE_RE =
  /\b(remote|remotely|fully remote|work from home|wfh|teletravail|a distance|anywhere|distributed)\b/;
const HYBRID_RE = /\b(hybrid|hybride|flexible)\b/;
const ONSITE_RE = /\b(on ?site|in office|office based|sur site|presentiel)\b/;
const NOISE_RE =
  /^(\d+ locations?|multiple locations?|various locations?|plusieurs lieux|hq|headquarters|office|n a|tbd|other|remote first|or|and|ou|et|area|metro area|metropolitan area)$/;

/** Country alpha-2 from a name or code ("Canada", "ca", "USA"), or null. */
export function countryCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const k = normKey(raw);
  if (k in COUNTRIES) return COUNTRIES[k] || null;
  const up = raw.trim().toUpperCase();
  if (up.length === 2 && ISO2.has(up)) return up === "UK" ? "GB" : up;
  return null;
}

function regionOf(k: string): { region: string; country: "CA" | "US" } | null {
  if (k in CA_PROVINCES) return { region: CA_PROVINCES[k]!, country: "CA" };
  if (k in US_STATES) return { region: US_STATES[k]!, country: "US" };
  return null;
}

function titleCase(s: string): string {
  return s.replace(/\S+/g, (w) =>
    w.length <= 2 && w === w.toUpperCase() ? w : w[0]!.toUpperCase() + w.slice(1),
  );
}

/**
 * Parses free-form locations: "Montréal, QC", "Montreal, Quebec, Canada", "Remote - Canada",
 * "California - San Francisco" (Workday), "Toronto, ON, CA", "Paris, France (Hybrid)", ...
 * Multi-location strings use the first location.
 */
export function parseLocation(
  raw: string | null | undefined,
  hints: LocationHints = {},
): ParsedLocation {
  const out: ParsedLocation = { city: null, region: null, country: null, remote: "unknown" };
  const full = normKey(raw ?? "");

  if (REMOTE_RE.test(full)) out.remote = "remote";
  else if (HYBRID_RE.test(full)) out.remote = "hybrid";
  else if (ONSITE_RE.test(full)) out.remote = "onsite";
  if (hints.remote) out.remote = hints.remote;

  // First location only: "New York, NY; San Francisco, CA" / "Paris | Lyon" / "A or B".
  const cleaned = (raw ?? "").replace(/washington,?\s*d\.?\s?c\.?/gi, "Washington DC");
  const first = cleaned.split(/;|\s\|\s|\s\/\s|\n|\s+or\s+|\s+ou\s+/i)[0] ?? "";
  const tokens = first
    .split(/,|\s[-–—]\s|\(|\)|\s·\s|•|:/)
    .map((t) => t.trim())
    .filter(Boolean);

  let cityInfo: (typeof CITIES)[string] | undefined;
  for (const tok of tokens) {
    const k = normKey(tok);
    if (!k || NOISE_RE.test(k)) continue;
    if (REMOTE_RE.test(k) || HYBRID_RE.test(k) || ONSITE_RE.test(k)) {
      // "Remote Canada", "Remote (US)": keep the rest of the token.
      const rest = k.replace(REMOTE_RE, "").replace(HYBRID_RE, "").replace(ONSITE_RE, "").trim();
      const cc = countryCode(rest);
      if (cc) out.country ??= cc;
      continue;
    }
    const isTwoLetter = /^[a-z]{2}$/.test(k);

    // 1) Known city (unless it's a 2-letter token that is better read as a region/country).
    if (!out.city && !isTwoLetter && k in CITIES) {
      cityInfo = CITIES[k]!;
      out.city = cityInfo.city;
      continue;
    }
    // 2) Region (province/state). A 2-letter code after a region is a country ("Toronto, ON, CA");
    //    after a country it must belong to that country ("USA - CA" = California).
    const reg = regionOf(k);
    if (reg && !out.region && (!isTwoLetter || !out.country || out.country === reg.country)) {
      out.region = reg.region;
      out.country ??= reg.country;
      continue;
    }
    // 3) Country.
    const cc = countryCode(tok);
    if (cc !== null || k in COUNTRIES) {
      if (cc) out.country = cc;
      continue;
    }
    // 4) Unknown token: first one becomes the city.
    if (!out.city && !isTwoLetter && /[a-z]/.test(k))
      out.city = titleCase(tok.replace(/\s+/g, " "));
  }

  // Fill from the city table when nothing explicit contradicts it.
  if (cityInfo && (!out.country || out.country === cityInfo.country)) {
    out.country ??= cityInfo.country;
    out.region ??= cityInfo.region;
  }
  if (!out.country && hints.country) out.country = countryCode(hints.country);
  return out;
}

/** Place used in the dedup fingerprint: city, else country, else "remote". */
export function fingerprintPlace(loc: ParsedLocation): string {
  return loc.city ?? loc.country ?? (loc.remote === "remote" ? "remote" : "");
}
