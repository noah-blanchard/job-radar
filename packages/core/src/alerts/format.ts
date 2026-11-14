/** Rendering helpers shared by the digest, instant and test alerts. */

export interface AlertJob {
  id: number;
  title: string;
  company: string;
  city: string | null;
  region: string | null;
  country: string | null;
  locationRaw: string | null;
  remote: string | null;
  score: number;
  isNewGrad: boolean | null;
  firstSeenAt: Date;
  url: string;
  applyUrl: string | null;
}

const TZ = "America/Toronto";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) links end up in an href. */
export function safeUrl(u: string | null | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:" ? p.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const baseUrl = (publicBaseUrl: string) => publicBaseUrl.replace(/\/+$/, "");
export const jobLink = (base: string, id: number) => `${baseUrl(base)}/jobs/${id}`;
export const applyLink = (j: AlertJob) => safeUrl(j.applyUrl) ?? safeUrl(j.url);

const regionNames = new Intl.DisplayNames(["fr"], { type: "region" });

export function countryName(code: string | null): string {
  if (!code) return "Pays inconnu";
  try {
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function place(j: AlertJob): string {
  const parts = [j.city, j.region].filter(Boolean).join(", ");
  const where = parts || j.locationRaw || countryName(j.country);
  return j.remote === "remote" && !/remote|télétravail/i.test(where) ? `${where} (remote)` : where;
}

/** "3 h", "45 min", "2 j" since first seen. */
export function age(from: Date, now: Date): string {
  const min = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} j`;
}

export function formatDay(d: Date): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

export function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** One push line: "82 · Software Engineer, New Grad · Stripe · Toronto, ON". */
export function pushLine(j: AlertJob): string {
  return `${j.score} · ${j.title} · ${j.company} · ${place(j)}`;
}

export interface CountryGroup {
  country: string | null;
  name: string;
  jobs: AlertJob[];
}

/** Groups by country, best group first (highest score, then size). Jobs keep their order. */
export function groupByCountry(jobs: readonly AlertJob[]): CountryGroup[] {
  const map = new Map<string, CountryGroup>();
  for (const j of jobs) {
    const k = j.country ?? "";
    let g = map.get(k);
    if (!g) {
      g = { country: j.country, name: countryName(j.country), jobs: [] };
      map.set(k, g);
    }
    g.jobs.push(j);
  }
  return [...map.values()].sort(
    (a, b) =>
      (b.jobs[0]?.score ?? 0) - (a.jobs[0]?.score ?? 0) ||
      b.jobs.length - a.jobs.length ||
      a.name.localeCompare(b.name),
  );
}
