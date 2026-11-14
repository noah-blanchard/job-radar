import { ConnectorError, requireCompany, type Connector } from "./types";
import { parseDate, rssItems, xmlText, type XmlNode } from "./xml";

// Verified 2026-11-13: GET career.teamtailor.com/jobs.rss -> 200 RSS 2.0 (21 items), weak ETag.
// Items: title, HTML description, pubDate, link, guid, remoteStatus, tt:locations/tt:location.
// The board host is not always {slug}.teamtailor.com: ats_key is the full host.

export const teamtailor: Connector = {
  id: "teamtailor",
  kind: "ats",
  needsCompany: true,
  async *fetch(ctx, company) {
    const c = requireCompany("teamtailor", company);
    const host = c.atsKey.includes(".") ? c.atsKey : `${c.atsKey}.teamtailor.com`;
    const res = await ctx.http.text(`https://${host}/jobs.rss`, {
      cacheKey: `teamtailor:${host}`,
    });
    if (res.notModified) return ctx.markUnchanged();
    const items = rssItems(res.data);
    if (!items) throw new ConnectorError(`teamtailor: not an RSS feed for ${host}`);

    for (const it of items) {
      const title = xmlText(it.title);
      const link = xmlText(it.link);
      if (!title || !link) continue;
      const locs =
        ((it["tt:locations"] as XmlNode | undefined)?.["tt:location"] as XmlNode[] | undefined) ??
        [];
      const first = locs[0];
      const remote = xmlText(it.remoteStatus);
      yield {
        source: "teamtailor",
        sourceJobId: xmlText(it.guid) ?? link,
        companyName: c.name,
        title,
        url: link,
        locationRaw:
          locs
            .map((l) =>
              [xmlText(l["tt:city"]), xmlText(l["tt:country"])].filter(Boolean).join(", "),
            )
            .filter(Boolean)
            .join("; ") || undefined,
        countryHint: first ? xmlText(first["tt:country"]) : undefined,
        remoteHint:
          remote === "fully" || remote === "remote"
            ? "remote"
            : remote === "hybrid"
              ? "hybrid"
              : remote === "none"
                ? "onsite"
                : undefined,
        postedAt: parseDate(xmlText(it.pubDate)),
        descriptionHtml: xmlText(it.description),
      };
    }
  },
};
