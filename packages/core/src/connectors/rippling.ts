import { z } from "zod";
import { parseItems } from "./parse";
import { ConnectorError, requireCompany, type Connector } from "./types";

// Verified 2026-11-13: GET api.rippling.com/platform/api/ats/v1/board/{slug}/jobs -> 200 [jobs]
// (uuid, name, url, workLocation; no description), detail at .../jobs/{uuid} with
// description.{company,role} HTML, workLocations, employmentType, createdOn.
// ats.rippling.com/{slug}/jobs (the public page) redirects to the site: the API is used.
const API = "https://api.rippling.com/platform/api/ats/v1/board";

const ListItem = z.object({
  uuid: z.string(),
  name: z.string(),
  url: z.string(),
  workLocation: z.object({ label: z.string().nullish() }).nullish(),
});
const Detail = z.object({
  description: z.object({ company: z.string().nullish(), role: z.string().nullish() }).nullish(),
  workLocations: z.array(z.string()).nullish(),
  employmentType: z.object({ id: z.string().nullish() }).nullish(),
  createdOn: z.string().nullish(),
});

export const rippling: Connector = {
  id: "rippling",
  kind: "ats",
  needsCompany: true,
  async *fetch(ctx, company) {
    const c = requireCompany("rippling", company);
    const base = `${API}/${encodeURIComponent(c.atsKey)}/jobs`;
    const res = await ctx.http.json(base);
    if (res.notModified) return ctx.markUnchanged();
    if (!Array.isArray(res.data))
      throw new ConnectorError(`rippling: unexpected payload for ${c.atsKey}`);

    // A job posted in several places appears once per location.
    const byId = new Map<string, { job: z.infer<typeof ListItem>; places: string[] }>();
    for (const j of parseItems(ListItem, res.data, ctx.log, "rippling")) {
      const e = byId.get(j.uuid) ?? { job: j, places: [] };
      if (j.workLocation?.label) e.places.push(j.workLocation.label);
      byId.set(j.uuid, e);
    }

    for (const { job: j, places } of byId.values()) {
      let descriptionHtml: string | undefined;
      let postedAt: Date | undefined;
      let employmentType: string | undefined;
      let locations = places;
      if (!ctx.knownIds.has(j.uuid) && ctx.wantDetails(j.name)) {
        const d = await ctx.http.json(`${base}/${encodeURIComponent(j.uuid)}`);
        const detail = d.notModified ? undefined : Detail.safeParse(d.data);
        if (detail?.success) {
          const desc = detail.data.description;
          descriptionHtml = [desc?.role, desc?.company].filter(Boolean).join("\n") || undefined;
          postedAt = detail.data.createdOn ? new Date(detail.data.createdOn) : undefined;
          employmentType = detail.data.employmentType?.id ?? undefined;
          if (detail.data.workLocations?.length) locations = detail.data.workLocations;
        } else if (detail) {
          ctx.log.warn({ id: j.uuid }, "rippling: invalid detail payload");
        }
      }
      yield {
        source: "rippling",
        sourceJobId: j.uuid,
        companyName: c.name,
        title: j.name.trim(),
        url: j.url,
        locationRaw: [...new Set(locations)].join("; ") || undefined,
        employmentType,
        postedAt,
        descriptionHtml,
      };
    }
  },
};
