import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SafeHtml } from "../src/components/safe-html";
import { DEFAULT_FILTERS, filtersToParams, inboxHref, parseFilters } from "../src/lib/filters";

describe("Inbox filters in the URL", () => {
  it("round-trips every filter", () => {
    const f = {
      ...DEFAULT_FILTERS,
      q: "react native",
      country: "CA",
      city: "Montréal",
      remote: "hybrid" as const,
      newGrad: "yes" as const,
      domain: "fullstack",
      source: "greenhouse",
      company: "Stripe",
      minScore: 50,
      since: "24h" as const,
      status: "saved" as const,
      closed: true,
      sort: "recent" as const,
      page: 3,
    };
    expect(parseFilters(filtersToParams(f))).toEqual(f);
  });

  it("keeps default values out of the URL", () => {
    expect(inboxHref(DEFAULT_FILTERS)).toBe("/");
    expect(inboxHref({ ...DEFAULT_FILTERS, country: "CA", minScore: 50, since: "24h" })).toBe(
      "/?country=CA&min=50&since=24h",
    );
  });

  it("rejects invalid values", () => {
    const f = parseFilters({
      min: "500",
      page: "-2",
      since: "1y",
      status: "drop table",
      ng: "maybe",
      country: "canada",
    });
    expect(f).toMatchObject({
      minScore: 100,
      page: 1,
      since: "all",
      status: "todo",
      newGrad: "",
      country: "CA",
    });
  });
});

describe("SafeHtml", () => {
  const html = (s: string) => renderToStaticMarkup(createElement(SafeHtml, { html: s }));

  it("keeps the structure of a description", () => {
    expect(
      html('<h2 class="x">About</h2><p style="color:red">Hi <b>there</b></p><ul><li>a</li></ul>'),
    ).toBe("<div><h3>About</h3><p>Hi <strong>there</strong></p><ul><li>a</li></ul></div>");
  });

  it("drops scripts, event handlers, images, iframes and unsafe links", () => {
    const out = html(
      '<p onclick="steal()">x</p><script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://evil"></iframe><a href="javascript:alert(1)">bad</a><a href="https://ok.example/job">ok</a><style>p{}</style>',
    );
    expect(out).not.toMatch(/script|onclick|onerror|iframe|javascript:|<img|<style/i);
    expect(out).toContain(
      '<a href="https://ok.example/job" target="_blank" rel="noopener noreferrer nofollow ugc">ok</a>',
    );
    expect(out).toContain("bad");
  });

  it("escapes text and unwraps unknown tags", () => {
    expect(html("<div><span>a &lt;b&gt;</span><custom>c</custom></div>")).toBe(
      "<div>a &lt;b&gt;c</div>",
    );
  });
});
