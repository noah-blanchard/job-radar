import { describe, expect, it } from "vitest";
import { formatDueDate, fromDateInput, toDateInput } from "../src/lib/utils";

describe("follow-up date display", () => {
  const now = new Date("2026-11-14T15:00:00Z"); // samedi, Toronto
  it("speaks relative days near today", () => {
    expect(formatDueDate("2026-11-14T22:00:00Z", now)).toBe("aujourd'hui");
    expect(formatDueDate("2026-11-15T15:00:00Z", now)).toBe("demain");
    expect(formatDueDate("2026-11-13T15:00:00Z", now)).toBe("hier");
    expect(formatDueDate("2026-11-10T15:00:00Z", now)).toBe("il y a 4 j");
  });
  it("round-trips the date input on the Toronto day", () => {
    expect(toDateInput(fromDateInput("2026-11-19"))).toBe("2026-11-19");
    expect(fromDateInput("19/11")).toBeNull();
  });
});
