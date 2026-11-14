import { NextResponse } from "next/server";
import { loadJobDetail, parseJobId } from "@/lib/job-detail";

export const dynamic = "force-dynamic";

/**
 * Job detail as JSON for the Inbox reading pane. A route handler rather than a server action:
 * actions run one at a time per client and would queue behind status writes while you triage.
 * Auth: covered by the proxy matcher like every other route.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseJobId((await params).id);
  const job = id ? await loadJobDetail(id) : null;
  if (!job) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  return NextResponse.json(job, { headers: { "cache-control": "private, no-store" } });
}
