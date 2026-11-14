import { parseDocument } from "htmlparser2";
import { Fragment, type ReactNode } from "react";

/**
 * Renders job-description HTML as React elements from an allowlist: no dangerouslySetInnerHTML,
 * no attributes except a checked `href`, no scripts/styles/iframes/images/forms. Unknown tags are
 * unwrapped (their text is kept). React escapes every text node.
 */

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
  "b",
  "em",
  "i",
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
const VOID = new Set(["br", "hr"]);

function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href.trim());
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function render(nodes: DomNode[] | undefined, key = "n"): ReactNode[] {
  if (!nodes) return [];
  return nodes.map((n, i) => {
    const k = `${key}.${i}`;
    if (n.type === "text") return n.data ?? "";
    if (n.type !== "tag" && n.type !== "script" && n.type !== "style") return null;
    const raw = (n.name ?? "").toLowerCase();
    if (DROP.has(raw)) return null;
    const tag = RENAME[raw] ?? raw;
    const children = render(n.children, k);
    if (!KEEP.has(tag)) return <Fragment key={k}>{children}</Fragment>;
    if (VOID.has(tag)) return tag === "br" ? <br key={k} /> : <hr key={k} />;
    if (tag === "a") {
      const href = safeHref(n.attribs?.href);
      return href ? (
        <a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
          {children}
        </a>
      ) : (
        <Fragment key={k}>{children}</Fragment>
      );
    }
    const Tag = tag as "p";
    return <Tag key={k}>{children}</Tag>;
  });
}

export function SafeHtml({ html, className }: { html: string; className?: string }) {
  const doc = parseDocument(html, { decodeEntities: true }) as unknown as DomNode;
  return <div className={className}>{render(doc.children)}</div>;
}
