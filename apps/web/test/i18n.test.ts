import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, negotiate, parseLocale } from "../src/i18n/config";
import { MESSAGES, type MessageKey } from "../src/i18n/messages";
import { createT, isPlural, type Dict, type Leaf } from "../src/i18n/translate";

/** Every leaf of a dictionary, by dot path. */
function leaves(d: Dict, prefix = ""): Map<string, Leaf> {
  const out = new Map<string, Leaf>();
  for (const [k, v] of Object.entries(d)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string" || isPlural(v)) out.set(path, v);
    else for (const [p, l] of leaves(v, path)) out.set(p, l);
  }
  return out;
}

const texts = (l: Leaf): string[] => (typeof l === "string" ? [l] : Object.values(l));
const placeholders = (l: Leaf) =>
  [...new Set(texts(l).flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();

describe("languages", () => {
  it("registers French and English, French first by default", () => {
    expect(LOCALES.map((l) => l.code)).toEqual(["fr", "en"]);
    expect(DEFAULT_LOCALE).toBe("fr");
  });

  it("parses only registered codes", () => {
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("fr")).toBe("fr");
    expect(parseLocale("de")).toBeNull();
    expect(parseLocale(null)).toBeNull();
  });

  it("picks the best language from Accept-Language", () => {
    expect(negotiate("en-US,en;q=0.9,fr;q=0.8")).toBe("en");
    expect(negotiate("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(negotiate("de-DE,de;q=0.9,en;q=0.5")).toBe("en");
    expect(negotiate("en;q=0.2,fr;q=0.9")).toBe("fr");
    expect(negotiate("de")).toBe("fr");
    expect(negotiate("")).toBe("fr");
    expect(negotiate(null)).toBe("fr");
  });
});

describe("dictionaries", () => {
  const reference = leaves(MESSAGES.fr as unknown as Dict);

  it.each(LOCALES.map((l) => l.code))("%s has exactly the reference keys", (code) => {
    const dict = leaves(MESSAGES[code] as unknown as Dict);
    expect([...dict.keys()].sort()).toEqual([...reference.keys()].sort());
  });

  it.each(LOCALES.map((l) => l.code))(
    "%s keeps every placeholder and leaves nothing empty",
    (code) => {
      const dict = leaves(MESSAGES[code] as unknown as Dict);
      for (const [key, ref] of reference) {
        const l = dict.get(key)!;
        expect(placeholders(l), key).toEqual(placeholders(ref));
        for (const s of texts(l)) expect(s.trim(), key).not.toBe("");
        if (isPlural(ref)) expect(isPlural(l), key).toBe(true);
      }
    },
  );
});

describe("translate", () => {
  const fr = createT<MessageKey>("fr", MESSAGES.fr);
  const en = createT<MessageKey>("en", MESSAGES.en);

  it("fills placeholders", () => {
    expect(en("palette.noMatch", { q: "rust" })).toBe("Nothing matches “rust”.");
    expect(fr("palette.noMatch", { q: "rust" })).toBe("Rien ne correspond à « rust ».");
  });

  it("follows each language's plural rule", () => {
    // French: 0 and 1 are singular; English: only 1.
    expect(fr("inbox.total", { count: 0 })).toBe("0 offre");
    expect(fr("inbox.total", { count: 1 })).toBe("1 offre");
    expect(fr("inbox.total", { count: 2 })).toBe("2 offres");
    expect(en("inbox.total", { count: 0 })).toBe("0 offers");
    expect(en("inbox.total", { count: 1 })).toBe("1 offer");
    expect(en("inbox.total", { count: 1234 })).toBe("1,234 offers");
  });

  it("shows the key itself rather than crashing on a missing one", () => {
    expect(en("nope.missing" as MessageKey)).toBe("nope.missing");
  });
});
