import { z } from "zod";
import { parseItems } from "./parse";
import { ConnectorError, type Connector } from "./types";

// Verified 2026-11-13:
// - raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json
//   -> 200, weak ETag, 304 on If-None-Match. 18 798 entries, 3 235 active (12.9 MB, 2 MB gzip).
// - raw.githubusercontent.com/vanshb03/New-Grad-2027/dev/.github/scripts/listings.json
//   -> same format, 2 186 entries (858 active). URLs are go.vansh.nyc short links (no discovery).
const Listing = z.object({
  id: z.string(),
  company_name: z.string(),
  title: z.string(),
  url: z.string(),
  locations: z.array(z.string()).nullish(),
  active: z.boolean(),
  is_visible: z.boolean().nullish(),
  date_posted: z.number().nullish(),
  sponsorship: z.string().nullish(),
});

/** A GitHub "new grad" list in the SimplifyJobs `listings.json` format. */
export function githubListings(id: string, url: string): Connector {
  return {
    id,
    kind: "feed",
    needsCompany: false,
    async *fetch(ctx) {
      // raw.githubusercontent.com needs no token (and must never receive one).
      const res = await ctx.http.json(url, { cacheKey: `${id}:listings` });
      if (res.notModified) return ctx.markUnchanged();
      if (!Array.isArray(res.data))
        throw new ConnectorError(`${id}: listings.json is not an array`);

      // Most entries are closed: filter before validating 18k objects.
      const open = (res.data as Array<Record<string, unknown> | null>).filter(
        (x) => x?.active === true && x.is_visible !== false,
      );
      for (const l of parseItems(Listing, open, ctx.log, id)) {
        const locations = (l.locations ?? []).map((s) => s.trim()).filter(Boolean);
        yield {
          source: id,
          sourceJobId: l.id,
          companyName: l.company_name.trim(),
          title: l.title.trim(),
          url: l.url,
          applyUrl: l.url,
          locationRaw: locations.join("; ") || undefined,
          postedAt: l.date_posted ? new Date(l.date_posted * 1000) : undefined,
          // Curated new-grad list: every entry is an entry-level role.
          seniorityHint: "entry",
        };
      }
    },
  };
}

export const githubSimplifyNewgrad = githubListings(
  "github_simplify_newgrad",
  "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
);

export const githubVanshNewgrad = githubListings(
  "github_vansh_newgrad",
  "https://raw.githubusercontent.com/vanshb03/New-Grad-2027/dev/.github/scripts/listings.json",
);
