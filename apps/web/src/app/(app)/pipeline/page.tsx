import type { Metadata } from "next";
import { ComingSoon } from "@/components/placeholder";

export const metadata: Metadata = { title: "Pipeline" };

export default function PipelinePage() {
  return (
    <ComingSoon title="Pipeline" milestone="M4">
      Kanban par statut (saved, applied, interview, rejected).
    </ComingSoon>
  );
}
