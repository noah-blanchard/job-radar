import { queryRows, sql } from "@jobradar/db";
import type { Metadata } from "next";
import { PageHeader } from "@/components/placeholder";
import { getDb } from "@/lib/db";
import { PIPELINE_STATUSES } from "@/lib/filters";
import { Kanban, type PipelineCard } from "./kanban";

export const metadata: Metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const rows = await queryRows<Omit<PipelineCard, "updated_at"> & { updated_at: Date }>(
    getDb(),
    sql`
    select j.id, j.title, j.company_name, j.city, j.country, j.remote, j.score, j.url,
      j.apply_url, j.closed_at is not null as closed, s.status, s.notes, s.updated_at
    from job_status s join jobs j on j.id = s.job_id
    where s.status in (${sql.join(
      PIPELINE_STATUSES.map((s) => sql`${s}::job_status_kind`),
      sql`, `,
    )})
    order by s.updated_at desc`,
  );
  const cards = rows.map((r) => ({
    ...r,
    id: Number(r.id),
    updated_at: new Date(r.updated_at).toISOString(),
  }));
  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Candidatures par statut. Glisse une carte vers une autre colonne (ou utilise son menu) pour changer son statut."
      />
      <Kanban cards={cards} />
    </>
  );
}
