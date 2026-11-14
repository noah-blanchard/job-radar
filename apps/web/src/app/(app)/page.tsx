import type { Metadata } from "next";
import { FilterBar } from "@/components/inbox/filter-bar";
import { InboxTable } from "@/components/inbox/inbox-table";
import { parseFilters } from "@/lib/filters";
import { loadFilterOptions, loadInbox } from "@/lib/jobs";
import { profileDomains } from "@/lib/profile";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const [{ rows, total }, options] = await Promise.all([loadInbox(filters), loadFilterOptions()]);
  return (
    <>
      <h1 className="sr-only">Inbox</h1>
      <FilterBar
        filters={filters}
        countries={options.countries}
        sources={options.sources}
        domains={profileDomains()}
      />
      <InboxTable rows={rows} total={total} filters={filters} />
    </>
  );
}
