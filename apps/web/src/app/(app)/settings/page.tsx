import {
  ALERT_TEST_REQUEST_KEY,
  ALERT_TEST_RESULT_KEY,
  alertTestRequestKey,
  alertTestResultKey,
  type AlertTestResult,
} from "@jobradar/core/alerts/keys";
import { listProfileTemplates, profileHash, type ProfileTemplate } from "@jobradar/core/score";
import { getUser, listUsers, ownerUser } from "@jobradar/core/users";
import { randomBytes } from "node:crypto";
import { kvGet } from "@jobradar/db";
import type { Metadata } from "next";
import { LanguageSettings } from "@/components/language-select";
import { PageFrame, PageHeader, PageScroll } from "@/components/placeholder";
import { Rich } from "@/components/rich";
import { Badge } from "@/components/ui/badge";
import { AppearanceSettings } from "@/components/theme-controls";
import type { T } from "@/i18n/messages";
import { getFormat, getT } from "@/i18n/server";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { readProfile } from "@/lib/profile";
import { DeleteUserButton, InviteForm, PasswordForm } from "./account-forms";
import { AlertSettingsForm } from "./alert-form";
import { ProfileEditor } from "./profile-editor";
import { TestChannelsButton } from "./test-button";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("nav.settings") };
}
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

/** Scoring state of an account, as a badge. */
function ScoreState({ text, scoredHash, t }: { text: string; scoredHash: string | null; t: T }) {
  if (!text.trim()) return <Badge variant="outline">{t("settings.profile.noProfile")}</Badge>;
  return scoredHash === profileHash(text) ? (
    <Badge variant="success">{t("settings.profile.upToDate")}</Badge>
  ) : (
    <Badge variant="warning">{t("settings.profile.pending")}</Badge>
  );
}

/** Starter profiles (config/profile-templates/); none when config/ is not readable. */
function templates(): ProfileTemplate[] {
  try {
    return listProfileTemplates();
  } catch {
    return [];
  }
}

function ProfileHelp({ t }: { t: T }) {
  return (
    <details className="mt-4 text-[13px]">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
        {t("settings.profile.helpTitle")}
      </summary>
      <div className="text-muted-foreground mt-2 grid max-w-prose gap-2 leading-relaxed">
        {(
          [
            "settings.profile.help1",
            "settings.profile.help2",
            "settings.profile.help3",
            "settings.profile.help4",
            "settings.profile.help5",
          ] as const
        ).map((k) => (
          <p key={k}>
            <Rich text={t(k)} />
          </p>
        ))}
      </div>
    </details>
  );
}

