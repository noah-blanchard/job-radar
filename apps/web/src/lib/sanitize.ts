import { parseDocument } from "htmlparser2";

/**
 * Job-description HTML reduced to an allowlisted, serializable tree: no attributes except a
 * checked `href`, no scripts/styles/iframes/images/forms. Unknown tags are unwrapped (their text
 * is kept). Runs on the server only, so the parser never ships to the browser; `<SafeNodes>`
 * renders the result (React escapes every text node).
 */

/** A text node, or an allowed element (`h` only on links). */
export type SafeNode = string | { t: string; c: SafeNode[]; h?: string };

interface DomNode {
  type: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
}

const KEEP = new Set([
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "u",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "code",
  "pre",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "hr",
  "a",
]);
/** Headings shrunk to fit the page hierarchy. */
const RENAME: Record<string, string> = { h1: "h3", h2: "h3", b: "strong", i: "em" };
/** Dropped with their content. */
const DROP = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "svg",
  "math",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "img",
  "video",
  "audio",
  "head",
  "title",
  "meta",
  "link",
]);

function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href.trim());
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function walk(nodes: DomNode[] | undefined, out: SafeNode[]): SafeNode[] {
  for (const n of nodes ?? []) {
    if (n.type === "text") {
      if (n.data) out.push(n.data);
      continue;
    }
    if (n.type !== "tag" && n.type !== "script" && n.type !== "style") continue;
    const raw = (n.name ?? "").toLowerCase();
    if (DROP.has(raw)) continue;
    const tag = RENAME[raw] ?? raw;
    if (!KEEP.has(tag)) {
      walk(n.children, out); // unwrap
      continue;
    }
    if (tag === "a") {
      const h = safeHref(n.attribs?.href);
      if (!h) {
        walk(n.children, out);
        continue;
      }
      out.push({ t: "a", h, c: walk(n.children, []) });
      continue;
    }
    out.push({ t: tag, c: tag === "br" || tag === "hr" ? [] : walk(n.children, []) });
  }
  return out;
}

export function sanitizeHtml(html: string): SafeNode[] {
  const doc = parseDocument(html, { decodeEntities: true }) as unknown as DomNode;
  return walk(doc.children, []);
}
