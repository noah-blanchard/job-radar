import { z } from "zod";
import { parseItems } from "./parse";
import { ConnectorError, requireCompany, type Connector } from "./types";

// Verified 2026-11-13: GET apply.workable.com/api/v1/widget/accounts/huggingface?details=true
// -> 200 {name, description, jobs} (details=true adds the HTML description). No ETag.
const Location = z.object({
  country: z.string().nullish(),
  countryCode: z.string().nullish(),
  city: z.string().nullish(),
  region: z.string().nullish(),
});
const Job = z.object({
  title: z.string(),
  shortcode: z.string(),
  employment_type: z.string().nullish(),
  telecommuting: z.boolean().nullish(),
  url: z.string(),
  application_url: z.string().nullish(),
  published_on: z.string().nullish(),
  country: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  locations: z.array(Location).nullish(),
  description: z.string().nullish(),
});
const Response = z.object({ name: z.string().nullish(), jobs: z.array(z.unknown()) });

export const workable: Connector = {
  id: "workable",
  kind: "ats",
  needsCompany: true,
  async *fetch(ctx, company) {
    const c = requireCompany("workable", company);
    const res = await ctx.http.json(
      `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(c.atsKey)}?details=true`,
    );
    if (res.notModified) return ctx.markUnchanged();
    const body = Response.safeParse(res.data);
    if (!body.success) throw new ConnectorError(`workable: unexpected payload for ${c.atsKey}`);

    for (const j of parseItems(Job, body.data.jobs, ctx.log, "workable")) {
      const first = j.locations?.[0];
      const place = [first?.city ?? j.city, first?.region ?? j.state, first?.country ?? j.country]
        .filter(Boolean)
        .join(", ");
      yield {
        source: "workable",
        sourceJobId: j.shortcode,
        companyName: body.data.name?.trim() || c.name,
        title: j.title.trim(),
        url: j.url,
        applyUrl: j.application_url ?? j.url,
        locationRaw: place || undefined,
        countryHint: first?.countryCode ?? undefined,
        remoteHint: j.telecommuting ? "remote" : undefined,
        employmentType: j.employment_type ?? undefined,
        postedAt: j.published_on ? new Date(`${j.published_on}T12:00:00Z`) : undefined,
        descriptionHtml: j.description ?? undefined,
      };
    }
  },
};
