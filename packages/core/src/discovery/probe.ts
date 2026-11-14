import type { HttpClient } from "../http/types";
import { detectAts, type DetectedAts } from "./detectAts";

/**
 * `detect-ats <careers-url>`: no HTML scraping. First the URL itself (detectAts); otherwise the
 * public board APIs (the same endpoints the connectors use, all verified 2026-11-13) are probed
 * with slugs derived from the domain name.
 */

export interface ProbeHit extends DetectedAts {
  jobs: number;
  /** Company name when the API returns one. */
  name?: string;
}

type Probe = (http: HttpClient, slug: string) => Promise<ProbeHit | null>;

const len = (x: unknown) => (Array.isArray(x) ? x.length : 0);

async function getJson(http: HttpClient, url: string): Promise<unknown> {
  const r = await http.json(url);
  return r.notModified ? undefined : r.data;
}

const PROBES: Record<string, Probe> = {
  greenhouse: async (http, s) => {
    const d = (await getJson(http, `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`)) as
      { jobs?: unknown[] } | undefined;
    return d?.jobs ? { ats: "greenhouse", atsKey: s, jobs: len(d.jobs) } : null;
  },
  lever: async (http, s) => {
    const d = await getJson(http, `https://api.lever.co/v0/postings/${s}?mode=json`);
    return Array.isArray(d) ? { ats: "lever", atsKey: s, jobs: d.length } : null;
  },
  ashby: async (http, s) => {
    const d = (await getJson(http, `https://api.ashbyhq.com/posting-api/job-board/${s}`)) as
      { jobs?: unknown[] } | undefined;
    return d?.jobs ? { ats: "ashby", atsKey: s, jobs: len(d.jobs) } : null;
  },
  smartrecruiters: async (http, s) => {
    const d = (await getJson(
      http,
      `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=1`,
    )) as { totalFound?: number } | undefined;
    return d && typeof d.totalFound === "number"
      ? { ats: "smartrecruiters", atsKey: s, jobs: d.totalFound }
      : null;
  },
  workable: async (http, s) => {
    const d = (await getJson(http, `https://apply.workable.com/api/v1/widget/accounts/${s}`)) as
      { name?: string; jobs?: unknown[] } | undefined;
    return d?.jobs ? { ats: "workable", atsKey: s, jobs: len(d.jobs), name: d.name } : null;
  },
  recruitee: async (http, s) => {
    const d = (await getJson(http, `https://${s}.recruitee.com/api/offers/`)) as
      { offers?: unknown[] } | undefined;
    return d?.offers ? { ats: "recruitee", atsKey: s, jobs: len(d.offers) } : null;
  },
  breezy: async (http, s) => {
    const d = await getJson(http, `https://${s}.breezy.hr/json`);
    return Array.isArray(d) ? { ats: "breezy", atsKey: s, jobs: d.length } : null;
  },
  bamboohr: async (http, s) => {
    const d = (await getJson(http, `https://${s}.bamboohr.com/careers/list`)) as
      { result?: unknown[] } | undefined;
    return d?.result ? { ats: "bamboohr", atsKey: s, jobs: len(d.result) } : null;
  },
  personio: async (http, s) => {
    const r = await http.text(`https://${s}.jobs.personio.de/xml`);
    if (r.notModified || !r.data.includes("<workzag-jobs")) return null;
    return { ats: "personio", atsKey: s, jobs: (r.data.match(/<position>/g) ?? []).length };
  },
  pinpoint: async (http, s) => {
    const d = (await getJson(http, `https://${s}.pinpointhq.com/postings.json`)) as
      { data?: unknown[] } | undefined;
    return d?.data ? { ats: "pinpoint", atsKey: s, jobs: len(d.data) } : null;
  },
  rippling: async (http, s) => {
    const d = await getJson(http, `https://api.rippling.com/platform/api/ats/v1/board/${s}/jobs`);
    return Array.isArray(d) ? { ats: "rippling", atsKey: s, jobs: d.length } : null;
  },
};

export const PROBED_ATS = Object.keys(PROBES);

const GENERIC_LABELS = new Set([
  "www",
  "careers",
  "career",
  "jobs",
  "job",
  "apply",
  "join",
  "work",
]);

/** "careers.stripe.com" -> ["stripe"]; "www.native-instruments.com" -> ["native-instruments", "nativeinstruments"]. */
export function slugCandidates(url: string): string[] {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return [];
  }
  const labels = host.split(".").filter((l) => !GENERIC_LABELS.has(l));
  // Drop the TLD (and a second-level TLD like co.uk / com.au).
  labels.pop();
  if (labels.length > 1 && ["co", "com", "org", "gov", "ac"].includes(labels.at(-1)!)) labels.pop();
  const base = labels.at(-1);
  if (!base) return [];
  return [...new Set([base, base.replace(/-/g, "")])];
}

export interface ProbeResult {
  /** Board found in the URL itself (no network call). */
  detected: DetectedAts | null;
  /** Boards that answered with a job list. */
  hits: ProbeHit[];
}

export async function probeCareersUrl(http: HttpClient, url: string): Promise<ProbeResult> {
  const detected = detectAts(url);
  if (detected) return { detected, hits: [] };
  const hits: ProbeHit[] = [];
  for (const slug of slugCandidates(url)) {
    const results = await Promise.all(
      Object.values(PROBES).map((p) => p(http, encodeURIComponent(slug)).catch(() => null)),
    );
    for (const r of results) if (r && r.jobs > 0) hits.push(r);
  }
  return { detected: null, hits };
}
