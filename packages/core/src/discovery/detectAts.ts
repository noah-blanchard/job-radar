/**
 * ATS detection from a URL (job posting, apply link or careers page). Pure, no network.
 * Returns the connector id and the `ats_key` format that connector expects.
 *
 * Patterns were built from real URLs seen in SimplifyJobs/New-Grad-Positions (2026-11-13).
 */
export interface DetectedAts {
  ats: string;
  atsKey: string;
}

type Matcher = (u: URL, host: string, parts: string[]) => DetectedAts | null;

/** First path segment, decoded, or null when absent / a reserved word. */
function seg(parts: string[], i: number, reserved: readonly string[] = []): string | null {
  const s = parts[i];
  if (!s) return null;
  let v: string;
  try {
    v = decodeURIComponent(s).trim();
  } catch {
    return null;
  }
  if (!v || reserved.includes(v.toLowerCase())) return null;
  return v;
}

/** `{slug}.{suffix}` subdomain, ignoring `www`/reserved names. */
function subdomain(host: string, suffix: string, reserved: readonly string[] = []): string | null {
  if (!host.endsWith(`.${suffix}`)) return null;
  const sub = host.slice(0, -suffix.length - 1);
  if (!sub || sub.includes(".") || sub === "www" || reserved.includes(sub)) return null;
  return sub;
}

const GREENHOUSE_HOSTS = new Set([
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "boards.eu.greenhouse.io",
  "job-boards.eu.greenhouse.io",
]);

const MATCHERS: Matcher[] = [
  // Greenhouse: boards.greenhouse.io/{token}, job-boards(.eu).greenhouse.io/{token},
  // embed: boards.greenhouse.io/embed/job_board?for={token}. EU boards answer on the same API.
  (u, host, parts) => {
    if (!GREENHOUSE_HOSTS.has(host)) return null;
    if (parts[0] === "embed") {
      const t = u.searchParams.get("for");
      return t ? { ats: "greenhouse", atsKey: t.toLowerCase() } : null;
    }
    const t = seg(parts, 0);
    return t ? { ats: "greenhouse", atsKey: t.toLowerCase() } : null;
  },
  // Lever: jobs.lever.co/{slug}, jobs.eu.lever.co/{slug} -> "eu:{slug}".
  (_u, host, parts) => {
    if (host !== "jobs.lever.co" && host !== "jobs.eu.lever.co") return null;
    const s = seg(parts, 0);
    if (!s) return null;
    return { ats: "lever", atsKey: host === "jobs.eu.lever.co" ? `eu:${s}` : s };
  },
  // Ashby: jobs.ashbyhq.com/{org}
  (_u, host, parts) => {
    if (host !== "jobs.ashbyhq.com") return null;
    const s = seg(parts, 0, ["api"]);
    return s ? { ats: "ashby", atsKey: s } : null;
  },
  // Workday: {tenant}.wd{N}.myworkdayjobs.com/[{locale}/]{site}/... -> "tenant/wdN/site".
  (_u, host, parts) => {
    const m = host.match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/);
    if (!m) return null;
    const i = parts[0] && /^[a-z]{2}-[a-z]{2}$/i.test(parts[0]) ? 1 : 0;
    const site = seg(parts, i, ["wday", "job", "jobs"]);
    return site ? { ats: "workday", atsKey: `${m[1]}/${m[2]}/${site}` } : null;
  },
  // SmartRecruiters: jobs.smartrecruiters.com/{id}/..., careers.smartrecruiters.com/{id}
  // (identifiers are case-insensitive).
  (_u, host, parts) => {
    if (host !== "jobs.smartrecruiters.com" && host !== "careers.smartrecruiters.com") return null;
    const s = seg(parts, 0, ["oneclick-ui", "sr-jobs", "api"]);
    return s ? { ats: "smartrecruiters", atsKey: s.toLowerCase() } : null;
  },
  // Workable: apply.workable.com/{account}/...
  (_u, host, parts) => {
    if (host !== "apply.workable.com") return null;
    const s = seg(parts, 0, ["j", "api", "careers"]);
    return s ? { ats: "workable", atsKey: s.toLowerCase() } : null;
  },
  // Recruitee: {slug}.recruitee.com
  (_u, host) => {
    const s = subdomain(host, "recruitee.com", ["app", "api", "careers"]);
    return s ? { ats: "recruitee", atsKey: s } : null;
  },
  // Personio: {slug}.jobs.personio.de / .com
  (_u, host) => {
    const s = subdomain(host, "jobs.personio.de") ?? subdomain(host, "jobs.personio.com");
    return s ? { ats: "personio", atsKey: s } : null;
  },
  // Breezy: {slug}.breezy.hr
  (_u, host) => {
    const s = subdomain(host, "breezy.hr", ["app", "api", "marketplace"]);
    return s ? { ats: "breezy", atsKey: s } : null;
  },
  // BambooHR: {slug}.bamboohr.com/careers|jobs
  (_u, host, parts) => {
    const s = subdomain(host, "bamboohr.com", ["api", "app", "marketplace", "help"]);
    if (!s || !["careers", "jobs"].includes(parts[0] ?? "")) return null;
    return { ats: "bamboohr", atsKey: s };
  },
  // Teamtailor: {slug}.teamtailor.com (the key is the board host).
  (_u, host) => {
    const s = subdomain(host, "teamtailor.com", ["app", "api", "partner"]);
    return s ? { ats: "teamtailor", atsKey: host } : null;
  },
  // Pinpoint: {slug}.pinpointhq.com
  (_u, host) => {
    const s = subdomain(host, "pinpointhq.com", ["app", "api"]);
    return s ? { ats: "pinpoint", atsKey: s } : null;
  },
  // Rippling: ats.rippling.com/{slug}/jobs
  (_u, host, parts) => {
    if (host !== "ats.rippling.com") return null;
    const s = seg(parts, 0, ["api"]);
    return s ? { ats: "rippling", atsKey: s } : null;
  },
  // Oracle Recruiting Cloud: {host}.oraclecloud.com/hcmUI/CandidateExperience/{lang}/sites/{site}
  (_u, host, parts) => {
    if (!host.endsWith(".oraclecloud.com")) return null;
    const i = parts.findIndex((p) => p.toLowerCase() === "sites");
    if (parts[0]?.toLowerCase() !== "hcmui" || i < 0) return null;
    const site = seg(parts, i + 1);
    return site ? { ats: "oracle_rc", atsKey: `${host}/${site}` } : null;
  },
];

/** Detects a supported ATS board from any URL, or null. */
export function detectAts(raw: string | null | undefined): DetectedAts | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  for (const m of MATCHERS) {
    const hit = m(u, host, parts);
    if (hit) return hit;
  }
  return null;
}

/** All URLs (absolute http/https) found in an HTML/text blob, entity-decoded. */
export function extractUrls(html: string | null | undefined): string[] {
  if (!html) return [];
  const decoded = html
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
  const out = new Set<string>();
  for (const m of decoded.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) {
    out.add(m[0].replace(/[.,;:!?]+$/, ""));
  }
  return [...out];
}
