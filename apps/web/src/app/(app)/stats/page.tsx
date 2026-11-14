import { queryRows, sql } from "@jobradar/db";
import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame, PageHeader, PageScroll } from "@/components/placeholder";
import type { Format } from "@/i18n/format";
import type { T } from "@/i18n/messages";
import { getFormat, getT } from "@/i18n/server";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("nav.stats") };
}
export const dynamic = "force-dynamic";

const DAYS = 30;
const TOP_COUNTRIES = 12;

interface DayCount {
  key: string;
  day: string;
  n: number;
}

async function loadStats(userId: number) {
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
          count(*) filter (where sc.score >= 50)::int as good,
          max(sc.score)::int as best
        from jobs j
        left join job_scores sc on sc.job_id = j.id and sc.user_id = ${userId}
        where j.closed_at is null
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

interface I18n {
  t: T;
  format: Format;
}

/**
 * Thin single-hue bars on a shared baseline: 2px gaps, 2px rounded tops, a hover readout per bar
 * (hit area = the full column, larger than the mark). One series: the section title names it.
 */
function Bars({
  values,
  days,
  height,
  label,
  max,
  i18n,
}: {
  values: number[];
  days: string[];
  height: number;
  label: string;
  max?: number;
  i18n: I18n;
}) {
  const { t, format } = i18n;
  const top = Math.max(1, max ?? Math.max(...values));
  return (
    <div
      className="flex items-end gap-[2px]"
      style={{ height }}
      role="img"
      aria-label={t("stats.barsLabel", {
        label,
        total: values.reduce((a, b) => a + b, 0),
        days: days.length,
      })}
    >
      {values.map((v, i) => (
        <div key={days[i]} className="group relative flex h-full flex-1 items-end">
          <div
            className="bg-chart-1 group-hover:bg-chart-1-hover w-full rounded-t-[2px] transition-colors duration-[var(--dur-fast)]"
            style={{ height: v === 0 ? 0 : `${Math.max(3, (v / top) * 100)}%` }}
          />
          <span className="bg-surface text-foreground pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-sm border px-1.5 py-0.5 text-[11px] whitespace-nowrap tabular-nums border-input group-hover:block">
            {format.day(days[i]!)} · {format.number(v)}
          </span>
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
  i18n,
}: {
  title: string;
  rows: { key: string; values: number[]; total: number }[];
  days: string[];
  hrefFor: (key: string) => string;
  i18n: I18n;
}) {
  const { t, format } = i18n;
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  return (
    <section>
      <h2 className="label-caps mb-2">{title}</h2>
      <table className="w-full text-[13px]">
        <thead className="sr-only">
          <tr>
            <th>{t("stats.key")}</th>
            <th>{t("stats.days30")}</th>
            <th>{t("stats.perDay")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-border-soft border-b last:border-0">
              <td className="max-w-40 truncate py-1.5 pr-3">
                <Link href={hrefFor(r.key)} className="hover:text-info hover:underline">
                  {r.key}
                </Link>
              </td>
              <td className="py-1.5 pr-4 text-right tabular-nums">{format.number(r.total)}</td>
              <td className="w-1/2 py-1.5">
                <Bars
                  values={r.values}
                  days={days}
                  height={20}
                  label={r.key}
                  max={max}
                  i18n={i18n}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted-foreground mt-1 text-[11px]">{t("stats.sameScale")}</p>
    </section>
  );
}

const pct = (n: number, d: number, format: Format) => (d === 0 ? "—" : format.percent(n / d));

function Fact({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="sr-only">{label}</dt>
      <dd className="text-[20px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
        {n}
      </dd>
      <dd className="text-muted-foreground">{label}</dd>
    </div>
  );
}

export default async function StatsPage() {
  const user = await currentUser();
  const { days, bySource, byCountry, share, companies } = await loadStats(user.id);
  const [t, format] = await Promise.all([getT(), getFormat()]);
  const i18n = { t, format };
  const sources = series(bySource, days);
  const countriesAll = series(byCountry, days);
  const countries = countriesAll.slice(0, TOP_COUNTRIES);
  const rest = countriesAll.slice(TOP_COUNTRIES);
  if (rest.length)
    countries.push({
      key: t("stats.others", { count: rest.length }),
      values: days.map((_, i) => rest.reduce((a, r) => a + r.values[i]!, 0)),
      total: rest.reduce((a, r) => a + r.total, 0),
    });
  const total = days.map((_, i) => sources.reduce((a, s) => a + s.values[i]!, 0));
  const sum30 = total.reduce((a, b) => a + b, 0);
  const today = total[total.length - 1] ?? 0;
  const yesterday = total[total.length - 2] ?? 0;
  const peak = Math.max(...total);
  const unknownRecent = share.recent_total - share.recent_yes - share.recent_no;

  return (
    <PageFrame>
      <PageHeader title={t("nav.stats")} description={t("stats.description")} />
      <PageScroll className="flex flex-col gap-9 px-4 py-5 md:px-6">
        <section>
          <dl className="mb-5 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
            <Fact n={format.number(sum30)} label={t("stats.new30")} />
            <Fact n={format.number(today)} label={t("stats.todayYesterday", { n: yesterday })} />
            <Fact
              n={pct(share.recent_yes, share.recent_total, format)}
              label={t("stats.ngRecent", { n: unknownRecent })}
            />
            <Fact
              n={pct(share.open_yes, share.open_total, format)}
              label={t("stats.ngOpen", { n: share.open_total })}
            />
          </dl>
          <div className="relative pt-3">
            <div
              className="border-border-soft pointer-events-none absolute inset-x-0 top-3 border-t border-dashed"
              aria-hidden
            />
            <span className="text-muted-foreground bg-background absolute top-0 right-0 pl-1.5 text-[11px] tabular-nums">
              {t("stats.peak", { n: peak })}
            </span>
            <Bars
              values={total}
              days={days}
              height={140}
              label={t("stats.allSources")}
              i18n={i18n}
            />
          </div>
          <div className="text-muted-foreground mt-1.5 flex justify-between border-t pt-1 text-[11px]">
            <span>{format.day(days[0]!)}</span>
            <span>{format.day(days[days.length - 1]!)}</span>
          </div>
          <details className="mt-2 text-xs">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
              {t("stats.seeData")}
            </summary>
            <table className="mt-1 w-full max-w-xs">
              <tbody>
                {days.map((d, i) => (
                  <tr key={d} className="border-border-soft border-b">
                    <td className="py-0.5">{format.day(d)}</td>
                    <td className="py-0.5 text-right tabular-nums">{total[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>

        <div className="grid gap-9 lg:grid-cols-2">
          <SeriesTable
            title={t("stats.bySource")}
            rows={sources}
            days={days}
            i18n={i18n}
            hrefFor={(k) => `/?source=${encodeURIComponent(k)}&since=7d&status=active`}
          />
          <SeriesTable
            title={t("stats.byCountry")}
            rows={countries}
            days={days}
            i18n={i18n}
            hrefFor={(k) =>
              /^[A-Z]{2}$/.test(k)
                ? `/?country=${k}&since=7d&status=active`
                : "/?since=7d&status=active"
            }
          />
        </div>

        <section>
          <h2 className="label-caps mb-2">{t("stats.topCompanies")}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="label-caps border-b">
                  <th className="h-8 text-left font-medium">{t("stats.colCompany")}</th>
                  <th className="h-8 text-right font-medium">{t("stats.colGood")}</th>
                  <th className="h-8 text-right font-medium">{t("stats.colNewGrad")}</th>
                  <th className="h-8 text-right font-medium">{t("stats.colOpen")}</th>
                  <th className="h-8 text-right font-medium">{t("stats.colBest")}</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr
                    key={c.company_name}
                    className="border-border-soft hover:bg-raised/50 border-b"
                  >
                    <td className="py-1.5 pr-2">
                      <Link
                        href={`/?company=${encodeURIComponent(c.company_name)}&status=active`}
                        className="hover:text-info hover:underline"
                      >
                        {c.company_name}
                      </Link>
                    </td>
                    <td
                      className={cn(
                        "py-1.5 text-right tabular-nums",
                        c.good > 0 ? "font-medium" : "text-muted-foreground",
                      )}
                    >
                      {c.good}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{c.new_grad}</td>
                    <td className="text-muted-foreground py-1.5 text-right tabular-nums">
                      {c.open}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{c.best ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </PageScroll>
    </PageFrame>
  );
}
