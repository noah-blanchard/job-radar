import { describe, expect, it } from "vitest";
import { adzuna, adzunaQueries } from "../src/connectors/adzuna";
import {
  arbeitnow,
  himalayas,
  jobicy,
  remoteok,
  remotive,
  weworkremotely,
} from "../src/connectors/feeds";
import { findwork } from "../src/connectors/findwork";
import { githubSimplifyNewgrad, githubVanshNewgrad } from "../src/connectors/github";
import { hnWhoIsHiring, parseHnHeader } from "../src/connectors/hn";
import { jooble, joobleId, joobleQueries } from "../src/connectors/jooble";
import { jsearch, jsearchQueries } from "../src/connectors/jsearch";
import type { QuotaCounter } from "../src/connectors/types";
import { detectAts } from "../src/discovery/detectAts";
import { collect, fakeHttp, fixture, makeCtx, testEnv, textFixture } from "./helpers";

/** In-memory quota allowing `max` calls. */
function memQuota(max: number): QuotaCounter & { used: number } {
  const q = {
    used: 0,
    remaining: async () => max - q.used,
    take: async () => {
      if (q.used >= max) return false;
      q.used++;
      return true;
    },
  };
  return q;
}

describe("github new grad lists", () => {
  const simplify = fixture<Array<{ id: string; active: boolean; is_visible: boolean }>>(
    "github/simplify.listings.json",
  );

  it("maps active, visible SimplifyJobs listings only", async () => {
    const { client, calls } = fakeHttp(() => simplify);
    const jobs = await collect(githubSimplifyNewgrad.fetch(makeCtx(client)));
    expect(calls[0]!.url).toBe(
      "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
    );
    expect(calls[0]!.opts.cacheKey).toBe("github_simplify_newgrad:listings");
    // No token is ever sent to raw.githubusercontent.com.
    expect(calls[0]!.opts.headers?.authorization).toBeUndefined();
    const open = simplify.filter((x) => x.active && x.is_visible);
    expect(jobs).toHaveLength(open.length);
    expect(jobs.map((j) => j.sourceJobId)).toEqual(open.map((x) => x.id));
    const g = jobs.find((j) => j.url.includes("greenhouse"))!;
    expect(g.companyName).toBe("Geneva Trading");
    expect(g.postedAt).toBeInstanceOf(Date);
    expect(detectAts(g.url)).toEqual({ ats: "greenhouse", atsKey: "genevatrading" });
  });

  it("treats 304 as unchanged", async () => {
    const { client } = fakeHttp(() => "304");
    const ctx = makeCtx(client);
    expect(await collect(githubSimplifyNewgrad.fetch(ctx))).toHaveLength(0);
    expect(ctx.unchanged).toBe(true);
  });

  it("reads the vanshb03 list (same format)", async () => {
    const { client } = fakeHttp(() => fixture("github/vansh.listings.json"));
    const jobs = await collect(githubVanshNewgrad.fetch(makeCtx(client)));
    expect(jobs).toHaveLength(3);
    expect(jobs.every((j) => j.source === "github_vansh_newgrad")).toBe(true);
  });

  it("rejects a non-array payload", async () => {
    const { client } = fakeHttp(() => ({ nope: 1 }));
    await expect(collect(githubSimplifyNewgrad.fetch(makeCtx(client)))).rejects.toThrow(/array/);
  });
});

describe("adzuna", () => {
  const data = fixture<{ results: unknown[] }>("adzuna/ca.search.json");

  it("builds countries x seniority x domains queries from the profile", () => {
    const qs = adzunaQueries(makeCtx(fakeHttp(() => null).client));
    // 4 countries (ADZUNA_COUNTRIES default), 4 EN or 3 FR terms, 6 domains.
    expect(qs).toHaveLength((4 + 4 + 3 + 4) * 6);
    expect(qs[0]).toEqual({
      country: "ca",
      titleOnly: "junior",
      whatOr: expect.stringContaining("audio"),
    });
    const fr = qs.find((q) => q.country === "fr")!;
    expect(fr.titleOnly).toBe("junior");
    expect(qs.some((q) => q.whatOr.includes("full-stack"))).toBe(true);
    expect(qs.some((q) => q.whatOr.includes("c++"))).toBe(true);
  });

  it("maps the real payload and keeps the key out of the job URL", async () => {
    const { client, calls } = fakeHttp(() => data);
    const quota = memQuota(1);
    const jobs = await collect(adzuna.fetch(makeCtx(client, { quota })));
    expect(calls).toHaveLength(1);
    const u = new URL(calls[0]!.url);
    expect(u.pathname).toBe("/v1/api/jobs/ca/search/1");
    expect(u.searchParams.get("title_only")).toBe("junior");
    expect(u.searchParams.get("app_key")).toBe("test-key");
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      source: "adzuna",
      sourceJobId: "5961936716",
      companyName: "Quo",
      title: "Junior Fullstack Engineer",
      locationRaw: "Greater Vancouver, British Columbia, Canada",
      countryHint: "CA",
      employmentType: "full_time",
    });
    expect(jobs[0]!.url).not.toContain("test-key");
    expect(jobs[2]).toMatchObject({ salaryMin: 60000, salaryCurrency: "CAD" });
  });

  it("never exceeds the quota", async () => {
    const { client, calls } = fakeHttp(() => data);
    const quota = memQuota(5);
    await collect(adzuna.fetch(makeCtx(client, { quota })));
    expect(calls).toHaveLength(5);
    expect(quota.used).toBe(5);
  });

  it("fails clearly without keys", async () => {
    const { client } = fakeHttp(() => data);
    const ctx = makeCtx(client, { env: testEnv({ ADZUNA_APP_KEY: "" }) });
    await expect(collect(adzuna.fetch(ctx))).rejects.toThrow(/ADZUNA_APP_KEY/);
  });
});

