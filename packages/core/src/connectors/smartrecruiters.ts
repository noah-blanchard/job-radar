import { z } from "zod";
import { parseItems } from "./parse";
import { ConnectorError, requireCompany, type Connector } from "./types";

// Verified 2026-11-13: GET api.smartrecruiters.com/v1/companies/ubisoft2/postings?limit=&offset=
// -> 200 (paginated by offset/limit, max 100), detail at /postings/{id}.
const API = "https://api.smartrecruiters.com/v1/companies";
const PAGE = 100;
const MAX_PAGES = 50;

const Location = z
  .object({
    city: z.string().nullish(),
    region: z.string().nullish(),
    country: z.string().nullish(),
    remote: z.boolean().nullish(),
    hybrid: z.boolean().nullish(),
    fullLocation: z.string().nullish(),
  })
  .nullish();

const ListItem = z.object({
  id: z.string(),
  name: z.string(),
  releasedDate: z.string().nullish(),
  company: z.object({ identifier: z.string().nullish(), name: z.string().nullish() }).nullish(),
  location: Location,
  typeOfEmployment: z.object({ label: z.string().nullish() }).nullish(),
});
const ListSchema = z.object({
  offset: z.number(),
  limit: z.number(),
  totalFound: z.number(),
  content: z.array(z.unknown()),
});
const Section = z.object({ title: z.string().nullish(), text: z.string().nullish() }).nullish();
const DetailSchema = z.object({
  postingUrl: z.string().nullish(),
  applyUrl: z.string().nullish(),
  jobAd: z
    .object({
      sections: z
        .object({
          companyDescription: Section,
          jobDescription: Section,
          qualifications: Section,
          additionalInformation: Section,
        })
        .nullish(),
    })
    .nullish(),
});

export const smartrecruiters: Connector = {
  id: "smartrecruiters",
  kind: "ats",
  needsCompany: true,
  async *fetch(ctx, company) {
    const c = requireCompany("smartrecruiters", company);
    const base = `${API}/${encodeURIComponent(c.atsKey)}/postings`;

    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await ctx.http.json(`${base}?limit=${PAGE}&offset=${page * PAGE}`);
      if (res.notModified) return ctx.markUnchanged();
      const list = ListSchema.safeParse(res.data);
      if (!list.success)
        throw new ConnectorError(`smartrecruiters: unexpected payload for ${c.atsKey}`);

      for (const p of parseItems(ListItem, list.data.content, ctx.log, "smartrecruiters")) {
        const loc = p.location;
        let url = `https://jobs.smartrecruiters.com/${p.company?.identifier ?? c.atsKey}/${p.id}`;
        let applyUrl: string | undefined;
        let descriptionHtml: string | undefined;

        if (!ctx.knownIds.has(p.id) && ctx.wantDetails(p.name)) {
          const d = await ctx.http.json(`${base}/${encodeURIComponent(p.id)}`);
          const detail = !d.notModified ? DetailSchema.safeParse(d.data) : undefined;
          if (detail?.success) {
            url = detail.data.postingUrl ?? url;
            applyUrl = detail.data.applyUrl ?? undefined;
            const s = detail.data.jobAd?.sections;
            descriptionHtml =
              [
                s?.jobDescription,
                s?.qualifications,
                s?.additionalInformation,
                s?.companyDescription,
              ]
                .filter((x) => x?.text)
                .map((x) => `<h3>${x!.title ?? ""}</h3>${x!.text}`)
                .join("\n") || undefined;
          } else if (detail) {
            ctx.log.warn({ id: p.id }, "smartrecruiters: invalid detail payload");
          }
        }

        yield {
          source: "smartrecruiters",
          sourceJobId: p.id,
          companyName: p.company?.name ?? c.name,
          title: p.name.trim(),
          url,
          applyUrl: applyUrl ?? url,
          locationRaw:
            loc?.fullLocation ??
            ([loc?.city, loc?.region, loc?.country].filter(Boolean).join(", ") || undefined),
          countryHint: loc?.country ?? undefined,
          remoteHint: loc?.remote ? "remote" : loc?.hybrid ? "hybrid" : undefined,
          employmentType: p.typeOfEmployment?.label ?? undefined,
          postedAt: p.releasedDate ? new Date(p.releasedDate) : undefined,
          descriptionHtml,
        };
      }

      if ((page + 1) * PAGE >= list.data.totalFound) return;
    }
    ctx.log.warn({ company: c.atsKey }, "smartrecruiters: page cap reached");
  },
};
