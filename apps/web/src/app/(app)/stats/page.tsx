import type { Metadata } from "next";
import { ComingSoon } from "@/components/placeholder";

export const metadata: Metadata = { title: "Stats" };

export default function StatsPage() {
  return (
    <ComingSoon title="Stats" milestone="M4">
      Nouvelles offres par jour, par source et par pays (30 j), part new grad, top entreprises.
    </ComingSoon>
  );
}
