import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { currentUser } from "@/lib/auth";
import { loadJobDetail, parseJobId } from "@/lib/job-detail";
import { JobPage } from "./job-page";

export const dynamic = "force-dynamic";

const load = cache(async (raw: string) => {
  const id = parseJobId(raw);
  const user = await currentUser();
  return id ? loadJobDetail(user.id, id) : null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const job = await load((await params).id);
  return { title: job ? job.title : "Offre" };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const job = await load((await params).id);
  if (!job) notFound();
  return <JobPage key={job.id} job={job} />;
}
