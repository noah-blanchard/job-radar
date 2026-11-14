import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "@jobradar/db/schema";
import type { AnyDb } from "@jobradar/db";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { pino } from "pino";
import type { Company, FetchCtx, RawJob } from "../src/connectors/types";
import type { HttpClient, HttpRequestOptions, HttpResponse } from "../src/http/types";

export const silentLog = pino({ level: "silent" });

export function fixture<T = unknown>(path: string): T {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${path}`, import.meta.url)), "utf8"),
  ) as T;
}

export interface FakeCall {
  url: string;
  opts: HttpRequestOptions;
}

/** HttpClient answering from a routing function; never touches the network. */
export function fakeHttp(route: (url: string, opts: HttpRequestOptions) => unknown | "304") {
  const calls: FakeCall[] = [];
  const client: HttpClient = {
    async json<T>(url: string, opts: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
      calls.push({ url, opts });
      const data = route(url, opts);
      if (data === "304") return { status: 304, notModified: true, headers: {} };
      if (data === undefined) throw new Error(`unexpected request ${url}`);
      return { status: 200, notModified: false, headers: {}, data: data as T };
    },
    async text(url, opts = {}) {
      return this.json<string>(url, opts);
    },
  };
  return { client, calls };
}

export function makeCtx(
  http: HttpClient,
  over: Partial<FetchCtx> = {},
): FetchCtx & { unchanged: boolean } {
  const ctx = {
    http,
    quota: { remaining: async () => Infinity, take: async () => true },
    log: silentLog,
    since: undefined,
    signal: new AbortController().signal,
    knownIds: new Set<string>(),
    wantDetails: () => true,
    unchanged: false,
    markUnchanged() {
      ctx.unchanged = true;
    },
    ...over,
  };
  return ctx;
}

export async function collect(it: AsyncIterable<RawJob>): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for await (const j of it) out.push(j);
  return out;
}

export function company(over: Partial<Company> = {}): Company {
  return {
    id: 1,
    name: "Acme",
    ats: null,
    atsKey: "acme",
    careersUrl: null,
    priority: "normal",
    ...over,
  };
}

const MIGRATIONS = fileURLToPath(new URL("../../db/migrations", import.meta.url));

/** In-process Postgres (PGlite) with all migrations applied. */
export async function testDb(): Promise<{ db: AnyDb; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db: db as unknown as AnyDb, close: () => client.close() };
}
