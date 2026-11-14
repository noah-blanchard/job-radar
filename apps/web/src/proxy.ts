import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * Auth gate for every route except /login, /invite, /healthz and static assets (see matcher).
 * Only checks the signature here; pages load the user (lib/auth.ts) and drop deleted accounts.
 */
export async function proxy(req: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  const ok = secret
    ? (await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret)) !== null
    : false;
  if (ok) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!login|invite/|healthz|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
  ],
};
