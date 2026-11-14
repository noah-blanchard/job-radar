import { z } from "zod";
import { parseItems } from "./parse";
import { ConnectorError, requireCompany, type Connector, type RawJob } from "./types";

// Verified 2026-11-13: POST salesforce.wd12.myworkdayjobs.com/wday/cxs/salesforce/External_Career_Site/jobs
// -> 200; `total` is only set on the first page. Detail: GET .../External_Career_Site{externalPath}.
// ats_key format: "<tenant>/<wdN>/<site>", e.g. "salesforce/wd12/External_Career_Site".
const PAGE = 20;
const MAX_JOBS = 2000;

const ListItem = z.object({
  title: z.string(),
  externalPath: z.string(),
  locationsText: z.string().nullish(),
  postedOn: z.string().nullish(),
});
const ListSchema = z.object({
  total: z.number().nullish(),
  jobPostings: z.array(z.unknown()).nullish(),
});
const DetailSchema = z.object({
  jobPostingInfo: z.object({
    title: z.string(),
    jobDescription: z.string().nullish(),
    location: z.string().nullish(),
    additionalLocations: z.array(z.string()).nullish(),
    startDate: z.string().nullish(),
    timeType: z.string().nullish(),
    remoteType: z.string().nullish(),
    externalUrl: z.string().nullish(),
    country: z.object({ descriptor: z.string().nullish() }).nullish(),
    jobRequisitionLocation: z
      .object({ country: z.object({ alpha2Code: z.string().nullish() }).nullish() })
      .nullish(),
  }),
  hiringOrganization: z.object({ name: z.string().nullish() }).nullish(),
});

export function parseWorkdayKey(atsKey: string) {
  const [tenant, shard, site] = atsKey.split("/");
  if (!tenant || !shard || !site || !/^wd\d+$/.test(shard)) {
    throw new ConnectorError(`workday: invalid ats_key "${atsKey}" (expected tenant/wdN/site)`);
  }
  const host = `https://${tenant}.${shard}.myworkdayjobs.com`;
  return { tenant, site, host, api: `${host}/wday/cxs/${tenant}/${site}` };
}

/** "Posted Today" / "Posted Yesterday" / "Posted 3 Days Ago" / "Posted 30+ Days Ago" -> Date. */
export function parsePostedOn(text: string | null | undefined, now = new Date()): Date | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  const day = 86_400_000;
  if (t.includes("today")) return now;
  if (t.includes("yesterday")) return new Date(now.getTime() - day);
  const m = /(\d+)\+?\s*days?/.exec(t);
  return m ? new Date(now.getTime() - Number(m[1]) * day) : undefined;
}

function remoteFrom(type: string | null | undefined): RawJob["remoteHint"] {
  if (!type) return undefined;
  const t = type.toLowerCase();
  if (t.includes("remote")) return "remote";
  if (t.includes("flexible") || t.includes("hybrid")) return "hybrid";
  if (t.includes("office") || t.includes("site")) return "onsite";
  return undefined;
}

export const workday: Connector = {
  id: "workday",
  kind: "ats",
  needsCompany: true,
  async *fetch(ctx, company) {
    const c = requireCompany("workday", company);
    const { host, site, api } = parseWorkdayKey(c.atsKey);
    let total: number | undefined;

    for (let offset = 0; offset < (total ?? PAGE) && offset < MAX_JOBS; offset += PAGE) {
      const res = await ctx.http.json(`${api}/jobs`, {
        method: "POST",
        body: { appliedFacets: {}, limit: PAGE, offset, searchText: "" },
      });
      if (res.notModified) return ctx.markUnchanged();
      const list = ListSchema.safeParse(res.data);
      if (!list.success) throw new ConnectorError(`workday: unexpected payload for ${c.atsKey}`);
      if (offset === 0) total = list.data.total ?? 0;
      const postings = list.data.jobPostings ?? [];
      if (postings.length === 0) break;

      for (const p of parseItems(ListItem, postings, ctx.log, "workday")) {
        const job: RawJob = {
          source: "workday",
          sourceJobId: p.externalPath,
          companyName: c.name,
          title: p.title.trim(),
          url: `${host}/${site}${p.externalPath}`,
          locationRaw: p.locationsText ?? undefined,
          postedAt: parsePostedOn(p.postedOn),
        };

        if (!ctx.knownIds.has(p.externalPath) && ctx.wantDetails(p.title)) {
          const d = await ctx.http.json(`${api}${p.externalPath}`);
          const detail = !d.notModified ? DetailSchema.safeParse(d.data) : undefined;
          if (detail?.success) {
            const info = detail.data.jobPostingInfo;
            const locs = [info.location, ...(info.additionalLocations ?? [])].filter(Boolean);
            job.url = info.externalUrl ?? job.url;
            job.locationRaw = locs.join(" / ") || job.locationRaw;
            job.countryHint =
              info.jobRequisitionLocation?.country?.alpha2Code ??
              info.country?.descriptor ??
              undefined;
            job.remoteHint = remoteFrom(info.remoteType);
            job.employmentType = info.timeType ?? undefined;
            job.descriptionHtml = info.jobDescription ?? undefined;
            if (info.startDate) job.postedAt = new Date(`${info.startDate}T12:00:00Z`);
            job.companyName = detail.data.hiringOrganization?.name ?? job.companyName;
          } else if (detail) {
            ctx.log.warn({ path: p.externalPath }, "workday: invalid detail payload");
          }
        }
        job.applyUrl = job.url;
        yield job;
      }
    }
    if ((total ?? 0) > MAX_JOBS)
      ctx.log.warn({ company: c.atsKey, total }, "workday: job cap reached");
  },
};
