import { companies, type AnyDb } from "@jobradar/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerCompany } from "../src/discovery/companies";
import { probeCareersUrl, slugCandidates } from "../src/discovery/probe";
import { fakeHttp, fixture, testDb } from "./helpers";

describe("slugCandidates", () => {
  it.each([
    ["https://careers.stripe.com/", ["stripe"]],
    ["https://www.native-instruments.com/en/careers/", ["native-instruments", "nativeinstruments"]],
    ["https://jobs.ubisoft.com/fr", ["ubisoft"]],
    ["https://www.example.co.uk/jobs", ["example"]],
    ["nope", []],
  ])("%s", (url, slugs) => {
    expect(slugCandidates(url)).toEqual(slugs);
  });
});

describe("probeCareersUrl", () => {
  it("uses the URL itself when it is a board URL (no network)", async () => {
    const { client, calls } = fakeHttp(() => undefined);
    const r = await probeCareersUrl(client, "https://jobs.lever.co/spotify");
    expect(r.detected).toEqual({ ats: "lever", atsKey: "spotify" });
    expect(calls).toHaveLength(0);
  });

  it("probes the public APIs with the domain slug and keeps boards with jobs", async () => {
    const gh = fixture("greenhouse/stripe.jobs.json");
    const { client, calls } = fakeHttp((url) => {
      if (url === "https://boards-api.greenhouse.io/v1/boards/stripe/jobs") return gh;
      if (url.startsWith("https://api.lever.co/")) return [];
      throw new Error("HTTP 404");
    });
    const r = await probeCareersUrl(client, "https://stripe.com/jobs");
    expect(r.detected).toBeNull();
    expect(r.hits).toEqual([{ ats: "greenhouse", atsKey: "stripe", jobs: 3 }]);
    // Every probed API is hit once for the single slug.
    expect(calls.length).toBe(11);
  });
});

describe("registerCompany", () => {
  let db: AnyDb;
  let close: () => Promise<void>;
  beforeEach(async () => {
    ({ db, close } = await testDb());
  });
  afterEach(async () => {
    await close();
  });

  it("creates a manual company once, and fills a same-name company without ATS", async () => {
    const a = await registerCompany(db, { name: "Stripe", ats: "greenhouse", atsKey: "stripe" });
    expect(a.created).toBe(true);
    const again = await registerCompany(db, {
      name: "Stripe",
      ats: "greenhouse",
      atsKey: "stripe",
    });
    expect(again).toEqual({ id: a.id, created: false, updated: false });

    await db.insert(companies).values({ name: "Shopify", nameKey: "shopify", origin: "seed" });
    const s = await registerCompany(db, { name: "Shopify", ats: "ashby", atsKey: "shopify" });
    expect(s.updated).toBe(true);
    const rows = await db.select().from(companies).orderBy(companies.id);
    expect(rows.map((r) => [r.name, r.ats, r.origin])).toEqual([
      ["Stripe", "greenhouse", "manual"],
      ["Shopify", "ashby", "seed"],
    ]);
  });
});
