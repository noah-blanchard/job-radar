import { sql } from "@jobradar/db";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return Response.json(
      { ok: false, db: "error", error: err instanceof Error ? err.message : String(err) },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
