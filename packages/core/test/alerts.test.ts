import {
  alertsSent,
  apiUsage,
  companies,
  jobs,
  jobStatus,
  sourceRuns,
  type AnyDb,
} from "@jobradar/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildDigestMessage,
  createChannels,
  emailChannel,
  findHealthIssues,
  ntfyChannel,
  redact,
  runDigest,
  runHealthChecks,
  runInstantAlerts,
  sendTestAlerts,
  telegramChannel,
  type AlertChannel,
  type AlertMessage,
  type ChannelId,
  type MailTransport,
} from "../src/alerts";
import { silentLog, testDb, testEnv } from "./helpers";

const NOW = new Date("2027-01-15T13:00:00Z"); // 08:00 Toronto
const H = 3_600_000;
const BASE = "https://jobs.example.test";

let db: AnyDb;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await testDb());
});
afterEach(async () => {
  await close();
});

/** Records every message; can be told to fail. */
function fakeChannel(id: ChannelId, opts: { fail?: boolean } = {}) {
  const sent: AlertMessage[] = [];
  const ch: AlertChannel & { sent: AlertMessage[]; fail: boolean } = {
    id,
    sent,
    fail: !!opts.fail,
    async send(msg) {
      if (ch.fail) throw new Error(`boom ${id}`);
      sent.push(msg);
    },
  };
  return ch;
}

let seq = 0;
async function addJob(over: Partial<typeof jobs.$inferInsert> = {}) {
  seq++;
  const [row] = await db
    .insert(jobs)
    .values({
      fingerprint: `fp-${seq}`,
      source: "greenhouse",
      sourceJobId: String(seq),
      companyName: "Acme",
      title: `Software Engineer, New Grad ${seq}`,
      city: "Toronto",
      region: "ON",
      country: "CA",
      url: `https://boards.example.test/${seq}`,
      score: 60,
      isNewGrad: true,
      firstSeenAt: new Date(NOW.getTime() - 2 * H),
      ...over,
    })
    .returning({ id: jobs.id });
  return row!.id;
}

const deps = (channels: AlertChannel[]) => ({ db, channels, log: silentLog, now: () => NOW });
const digestOpts = { anchor: NOW, minScore: 40, publicBaseUrl: BASE };

