import { companies } from "@jobradar/db";
import { describe, expect, it } from "vitest";
import { findConfigDir, loadCompanySeed, loadSourcesConfig, syncCompanySeed } from "../src/config";
import { CONNECTORS } from "../src/connectors/registry";
import { testDb } from "./helpers";

describe("config files", () => {
  const dir = findConfigDir();

  it("parses sources.yaml and every enabled source has a connector", () => {
    const sources = loadSourcesConfig(dir);
    const enabled = sources.filter((s) => s.enabled).map((s) => s.id);
    expect(enabled.sort()).toEqual(["ashby", "greenhouse", "lever", "smartrecruiters", "workday"]);
    const implemented = new Set(CONNECTORS.map((c) => c.id));
    for (const id of enabled) expect(implemented.has(id)).toBe(true);
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
});
