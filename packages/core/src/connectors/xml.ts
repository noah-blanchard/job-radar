import { XMLParser } from "fast-xml-parser";

/** Tags that may repeat and must always be arrays (RSS items, Personio positions, ...). */
const ARRAY_TAGS = new Set(["item", "position", "jobDescription", "tt:location", "category"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Keep every value as a string (ids like "0123" must not become numbers).
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

export type XmlNode = Record<string, unknown>;

export function parseXml(xml: string): XmlNode {
  return parser.parse(xml) as XmlNode;
}

/** Text content of a node (string, or `#text` of an element with attributes). */
export function xmlText(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object" && "#text" in v) return xmlText((v as XmlNode)["#text"]);
  return undefined;
}

/** `<rss><channel><item>` list (empty when the channel has no item). */
export function rssItems(xml: string): XmlNode[] | null {
  const doc = parseXml(xml);
  const channel = (doc.rss as XmlNode | undefined)?.channel as XmlNode | undefined;
  if (!channel) return null;
  return (channel.item as XmlNode[] | undefined) ?? [];
}

/** RFC 822 / ISO date string -> Date (undefined when unparseable). */
export function parseDate(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
