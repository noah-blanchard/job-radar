import { describe, expect, it } from "vitest";
import { formatAge, formatDate, formatDateTime, placeLabel } from "../src/lib/utils";

describe("date formatting", () => {
  it("accepts the string timestamps raw SQL returns with postgres-js", () => {
    const s = "2026-11-13 22:15:00.123+00";
    expect(formatDateTime(s)).toBe(formatDateTime(new Date(s)));
    expect(formatDateTime(s)).not.toBe("—");
    expect(formatDate("2026-11-13T12:00:00Z")).toContain("2026");
    expect(formatDateTime("not a date")).toBe("—");
    expect(formatDateTime(null)).toBe("—");
  });

  it("formats ages and places", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    expect(formatAge("2026-11-13T11:30:00Z", now)).toBe("30 min");
    expect(formatAge("2026-11-13T09:00:00Z", now)).toBe("3 h");
    expect(formatAge("2026-11-10T12:00:00Z", now)).toBe("3 j");
    expect(placeLabel({ city: "Montréal", country: "CA", remote: "hybrid" })).toBe(
      "Montréal, CA · hybride",
    );
    expect(placeLabel({ remote: "unknown" })).toBe("—");
  });
});
