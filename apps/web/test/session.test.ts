import { describe, expect, it } from "vitest";
import { checkPassword } from "../src/lib/password";
import { safeNextPath, SESSION_TTL_SECONDS, signSession, verifySession } from "../src/lib/session";

const SECRET = "x".repeat(32);
const OTHER = "y".repeat(32);

describe("session tokens", () => {
  it("verifies a freshly signed token", async () => {
    const token = await signSession(SECRET);
    expect(await verifySession(token, SECRET)).toBe(true);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSession(OTHER);
    expect(await verifySession(token, SECRET)).toBe(false);
  });

  it("rejects a tampered token", async () => {
    const token = await signSession(SECRET);
    const [h, p, s] = token.split(".");
    const forged = `${h}.${Buffer.from('{"sub":"owner","iss":"jobradar","exp":9999999999}').toString("base64url")}.${s}`;
    expect(p).toBeDefined();
    expect(await verifySession(forged, SECRET)).toBe(false);
  });

  it("rejects an expired token", async () => {
    const issued = new Date("2026-01-01T00:00:00Z");
    const token = await signSession(SECRET, issued);
    const later = new Date(issued.getTime() + (SESSION_TTL_SECONDS + 60) * 1000);
    expect(await verifySession(token, SECRET, later)).toBe(false);
  });

  it("rejects missing or garbage tokens", async () => {
    expect(await verifySession(undefined, SECRET)).toBe(false);
    expect(await verifySession("not-a-jwt", SECRET)).toBe(false);
  });

  it("refuses a short secret", async () => {
    await expect(signSession("short")).rejects.toThrow(/32/);
  });
});

describe("checkPassword", () => {
  it("accepts the right password", () => {
    expect(checkPassword("hunter2-long", "hunter2-long")).toBe(true);
  });
  it("rejects wrong passwords, including prefixes", () => {
    expect(checkPassword("hunter2", "hunter2-long")).toBe(false);
    expect(checkPassword("", "hunter2-long")).toBe(false);
  });
  it("rejects everything when no password is configured", () => {
    expect(checkPassword("", undefined)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each([
    [undefined, "/"],
    ["/sources", "/sources"],
    ["/jobs/42?x=1", "/jobs/42?x=1"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/login", "/"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
