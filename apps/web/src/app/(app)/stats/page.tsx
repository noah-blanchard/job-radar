import { queryRows, sql } from "@jobradar/db";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/placeholder";
import { getDb } from "@/lib/db";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Stats" };
export const dynamic = "force-dynamic";

const DAYS = 30;
const TOP_COUNTRIES = 12;

interface DayCount {
  key: string;
  day: string;
  n: number;
}

async function loadStats() {
  const db = getDb();
  // Days are calendar days in America/Toronto; first_seen_at is the "new job" truth.
  const days = await queryRows<{ day: string }>(
    db,
    sql`select to_char(d, 'YYYY-MM-DD') as day from generate_series(
          (now() at time zone 'America/Toronto')::date - ${DAYS - 1}::int,
          (now() at time zone 'America/Toronto')::date, interval '1 day') d`,
  );
  const recent = sql`first_seen_at >= ((now() at time zone 'America/Toronto')::date - ${DAYS - 1}::int)::timestamp at time zone 'America/Toronto'`;
  const bySource = await queryRows<DayCount>(
    db,
    sql`select source as key, to_char((first_seen_at at time zone 'America/Toronto')::date, 'YYYY-MM-DD') as day,
          count(*)::int as n
        from jobs where ${recent} group by 1, 2`,
  );
  const byCountry = await queryRows<DayCount>(
    db,
    sql`select coalesce(country, '??') as key, to_char((first_seen_at at time zone 'America/Toronto')::date, 'YYYY-MM-DD') as day,
          count(*)::int as n
        from jobs where ${recent} group by 1, 2`,
  );
  const [share] = await queryRows<{
    open_total: number;
    open_yes: number;
    open_no: number;
    recent_total: number;
    recent_yes: number;
    recent_no: number;
  }>(
    db,
    sql`select
        count(*) filter (where closed_at is null)::int as open_total,
        count(*) filter (where closed_at is null and is_new_grad)::int as open_yes,
        count(*) filter (where closed_at is null and is_new_grad = false)::int as open_no,
        count(*) filter (where ${recent})::int as recent_total,
        count(*) filter (where ${recent} and is_new_grad)::int as recent_yes,
        count(*) filter (where ${recent} and is_new_grad = false)::int as recent_no
      from jobs`,
  );
  const companies = await queryRows<{
    company_name: string;
    open: number;
    new_grad: number;
    good: number;
    best: number | null;
  }>(
    db,
    sql`select company_name, count(*)::int as open,
          count(*) filter (where is_new_grad)::int as new_grad,
          count(*) filter (where score >= 50)::int as good,
          max(score)::int as best
        from jobs where closed_at is null
        group by company_name
        order by good desc, new_grad desc, open desc
        limit 20`,
  );
  return { days: days.map((d) => d.day), bySource, byCountry, share: share!, companies };
}

