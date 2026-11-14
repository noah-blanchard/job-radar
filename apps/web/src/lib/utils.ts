import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TZ = "America/Toronto";

/** Raw SQL (db.execute) returns timestamps as strings with postgres-js: accept both. */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: TZ,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
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
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-CA", { timeZone: TZ, dateStyle: "medium" }).format(date);
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

/** True when a key event comes from a text field (shortcuts must not fire while typing). */
export function isTyping(el: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** Calendar day key in Toronto ("2026-11-14"), for day-level comparisons. */
function dayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/** Follow-up date in words: "aujourd'hui", "demain", "hier", "il y a 3 j", "jeu. 19 nov.". */
export function formatDueDate(d: Date | string | null | undefined, now: Date = new Date()): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const days = Math.round((Date.parse(dayKey(date)) - Date.parse(dayKey(now))) / 86_400_000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days === -1) return "hier";
  if (days < 0) return `il y a ${-days} j`;
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

/** `<input type="date">` value (Toronto day) for a date, and back to an ISO instant at 9:00. */
export function toDateInput(d: Date | string | null | undefined): string {
  return d ? dayKey(new Date(d)) : "";
}
export function fromDateInput(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  // 9:00 Toronto, either offset: good enough for a day-level reminder.
  const guess = new Date(`${v}T09:00:00-05:00`);
  return guess.toISOString();
}
