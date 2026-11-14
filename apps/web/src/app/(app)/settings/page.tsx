import type { Metadata } from "next";
import { ComingSoon } from "@/components/placeholder";

export const metadata: Metadata = { title: "Réglages" };

export default function SettingsPage() {
  return (
    <ComingSoon title="Réglages" milestone="M3">
      Profil effectif (profile.yaml), seuils d'alerte, test des canaux.
    </ComingSoon>
  );
}
