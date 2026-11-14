import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time password check (hashing first makes lengths equal). */
export function checkPassword(candidate: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = createHash("sha256").update(candidate, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}
