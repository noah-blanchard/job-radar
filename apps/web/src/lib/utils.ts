import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TZ = "America/Toronto";

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: TZ,
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** "3 h", "2 j", "5 min": age of a date relative to now. */
export function formatAge(d: Date | string | null | undefined, now: Date = new Date()): string {
  if (!d) return "—";
  const ms = now.getTime() - new Date(d).getTime();
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} j`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-CA", { timeZone: TZ, dateStyle: "medium" }).format(
    new Date(d),
  );
}

const REMOTE_LABEL: Record<string, string> = {
  remote: "télétravail",
  hybrid: "hybride",
  onsite: "sur site",
};

/** "Montréal, CA · hybride". */
export function placeLabel(j: {
  city?: string | null;
  country?: string | null;
  remote?: string | null;
}): string {
  const place = [j.city, j.country].filter(Boolean).join(", ");
  const remote = j.remote ? REMOTE_LABEL[j.remote] : undefined;
  return [place, remote].filter(Boolean).join(" · ") || "—";
}
