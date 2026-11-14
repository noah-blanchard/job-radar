import { z } from "zod";
import { parseItems } from "./parse";
import { ConnectorError, requireCompany, type Connector } from "./types";

// Verified 2026-11-13: GET euna.bamboohr.com/careers/list -> 200 {meta, result} (no description),
// GET /careers/{id}/detail -> {result: {jobOpening: {description, datePosted, ...}}}.
// Unknown slugs answer 302 to bamboohr.com (treated as an error: redirects are not followed).
const ListItem = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  jobOpeningName: z.string(),
  employmentStatusLabel: z.string().nullish(),
  location: z.object({ city: z.string().nullish(), state: z.string().nullish() }).nullish(),
  atsLocation: z
    .object({
      country: z.string().nullish(),
      state: z.string().nullish(),
      province: z.string().nullish(),
      city: z.string().nullish(),
    })
    .nullish(),
  isRemote: z.boolean().nullish(),
});
const Detail = z.object({
  result: z.object({
    jobOpening: z.object({
      jobOpeningShareUrl: z.string().nullish(),
      description: z.string().nullish(),
      datePosted: z.string().nullish(),
    }),
  }),
});

export const bamboohr: Connector = {
  id: "bamboohr",
  kind: "ats",
  needsCompany: true,
  async *fetch(ctx, company) {
    const c = requireCompany("bamboohr", company);
    const base = `https://${c.atsKey}.bamboohr.com/careers`;
    const res = await ctx.http.json(`${base}/list`);
    if (res.notModified) return ctx.markUnchanged();
    const body = z.object({ result: z.array(z.unknown()) }).safeParse(res.data);
    if (!body.success) throw new ConnectorError(`bamboohr: unexpected payload for ${c.atsKey}`);

    for (const j of parseItems(ListItem, body.data.result, ctx.log, "bamboohr")) {
      let url = `${base}/${j.id}`;
      let descriptionHtml: string | undefined;
      let postedAt: Date | undefined;
      if (!ctx.knownIds.has(j.id) && ctx.wantDetails(j.jobOpeningName)) {
        const d = await ctx.http.json(`${base}/${j.id}/detail`);
        const detail = d.notModified ? undefined : Detail.safeParse(d.data);
        if (detail?.success) {
          const o = detail.data.result.jobOpening;
          url = o.jobOpeningShareUrl ?? url;
          descriptionHtml = o.description ?? undefined;
          postedAt = o.datePosted ? new Date(`${o.datePosted}T12:00:00Z`) : undefined;
        } else if (detail) {
          ctx.log.warn({ id: j.id }, "bamboohr: invalid detail payload");
        }
      }
      const a = j.atsLocation;
      const place = [
        j.location?.city ?? a?.city,
        j.location?.state ?? a?.state ?? a?.province,
        a?.country,
      ]
        .filter(Boolean)
        .join(", ");
      yield {
        source: "bamboohr",
        sourceJobId: j.id,
        companyName: c.name,
        title: j.jobOpeningName.trim(),
        url,
        locationRaw: place || undefined,
        countryHint: a?.country ?? undefined,
        remoteHint: j.isRemote ? "remote" : undefined,
        employmentType: j.employmentStatusLabel ?? undefined,
        postedAt,
        descriptionHtml,
      };
    }
  },
};
