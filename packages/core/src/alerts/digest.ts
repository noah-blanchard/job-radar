import {
  alertsSent,
  and,
  apiUsage,
  companies,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  jobs,
  jobScores,
  jobStatus,
  lt,
  sql,
  type AnyDb,
  type SQL,
} from "@jobradar/db";
import { torontoDay } from "../pipeline/quota";
import type { AlertMessage } from "./channels";
import { sendOnce, type AlertDeps, type ChannelResult } from "./dispatch";
import {
  age,
  applyLink,
  baseUrl,
  escapeHtml,
  formatDay,
  groupByCountry,
  jobLink,
  place,
  pushLine,
  type AlertJob,
} from "./format";

/** E-mail size guards: the first digest after a big discovery can match thousands of jobs. */
export const DIGEST_MAX_PER_COUNTRY = 25;
export const DIGEST_MAX_JOBS = 150;
const PUSH_TOP = 5;

/**
 * Open jobs worth alerting for one user: new grad or unknown (never `false`), not ignored in
 * their dashboard. Sorted by their score, then freshness.
 */
export async function selectAlertJobs(
  db: AnyDb,
  userId: number,
  where: SQL | undefined,
  limit: number,
): Promise<AlertJob[]> {
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: jobs.companyName,
      city: jobs.city,
      region: jobs.region,
      country: jobs.country,
      locationRaw: jobs.locationRaw,
      remote: jobs.remote,
      score: sql<number>`${jobScores.score}::int`,
      isNewGrad: jobs.isNewGrad,
      firstSeenAt: jobs.firstSeenAt,
      url: jobs.url,
      applyUrl: jobs.applyUrl,
    })
    .from(jobs)
    .innerJoin(jobScores, and(eq(jobScores.jobId, jobs.id), eq(jobScores.userId, userId)))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobStatus, and(eq(jobStatus.jobId, jobs.id), eq(jobStatus.userId, userId)))
    .where(
      and(
        isNull(jobs.closedAt),
        sql`${jobs.isNewGrad} is distinct from false`,
        sql`${jobStatus.status} is distinct from 'ignored'`,
        where,
      ),
    )
    .orderBy(desc(jobScores.score), desc(jobs.firstSeenAt), desc(jobs.id))
    .limit(limit);
}

export interface DigestWindow {
  since: Date;
  until: Date;
  minScore: number;
}

const digestWhere = (w: DigestWindow) =>
  and(
    gte(jobs.firstSeenAt, w.since),
    lt(jobs.firstSeenAt, w.until),
    gte(jobScores.score, w.minScore),
  );

