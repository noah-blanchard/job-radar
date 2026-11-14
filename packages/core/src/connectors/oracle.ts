import { z } from "zod";
import { parseItems } from "./parse";
import { ConnectorError, requireCompany, type Connector } from "./types";

// Verified 2026-11-13: GET {host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions
//   ?onlyData=true&expand=requisitionList.secondaryLocations
//   &finder=findReqs;siteNumber={site},limit={n},offset={m},sortBy=POSTING_DATES_DESC
// -> 200 {items: [{TotalJobsCount, requisitionList}]}. `expand` is required for the list;
// limit up to 200 works (eeho.fa.us2 / CX_45001: 2 856 jobs). Description: short summary only.
// ats_key = "{host}/{siteNumber}", e.g. "eeho.fa.us2.oraclecloud.com/CX_45001".
const PAGE = 200;
const MAX_PAGES = 40;

const Req = z.object({
  Id: z.union([z.string(), z.number()]).transform(String),
  Title: z.string(),
  PostedDate: z.string().nullish(),
  PrimaryLocation: z.string().nullish(),
  PrimaryLocationCountry: z.string().nullish(),
  ShortDescriptionStr: z.string().nullish(),
  WorkplaceType: z.string().nullish(),
  JobSchedule: z.string().nullish(),
});
const Response = z.object({
  items: z
    .array(
      z.object({ TotalJobsCount: z.number(), requisitionList: z.array(z.unknown()).nullish() }),
    )
    .min(1),
});

export function parseOracleKey(atsKey: string): { host: string; site: string } {
  const i = atsKey.lastIndexOf("/");
  const host = atsKey.slice(0, i);
  const site = atsKey.slice(i + 1);
  if (i <= 0 || !site || !/^[a-z0-9.-]+\.oraclecloud\.com$/i.test(host)) {
    throw new ConnectorError(`oracle_rc: invalid ats_key "${atsKey}" (expected host/site)`);
  }
  return { host, site };
}

const REMOTE: Record<string, "remote" | "hybrid" | "onsite"> = {
  remote: "remote",
  hybrid: "hybrid",
  "on-site": "onsite",
  onsite: "onsite",
};

export const oracleRc: Connector = {
  id: "oracle_rc",
  kind: "ats",
  needsCompany: true,
  async *fetch(ctx, company) {
    const c = requireCompany("oracle_rc", company);
    const { host, site } = parseOracleKey(c.atsKey);
    let total: number | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE;
      if (total !== undefined && offset >= total) return;
      const url =
        `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
        `?onlyData=true&expand=requisitionList.secondaryLocations` +
        `&finder=findReqs;siteNumber=${encodeURIComponent(site)},limit=${PAGE},offset=${offset},sortBy=POSTING_DATES_DESC`;
      const res = await ctx.http.json(url);
      if (res.notModified) return ctx.markUnchanged();
      const body = Response.safeParse(res.data);
      if (!body.success) throw new ConnectorError(`oracle_rc: unexpected payload for ${c.atsKey}`);
      const it = body.data.items[0]!;
      total = it.TotalJobsCount;
      const list = it.requisitionList ?? [];

      for (const r of parseItems(Req, list, ctx.log, "oracle_rc")) {
        const jobUrl = `https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${r.Id}`;
        yield {
          source: "oracle_rc",
          sourceJobId: r.Id,
          companyName: c.name,
          title: r.Title.trim(),
          url: jobUrl,
          locationRaw: r.PrimaryLocation ?? undefined,
          countryHint: r.PrimaryLocationCountry ?? undefined,
          remoteHint: REMOTE[(r.WorkplaceType ?? "").toLowerCase()],
          employmentType: r.JobSchedule ?? undefined,
          postedAt: r.PostedDate ? new Date(`${r.PostedDate}T12:00:00Z`) : undefined,
          descriptionText: r.ShortDescriptionStr ?? undefined,
        };
      }
      if (list.length < PAGE) return;
    }
    // Incomplete fetch: fail so that missing jobs are not closed.
    throw new ConnectorError(`oracle_rc: page cap reached for ${c.atsKey}`);
  },
};
