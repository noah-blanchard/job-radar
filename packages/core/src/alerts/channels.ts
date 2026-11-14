import { createTransport } from "nodemailer";
import type { Env } from "../env";

export type AlertKind = "digest" | "instant" | "health" | "test";
export type ChannelId = "ntfy" | "email" | "discord" | "telegram";

/** One alert, rendered for every channel: push channels use `text`, e-mail uses `email`. */
export interface AlertMessage {
  kind: AlertKind;
  title: string;
  /** Short plain text (push): a few lines. */
  text: string;
  /** Link opened by a tap on the push notification. */
  url?: string;
  priority?: "low" | "default" | "high";
  tags?: string[];
  /** E-mail body; defaults to `text`. */
  email?: { subject: string; html?: string; text: string };
}

export interface AlertChannel {
  id: ChannelId;
  send(msg: AlertMessage): Promise<void>;
}

/** What nodemailer's transporter needs to offer (tests pass a fake). */
export interface MailTransport {
  sendMail(mail: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
}

export interface ChannelDeps {
  /** Defaults to the global fetch (Node 22). Tests pass a fake: no network. */
  fetch?: typeof fetch;
  /** Defaults to a nodemailer SMTP transport built from the env. */
  mailTransport?: MailTransport;
  /** Per-request timeout. */
  timeoutMs?: number;
}

type AlertEnv = Pick<
  Env,
  | "NTFY_URL"
  | "NTFY_TOPIC"
  | "NTFY_TOKEN"
  | "SMTP_HOST"
  | "SMTP_PORT"
  | "SMTP_SECURE"
  | "SMTP_USER"
  | "SMTP_PASS"
  | "SMTP_FROM"
  | "ALERT_EMAIL_TO"
  | "DISCORD_WEBHOOK_URL"
  | "TELEGRAM_BOT_TOKEN"
  | "TELEGRAM_CHAT_ID"
>;

/** Secrets that must never appear in an error message shown in the dashboard or the logs. */
export function alertSecrets(env: AlertEnv): string[] {
  return [env.NTFY_TOKEN, env.SMTP_PASS, env.DISCORD_WEBHOOK_URL, env.TELEGRAM_BOT_TOKEN].filter(
    (v): v is string => !!v,
  );
}

export function redact(message: string, secrets: readonly string[]): string {
  let out = message;
  for (const s of secrets) if (s.length >= 4) out = out.split(s).join("***");
  return out;
}

async function post(
  f: typeof fetch,
  url: string,
  init: { headers: Record<string, string>; body: string },
  timeoutMs: number,
  what: string,
): Promise<void> {
  const res = await f(url, {
    method: "POST",
    headers: init.headers,
    body: init.body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`${what}: HTTP ${res.status}${body ? ` ${body}` : ""}`);
  }
}

const NTFY_PRIORITY = { low: 2, default: 3, high: 4 } as const;
/** Discord message limit: 2000 characters. Telegram: 4096. */
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

export function ntfyChannel(env: AlertEnv, deps: ChannelDeps = {}): AlertChannel | undefined {
  if (!env.NTFY_TOPIC) return undefined;
  const f = deps.fetch ?? fetch;
  const base = env.NTFY_URL.replace(/\/+$/, "");
  return {
    id: "ntfy",
    async send(msg) {
      // JSON publishing (POST to the root URL): UTF-8 title, click URL and tags without headers.
      const body = {
        topic: env.NTFY_TOPIC,
        title: msg.title,
        message: clip(msg.text, 3800),
        priority: NTFY_PRIORITY[msg.priority ?? "default"],
        ...(msg.tags?.length ? { tags: msg.tags } : {}),
        ...(msg.url ? { click: msg.url } : {}),
      };
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (env.NTFY_TOKEN) headers.authorization = `Bearer ${env.NTFY_TOKEN}`;
      await post(
        f,
        base,
        { headers, body: JSON.stringify(body) },
        deps.timeoutMs ?? 15_000,
        "ntfy",
      );
    },
  };
}

export function emailChannel(env: AlertEnv, deps: ChannelDeps = {}): AlertChannel | undefined {
  if (!env.SMTP_HOST || !env.ALERT_EMAIL_TO) return undefined;
  const from = env.SMTP_FROM ?? env.SMTP_USER ?? "jobradar@localhost";
  const transport: MailTransport =
    deps.mailTransport ??
    createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } } : {}),
      connectionTimeout: deps.timeoutMs ?? 15_000,
      greetingTimeout: deps.timeoutMs ?? 15_000,
      socketTimeout: 30_000,
    });
  const to = env.ALERT_EMAIL_TO;
  return {
    id: "email",
    async send(msg) {
      const mail = msg.email ?? { subject: msg.title, text: msg.text };
      await transport.sendMail({
        from,
        to,
        subject: mail.subject,
        text: mail.text,
        ...(mail.html ? { html: mail.html } : {}),
      });
    },
  };
}

export function discordChannel(env: AlertEnv, deps: ChannelDeps = {}): AlertChannel | undefined {
  if (!env.DISCORD_WEBHOOK_URL) return undefined;
  const f = deps.fetch ?? fetch;
  const url = env.DISCORD_WEBHOOK_URL;
  return {
    id: "discord",
    async send(msg) {
      const content = clip(`**${msg.title}**\n${msg.text}${msg.url ? `\n${msg.url}` : ""}`, 2000);
      // allowed_mentions: never ping @everyone from a job title.
      const body = { content, allowed_mentions: { parse: [] }, flags: 4 /* no embeds */ };
      await post(
        f,
        url,
        { headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
        deps.timeoutMs ?? 15_000,
        "discord",
      );
    },
  };
}

export function telegramChannel(env: AlertEnv, deps: ChannelDeps = {}): AlertChannel | undefined {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return undefined;
  const f = deps.fetch ?? fetch;
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  return {
    id: "telegram",
    async send(msg) {
      // Plain text (no parse_mode): nothing to escape in job titles.
      const body = {
        chat_id: env.TELEGRAM_CHAT_ID,
        text: clip(`${msg.title}\n${msg.text}${msg.url ? `\n${msg.url}` : ""}`, 4096),
        link_preview_options: { is_disabled: true },
      };
      await post(
        f,
        url,
        { headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
        deps.timeoutMs ?? 15_000,
        "telegram",
      );
    },
  };
}

/** Every channel whose env variables are set. None configured = alerts are only logged. */
export function createChannels(env: AlertEnv, deps: ChannelDeps = {}): AlertChannel[] {
  return [
    ntfyChannel(env, deps),
    emailChannel(env, deps),
    discordChannel(env, deps),
    telegramChannel(env, deps),
  ].filter((c): c is AlertChannel => !!c);
}