export async function selectDigest(
  db: AnyDb,
  userId: number,
  w: DigestWindow,
): Promise<{ total: number; jobs: AlertJob[] }> {
  // Fetch more than shown so the per-country cap still leaves every country represented.
  const list = await selectAlertJobs(db, userId, digestWhere(w), 2000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .innerJoin(jobScores, and(eq(jobScores.jobId, jobs.id), eq(jobScores.userId, userId)))
    .leftJoin(jobStatus, and(eq(jobStatus.jobId, jobs.id), eq(jobStatus.userId, userId)))
    .where(
      and(
        isNull(jobs.closedAt),
        sql`${jobs.isNewGrad} is distinct from false`,
        sql`${jobStatus.status} is distinct from 'ignored'`,
        digestWhere(w),
      ),
    );
  return { total: Number(row?.n ?? 0), jobs: list };
}

export interface QuotaNote {
  source: string;
  day: string;
  calls: number;
  max: number;
}

/** Sources that used their whole daily quota on one of the given Toronto days. */
export async function exhaustedQuotas(
  db: AnyDb,
  days: string[],
  quotas: Record<string, number>,
): Promise<QuotaNote[]> {
  const sources = Object.keys(quotas);
  if (sources.length === 0 || days.length === 0) return [];
  const rows = await db
    .select()
    .from(apiUsage)
    .where(and(inArray(apiUsage.source, sources), inArray(apiUsage.day, days)));
  return rows
    .filter((r) => (quotas[r.source] ?? Infinity) > 0 && r.calls >= (quotas[r.source] ?? Infinity))
    .map((r) => ({ source: r.source, day: r.day, calls: r.calls, max: quotas[r.source] ?? 0 }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.source.localeCompare(b.source));
}

export interface DigestContent {
  jobs: AlertJob[];
  total: number;
  window: DigestWindow;
  publicBaseUrl: string;
  quotas?: QuotaNote[];
  now: Date;
  /** Test button: same content, flagged in the subject and the push. */
  test?: boolean;
}

/** Inbox filtered like the digest (24 h, min score). */
export const digestDashboardUrl = (base: string, minScore: number) =>
  `${baseUrl(base)}/?since=24h${minScore > 0 ? `&min=${minScore}` : ""}`;

/** Caps the list: at most DIGEST_MAX_PER_COUNTRY per country and DIGEST_MAX_JOBS overall. */
function capped(jobs: AlertJob[]) {
  let left = DIGEST_MAX_JOBS;
  return groupByCountry(jobs).map((g) => {
    const shown = g.jobs.slice(0, Math.max(0, Math.min(DIGEST_MAX_PER_COUNTRY, left)));
    left -= shown.length;
    return { ...g, shown, hidden: g.jobs.length - shown.length };
  });
}

export function buildDigestMessage(c: DigestContent): AlertMessage {
  const { total, window: w, now } = c;
  const prefix = c.test ? "[TEST] " : "";
  const dashboard = digestDashboardUrl(c.publicBaseUrl, w.minScore);
  const day = formatDay(w.until);
  const headline =
    total === 0
      ? `Aucune nouvelle offre (score ≥ ${w.minScore}) sur 24 h`
      : `${total} nouvelle${total > 1 ? "s" : ""} offre${total > 1 ? "s" : ""} (score ≥ ${w.minScore}) sur 24 h`;
  const quotaLine =
    c.quotas && c.quotas.length > 0
      ? `Quotas épuisés : ${c.quotas.map((q) => `${q.source} ${q.calls}/${q.max} (${q.day})`).join(", ")}`
      : undefined;

  // ---- push: top 5 + count ----
  const top = c.jobs
    .slice(0, PUSH_TOP)
    .map((j) => `${pushLine(j)}\n${jobLink(c.publicBaseUrl, j.id)}`);
  const pushText = [
    headline,
    ...top,
    total > top.length ? `+ ${total - top.length} autres : ${dashboard}` : undefined,
    quotaLine,
  ]
    .filter(Boolean)
    .join("\n");

  // ---- e-mail ----
  const groups = capped(c.jobs);
  const textLines: string[] = [`${prefix}JobRadar, digest du ${day}`, headline, ""];
  const html: string[] = [];
  const td = 'style="padding:6px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top"';
  for (const g of groups) {
    if (g.shown.length === 0) continue;
    textLines.push(`== ${g.name} (${g.jobs.length}) ==`);
    html.push(
      `<h2 style="font-size:15px;margin:20px 0 6px">${escapeHtml(g.name)} <span style="color:#6b7280;font-weight:normal">(${g.jobs.length})</span></h2>`,
      '<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:13px">',
    );
    for (const j of g.shown) {
      const apply = applyLink(j);
      const dash = jobLink(c.publicBaseUrl, j.id);
      textLines.push(
        `${j.score}  ${j.title} | ${j.company} | ${place(j)} | il y a ${age(j.firstSeenAt, now)}`,
        `    fiche : ${dash}${apply ? `\n    postuler : ${apply}` : ""}`,
      );
      const scoreColor = j.score >= 75 ? "#15803d" : j.score >= 50 ? "#1d4ed8" : "#374151";
      html.push(
        "<tr>",
        `<td ${td} width="36"><b style="color:${scoreColor}">${j.score}</b></td>`,
        `<td ${td}><a href="${escapeHtml(dash)}" style="color:#111827;font-weight:600;text-decoration:none">${escapeHtml(j.title)}</a>` +
          `${j.isNewGrad === null ? ' <span style="color:#6b7280">(new grad ?)</span>' : ""}<br>` +
          `<span style="color:#4b5563">${escapeHtml(j.company)} · ${escapeHtml(place(j))} · il y a ${age(j.firstSeenAt, now)}</span></td>`,
        `<td ${td} width="70" align="right">${apply ? `<a href="${escapeHtml(apply)}" style="color:#1d4ed8">postuler</a>` : ""}</td>`,
        "</tr>",
      );
    }
    html.push("</table>");
    if (g.hidden > 0) {
      textLines.push(`    + ${g.hidden} autres`);
      html.push(`<p style="color:#6b7280;font-size:12px;margin:4px 0">+ ${g.hidden} autres</p>`);
    }
    textLines.push("");
  }
  const shownCount = groups.reduce((a, g) => a + g.shown.length, 0);
  if (total > shownCount) textLines.push(`Toutes les offres : ${dashboard}`);
  if (quotaLine) textLines.push("", quotaLine);

  const htmlBody = [
    '<!doctype html><html><body style="margin:0;padding:16px;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">',
    '<div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px">',
    c.test
      ? '<p style="background:#fef3c7;padding:6px 10px;border-radius:4px;font-size:12px;margin:0 0 12px">Message de test envoyé depuis /settings : rien n\'est enregistré comme envoyé.</p>'
      : "",
    `<h1 style="font-size:18px;margin:0 0 4px">JobRadar · ${escapeHtml(day)}</h1>`,
    `<p style="margin:0 0 8px;color:#374151">${escapeHtml(headline)}. <a href="${escapeHtml(dashboard)}" style="color:#1d4ed8">Ouvrir le dashboard</a></p>`,
    ...html,
    total > shownCount
      ? `<p style="margin:16px 0 0"><a href="${escapeHtml(dashboard)}" style="color:#1d4ed8">Voir les ${total} offres dans le dashboard</a></p>`
      : "",
    quotaLine
      ? `<p style="margin:16px 0 0;color:#92400e;font-size:12px">${escapeHtml(quotaLine)}</p>`
      : "",
    "</div></body></html>",
  ].join("\n");

  return {
    kind: c.test ? "test" : "digest",
    title: `${prefix}JobRadar : ${total} nouvelle${total > 1 ? "s" : ""} offre${total > 1 ? "s" : ""}`,
    text: pushText,
    url: dashboard,
    priority: "default",
    tags: c.test ? ["test_tube"] : ["briefcase"],
    email: {
      subject: `${prefix}JobRadar · ${day} · ${total} nouvelle${total > 1 ? "s" : ""} offre${total > 1 ? "s" : ""}`,
      text: textLines.join("\n"),
      html: htmlBody,
    },
  };
}

export interface DigestOptions {
  /** Scheduled time of this digest (DIGEST_CRON): window = [anchor − 24 h, anchor). */
  anchor: Date;
  minScore: number;
  publicBaseUrl: string;
  /** Daily quota per source id, to report exhausted quotas in the digest. */
  quotas?: Record<string, number>;
}

export async function loadDigest(deps: Pick<AlertDeps, "db" | "now" | "userId">, o: DigestOptions) {
  const window: DigestWindow = {
    since: new Date(o.anchor.getTime() - 24 * 3_600_000),
    until: o.anchor,
    minScore: o.minScore,
  };
  const { total, jobs: list } = await selectDigest(deps.db, deps.userId, window);
  const days = [...new Set([torontoDay(window.since), torontoDay(window.until)])];
  const quotas = await exhaustedQuotas(deps.db, days, o.quotas ?? {});
  return { jobs: list, total, window, quotas, publicBaseUrl: o.publicBaseUrl };
}

/**
 * Daily digest, idempotent per channel: dedup key `digest:<anchor ISO>`. Calling it again for
 * the same anchor (second run, catch-up after a restart, retry after a failure) sends nothing
 * on the channels that already got it.
 */
export async function runDigest(deps: AlertDeps, o: DigestOptions): Promise<ChannelResult[]> {
  const now = (deps.now ?? (() => new Date()))();
  const key = digestKey(o.anchor);
  // Cheap check first: catch-up calls every few minutes must not rerun the digest query.
  const done = await deps.db
    .select({ channel: alertsSent.channel })
    .from(alertsSent)
    .where(and(eq(alertsSent.kind, "digest"), eq(alertsSent.dedupKey, key)));
  const doneSet = new Set(done.map((d) => d.channel));
  if (deps.channels.every((c) => doneSet.has(c.id)))
    return deps.channels.map((c) => ({ channel: c.id, sent: 0, ok: true }));

  const content = await loadDigest(deps, o);
  return sendOnce(deps, "digest", [{ key }], () => buildDigestMessage({ ...content, now }));
}

export const digestKey = (anchor: Date) => `digest:${anchor.toISOString()}`;
