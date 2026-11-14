import { queryRows, sql } from "@jobradar/db";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
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
  const user = await currentUser();
  const rows = await queryRows<SearchHit>(
    getDb(),
    sql`select j.id, j.title, j.company_name, sc.score, j.closed_at is not null as closed
        from jobs j
        left join job_scores sc on sc.job_id = j.id and sc.user_id = ${user.id}
        where j.tsv @@ websearch_to_tsquery('simple', ${q})
        order by (j.closed_at is null) desc, sc.score desc nulls last, j.first_seen_at desc
        limit 8`,
  );
  return NextResponse.json(
    rows.map((r) => ({ ...r, id: Number(r.id) })),
    { headers: { "cache-control": "private, no-store" } },
  );
}
