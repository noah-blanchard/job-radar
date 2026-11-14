"use server";

import { jobStatus, sql } from "@jobradar/db";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { STATUSES, type JobStatus } from "@/lib/filters";

function validId(id: unknown): number | null {
  const n = Number(id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Sets the status of a job (Inbox shortcuts s/a/x, job page, pipeline). */
export async function setJobStatus(
  jobId: number,
  status: JobStatus,
): Promise<{ ok: boolean; error?: string }> {
  const id = validId(jobId);
  if (id === null || !STATUSES.includes(status)) return { ok: false, error: "requête invalide" };
  await getDb()
    .insert(jobStatus)
    .values({ jobId: id, status })
    .onConflictDoUpdate({ target: jobStatus.jobId, set: { status, updatedAt: sql`now()` } });
  revalidatePath("/pipeline");
  revalidatePath(`/jobs/${id}`);
  return { ok: true };
}

export interface NotesState {
  ok?: string;
  error?: string;
}

/** Saves the notes of a job (job page form). */
export async function saveNotes(_prev: NotesState, form: FormData): Promise<NotesState> {
  const id = validId(form.get("jobId"));
  if (id === null) return { error: "requête invalide" };
  const notes = String(form.get("notes") ?? "").slice(0, 20_000);
  await getDb()
    .insert(jobStatus)
    .values({ jobId: id, notes })
    .onConflictDoUpdate({ target: jobStatus.jobId, set: { notes, updatedAt: sql`now()` } });
  revalidatePath(`/jobs/${id}`);
  return { ok: "Notes enregistrées." };
}
