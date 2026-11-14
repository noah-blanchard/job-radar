import { z } from "zod";
import { decodeEntities } from "../normalize/html";
import { parseItems } from "./parse";
import { COUNTRY_NAMES, pagingCutoff, profileCountries } from "./queries";
import { ConnectorError, type Connector } from "./types";
import { parseDate, rssItems, xmlText } from "./xml";

/**
 * Remote / public job feeds without key. All verified 2026-11-13 with a real call; each feed's
 * terms ask for a link back to the original posting, which is what `url` stores.
 */

// ---------- Arbeitnow ----------
// GET www.arbeitnow.com/api/job-board-api?page=N -> {data (300/page), links, meta}, newest first,
// `description` is entity-escaped HTML. Rate limit 50 (x-ratelimit-limit).
const ArbeitnowJob = z.object({
  slug: z.string(),
  company_name: z.string(),
  title: z.string(),
  description: z.string().nullish(),
  remote: z.boolean().nullish(),
  url: z.string(),
  location: z.string().nullish(),
  job_types: z.array(z.string()).nullish(),
  created_at: z.number().nullish(),
});
const ArbeitnowPage = z.object({
  data: z.array(z.unknown()),
  links: z.object({ next: z.string().nullish() }).nullish(),
});

export const arbeitnow: Connector = {
  id: "arbeitnow",
  kind: "feed",
  needsCompany: false,
  async *fetch(ctx) {
    const cutoff = pagingCutoff(ctx.since, 3).getTime() / 1000;
    for (let page = 1; page <= 3; page++) {
      const res = await ctx.http.json(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
      if (res.notModified) return;
      const body = ArbeitnowPage.safeParse(res.data);
      if (!body.success) throw new ConnectorError("arbeitnow: unexpected payload");
      let older = false;
      for (const j of parseItems(ArbeitnowJob, body.data.data, ctx.log, "arbeitnow")) {
        if (j.created_at && j.created_at < cutoff) older = true;
        yield {
          source: "arbeitnow",
          sourceJobId: j.slug,
          companyName: j.company_name.trim(),
          title: j.title.trim(),
          url: j.url,
          locationRaw: j.location ?? undefined,
          remoteHint: j.remote ? "remote" : undefined,
          employmentType: j.job_types?.join(", ") || undefined,
          postedAt: j.created_at ? new Date(j.created_at * 1000) : undefined,
          descriptionHtml: j.description ? decodeEntities(j.description) : undefined,
        };
      }
      if (older || !body.data.links?.next) return;
    }
  },
};

// ---------- Remotive ----------
// GET remotive.com/api/remote-jobs?category=software-dev -> {job-count, jobs}. Jobs are delayed
// by 24 h; Remotive asks for at most 4 calls a day (FEEDS_CRON = every 6 h).
const RemotiveJob = z.object({
  id: z.number(),
  url: z.string(),
  title: z.string(),
  company_name: z.string(),
  job_type: z.string().nullish(),
  publication_date: z.string().nullish(),
  candidate_required_location: z.string().nullish(),
  description: z.string().nullish(),
});

export const remotive: Connector = {
  id: "remotive",
  kind: "feed",
  needsCompany: false,
  async *fetch(ctx) {
    const res = await ctx.http.json("https://remotive.com/api/remote-jobs?category=software-dev");
    if (res.notModified) return;
    const body = z.object({ jobs: z.array(z.unknown()) }).safeParse(res.data);
    if (!body.success) throw new ConnectorError("remotive: unexpected payload");
    for (const j of parseItems(RemotiveJob, body.data.jobs, ctx.log, "remotive")) {
      const where = j.candidate_required_location?.trim();
      yield {
        source: "remotive",
        sourceJobId: String(j.id),
        companyName: j.company_name.trim(),
        title: j.title.trim(),
        url: j.url,
        locationRaw: where ? `Remote - ${where}` : "Remote",
        remoteHint: "remote",
        employmentType: j.job_type ?? undefined,
        postedAt: j.publication_date ? new Date(`${j.publication_date}Z`) : undefined,
        descriptionHtml: j.description ?? undefined,
      };
    }
  },
};

// ---------- Remote OK ----------
// GET remoteok.com/api -> [legal notice, ...jobs]. Terms: link back to the Remote OK URL.
const RemoteOkJob = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  position: z.string(),
  company: z.string(),
  url: z.string(),
  location: z.string().nullish(),
  description: z.string().nullish(),
  epoch: z.number().nullish(),
  salary_min: z.number().nullish(),
  salary_max: z.number().nullish(),
});