describe("digest", () => {
  it("selects the right jobs, sorted by score and grouped by country", async () => {
    const top = await addJob({ title: "Top", score: 90 });
    await addJob({ title: "Paris", score: 70, country: "FR", city: "Paris", region: null });
    await addJob({ title: "Unknown seniority", score: 50, isNewGrad: null });
    await addJob({ title: "Senior", score: 95, isNewGrad: false });
    await addJob({ title: "Low score", score: 39 });
    await addJob({ title: "Too old", score: 80, firstSeenAt: new Date(NOW.getTime() - 25 * H) });
    await addJob({
      title: "After anchor",
      score: 80,
      firstSeenAt: new Date(NOW.getTime() + 60_000),
    });
    await addJob({ title: "Closed", score: 80, closedAt: NOW });
    const ignored = await addJob({ title: "Ignored", score: 80 });
    await db.insert(jobStatus).values({ jobId: ignored, status: "ignored" });

    const ch = fakeChannel("email");
    const res = await runDigest(deps([ch]), digestOpts);
    expect(res).toEqual([{ channel: "email", sent: 1, ok: true }]);
    const msg = ch.sent[0]!;
    expect(msg.kind).toBe("digest");
    expect(msg.title).toBe("JobRadar : 3 nouvelles offres");
    const text = msg.email!.text;
    expect(text.indexOf("Top")).toBeLessThan(text.indexOf("Unknown seniority"));
    // Canada (best score) before France, each in its own section.
    expect(text.indexOf("== Canada (2) ==")).toBeLessThan(text.indexOf("== France (1) =="));
    for (const t of ["Senior", "Low score", "Too old", "After anchor", "Closed", "Ignored"])
      expect(text).not.toContain(`${t} |`);
    expect(text).toContain(`${BASE}/jobs/${top}`);
    expect(text).toContain("postuler : https://boards.example.test/");
    expect(msg.email!.html).toContain(`href="${BASE}/jobs/${top}"`);
    // Push: count + top 5 + dashboard link.
    expect(msg.text.split("\n")[0]).toBe("3 nouvelles offres (score ≥ 40) sur 24 h");
    expect(msg.url).toBe(`${BASE}/?since=24h&min=40`);
  });

  it("never sends the same digest twice (two runs in a row, concurrent runs)", async () => {
    await addJob({ score: 80 });
    const ntfy = fakeChannel("ntfy");
    const mail = fakeChannel("email");
    const d = deps([ntfy, mail]);

    await runDigest(d, digestOpts);
    const second = await runDigest(d, digestOpts);
    expect(second.every((r) => r.ok && r.sent === 0)).toBe(true);
    await Promise.all([runDigest(d, digestOpts), runDigest(d, digestOpts)]);

    expect(ntfy.sent).toHaveLength(1);
    expect(mail.sent).toHaveLength(1);
    expect(await db.select().from(alertsSent)).toHaveLength(2);

    // The next day's digest is a new one.
    await runDigest(d, { ...digestOpts, anchor: new Date(NOW.getTime() + 24 * H) });
    expect(ntfy.sent).toHaveLength(2);
  });

  it("retries only the channel that failed", async () => {
    await addJob({ score: 80 });
    const ntfy = fakeChannel("ntfy");
    const mail = fakeChannel("email", { fail: true });
    const d = deps([ntfy, mail]);

    const first = await runDigest(d, digestOpts);
    expect(first).toEqual([
      { channel: "ntfy", sent: 1, ok: true },
      { channel: "email", sent: 0, ok: false, error: "boom email" },
    ]);
    mail.fail = false;
    await runDigest(d, digestOpts);
    await runDigest(d, digestOpts);
    expect(ntfy.sent).toHaveLength(1);
    expect(mail.sent).toHaveLength(1);
  });

  it("caps the e-mail and reports exhausted quotas", async () => {
    for (let i = 0; i < 30; i++) await addJob({ score: 50 + (i % 40) });
    await db.insert(apiUsage).values([
      { source: "adzuna", day: "2027-01-15", calls: 200 },
      { source: "jooble", day: "2027-01-15", calls: 42 },
    ]);
    const ch = fakeChannel("email");
    await runDigest(deps([ch]), { ...digestOpts, quotas: { adzuna: 200, jooble: 100 } });
    const msg = ch.sent[0]!;
    expect(msg.email!.text).toContain("+ 5 autres"); // 25 per country
    expect(msg.email!.text).toContain("Quotas épuisés : adzuna 200/200 (2027-01-15)");
    expect(msg.email!.text).not.toContain("jooble");
    // Push: headline + 5 jobs (2 lines each) + "+ 25 autres" + quota line.
    expect(msg.text.split("\n")).toHaveLength(1 + 10 + 1 + 1);
  });

  it("escapes HTML and keeps only http(s) apply links", async () => {
    await addJob({
      title: `<img src=x onerror=alert(1)> Dev`,
      companyName: `"Evil" & Co`,
      applyUrl: "javascript:alert(1)",
      url: "https://ok.example.test/1",
      score: 80,
    });
    const ch = fakeChannel("email");
    await runDigest(deps([ch]), digestOpts);
    const html = ch.sent[0]!.email!.html!;
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; Dev");
    expect(html).toContain("&quot;Evil&quot; &amp; Co");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://ok.example.test/1"');
  });

  it("sends an empty digest (daily sign of life)", async () => {
    const msg = buildDigestMessage({
      jobs: [],
      total: 0,
      window: { since: new Date(NOW.getTime() - 24 * H), until: NOW, minScore: 40 },
      publicBaseUrl: BASE,
      now: NOW,
    });
    expect(msg.text).toBe("Aucune nouvelle offre (score ≥ 40) sur 24 h");
  });
});

