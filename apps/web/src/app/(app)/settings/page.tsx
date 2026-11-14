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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db";
import { readProfile } from "@/lib/profile";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { TestChannelsButton } from "./test-button";

export const metadata: Metadata = { title: "Réglages" };
export const dynamic = "force-dynamic";

const env = (k: string, def = "—") => {
  const v = process.env[k];
  return v === undefined || v === "" ? def : v;
};
const isSet = (...keys: string[]) => keys.every((k) => !!process.env[k]);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
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
    <>
      <PageHeader
        title="Réglages"
        description="Profil de matching effectif, seuils d'alerte et canaux. Modifie config/profile.yaml et .env, puis redéploie. Le test des canaux est exécuté par le worker."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card className="gap-3 py-4">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              config/profile.yaml
              {"hash" in file ? (
                <code className="text-muted-foreground text-xs font-normal">{file.hash}</code>
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
            </CardTitle>
          </CardHeader>
          <CardContent>
            {"error" in file && file.error ? (
              <p className="text-destructive text-sm">{file.error}</p>
            ) : null}
            <p className="text-muted-foreground mb-2 text-xs">
              {applied
                ? `Scores calculés avec le profil ${applied.hash} le ${formatDateTime(new Date(applied.appliedAt))} (${applied.jobs.toLocaleString("fr-CA")} offres en ${formatDuration(applied.ms)}).`
                : "Aucun recalcul complet enregistré pour l'instant."}{" "}
              {"hash" in file && !inSync
                ? "Le worker recalcule tout au prochain balayage (ou : cli rescore)."
                : ""}
            </p>
            <pre className="bg-secondary/40 max-h-[32rem] overflow-auto rounded-md p-3 text-xs leading-relaxed">
              {"text" in file ? file.text : (applied?.text ?? "")}
            </pre>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="gap-3 py-4">
            <CardHeader>
              <CardTitle className="text-sm">Seuils d&apos;alerte</CardTitle>
            </CardHeader>
            <CardContent>
              <Row label="Digest quotidien">{env("DIGEST_CRON", "0 8 * * *")} (Toronto)</Row>
              <Row label="Score min. du digest">{env("DIGEST_MIN_SCORE", "40")}</Row>
              <Row label="Alertes instantanées">
                {env("INSTANT_ALERTS_ENABLED", "true") === "true" ? "activées" : "désactivées"}
              </Row>
              <Row label="Score min. instantané">{env("INSTANT_MIN_SCORE", "75")}</Row>
              <Row label="Worker silencieux après">{env("HEALTH_SILENCE_HOURS", "12")} h</Row>
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader>
              <CardTitle className="text-sm">Canaux</CardTitle>
            </CardHeader>
            <CardContent>
              {channels.map((c) => (
                <Row key={c.name} label={c.name}>
                  {c.ok ? (
                    <Badge variant="success">configuré</Badge>
                  ) : (
                    <Badge variant="outline">non configuré</Badge>
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
                            <Badge variant="success">envoyé</Badge>
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
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader>
              <CardTitle className="text-sm">Classification</CardTitle>
            </CardHeader>
            <CardContent>
              <Row label="Règles new grad">toujours actives</Row>
              <Row label="LLM (offres ambiguës)">
                {env("LLM_ENABLED", "false") === "true"
                  ? isSet("ANTHROPIC_API_KEY")
                    ? `activé (${env("LLM_MODEL", "claude-haiku-5-5")})`
                    : "activé mais clé absente"
                  : "désactivé"}
              </Row>
              <Row label="Plafond LLM / jour">{env("LLM_DAILY_MAX_CALLS", "200")}</Row>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
