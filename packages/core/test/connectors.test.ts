import { describe, expect, it } from "vitest";
import { ashby } from "../src/connectors/ashby";
import { greenhouse } from "../src/connectors/greenhouse";
import { lever, leverEndpoint } from "../src/connectors/lever";
import { smartrecruiters } from "../src/connectors/smartrecruiters";
import { parsePostedOn, parseWorkdayKey, workday } from "../src/connectors/workday";
import { collect, company, fakeHttp, fixture, makeCtx } from "./helpers";

describe("greenhouse", () => {
  const data = fixture<{ jobs: Array<{ id: number; title: string }> }>(
    "greenhouse/stripe.jobs.json",
  );

  it("maps the real payload", async () => {
    const { client, calls } = fakeHttp(() => data);
    const jobs = await collect(
      greenhouse.fetch(makeCtx(client), company({ name: "Stripe", atsKey: "stripe" })),
    );
    expect(calls[0]!.url).toBe(
      "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true",
    );
    expect(calls[0]!.opts.cacheKey).toBe("greenhouse:stripe");
    expect(jobs).toHaveLength(3);
    const j = jobs[0]!;
    expect(j.sourceJobId).toBe(String(data.jobs[0]!.id));
    expect(j.title).toBe(data.jobs[0]!.title.trim());
    expect(j.url).toMatch(/^https:\/\//);
    expect(j.postedAt).toBeInstanceOf(Date);
    // Entity-escaped HTML is decoded.
    expect(j.descriptionHtml).toMatch(/^<h2>/);
    expect(j.descriptionHtml).not.toContain("&lt;");
  });

  it("reports 304 as unchanged", async () => {
    const { client } = fakeHttp(() => "304");
    const ctx = makeCtx(client);
    expect(await collect(greenhouse.fetch(ctx, company()))).toHaveLength(0);
    expect(ctx.unchanged).toBe(true);
  });

  it("rejects an unexpected payload", async () => {
    const { client } = fakeHttp(() => ({ nope: true }));
    await expect(collect(greenhouse.fetch(makeCtx(client), company()))).rejects.toThrow(
      /unexpected payload/,
    );
  });

  it("skips invalid items instead of failing the run", async () => {
    const { client } = fakeHttp(() => ({ jobs: [...data.jobs, { id: "bad" }] }));
    expect(await collect(greenhouse.fetch(makeCtx(client), company()))).toHaveLength(3);
  });
});

describe("lever", () => {
  const data = fixture<Array<{ id: string; categories: { location: string } }>>(
    "lever/spotify.postings.json",
  );

  it("maps the real payload", async () => {
    const { client, calls } = fakeHttp(() => data);
    const jobs = await collect(
      lever.fetch(makeCtx(client), company({ name: "Spotify", atsKey: "spotify" })),
    );
    expect(calls[0]!.url).toBe("https://api.lever.co/v0/postings/spotify?mode=json");
    expect(jobs).toHaveLength(3);
    const j = jobs[0]!;
    expect(j.sourceJobId).toBe(data[0]!.id);
    expect(j.companyName).toBe("Spotify");
    expect(j.locationRaw).toContain(data[0]!.categories.location);
    expect(j.remoteHint).toBe("hybrid");
    expect(j.countryHint).toBe("US");
    expect(j.descriptionText!.length).toBeGreaterThan(50);
  });

  it("supports EU boards", () => {
    expect(leverEndpoint("eu:acme")).toEqual({ base: "https://api.eu.lever.co", slug: "acme" });
    expect(leverEndpoint("acme")).toEqual({ base: "https://api.lever.co", slug: "acme" });
  });
});

describe("ashby", () => {
  const data = fixture<{ jobs: unknown[] }>("ashby/cohere.job-board.json");

  it("maps the real payload with structured address and salary", async () => {
    const { client, calls } = fakeHttp(() => data);
    const jobs = await collect(
      ashby.fetch(makeCtx(client), company({ name: "Cohere", atsKey: "cohere" })),
    );
    expect(calls[0]!.url).toContain("includeCompensation=true");
    expect(jobs).toHaveLength(3);
    const j = jobs[0]!;
    expect(j.locationRaw).toBe("Toronto, Ontario, Canada");
    expect(j.salaryMin).toBe(215000);
    expect(j.salaryMax).toBe(295000);
    expect(j.salaryCurrency).toBe("CAD");
  });

  it("skips unlisted jobs", async () => {
    const jobsIn = data.jobs.map((j, i) => ({ ...(j as object), isListed: i !== 0 }));
    const { client } = fakeHttp(() => ({ ...data, jobs: jobsIn }));
    expect(await collect(ashby.fetch(makeCtx(client), company()))).toHaveLength(2);
  });
});

describe("smartrecruiters", () => {
  const list = fixture<{ content: Array<{ id: string }> }>(
    "smartrecruiters/ubisoft2.postings.json",
  );
  const detail = fixture("smartrecruiters/ubisoft2.posting-detail.json");
  const firstId = list.content[0]!.id;
  const route = (url: string) => (url.includes("/postings?") ? { ...list, totalFound: 3 } : detail);

  it("lists, then fetches details for unknown jobs", async () => {
    const { client, calls } = fakeHttp(route);
    const jobs = await collect(
      smartrecruiters.fetch(
        makeCtx(client, { knownIds: new Set(list.content.slice(1).map((c) => c.id)) }),
        company({ name: "Ubisoft", atsKey: "ubisoft2" }),
      ),
    );
    expect(jobs).toHaveLength(3);
    expect(calls.filter((c) => c.url.endsWith(`/postings/${firstId}`))).toHaveLength(1);
    expect(calls).toHaveLength(2); // 1 list page + 1 detail
    const j = jobs[0]!;
    expect(j.companyName).toBe("Ubisoft");
    expect(j.locationRaw).toBe("Montreal, QC, Canada");
    expect(j.countryHint).toBe("ca");
    expect(j.url).toMatch(/^https:\/\/jobs\.smartrecruiters\.com\/Ubisoft2\//);
    expect(j.descriptionHtml).toContain("Description du poste");
  });

  it("skips details when the title pre-filter says no", async () => {
    const { client, calls } = fakeHttp(route);
    await collect(
      smartrecruiters.fetch(
        makeCtx(client, { wantDetails: () => false }),
        company({ atsKey: "ubisoft2" }),
      ),
    );
    expect(calls).toHaveLength(1);
  });

  it("paginates by offset", async () => {
    const { client, calls } = fakeHttp((url) =>
      url.includes("/postings?") ? { ...list, totalFound: 250 } : detail,
    );
    await collect(
      smartrecruiters.fetch(
        makeCtx(client, { wantDetails: () => false }),
        company({ atsKey: "x" }),
      ),
    );
    expect(calls.map((c) => new URL(c.url).searchParams.get("offset"))).toEqual([
      "0",
      "100",
      "200",
    ]);
  });
});

describe("workday", () => {
  const list = fixture<{ total: number; jobPostings: Array<{ externalPath: string }> }>(
    "workday/salesforce.jobs.json",
  );
  const detail = fixture("workday/salesforce.job-detail.json");
  const key = "salesforce/wd12/External_Career_Site";

  it("parses ats_key", () => {
    expect(parseWorkdayKey(key)).toMatchObject({
      tenant: "salesforce",
      site: "External_Career_Site",
      api: "https://salesforce.wd12.myworkdayjobs.com/wday/cxs/salesforce/External_Career_Site",
    });
    expect(() => parseWorkdayKey("salesforce")).toThrow(/invalid ats_key/);
  });

  it("parses relative posted dates", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    expect(parsePostedOn("Posted Today", now)).toEqual(now);
    expect(parsePostedOn("Posted Yesterday", now)).toEqual(new Date("2026-11-12T12:00:00Z"));
    expect(parsePostedOn("Posted 30+ Days Ago", now)).toEqual(new Date("2026-10-14T12:00:00Z"));
    expect(parsePostedOn(undefined, now)).toBeUndefined();
  });

  it("paginates with POST using the first-page total, and enriches with details", async () => {
    const pages: number[] = [];
    const { client, calls } = fakeHttp((url, opts) => {
      if (url.endsWith("/jobs")) {
        const offset = (opts.body as { offset: number }).offset;
        pages.push(offset);
        // Workday only sends `total` on the first page.
        return offset === 0 ? { ...list, total: 23 } : { ...list, total: 0 };
      }
      return detail;
    });
    const jobs = await collect(
      workday.fetch(
        makeCtx(client, { wantDetails: (t) => t.startsWith("Senior Product") }),
        company({ name: "Salesforce", atsKey: key }),
      ),
    );
    expect(pages).toEqual([0, 20]);
    expect(calls[0]!.opts.method).toBe("POST");
    expect(jobs).toHaveLength(6);
    const enriched = jobs[0]!;
    expect(enriched.url).toMatch(
      /^https:\/\/salesforce\.wd12\.myworkdayjobs\.com\/External_Career_Site\/job\//,
    );
    expect(enriched.countryHint).toBe("US");
    expect(enriched.remoteHint).toBe("hybrid");
    expect(enriched.employmentType).toBe("Full time");
    expect(enriched.descriptionHtml).toContain("<p");
    const listOnly = jobs[1]!;
    expect(listOnly.descriptionHtml).toBeUndefined();
    expect(listOnly.locationRaw).toBe("3 Locations");
    expect(listOnly.sourceJobId).toBe(list.jobPostings[1]!.externalPath);
  });
});
