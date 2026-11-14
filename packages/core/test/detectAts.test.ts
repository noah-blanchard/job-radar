import { describe, expect, it } from "vitest";
import { detectAts, extractUrls } from "../src/discovery/detectAts";

// Real URLs seen in SimplifyJobs/New-Grad-Positions and on careers pages (2026-11-13).
const CASES: Array<[string, string | null, string | null]> = [
  // Greenhouse
  ["https://job-boards.greenhouse.io/airtable/jobs/8434307002", "greenhouse", "airtable"],
  ["https://boards.greenhouse.io/stripe/jobs/7215467", "greenhouse", "stripe"],
  ["https://job-boards.eu.greenhouse.io/agency/jobs/4857878101", "greenhouse", "agency"],
  ["https://boards.greenhouse.io/embed/job_board?for=Databricks", "greenhouse", "databricks"],
  ["https://boards.greenhouse.io/embed/job_app?token=7733209", null, null],
  // Lever
  ["https://jobs.lever.co/ivo/3ce9dc16-90fd-4b99-b4b9-dfd48ec1a50d", "lever", "ivo"],
  ["https://jobs.lever.co/voltus/c8e44a4d-f53f-495d-835e-749f1d55d109/apply", "lever", "voltus"],
  ["https://jobs.eu.lever.co/acme/123", "lever", "eu:acme"],
  // Ashby
  [
    "https://jobs.ashbyhq.com/openai/4476b271-4987-4bd4-aa1e-0e68ea683b10/application",
    "ashby",
    "openai",
  ],
  ["https://jobs.ashbyhq.com/jerry.ai/9254959a-9d5c-4571-bedd-44a3996fdc6c", "ashby", "jerry.ai"],
  // Workday (with and without locale, any case)
  [
    "https://ngc.wd1.myworkdayjobs.com/Northrop_Grumman_External_Site/job/United-States-California-San-Diego/Systems-Engineer_R10226323",
    "workday",
    "ngc/wd1/Northrop_Grumman_External_Site",
  ],
  [
    "https://intel.wd1.myworkdayjobs.com/en-us/external/job/US-Oregon-Hillsboro/GPU-Software-Development-Engineer_JR0282186",
    "workday",
    "intel/wd1/external",
  ],
  [
    "https://cvshealth.wd1.myworkdayjobs.com/en-US/cvs_health_careers/job/Work-At-Home-Illinois/x_R0856858",
    "workday",
    "cvshealth/wd1/cvs_health_careers",
  ],
  [
    "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs",
    null,
    null,
  ],
  // SmartRecruiters (case-insensitive ids)
  ["https://jobs.smartrecruiters.com/AbbVie/3743990012221422", "smartrecruiters", "abbvie"],
  ["https://careers.smartrecruiters.com/Ubisoft2", "smartrecruiters", "ubisoft2"],
  ["https://jobs.smartrecruiters.com/oneclick-ui/company/x/publication/y", null, null],
  // Workable
  ["https://apply.workable.com/thorlabs/j/AAB6CC9387/apply", "workable", "thorlabs"],
  ["https://apply.workable.com/j/81B46579FE", null, null],
  // Recruitee, Personio, Breezy, BambooHR, Teamtailor, Pinpoint, Rippling
  [
    "https://constructivedialogue.recruitee.com/o/software-engineer-early-career",
    "recruitee",
    "constructivedialogue",
  ],
  ["https://1komma5grad.jobs.personio.de/job/2625533", "personio", "1komma5grad"],
  ["https://tado.jobs.personio.com/", "personio", "tado"],
  ["https://jnd-inc.breezy.hr/p/1759aba05044/apply", "breezy", "jnd-inc"],
  ["https://euna.bamboohr.com/careers/618/", "bamboohr", "euna"],
  ["https://www.bamboohr.com/careers", null, null],
  [
    "https://noda-1720000970.teamtailor.com/jobs/7652424-assistant-product-manager?ats=teamtailor",
    "teamtailor",
    "noda-1720000970.teamtailor.com",
  ],
  [
    "https://wolve.pinpointhq.com/en/postings/71814bfd-b9a3-4e7a-8c32-ef0ed6f3f7aa?ats=pinpointhq",
    "pinpoint",
    "wolve",
  ],
  [
    "https://ats.rippling.com/flexai/jobs/93ada67c-8527-427c-b2f6-4a5557b00674",
    "rippling",
    "flexai",
  ],
  // Oracle Recruiting Cloud
  [
    "https://eedu.fa.em3.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1003/job/202601653",
    "oracle_rc",
    "eedu.fa.em3.oraclecloud.com/CX_1003",
  ],
  [
    "https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210727192",
    "oracle_rc",
    "jpmc.fa.oraclecloud.com/CX_1001",
  ],
  // Not supported / not an ATS
  [
    "https://jobs.intuit.com/job/london/graduate-software-engineer-1/27595/103261389616",
    null,
    null,
  ],
  ["https://careers-gdms.icims.com/jobs/1234/job", null, null],
  ["https://go.vansh.nyc/1zw", null, null],
  ["mailto:jobs@example.com", null, null],
  ["not a url", null, null],
];

describe("detectAts", () => {
  it.each(CASES)("%s", (url, ats, atsKey) => {
    const r = detectAts(url);
    if (ats === null) expect(r).toBeNull();
    else expect(r).toEqual({ ats, atsKey });
  });

  it("handles empty input", () => {
    expect(detectAts(undefined)).toBeNull();
    expect(detectAts("")).toBeNull();
  });
});

describe("extractUrls", () => {
  it("finds entity-escaped links in HN comment HTML", () => {
    const html =
      'Apply: <a href="https:&#x2F;&#x2F;jobs.ashbyhq.com&#x2F;acme" rel="nofollow">https:&#x2F;&#x2F;jobs.ashbyhq.com&#x2F;acme</a>. Or https://boards.greenhouse.io/foo/jobs/1.';
    const urls = extractUrls(html);
    expect(urls).toContain("https://jobs.ashbyhq.com/acme");
    expect(urls).toContain("https://boards.greenhouse.io/foo/jobs/1");
    // href and link text are the same URL: deduplicated.
    expect(urls).toHaveLength(2);
    expect(urls.map((u) => detectAts(u)?.ats)).toEqual(["ashby", "greenhouse"]);
  });
});
