import { z } from "zod";
import { parseItems } from "./parse";
import { ConnectorError, requireCompany, type Connector } from "./types";

// Verified 2026-11-13: GET wolve.pinpointhq.com/postings.json -> 200 {data}, weak ETag.
// Full HTML sections (description, responsibilities, skills, benefits), structured location and
// compensation; no publication date. Some boards return an empty list (interactsoftware).
const Posting = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string(),
  url: z.string(),
  description: z.string().nullish(),
  key_responsibilities: z.string().nullish(),
  key_responsibilities_header: z.string().nullish(),
  skills_knowledge_expertise: z.string().nullish(),
  skills_knowledge_expertise_header: z.string().nullish(),
  benefits: z.string().nullish(),
  benefits_header: z.string().nullish(),
  employment_type_text: z.string().nullish(),
  workplace_type: z.string().nullish(),
  compensation_visible: z.boolean().nullish(),
  compensation_minimum: z.number().nullish(),
  compensation_maximum: z.number().nullish(),
  compensation_currency: z.string().nullish(),
  compensation_frequency: z.string().nullish(),
  location: z
    .object({
      name: z.string().nullish(),
      city: z.string().nullish(),
      province: z.string().nullish(),
    })
    .nullish(),
});

const REMOTE: Record<string, "remote" | "hybrid" | "onsite"> = {
  remote: "remote",
  hybrid: "hybrid",
  onsite: "onsite",
};

export const pinpoint: Connector = {
  id: "pinpoint",
  kind: "ats",
  needsCompany: true,
  async *fetch(ctx, company) {
    const c = requireCompany("pinpoint", company);
    const res = await ctx.http.json(`https://${c.atsKey}.pinpointhq.com/postings.json`, {
      cacheKey: `pinpoint:${c.atsKey}`,
    });
    if (res.notModified) return ctx.markUnchanged();
    const body = z.object({ data: z.array(z.unknown()) }).safeParse(res.data);
    if (!body.success) throw new ConnectorError(`pinpoint: unexpected payload for ${c.atsKey}`);

    for (const p of parseItems(Posting, body.data.data, ctx.log, "pinpoint")) {
      const html = [
        p.description,
        p.key_responsibilities &&
          `<h3>${p.key_responsibilities_header ?? ""}</h3>${p.key_responsibilities}`,
        p.skills_knowledge_expertise &&
          `<h3>${p.skills_knowledge_expertise_header ?? ""}</h3>${p.skills_knowledge_expertise}`,
        p.benefits && `<h3>${p.benefits_header ?? ""}</h3>${p.benefits}`,
      ]
        .filter(Boolean)
        .join("\n");
      const yearly = p.compensation_visible && p.compensation_frequency === "year";
      yield {
        source: "pinpoint",
        sourceJobId: p.id,
        companyName: c.name,
        title: p.title.trim(),
        url: p.url,
        locationRaw:
          p.location?.name ??
          ([p.location?.city, p.location?.province].filter(Boolean).join(", ") || undefined),
        remoteHint: REMOTE[p.workplace_type ?? ""],
        employmentType: p.employment_type_text ?? undefined,
        descriptionHtml: html || undefined,
        salaryMin: yearly ? (p.compensation_minimum ?? undefined) : undefined,
        salaryMax: yearly ? (p.compensation_maximum ?? undefined) : undefined,
        salaryCurrency: yearly ? (p.compensation_currency ?? undefined) : undefined,
      };
    }
  },
};
