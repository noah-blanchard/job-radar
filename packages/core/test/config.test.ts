import { companies } from "@jobradar/db";
import { describe, expect, it } from "vitest";
import { findConfigDir, loadCompanySeed, loadSourcesConfig, syncCompanySeed } from "../src/config";
import { CONNECTORS } from "../src/connectors/registry";
import { parseEnv } from "../src/env";
import { testDb } from "./helpers";

describe("config files", () => {
  const dir = findConfigDir();

  it("parses sources.yaml and every enabled source has a connector", () => {
    const sources = loadSourcesConfig(dir);
    const implemented = new Map(CONNECTORS.map((c) => [c.id, c]));
    for (const s of sources.filter((x) => x.enabled)) {
      expect(implemented.has(s.id), s.id).toBe(true);
      expect(s.status, s.id).toBe("verified");
    }
    // Every connector is listed, in the schedule matching its kind.
    for (const c of CONNECTORS) {
      const s = sources.find((x) => x.id === c.id);
      expect(s, c.id).toBeDefined();
      expect(s!.schedule === "ats", c.id).toBe(c.needsCompany);
    }
    // Disabled sources have no connector: never written without a successful verification.
    for (const s of sources.filter((x) => x.status === "disabled"))
      expect(implemented.has(s.id), s.id).toBe(false);
  });

  it("every quota_env names a numeric env variable", () => {
    const env = parseEnv({});
    for (const s of loadSourcesConfig(dir).filter((x) => x.quota_env)) {
      expect(typeof env[s.quota_env as keyof typeof env], s.id).toBe("number");
    }
  });

  it("parses the company seed; every ats has a connector and a key", () => {
    const seed = loadCompanySeed(dir);
    expect(seed.length).toBeGreaterThanOrEqual(30);
    const implemented = new Set(CONNECTORS.map((c) => c.id));
    for (const c of seed.filter((s) => s.ats)) {
      expect(implemented.has(c.ats!), c.name).toBe(true);
      expect(c.ats_key, c.name).toBeTruthy();
    }
  });
});

describe("syncCompanySeed", () => {
  it("is idempotent and updates ATS info", async () => {
    const { db, close } = await testDb();
    try {
      const seed = loadCompanySeed(findConfigDir());
      const first = await syncCompanySeed(db, seed);
      expect(first).toEqual({ inserted: seed.length, updated: 0 });
      expect(await syncCompanySeed(db, seed)).toEqual({ inserted: 0, updated: 0 });

      const changed = seed.map((s) =>
        s.name === "Shopify" ? { ...s, ats: "ashby", ats_key: "shopify" } : s,
      );
      expect(await syncCompanySeed(db, changed)).toEqual({ inserted: 0, updated: 1 });
      const rows = await db.select().from(companies);
      expect(rows.find((r) => r.name === "Shopify")).toMatchObject({
        ats: "ashby",
        atsKey: "shopify",
        origin: "seed",
      });
      expect(rows.find((r) => r.name === "Stripe")).toMatchObject({
        ats: "greenhouse",
        atsKey: "stripe",
        priority: "high",
      });
    } finally {
      await close();
    }
  });

  it("never moves a seed board onto a discovered company with the same name", async () => {
    const { db, close } = await testDb();
    try {
      const seed = [
        {
          name: "Akuna Capital",
          priority: "high" as const,
          ats: "greenhouse",
          ats_key: "akunacapital",
        },
      ];
      // Discovered first (lower id): another board of the same employer.
      await db.insert(companies).values({
        name: "Akuna Capital",
        nameKey: "akuna capital",
        ats: "greenhouse",
        atsKey: "akunacapitaloci",
        origin: "discovered",
      });
      await db.insert(companies).values({
        name: "Akuna Capital",
        nameKey: "akuna capital",
        ats: "greenhouse",
        atsKey: "akunacapital",
        origin: "seed",
      });
      // Only the seed row is touched (its priority), never the discovered board.
      expect(await syncCompanySeed(db, seed)).toEqual({ inserted: 0, updated: 1 });
      const rows = await db.select().from(companies).orderBy(companies.id);
      expect(rows.map((r) => [r.atsKey, r.priority])).toEqual([
        ["akunacapitaloci", "normal"],
        ["akunacapital", "high"],
      ]);
    } finally {
      await close();
    }
  });
});
