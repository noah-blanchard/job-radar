import { and, eq, jobs, jobSources, sql, type AnyDb } from "@jobradar/db";
import type { RawJob } from "../connectors/types";
import { htmlToText } from "../normalize/html";
import { fingerprintPlace, parseLocation } from "../normalize/location";
import { canonicalUrl, detectLang, fingerprint } from "../normalize/text";

export interface NormalizedJob {
  fingerprint: string;
  canonicalUrl: string | null;
  values: typeof jobs.$inferInsert;
}

/** RawJob -> row values (location parsing, text extraction, fingerprint). Pure. */
export function normalizeJob(raw: RawJob, companyId: number | null, seenAt: Date): NormalizedJob {
  const loc = parseLocation(raw.locationRaw, { country: raw.countryHint, remote: raw.remoteHint });
  const descriptionText = raw.descriptionText?.trim() || htmlToText(raw.descriptionHtml) || null;
  const fp = fingerprint(raw.companyName, raw.title, fingerprintPlace(loc));
  const canon = canonicalUrl(raw.url);
  return {
    fingerprint: fp,
    canonicalUrl: canon,
    values: {
      fingerprint: fp,
      canonicalUrl: canon,
      source: raw.source,
      sourceJobId: raw.sourceJobId,
      companyId,
      companyName: raw.companyName,
      title: raw.title,
      locationRaw: raw.locationRaw ?? null,
      city: loc.city,
      region: loc.region,
      country: loc.country,
      remote: loc.remote,
      employmentType: raw.employmentType ?? null,
      salaryMin: raw.salaryMin != null ? Math.round(raw.salaryMin) : null,
      salaryMax: raw.salaryMax != null ? Math.round(raw.salaryMax) : null,
      salaryCurrency: raw.salaryCurrency ?? null,
      postedAt: raw.postedAt && !Number.isNaN(raw.postedAt.getTime()) ? raw.postedAt : null,
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
      url: raw.url,
      applyUrl: raw.applyUrl ?? null,
      descriptionHtml: raw.descriptionHtml ?? null,
      descriptionText,
      lang: detectLang(descriptionText),
    },
  };
}

/** Marks an existing job as seen (reopens it if it had been closed). */
async function touchJob(db: AnyDb, jobId: number, n: NormalizedJob, seenAt: Date) {
  await db
    .update(jobs)
    .set({
      lastSeenAt: seenAt,
      closedAt: null,
      missedRuns: 0,
      // Fill the description when an earlier sighting had none (e.g. list-only pass).
      descriptionHtml: sql`coalesce(${jobs.descriptionHtml}, ${n.values.descriptionHtml})`,
      descriptionText: sql`coalesce(${jobs.descriptionText}, ${n.values.descriptionText})`,
      lang: sql`coalesce(${jobs.lang}, ${n.values.lang})`,
    })
    .where(eq(jobs.id, jobId));
}

export interface IngestResult {
  jobId: number;
  isNew: boolean;
}

/**
 * Upserts one job. Matching order: (source, source_job_id) -> canonical URL -> fingerprint.
 * A job seen on several sources is one `jobs` row with several `job_sources` rows.
 */
export async function ingestJob(
  db: AnyDb,
  raw: RawJob,
  companyId: number | null,
  seenAt: Date,
): Promise<IngestResult> {
  const n = normalizeJob(raw, companyId, seenAt);

  const [linked] = await db
    .select({ jobId: jobSources.jobId })
    .from(jobSources)
    .where(and(eq(jobSources.source, raw.source), eq(jobSources.sourceJobId, raw.sourceJobId)))
    .limit(1);
  if (linked) {
    await touchJob(db, linked.jobId, n, seenAt);
    await db
      .update(jobSources)
      .set({ lastSeenAt: seenAt, url: raw.url })
      .where(and(eq(jobSources.source, raw.source), eq(jobSources.sourceJobId, raw.sourceJobId)));
    return { jobId: linked.jobId, isNew: false };
  }

  let jobId: number | undefined;
  let isNew = false;
  if (n.canonicalUrl) {
    const [byUrl] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.canonicalUrl, n.canonicalUrl))
      .limit(1);
    if (byUrl) {
      jobId = byUrl.id;
      await touchJob(db, jobId, n, seenAt);
    }
  }
  if (jobId === undefined) {
    const [row] = await db
      .insert(jobs)
      .values(n.values)
      .onConflictDoUpdate({
        target: jobs.fingerprint,
        set: { lastSeenAt: seenAt, closedAt: null, missedRuns: 0 },
      })
      .returning({ id: jobs.id, inserted: sql<boolean>`(xmax = 0)` });
    jobId = row!.id;
    isNew = row!.inserted;
  }

  await db
    .insert(jobSources)
    .values({
      jobId,
      source: raw.source,
      sourceJobId: raw.sourceJobId,
      url: raw.url,
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
    })
    .onConflictDoUpdate({
      target: [jobSources.source, jobSources.sourceJobId],
      set: { lastSeenAt: seenAt },
    });
  return { jobId, isNew };
}
