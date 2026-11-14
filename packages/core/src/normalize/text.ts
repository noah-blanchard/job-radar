import { createHash } from "node:crypto";

/** "Montréal" -> "Montreal". */
export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Lowercase, accents removed, punctuation -> space, collapsed. Used for matching keys. */
export function normKey(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const COMPANY_SUFFIXES =
  /\b(inc|incorporated|ltd|limited|llc|llp|corp|corporation|co|company|gmbh|ag|sa|sas|sarl|bv|nv|plc|pty|ltee|ulc|lp)\b/g;

/** Company key for dedup: "Stripe, Inc." -> "stripe", "Ubisoft Montréal" -> "ubisoft montreal". */
export function companyKey(name: string): string {
  return normKey(name).replace(COMPANY_SUFFIXES, " ").trim().replace(/\s+/g, " ");
}

/** Title key for dedup: case/accents/punctuation-insensitive, gender markers removed. */
export function titleKey(title: string): string {
  return normKey(
    title
      // "(m/w/d)", "(f/h)", "(H/F)", "(d/f/m)" ...
      .replace(/\((?:[mwfdhx]\s*\/\s*){1,3}[mwfdhx]\)/gi, " ")
      .replace(/\b(?:[mwfdhx]\s*\/\s*){1,3}[mwfdhx]\b/gi, " "),
  );
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * Dedup fingerprint = hash(company key, title key, city key). `place` is the normalized city,
 * or the country / "remote" when there is no city.
 */
export function fingerprint(
  company: string,
  title: string,
  place: string | null | undefined,
): string {
  return sha256Hex(`${companyKey(company)}|${titleKey(title)}|${normKey(place ?? "")}`).slice(
    0,
    32,
  );
}

// Never strip identifiers: e.g. `gh_jid` IS the job id on custom Greenhouse career pages.
const TRACKING_PARAMS = /^(utm_|gh_src$|lever-source|source$|ref$|src$|trk|fbclid$|gclid$)/i;

/** Canonical URL: https, lowercase host, no hash, no tracking params, no trailing slash. */
export function canonicalUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}

const FR_WORDS =
  /\b(le|la|les|des|du|une|et|est|pour|avec|dans|nous|vous|sur|votre|notre|poste|équipe)\b/gi;
const EN_WORDS = /\b(the|and|of|to|for|with|in|is|our|you|we|your|will|team|role|are)\b/gi;

/** Rough fr/en detection from stopword frequency (no external service). */
export function detectLang(text: string | null | undefined): "fr" | "en" | null {
  if (!text) return null;
  const sample = text.slice(0, 3000);
  const fr = sample.match(FR_WORDS)?.length ?? 0;
  const en = sample.match(EN_WORDS)?.length ?? 0;
  if (fr + en < 5) return null;
  return fr > en ? "fr" : "en";
}
