"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { requestAlertTest } from "./actions";

/** Queues a test; while queued, refreshes the page every 10 s to show the worker's result. */
export function TestChannelsButton({
  disabled,
  pendingSince,
}: {
  disabled: boolean;
  pendingSince?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // The action revalidates /settings: the pending request comes back from the server.
  const queued = !!pendingSince;
  useEffect(() => {
    if (!queued) return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [queued, router]);

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={disabled || pending || queued}
      className="mt-3"
      title={
        disabled
          ? "Aucun canal configuré (variables NTFY_*, SMTP_*, DISCORD_*, TELEGRAM_* du .env)"
          : "Envoie un aperçu du digest [TEST] sur chaque canal configuré (via le worker, dans la minute)"
      }
      onClick={() =>
        start(async () => {
          await requestAlertTest();
          router.refresh();
        })
      }
    >
      <Send className="size-3.5" />
      {queued ? "Test demandé (le worker l'envoie dans la minute)…" : "Tester les canaux"}
    </Button>
  );
}
