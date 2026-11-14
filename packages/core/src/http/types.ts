export interface HttpRequestOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  /** JSON-serialized when not a string. */
  body?: unknown;
  /**
   * Conditional GET key. The client replays the stored ETag / Last-Modified and stages the new
   * validators; they are only persisted when the run commits (see `commitValidators`).
   */
  cacheKey?: string;
}

export type HttpResponse<T> =
  | { status: 304; notModified: true; headers: Record<string, string> }
  | { status: number; notModified: false; headers: Record<string, string>; data: T };

export interface HttpClient {
  json<T = unknown>(url: string, opts?: HttpRequestOptions): Promise<HttpResponse<T>>;
  text(url: string, opts?: HttpRequestOptions): Promise<HttpResponse<string>>;
}

export class HttpError extends Error {
  override name = "HttpError";
  constructor(
    readonly status: number,
    readonly url: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} for ${url}`);
  }
}
