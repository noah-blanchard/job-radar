/**
 * Inbox filters <-> URL search params. Shared by the server page (query) and the client filter
 * bar (URL updates): every filter lives in the URL.
 */

export const STATUSES = ["new", "saved", "applied", "interview", "rejected", "ignored"] as const;
export type JobStatus = (typeof STATUSES)[number];
export const PIPELINE_STATUSES = ["saved", "applied", "interview", "rejected"] as const;

export const STATUS_LABEL: Record<JobStatus, string> = {
  new: "nouvelle",
  saved: "sauvegardée",
  applied: "postulé",
  interview: "entretien",
  rejected: "refusée",
  ignored: "ignorée",
};

export const SINCE = { "24h": 24, "3d": 72, "7d": 168, all: 0 } as const;
export type Since = keyof typeof SINCE;
export const SINCE_LABEL: Record<Since, string> = {
  "24h": "24 h",
  "3d": "3 j",
  "7d": "7 j",
  all: "tout",
};

/** "todo" = never triaged (default); "active" = everything but ignored. */
export type StatusFilter = "active" | "todo" | "all" | JobStatus;
export type NewGradFilter = "" | "yes" | "no" | "unknown";
export type RemoteFilter = "" | "onsite" | "hybrid" | "remote" | "unknown";
export type SortKey = "score" | "recent";

export interface InboxFilters {
  q: string;
  country: string;
  city: string;
  remote: RemoteFilter;
  newGrad: NewGradFilter;
  domain: string;
  source: string;
  company: string;
  minScore: number;
  since: Since;
  status: StatusFilter;
  closed: boolean;
  sort: SortKey;
  page: number;
}

export const DEFAULT_FILTERS: InboxFilters = {
  q: "",
  country: "",
  city: "",
  remote: "",
  newGrad: "",
  domain: "",
  source: "",
  company: "",
  minScore: 0,
  since: "all",
  status: "todo",
  closed: false,
  sort: "score",
  page: 1,
};

export const PAGE_SIZE = 50;

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(p: Params, k: string): string {
  const v = p instanceof URLSearchParams ? p.get(k) : p[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

const oneOf = <T extends string>(v: string, allowed: readonly T[], def: T): T =>
  (allowed as readonly string[]).includes(v) ? (v as T) : def;

export function parseFilters(p: Params): InboxFilters {
  const minScore = Math.round(Number(get(p, "min")));
  const page = Math.floor(Number(get(p, "page")));
  return {
    q: get(p, "q").slice(0, 200),
    country: get(p, "country").toUpperCase().slice(0, 2),
    city: get(p, "city").slice(0, 80),
    remote: oneOf(get(p, "remote"), ["", "onsite", "hybrid", "remote", "unknown"], ""),
    newGrad: oneOf(get(p, "ng"), ["", "yes", "no", "unknown"], ""),
    domain: get(p, "domain").slice(0, 60),
    source: get(p, "source").slice(0, 60),
    company: get(p, "company").slice(0, 120),
    minScore: Number.isFinite(minScore) ? Math.max(0, Math.min(100, minScore)) : 0,
    since: oneOf(get(p, "since"), Object.keys(SINCE) as Since[], "all"),
    status: oneOf(get(p, "status"), ["active", "todo", "all", ...STATUSES], "todo"),
    closed: get(p, "closed") === "1",
    sort: oneOf(get(p, "sort"), ["score", "recent"], "score"),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

/** Only non-default values go to the URL (short, shareable links). */
export function filtersToParams(f: InboxFilters): URLSearchParams {
  const out = new URLSearchParams();
  const d = DEFAULT_FILTERS;
  if (f.q) out.set("q", f.q);
  if (f.country) out.set("country", f.country);
  if (f.city) out.set("city", f.city);
  if (f.remote) out.set("remote", f.remote);
  if (f.newGrad) out.set("ng", f.newGrad);
  if (f.domain) out.set("domain", f.domain);
  if (f.source) out.set("source", f.source);
  if (f.company) out.set("company", f.company);
  if (f.minScore > 0) out.set("min", String(f.minScore));
  if (f.since !== d.since) out.set("since", f.since);
  if (f.status !== d.status) out.set("status", f.status);
  if (f.closed) out.set("closed", "1");
  if (f.sort !== d.sort) out.set("sort", f.sort);
  if (f.page > 1) out.set("page", String(f.page));
  return out;
}

export function inboxHref(f: InboxFilters): string {
  const qs = filtersToParams(f).toString();
  return qs ? `/?${qs}` : "/";
}

/** One-click views over the filters: they set status + since and keep every other filter. */
export const VIEWS = [
  { id: "todo", label: "À trier", status: "todo", since: "all" },
  { id: "fresh", label: "Nouvelles 24 h", status: "todo", since: "24h" },
  { id: "saved", label: "Sauvegardées", status: "saved", since: "all" },
  { id: "all", label: "Toutes", status: "active", since: "all" },
] as const satisfies readonly { id: string; label: string; status: StatusFilter; since: Since }[];
export type ViewId = (typeof VIEWS)[number]["id"];

export function currentView(f: InboxFilters): ViewId | null {
  return VIEWS.find((v) => v.status === f.status && v.since === f.since)?.id ?? null;
}

export function applyView(f: InboxFilters, id: ViewId): InboxFilters {
  const v = VIEWS.find((x) => x.id === id)!;
  return { ...f, status: v.status, since: v.since, page: 1 };
}

/** Filters beyond the view (status/since) and sort: what the chips list. */
export function activeFilterCount(f: InboxFilters): number {
  const d = DEFAULT_FILTERS;
  return [
    f.q !== d.q,
    f.country !== d.country,
    f.city !== d.city,
    f.remote !== d.remote,
    f.newGrad !== d.newGrad,
    f.domain !== d.domain,
    f.source !== d.source,
    f.company !== d.company,
    f.minScore !== d.minScore,
    f.closed !== d.closed,
  ].filter(Boolean).length;
}
