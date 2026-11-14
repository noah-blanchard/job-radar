"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";
import { saveAlertSettings, type FormState } from "./actions";

export interface AlertValues {
  digestEnabled: boolean;
  digestMinScore: number | null;
  instantEnabled: boolean;
  instantMinScore: number | null;
  alertEmail: string | null;
  ntfyTopic: string | null;
}

function Toggle({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <input type="checkbox" name={name} defaultChecked={checked} className="accent-primary" />
      {label}
    </label>
  );
}

function Score({
  name,
  value,
  fallback,
  label,
}: {
  name: string;
  value: number | null;
  fallback: number;
  label: string;
}) {
  return (
    <label className="text-muted-foreground flex items-center gap-2 text-xs">
      {label}
      <Input
        name={name}
        type="number"
        min={0}
        max={100}
        defaultValue={value ?? ""}
        placeholder={String(fallback)}
        className="h-7 w-16 tabular-nums"
      />
    </label>
  );
}

/**
 * The signed-in user's alerts: digest and instant alerts with their thresholds (empty = the
 * server default) and, for everyone but the owner (whose channels are the .env ones), their own
 * e-mail address and ntfy topic.
 */
export function AlertSettingsForm({
  values,
  defaults,
  ownChannels,
  smtp,
  suggestedTopic,
  ntfyUrl,
}: {
  values: AlertValues;
  defaults: { digest: number; instant: number; digestTime: string };
  ownChannels: boolean;
  smtp: boolean;
  suggestedTopic: string;
  ntfyUrl: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAlertSettings, {});
  const t = useT();
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-1.5">
        <Toggle
          name="digestEnabled"
          label={t("settings.alerts.digest", { time: defaults.digestTime })}
          checked={values.digestEnabled}
        />
        <div className="pl-6">
          <Score
            name="digestMinScore"
            label={t("settings.alerts.fromScore")}
            value={values.digestMinScore}
            fallback={defaults.digest}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Toggle
          name="instantEnabled"
          label={t("settings.alerts.instant")}
          checked={values.instantEnabled}
        />
        <div className="pl-6">
          <Score
            name="instantMinScore"
            label={t("settings.alerts.fromScore")}
            value={values.instantMinScore}
            fallback={defaults.instant}
          />
        </div>
      </div>
      {ownChannels ? (
        <div className="grid max-w-md gap-2 pt-1">
          <label className="text-muted-foreground grid gap-1 text-xs">
            {t("settings.alerts.email")}
            <Input
              name="alertEmail"
              type="email"
              defaultValue={values.alertEmail ?? ""}
              placeholder={
                smtp ? t("settings.accounts.emailPlaceholder") : t("settings.alerts.noSmtp")
              }
              disabled={!smtp}
              className="h-8"
            />
          </label>
          <label className="text-muted-foreground grid gap-1 text-xs">
            {t("settings.alerts.ntfy")}
            <Input
              name="ntfyTopic"
              defaultValue={values.ntfyTopic ?? ""}
              placeholder={suggestedTopic}
              pattern="[A-Za-z0-9_\-]{8,64}"
              title={t("settings.alerts.topicRule")}
              className="h-8 font-mono text-xs"
            />
          </label>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t("settings.alerts.ntfyHelp", { url: ntfyUrl })}
          </p>
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "…" : t("settings.alerts.save")}
        </Button>
        {state.error ? (
          <p role="alert" className="text-destructive text-[13px]">
            {state.error}
          </p>
        ) : state.ok ? (
          <p className="text-success text-[13px]">{state.ok}</p>
        ) : null}
      </div>
    </form>
  );
}
