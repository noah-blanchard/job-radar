import { z } from "zod";
import { parseItems } from "./parse";
import { COUNTRY_NAMES, profilePlaces } from "./queries";
import { ConnectorError, requireKeys, takeQuota, type Connector, type FetchCtx } from "./types";

// Verified 2026-11-13: GET jsearch.p.rapidapi.com/search-v2?query=...&page=1&num_pages=1
//   &date_posted=3days (X-RapidAPI-Key/Host) -> 200 {status, data: {jobs}}.
// The old `/search` endpoint now answers 404 "Endpoint '/search' does not exist".
// Free plan: 200 requests/month (X-RateLimit-Requests-Limit), hence JSEARCH_DAILY_MAX_CALLS=3.
const HOST = "jsearch.p.rapidapi.com";

const Job = z.object({
  job_id: z.string(),
  job_title: z.string(),
  employer_name: z.string().nullish(),
  job_apply_link: z.string().nullish(),
  job_google_link: z.string().nullish(),
  apply_options: z.array(z.object({ apply_link: z.string().nullish() })).nullish(),
  job_employment_type: z.string().nullish(),
  job_description: z.string().nullish(),
  job_is_remote: z.boolean().nullish(),
  job_posted_at_datetime_utc: z.string().nullish(),
  job_location: z.string().nullish(),
  job_city: z.string().nullish(),
  job_state: z.string().nullish(),
  job_country: z.string().nullish(),
  job_min_salary: z.number().nullish(),
  job_max_salary: z.number().nullish(),
  job_salary_period: z.string().nullish(),
});
const Response = z.object({
  status: z.string(),
  data: z.object({ jobs: z.array(z.unknown()) }),
});

/** High-yield queries, best place first: the daily quota (1-3 calls) takes them in order. */
export function jsearchQueries(ctx: Pick<FetchCtx, "profile">): string[] {
  return profilePlaces(ctx.profile, COUNTRY_NAMES).map((p) => `new grad software engineer in ${p}`);
}

export const jsearch: Connector = {
  id: "jsearch",
  kind: "aggregator",
  needsCompany: false,
  async *fetch(ctx) {
    const { RAPIDAPI_KEY } = requireKeys("jsearch", ctx.env, ["RAPIDAPI_KEY"]);
    const seen = new Set<string>();

    for (const query of jsearchQueries(ctx)) {
      if (!(await takeQuota(ctx, "jsearch"))) return;
      const params = new URLSearchParams({
        query,
        page: "1",
        num_pages: "1",
        date_posted: "3days",
      });
      const res = await ctx.http.json(`https://${HOST}/search-v2?${params}`, {
        headers: { "x-rapidapi-key": RAPIDAPI_KEY, "x-rapidapi-host": HOST },
      });
      if (res.notModified) continue;
      const body = Response.safeParse(res.data);
      if (!body.success || body.data.status !== "OK")
        throw new ConnectorError("jsearch: unexpected payload");

      for (const j of parseItems(Job, body.data.data.jobs, ctx.log, "jsearch")) {
        const url = j.job_apply_link ?? j.job_google_link;
        const company = j.employer_name?.trim();
        if (!url || !company || seen.has(j.job_id)) continue;
        seen.add(j.job_id);
        const yearly = j.job_salary_period?.toUpperCase() === "YEAR";
        yield {
          source: "jsearch",
          sourceJobId: j.job_id,
          companyName: company,
          title: j.job_title.trim(),
          url,
          applyUrl: url,
          locationRaw:
            j.job_location ??
            ([j.job_city, j.job_state, j.job_country].filter(Boolean).join(", ") || undefined),
          countryHint: j.job_country ?? undefined,
          remoteHint: j.job_is_remote ? "remote" : undefined,
          employmentType: j.job_employment_type ?? undefined,
          postedAt: j.job_posted_at_datetime_utc
            ? new Date(j.job_posted_at_datetime_utc)
            : undefined,
          descriptionText: j.job_description ?? undefined,
          salaryMin: yearly ? (j.job_min_salary ?? undefined) : undefined,
          salaryMax: yearly ? (j.job_max_salary ?? undefined) : undefined,
          // Apply options often point at the employer's ATS: fed to discovery.
          relatedUrls: (j.apply_options ?? [])
            .map((o) => o.apply_link)
            .filter((u): u is string => !!u),
        };
      }
    }
  },
};
