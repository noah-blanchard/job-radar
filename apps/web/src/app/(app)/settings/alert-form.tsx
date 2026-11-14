"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-1.5">
        <Toggle
          name="digestEnabled"
          label={`Digest quotidien (${defaults.digestTime}, heure de Toronto)`}
          checked={values.digestEnabled}
        />
        <div className="pl-6">
          <Score
            name="digestMinScore"
            label="à partir du score"
            value={values.digestMinScore}
            fallback={defaults.digest}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Toggle
          name="instantEnabled"
          label="Alerte instantanée pour une nouvelle offre à fort score"
          checked={values.instantEnabled}
        />
        <div className="pl-6">
          <Score
            name="instantMinScore"
            label="à partir du score"
            value={values.instantMinScore}
            fallback={defaults.instant}
          />
        </div>
      </div>
      {ownChannels ? (
        <div className="grid max-w-md gap-2 pt-1">
          <label className="text-muted-foreground grid gap-1 text-xs">
            E-mail
            <Input
              name="alertEmail"
              type="email"
              defaultValue={values.alertEmail ?? ""}
              placeholder={smtp ? "prenom@exemple.com" : "indisponible : pas de serveur SMTP"}
              disabled={!smtp}
              className="h-8"
            />
          </label>
          <label className="text-muted-foreground grid gap-1 text-xs">
            Topic ntfy (notifications sur le téléphone)
            <Input
              name="ntfyTopic"
              defaultValue={values.ntfyTopic ?? ""}
              placeholder={suggestedTopic}
              pattern="[A-Za-z0-9_\-]{8,64}"
              title="8 à 64 lettres, chiffres, - ou _"
              className="h-8 font-mono text-xs"
            />
          </label>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Installe l&apos;app ntfy, abonne-toi au topic sur {ntfyUrl}. Quiconque connaît le topic
            peut lire les alertes : garde un nom long et aléatoire, comme celui proposé.
          </p>
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "…" : "Enregistrer les alertes"}
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
