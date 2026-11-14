import "server-only";
import type { ScoreBreakdown } from "@jobradar/core/score";
import { queryRows, sql } from "@jobradar/db";
import { intlTag, type Locale } from "@/i18n/config";
import { getDb } from "./db";
import type { JobStatus } from "./filters";
import { sanitizeHtml, type SafeNode } from "./sanitize";

/** Everything the job page and the Inbox reading pane show, serializable (dates as ISO). */
export interface JobDetail {
  id: number;
  title: string;
  company_name: string;
  company_priority: "low" | "normal" | "high" | null;
  location_raw: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  remote: string;
  employment_type: string | null;
  seniority: string | null;
  is_new_grad: boolean | null;
  salary: string | null;
  posted_at: string | null;
  first_seen_at: string;
  closed_at: string | null;
  url: string;
  apply_url: string | null;
  /** Sanitized description tree (HTML sources), else plain text, else nothing. */
  description: SafeNode[] | null;
  description_text: string | null;
  score: number | null;
  score_breakdown: ScoreBreakdown | null;
  domains: string[];
  status: JobStatus;
  notes: string | null;
  next_action_at: string | null;
  sources: { source: string; url: string; first_seen_at: string; last_seen_at: string }[];
}

interface Row extends Record<string, unknown> {
  id: number;
  title: string;
  company_name: string;
  company_priority: JobDetail["company_priority"];
  location_raw: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  remote: string;
  employment_type: string | null;
  seniority: string | null;
  is_new_grad: boolean | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  posted_at: Date | string | null;
  first_seen_at: Date | string;
  closed_at: Date | string | null;
  url: string;
  apply_url: string | null;
  description_html: string | null;
  description_text: string | null;
  score: number | null;
  score_breakdown: ScoreBreakdown | null;
  domains: string[];
  status: JobStatus | null;
  notes: string | null;
  next_action_at: Date | string | null;
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

function money(n: number, currency: string | null, locale: Locale) {
  try {
    return new Intl.NumberFormat(intlTag(locale), {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n} ${currency ?? ""}`.trim();
  }
}

export function parseJobId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** One job with the given user's score, status, notes and company priority. */
export async function loadJobDetail(
  userId: number,
  id: number,
  locale: Locale,
): Promise<JobDetail | null> {
  const db = getDb();
  const [job] = await queryRows<Row>(
    db,
    sql`
    select j.id, j.title, j.company_name, cp.priority as company_priority, j.location_raw, j.city,
      j.region, j.country, j.remote, j.employment_type, j.seniority, j.is_new_grad,
      j.salary_min, j.salary_max, j.salary_currency, j.posted_at, j.first_seen_at, j.closed_at,
      j.url, j.apply_url, j.description_html,
      case when j.description_html is null then j.description_text end as description_text,
      sc.score, sc.score_breakdown, sc.domains, s.status, s.notes, s.next_action_at
    from jobs j
    left join company_prefs cp on cp.company_id = j.company_id and cp.user_id = ${userId}
    left join job_scores sc on sc.job_id = j.id and sc.user_id = ${userId}
    left join job_status s on s.job_id = j.id and s.user_id = ${userId}
    where j.id = ${id}`,
  );
  if (!job) return null;
  const sources = await queryRows<{
    source: string;
    url: string;
    first_seen_at: Date | string;
    last_seen_at: Date | string;
  }>(
    db,
    sql`select source, url, first_seen_at, last_seen_at from job_sources
        where job_id = ${id} order by first_seen_at`,
  );
  const salary =
    job.salary_min || job.salary_max
      ? [job.salary_min, job.salary_max]
          .filter((n): n is number => n != null)
          .map((n) => money(n, job.salary_currency, locale))
          .join(" – ")
      : null;
  return {
    id: Number(job.id),
    title: job.title,
    company_name: job.company_name,
    company_priority: job.company_priority,
    location_raw: job.location_raw,
    city: job.city,
    region: job.region,
    country: job.country,
    remote: job.remote,
    employment_type: job.employment_type,
    seniority: job.seniority,
    is_new_grad: job.is_new_grad,
    salary,
    posted_at: iso(job.posted_at),
    first_seen_at: iso(job.first_seen_at)!,
    closed_at: iso(job.closed_at),
    url: job.url,
    apply_url: job.apply_url,
    description: job.description_html ? sanitizeHtml(job.description_html) : null,
    description_text: job.description_text,
    score: job.score,
    score_breakdown: job.score_breakdown,
    domains: job.domains ?? [],
    status: job.status ?? "new",
    notes: job.notes,
    next_action_at: iso(job.next_action_at),
    sources: sources.map((s) => ({
      source: s.source,
      url: s.url,
      first_seen_at: iso(s.first_seen_at)!,
      last_seen_at: iso(s.last_seen_at)!,
    })),
  };
}