export const remoteok: Connector = {
  id: "remoteok",
  kind: "feed",
  needsCompany: false,
  async *fetch(ctx) {
    const res = await ctx.http.json("https://remoteok.com/api");
    if (res.notModified) return;
    if (!Array.isArray(res.data)) throw new ConnectorError("remoteok: unexpected payload");
    const items = (res.data as unknown[]).filter(
      (x) => typeof x === "object" && x !== null && "position" in x,
    );
    for (const j of parseItems(RemoteOkJob, items, ctx.log, "remoteok")) {
      const where = j.location?.trim();
      yield {
        source: "remoteok",
        sourceJobId: j.id,
        companyName: j.company.trim(),
        title: j.position.trim(),
        url: j.url,
        locationRaw: where ? `Remote - ${where}` : "Remote",
        remoteHint: "remote",
        postedAt: j.epoch ? new Date(j.epoch * 1000) : undefined,
        descriptionHtml: j.description ?? undefined,
        salaryMin: j.salary_min || undefined,
        salaryMax: j.salary_max || undefined,
        salaryCurrency: j.salary_min ? "USD" : undefined,
      };
    }
  },
};

// ---------- Himalayas ----------
// GET himalayas.app/jobs/api/search?seniority=Entry-level&country={name}&sort=recent&page=N
// -> {totalCount, jobs (20/page)}. The full feed (/jobs/api) has 118k jobs: the search endpoint
// limited to entry-level jobs in the profile countries is used instead.
const HimalayasJob = z.object({
  title: z.string(),
  companyName: z.string(),
  guid: z.string(),
  applicationLink: z.string().nullish(),
  employmentType: z.string().nullish(),
  minSalary: z.number().nullish(),
  maxSalary: z.number().nullish(),
  currency: z.string().nullish(),
  salaryPeriod: z.string().nullish(),
  locationRestrictions: z.array(z.string()).nullish(),
  description: z.string().nullish(),
  pubDate: z.number().nullish(),
});
const HIMALAYAS_MAX_PAGES = 5;

export const himalayas: Connector = {
  id: "himalayas",
  kind: "feed",
  needsCompany: false,
  async *fetch(ctx) {
    const cutoff = pagingCutoff(ctx.since, 3).getTime() / 1000;
    const countries = profileCountries(ctx.profile)
      .map((c) => COUNTRY_NAMES[c])
      .filter((x): x is string => !!x);
    const seen = new Set<string>();
    for (const country of countries) {
      for (let page = 1; page <= HIMALAYAS_MAX_PAGES; page++) {
        const params = new URLSearchParams({
          seniority: "Entry-level",
          country,
          sort: "recent",
          page: String(page),
        });
        const res = await ctx.http.json(`https://himalayas.app/jobs/api/search?${params}`);
        if (res.notModified) break;
        const body = z.object({ jobs: z.array(z.unknown()) }).safeParse(res.data);
        if (!body.success) throw new ConnectorError("himalayas: unexpected payload");
        let older = body.data.jobs.length === 0;
        for (const j of parseItems(HimalayasJob, body.data.jobs, ctx.log, "himalayas")) {
          if (j.pubDate && j.pubDate < cutoff) older = true;
          if (seen.has(j.guid)) continue;
          seen.add(j.guid);
          const where = (j.locationRestrictions ?? []).join(", ");
          const yearly = j.salaryPeriod === "annual";
          yield {
            source: "himalayas",
            sourceJobId: j.guid,
            companyName: j.companyName.trim(),
            title: j.title.trim(),
            url: j.guid,
            applyUrl: j.applicationLink ?? undefined,
            locationRaw: where ? `Remote - ${where}` : "Remote",
            remoteHint: "remote",
            employmentType: j.employmentType ?? undefined,
            postedAt: j.pubDate ? new Date(j.pubDate * 1000) : undefined,
            descriptionHtml: j.description ?? undefined,
            salaryMin: yearly ? (j.minSalary ?? undefined) : undefined,
            salaryMax: yearly ? (j.maxSalary ?? undefined) : undefined,
            salaryCurrency: yearly && j.minSalary ? (j.currency ?? undefined) : undefined,
          };
        }
        if (older) break;
      }
    }
  },
};

