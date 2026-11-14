import { describe, expect, it } from "vitest";
import { createFormat } from "../src/i18n/format";
import { MESSAGES, type MessageKey } from "../src/i18n/messages";
import { createT } from "../src/i18n/translate";

const format = (locale: "fr" | "en") =>
  createFormat(locale, createT<MessageKey>(locale, MESSAGES[locale]));

describe("date formatting", () => {
  it("accepts the string timestamps raw SQL returns with postgres-js", () => {
    const f = format("fr");
    const s = "2026-11-13 22:15:00.123+00";
    expect(f.dateTime(s)).toBe(f.dateTime(new Date(s)));
    expect(f.dateTime(s)).not.toBe("—");
    expect(f.date("2026-11-13T12:00:00Z")).toContain("2026");
    expect(f.dateTime("not a date")).toBe("—");
    expect(f.dateTime(null)).toBe("—");
  });

  it("formats ages and places in each language", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    const fr = format("fr");
    expect(fr.age("2026-11-13T11:30:00Z", now)).toBe("30 min");
    expect(fr.age("2026-11-13T09:00:00Z", now)).toBe("3 h");
    expect(fr.age("2026-11-10T12:00:00Z", now)).toBe("3 j");
    expect(fr.place({ city: "Montréal", country: "CA", remote: "hybrid" })).toBe(
      "Montréal, CA · hybride",
    );
    expect(fr.place({ remote: "unknown" })).toBe("—");
    const en = format("en");
    expect(en.age("2026-11-10T12:00:00Z", now)).toBe("3 d");
    expect(en.place({ city: "Montréal", country: "CA", remote: "hybrid" })).toBe(
      "Montréal, CA · hybrid",
    );
    expect(en.duration(75_000)).toBe("1 min 15 s");
  });

  it("formats numbers with the language's separators", () => {
    expect(format("en").number(93277)).toBe("93,277");
    expect(format("fr").number(93277)).toMatch(/^93\s277$/);
  });
});
