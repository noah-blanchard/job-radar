import { z } from "zod";
import { htmlToText } from "../normalize/html";
import { parseItems } from "./parse";
import {
  COUNTRY_NAMES,
  domainTerms,
  profileCountries,
  profileWantsRemote,
  searchTitles,
} from "./queries";
import { ConnectorError, requireKeys, takeQuota, type Connector, type FetchCtx } from "./types";

// Verified 2026-11-13: POST jooble.org/api/{key} {keywords, location, page, datecreatedfrom}
// -> 200 {totalCount, jobs}. The key only works on jooble.org (ca./fr.jooble.org -> 403).
// "Canada", "United States" and "Remote" return results; "Montreal" maps to unrelated US places
// and "Paris, France" returns 0, so France is not queried here.
// `id` is a 64-bit integer that JSON.parse rounds: the id is taken from the /desc/{id} link.
const API = "https://jooble.org/api";

const Job = z.object({
  title: z.string(),
  link: z.string(),
  company: z.string().nullish(),
  location: z.string().nullish(),
  snippet: z.string().nullish(),
  type: z.string().nullish(),
  updated: z.string().nullish(),
});
const Response = z.object({ totalCount: z.number(), jobs: z.array(z.unknown()) });

const SUPPORTED: Record<string, string> = { CA: "Canada", US: COUNTRY_NAMES.US! };

export interface JoobleQuery {
  keywords: string;
  location: string;
}

/** (search titles + "junior <domain>") x (profile countries Jooble supports + Remote). */
export function joobleQueries(ctx: Pick<FetchCtx, "profile">): JoobleQuery[] {
  const locations = profileCountries(ctx.profile)
    .map((c) => SUPPORTED[c])
    .filter((x): x is string => !!x);
  if (profileWantsRemote(ctx.profile)) locations.push("Remote");
  const keywords = [
    ...searchTitles(ctx.profile),
    ...domainTerms(ctx.profile)
      .filter((d) => d.terms.length > 0)
      .map((d) => `junior ${d.terms[0]}`),
  ];
  return locations.flatMap((location) => keywords.map((k) => ({ keywords: k, location })));
}

export function joobleId(link: string): string | undefined {
  return link.match(/\/desc\/(-?\d+)/)?.[1];
}

export const jooble: Connector = {
  id: "jooble",
  kind: "aggregator",
  needsCompany: false,
  async *fetch(ctx) {
    const { JOOBLE_KEY } = requireKeys("jooble", ctx.env, ["JOOBLE_KEY"]);
    const from = new Date((ctx.since?.getTime() ?? Date.now()) - 2 * 86_400_000);
    const seen = new Set<string>();

    for (const q of joobleQueries(ctx)) {
      if (!(await takeQuota(ctx, "jooble"))) return;
      const res = await ctx.http.json(`${API}/${encodeURIComponent(JOOBLE_KEY)}`, {
        method: "POST",
        body: {
          keywords: q.keywords,
          location: q.location,
          page: "1",
          datecreatedfrom: from.toISOString().slice(0, 10),
        },
      });
      if (res.notModified) continue;
      const body = Response.safeParse(res.data);
      if (!body.success) throw new ConnectorError("jooble: unexpected payload");

      for (const j of parseItems(Job, body.data.jobs, ctx.log, "jooble")) {
        const id = joobleId(j.link);
        const company = j.company?.trim();
        if (!id || !company || seen.has(id)) continue;
        seen.add(id);
        yield {
          source: "jooble",
          sourceJobId: id,
          companyName: company,
          title: htmlToText(j.title) || j.title,
          // The link carries per-query tracking params: keep only the stable part.
          url: `https://jooble.org/desc/${id}`,
          locationRaw: j.location ?? undefined,
          remoteHint: q.location === "Remote" ? "remote" : undefined,
          employmentType: j.type || undefined,
          postedAt: j.updated ? new Date(`${j.updated.slice(0, 19)}Z`) : undefined,
          descriptionText: j.snippet ? htmlToText(j.snippet) : undefined,
        };
      }
    }
  },
};