describe("instant alerts", () => {
  const opts = { minScore: 75, highPriorityMinScore: 40, publicBaseUrl: BASE };

  it("alerts high scores and high-priority companies once, new jobs only", async () => {
    const [hp] = await db
      .insert(companies)
      .values({ name: "Stripe", nameKey: "stripe", priority: "high" })
      .returning();
    const a = await addJob({ title: "Great", score: 80 });
    const b = await addJob({ title: "Priority", score: 50, companyId: hp!.id });
    await addJob({ title: "Priority but excluded", score: 0, companyId: hp!.id });
    await addJob({ title: "Average", score: 60 });
    await addJob({ title: "Old", score: 90, firstSeenAt: new Date(NOW.getTime() - 30 * H) });
    await addJob({ title: "Not new grad", score: 90, isNewGrad: false });

    const ch = fakeChannel("ntfy");
    const d = deps([ch]);
    expect(await runInstantAlerts(d, opts)).toEqual([{ channel: "ntfy", sent: 2, ok: true }]);
    expect(ch.sent[0]!.title).toBe("2 nouvelles offres à fort score");
    expect(ch.sent[0]!.text).toContain(`${BASE}/jobs/${a}`);
    expect(ch.sent[0]!.text).toContain(`${BASE}/jobs/${b}`);

    // Next run: nothing new, nothing sent. Then one new job: a single-job message.
    expect(await runInstantAlerts(d, opts)).toEqual([{ channel: "ntfy", sent: 0, ok: true }]);
    const c = await addJob({ title: "Fresh", score: 77 });
    await runInstantAlerts(d, opts);
    expect(ch.sent).toHaveLength(2);
    expect(ch.sent[1]!.title).toBe("77 · Fresh");
    expect(ch.sent[1]!.url).toBe(`${BASE}/jobs/${c}`);
    const rows = await db.select().from(alertsSent);
    expect(rows.map((r) => r.jobId).sort()).toEqual([a, b, c].sort());
  });
});

describe("health", () => {
  const opts = { silenceHours: 12, publicBaseUrl: BASE };

  async function run(source: string, status: "ok" | "error", hoursAgo: number, companyId?: number) {
    const at = new Date(NOW.getTime() - hoursAgo * H);
    await db.insert(sourceRuns).values({
      source,
      companyId: companyId ?? null,
      status,
      startedAt: at,
      finishedAt: at,
      error: status === "error" ? "HTTP 500" : null,
    });
  }

  it("finds broken companies, failing sources, silence and no new jobs", async () => {
    const [c] = await db
      .insert(companies)
      .values({
        name: "Acme",
        nameKey: "acme",
        ats: "greenhouse",
        atsKey: "acme",
        atsStatus: "broken",
        consecutiveFailures: 3,
      })
      .returning();
    for (const h of [20, 14, 8]) await run("greenhouse", "error", h, c!.id);
    await run("jooble", "ok", 40);
    for (const h of [30, 22, 13]) await run("jooble", "error", h);
    await run("remotive", "error", 13); // only one failure
    await addJob({ firstSeenAt: new Date(NOW.getTime() - 50 * H) });

    const issues = await findHealthIssues(
      db,
      { ...opts, previousTick: new Date(NOW.getTime() - 13 * H) },
      NOW,
    );
    expect(issues.map((i) => i.key.split(":").slice(0, 2).join(":"))).toEqual([
      "broken:company",
      "broken:source",
      "silence:worker",
      "no-new:2027-01-13T11",
    ]);
    expect(issues[0]!.text).toBe("Acme (greenhouse) en échec 3 fois de suite : HTTP 500");
    expect(issues[1]!.text).toBe("Source jooble en échec 3 fois de suite : HTTP 500");
    expect(issues[3]!.text).toMatch(/^Aucune nouvelle offre depuis 50 h/);
  });

  it("detects a worker that ticks but finishes no run", async () => {
    await run("remotive", "ok", 13);
    await addJob();
    const issues = await findHealthIssues(db, opts, NOW);
    expect(issues.map((i) => i.key)).toEqual(["silence:runs:2027-01-15T00:00:00.000Z"]);
  });

  it("alerts each issue once, and again only after a recovery", async () => {
    await run("jooble", "ok", 40);
    for (const h of [30, 22, 13]) await run("jooble", "error", h);
    await addJob();
    const ch = fakeChannel("telegram");
    const d = deps([ch]);
    await runHealthChecks(d, opts);
    await runHealthChecks(d, opts);
    expect(ch.sent).toHaveLength(1);
    expect(ch.sent[0]!).toMatchObject({ kind: "health", priority: "high" });

    // Recovers, then fails 3 more times: a new streak, a new alert.
    await run("jooble", "ok", 6);
    for (const h of [5, 4, 3]) await run("jooble", "error", h);
    await runHealthChecks(d, opts);
    expect(ch.sent).toHaveLength(2);
  });

  it("is quiet when everything is fine", async () => {
    await run("remotive", "ok", 1);
    await addJob();
    const ch = fakeChannel("ntfy");
    const r = await runHealthChecks(deps([ch]), {
      ...opts,
      previousTick: new Date(NOW.getTime() - 60_000),
    });
    expect(r.issues).toEqual([]);
    expect(ch.sent).toHaveLength(0);
  });
});

