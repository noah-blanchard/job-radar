import { Suspense } from "react";
import { Rail, TopBar, type NavCounts } from "@/components/nav";
import { ShellKeys } from "@/components/shell-keys";
import { loadToday } from "@/lib/today";
import { logout } from "../login/actions";

async function counts(): Promise<NavCounts | null> {
  try {
    const t = await loadToday();
    return { triage: t.triage, due: t.dueCount, problems: t.problems.length };
  } catch {
    return null; // the shell never fails a page because a count query did
  }
}

async function RailWithCounts() {
  return <Rail counts={await counts()} logout={logout} />;
}
async function TopBarWithCounts() {
  return <TopBar counts={await counts()} logout={logout} />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Suspense fallback={<Rail counts={null} logout={logout} />}>
        <RailWithCounts />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<TopBar counts={null} logout={logout} />}>
          <TopBarWithCounts />
        </Suspense>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
      <ShellKeys />
    </div>
  );
}
