import { z } from "zod";
import { decodeEntities, htmlToText } from "../normalize/html";
import { extractUrls } from "../discovery/detectAts";
import { parseItems } from "./parse";
import { ConnectorError, type Connector } from "./types";

// Verified 2026-11-13 (Algolia HN API, no key):
// - GET hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring -> monthly threads
//   ("Ask HN: Who is hiring? (November 2026)", id 50338728).
// - GET .../search_by_date?tags=comment,story_{id}&hitsPerPage=1000 -> every comment (361);
//   top-level ones (parent_id = story id) are the job posts (242).
const API = "https://hn.algolia.com/api/v1/search_by_date";

const Story = z.object({ objectID: z.string(), title: z.string(), created_at_i: z.number() });
const Comment = z.object({
  objectID: z.string(),
  comment_text: z.string().nullish(),
  created_at: z.string().nullish(),
  parent_id: z.number().nullish(),
  author: z.string().nullish(),
});
const Hits = z.object({ hits: z.array(z.unknown()), nbPages: z.number().nullish() });

const REMOTE = /\b(remote|onsite|on-site|hybrid|in[- ]office)\b/i;
const ROLE =
  /\b(engineer|engineers|developer|developers|scientist|programmer|swe|sre|devops|designer|researcher|analyst|architect|intern|founding|full[- ]?stack|front[- ]?end|back[- ]?end|ml|ai)\b/i;
const NOT_PLACE =
  /\b(full[- ]?time|part[- ]?time|contract|visa|salary|equity|\$|€|£|\d+k|https?:|www\.)/i;
const NOT_ROLE = /\b(full[- ]?time|part[- ]?time|contract|visa|\$|€|£|https?:|www\.)/i;

export interface HnHeader {
  company: string;
  title: string;
  location?: string;
}

/**
 * Parses the conventional first line "Company | Role | Location | REMOTE | Full-time | $".
 * Returns null when the comment does not follow it (replies, chatter).
 */
export function parseHnHeader(html: string): HnHeader | null {
  const firstLine = decodeEntities(html.split(/<p>/i)[0] ?? "")
    .replace(/<[^>]+>/g, "")
    .trim();
  const parts = firstLine
    .split(/\s*[|｜]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const company = parts[0]!
    .replace(/\s*\(.*?\)\s*$/, "")
    .replace(/^\*+|\*+$/g, "")
    .trim();
  if (!company || company.length > 80) return null;
  const rest = parts.slice(1);
  const title =
    rest.find((p) => ROLE.test(p) && !NOT_ROLE.test(p) && !REMOTE.test(p.split(/\s/)[0] ?? "")) ??
    rest.find((p) => !NOT_ROLE.test(p) && !REMOTE.test(p)) ??
    "Software Engineer";
  const places = rest.filter(
    (p) => p !== title && !NOT_PLACE.test(p) && !ROLE.test(p) && p.length <= 80,
  );
  const remote = rest.find((p) => REMOTE.test(p) && p !== title);
  const location = [
    ...new Set([...places, ...(remote && !places.includes(remote) ? [remote] : [])]),
  ]
    .join(" / ")
    .trim();
  return { company, title: title.slice(0, 200), location: location || undefined };
}

export const hnWhoIsHiring: Connector = {
  id: "hn_whoishiring",
  kind: "feed",
  needsCompany: false,
  async *fetch(ctx) {
    const s = await ctx.http.json(`${API}?tags=story,author_whoishiring&hitsPerPage=10`);
    if (s.notModified) return;
    const stories = Hits.safeParse(s.data);
    if (!stories.success) throw new ConnectorError("hn: unexpected stories payload");
    const thread = [...parseItems(Story, stories.data.hits, ctx.log, "hn_whoishiring")]
      .filter((x) => /who is hiring/i.test(x.title))
      .sort((a, b) => b.created_at_i - a.created_at_i)[0];
    if (!thread) throw new ConnectorError("hn: no 'Who is hiring?' thread found");
    const storyId = Number(thread.objectID);

    for (let page = 0; page < 5; page++) {
      const res = await ctx.http.json(
        `${API}?tags=comment,story_${storyId}&hitsPerPage=1000&page=${page}`,
      );
      if (res.notModified) return;
      const body = Hits.safeParse(res.data);
      if (!body.success) throw new ConnectorError("hn: unexpected comments payload");

      for (const c of parseItems(Comment, body.data.hits, ctx.log, "hn_whoishiring")) {
        if (c.parent_id !== storyId || !c.comment_text) continue;
        const h = parseHnHeader(c.comment_text);
        if (!h) continue;
        const text = htmlToText(c.comment_text);
        yield {
          source: "hn_whoishiring",
          sourceJobId: c.objectID,
          companyName: h.company,
          title: h.title,
          url: `https://news.ycombinator.com/item?id=${c.objectID}`,
          locationRaw: h.location,
          postedAt: c.created_at ? new Date(c.created_at) : undefined,
          descriptionHtml: c.comment_text,
          descriptionText: text || undefined,
          // Careers/ATS links in the post feed discovery.
          relatedUrls: extractUrls(c.comment_text),
        };
      }
      if (page + 1 >= (body.data.nbPages ?? 1)) return;
    }
  },
};
