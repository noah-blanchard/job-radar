import { describe, expect, it } from "vitest";
import { amazon, amazonCountries } from "../src/connectors/amazon";
import { bamboohr } from "../src/connectors/bamboohr";
import { breezy } from "../src/connectors/breezy";
import { oracleRc, parseOracleKey } from "../src/connectors/oracle";
import { personio } from "../src/connectors/personio";
import { pinpoint } from "../src/connectors/pinpoint";
import { parseRecruiteeDate, recruitee } from "../src/connectors/recruitee";
import { rippling } from "../src/connectors/rippling";
import { teamtailor } from "../src/connectors/teamtailor";
import { workable } from "../src/connectors/workable";
import { collect, company, fakeHttp, fixture, makeCtx, textFixture } from "./helpers";

describe("workable", () => {
  it("maps the real payload (details=true)", async () => {
    const { client, calls } = fakeHttp(() => fixture("workable/huggingface.json"));
    const jobs = await collect(
      workable.fetch(makeCtx(client), company({ name: "HF", atsKey: "huggingface" })),
    );
    expect(calls[0]!.url).toBe(
      "https://apply.workable.com/api/v1/widget/accounts/huggingface?details=true",
    );
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      sourceJobId: "81B46579FE",
      companyName: "Hugging Face",
      remoteHint: "remote",
      countryHint: "FR",
      locationRaw: "Paris, Île-de-France, France",
    });
    expect(jobs[0]!.descriptionHtml!.length).toBeGreaterThan(100);
  });
});

describe("recruitee", () => {
  it("maps the real payload", async () => {
    const { client, calls } = fakeHttp(() => fixture("recruitee/bunq.offers.json"));
    const jobs = await collect(recruitee.fetch(makeCtx(client), company({ atsKey: "bunq" })));
    expect(calls[0]!.url).toBe("https://bunq.recruitee.com/api/offers/");
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      sourceJobId: "2823928",
      companyName: "bunq",
      title: "Security Engineer",
      countryHint: "NL",
      remoteHint: "hybrid",
      url: "https://careers.bunq.com/o/security-engineer-3",
    });
    expect(jobs[0]!.postedAt?.toISOString()).toBe("2026-11-11T13:21:40.000Z");
    expect(jobs[0]!.salaryMin).toBeUndefined();
  });

  it("parses its date format", () => {
    expect(parseRecruiteeDate("2026-11-11 13:21:40 UTC")?.toISOString()).toBe(
      "2026-11-11T13:21:40.000Z",
    );
    expect(parseRecruiteeDate("garbage")).toBeUndefined();
  });
});

describe("personio", () => {
  it("parses the XML feed with CDATA descriptions and salary", async () => {
    const { client, calls } = fakeHttp(() => textFixture("personio/1komma5grad.xml"));
    const jobs = await collect(personio.fetch(makeCtx(client), company({ atsKey: "1komma5grad" })));
    expect(calls[0]!.url).toBe("https://1komma5grad.jobs.personio.de/xml");
    expect(calls[0]!.opts.cacheKey).toBe("personio:1komma5grad");
    expect(jobs.map((j) => j.sourceJobId)).toEqual(["2800938", "2625533", "2502124"]);
    const j = jobs[1]!;
    expect(j.url).toBe("https://1komma5grad.jobs.personio.de/job/2625533");
    expect(j.title).toMatch(/^\(Junior\) Technisches Auftragsmanagement/);
    expect(j.locationRaw).toBe("Riederich");
    expect(j.companyName).toBe("1KOMMA5° Riederich GmbH");
    expect(j.descriptionHtml).toContain("<h3>Deine Position</h3>");
    expect(j.descriptionHtml).toContain("<ul>");
    expect(j.employmentType).toBe("permanent, full-time");
    // tado position carries a yearly salary range.
    expect(jobs[2]).toMatchObject({ salaryMin: 80000, salaryMax: 100000, salaryCurrency: "EUR" });
  });

  it("accepts an empty board and 304", async () => {
    const empty = fakeHttp(() => '<?xml version="1.0"?>\n<workzag-jobs>\n\n</workzag-jobs>');
    expect(await collect(personio.fetch(makeCtx(empty.client), company()))).toEqual([]);
    const ctx = makeCtx(fakeHttp(() => "304").client);
    await collect(personio.fetch(ctx, company()));
    expect(ctx.unchanged).toBe(true);
  });

  it("rejects HTML", async () => {
    const { client } = fakeHttp(() => "<html><body>nope</body></html>");
    await expect(collect(personio.fetch(makeCtx(client), company()))).rejects.toThrow(/unexpected/);
  });
});

