import { z } from "zod";
import { parseItems } from "./parse";
import { ConnectorError, requireCompany, type Connector, type RawJob } from "./types";

// Verified 2026-11-13: GET api.lever.co/v0/postings/spotify?mode=json -> 200 (ETag sent but
// If-None-Match ignored). EU boards live on api.eu.lever.co; their ats_key is "eu:<slug>".
const PostingSchema = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  applyUrl: z.string().nullish(),
  createdAt: z.number().nullish(),
  country: z.string().nullish(),
  workplaceType: z.string().nullish(),
  categories: z
    .object({
      location: z.string().nullish(),
      commitment: z.string().nullish(),
      allLocations: z.array(z.string()).nullish(),
    })
    .nullish(),
  description: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  lists: z.array(z.object({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
  additional: z.string().nullish(),
  additionalPlain: z.string().nullish(),
  salaryRange: z
    .object({
      min: z.number().nullish(),
      max: z.number().nullish(),
      currency: z.string().nullish(),
      interval: z.string().nullish(),
    })
    .nullish(),
});

const WORKPLACE: Record<string, RawJob["remoteHint"]> = {
  remote: "remote",
  hybrid: "hybrid",
  "on-site": "onsite",
  onsite: "onsite",
};

export function leverEndpoint(atsKey: string): { base: string; slug: string } {
  return atsKey.startsWith("eu:")
    ? { base: "https://api.eu.lever.co", slug: atsKey.slice(3) }
    : { base: "https://api.lever.co", slug: atsKey };
}

export const lever: Connector = {
  id: "lever",
  kind: "ats",
  needsCompany: true,
  async *fetch(ctx, company) {
    const c = requireCompany("lever", company);
    const { base, slug } = leverEndpoint(c.atsKey);
    const res = await ctx.http.json(`${base}/v0/postings/${encodeURIComponent(slug)}?mode=json`);
    if (res.notModified) return ctx.markUnchanged();
    if (!Array.isArray(res.data)) throw new ConnectorError(`lever: unexpected payload for ${slug}`);

    for (const p of parseItems(PostingSchema, res.data, ctx.log, "lever")) {
      const lists = (p.lists ?? [])
        .map((l) => `<h3>${l.text ?? ""}</h3><ul>${l.content ?? ""}</ul>`)
        .join("");
      const annual = !p.salaryRange?.interval || /year|annual/i.test(p.salaryRange.interval);
      yield {
        source: "lever",
        sourceJobId: p.id,
        companyName: c.name,
        title: p.text.trim(),
        url: p.hostedUrl,
        applyUrl: p.applyUrl ?? p.hostedUrl,
        locationRaw: p.categories?.allLocations?.join(" / ") || p.categories?.location || undefined,
        countryHint: p.country ?? undefined,
        remoteHint: p.workplaceType ? WORKPLACE[p.workplaceType.toLowerCase()] : undefined,
        employmentType: p.categories?.commitment ?? undefined,
        postedAt: p.createdAt ? new Date(p.createdAt) : undefined,
        descriptionHtml:
          [p.description, lists, p.additional].filter(Boolean).join("\n") || undefined,
        descriptionText:
          [p.descriptionPlain, p.additionalPlain].filter(Boolean).join("\n\n") || undefined,
        salaryMin: annual ? (p.salaryRange?.min ?? undefined) : undefined,
        salaryMax: annual ? (p.salaryRange?.max ?? undefined) : undefined,
        salaryCurrency: annual ? (p.salaryRange?.currency ?? undefined) : undefined,
      };
    }
  },
};
