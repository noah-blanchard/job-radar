import { sql } from "@jobradar/db";
import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame, PageHeader, PageScroll } from "@/components/placeholder";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getFormat, getT } from "@/i18n/server";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { cn } from "@/lib/utils";
import { AddCompanyForm } from "./add-company-form";
import { CompanyFilters, type CompanyFilterValues } from "./company-filters";
import { PrioritySelect } from "./priority-select";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("nav.companies") };
}
export const dynamic = "force-dynamic";

const ORIGINS = ["seed", "discovered", "manual"] as const;
const STATUSES = ["ok", "unknown", "broken", "unsupported"] as const;
const LIMIT = 500;

interface CompanyRow extends Record<string, unknown> {
  id: number;
  name: string;
  ats: string | null;
  ats_key: string | null;
  ats_status: (typeof STATUSES)[number];
  origin: (typeof ORIGINS)[number];
  /** The signed-in user's priority (score bonus); "normal" when they set none. */
  priority: "low" | "normal" | "high";
  last_ok_at: Date | null;
  open_jobs: number;
}

async function loadCompanies(userId: number, f: CompanyFilterValues) {
  const db = getDb();
  const conds = [sql`true`];
  if (f.q) conds.push(sql`c.name ilike ${`%${f.q}%`}`);
  if (f.origin) conds.push(sql`c.origin = ${f.origin}`);
  if (f.status) conds.push(sql`c.ats_status = ${f.status}`);
  if (f.ats === "none") conds.push(sql`c.ats is null`);
  else if (f.ats) conds.push(sql`c.ats = ${f.ats}`);
  const where = sql.join(conds, sql` and `);
  const rows = await db.execute<CompanyRow>(sql`
    select c.id, c.name, c.ats, c.ats_key, c.ats_status, c.origin,
      coalesce(cp.priority, 'normal') as priority, c.last_ok_at,
      coalesce(j.open_jobs, 0)::int as open_jobs
    from companies c
    left join company_prefs cp on cp.company_id = c.id and cp.user_id = ${userId}
    left join (
      select company_id, count(*)::int as open_jobs
      from jobs where closed_at is null and company_id is not null
      group by company_id
    ) j on j.company_id = c.id
    where ${where}
    order by (cp.priority = 'high') is true desc, open_jobs desc, c.name
    limit ${LIMIT}`);
  const summary = await db.execute<{ origin: string; n: number; with_ats: number }>(sql`
    select origin, count(*)::int as n, count(ats)::int as with_ats
    from companies group by origin order by origin`);
  const atsList = await db.execute<{ ats: string; n: number }>(sql`
    select ats, count(*)::int as n from companies where ats is not null
    group by ats order by n desc, ats`);
  return {
    rows: rows.map((r) => ({ ...r, last_ok_at: r.last_ok_at ? new Date(r.last_ok_at) : null })),
    summary,
    atsList,
  };
}

const STATUS_CLASS = {
  ok: "text-success",
  unknown: "text-muted-foreground",
  broken: "text-destructive",
  unsupported: "text-muted-foreground",
} as const;

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pick = (k: string, allowed?: readonly string[]) => {
    const v = typeof sp[k] === "string" ? (sp[k] as string).trim() : undefined;
    return v && (!allowed || allowed.includes(v)) ? v : undefined;
  };
  const filters: CompanyFilterValues = {
    q: pick("q")?.slice(0, 80),
    origin: pick("origin", ORIGINS),
    status: pick("status", STATUSES),
    ats: pick("ats"),
  };
  const user = await currentUser();
  const [t, format] = await Promise.all([getT(), getFormat()]);
  const originLabel = (o: string) =>
    (ORIGINS as readonly string[]).includes(o) ? t(`companies.origin.${o as "seed"}`) : o;
  const { rows, summary, atsList } = await loadCompanies(user.id, filters);
  const total = summary.reduce((a, s) => a + s.n, 0);
  const withAts = summary.reduce((a, s) => a + s.with_ats, 0);
  const discovered = summary.find((s) => s.origin === "discovered")?.n ?? 0;

  return (
    <PageFrame>
      <PageHeader
        title={t("nav.companies")}
        description={t("companies.summary", { total, withAts, discovered })}
      />
      <div className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 md:px-6 xl:flex-row xl:items-center xl:justify-between">
        <CompanyFilters
          filters={filters}
          atsList={atsList}
          origins={ORIGINS.map((o) => ({ value: o, label: originLabel(o) }))}
          statuses={STATUSES.map((s) => ({ value: s, label: t(`companies.status.${s}`) }))}
        />
        <AddCompanyForm />
      </div>

      <PageScroll className="px-4 md:px-6">
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-10 text-[13px]">{t("companies.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("companies.colCompany")}</TableHead>
                <TableHead>{t("companies.colAts")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("companies.colKey")}</TableHead>
                <TableHead>{t("companies.colStatus")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("companies.colOrigin")}</TableHead>
                <TableHead>{t("companies.colPriority")}</TableHead>
                <TableHead className="text-right">{t("companies.colOffers")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("companies.colLastOk")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-56 truncate font-medium">{r.name}</TableCell>
                  <TableCell>{r.ats ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell
                    className="text-muted-foreground hidden max-w-xs truncate font-mono text-xs md:table-cell"
                    title={r.ats_key ?? undefined}
                  >
                    {r.ats_key ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn("inline-flex items-center gap-1.5", STATUS_CLASS[r.ats_status])}
                    >
                      <span className="size-1.5 rounded-full bg-current" aria-hidden />
                      {t(`companies.status.${r.ats_status}`)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    {originLabel(r.origin)}
                  </TableCell>
                  <TableCell>
                    <PrioritySelect companyId={r.id} priority={r.priority} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.open_jobs > 0 ? (
                      <Link
                        href={`/?company=${encodeURIComponent(r.name)}&status=active`}
                        className="hover:text-info hover:underline"
                        title={t("companies.seeOffers")}
                      >
                        {r.open_jobs}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground hidden lg:table-cell"
                    title={format.dateTime(r.last_ok_at)}
                  >
                    {r.last_ok_at ? t("companies.ago", { age: format.age(r.last_ok_at) }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {rows.length === LIMIT ? (
          <p className="text-muted-foreground py-3 text-xs">
            {t("companies.limit", { limit: LIMIT })}
          </p>
        ) : null}
      </PageScroll>
    </PageFrame>
  );
}
