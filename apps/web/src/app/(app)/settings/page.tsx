import {
  ALERT_TEST_REQUEST_KEY,
  ALERT_TEST_RESULT_KEY,
  type AlertTestResult,
} from "@jobradar/core/alerts/keys";
import { PROFILE_KV_KEY, type AppliedProfile } from "@jobradar/core/score";
import { kvGet } from "@jobradar/db";
import type { Metadata } from "next";
import { PageHeader } from "@/components/placeholder";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db";
import { readProfile } from "@/lib/profile";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { TestChannelsButton } from "./test-button";

export const metadata: Metadata = { title: "Réglages" };
export const dynamic = "force-dynamic";

/** Unset, empty, or only a comment (compose reads `KEY=   # comment` as "# comment"). */
const blank = (v: string | undefined) => !v || v.trim() === "" || /^#(\s|$)/.test(v.trim());
const env = (k: string, def = "—") => {
  const v = process.env[k];
  return blank(v) ? def : (v as string);
};
const isSet = (...keys: string[]) => keys.every((k) => !blank(process.env[k]));

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-border-soft flex items-baseline justify-between gap-4 border-b py-2 text-[13px] last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-2 border-b py-6 last:border-0 md:grid-cols-[12rem_minmax(0,1fr)]">
      <h2 className="text-[13px] font-semibold">{title}</h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const file = readProfile();
  const db = getDb();
  const [applied, testRequest, testResult] = await Promise.all([
    kvGet<AppliedProfile>(db, PROFILE_KV_KEY),
    kvGet<{ requestedAt?: string }>(db, ALERT_TEST_REQUEST_KEY),
    kvGet<AlertTestResult>(db, ALERT_TEST_RESULT_KEY),
  ]);
  const inSync = "hash" in file && applied?.hash === file.hash;

  const channels = [
    { id: "ntfy", name: "ntfy", ok: isSet("NTFY_TOPIC") },
    { id: "email", name: "E-mail (SMTP)", ok: isSet("SMTP_HOST", "ALERT_EMAIL_TO") },
    { id: "discord", name: "Discord", ok: isSet("DISCORD_WEBHOOK_URL") },
    { id: "telegram", name: "Telegram", ok: isSet("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID") },
  ];

  return (
    <div>
      <PageHeader
        title="Réglages"
        description="Lecture seule : modifie config/profile.yaml et .env, puis redéploie."
      />
      <div className="max-w-4xl px-4 md:px-6">
        <Section title="Profil de matching">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <code className="text-xs">config/profile.yaml</code>
            {"hash" in file ? (
              <code className="text-muted-foreground text-xs">{file.hash}</code>
            ) : null}
            {"hash" in file ? (
              inSync ? (
                <Badge variant="success">scores à jour</Badge>
              ) : (
                <Badge variant="warning">recalcul en attente</Badge>
              )
            ) : (
              <Badge variant="destructive">illisible</Badge>
            )}
          </div>
          {"error" in file && file.error ? (
            <p className="text-destructive mt-2 text-[13px]">{file.error}</p>
          ) : null}
          <p className="text-muted-foreground mt-2 text-xs">
            {applied
              ? `Scores calculés avec le profil ${applied.hash} le ${formatDateTime(new Date(applied.appliedAt))} (${applied.jobs.toLocaleString("fr-CA")} offres en ${formatDuration(applied.ms)}).`
              : "Aucun recalcul complet enregistré pour l'instant."}{" "}
            {"hash" in file && !inSync
              ? "Le worker recalcule tout au prochain balayage (ou : cli rescore)."
              : ""}
          </p>
          <details className="mt-3">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
              Voir le profil effectif
            </summary>
            <pre className="mt-2 max-h-[32rem] overflow-auto rounded-md border bg-[#0c1117] p-3 text-xs leading-relaxed">
              {"text" in file ? file.text : (applied?.text ?? "")}
            </pre>
          </details>
        </Section>

        <Section title="Alertes">
          <Row label="Digest quotidien">{env("DIGEST_CRON", "0 8 * * *")} (Toronto)</Row>
          <Row label="Score minimum du digest">{env("DIGEST_MIN_SCORE", "40")}</Row>
          <Row label="Alertes instantanées">
            {env("INSTANT_ALERTS_ENABLED", "true") === "true" ? "activées" : "désactivées"}
          </Row>
          <Row label="Score minimum instantané">{env("INSTANT_MIN_SCORE", "75")}</Row>
          <Row label="Worker silencieux après">{env("HEALTH_SILENCE_HOURS", "12")} h</Row>
        </Section>

        <Section title="Canaux">
          {channels.map((c) => (
            <Row key={c.name} label={c.name}>
              {c.ok ? (
                <span className="text-success">configuré</span>
              ) : (
                <span className="text-muted-foreground">non configuré</span>
              )}
            </Row>
          ))}
          <TestChannelsButton
            disabled={!channels.some((c) => c.ok)}
            pendingSince={testRequest?.requestedAt}
          />
          {testResult ? (
            <div className="mt-3 text-xs">
              <p className="text-muted-foreground mb-1">
                Dernier test : {formatDateTime(new Date(testResult.finishedAt))}
              </p>
              {testResult.results.length === 0 ? (
                <p className="text-muted-foreground">
                  aucun canal configuré côté worker (variables du .env du worker)
                </p>
              ) : (
                <ul className="space-y-1">
                  {testResult.results.map((r) => (
                    <li key={r.channel} className="flex items-baseline justify-between gap-2">
                      <span>{channels.find((c) => c.id === r.channel)?.name ?? r.channel}</span>
                      {r.ok ? (
                        <span className="text-success">envoyé</span>
                      ) : (
                        <span className="text-destructive text-right break-all">
                          {r.error ?? "échec"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </Section>

        <Section title="Classification">
          <Row label="Règles new grad">toujours actives</Row>
          <Row label="LLM (offres ambiguës)">
            {env("LLM_ENABLED", "false") === "true"
              ? isSet("ANTHROPIC_API_KEY")
                ? `activé (${env("LLM_MODEL", "claude-haiku-5-5")})`
                : "activé mais clé absente"
              : "désactivé"}
          </Row>
          <Row label="Plafond LLM / jour">{env("LLM_DAILY_MAX_CALLS", "200")}</Row>
        </Section>
      </div>
    </div>
  );
}
