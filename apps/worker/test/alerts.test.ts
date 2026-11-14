import { describe, expect, it } from "vitest";
import { lastScheduled } from "../src/alerts";

describe("lastScheduled (digest anchor)", () => {
  const TZ = "America/Toronto";

  it("is the occurrence that just fired, even a few ms late", () => {
    expect(lastScheduled("0 8 * * *", TZ, new Date("2027-01-15T13:00:00.250Z"))).toEqual(
      new Date("2027-01-15T13:00:00Z"),
    );
  });

  it("is the previous day's before 08:00, and follows DST", () => {
    expect(lastScheduled("0 8 * * *", TZ, new Date("2027-01-15T12:59:00Z"))).toEqual(
      new Date("2027-01-14T13:00:00Z"),
    );
    // Summer: 08:00 EDT = 12:00 UTC.
    expect(lastScheduled("0 8 * * *", TZ, new Date("2027-07-15T15:00:00Z"))).toEqual(
      new Date("2027-07-15T12:00:00Z"),
    );
  });
});
