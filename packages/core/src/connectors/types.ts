import type { Logger } from "../logger";

/** Company as seen by connectors (subset of the `companies` row). */
export interface Company {
  id: number;
  name: string;
  ats: string | null;
  atsKey: string | null;
  careersUrl: string | null;
  priority: "low" | "normal" | "high";
}

/** Raw job as emitted by a connector, before normalization/dedup/classification. */
export interface RawJob {
  source: string;
  sourceJobId: string;
  companyName: string;
  title: string;
  url: string;
  applyUrl?: string;
  locationRaw?: string;
  /** Connector-level hint when the API exposes it explicitly. */
  remoteHint?: "onsite" | "hybrid" | "remote";
  employmentType?: string;
  postedAt?: Date;
  descriptionHtml?: string;
  descriptionText?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  /** Other URLs seen in the payload (fed to ATS discovery). */
  relatedUrls?: string[];
}

export interface HttpRequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  /** Conditional GET key; the client stores and replays ETag / Last-Modified. */
  cacheKey?: string;
}

export interface HttpResponse<T = unknown> {
  status: number;
  /** True when the server answered 304 Not Modified. */
  notModified: boolean;
  headers: Record<string, string>;
  data: T;
}

/** Polite HTTP client (User-Agent, per-host concurrency, retry/backoff, ETag). Implemented in M1. */
export interface HttpClient {
  json<T = unknown>(url: string, opts?: HttpRequestOptions): Promise<HttpResponse<T>>;
  text(url: string, opts?: HttpRequestOptions): Promise<HttpResponse<string>>;
}

export interface QuotaCounter {
  /** Remaining calls for today (and this month if configured). */
  remaining(): Promise<number>;
  /** Reserve one call; returns false when the quota is exhausted. */
  take(): Promise<boolean>;
}

export interface FetchCtx {
  http: HttpClient;
  quota: QuotaCounter;
  log: Logger;
  /** End of the last successful run for this source/company, if any. */
  since: Date | undefined;
  signal: AbortSignal;
}

export interface Connector {
  /** "greenhouse", "adzuna", ... */
  id: string;
  kind: "ats" | "aggregator" | "feed";
  /** True for ATS connectors: iterated over the `companies` table. */
  needsCompany: boolean;
  fetch(ctx: FetchCtx, company?: Company): AsyncIterable<RawJob>;
}
