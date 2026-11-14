import { z } from "zod";
import { decodeEntities } from "../normalize/html";
import { parseItems } from "./parse";
import { ConnectorError, requireCompany, type Connector } from "./types";

// Verified 2026-11-13: GET boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true -> 200, ETag, 304 on If-None-Match.
const JobSchema = z.object({
  id: z.number(),
  title: z.string(),
  absolute_url: z.string(),
  updated_at: z.string().nullish(),
  first_published: z.string().nullish(),
  company_name: z.string().nullish(),
  location: z.object({ name: z.string().nullish() }).nullish(),
  content: z.string().nullish(),
});
const ResponseSchema = z.object({ jobs: z.array(z.unknown()) });

export const greenhouse: Connector = {
  id: "greenhouse",
  kind: "ats",
  needsCompany: true,
  async *fetch(ctx, company) {
    const c = requireCompany("greenhouse", company);
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.atsKey)}/jobs?content=true`;
    const res = await ctx.http.json(url, { cacheKey: `greenhouse:${c.atsKey}` });
    if (res.notModified) return ctx.markUnchanged();
    const parsed = ResponseSchema.safeParse(res.data);
    if (!parsed.success) throw new ConnectorError(`greenhouse: unexpected payload for ${c.atsKey}`);

    for (const j of parseItems(JobSchema, parsed.data.jobs, ctx.log, "greenhouse")) {
      const posted = j.first_published ?? j.updated_at;
      yield {
        source: "greenhouse",
        sourceJobId: String(j.id),
        companyName: j.company_name ?? c.name,
        title: j.title.trim(),
        url: j.absolute_url,
        applyUrl: j.absolute_url,
        locationRaw: j.location?.name ?? undefined,
        postedAt: posted ? new Date(posted) : undefined,
        // Greenhouse returns entity-escaped HTML.
        descriptionHtml: j.content ? decodeEntities(j.content) : undefined,
      };
    }
  },
};