describe("bamboohr", () => {
  const list = fixture("bamboohr/euna.list.json");
  const detail = fixture("bamboohr/euna.detail.json");

  it("fetches details only for new, plausible jobs", async () => {
    const { client, calls } = fakeHttp((url) => (url.endsWith("/detail") ? detail : list));
    const ctx = makeCtx(client, { knownIds: new Set(["705"]) });
    const jobs = await collect(bamboohr.fetch(ctx, company({ atsKey: "euna" })));
    expect(calls[0]!.url).toBe("https://euna.bamboohr.com/careers/list");
    // 692 and 706 are new; 705 is known.
    expect(calls.filter((c) => c.url.endsWith("/detail")).map((c) => c.url)).toEqual([
      "https://euna.bamboohr.com/careers/692/detail",
      "https://euna.bamboohr.com/careers/706/detail",
    ]);
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      sourceJobId: "692",
      title: "Solutions Consultant",
      url: "https://euna.bamboohr.com/careers/692",
      countryHint: "United States",
    });
    expect(jobs[0]!.descriptionHtml!.length).toBeGreaterThan(100);
    expect(jobs[0]!.postedAt?.toISOString().slice(0, 10)).toBe("2026-07-13");
    expect(jobs[1]!.descriptionHtml).toBeUndefined();
  });
});

describe("breezy", () => {
  it("maps the real payload", async () => {
    const { client, calls } = fakeHttp(() => fixture("breezy/nucleusteq.json"));
    const jobs = await collect(breezy.fetch(makeCtx(client), company({ atsKey: "nucleusteq" })));
    expect(calls[0]!.url).toBe("https://nucleusteq.breezy.hr/json");
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      sourceJobId: "687f31c86ba8",
      companyName: "NucleusTeq",
      locationRaw: "Indore, Raipur, IN",
      countryHint: "IN",
      employmentType: "Full-Time",
    });
  });
});

describe("teamtailor", () => {
  it("parses the RSS feed with tt:locations", async () => {
    const { client, calls } = fakeHttp(() => textFixture("teamtailor/career.rss"));
    const jobs = await collect(
      teamtailor.fetch(
        makeCtx(client),
        company({ name: "Teamtailor", atsKey: "career.teamtailor.com" }),
      ),
    );
    expect(calls[0]!.url).toBe("https://career.teamtailor.com/jobs.rss");
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      title: "Customer Success Manager - French Speaking",
      sourceJobId: "f6c31512-671a-4e1c-be54-c8a1e2552144",
      remoteHint: "hybrid",
      locationRaw: "Stockholm, Sweden; Barcelona, Spain",
      countryHint: "Sweden",
    });
    expect(jobs[0]!.descriptionHtml).toContain("<h4>");
  });

  it("builds the host from a bare slug", async () => {
    const { client, calls } = fakeHttp(() => textFixture("teamtailor/career.rss"));
    await collect(teamtailor.fetch(makeCtx(client), company({ atsKey: "acme" })));
    expect(calls[0]!.url).toBe("https://acme.teamtailor.com/jobs.rss");
  });
});

