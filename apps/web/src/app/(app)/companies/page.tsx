import type { Metadata } from "next";
import { ComingSoon } from "@/components/placeholder";

export const metadata: Metadata = { title: "Entreprises" };

export default function CompaniesPage() {
  return (
    <ComingSoon title="Entreprises" milestone="M2">
      Liste des entreprises, ATS détecté, statut, priorité éditable, ajout via URL carrières.
    </ComingSoon>
  );
}
