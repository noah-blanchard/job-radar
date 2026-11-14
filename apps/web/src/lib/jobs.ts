import "server-only";
import { queryRows, sql, type SQL } from "@jobradar/db";
import { getDb } from "./db";
import { PAGE_SIZE, SINCE, type InboxFilters, type JobStatus } from "./filters";

export interface InboxRow extends Record<string, unknown> {
  id: number;
  title: string;
  company_name: string;
  city: string | null;
  region: string | null;
  country: string | null;
  remote: "onsite" | "hybrid" | "remote" | "unknown";
  score: number | null;
  is_new_grad: boolean | null;
  first_seen_at: string;
  url: string;
  apply_url: string | null;
  source: string;
  domains: string[];
  closed_at: string | null;
  status: JobStatus;
  /** Score parts as [key, points], in breakdown order (the row's score ledger). */
  ledger: [string, number][];
}

/** WHERE clause of the Inbox, built only from bound parameters. */
function where(f: InboxFilters): SQL {
  const c: SQL[] = [];
  if (!f.closed) c.push(sql`j.closed_at is null`);
  if (f.q) c.push(sql`j.tsv @@ websearch_to_tsquery('simple', ${f.q})`);
  if (f.country) c.push(sql`j.country = ${f.country}`);
  if (f.city) c.push(sql`j.city ilike ${`%${f.city}%`}`);
  if (f.remote) c.push(sql`j.remote = ${f.remote}::remote_kind`);
  if (f.newGrad === "yes") c.push(sql`j.is_new_grad`);
  else if (f.newGrad === "no") c.push(sql`j.is_new_grad = false`);
  else if (f.newGrad === "unknown") c.push(sql`j.is_new_grad is null`);
  if (f.domain) c.push(sql`j.domains @> array[${f.domain}]::text[]`);
  if (f.source)
    c.push(
      sql`exists (select 1 from job_sources js where js.job_id = j.id and js.source = ${f.source})`,
    );
  if (f.company) c.push(sql`j.company_name ilike ${`%${f.company}%`}`);
  if (f.minScore > 0) c.push(sql`j.score >= ${f.minScore}`);
  if (SINCE[f.since] > 0)
    c.push(sql`j.first_seen_at >= now() - make_interval(hours => ${SINCE[f.since]})`);
  if (f.status === "active") c.push(sql`(s.status is null or s.status <> 'ignored')`);
  else if (f.status === "todo") c.push(sql`(s.status is null or s.status = 'new')`);
  else if (f.status === "new") c.push(sql`(s.status is null or s.status = 'new')`);
  else if (f.status !== "all") c.push(sql`s.status = ${f.status}::job_status_kind`);
  return c.length ? sql.join(c, sql` and `) : sql`true`;
}

function orderBy(f: InboxFilters): SQL {
  return f.sort === "recent"
    ? sql`j.first_seen_at desc, j.id desc`
    : sql`j.score desc nulls last, j.first_seen_at desc, j.id desc`;
}

/** One slice of the Inbox (infinite scroll): `offset` rows in, at most PAGE_SIZE rows. */
export async function loadInboxRows(f: InboxFilters, offset: number): Promise<InboxRow[]> {
  const rows = await queryRows<InboxRow>(
    getDb(),
    sql`
    select j.id, j.title, j.company_name, j.city, j.region, j.country, j.remote, j.score,
      j.is_new_grad, j.first_seen_at, j.url, j.apply_url, j.source, j.domains, j.closed_at,
      coalesce(s.status, 'new') as status,
      coalesce((select jsonb_agg(jsonb_build_array(p->>'key', (p->>'points')::int))
        from jsonb_array_elements(j.score_breakdown->'parts') p), '[]'::jsonb) as ledger
    from jobs j left join job_status s on s.job_id = j.id
    where ${where(f)}
    order by ${orderBy(f)}
    limit ${PAGE_SIZE} offset ${Math.max(0, Math.floor(offset))}`,
  );
  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    first_seen_at: new Date(r.first_seen_at).toISOString(),
    closed_at: r.closed_at ? new Date(r.closed_at).toISOString() : null,
  }));
}

/** First slice and the total count (the page's server render). */
export async function loadInbox(f: InboxFilters): Promise<{ rows: InboxRow[]; total: number }> {
  const [rows, count] = await Promise.all([
    loadInboxRows(f, 0),
    queryRows<{ n: number }>(
      getDb(),
      sql`select count(*)::int as n from jobs j left join job_status s on s.job_id = j.id where ${where(f)}`,
    ),
  ]);
  return { rows, total: count[0]?.n ?? 0 };
}

export interface FilterOptions {
  countries: { value: string; n: number }[];
  sources: { value: string; n: number }[];
}

/** Values for the Inbox selects (open jobs only). */
export async function loadFilterOptions(): Promise<FilterOptions> {
  const db = getDb();
  const [countries, sources] = await Promise.all([
    queryRows<{ value: string; n: number }>(
      db,
      sql`select country as value, count(*)::int as n from jobs
          where closed_at is null and country is not null group by 1 order by 2 desc`,
    ),
    queryRows<{ value: string; n: number }>(
      db,
      sql`select source as value, count(*)::int as n from job_sources group by 1 order by 2 desc`,
    ),
  ]);
  return { countries, sources };
}
