import { z } from "zod";
import { parseItems } from "./parse";
import { ConnectorError, requireCompany, type Connector } from "./types";

// Verified 2026-11-13: GET bunq.recruitee.com/api/offers/ -> 200 {offers} with full HTML
// description and requirements. No ETag.
const Offer = z.object({
  id: z.number(),
  title: z.string(),
  company_name: z.string().nullish(),
  careers_url: z.string(),
  careers_apply_url: z.string().nullish(),
  location: z.string().nullish(),
  country_code: z.string().nullish(),
  remote: z.boolean().nullish(),
  hybrid: z.boolean().nullish(),
  on_site: z.boolean().nullish(),
  published_at: z.string().nullish(),
  employment_type_code: z.string().nullish(),
  description: z.string().nullish(),
  requirements: z.string().nullish(),
  status: z.string().nullish(),
  salary: z
    .object({
      min: z.union([z.string(), z.number()]).nullish(),
      max: z.union([z.string(), z.number()]).nullish(),
      currency: z.string().nullish(),
      period: z.string().nullish(),
    })
    .nullish(),
});

/** "2026-11-11 13:21:40 UTC" -> Date. */
export function parseRecruiteeDate(s: string | null | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s.replace(" UTC", "Z").replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const recruitee: Connector = {
  id: "recruitee",
  kind: "ats",
  needsCompany: true,
  async *fetch(ctx, company) {
    const c = requireCompany("recruitee", company);
    const res = await ctx.http.json(`https://${c.atsKey}.recruitee.com/api/offers/`);
    if (res.notModified) return ctx.markUnchanged();
    const body = z.object({ offers: z.array(z.unknown()) }).safeParse(res.data);
    if (!body.success) throw new ConnectorError(`recruitee: unexpected payload for ${c.atsKey}`);

    for (const o of parseItems(Offer, body.data.offers, ctx.log, "recruitee")) {
      if (o.status && o.status !== "published") continue;
      const yearly = o.salary?.period === "year";
      const min = Number(o.salary?.min);
      const max = Number(o.salary?.max);
      yield {
        source: "recruitee",
        sourceJobId: String(o.id),
        companyName: o.company_name?.trim() || c.name,
        title: o.title.trim(),
        url: o.careers_url,
        applyUrl: o.careers_apply_url ?? o.careers_url,
        locationRaw: o.location ?? undefined,
        countryHint: o.country_code ?? undefined,
        remoteHint: o.remote ? "remote" : o.hybrid ? "hybrid" : o.on_site ? "onsite" : undefined,
        employmentType: o.employment_type_code ?? undefined,
        postedAt: parseRecruiteeDate(o.published_at),
        descriptionHtml: [o.description, o.requirements].filter(Boolean).join("\n") || undefined,
        salaryMin: yearly && Number.isFinite(min) && min > 0 ? min : undefined,
        salaryMax: yearly && Number.isFinite(max) && max > 0 ? max : undefined,
        salaryCurrency: yearly && min > 0 ? (o.salary?.currency ?? undefined) : undefined,
      };
    }
  },
};
