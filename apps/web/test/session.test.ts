import { describe, expect, it } from "vitest";
import { safeNextPath, SESSION_TTL_SECONDS, signSession, verifySession } from "../src/lib/session";

const SECRET = "x".repeat(32);
const OTHER = "y".repeat(32);

describe("session tokens", () => {
  it("verifies a freshly signed token", async () => {
    const token = await signSession(SECRET, 42);
    expect(await verifySession(token, SECRET)).toBe(42);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSession(OTHER, 1);
    expect(await verifySession(token, SECRET)).toBeNull();
  });

  it("rejects a tampered token", async () => {
    const token = await signSession(SECRET, 2);
    const [h, p, s] = token.split(".");
    // Same signature, payload swapped to another user: refused.
    const forged = `${h}.${Buffer.from('{"sub":"1","iss":"jobradar","exp":9999999999}').toString("base64url")}.${s}`;
    expect(p).toBeDefined();
    expect(await verifySession(forged, SECRET)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const issued = new Date("2026-01-01T00:00:00Z");
    const token = await signSession(SECRET, 1, issued);
    const later = new Date(issued.getTime() + (SESSION_TTL_SECONDS + 60) * 1000);
    expect(await verifySession(token, SECRET, later)).toBeNull();
  });

  it("rejects the single-user tokens issued before accounts existed", async () => {
    const { SignJWT } = await import("jose");
    const old = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("owner")
      .setIssuer("jobradar")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifySession(old, SECRET)).toBeNull();
  });

  it("rejects missing or garbage tokens", async () => {
    expect(await verifySession(undefined, SECRET)).toBeNull();
    expect(await verifySession("not-a-jwt", SECRET)).toBeNull();
  });

  it("refuses a short secret", async () => {
    await expect(signSession("short", 1)).rejects.toThrow(/32/);
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
