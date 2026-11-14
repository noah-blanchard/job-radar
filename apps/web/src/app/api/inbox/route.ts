import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { parseFilters } from "@/lib/filters";
import { loadInboxRows } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** Next slice of the Inbox for the infinite scroll (same filters as the page URL + `offset`). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const offset = Number(sp.get("offset"));
  const user = await currentUser();
  const rows = await loadInboxRows(
    user.id,
    parseFilters(sp),
    Number.isFinite(offset) && offset > 0 ? Math.min(offset, 100_000) : 0,
  );
  return NextResponse.json(rows, { headers: { "cache-control": "private, no-store" } });
}
