import { brotliDecompressSync, gunzipSync } from "node:zlib";
import pLimit, { type LimitFunction } from "p-limit";
import { request } from "undici";
import type { Logger } from "../logger";
import { HttpError, type HttpClient, type HttpRequestOptions, type HttpResponse } from "./types";

export interface RawRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  timeoutMs: number;
}

export interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Low-level transport (undici in prod, a fake in tests). */
export type Transport = (req: RawRequest) => Promise<RawResponse>;

/** undici transport: no redirect following, gzip/brotli decoded here (smaller transfers). */
export const undiciTransport: Transport = async (req) => {
  const res = await request(req.url, {
    method: req.method,
    headers: { ...req.headers, "accept-encoding": "gzip, br" },
    body: req.body,
    signal: req.signal,
    headersTimeout: req.timeoutMs,
    bodyTimeout: req.timeoutMs,
  });
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(res.headers)) {
    if (v !== undefined) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
  }
  const raw = Buffer.from(await res.body.arrayBuffer());
  const enc = headers["content-encoding"]?.toLowerCase();
  const buf = enc === "gzip" ? gunzipSync(raw) : enc === "br" ? brotliDecompressSync(raw) : raw;
  return { status: res.statusCode, headers, body: buf.toString("utf8") };
};

export interface Validators {
  etag?: string;
  lastModified?: string;
}

/** Persistent store for conditional-GET validators (kv table in prod). */
export interface ValidatorStore {
  get(key: string): Promise<Validators | undefined>;
  set(key: string, v: Validators): Promise<void>;
}

export function memoryValidatorStore(): ValidatorStore & { data: Map<string, Validators> } {
  const data = new Map<string, Validators>();
  return {
    data,
    get: async (k) => data.get(k),
    set: async (k, v) => {
      data.set(k, v);
    },
  };
}

export interface HttpSharedOptions {
  userAgent: string;
  log: Logger;
  concurrencyPerHost?: number;
  /** Minimum delay between two request starts on the same host (e.g. Workday ~1 req/s). */
  minIntervalMs?: (host: string) => number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Retry-After values above this abort the request instead of sleeping. */
  maxRetryAfterMs?: number;
  timeoutMs?: number;
  transport?: Transport;
  validators?: ValidatorStore;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Secret values (API keys) masked in every logged URL and error message. */
  secrets?: readonly string[];
}

/** Process-wide politeness state: per-host concurrency and pacing. */
export class HttpShared {
  readonly opts: Required<Omit<HttpSharedOptions, "validators" | "minIntervalMs" | "secrets">> &
    Pick<HttpSharedOptions, "validators" | "minIntervalMs">;
  private secrets: string[];
  private limits = new Map<string, LimitFunction>();
  private lastStart = new Map<string, number>();

  constructor(opts: HttpSharedOptions) {
    this.opts = {
      concurrencyPerHost: 2,
      maxRetries: 4,
      baseDelayMs: 500,
      maxDelayMs: 30_000,
      maxRetryAfterMs: 120_000,
      timeoutMs: 30_000,
      transport: undiciTransport,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      random: Math.random,
      ...opts,
    };
    // Longest first so a secret containing another one is fully masked.
    this.secrets = [...new Set(opts.secrets ?? [])]
      .filter((x) => x.length >= 6)
      .sort((a, b) => b.length - a.length);
  }

  /** Masks API keys (raw and URL-encoded) in a URL or message. */
  redact(s: string): string {
    let out = s;
    for (const secret of this.secrets) {
      out = out.split(secret).join("***").split(encodeURIComponent(secret)).join("***");
    }
    return out;
  }

  limitFor(host: string): LimitFunction {
    let l = this.limits.get(host);
    if (!l) {
      l = pLimit(this.opts.concurrencyPerHost);
      this.limits.set(host, l);
    }
    return l;
  }

  /** Waits so that two request starts on `host` are at least minIntervalMs apart. */
  async pace(host: string): Promise<void> {
    const gap = this.opts.minIntervalMs?.(host) ?? 0;
    if (gap <= 0) return;
    const last = this.lastStart.get(host);
    const now = Date.now();
    // Reserve the next slot before sleeping so concurrent callers queue up correctly.
    const next = last === undefined ? now : Math.max(now, last + gap);
    this.lastStart.set(host, next);
    if (next > now) await this.opts.sleep(next - now);
  }
}

