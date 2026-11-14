"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { requestAlertTest } from "./actions";

/** Queues a test; while queued, refreshes the page every 10 s to show the worker's result. */
export function TestChannelsButton({
  disabled,
  pendingSince,
  ownerChannels = false,
}: {
  disabled: boolean;
  pendingSince?: string;
  /** The owner's channels come from the .env; other users set theirs above. */
  ownerChannels?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const t = useT();
  // The action revalidates /settings: the pending request comes back from the server.
  const queued = !!pendingSince;
  useEffect(() => {
    if (!queued) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
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
          ? ownerChannels
            ? t("settings.alerts.testNoChannelOwner")
            : t("settings.alerts.testNoChannel")
          : t("settings.alerts.testTitle")
      }
      onClick={() =>
        start(async () => {
          await requestAlertTest();
          router.refresh();
        })
      }
    >
      <Send className="size-3.5" />
      {queued ? t("settings.alerts.testQueued") : t("settings.alerts.test")}
    </Button>
  );
}
