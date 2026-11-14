import { intlTag, type Locale } from "./config";
import type { T } from "./messages";

const TZ = "America/Toronto";

type When = Date | string | null | undefined;

/** Raw SQL (db.execute) returns timestamps as strings with postgres-js: accept both. */
function toDate(d: When): Date | null {
  if (!d) return null;
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Calendar day key in Toronto ("2026-11-14"), for day-level comparisons. */
export function dayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/**
 * Dates, durations, numbers and places in the interface language. Times are always shown in
 * Toronto time; the unit words come from `format.*` in the dictionaries.
 */
export function createFormat(locale: Locale, t: T) {
  const tag = intlTag(locale);
  const dateTimeFmt = new Intl.DateTimeFormat(tag, {
    timeZone: TZ,
    dateStyle: "short",
    timeStyle: "short",
  });
  const dateFmt = new Intl.DateTimeFormat(tag, { timeZone: TZ, dateStyle: "medium" });
  const weekdayFmt = new Intl.DateTimeFormat(tag, {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  // A day key is already a Toronto calendar day: format it as is, without shifting it again.
  const dayFmt = new Intl.DateTimeFormat(tag, { timeZone: "UTC", day: "numeric", month: "short" });
  const numberFmt = new Intl.NumberFormat(tag);
  const percentFmt = new Intl.NumberFormat(tag, { style: "percent" });
  const remote: Record<string, string> = {
    remote: t("format.remote.remote"),
    hybrid: t("format.remote.hybrid"),
    onsite: t("format.remote.onsite"),
  };

  return {
    locale,
    number: (n: number) => numberFmt.format(n),

    /** 0.42 -> "42 %" (fr) or "42%" (en). */
    percent: (ratio: number) => percentFmt.format(ratio),

    /** A Toronto day key ("2026-11-14", see dayKey) as "14 nov." or "Nov 14". */
    day: (key: string) => dayFmt.format(new Date(`${key}T00:00:00Z`)),

    dateTime(d: When): string {
      const date = toDate(d);
      return date ? dateTimeFmt.format(date) : "—";
    },

    date(d: When): string {
      const date = toDate(d);
      return date ? dateFmt.format(date) : "—";
    },

    duration(ms: number | null | undefined): string {
      if (ms == null) return "—";
      if (ms < 1000) return t("format.ms", { n: ms });
      const s = Math.round(ms / 1000);
      return s < 60
        ? t("format.seconds", { n: s })
        : t("format.minutesSeconds", { m: Math.floor(s / 60), s: s % 60 });
    },

    /** "3 h", "2 d", "5 min": age of a date relative to now. */
    age(d: When, now: Date = new Date()): string {
      const date = toDate(d);
      if (!date) return "—";
      const ms = now.getTime() - date.getTime();
      const min = Math.max(0, Math.round(ms / 60_000));
      if (min < 60) return t("format.minutes", { n: min });
      const h = Math.round(min / 60);
      if (h < 48) return t("format.hours", { n: h });
      return t("format.days", { n: Math.round(h / 24) });
    },

    /** Follow-up date in words: "today", "tomorrow", "yesterday", "3 d ago", "Thu, Nov 19". */
    dueDate(d: When, now: Date = new Date()): string {
      const date = toDate(d);
      if (!date) return "—";
      const days = Math.round((Date.parse(dayKey(date)) - Date.parse(dayKey(now))) / 86_400_000);
      if (days === 0) return t("format.today");
      if (days === 1) return t("format.tomorrow");
      if (days === -1) return t("format.yesterday");
      if (days < 0) return t("format.daysAgo", { n: -days });
      return weekdayFmt.format(date);
    },

    /** "Montréal, CA · hybrid". */
    place(j: { city?: string | null; country?: string | null; remote?: string | null }): string {
      const place = [j.city, j.country].filter(Boolean).join(", ");
      const mode = j.remote ? remote[j.remote] : undefined;
      return [place, mode].filter(Boolean).join(" · ") || "—";
    },
  };
}

export type Format = ReturnType<typeof createFormat>;
