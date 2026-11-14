import { describe, expect, it } from "vitest";
import { decodeEntities, htmlToText } from "../src/normalize/html";
import { canonicalUrl, companyKey, detectLang, fingerprint, titleKey } from "../src/normalize/text";

describe("companyKey", () => {
  it.each([
    ["Stripe, Inc.", "stripe"],
    ["Ubisoft Montréal", "ubisoft montreal"],
    ["Akuna Capital LLC", "akuna capital"],
    ["Native Instruments GmbH", "native instruments"],
    ["AT&T", "at and t"],
  ])("%s -> %s", (raw, key) => expect(companyKey(raw)).toBe(key));
});

describe("titleKey", () => {
  it("ignores case, accents, punctuation and gender markers", () => {
    expect(titleKey("Développeur·se Logiciel (H/F)")).toBe(titleKey("developpeur se logiciel"));
    expect(titleKey("Software Engineer (m/w/d)")).toBe("software engineer");
    expect(titleKey("Software Engineer, New Grad")).toBe("software engineer new grad");
  });
  it("keeps meaningful distinctions", () => {
    expect(titleKey("C++ Engineer")).not.toBe(titleKey("C Engineer"));
    expect(titleKey("Software Engineer (Backend)")).not.toBe(
      titleKey("Software Engineer (Frontend)"),
    );
  });
});

describe("fingerprint", () => {
  it("is stable across cosmetic differences", () => {
    expect(fingerprint("Stripe, Inc.", "Software Engineer, New Grad", "Toronto")).toBe(
      fingerprint("stripe", "software engineer - new grad", "toronto"),
    );
  });
  it("differs by city and by company", () => {
    const base = fingerprint("Stripe", "Software Engineer", "Toronto");
    expect(fingerprint("Stripe", "Software Engineer", "Montréal")).not.toBe(base);
    expect(fingerprint("Shopify", "Software Engineer", "Toronto")).not.toBe(base);
  });
  it("is 32 hex chars", () => {
    expect(fingerprint("a", "b", null)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("canonicalUrl", () => {
  it("drops tracking params, hash, www and trailing slash", () => {
    expect(
      canonicalUrl("http://www.Example.com/jobs/42/?utm_source=x&gh_src=abc&b=2&a=1#apply"),
    ).toBe("https://example.com/jobs/42?a=1&b=2");
  });
  it("keeps job-identifying params such as gh_jid", () => {
    expect(canonicalUrl("https://stripe.com/jobs/search?gh_jid=8172508&gh_src=x")).toBe(
      "https://stripe.com/jobs/search?gh_jid=8172508",
    );
  });
  it("returns null for garbage", () => {
    expect(canonicalUrl("not a url")).toBeNull();
  });
});

describe("html", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeEntities("&lt;p&gt;R&amp;D &#233;quipe &#x2014; ok&lt;/p&gt;")).toBe(
      "<p>R&D équipe — ok</p>",
    );
  });
  it("converts HTML to readable text", () => {
    const html =
      "<h2>About</h2><p>We build&nbsp;things.</p><ul><li>TypeScript</li><li>Rust</li></ul><script>x()</script>";
    expect(htmlToText(html)).toBe("About\nWe build things.\n\n- TypeScript\n- Rust");
  });
  it("handles empty input", () => {
    expect(htmlToText(undefined)).toBe("");
  });
});

describe("detectLang", () => {
  it("detects French and English", () => {
    expect(
      detectLang(
        "Nous sommes une équipe passionnée et nous cherchons pour notre studio un développeur avec des compétences",
      ),
    ).toBe("fr");
    expect(
      detectLang(
        "We are a team of builders and you will work with our engineers on the product for our users",
      ),
    ).toBe("en");
    expect(detectLang("ok")).toBeNull();
  });
});
