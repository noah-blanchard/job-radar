import { queryRows, sql } from "@jobradar/db";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export interface SearchHit {
  id: number;
  title: string;
  company_name: string;
  score: number | null;
  closed: boolean;
}

/** Command palette search: open jobs first, full-text on title / company (tsv index). */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return NextResponse.json([] satisfies SearchHit[]);
  const rows = await queryRows<SearchHit>(
    getDb(),
    sql`select id, title, company_name, score, closed_at is not null as closed
        from jobs
        where tsv @@ websearch_to_tsquery('simple', ${q})
        order by (closed_at is null) desc, score desc nulls last, first_seen_at desc
        limit 8`,
  );
  return NextResponse.json(
    rows.map((r) => ({ ...r, id: Number(r.id) })),
    { headers: { "cache-control": "private, no-store" } },
  );
}
