import { ConnectorError, requireCompany, type Connector } from "./types";
import { parseDate, parseXml, xmlText, type XmlNode } from "./xml";

// Verified 2026-11-13: GET {slug}.jobs.personio.de/xml -> 200 text/xml, ETag.
// <workzag-jobs><position> with id, name, office, subcompany, jobDescriptions (CDATA HTML),
// employmentType, schedule, seniority, createdAt and optional salaryInformation.
// Tested on 1komma5grad (328 positions) and tado; `.jobs.personio.com` serves the same feed.

export const personio: Connector = {
  id: "personio",
  kind: "ats",
  needsCompany: true,
  async *fetch(ctx, company) {
    const c = requireCompany("personio", company);
    const base = `https://${c.atsKey}.jobs.personio.de`;
    const res = await ctx.http.text(`${base}/xml`, { cacheKey: `personio:${c.atsKey}` });
    if (res.notModified) return ctx.markUnchanged();
    const doc = parseXml(res.data);
    if (!("workzag-jobs" in doc))
      throw new ConnectorError(`personio: unexpected payload for ${c.atsKey}`);
    // An empty board parses as "" instead of an element.
    const root = doc["workzag-jobs"];
    const positions =
      (typeof root === "object" && root ? ((root as XmlNode).position as XmlNode[]) : null) ?? [];

    for (const p of positions) {
      const id = xmlText(p.id);
      const title = xmlText(p.name);
      if (!id || !title) {
        ctx.log.warn({ source: "personio" }, "invalid position skipped");
        continue;
      }
      const sections =
        ((p.jobDescriptions as XmlNode | undefined)?.jobDescription as XmlNode[] | undefined) ?? [];
      const html = sections
        .map((s) => {
          const value = xmlText(s.value);
          return value ? `<h3>${xmlText(s.name) ?? ""}</h3>${value}` : "";
        })
        .filter(Boolean)
        .join("\n");
      const salary = p.salaryInformation as XmlNode | undefined;
      const yearly = xmlText(salary?.type) === "yearly";
      const min = Number(xmlText(salary?.min));
      const max = Number(xmlText(salary?.max));
      yield {
        source: "personio",
        sourceJobId: id,
        companyName: xmlText(p.subcompany) ?? c.name,
        title,
        url: `${base}/job/${id}`,
        locationRaw: xmlText(p.office),
        employmentType:
          [xmlText(p.employmentType), xmlText(p.schedule)].filter(Boolean).join(", ") || undefined,
        postedAt: parseDate(xmlText(p.createdAt)),
        descriptionHtml: html || undefined,
        salaryMin: yearly && min > 0 ? min : undefined,
        salaryMax: yearly && max > 0 ? max : undefined,
        salaryCurrency: yearly && min > 0 ? xmlText(salary?.currencyCode) : undefined,
      };
    }
  },
};
