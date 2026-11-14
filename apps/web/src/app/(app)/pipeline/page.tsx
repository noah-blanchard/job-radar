import { queryRows, sql } from "@jobradar/db";
import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { PIPELINE_STATUSES } from "@/lib/filters";
import { Kanban, type PipelineCard } from "./kanban";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("nav.pipeline") };
}
export const dynamic = "force-dynamic";

type Row = Omit<PipelineCard, "updated_at" | "next_action_at" | "ledger"> & {
  updated_at: Date | string;
  next_action_at: Date | string | null;
  ledger: [string, number][] | null;
};

export default async function PipelinePage() {
  const user = await currentUser();
  const t = await getT();
  const rows = await queryRows<Row>(
    getDb(),
    sql`
    select j.id, j.title, j.company_name, j.city, j.country, j.remote, sc.score, j.url,
      j.apply_url, j.closed_at is not null as closed, s.status, s.notes, s.updated_at,
      s.next_action_at,
      (select jsonb_agg(jsonb_build_array(p->>'key', (p->>'points')::int))
        from jsonb_array_elements(sc.score_breakdown->'parts') p) as ledger
    from job_status s join jobs j on j.id = s.job_id
    left join job_scores sc on sc.job_id = j.id and sc.user_id = s.user_id
    where s.user_id = ${user.id} and s.status in (${sql.join(
      PIPELINE_STATUSES.map((s) => sql`${s}::job_status_kind`),
      sql`, `,
    )})
    order by s.next_action_at asc nulls last, s.updated_at desc`,
  );
  const cards = rows.map((r) => ({
    ...r,
    id: Number(r.id),
    ledger: r.ledger ?? [],
    updated_at: new Date(r.updated_at).toISOString(),
    next_action_at: r.next_action_at ? new Date(r.next_action_at).toISOString() : null,
  }));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-baseline gap-x-6 gap-y-1 border-b px-4 pt-4 pb-3 md:px-6">
        <h1 className="text-[15px] font-semibold">{t("nav.pipeline")}</h1>
        <p className="text-muted-foreground text-[13px]">
          {t("pipeline.intro1")} <kbd className="text-foreground">1</kbd>–
          <kbd className="text-foreground">4</kbd> {t("pipeline.intro2")}
        </p>
      </header>
      <Kanban cards={cards} />
    </div>
  );
}