/** key -> per-day series aligned on `days`, sorted by 30-day total. */
function series(rows: DayCount[], days: string[]) {
  const idx = new Map(days.map((d, i) => [d, i]));
  const map = new Map<string, number[]>();
  for (const r of rows) {
    const s = map.get(r.key) ?? Array<number>(days.length).fill(0);
    const i = idx.get(r.day);
    if (i !== undefined) s[i]! += r.n;
    map.set(r.key, s);
  }
  return [...map.entries()]
    .map(([key, values]) => ({ key, values, total: values.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total);
}

const dayLabel = (d: string) =>
  new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${d}T00:00:00Z`),
  );

/** Thin single-hue bars; each bar has a hover tooltip (title) with the exact value. */
function Bars({
  values,
  days,
  height,
  label,
  max,
}: {
  values: number[];
  days: string[];
  height: number;
  label: string;
  max?: number;
}) {
  const top = Math.max(1, max ?? Math.max(...values));
  return (
    <div
      className="flex items-end gap-[2px]"
      style={{ height }}
      role="img"
      aria-label={`${label} : ${values.reduce((a, b) => a + b, 0)} nouvelles offres sur ${days.length} jours`}
    >
      {values.map((v, i) => (
        <div
          key={days[i]}
          title={`${dayLabel(days[i]!)} : ${v.toLocaleString("fr-CA")}`}
          className="group relative flex h-full flex-1 items-end"
        >
          <div
            className="bg-chart-1 group-hover:bg-chart-1-hover w-full rounded-t-[2px]"
            style={{ height: v === 0 ? 0 : `${Math.max(4, (v / top) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function SeriesTable({
  title,
  rows,
  days,
  hrefFor,
}: {
  title: string;
  rows: { key: string; values: number[]; total: number }[];
  days: string[];
  hrefFor: (key: string) => string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  return (
    <section className="rounded-lg border p-3">
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th className="pb-1 text-left font-normal">Clé</th>
            <th className="pb-1 text-right font-normal">30 j</th>
            <th className="w-1/2 pb-1 pl-3 text-left font-normal">par jour (même échelle)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t">
              <td className="py-1 pr-2">
                <Link href={hrefFor(r.key)} className="hover:underline">
                  {r.key}
                </Link>
              </td>
              <td className="py-1 text-right tabular-nums">{r.total.toLocaleString("fr-CA")}</td>
              <td className="py-1 pl-3">
                <Bars values={r.values} days={days} height={22} label={r.key} max={max} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-muted-foreground text-xs">{sub}</div> : null}
    </div>
  );
}

const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((n / d) * 100)} %`);

export default async function StatsPage() {
  const { days, bySource, byCountry, share, companies } = await loadStats();
  const sources = series(bySource, days);
  const countriesAll = series(byCountry, days);
  const countries = countriesAll.slice(0, TOP_COUNTRIES);
  const rest = countriesAll.slice(TOP_COUNTRIES);
  if (rest.length)
    countries.push({
      key: `autres (${rest.length})`,
      values: days.map((_, i) => rest.reduce((a, r) => a + r.values[i]!, 0)),
      total: rest.reduce((a, r) => a + r.total, 0),
    });
  const total = days.map((_, i) => sources.reduce((a, s) => a + s.values[i]!, 0));
  const sum30 = total.reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Stats"
        description={`Nouvelles offres (première vue) sur ${DAYS} jours, jours calendaires de Toronto. Survole une barre pour sa valeur.`}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label={`Nouvelles offres (${DAYS} j)`} value={sum30.toLocaleString("fr-CA")} />
        <Tile
          label="Aujourd'hui"
          value={(total[total.length - 1] ?? 0).toLocaleString("fr-CA")}
          sub={`hier : ${(total[total.length - 2] ?? 0).toLocaleString("fr-CA")}`}
        />
        <Tile
          label={`Part new grad (nouvelles, ${DAYS} j)`}
          value={pct(share.recent_yes, share.recent_total)}
          sub={`${share.recent_yes} oui · ${share.recent_total - share.recent_yes - share.recent_no} inconnu · ${share.recent_no} non`}
        />
        <Tile
          label="Part new grad (offres ouvertes)"
          value={pct(share.open_yes, share.open_total)}
          sub={`${share.open_yes.toLocaleString("fr-CA")} / ${share.open_total.toLocaleString("fr-CA")} · inconnu ${pct(share.open_total - share.open_yes - share.open_no, share.open_total)}`}
        />
      </div>

      <section className="mb-4 rounded-lg border p-3">
        <h2 className="mb-2 text-sm font-medium">Nouvelles offres par jour</h2>
        <Bars values={total} days={days} height={120} label="Toutes sources" />
        <div className="text-muted-foreground mt-1 flex justify-between text-xs">
          <span>{dayLabel(days[0]!)}</span>
          <span>max {Math.max(...total).toLocaleString("fr-CA")} / jour</span>
          <span>{dayLabel(days[days.length - 1]!)}</span>
        </div>
        <details className="mt-2 text-xs">
          <summary className="text-muted-foreground cursor-pointer">Voir les données</summary>
          <table className="mt-1 w-full max-w-xs">
            <tbody>
              {days.map((d, i) => (
                <tr key={d} className="border-t">
                  <td className="py-0.5">{dayLabel(d)}</td>
                  <td className="py-0.5 text-right tabular-nums">{total[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <SeriesTable
          title="Par source (source de première vue)"
          rows={sources}
          days={days}
          hrefFor={(k) => `/?source=${encodeURIComponent(k)}&since=7d`}
        />
        <SeriesTable
          title="Par pays"
          rows={countries}
          days={days}
          hrefFor={(k) => (/^[A-Z]{2}$/.test(k) ? `/?country=${k}&since=7d` : "/?since=7d")}
        />
      </div>

      <section className="rounded-lg border p-3">
        <h2 className="mb-2 text-sm font-medium">Top entreprises (offres ouvertes)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th className="pb-1 text-left font-normal">Entreprise</th>
                <th className="pb-1 text-right font-normal">Score ≥ 50</th>
                <th className="pb-1 text-right font-normal">New grad</th>
                <th className="pb-1 text-right font-normal">Ouvertes</th>
                <th className="pb-1 text-right font-normal">Meilleur score</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.company_name} className="border-t">
                  <td className="py-1 pr-2">
                    <Link
                      href={`/?company=${encodeURIComponent(c.company_name)}`}
                      className="hover:underline"
                    >
                      {c.company_name}
                    </Link>
                  </td>
                  <td className={cn("py-1 text-right tabular-nums", c.good > 0 && "font-medium")}>
                    {c.good}
                  </td>
                  <td className="py-1 text-right tabular-nums">{c.new_grad}</td>
                  <td className="text-muted-foreground py-1 text-right tabular-nums">{c.open}</td>
                  <td className="py-1 text-right tabular-nums">{c.best ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