describe("jooble", () => {
  const data = fixture("jooble/canada.json");

  it("queries Canada, United States and Remote", () => {
    const qs = joobleQueries(makeCtx(fakeHttp(() => null).client));
    expect([...new Set(qs.map((q) => q.location))]).toEqual(["Canada", "United States", "Remote"]);
    expect(qs[0]!.keywords).toBe("new grad software engineer");
    expect(qs.map((q) => q.keywords)).toContain("junior audio");
  });

  it("takes the 64-bit id from the link (JSON numbers lose precision)", () => {
    expect(joobleId("https://jooble.org/desc/-7445475064144654344?ckey=x")).toBe(
      "-7445475064144654344",
    );
  });

  it("maps the real payload with a stable URL", async () => {
    const { client, calls } = fakeHttp(() => data);
    const jobs = await collect(jooble.fetch(makeCtx(client, { quota: memQuota(1) })));
    expect(calls[0]!.opts.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://jooble.org/api/test-jooble");
    expect(calls[0]!.opts.body).toMatchObject({
      keywords: "new grad software engineer",
      location: "Canada",
    });
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      sourceJobId: "-7445475064144654344",
      url: "https://jooble.org/desc/-7445475064144654344",
      companyName: "GD Mission Systems",
      locationRaw: "Canada",
    });
    expect(jobs[1]!.postedAt?.toISOString()).toBe("2026-11-09T12:26:48.000Z");
  });

  it("never exceeds the quota", async () => {
    const { client, calls } = fakeHttp(() => data);
    await collect(jooble.fetch(makeCtx(client, { quota: memQuota(4) })));
    expect(calls).toHaveLength(4);
  });
});

describe("jsearch", () => {
  const data = fixture("jsearch/search-v2.json");

  it("orders queries by location weight (Montreal, Toronto, Canada first)", () => {
    const qs = jsearchQueries(makeCtx(fakeHttp(() => null).client));
    expect(qs.slice(0, 3)).toEqual([
      "new grad software engineer in Montreal",
      "new grad software engineer in Toronto",
      "new grad software engineer in Canada",
    ]);
  });

  it("maps the real payload and sends RapidAPI headers", async () => {
    const { client, calls } = fakeHttp(() => data);
    const jobs = await collect(jsearch.fetch(makeCtx(client, { quota: memQuota(1) })));
    expect(calls[0]!.url).toMatch(
      /^https:\/\/jsearch\.p\.rapidapi\.com\/search-v2\?query=new\+grad/,
    );
    expect(calls[0]!.opts.headers).toMatchObject({ "x-rapidapi-key": "test-rapid" });
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      companyName: "Fellow - AI Meeting Assistant",
      title: "AI-Powered Software Engineer (New Grad) - Remote",
      countryHint: "CA",
    });
    expect(jobs[0]!.relatedUrls!.length).toBeGreaterThan(0);
  });

  it("stops at the daily quota (3 calls max)", async () => {
    const { client, calls } = fakeHttp(() => data);
    const quota = memQuota(3);
    await collect(jsearch.fetch(makeCtx(client, { quota })));
    expect(calls).toHaveLength(3);
    expect(await quota.remaining()).toBe(0);
  });
});

describe("findwork", () => {
  it("maps the real payload", async () => {
    const { client, calls } = fakeHttp(() => fixture("findwork/jobs.json"));
    const jobs = await collect(findwork.fetch(makeCtx(client, { quota: memQuota(1) })));
    expect(calls[0]!.url).toBe("https://findwork.dev/api/jobs/?search=junior&sort_by=date");
    expect(calls[0]!.opts.headers).toEqual({ authorization: "Token test-findwork" });
    // The third real item has "role": null and is skipped.
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["nZ77E2Q", "QPRRKVX"]);
    expect(jobs[0]).toMatchObject({ remoteHint: "remote", locationRaw: "Remote" });
  });

  it("never exceeds the quota", async () => {
    const { client, calls } = fakeHttp(() => fixture("findwork/jobs.json"));
    await collect(findwork.fetch(makeCtx(client, { quota: memQuota(2) })));
    expect(calls).toHaveLength(2);
  });
});

