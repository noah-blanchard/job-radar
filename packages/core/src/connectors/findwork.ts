import { z } from "zod";
import { parseItems } from "./parse";
import { SENIORITY_TERMS } from "./queries";
import { ConnectorError, requireKeys, takeQuota, type Connector } from "./types";

// Verified 2026-11-13: GET findwork.dev/api/jobs/?search=...&sort_by=date
//   (Authorization: Token {key}) -> 200 {count, next, previous, results}.
// Rate limit 10 requests (x-ratelimit-limit): the host is paced at one request every 6.5 s.
// Small, mostly remote dataset: one page per seniority word, no domain split.
const API = "https://findwork.dev/api/jobs/";

const Job = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  role: z.string().nullish(),
  company_name: z.string().nullish(),
  url: z.string(),
  text: z.string().nullish(),
  location: z.string().nullish(),
  remote: z.boolean().nullish(),
  date_posted: z.string().nullish(),
  employment_type: z.string().nullish(),
});
const Response = z.object({ count: z.number(), results: z.array(z.unknown()) });

export const FINDWORK_MIN_INTERVAL_MS = 6500;

export const findwork: Connector = {
  id: "findwork",
  kind: "aggregator",
  needsCompany: false,
  async *fetch(ctx) {
    const { FINDWORK_KEY } = requireKeys("findwork", ctx.env, ["FINDWORK_KEY"]);
    const seen = new Set<string>();

    for (const search of SENIORITY_TERMS.en) {
      if (!(await takeQuota(ctx, "findwork"))) return;
      const params = new URLSearchParams({ search, sort_by: "date" });
      const res = await ctx.http.json(`${API}?${params}`, {
        headers: { authorization: `Token ${FINDWORK_KEY}` },
      });
      if (res.notModified) continue;
      const body = Response.safeParse(res.data);
      if (!body.success) throw new ConnectorError("findwork: unexpected payload");

      for (const j of parseItems(Job, body.data.results, ctx.log, "findwork")) {
        const company = j.company_name?.trim();
        // Some entries have no role (seen in the real payload): nothing to show.
        if (!company || !j.role?.trim() || seen.has(j.id)) continue;
        seen.add(j.id);
        yield {
          source: "findwork",
          sourceJobId: j.id,
          companyName: company,
          title: j.role.trim(),
          url: j.url,
          locationRaw: j.location ?? (j.remote ? "Remote" : undefined),
          remoteHint: j.remote ? "remote" : undefined,
          employmentType: j.employment_type ?? undefined,
          postedAt: j.date_posted ? new Date(j.date_posted) : undefined,
          descriptionHtml: j.text ?? undefined,
        };
      }
    }
  },
};
