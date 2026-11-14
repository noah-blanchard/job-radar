import { z } from "zod";
import { parseItems } from "./parse";
import { ConnectorError, requireCompany, type Connector } from "./types";

// Verified 2026-11-13: GET nucleusteq.breezy.hr/json -> 200 [positions], weak ETag.
// No description in the list (stored from list data only).
const Position = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  published_date: z.string().nullish(),
  type: z.object({ name: z.string().nullish() }).nullish(),
  location: z
    .object({
      name: z.string().nullish(),
      is_remote: z.boolean().nullish(),
      country: z.object({ id: z.string().nullish() }).nullish(),
    })
    .nullish(),
  company: z.object({ name: z.string().nullish() }).nullish(),
});

export const breezy: Connector = {
  id: "breezy",
  kind: "ats",
  needsCompany: true,
  async *fetch(ctx, company) {
    const c = requireCompany("breezy", company);
    const res = await ctx.http.json(`https://${c.atsKey}.breezy.hr/json`, {
      cacheKey: `breezy:${c.atsKey}`,
    });
    if (res.notModified) return ctx.markUnchanged();
    if (!Array.isArray(res.data))
      throw new ConnectorError(`breezy: unexpected payload for ${c.atsKey}`);

    for (const p of parseItems(Position, res.data, ctx.log, "breezy")) {
      yield {
        source: "breezy",
        sourceJobId: p.id,
        companyName: p.company?.name?.trim() || c.name,
        title: p.name.trim(),
        url: p.url,
        locationRaw: p.location?.name ?? undefined,
        countryHint: p.location?.country?.id ?? undefined,
        remoteHint: p.location?.is_remote ? "remote" : undefined,
        employmentType: p.type?.name ?? undefined,
        postedAt: p.published_date ? new Date(p.published_date) : undefined,
      };
    }
  },
};
