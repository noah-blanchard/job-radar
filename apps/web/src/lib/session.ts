import { jwtVerify, SignJWT } from "jose";

/**
 * Edge/Node-safe session helpers (no node:crypto here: this module is imported by the proxy).
 * Session = HS256 JWT signed with AUTH_SECRET, stored in an httpOnly cookie.
 */

export const SESSION_COOKIE = "jr_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const SUBJECT = "owner";
const ISSUER = "jobradar";

function key(secret: string): Uint8Array {
  if (secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function signSession(secret: string, now: Date = new Date()): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(SUBJECT)
    .setIssuer(ISSUER)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_TTL_SECONDS)
    .sign(key(secret));
}

export async function verifySession(
  token: string | undefined,
  secret: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      subject: SUBJECT,
      currentDate: now,
    });
    return payload.sub === SUBJECT;
  } catch {
    return false;
  }
}

/** Only allow same-origin relative redirects after login. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.startsWith("/login")) return "/";
  return next;
}
