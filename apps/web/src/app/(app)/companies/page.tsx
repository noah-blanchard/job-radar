import { sql } from "@jobradar/db";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/placeholder";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/lib/db";
import { cn, formatAge, formatDateTime } from "@/lib/utils";
import { AddCompanyForm } from "./add-company-form";
import { CompanyFilters, type CompanyFilterValues } from "./company-filters";
import { PrioritySelect } from "./priority-select";

export const metadata: Metadata = { title: "Entreprises" };
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
  priority: "low" | "normal" | "high";
  priority_manual: boolean;
  last_ok_at: Date | null;
  open_jobs: number;
}

async function loadCompanies(f: CompanyFilterValues) {
  const db = getDb();
  const conds = [sql`true`];
  if (f.q) conds.push(sql`c.name ilike ${`%${f.q}%`}`);
  if (f.origin) conds.push(sql`c.origin = ${f.origin}`);
  if (f.status) conds.push(sql`c.ats_status = ${f.status}`);
  if (f.ats === "none") conds.push(sql`c.ats is null`);
  else if (f.ats) conds.push(sql`c.ats = ${f.ats}`);
  const where = sql.join(conds, sql` and `);
  const rows = await db.execute<CompanyRow>(sql`
    select c.id, c.name, c.ats, c.ats_key, c.ats_status, c.origin, c.priority, c.priority_manual, c.last_ok_at,
      coalesce(j.open_jobs, 0)::int as open_jobs
    from companies c
    left join (
      select company_id, count(*)::int as open_jobs
      from jobs where closed_at is null and company_id is not null
      group by company_id
    ) j on j.company_id = c.id
    where ${where}
    order by (c.priority = 'high') desc, open_jobs desc, c.name
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

const STATUS = {
  ok: { label: "ok", cls: "text-success" },
  unknown: { label: "à sonder", cls: "text-muted-foreground" },
  broken: { label: "cassé", cls: "text-destructive" },
  unsupported: { label: "non géré", cls: "text-muted-foreground" },
} as const;

const ORIGIN_LABEL: Record<string, string> = {
  seed: "seed",
  discovered: "découverte",
  manual: "manuelle",
};

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
  const { rows, summary, atsList } = await loadCompanies(filters);
  const total = summary.reduce((a, s) => a + s.n, 0);
  const withAts = summary.reduce((a, s) => a + s.with_ats, 0);
  const discovered = summary.find((s) => s.origin === "discovered")?.n ?? 0;

  return (
    <div>
      <PageHeader
        title="Entreprises"
        description={`${total.toLocaleString("fr-CA")} suivies · ${withAts.toLocaleString("fr-CA")} avec ATS · ${discovered.toLocaleString("fr-CA")} découvertes automatiquement`}
      />
      <div className="flex flex-col gap-3 border-b px-4 py-3 md:px-6 xl:flex-row xl:items-center xl:justify-between">
        <CompanyFilters
          filters={filters}
          atsList={atsList}
          origins={ORIGINS.map((o) => ({ value: o, label: ORIGIN_LABEL[o]! }))}
          statuses={STATUSES.map((s) => ({ value: s, label: STATUS[s].label }))}
        />
        <AddCompanyForm />
      </div>

      <div className="px-4 md:px-6">
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-10 text-[13px]">
            Aucune entreprise pour ces filtres.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Entreprise</TableHead>
                <TableHead>ATS</TableHead>
                <TableHead className="hidden md:table-cell">Clé</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="hidden sm:table-cell">Origine</TableHead>
                <TableHead>Priorité</TableHead>
                <TableHead className="text-right">Offres</TableHead>
                <TableHead className="hidden lg:table-cell">Dernier run OK</TableHead>
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
                      className={cn("inline-flex items-center gap-1.5", STATUS[r.ats_status].cls)}
                    >
                      <span className="size-1.5 rounded-full bg-current" aria-hidden />
                      {STATUS[r.ats_status].label}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    {ORIGIN_LABEL[r.origin] ?? r.origin}
                  </TableCell>
                  <TableCell>
                    <PrioritySelect
                      companyId={r.id}
                      priority={r.priority}
                      manual={r.priority_manual}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.open_jobs > 0 ? (
                      <Link
                        href={`/?company=${encodeURIComponent(r.name)}&status=active`}
                        className="hover:text-info hover:underline"
                        title="Voir ses offres ouvertes"
                      >
                        {r.open_jobs}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground hidden lg:table-cell"
                    title={formatDateTime(r.last_ok_at)}
                  >
                    {r.last_ok_at ? `il y a ${formatAge(r.last_ok_at)}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {rows.length === LIMIT ? (
          <p className="text-muted-foreground py-3 text-xs">
            {LIMIT} premières lignes affichées : affine avec les filtres.
          </p>
        ) : null}
      </div>
    </div>
  );
}
