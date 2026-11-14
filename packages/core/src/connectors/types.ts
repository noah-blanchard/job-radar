import type { HttpClient } from "../http/types";
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
  /** Structured hints when the API exposes them explicitly. */
  remoteHint?: "onsite" | "hybrid" | "remote";
  countryHint?: string;
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

export interface QuotaCounter {
  /** Remaining calls for today. */
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
  /** source_job_ids of open jobs already stored for this source (and company). */
  knownIds: ReadonlySet<string>;
  /** Whether a per-job detail request is worth it (cheap title pre-filter). */
  wantDetails(title: string): boolean;
  /** Call when the source answered 304 Not Modified: nothing changed since the last run. */
  markUnchanged(): void;
}

export interface Connector {
  /** "greenhouse", "adzuna", ... */
  id: string;
  kind: "ats" | "aggregator" | "feed";
  /** True for ATS connectors: iterated over the `companies` table. */
  needsCompany: boolean;
  fetch(ctx: FetchCtx, company?: Company): AsyncIterable<RawJob>;
}

/** Thrown for unusable payloads (schema mismatch); logged as a run error, never a crash. */
export class ConnectorError extends Error {
  override name = "ConnectorError";
}

export function requireCompany(
  connectorId: string,
  company: Company | undefined,
): Company & { atsKey: string } {
  if (!company?.atsKey) throw new ConnectorError(`${connectorId}: company with ats_key required`);
  return company as Company & { atsKey: string };
}