// ---------- Jobicy ----------
// GET jobicy.com/api/v2/remote-jobs?count=50&industry=engineering -> {jobCount, jobs}.
const JobicyJob = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  url: z.string(),
  jobTitle: z.string(),
  companyName: z.string(),
  jobType: z.array(z.string()).nullish(),
  jobGeo: z.string().nullish(),
  jobDescription: z.string().nullish(),
  pubDate: z.string().nullish(),
  salaryMin: z.number().nullish(),
  salaryMax: z.number().nullish(),
  salaryCurrency: z.string().nullish(),
  salaryPeriod: z.string().nullish(),
});

export const jobicy: Connector = {
  id: "jobicy",
  kind: "feed",
  needsCompany: false,
  async *fetch(ctx) {
    const res = await ctx.http.json(
      "https://jobicy.com/api/v2/remote-jobs?count=50&industry=engineering",
    );
    if (res.notModified) return;
    const body = z.object({ jobs: z.array(z.unknown()) }).safeParse(res.data);
    if (!body.success) throw new ConnectorError("jobicy: unexpected payload");
    for (const j of parseItems(JobicyJob, body.data.jobs, ctx.log, "jobicy")) {
      const yearly = j.salaryPeriod === "yearly";
      yield {
        source: "jobicy",
        sourceJobId: j.id,
        companyName: decodeEntities(j.companyName).trim(),
        title: decodeEntities(j.jobTitle).trim(),
        url: j.url,
        locationRaw: j.jobGeo ? `Remote - ${j.jobGeo}` : "Remote",
        remoteHint: "remote",
        employmentType: j.jobType?.join(", ") || undefined,
        postedAt: j.pubDate ? new Date(j.pubDate) : undefined,
        descriptionHtml: j.jobDescription ?? undefined,
        salaryMin: yearly ? (j.salaryMin ?? undefined) : undefined,
        salaryMax: yearly ? (j.salaryMax ?? undefined) : undefined,
        salaryCurrency: yearly && j.salaryMin ? (j.salaryCurrency ?? undefined) : undefined,
      };
    }
  },
};

// ---------- We Work Remotely (RSS) ----------
// GET weworkremotely.com/categories/remote-programming-jobs.rss -> RSS 2.0, title
// "Company: Role", <region>, entity-escaped HTML description. Weak ETag (If-None-Match ignored).
export const weworkremotely: Connector = {
  id: "weworkremotely",
  kind: "feed",
  needsCompany: false,
  async *fetch(ctx) {
    const res = await ctx.http.text(
      "https://weworkremotely.com/categories/remote-programming-jobs.rss",
      { cacheKey: "weworkremotely:programming" },
    );
    if (res.notModified) return ctx.markUnchanged();
    const items = rssItems(res.data);
    if (!items) throw new ConnectorError("weworkremotely: not an RSS feed");
    for (const it of items) {
      const full = xmlText(it.title);
      const link = xmlText(it.link) ?? xmlText(it.guid);
      if (!full || !link) continue;
      const sep = full.indexOf(": ");
      const company = sep > 0 ? full.slice(0, sep) : undefined;
      if (!company) continue;
      const region = xmlText(it.region);
      yield {
        source: "weworkremotely",
        sourceJobId: xmlText(it.guid) ?? link,
        companyName: company.trim(),
        title: full.slice(sep + 2).trim(),
        url: link,
        locationRaw: region ? `Remote - ${region}` : "Remote",
        remoteHint: "remote",
        employmentType: xmlText(it.type),
        postedAt: parseDate(xmlText(it.pubDate)),
        descriptionHtml: xmlText(it.description),
      };
    }
  },
};
