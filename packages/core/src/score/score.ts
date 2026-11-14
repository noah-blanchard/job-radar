/**
 * Job score (0-100) driven entirely by config/profile.yaml (spec section 8), with a breakdown the
 * dashboard can explain line by line. Pure: no database access here.
 */
import type { Profile } from "../config";
import { countryCode } from "../normalize/location";
import { companyKey, sha256Hex, stripAccents } from "../normalize/text";
import type { Seniority } from "../classify/rules";

/**
 * Bump when the scoring code changes: it is part of the profile hash, so a deploy with new
 * scoring rules triggers a full rescore exactly like a profile.yaml edit.
 */
export const SCORE_VERSION = 1;

export const POINTS = {
  newGradTrue: 25,
  newGradUnknown: 10,
  newGradFalseCap: 20,
  domainPerHit: 3,
  domainMax: 25,
  languageMatch: 5,
  languageOther: -10,
  priorityHigh: 10,
  fresh: 5,
  salary: 3,
} as const;

/** Freshness bonus window (first_seen_at). */
export const FRESH_MS = 24 * 3_600_000;

export type ScorePartKey =
  "location" | "newGrad" | "domains" | "language" | "priority" | "freshness" | "salary";

export interface ScorePart {
  key: ScorePartKey;
  points: number;
  /** Human-readable French detail ("Montréal|Montreal", "fullstack : react (titre), node"). */
  detail: string;
}

export interface NewGradInfo {
  value: boolean | null;
  seniority: Seniority | string | null;
  reason: string;
  source: "rules" | "llm";
  yearsRequired?: number | null;
  visaNotes?: string | null;
  languagesRequired?: string[];
}

export interface ScoreBreakdown {
  v: number;
  total: number;
  /** Sum of the parts before the cap / exclusion. */
  raw: number;
  parts: ScorePart[];
  newGrad: NewGradInfo;
  /** Keywords matched per domain (with " (titre)" for title hits). */
  domains: Record<string, string[]>;
  capped?: string;
  excluded?: string;
}

export interface ScoreInput {
  title: string;
  descriptionText: string | null;
  companyName: string;
  companyPriority: "low" | "normal" | "high" | null;
  city: string | null;
  region: string | null;
  country: string | null;
  remote: "onsite" | "hybrid" | "remote" | "unknown";
  locationRaw: string | null;
  lang: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  firstSeenAt: Date;
}

export interface ScoreResult {
  score: number;
  breakdown: ScoreBreakdown;
  /** Domains the job belongs to (title hit, or >= 2 description keywords). */
  domains: string[];
}

interface CompiledLocation {
  label: string;
  match?: RegExp;
  country?: string;
  remote?: boolean;
  weight: number;
}

interface CompiledDomain {
  name: string;
  keywords: { label: string; re: RegExp }[];
  /** All keywords in one alternation: one scan of the description per domain. */
  any: RegExp;
}

export interface CompiledProfile {
  locations: CompiledLocation[];
  domains: CompiledDomain[];
  languages: Set<string>;
  excludeTitle: RegExp | null;
  excludeCompanies: Set<string>;
  /** Companies of the profile's `priority_companies` (same bonus as a "haute" priority). */
  priorityCompanies: Set<string>;
  targetLevels: Set<string>;
  /** Only "entry" targeted: the original new-grad wording in the breakdown. */
  newGradOnly: boolean;
  requireDomain: boolean | "title";
}

/** Keyword regex with word-ish boundaries (works for "c\+\+" and "next\.js"). */
const bounded = (pattern: string) => `(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`;

