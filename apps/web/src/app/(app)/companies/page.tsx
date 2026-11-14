import { sql } from "@jobradar/db";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/placeholder";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/lib/db";
import { cn, formatDateTime } from "@/lib/utils";
import { AddCompanyForm } from "./add-company-form";

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
  last_ok_at: Date | null;
  open_jobs: number;
}

interface Filters {
  origin?: string;
  status?: string;
  ats?: string;
}

async function loadCompanies(f: Filters) {
  const db = getDb();
  const conds = [sql`true`];
  if (f.origin) conds.push(sql`c.origin = ${f.origin}`);
  if (f.status) conds.push(sql`c.ats_status = ${f.status}`);
  if (f.ats === "none") conds.push(sql`c.ats is null`);
  else if (f.ats) conds.push(sql`c.ats = ${f.ats}`);
  const where = sql.join(conds, sql` and `);
  const rows = await db.execute<CompanyRow>(sql`
    select c.id, c.name, c.ats, c.ats_key, c.ats_status, c.origin, c.priority, c.last_ok_at,
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

const STATUS_VARIANT = {
  ok: "success",
  unknown: "outline",
  broken: "destructive",
  unsupported: "secondary",
} as const;

const ORIGIN_LABEL: Record<string, string> = {
  seed: "seed",
  discovered: "découverte",
  manual: "manuelle",
};

function FilterLink({
  current,
  name,
  value,
  label,
}: {
  current: Filters;
  name: keyof Filters;
  value: string | undefined;
  label: string;
}) {
  const next = { ...current, [name]: value };
  const qs = new URLSearchParams(
    Object.entries(next).filter((e): e is [string, string] => !!e[1]),
  ).toString();
  const active = current[name] === value;
  return (
    <Link
      href={qs ? `/companies?${qs}` : "/companies"}
      className={cn(
        "rounded-md border px-2 py-0.5 text-xs",
        active
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pick = (k: string, allowed?: readonly string[]) => {
    const v = typeof sp[k] === "string" ? (sp[k] as string) : undefined;
    return v && (!allowed || allowed.includes(v)) ? v : undefined;
  };
  const filters: Filters = {
    origin: pick("origin", ORIGINS),
    status: pick("status", STATUSES),
    ats: pick("ats"),
  };
  const { rows, summary, atsList } = await loadCompanies(filters);
  const total = summary.reduce((a, s) => a + s.n, 0);

  return (
    <>
      <PageHeader
        title="Entreprises"
        description={`${total} entreprises : ${summary
          .map((s) => `${s.n} ${ORIGIN_LABEL[s.origin] ?? s.origin} (${s.with_ats} avec ATS)`)
          .join(", ")}. Les entreprises découvertes sont sondées au balayage ATS suivant.`}
      />
      <AddCompanyForm />

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 text-xs">Origine</span>
        <FilterLink current={filters} name="origin" value={undefined} label="toutes" />
        {ORIGINS.map((o) => (
          <FilterLink key={o} current={filters} name="origin" value={o} label={ORIGIN_LABEL[o]!} />
        ))}
        <span className="text-muted-foreground mr-1 ml-3 text-xs">Statut</span>
        <FilterLink current={filters} name="status" value={undefined} label="tous" />
        {STATUSES.map((s) => (
          <FilterLink key={s} current={filters} name="status" value={s} label={s} />
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 text-xs">ATS</span>
        <FilterLink current={filters} name="ats" value={undefined} label="tous" />
        {atsList.map((a) => (
          <FilterLink
            key={a.ats}
            current={filters}
            name="ats"
            value={a.ats}
            label={`${a.ats} (${a.n})`}
          />
        ))}
        <FilterLink current={filters} name="ats" value="none" label="sans ATS" />
      </div>

      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
          Aucune entreprise pour ces filtres.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entreprise</TableHead>
                <TableHead>ATS</TableHead>
                <TableHead className="hidden md:table-cell">Clé</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Origine</TableHead>
                <TableHead className="hidden sm:table-cell">Priorité</TableHead>
                <TableHead className="text-right">Offres ouvertes</TableHead>
                <TableHead className="hidden lg:table-cell">Dernier run OK</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.ats ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell
                    className="text-muted-foreground hidden max-w-xs truncate font-mono text-xs md:table-cell"
                    title={r.ats_key ?? undefined}
                  >
                    {r.ats_key ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.ats_status]}>{r.ats_status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.origin === "discovered" ? "secondary" : "outline"}>
                      {ORIGIN_LABEL[r.origin] ?? r.origin}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{r.priority}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.open_jobs}</TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell">
                    {formatDateTime(r.last_ok_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {rows.length === LIMIT ? (
        <p className="text-muted-foreground mt-2 text-xs">
          {LIMIT} premières lignes affichées : utilise les filtres pour affiner.
        </p>
      ) : null}
    </>
  );
}