describe("test button", () => {
  it("sends a [TEST] digest preview on every channel without recording it", async () => {
    await addJob({ score: 80 });
    const chans = [
      fakeChannel("ntfy"),
      fakeChannel("email"),
      fakeChannel("discord", { fail: true }),
    ];
    const r = await sendTestAlerts(deps(chans), { minScore: 40, publicBaseUrl: BASE });
    expect(r).toEqual([
      { channel: "ntfy", sent: 1, ok: true },
      { channel: "email", sent: 1, ok: true },
      { channel: "discord", sent: 0, ok: false, error: "boom discord" },
    ]);
    expect(chans[0]!.sent[0]!.title).toMatch(/^\[TEST\] JobRadar : 1 nouvelle offre$/);
    expect(chans[1]!.sent[0]!.email!.subject).toMatch(/^\[TEST\] /);
    expect(await db.select().from(alertsSent)).toHaveLength(0);
  });
});

describe("channels", () => {
  function fakeFetch(status = 200) {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(status === 200 ? "{}" : "nope", { status });
    }) as unknown as typeof fetch;
    return { f, calls };
  }
  const msg: AlertMessage = {
    kind: "instant",
    title: "77 · Dev",
    text: "line",
    url: `${BASE}/jobs/1`,
    priority: "high",
    tags: ["star"],
  };

  it("enables only the channels whose env is set", () => {
    expect(createChannels(testEnv()).map((c) => c.id)).toEqual([]);
    const env = testEnv({
      NTFY_TOPIC: "t",
      SMTP_HOST: "smtp.example.test",
      ALERT_EMAIL_TO: "me@example.test",
      DISCORD_WEBHOOK_URL: "https://discord.example.test/api/webhooks/1/abc",
      TELEGRAM_BOT_TOKEN: "123:abc",
      TELEGRAM_CHAT_ID: "42",
    });
    const fake: MailTransport = { sendMail: async () => ({}) };
    expect(createChannels(env, { mailTransport: fake }).map((c) => c.id)).toEqual([
      "ntfy",
      "email",
      "discord",
      "telegram",
    ]);
    // SMTP without a recipient (or the reverse) stays disabled.
    expect(emailChannel(testEnv({ SMTP_HOST: "smtp.example.test" }))).toBeUndefined();
  });

  it("ntfy: JSON publish with token, priority, tags and click URL", async () => {
    const { f, calls } = fakeFetch();
    const ch = ntfyChannel(
      testEnv({
        NTFY_URL: "https://ntfy.example.test/",
        NTFY_TOPIC: "jr-x",
        NTFY_TOKEN: "tk_secret",
      }),
      { fetch: f },
    )!;
    await ch.send(msg);
    expect(calls[0]!.url).toBe("https://ntfy.example.test");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(
      "Bearer tk_secret",
    );
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      topic: "jr-x",
      title: "77 · Dev",
      message: "line",
      priority: 4,
      tags: ["star"],
      click: `${BASE}/jobs/1`,
    });
  });

  it("telegram: errors carry the status, and redact() hides the token", async () => {
    const { f, calls } = fakeFetch(401);
    const ch = telegramChannel(
      testEnv({ TELEGRAM_BOT_TOKEN: "123:secret", TELEGRAM_CHAT_ID: "42" }),
      {
        fetch: f,
      },
    )!;
    await expect(ch.send(msg)).rejects.toThrow("telegram: HTTP 401 nope");
    expect(calls[0]!.url).toBe("https://api.telegram.org/bot123:secret/sendMessage");
    expect(redact(`failed ${calls[0]!.url}`, ["123:secret"])).toBe(
      "failed https://api.telegram.org/bot***/sendMessage",
    );
  });

  it("e-mail: uses the HTML body when present", async () => {
    const mails: Parameters<MailTransport["sendMail"]>[0][] = [];
    const ch = emailChannel(
      testEnv({
        SMTP_HOST: "smtp.example.test",
        ALERT_EMAIL_TO: "me@example.test",
        SMTP_FROM: "JR <jr@example.test>",
      }),
      { mailTransport: { sendMail: async (m) => void mails.push(m) } },
    )!;
    await ch.send({ ...msg, email: { subject: "S", text: "T", html: "<p>H</p>" } });
    await ch.send(msg);
    expect(mails).toEqual([
      {
        from: "JR <jr@example.test>",
        to: "me@example.test",
        subject: "S",
        text: "T",
        html: "<p>H</p>",
      },
      { from: "JR <jr@example.test>", to: "me@example.test", subject: "77 · Dev", text: "line" },
    ]);
  });
});
