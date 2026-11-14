import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  applyView,
  currentView,
  DEFAULT_FILTERS,
  inboxHref,
  parseFilters,
} from "../src/lib/filters";
import { isDue, nextFollowUp } from "../src/lib/follow-up";
import { sanitizeHtml } from "../src/lib/sanitize";

const DAY = 86_400_000;

describe("Inbox views", () => {
  it("opens on the triage queue", () => {
    expect(currentView(DEFAULT_FILTERS)).toBe("todo");
    expect(inboxHref(DEFAULT_FILTERS)).toBe("/");
  });

  it("maps the digest link onto the 24 h view, with its score as a filter", () => {
    const f = parseFilters(new URLSearchParams("since=24h&min=40"));
    expect(currentView(f)).toBe("fresh");
    expect(activeFilterCount(f)).toBe(1);
  });

  it("switches view without dropping the other filters", () => {
    const f = { ...DEFAULT_FILTERS, country: "CA", page: 4 };
    const saved = applyView(f, "saved");
    expect(saved).toMatchObject({ status: "saved", since: "all", country: "CA", page: 1 });
    expect(currentView(applyView(saved, "all"))).toBe("all");
  });
});

describe("Follow-up dates", () => {
  const now = new Date("2026-11-14T12:00:00Z");

  it("schedules +7 d on applied and +5 d on interview", () => {
    expect(nextFollowUp("applied", null, now)?.getTime()).toBe(now.getTime() + 7 * DAY);
    expect(nextFollowUp("interview", null, now)?.getTime()).toBe(now.getTime() + 5 * DAY);
  });

  it("keeps a future date, replaces a past one", () => {
    const future = new Date(now.getTime() + 2 * DAY);
    const past = new Date(now.getTime() - DAY);
    expect(nextFollowUp("applied", future, now)).toBe(future);
    expect(nextFollowUp("applied", past, now)?.getTime()).toBe(now.getTime() + 7 * DAY);
  });

  it("clears on rejected, ignored and back to new; keeps on saved", () => {
    const d = new Date(now.getTime() + DAY);
    expect(nextFollowUp("rejected", d, now)).toBeNull();
    expect(nextFollowUp("ignored", d, now)).toBeNull();
    expect(nextFollowUp("new", d, now)).toBeNull();
    expect(nextFollowUp("saved", d, now)).toBe(d);
  });

  it("is due once the date is reached", () => {
    expect(isDue(new Date(now.getTime() - 1), now)).toBe(true);
    expect(isDue(new Date(now.getTime() + 1), now)).toBe(false);
    expect(isDue(null, now)).toBe(false);
  });
});

describe("sanitizeHtml", () => {
  it("returns a serializable allowlisted tree", () => {
    const tree = sanitizeHtml(
      '<h1>T</h1><p onclick="x()">a <b>b</b> <a href="javascript:1">c</a> <a href="https://x.dev/j">d</a></p><img src=x><br>',
    );
    expect(JSON.parse(JSON.stringify(tree))).toEqual([
      { t: "h3", c: ["T"] },
      {
        t: "p",
        c: [
          "a ",
          { t: "strong", c: ["b"] },
          " ",
          "c",
          " ",
          { t: "a", h: "https://x.dev/j", c: ["d"] },
        ],
      },
      { t: "br", c: [] },
    ]);
  });
});

describe("matchesStatus (infinite scroll offsets)", () => {
  it("follows each status filter", async () => {
    const { matchesStatus } = await import("../src/lib/filters");
    expect(matchesStatus("new", "todo")).toBe(true);
    expect(matchesStatus("saved", "todo")).toBe(false);
    expect(matchesStatus("ignored", "active")).toBe(false);
    expect(matchesStatus("applied", "active")).toBe(true);
    expect(matchesStatus("ignored", "all")).toBe(true);
    expect(matchesStatus("saved", "saved")).toBe(true);
    expect(matchesStatus("applied", "saved")).toBe(false);
  });
});