function safeRegex(pattern: string, flags: string): RegExp | null {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

export function compileProfile(profile: Profile): CompiledProfile {
  const locations: CompiledLocation[] = profile.locations.map((l) => {
    const parts = [
      l.match,
      l.remote ? "remote" : undefined,
      l.country ? `pays ${l.country.toUpperCase()}` : undefined,
    ];
    return {
      label: parts.filter(Boolean).join(" + "),
      match: l.match ? (safeRegex(stripAccents(l.match), "iu") ?? undefined) : undefined,
      country: l.country ? (countryCode(l.country) ?? l.country.toUpperCase()) : undefined,
      remote: l.remote,
      weight: l.weight,
    };
  });
  const domains = Object.entries(profile.domains).map(([name, kws]) => {
    const keywords = kws
      .map((k) => ({ label: k.replace(/\\/g, ""), re: safeRegex(bounded(k), "iu") }))
      .filter((k): k is { label: string; re: RegExp } => k.re !== null);
    return {
      name,
      keywords,
      any: new RegExp(keywords.map((k) => k.re.source).join("|"), "iu"),
    };
  });
  const excl = profile.exclude_title.filter(Boolean);
  return {
    locations,
    domains,
    languages: new Set(profile.languages.map((l) => l.toLowerCase())),
    excludeTitle: excl.length ? safeRegex(bounded(excl.join("|")), "iu") : null,
    excludeCompanies: new Set(profile.exclude_companies.map(companyKey)),
    priorityCompanies: new Set(profile.priority_companies.map(companyKey)),
    targetLevels: new Set<string>(profile.target_seniority),
    newGradOnly: profile.target_seniority.length === 1 && profile.target_seniority[0] === "entry",
    requireDomain: profile.require_domain,
  };
}

/** A pattern of a profile that is not a valid regular expression; the interface words it. */
export interface ProfileProblem {
  /** Where the pattern sits: the n-th location (from 1), a named domain, or `exclude_title`. */
  where:
    | { field: "locations"; position: number }
    | { field: "domains"; name: string }
    | { field: "exclude_title" };
  pattern: string;
  /** The regex engine's own explanation (English). */
  reason: string;
}

/**
 * Patterns of a profile that are not valid regular expressions. compileProfile skips them
 * silently (a bad keyword must never stop the scoring of everyone); the profile editor refuses
 * them with this list.
 */
export function profileProblems(profile: Profile): ProfileProblem[] {
  const out: ProfileProblem[] = [];
  const check = (where: ProfileProblem["where"], pattern: string, wrap: (p: string) => string) => {
    try {
      // Alone first: an unclosed "[" would swallow the wrapper and look valid.
      new RegExp(pattern, "iu");
      new RegExp(wrap(pattern), "iu");
    } catch (err) {
      const reason =
        err instanceof Error ? err.message.replace(/^Invalid regular expression: /, "") : "";
      out.push({ where, pattern, reason });
    }
  };
  profile.locations.forEach((l, i) => {
    if (l.match) check({ field: "locations", position: i + 1 }, l.match, stripAccents);
  });
  for (const [name, kws] of Object.entries(profile.domains))
    for (const k of kws) check({ field: "domains", name }, k, bounded);
  for (const k of profile.exclude_title) check({ field: "exclude_title" }, k, bounded);
  return out;
}

export const LEVEL_LABELS: Record<string, string> = {
  intern: "stage",
  entry: "junior",
  mid: "intermédiaire",
  senior: "senior",
  manager: "manager",
};

/** The job's level for the profile: "entry" when new grad, null when unknown. */
function jobLevel(newGrad: NewGradInfo): string | null {
  if (newGrad.value === true) return "entry";
  if (newGrad.value === null) return null;
  return newGrad.seniority && newGrad.seniority !== "entry" ? newGrad.seniority : "other";
}

/** Hash of the profile file text and the scoring code version (full rescore when it changes). */
export function profileHash(profileText: string): string {
  return sha256Hex(`score:v${SCORE_VERSION}\n${profileText.replace(/\r\n/g, "\n")}`).slice(0, 16);
}

function locationPart(job: ScoreInput, cp: CompiledProfile): ScorePart {
  const place = stripAccents([job.city, job.region, job.locationRaw].filter(Boolean).join(" | "));
  for (const l of cp.locations) {
    if (l.match && !l.match.test(place)) continue;
    if (l.country && job.country !== l.country) continue;
    if (l.remote && job.remote !== "remote") continue;
    if (!l.match && !l.country && l.remote === undefined) continue;
    return { key: "location", points: l.weight, detail: l.label };
  }
  return { key: "location", points: 0, detail: "aucun lieu du profil" };
}

function domainHits(job: ScoreInput, cp: CompiledProfile) {
  const title = job.title;
  // Long descriptions: the first 20k characters carry the requirements.
  const desc = (job.descriptionText ?? "").slice(0, 20_000);
  const matched: Record<string, string[]> = {};
  const tags: string[] = [];
  let raw = 0;
  let inTitleAny = false;
  for (const d of cp.domains) {
    const inTitle = d.any.test(title);
    const inDesc = desc !== "" && d.any.test(desc);
    if (!inTitle && !inDesc) continue;
    const labels: string[] = [];
    let titleHits = 0;
    let descHits = 0;
    for (const k of d.keywords) {
      const t = inTitle && k.re.test(title);
      const ds = inDesc && k.re.test(desc);
      if (t) titleHits++;
      if (ds) descHits++;
      if (t || ds) labels.push(t ? `${k.label} (titre)` : k.label);
    }
    if (labels.length === 0) continue;
    raw += titleHits * 2 + descHits;
    matched[d.name] = labels;
    if (titleHits > 0 || descHits >= 2) tags.push(d.name);
    if (titleHits > 0) inTitleAny = true;
  }
  return { matched, tags, raw, inTitleAny };
}

export function scoreJob(
  job: ScoreInput,
  newGrad: NewGradInfo,
  cp: CompiledProfile,
  now: Date = new Date(),
): ScoreResult {
  const parts: ScorePart[] = [];
  parts.push(locationPart(job, cp));

  const level = jobLevel(newGrad);
  const onTarget = level !== null && cp.targetLevels.has(level);
  const levelLabel = level === null ? "inconnu" : (LEVEL_LABELS[level] ?? "autre");
  parts.push({
    key: "newGrad",
    points: level === null ? POINTS.newGradUnknown : onTarget ? POINTS.newGradTrue : 0,
    detail: cp.newGradOnly
      ? newGrad.value === true
        ? "new grad"
        : newGrad.value === null
          ? "inconnu"
          : "pas new grad"
      : `niveau ${levelLabel}${level === null ? "" : onTarget ? " (visé)" : " (hors cible)"}`,
  });

  const dom = domainHits(job, cp);
  parts.push({
    key: "domains",
    points: Math.min(POINTS.domainMax, dom.raw * POINTS.domainPerHit),
    detail: Object.keys(dom.matched).length
      ? Object.entries(dom.matched)
          .map(([d, k]) => `${d} : ${k.join(", ")}`)
          .join(" ; ")
      : "aucun domaine",
  });

  const langs = new Set<string>();
  if (job.lang) langs.add(job.lang.toLowerCase());
  for (const l of newGrad.languagesRequired ?? []) langs.add(l.toLowerCase());
  if (langs.size > 0) {
    const other = [...langs].filter((l) => !cp.languages.has(l));
    parts.push(
      other.length
        ? {
            key: "language",
            points: POINTS.languageOther,
            detail: `langue hors profil : ${other.join(", ")}`,
          }
        : { key: "language", points: POINTS.languageMatch, detail: [...langs].join(", ") },
    );
  }

  if (job.companyPriority === "high")
    parts.push({ key: "priority", points: POINTS.priorityHigh, detail: "entreprise prioritaire" });
  else if (cp.priorityCompanies.has(companyKey(job.companyName)))
    parts.push({
      key: "priority",
      points: POINTS.priorityHigh,
      detail: "entreprise prioritaire (profil)",
    });
  if (now.getTime() - job.firstSeenAt.getTime() < FRESH_MS)
    parts.push({ key: "freshness", points: POINTS.fresh, detail: "vue il y a moins de 24 h" });
  if (job.salaryMin != null || job.salaryMax != null)
    parts.push({ key: "salary", points: POINTS.salary, detail: "salaire affiché" });

  const raw = parts.reduce((a, p) => a + p.points, 0);
  let total = Math.max(0, Math.min(100, raw));
  const breakdown: ScoreBreakdown = {
    v: SCORE_VERSION,
    total,
    raw,
    parts,
    newGrad,
    domains: dom.matched,
  };

  const exclTitle = cp.excludeTitle ? job.title.match(cp.excludeTitle) : null;
  if (exclTitle) breakdown.excluded = `titre exclu : « ${exclTitle[0]} »`;
  else if (cp.excludeCompanies.has(companyKey(job.companyName)))
    breakdown.excluded = `entreprise exclue : ${job.companyName}`;

  const cap = POINTS.newGradFalseCap;
  if (breakdown.excluded) total = 0;
  else if (level !== null && !onTarget && total > cap) {
    total = cap;
    breakdown.capped = cp.newGradOnly
      ? `pas new grad : score plafonné à ${cap}`
      : `niveau hors cible (${levelLabel}) : score plafonné à ${cap}`;
  } else if (
    total > cap &&
    ((cp.requireDomain === "title" && !dom.inTitleAny) ||
      (cp.requireDomain === true && dom.tags.length === 0))
  ) {
    total = cap;
    breakdown.capped =
      cp.requireDomain === "title"
        ? `aucun mot-clé du profil dans le titre : score plafonné à ${cap}`
        : `hors des domaines du profil : score plafonné à ${cap}`;
  }
  breakdown.total = total;
  return { score: total, breakdown, domains: dom.tags };
}
