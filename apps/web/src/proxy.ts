import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/** Auth gate for every route except /login, /healthz and static assets (see matcher). */
export async function proxy(req: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  const ok = secret ? await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret) : false;
  if (ok) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|healthz|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
