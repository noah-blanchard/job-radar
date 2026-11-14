import { and, companies, eq, isNull, type AnyDb } from "@jobradar/db";
import type { RawJob } from "../connectors/types";
import type { Logger } from "../logger";
import { companyKey } from "../normalize/text";
import { detectAts, type DetectedAts } from "./detectAts";

export interface ResolvedBoard extends DetectedAts {
  companyId: number;
  inserted: boolean;
}

/**
 * Per-run cache turning detected ATS boards into `companies` rows (origin='discovered') and
 * company names into ids. Discovered companies are picked up by the next ATS sweep.
 */
export class CompanyResolver {
  private boards = new Map<string, Promise<ResolvedBoard>>();
  private names = new Map<string, Promise<number | null>>();
  readonly discovered: ResolvedBoard[] = [];

  constructor(
    private db: AnyDb,
    private log: Logger,
    /** Only boards of these ATS are registered (connectors that exist). */
    private supportedAts: ReadonlySet<string>,
  ) {}

  /** Registers the board (idempotent) and returns its company id. */
  board(d: DetectedAts, companyName: string): Promise<ResolvedBoard> {
    const key = `${d.ats}:${d.atsKey}`;
    let p = this.boards.get(key);
    if (!p) {
      p = this.upsertBoard(d, companyName);
      this.boards.set(key, p);
    }
    return p;
  }

  /** Company id by normalized name (first match), or null. */
  byName(companyName: string): Promise<number | null> {
    const nameKey = companyKey(companyName);
    if (!nameKey) return Promise.resolve(null);
    let p = this.names.get(nameKey);
    if (!p) {
      p = this.db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.nameKey, nameKey))
        .orderBy(companies.id)
        .limit(1)
        .then((rows) => rows[0]?.id ?? null);
      this.names.set(nameKey, p);
    }
    return p;
  }

  /**
   * Detects boards in every URL of a raw job (url, applyUrl, relatedUrls) and registers them.
   * Returns the company id to attach the job to: the board found in the job's own URL, else a
   * company with the same name, else null.
   */
  async resolveJob(raw: RawJob): Promise<number | null> {
    const own = [raw.url, raw.applyUrl];
    let ownId: number | null = null;
    for (const url of [...own, ...(raw.relatedUrls ?? [])]) {
      const d = detectAts(url);
      if (!d || !this.supportedAts.has(d.ats)) continue;
      const r = await this.board(d, raw.companyName);
      if (ownId === null && own.includes(url)) ownId = r.companyId;
    }
    return ownId ?? (await this.byName(raw.companyName));
  }

  private async upsertBoard(d: DetectedAts, companyName: string): Promise<ResolvedBoard> {
    const { db } = this;
    const [existing] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.ats, d.ats), eq(companies.atsKey, d.atsKey)))
      .limit(1);
    if (existing) return { ...d, companyId: existing.id, inserted: false };

    const name = companyName.trim() || d.atsKey;
    const nameKey = companyKey(name);

    // A known company without ATS (e.g. a seed target) gets the detected board.
    const [noAts] = await db
      .update(companies)
      .set({ ats: d.ats, atsKey: d.atsKey, atsStatus: "unknown", consecutiveFailures: 0 })
      .where(
        and(
          eq(companies.nameKey, nameKey),
          isNull(companies.ats),
          eq(
            companies.id,
            db
              .select({ id: companies.id })
              .from(companies)
              .where(and(eq(companies.nameKey, nameKey), isNull(companies.ats)))
              .orderBy(companies.id)
              .limit(1),
          ),
        ),
      )
      .returning({ id: companies.id });
    if (noAts) {
      this.log.info({ company: name, ...d }, "ats detected for known company");
      const r = { ...d, companyId: noAts.id, inserted: false };
      this.discovered.push(r);
      return r;
    }

    const [ins] = await db
      .insert(companies)
      .values({ name, nameKey, ats: d.ats, atsKey: d.atsKey, origin: "discovered" })
      .onConflictDoNothing()
      .returning({ id: companies.id });
    if (ins) {
      this.log.info({ company: name, ...d }, "company discovered");
      const r = { ...d, companyId: ins.id, inserted: true };
      this.discovered.push(r);
      return r;
    }
    // Lost a race with a concurrent run: the row exists now.
    const [row] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.ats, d.ats), eq(companies.atsKey, d.atsKey)))
      .limit(1);
    return { ...d, companyId: row!.id, inserted: false };
  }
}

export interface RegisterInput {
  name: string;
  ats: string;
  atsKey: string;
  careersUrl?: string | null;
  origin?: "manual" | "discovered" | "seed";
  priority?: "low" | "normal" | "high";
}

/**
 * Adds a company with a known board (manual add from the dashboard or `detect-ats`).
 * Idempotent on (ats, ats_key); a same-name company without ATS gets the board instead.
 */
export async function registerCompany(
  db: AnyDb,
  input: RegisterInput,
): Promise<{ id: number; created: boolean; updated: boolean }> {
  const [existing] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.ats, input.ats), eq(companies.atsKey, input.atsKey)))
    .limit(1);
  if (existing) return { id: existing.id, created: false, updated: false };

  const nameKey = companyKey(input.name);
  const [noAts] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.nameKey, nameKey), isNull(companies.ats)))
    .orderBy(companies.id)
    .limit(1);
  if (noAts) {
    await db
      .update(companies)
      .set({
        ats: input.ats,
        atsKey: input.atsKey,
        atsStatus: "unknown",
        consecutiveFailures: 0,
        ...(input.careersUrl ? { careersUrl: input.careersUrl } : {}),
      })
      .where(eq(companies.id, noAts.id));
    return { id: noAts.id, created: false, updated: true };
  }

  const [row] = await db
    .insert(companies)
    .values({
      name: input.name.trim(),
      nameKey,
      ats: input.ats,
      atsKey: input.atsKey,
      careersUrl: input.careersUrl ?? null,
      origin: input.origin ?? "manual",
      priority: input.priority ?? "normal",
    })
    .returning({ id: companies.id });
  return { id: row!.id, created: true, updated: false };
}