export default async function SettingsPage() {
  const me = await currentUser();
  const admin = me.role === "admin";
  const db = getDb();
  const [file, user, owner, accounts] = await Promise.all([
    readProfile(me.id),
    getUser(db, me.id),
    ownerUser(db),
    admin ? listUsers(db) : Promise.resolve([]),
  ]);
  const isOwner = owner?.id === me.id;
  const [t, format] = await Promise.all([getT(), getFormat()]);
  // The owner's test request/result may still sit under the pre-accounts keys.
  const [testRequest, testResult] = await Promise.all([
    kvGet<{ requestedAt?: string }>(db, alertTestRequestKey(me.id)).then(
      async (r) => r ?? (isOwner ? kvGet<{ requestedAt?: string }>(db, ALERT_TEST_REQUEST_KEY) : r),
    ),
    kvGet<AlertTestResult>(db, alertTestResultKey(me.id)).then(
      async (r) => r ?? (isOwner ? kvGet<AlertTestResult>(db, ALERT_TEST_RESULT_KEY) : r),
    ),
  ]);

  const smtp = isSet("SMTP_HOST");
  const channels = isOwner
    ? [
        { id: "ntfy", name: "ntfy", ok: isSet("NTFY_TOPIC") },
        { id: "email", name: "E-mail (SMTP)", ok: isSet("SMTP_HOST", "ALERT_EMAIL_TO") },
        { id: "discord", name: "Discord", ok: isSet("DISCORD_WEBHOOK_URL") },
        { id: "telegram", name: "Telegram", ok: isSet("TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID") },
      ]
    : [
        { id: "ntfy", name: "ntfy", ok: !!user?.ntfyTopic },
        { id: "email", name: "E-mail", ok: smtp && !!user?.alertEmail },
      ];
  const num = (k: string, def: number) => {
    const n = Number(env(k, String(def)));
    return Number.isFinite(n) ? n : def;
  };

  return (
    <PageFrame>
      <PageHeader
        title={t("nav.settings")}
        description={
          me.name
            ? t("settings.signedInAs", { name: me.name, email: me.email ?? "" })
            : t("settings.signedIn", { email: me.email ?? "" })
        }
      />
      <PageScroll>
        <div className="max-w-4xl px-4 md:px-6">
          <Section title={t("settings.language.title")}>
            <LanguageSettings chosen={me.locale !== null} />
          </Section>

          <Section title={t("settings.appearance.title")}>
            <AppearanceSettings />
          </Section>

          <Section title={t("settings.profile.title")}>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              {"hash" in file ? (
                <code className="text-muted-foreground text-xs">{file.hash}</code>
              ) : null}
              {file.state === "ok" ? (
                <Badge variant="success">{t("settings.profile.upToDate")}</Badge>
              ) : file.state === "pending" ? (
                <Badge variant="warning">{t("settings.profile.rescoring")}</Badge>
              ) : file.state === "invalid" ? (
                <Badge variant="destructive">{t("settings.profile.invalid")}</Badge>
              ) : (
                <Badge variant="outline">{t("settings.profile.none")}</Badge>
              )}
            </div>
            {file.state === "invalid" ? (
              <p className="text-destructive mt-2 text-[13px]">{file.error}</p>
            ) : null}
            <p className="text-muted-foreground mt-2 text-xs">
              {file.scoredAt
                ? t("settings.profile.scoredAt", { date: format.dateTime(file.scoredAt) })
                : t("settings.profile.notScored")}{" "}
              {file.state === "pending"
                ? t("settings.profile.pendingHelp")
                : file.state === "empty"
                  ? t("settings.profile.emptyHelp")
                  : ""}
            </p>
            <ProfileEditor
              key={file.text}
              initial={file.text}
              templates={templates()}
              rescoring={file.state === "pending"}
            />
            <ProfileHelp t={t} />
          </Section>

          <Section title={t("settings.password.title")}>
            <PasswordForm />
          </Section>

          {admin ? (
            <Section title={t("settings.accounts.title")}>
              <ul className="text-[13px]">
                {accounts.map((u) => (
                  <li
                    key={u.id}
                    className="border-border-soft flex items-center justify-between gap-3 border-b py-2 last:border-0"
                  >
                    <span className="min-w-0 truncate">
                      {u.name ? <span className="font-medium">{u.name} · </span> : null}
                      <span className={u.name ? "text-muted-foreground" : undefined}>
                        {u.email ?? t("settings.accounts.noEmail")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {u.role === "admin" ? <Badge variant="outline">admin</Badge> : null}
                      {u.passwordHash ? null : (
                        <Badge variant="outline">{t("settings.accounts.noPassword")}</Badge>
                      )}
                      <ScoreState text={u.profileYaml} scoredHash={u.scoredHash} t={t} />
                      {u.id !== me.id && u.role !== "admin" ? (
                        <DeleteUserButton id={u.id} email={u.email ?? String(u.id)} />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              <InviteForm />
            </Section>
          ) : null}

          <Section title={t("settings.alerts.title")}>
            {user ? (
              <AlertSettingsForm
                values={{
                  digestEnabled: user.digestEnabled,
                  digestMinScore: user.digestMinScore,
                  instantEnabled: user.instantEnabled,
                  instantMinScore: user.instantMinScore,
                  alertEmail: user.alertEmail,
                  ntfyTopic: user.ntfyTopic,
                }}
                defaults={{
                  digest: num("DIGEST_MIN_SCORE", 40),
                  instant: num("INSTANT_MIN_SCORE", 75),
                  digestTime:
                    env("DIGEST_CRON", "0 8 * * *") === "0 8 * * *" ? "8 h" : env("DIGEST_CRON"),
                }}
                ownChannels={!isOwner}
                smtp={smtp}
                suggestedTopic={`jobradar-${randomBytes(9)
                  .toString("base64url")
                  .replace(/[^A-Za-z0-9]/g, "x")}`}
                ntfyUrl={env("NTFY_URL", "https://ntfy.sh")}
              />
            ) : null}
            <div className="mt-5">
              {channels.map((c) => (
                <Row key={c.name} label={c.name}>
                  {c.ok ? (
                    <span className="text-success">{t("settings.alerts.configured")}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {t("settings.alerts.notConfigured")}
                    </span>
                  )}
                </Row>
              ))}
              {isOwner ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  {t("settings.alerts.ownerHelp")}
                </p>
              ) : null}
              {format.locale !== "fr" ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  {t("settings.alerts.language")}
                </p>
              ) : null}
              <TestChannelsButton
                disabled={!channels.some((c) => c.ok)}
                ownerChannels={isOwner}
                pendingSince={testRequest?.requestedAt}
              />
              {testResult ? (
                <div className="mt-3 text-xs">
                  <p className="text-muted-foreground mb-1">
                    {t("settings.alerts.lastTest", {
                      date: format.dateTime(new Date(testResult.finishedAt)),
                    })}
                  </p>
                  {testResult.results.length === 0 ? (
                    <p className="text-muted-foreground">{t("settings.alerts.noChannel")}</p>
                  ) : (
                    <ul className="space-y-1">
                      {testResult.results.map((r) => (
                        <li key={r.channel} className="flex items-baseline justify-between gap-2">
                          <span>{channels.find((c) => c.id === r.channel)?.name ?? r.channel}</span>
                          {r.ok ? (
                            <span className="text-success">{t("settings.alerts.sent")}</span>
                          ) : (
                            <span className="text-destructive text-right break-all">
                              {r.error ?? t("common.failed")}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          </Section>

          {admin ? (
            <>
              <Section title={t("settings.tech.title")}>
                <Row label={t("settings.tech.digest")}>
                  {env("DIGEST_CRON", "0 8 * * *")} {t("settings.tech.toronto")}
                </Row>
                <Row label={t("settings.tech.thresholds")}>
                  {t("settings.tech.thresholdsValue", {
                    digest: env("DIGEST_MIN_SCORE", "40"),
                    instant: env("INSTANT_MIN_SCORE", "75"),
                  })}
                </Row>
                <Row label={t("settings.tech.instant")}>
                  {env("INSTANT_ALERTS_ENABLED", "true") === "true"
                    ? t("settings.tech.instantOn")
                    : t("settings.tech.instantOff")}
                </Row>
                <Row label={t("settings.tech.silent")}>{env("HEALTH_SILENCE_HOURS", "12")} h</Row>
              </Section>

              <Section title={t("settings.classification.title")}>
                <Row label={t("settings.classification.rules")}>
                  {t("settings.classification.rulesOn")}
                </Row>
                <Row label={t("settings.classification.llm")}>
                  {env("LLM_ENABLED", "false") === "true"
                    ? isSet("ANTHROPIC_API_KEY")
                      ? t("settings.classification.llmOn", {
                          model: env("LLM_MODEL", "claude-haiku-5-5"),
                        })
                      : t("settings.classification.llmNoKey")
                    : t("settings.classification.llmOff")}
                </Row>
                <Row label={t("settings.classification.llmCap")}>
                  {env("LLM_DAILY_MAX_CALLS", "200")}
                </Row>
              </Section>
            </>
          ) : null}
        </div>
      </PageScroll>
    </PageFrame>
  );
}
