import { z } from "zod";
import { parseItems } from "./parse";
import { domainTerms, SENIORITY_TERMS } from "./queries";
import { ConnectorError, requireKeys, takeQuota, type Connector, type FetchCtx } from "./types";

// Verified 2026-11-13: GET api.adzuna.com/v1/api/jobs/{cc}/search/{page}?app_id&app_key
//   &results_per_page=50&max_days_old=N&sort_by=date&title_only={term}&what_or={words}
// -> 200 {count, results}. `title_only=junior&what_or=react typescript node ...` gives relevant
// results ("Junior Fullstack Engineer"); plain `what=new grad` matched descriptions (noise).
const API = "https://api.adzuna.com/v1/api/jobs";
const PER_PAGE = 50;
const MAX_PAGES = 2;

const Job = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string(),
  redirect_url: z.string(),
  created: z.string().nullish(),
  description: z.string().nullish(),
  company: z.object({ display_name: z.string().nullish() }).nullish(),
  location: z
    .object({ display_name: z.string().nullish(), area: z.array(z.string()).nullish() })
    .nullish(),
  salary_min: z.number().nullish(),
  salary_max: z.number().nullish(),
  salary_is_predicted: z.union([z.string(), z.number()]).nullish(),
  contract_time: z.string().nullish(),
});
const Response = z.object({ count: z.number(), results: z.array(z.unknown()) });

const CURRENCY: Record<string, string> = { ca: "CAD", us: "USD", gb: "GBP", fr: "EUR", de: "EUR" };

export interface AdzunaQuery {
  country: string;
  titleOnly: string;
  whatOr: string;
}

/** Countries (ADZUNA_COUNTRIES) x seniority words x profile domains. */
export function adzunaQueries(ctx: Pick<FetchCtx, "env" | "profile">): AdzunaQuery[] {
  const domains = domainTerms(ctx.profile).filter((d) => d.words.length > 0);
  const out: AdzunaQuery[] = [];
  for (const country of ctx.env.ADZUNA_COUNTRIES.map((c) => c.toLowerCase())) {
    const terms = country === "fr" ? SENIORITY_TERMS.fr : SENIORITY_TERMS.en;
    for (const titleOnly of terms)
      for (const d of domains) out.push({ country, titleOnly, whatOr: d.words.join(" ") });
  }
  return out;
}

/** max_days_old: days since the last successful run (+1), between 1 and 7; 2 on first run. */
function maxDaysOld(since: Date | undefined, now = new Date()) {
  if (!since) return 2;
  return Math.min(7, Math.max(1, Math.ceil((now.getTime() - since.getTime()) / 86_400_000) + 1));
}

export const adzuna: Connector = {
  id: "adzuna",
  kind: "aggregator",
  needsCompany: false,
  async *fetch(ctx) {
    const { ADZUNA_APP_ID, ADZUNA_APP_KEY } = requireKeys("adzuna", ctx.env, [
      "ADZUNA_APP_ID",
      "ADZUNA_APP_KEY",
    ]);
    const seen = new Set<string>();
    const days = maxDaysOld(ctx.since);

    for (const q of adzunaQueries(ctx)) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        if (!(await takeQuota(ctx, "adzuna"))) return;
        const params = new URLSearchParams({
          app_id: ADZUNA_APP_ID,
          app_key: ADZUNA_APP_KEY,
          results_per_page: String(PER_PAGE),
          max_days_old: String(days),
          sort_by: "date",
          title_only: q.titleOnly,
          what_or: q.whatOr,
          "content-type": "application/json",
        });
        const res = await ctx.http.json(`${API}/${q.country}/search/${page}?${params}`);
        if (res.notModified) break;
        const body = Response.safeParse(res.data);
        if (!body.success) throw new ConnectorError(`adzuna: unexpected payload (${q.country})`);

        for (const j of parseItems(Job, body.data.results, ctx.log, "adzuna")) {
          const company = j.company?.display_name?.trim();
          if (!company || seen.has(j.id)) continue;
          seen.add(j.id);
          const area = j.location?.area ?? [];
          const place = j.location?.display_name ?? undefined;
          const real = String(j.salary_is_predicted ?? "0") === "0";
          yield {
            source: "adzuna",
            sourceJobId: j.id,
            companyName: company,
            title: j.title.trim(),
            url: j.redirect_url,
            locationRaw:
              place && area[0] && !place.includes(area[0]) ? `${place}, ${area[0]}` : place,
            countryHint: q.country.toUpperCase(),
            employmentType: j.contract_time ?? undefined,
            postedAt: j.created ? new Date(j.created) : undefined,
            descriptionText: j.description ?? undefined,
            salaryMin: real ? (j.salary_min ?? undefined) : undefined,
            salaryMax: real ? (j.salary_max ?? undefined) : undefined,
            salaryCurrency: real && j.salary_min ? CURRENCY[q.country] : undefined,
          };
        }
        if (page * PER_PAGE >= body.data.count || body.data.results.length < PER_PAGE) break;
      }
    }
  },
};