describe("pinpoint", () => {
  it("maps the real payload", async () => {
    const { client } = fakeHttp(() => fixture("pinpoint/wolve.postings.json"));
    const jobs = await collect(
      pinpoint.fetch(makeCtx(client), company({ name: "Wolverine", atsKey: "wolve" })),
    );
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      sourceJobId: "450735",
      title: "Systematic Options Trader",
      remoteHint: "onsite",
      locationRaw: "Chicago, IL",
    });
    expect(jobs[0]!.descriptionHtml).toContain("What You");
  });
});

describe("rippling", () => {
  it("lists jobs and fetches the detail of new ones", async () => {
    const list = fixture("rippling/flexai.jobs.json");
    const detail = fixture("rippling/flexai.job-detail.json");
    const { client, calls } = fakeHttp((url) => (url.endsWith("/jobs") ? list : detail));
    const jobs = await collect(rippling.fetch(makeCtx(client), company({ atsKey: "flexai" })));
    expect(calls[0]!.url).toBe("https://api.rippling.com/platform/api/ats/v1/board/flexai/jobs");
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.descriptionHtml).toContain("About FlexAI");
    expect(jobs[0]!.postedAt).toBeInstanceOf(Date);

    // "Senior ..." titles skip the detail call when wantDetails says no.
    const lean = fakeHttp(() => list);
    await collect(
      rippling.fetch(
        makeCtx(lean.client, { wantDetails: () => false }),
        company({ atsKey: "flexai" }),
      ),
    );
    expect(lean.calls).toHaveLength(1);
  });
});

describe("oracle_rc", () => {
  it("parses ats_key", () => {
    expect(parseOracleKey("eeho.fa.us2.oraclecloud.com/CX_45001")).toEqual({
      host: "eeho.fa.us2.oraclecloud.com",
      site: "CX_45001",
    });
    expect(() => parseOracleKey("evil.example.com/CX_1")).toThrow(/invalid ats_key/);
  });

  it("maps the real payload", async () => {
    const { client, calls } = fakeHttp(() => fixture("oracle_rc/eeho.CX_45001.json"));
    const jobs = await collect(
      oracleRc.fetch(
        makeCtx(client),
        company({ name: "Oracle", atsKey: "eeho.fa.us2.oraclecloud.com/CX_45001" }),
      ),
    );
    expect(calls[0]!.url).toContain("expand=requisitionList.secondaryLocations");
    expect(calls[0]!.url).toContain("finder=findReqs;siteNumber=CX_45001,limit=200,offset=0");
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      sourceJobId: "350416",
      title: "Principal Optical Engineer",
      url: "https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_45001/job/350416",
      locationRaw: "Seattle, WA, United States",
      countryHint: "US",
    });
  });
});

describe("amazon", () => {
  it("parses ats_key as ISO3 countries", () => {
    expect(amazonCountries("CAN,fra")).toEqual(["CAN", "FRA"]);
    expect(() => amazonCountries("Canada")).toThrow(/ISO3/);
  });

  it("maps the real payload", async () => {
    const { client, calls } = fakeHttp(() => fixture("amazon/can.search.json"));
    const jobs = await collect(
      amazon.fetch(makeCtx(client), company({ name: "Amazon", atsKey: "CAN" })),
    );
    const u = new URL(calls[0]!.url);
    expect(u.searchParams.get("country")).toBe("CAN");
    expect(u.searchParams.get("result_limit")).toBe("100");
    // 92 hits < 100: one page.
    expect(calls).toHaveLength(1);
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      sourceJobId: "10603343",
      companyName: "Amazon",
      locationRaw: "Vancouver, BC",
      countryHint: "CA",
    });
    expect(jobs[0]!.url).toMatch(/^https:\/\/www\.amazon\.jobs\/en\/jobs\/10603343\//);
    expect(jobs[0]!.descriptionHtml).toContain("Basic qualifications");
    expect(jobs[2]!.postedAt?.toISOString().slice(0, 10)).toBe("2026-11-09");
  });
});
