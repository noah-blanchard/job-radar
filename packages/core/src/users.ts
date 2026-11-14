/**
 * Accounts: password hashing (scrypt, no dependency), invitation / reset links, owner bootstrap.
 * Shared by the dashboard (login, invitations) and the worker CLI (`user ...`).
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { and, asc, eq, gt, isNull, sql, users, invites, type AnyDb, type User } from "@jobradar/db";
import { findConfigDir } from "./config";
import type { Env } from "./env";

// ---------- passwords ----------

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const;
export const MIN_PASSWORD_LENGTH = 8;

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, SCRYPT.keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** "scrypt$N$r$p$<salt b64>$<hash b64>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")]
    .map(String)
    .join("$");
}

/** Constant-time check against a stored hash; false for a missing or malformed hash. */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  const parts = stored?.split("$");
  if (!parts || parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hash, "base64");
  try {
    const key = await scryptAsync(password, Buffer.from(salt, "base64"), +n, +r, +p);
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// ---------- users ----------

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function findUserByEmail(db: AnyDb, email: string): Promise<User | undefined> {
  const [u] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizeEmail(email)}`)
    .limit(1);
  return u;
}

export async function getUser(db: AnyDb, id: number): Promise<User | undefined> {
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return u;
}

/** The first admin: receives the global alerts and drives the aggregator searches for now. */
export async function ownerUser(db: AnyDb): Promise<User | undefined> {
  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(asc(users.id))
    .limit(1);
  return u;
}

export async function listUsers(db: AnyDb): Promise<User[]> {
  return db.select().from(users).orderBy(asc(users.id));
}

/**
 * Owner bootstrap, idempotent: the migration creates user 1 (admin) without credentials; this
 * fills its e-mail (ADMIN_EMAIL, else CONTACT_EMAIL), its password (DASHBOARD_PASSWORD) and, when
 * empty, its profile (config/profile.yaml). Never overwrites a value already set.
 */
export async function ensureOwner(
  db: AnyDb,
  env: Pick<Env, "ADMIN_EMAIL" | "CONTACT_EMAIL" | "DASHBOARD_PASSWORD">,
  opts: { configDir?: string } = {},
): Promise<{ id: number; changed: string[] }> {
  let owner = await ownerUser(db);
  if (!owner) {
    [owner] = await db.insert(users).values({ role: "admin" }).returning();
  }
  const patch: Partial<typeof users.$inferInsert> = {};
  const email = env.ADMIN_EMAIL ?? env.CONTACT_EMAIL;
  if (!owner!.email && email) patch.email = normalizeEmail(email);
  if (!owner!.passwordHash && env.DASHBOARD_PASSWORD)
    patch.passwordHash = await hashPassword(env.DASHBOARD_PASSWORD);
  if (!owner!.profileYaml.trim()) {
    try {
      const file = join(opts.configDir ?? findConfigDir(), "profile.yaml");
      if (existsSync(file)) {
        patch.profileYaml = readFileSync(file, "utf8");
        patch.profileUpdatedAt = new Date();
      }
    } catch {
      // No config/ folder (tests, web without CONFIG_DIR): the profile stays empty.
    }
  }
  if (Object.keys(patch).length > 0)
    await db.update(users).set(patch).where(eq(users.id, owner!.id));
  return { id: owner!.id, changed: Object.keys(patch) };
}

// ---------- invitations and password resets ----------

export const INVITE_TTL_DAYS = 7;

/** Loose shape check ("a@b.c"), shared by the invite form and the core. */
export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface CreatedInvite {
  token: string;
  expiresAt: Date;
  /** Set when the link resets the password of an existing account. */
  userId: number | null;
}

/**
 * Invitation link for a new e-mail, or password-reset link for an existing account (same table,
 * `user_id` set). Earlier unused links for the same e-mail are revoked. Only the token's hash is
 * stored: the caller shows the token once.
 */
export async function createInvite(
  db: AnyDb,
  input: { email: string; createdBy?: number | null; now?: Date },
): Promise<CreatedInvite> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new Error("invalid e-mail address");
  const now = input.now ?? new Date();
  const existing = await findUserByEmail(db, email);
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000);
  await db
    .update(invites)
    .set({ usedAt: now })
    .where(and(eq(invites.email, email), isNull(invites.usedAt)));
  await db.insert(invites).values({
    tokenHash: hashToken(token),
    email,
    userId: existing?.id ?? null,
    createdBy: input.createdBy ?? null,
    expiresAt,
  });
  return { token, expiresAt, userId: existing?.id ?? null };
}

export async function findInvite(db: AnyDb, token: string, now = new Date()) {
  const [inv] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.tokenHash, hashToken(token)),
        isNull(invites.usedAt),
        gt(invites.expiresAt, now),
      ),
    )
    .limit(1);
  return inv;
}

/** Why a link was refused: a code, the interface words it in the user's language. */
export type AcceptError = "password_too_short" | "invalid_link" | "link_used" | "email_taken";
export type AcceptResult = { ok: true; userId: number } | { ok: false; error: AcceptError };

/** Uses a link: creates the account (invitation) or sets the new password (reset). */
export async function acceptInvite(
  db: AnyDb,
  input: { token: string; password: string; name?: string; now?: Date },
): Promise<AcceptResult> {
  const now = input.now ?? new Date();
  if (input.password.length < MIN_PASSWORD_LENGTH)
    return { ok: false, error: "password_too_short" };
  const inv = await findInvite(db, input.token, now);
  if (!inv) return { ok: false, error: "invalid_link" };
  // Claim the link first: two submissions can never both use it.
  const claimed = await db
    .update(invites)
    .set({ usedAt: now })
    .where(and(eq(invites.id, inv.id), isNull(invites.usedAt)))
    .returning({ id: invites.id });
  if (claimed.length === 0) return { ok: false, error: "link_used" };

  const passwordHash = await hashPassword(input.password);
  const name = input.name?.trim() || null;
  if (inv.userId !== null) {
    await db.update(users).set({ passwordHash }).where(eq(users.id, inv.userId));
    return { ok: true, userId: inv.userId };
  }
  if (await findUserByEmail(db, inv.email)) return { ok: false, error: "email_taken" };
  const [u] = await db
    .insert(users)
    .values({ email: inv.email, name, passwordHash, role: "user" })
    .returning({ id: users.id });
  return { ok: true, userId: u!.id };
}

/** Deletes an account and everything it owns (scores, statuses, priorities: ON DELETE CASCADE). */
export async function deleteUser(db: AnyDb, id: number): Promise<boolean> {
  const owner = await ownerUser(db);
  if (owner?.id === id) throw new Error("the owner account cannot be deleted");
  const rows = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
  return rows.length > 0;
}
