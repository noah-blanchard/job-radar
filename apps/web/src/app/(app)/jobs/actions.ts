"use server";

import { jobStatus, sql } from "@jobradar/db";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { STATUSES, type JobStatus } from "@/lib/filters";
import { followUpRule } from "@/lib/follow-up";

function validId(id: unknown): number | null {
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export interface StatusResult {
  ok: boolean;
  error?: string;
  /** Follow-up date after the change (ISO), so the client can show it without a refetch. */
  nextActionAt?: string | null;
}

/**
 * Sets the status of a job (Inbox shortcuts, job page, pipeline). Also maintains the follow-up
 * date: +7 d on applied, +5 d on interview (unless one is already set in the future), cleared on
 * rejected / ignored / new, kept on saved. See `followUpRule`.
 */
export async function setJobStatus(jobId: number, status: JobStatus): Promise<StatusResult> {
  const id = validId(jobId);
  if (id === null || !STATUSES.includes(status)) return { ok: false, error: "requête invalide" };
  const user = await currentUser();
  const rule = followUpRule(status);
  const fresh = typeof rule === "number" ? sql`now() + make_interval(days => ${rule})` : sql`null`;
  const next =
    rule === "keep"
      ? sql`job_status.next_action_at`
      : rule === null
        ? sql`null`
        : sql`case when job_status.next_action_at > now() then job_status.next_action_at else ${fresh} end`;
  const [row] = await getDb()
    .insert(jobStatus)
    .values({
      userId: user.id,
      jobId: id,
      status,
      nextActionAt: rule === "keep" || rule === null ? null : fresh,
    })
    .onConflictDoUpdate({
      target: [jobStatus.userId, jobStatus.jobId],
      set: { status, nextActionAt: next, updatedAt: sql`now()` },
    })
    .returning({ nextActionAt: jobStatus.nextActionAt });
  // No revalidatePath: every page is dynamic (fresh on navigation), and revalidating here would
  // re-render the Inbox under the user's keystrokes.
  return { ok: true, nextActionAt: row?.nextActionAt ? row.nextActionAt.toISOString() : null };
}

/** Sets (or clears, with null) the follow-up date of a job. */
export async function setNextAction(jobId: number, at: string | null): Promise<StatusResult> {
  const id = validId(jobId);
  const date = at === null ? null : new Date(at);
  if (id === null || (date && Number.isNaN(date.getTime())))
    return { ok: false, error: "requête invalide" };
  const user = await currentUser();
  await getDb()
    .insert(jobStatus)
    .values({ userId: user.id, jobId: id, nextActionAt: date })
    .onConflictDoUpdate({
      target: [jobStatus.userId, jobStatus.jobId],
      set: { nextActionAt: date, updatedAt: sql`now()` },
    });
  return { ok: true, nextActionAt: date ? date.toISOString() : null };
}

/** Saves the notes of a job (autosaved from the job page and the reading pane). */
export async function saveNotes(
  jobId: number,
  notes: string,
): Promise<{ ok: boolean; error?: string }> {
  const id = validId(jobId);
  if (id === null) return { ok: false, error: "requête invalide" };
  const text = String(notes ?? "").slice(0, 20_000);
  const user = await currentUser();
  await getDb()
    .insert(jobStatus)
    .values({ userId: user.id, jobId: id, notes: text })
    .onConflictDoUpdate({
      target: [jobStatus.userId, jobStatus.jobId],
      set: { notes: text, updatedAt: sql`now()` },
    });
  return { ok: true };
}
