import type { JobStatus } from "./filters";

/**
 * Follow-up rule applied when a status changes:
 * - a number: put the follow-up N days from now, unless one is already set in the future;
 * - null: clear it (the application is over, or back in triage);
 * - "keep": leave it as is.
 */
export function followUpRule(status: JobStatus): number | null | "keep" {
  switch (status) {
    case "applied":
      return 7;
    case "interview":
      return 5;
    case "saved":
      return "keep";
    default:
      return null;
  }
}

/** Next follow-up date for a status change, given the current one (same rule as the SQL upsert). */
export function nextFollowUp(
  status: JobStatus,
  current: Date | null,
  now = new Date(),
): Date | null {
  const rule = followUpRule(status);
  if (rule === "keep") return current;
  if (rule === null) return null;
  if (current && current.getTime() > now.getTime()) return current;
  return new Date(now.getTime() + rule * 86_400_000);
}

/** A follow-up is due once its date is reached (whole day, Toronto clock not needed: date-time compare). */
export function isDue(at: Date | string | null | undefined, now = new Date()): boolean {
  return !!at && new Date(at).getTime() <= now.getTime();
}