/** Retry delay: exponential backoff with "equal jitter". */
export function backoffDelay(attempt: number, base: number, max: number, random: () => number) {
  const exp = Math.min(max, base * 2 ** attempt);
  return Math.round(exp / 2 + (random() * exp) / 2);
}

/** Parses Retry-After (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

const RETRYABLE = (status: number) => status === 429 || (status >= 500 && status !== 501);

/**
 * Per-run HTTP client. Validators received during the run are staged and only persisted by
 * `commitValidators()` once the run succeeded, so a failed run never hides changes behind a 304.
 */
export class PoliteHttpClient implements HttpClient {
  private staged = new Map<string, Validators>();

  constructor(
    private shared: HttpShared,
    private signal?: AbortSignal,
  ) {}

  async json<T>(url: string, opts: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    const res = await this.send(url, opts, "application/json");
    if (res.notModified) return res;
    try {
      return { ...res, data: JSON.parse(res.data) as T };
    } catch {
      const safe = this.shared.redact(url);
      throw new HttpError(res.status, safe, `Invalid JSON from ${safe}`);
    }
  }

  text(url: string, opts: HttpRequestOptions = {}): Promise<HttpResponse<string>> {
    return this.send(url, opts, "application/xml, application/rss+xml, text/xml, */*");
  }

  async commitValidators(): Promise<void> {
    const store = this.shared.opts.validators;
    if (!store) return;
    for (const [k, v] of this.staged) await store.set(k, v);
    this.staged.clear();
  }

  private async send(
    url: string,
    opts: HttpRequestOptions,
    accept: string,
  ): Promise<HttpResponse<string>> {
    const { opts: o } = this.shared;
    const host = new URL(url).host;
    const method = opts.method ?? "GET";
    const headers: Record<string, string> = {
      "user-agent": o.userAgent,
      accept,
      ...opts.headers,
    };
    let body: string | undefined;
    if (opts.body !== undefined) {
      body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
      headers["content-type"] ??= "application/json";
    }
    if (opts.cacheKey && o.validators) {
      const v = await o.validators.get(opts.cacheKey);
      if (v?.etag) headers["if-none-match"] = v.etag;
      if (v?.lastModified) headers["if-modified-since"] = v.lastModified;
    }

    for (let attempt = 0; ; attempt++) {
      this.signal?.throwIfAborted();
      let res: RawResponse | undefined;
      let networkError: unknown;
      try {
        res = await this.shared.limitFor(host)(async () => {
          await this.shared.pace(host);
          return o.transport({
            url,
            method,
            headers,
            body,
            signal: this.signal,
            timeoutMs: o.timeoutMs,
          });
        });
      } catch (err) {
        if (this.signal?.aborted) throw err;
        networkError = err;
      }

      if (res && !RETRYABLE(res.status)) {
        if (res.status === 304) return { status: 304, notModified: true, headers: res.headers };
        if (res.status < 200 || res.status >= 300)
          throw new HttpError(res.status, this.shared.redact(url));
        if (opts.cacheKey && (res.headers.etag || res.headers["last-modified"])) {
          this.staged.set(opts.cacheKey, {
            etag: res.headers.etag,
            lastModified: res.headers["last-modified"],
          });
        }
        return { status: res.status, notModified: false, headers: res.headers, data: res.body };
      }

      if (attempt >= o.maxRetries) {
        if (res) throw new HttpError(res.status, this.shared.redact(url));
        const msg = networkError instanceof Error ? networkError.message : String(networkError);
        throw new Error(this.shared.redact(msg));
      }

      const retryAfter = parseRetryAfter(res?.headers["retry-after"]);
      if (retryAfter !== undefined && retryAfter > o.maxRetryAfterMs) {
        const safe = this.shared.redact(url);
        throw new HttpError(
          res!.status,
          safe,
          `Retry-After too long (${retryAfter} ms) for ${safe}`,
        );
      }
      const delay = retryAfter ?? backoffDelay(attempt, o.baseDelayMs, o.maxDelayMs, o.random);
      o.log.warn(
        {
          url: this.shared.redact(url),
          status: res?.status,
          err: networkError ? this.shared.redact(String(networkError)) : undefined,
          attempt,
          delay,
        },
        "http retry",
      );
      await o.sleep(delay);
    }
  }
}
