import { describe, expect, it } from "vitest";
import { createFormat } from "../src/i18n/format";
import { MESSAGES, type MessageKey } from "../src/i18n/messages";
import { createT } from "../src/i18n/translate";
import { fromDateInput, toDateInput } from "../src/lib/utils";

const format = (locale: "fr" | "en") =>
  createFormat(locale, createT<MessageKey>(locale, MESSAGES[locale]));

describe("follow-up date display", () => {
  const now = new Date("2026-11-14T15:00:00Z"); // Saturday, Toronto
  it("speaks relative days near today, in each language", () => {
    const fr = format("fr");
    expect(fr.dueDate("2026-11-14T22:00:00Z", now)).toBe("aujourd'hui");
    expect(fr.dueDate("2026-11-15T15:00:00Z", now)).toBe("demain");
    expect(fr.dueDate("2026-11-13T15:00:00Z", now)).toBe("hier");
    expect(fr.dueDate("2026-11-10T15:00:00Z", now)).toBe("il y a 4 j");
    const en = format("en");
    expect(en.dueDate("2026-11-14T22:00:00Z", now)).toBe("today");
    expect(en.dueDate("2026-11-15T15:00:00Z", now)).toBe("tomorrow");
    expect(en.dueDate("2026-11-13T15:00:00Z", now)).toBe("yesterday");
    expect(en.dueDate("2026-11-10T15:00:00Z", now)).toBe("4 d ago");
  });
  it("names later days with the language's weekday", () => {
    expect(format("fr").dueDate("2026-11-19T15:00:00Z", now)).toMatch(/^jeu/);
    expect(format("en").dueDate("2026-11-19T15:00:00Z", now)).toMatch(/^Thu/);
  });
  it("round-trips the date input on the Toronto day", () => {
    expect(toDateInput(fromDateInput("2026-11-19"))).toBe("2026-11-19");
    expect(fromDateInput("19/11")).toBeNull();
  });
});
