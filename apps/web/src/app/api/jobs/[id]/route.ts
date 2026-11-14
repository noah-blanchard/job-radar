import { NextResponse } from "next/server";
import { getLocale } from "@/i18n/server";
import { currentUser } from "@/lib/auth";
import { loadJobDetail, parseJobId } from "@/lib/job-detail";

export const dynamic = "force-dynamic";

/**
 * Job detail as JSON for the Inbox reading pane. A route handler rather than a server action:
 * actions run one at a time per client and would queue behind status writes while you triage.
 * Auth: covered by the proxy matcher like every other route.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseJobId((await params).id);
  const user = await currentUser();
  const job = id ? await loadJobDetail(user.id, id, await getLocale()) : null;
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(job, { headers: { "cache-control": "private, no-store" } });
}