describe("remote feeds", () => {
  it("arbeitnow: decodes the entity-escaped HTML", async () => {
    const { client } = fakeHttp(() => fixture("arbeitnow/page1.json"));
    // A since far in the past keeps paging off after page 1 (fixture has 3 items, next link).
    const ctx = makeCtx(client, { since: new Date("2026-11-13T00:00:00Z") });
    const jobs = await collect(arbeitnow.fetch(ctx));
    expect(jobs.length).toBeGreaterThanOrEqual(3);
    expect(jobs[0]!.descriptionHtml).toMatch(/^<div/);
    expect(jobs[0]!.locationRaw).toBe("Munich");
  });

  it("remotive", async () => {
    const { client } = fakeHttp(() => fixture("remotive/software-dev.json"));
    const jobs = await collect(remotive.fetch(makeCtx(client)));
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      sourceJobId: "1680495",
      locationRaw: "Remote - Worldwide",
      remoteHint: "remote",
    });
    expect(jobs[0]!.postedAt?.toISOString()).toBe("2026-11-11T20:17:48.000Z");
  });

  it("remoteok skips the legal notice", async () => {
    const { client } = fakeHttp(() => fixture("remoteok/api.json"));
    const jobs = await collect(remoteok.fetch(makeCtx(client)));
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({ companyName: "Supabase", locationRaw: "Remote" });
    expect(jobs[2]!.locationRaw).toBe("Remote - New York");
  });

  it("himalayas: entry-level search per profile country, stops at the cutoff", async () => {
    const { client, calls } = fakeHttp(() => fixture("himalayas/search.json"));
    const jobs = await collect(himalayas.fetch(makeCtx(client, { since: new Date() })));
    // Fixture jobs are older than the cutoff: one page per country (CA, FR, US).
    expect(calls).toHaveLength(3);
    expect(new URL(calls[0]!.url).searchParams.get("seniority")).toBe("Entry-level");
    expect(new URL(calls[0]!.url).searchParams.get("country")).toBe("Canada");
    // Same fixture for every country: deduplicated by guid.
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.locationRaw).toBe("Remote - Netherlands");
    // Hourly pay is not stored as a yearly salary.
    expect(jobs[0]!.salaryMin).toBeUndefined();
  });

  it("jobicy", async () => {
    const { client } = fakeHttp(() => fixture("jobicy/remote-jobs.json"));
    const jobs = await collect(jobicy.fetch(makeCtx(client)));
    expect(jobs).toHaveLength(3);
    expect(jobs[2]).toMatchObject({ companyName: "Varicent", locationRaw: "Remote - Canada" });
  });

  it("weworkremotely: parses the RSS feed", async () => {
    const { client, calls } = fakeHttp(() => textFixture("weworkremotely/programming.rss"));
    const jobs = await collect(weworkremotely.fetch(makeCtx(client)));
    expect(calls[0]!.opts.cacheKey).toBe("weworkremotely:programming");
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      companyName: "Growth Minded",
      title: "Senior Data Engineer",
      locationRaw: "Remote - Anywhere in the World",
      url: "https://weworkremotely.com/remote-jobs/growth-minded-senior-data-engineer",
    });
    expect(jobs[0]!.descriptionHtml).toContain("<p>");
    expect(jobs[0]!.postedAt?.toISOString()).toBe("2026-10-19T12:47:58.000Z");
  });
});

describe("hn who is hiring", () => {
  it("parses the conventional header line", () => {
    expect(
      parseHnHeader(
        "Common Prefix | Senior Software Engineer | Athens, Greece &#x2F; REMOTE | Full-time | $80k to $160k<p>We're hiring",
      ),
    ).toEqual({
      company: "Common Prefix",
      title: "Senior Software Engineer",
      location: "Athens, Greece / REMOTE",
    });
    expect(
      parseHnHeader(
        "Joulent | AI Engineer, Company Brain | San Francisco | Onsite | Full-time<p>x",
      ),
    ).toEqual({
      company: "Joulent",
      title: "AI Engineer, Company Brain",
      location: "San Francisco / Onsite",
    });
    expect(parseHnHeader("Thanks, applied!")).toBeNull();
  });

  it("reads the latest thread's top-level comments", async () => {
    const stories = fixture("hn/stories.json");
    const comments = fixture<{ hits: Array<{ parent_id: number }> }>("hn/comments.json");
    const { client, calls } = fakeHttp((url) =>
      url.includes("author_whoishiring") ? stories : comments,
    );
    const jobs = await collect(hnWhoIsHiring.fetch(makeCtx(client)));
    expect(calls[1]!.url).toContain("tags=comment,story_50338728");
    const top = comments.hits.filter((h) => h.parent_id === 50338728);
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.length).toBeLessThanOrEqual(top.length);
    expect(jobs[0]).toMatchObject({ companyName: "Common Prefix", source: "hn_whoishiring" });
    expect(jobs[0]!.url).toMatch(/^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/);
  });
});
