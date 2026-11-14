import { Fragment, type ReactNode } from "react";
import type { SafeNode } from "../lib/sanitize";

/** Renders a tree produced by `sanitizeHtml` (server + client safe: no parser, no raw HTML). */
function render(nodes: SafeNode[], key: string): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}.${i}`;
    if (typeof n === "string") return <Fragment key={k}>{n}</Fragment>;
    if (n.t === "br") return <br key={k} />;
    if (n.t === "hr") return <hr key={k} />;
    const children = render(n.c, k);
    if (n.t === "a")
      return (
        <a key={k} href={n.h} target="_blank" rel="noopener noreferrer nofollow ugc">
          {children}
        </a>
      );
    const Tag = n.t as "p";
    return <Tag key={k}>{children}</Tag>;
  });
}

export function SafeNodes({ nodes, className }: { nodes: SafeNode[]; className?: string }) {
  return <div className={className}>{render(nodes, "n")}</div>;
}
