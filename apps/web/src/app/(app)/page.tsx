import type { Metadata } from "next";
import { ComingSoon } from "@/components/placeholder";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <ComingSoon title="Inbox" milestone="M4">
      Le tableau des offres (filtres, tri, raccourcis j/k/s/a/x/o) arrive au jalon M4, après les connecteurs (M1-M2) et le scoring (M3).
    </ComingSoon>
  );
}
