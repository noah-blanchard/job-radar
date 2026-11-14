import { z } from "zod";
import { parseItems } from "./parse";
import { ConnectorError, requireCompany, type Connector } from "./types";

// Verified 2026-11-13: GET www.amazon.jobs/en/search.json?country=CAN&result_limit=100&offset=N
//   &sort=recent -> 200 {hits, jobs} with description, qualifications, location, posted_date.
// Canada: 357 jobs, France: 211, USA: tens of thousands. The ats_key is the list of ISO3
// countries fetched completely (e.g. "CAN,FRA"), so missing jobs can safely be closed.
const API = "https://www.amazon.jobs/en/search.json";
const PAGE = 100;
const MAX_PAGES = 30;

const ISO3: Record<string, string> = { CAN: "CA", USA: "US", FRA: "FR", GBR: "GB", DEU: "DE" };

const Job = z.object({
  id: z.string(),
  id_icims: z.string().nullish(),
  title: z.string(),
  company_name: z.string().nullish(),
  job_path: z.string(),
  url_next_step: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  country_code: z.string().nullish(),
  normalized_location: z.string().nullish(),
  posted_date: z.string().nullish(),
  job_schedule_type: z.string().nullish(),
  description: z.string().nullish(),
  basic_qualifications: z.string().nullish(),
  preferred_qualifications: z.string().nullish(),
});
const Response = z.object({ hits: z.number(), jobs: z.array(z.unknown()) });

export function amazonCountries(atsKey: string): string[] {
  const list = atsKey
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  for (const c of list)
    if (!/^[A-Z]{3}$/.test(c))
      throw new ConnectorError(`amazon: invalid ats_key "${atsKey}" (expected ISO3 list)`);
  return list;
}

export const amazon: Connector = {
  id: "amazon",
  kind: "ats",
  needsCompany: true,
  async *fetch(ctx, company) {
    const c = requireCompany("amazon", company);
    countries: for (const country of amazonCountries(c.atsKey)) {
      for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams({
          country,
          result_limit: String(PAGE),
          offset: String(page * PAGE),
          sort: "recent",
        });
        const res = await ctx.http.json(`${API}?${params}`);
        if (res.notModified) continue countries;
        const body = Response.safeParse(res.data);
        if (!body.success) throw new ConnectorError(`amazon: unexpected payload (${country})`);

        for (const j of parseItems(Job, body.data.jobs, ctx.log, "amazon")) {
          const url = `https://www.amazon.jobs${j.job_path}`;
          const sections = [
            j.description,
            j.basic_qualifications && `<h3>Basic qualifications</h3>${j.basic_qualifications}`,
            j.preferred_qualifications &&
              `<h3>Preferred qualifications</h3>${j.preferred_qualifications}`,
          ].filter(Boolean);
          yield {
            source: "amazon",
            sourceJobId: j.id_icims ?? j.id,
            companyName: c.name,
            title: j.title.trim(),
            url,
            applyUrl: j.url_next_step ?? url,
            locationRaw:
              [j.city, j.state].filter(Boolean).join(", ") || j.normalized_location || undefined,
            countryHint: ISO3[j.country_code ?? ""] ?? undefined,
            employmentType: j.job_schedule_type ?? undefined,
            postedAt: j.posted_date ? new Date(`${j.posted_date} 12:00 UTC`) : undefined,
            descriptionHtml: sections.join("\n") || undefined,
          };
        }
        if ((page + 1) * PAGE >= body.data.hits || body.data.jobs.length < PAGE) continue countries;
      }
      // Incomplete fetch: fail the run so that missing jobs are not closed.
      throw new ConnectorError(`amazon: page cap reached for ${country}`);
    }
  },
};
