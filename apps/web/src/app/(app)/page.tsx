import type { Metadata } from "next";
import { Inbox } from "@/components/inbox/inbox";
import { TodayStrip } from "@/components/inbox/today-strip";
import { currentUser } from "@/lib/auth";
import { DEFAULT_FILTERS, inboxHref, parseFilters } from "@/lib/filters";
import { loadFilterOptions, loadInbox } from "@/lib/jobs";
import { profileDomains } from "@/lib/profile";
import { loadToday } from "@/lib/today";

export const metadata: Metadata = { title: "Trier" };
export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const job = Number(Array.isArray(sp.job) ? sp.job[0] : sp.job);
  const user = await currentUser();
  const [{ rows, total }, options, today, domains] = await Promise.all([
    loadInbox(user.id, filters),
    loadFilterOptions(),
    loadToday(),
    profileDomains(user.id),
  ]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TodayStrip
        today={today}
        triageHref={inboxHref({ ...DEFAULT_FILTERS, minScore: today.minScore })}
      />
      <Inbox
        rows={rows}
        total={total}
        filters={filters}
        options={{ ...options, domains }}
        counts={{}}
        minScore={today.minScore}
        initialJob={Number.isSafeInteger(job) && job > 0 ? job : null}
      />
    </div>
  );
}
