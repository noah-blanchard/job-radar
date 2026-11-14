import { z } from "zod";
import { parseItems } from "./parse";
import { ConnectorError, requireCompany, type Connector, type RawJob } from "./types";

// Verified 2026-11-13: GET api.ashbyhq.com/posting-api/job-board/cohere?includeCompensation=true
// -> 200, ETag, 304 on If-None-Match.
const PostalAddress = z
  .object({
    addressLocality: z.string().nullish(),
    addressRegion: z.string().nullish(),
    addressCountry: z.string().nullish(),
  })
  .nullish();

const Component = z.object({
  compensationType: z.string().nullish(),
  interval: z.string().nullish(),
  currencyCode: z.string().nullish(),
  minValue: z.number().nullish(),
  maxValue: z.number().nullish(),
});

const JobSchema = z.object({
  id: z.string(),
  title: z.string(),
  location: z.string().nullish(),
  isListed: z.boolean().nullish(),
  isRemote: z.boolean().nullish(),
  workplaceType: z.string().nullish(),
  employmentType: z.string().nullish(),
  publishedAt: z.string().nullish(),
  jobUrl: z.string(),
  applyUrl: z.string().nullish(),
  descriptionHtml: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  address: z.object({ postalAddress: PostalAddress }).nullish(),
  compensation: z
    .object({
      compensationTiers: z.array(z.object({ components: z.array(Component).nullish() })).nullish(),
    })
    .nullish(),
});
const ResponseSchema = z.object({ jobs: z.array(z.unknown()) });

const WORKPLACE: Record<string, RawJob["remoteHint"]> = {
  remote: "remote",
  hybrid: "hybrid",
  onsite: "onsite",
};

/** First annual base salary range across tiers (Ashby lists one tier per region). */
function annualSalary(job: z.infer<typeof JobSchema>) {
  for (const tier of job.compensation?.compensationTiers ?? []) {
    for (const comp of tier.components ?? []) {
      if (
        comp.compensationType === "Salary" &&
        /year/i.test(comp.interval ?? "") &&
        comp.minValue
      ) {
        return {
          min: comp.minValue,
          max: comp.maxValue ?? comp.minValue,
          currency: comp.currencyCode,
        };
      }
    }
  }
  return undefined;
}

export const ashby: Connector = {
  id: "ashby",
  kind: "ats",
  needsCompany: true,
  async *fetch(ctx, company) {
    const c = requireCompany("ashby", company);
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(c.atsKey)}?includeCompensation=true`;
    const res = await ctx.http.json(url, { cacheKey: `ashby:${c.atsKey}` });
    if (res.notModified) return ctx.markUnchanged();
    const parsed = ResponseSchema.safeParse(res.data);
    if (!parsed.success) throw new ConnectorError(`ashby: unexpected payload for ${c.atsKey}`);

    for (const j of parseItems(JobSchema, parsed.data.jobs, ctx.log, "ashby")) {
      if (j.isListed === false) continue;
      const addr = j.address?.postalAddress;
      const structured = [addr?.addressLocality, addr?.addressRegion, addr?.addressCountry]
        .filter(Boolean)
        .join(", ");
      const salary = annualSalary(j);
      const remoteHint = j.isRemote
        ? "remote"
        : j.workplaceType
          ? WORKPLACE[j.workplaceType.toLowerCase()]
          : undefined;
      yield {
        source: "ashby",
        sourceJobId: j.id,
        companyName: c.name,
        title: j.title.trim(),
        url: j.jobUrl,
        applyUrl: j.applyUrl ?? j.jobUrl,
        locationRaw: structured || j.location || undefined,
        countryHint: addr?.addressCountry ?? undefined,
        remoteHint,
        employmentType: j.employmentType ?? undefined,
        postedAt: j.publishedAt ? new Date(j.publishedAt) : undefined,
        descriptionHtml: j.descriptionHtml ?? undefined,
        descriptionText: j.descriptionPlain ?? undefined,
        salaryMin: salary?.min,
        salaryMax: salary?.max,
        salaryCurrency: salary?.currency ?? undefined,
      };
    }
  },
};
