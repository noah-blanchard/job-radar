import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, users, type AnyDb } from "@jobradar/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acceptInvite,
  createInvite,
  deleteUser,
  ensureOwner,
  findUserByEmail,
  hashPassword,
  verifyPassword,
} from "../src/users";
import { testDb } from "./helpers";

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("correct horse");
    const b = await hashPassword("correct horse");
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct horse", a)).toBe(true);
    expect(await verifyPassword("wrong horse", a)).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("accounts", () => {
  let db: AnyDb;
  let close: () => Promise<void>;
  beforeEach(async () => {
    ({ db, close } = await testDb());
  });
  afterEach(async () => {
    await close();
  });

  it("bootstraps the owner from the env and config/profile.yaml, once", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jobradar-owner-"));
    writeFileSync(join(dir, "profile.yaml"), "languages: [fr]\n");
    const env = { ADMIN_EMAIL: "Owner@Example.com", DASHBOARD_PASSWORD: "password123" };
    const first = await ensureOwner(db, env, { configDir: dir });
    expect(first.id).toBe(1);
    expect(first.changed.sort()).toEqual([
      "email",
      "passwordHash",
      "profileUpdatedAt",
      "profileYaml",
    ]);
    const owner = await findUserByEmail(db, "owner@example.com");
    expect(owner).toMatchObject({ id: 1, role: "admin", profileYaml: "languages: [fr]\n" });
    expect(await verifyPassword("password123", owner!.passwordHash)).toBe(true);

    // Values already set are never overwritten (password changed in the app since).
    const again = await ensureOwner(
      db,
      { ...env, DASHBOARD_PASSWORD: "another-one" },
      { configDir: dir },
    );
    expect(again.changed).toEqual([]);
  });

  it("invites a new user once, and resets an existing user's password", async () => {
    const now = new Date("2026-11-14T12:00:00Z");
    const inv = await createInvite(db, { email: "Alice@Example.com", createdBy: 1, now });
    expect(inv.userId).toBeNull();
    expect(await acceptInvite(db, { token: inv.token, password: "short", now })).toMatchObject({
      ok: false,
    });
    const ok = await acceptInvite(db, {
      token: inv.token,
      password: "alice-secret",
      name: "Alice",
      now,
    });
    expect(ok.ok).toBe(true);
    const alice = await findUserByEmail(db, "alice@example.com");
    expect(alice).toMatchObject({ role: "user", name: "Alice", profileYaml: "" });
    // A link works once.
    expect(await acceptInvite(db, { token: inv.token, password: "alice-secret", now })).toEqual({
      ok: false,
      error: "Lien invalide ou expiré.",
    });

    // Reset link: same table, tied to the existing account.
    const reset = await createInvite(db, { email: "alice@example.com", now });
    expect(reset.userId).toBe(alice!.id);
    expect(await acceptInvite(db, { token: reset.token, password: "new-secret", now })).toEqual({
      ok: true,
      userId: alice!.id,
    });
    const [after] = await db.select().from(users).where(eq(users.id, alice!.id));
    expect(await verifyPassword("new-secret", after!.passwordHash)).toBe(true);

    // Expired links are refused.
    const late = await createInvite(db, { email: "bob@example.com", now });
    const later = new Date(now.getTime() + 8 * 86_400_000);
    expect(
      (await acceptInvite(db, { token: late.token, password: "bob-secret", now: later })).ok,
    ).toBe(false);
  });

  it("deletes a user but never the owner", async () => {
    const [u] = await db.insert(users).values({ email: "x@example.com" }).returning();
    expect(await deleteUser(db, u!.id)).toBe(true);
    await expect(deleteUser(db, 1)).rejects.toThrow();
  });
});
