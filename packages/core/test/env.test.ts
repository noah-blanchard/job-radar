import { describe, expect, it } from "vitest";
import { EnvError, parseEnv, requireEnv } from "../src/env";

describe("parseEnv", () => {
  it("applies defaults on an empty environment", () => {
    const env = parseEnv({});
    expect(env.TZ).toBe("America/Toronto");
    expect(env.LLM_ENABLED).toBe(false);
    expect(env.LLM_DAILY_MAX_CALLS).toBe(200);
    expect(env.DIGEST_MIN_SCORE).toBe(40);
    expect(env.INSTANT_MIN_SCORE).toBe(75);
    expect(env.ADZUNA_COUNTRIES).toEqual(["ca", "us", "fr", "gb"]);
    expect(env.WORKER_HEALTH_PORT).toBe(8081);
  });

  it("treats empty strings as unset", () => {
    const env = parseEnv({
      ANTHROPIC_API_KEY: "",
      DIGEST_MIN_SCORE: "  ",
      DISCORD_WEBHOOK_URL: "",
    });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.DIGEST_MIN_SCORE).toBe(40);
    expect(env.DISCORD_WEBHOOK_URL).toBeUndefined();
  });

  it("treats a comment captured as the value (KEY=   # comment in compose) as unset", () => {
    const env = parseEnv({
      NTFY_TOPIC: "# nom difficile à deviner",
      NTFY_TOKEN: "# si instance protégée",
      CONTACT_EMAIL: "#",
      SMTP_PASS: "pa#ss",
    });
    expect(env.NTFY_TOPIC).toBeUndefined();
    expect(env.NTFY_TOKEN).toBeUndefined();
    expect(env.CONTACT_EMAIL).toBeUndefined();
    expect(env.SMTP_PASS).toBe("pa#ss");
  });

  it("coerces booleans, ints and lists", () => {
    const env = parseEnv({
      LLM_ENABLED: "true",
      SMTP_SECURE: "false",
      JSEARCH_DAILY_MAX_CALLS: "2",
      ADZUNA_COUNTRIES: "ca, fr",
    });
    expect(env.LLM_ENABLED).toBe(true);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.JSEARCH_DAILY_MAX_CALLS).toBe(2);
    expect(env.ADZUNA_COUNTRIES).toEqual(["ca", "fr"]);
  });

  it("reports every invalid variable", () => {
    expect(() => parseEnv({ DIGEST_MIN_SCORE: "abc", AUTH_SECRET: "short" })).toThrow(
      /DIGEST_MIN_SCORE[\s\S]*AUTH_SECRET|AUTH_SECRET[\s\S]*DIGEST_MIN_SCORE/,
    );
  });

  it("rejects an invalid boolean", () => {
    expect(() => parseEnv({ LLM_ENABLED: "maybe" })).toThrow(EnvError);
  });
});

describe("requireEnv", () => {
  it("throws with the list of missing keys", () => {
    const env = parseEnv({});
    expect(() => requireEnv(env, ["DATABASE_URL", "AUTH_SECRET"])).toThrow(
      "Missing required environment variables: DATABASE_URL, AUTH_SECRET",
    );
  });

  it("passes when keys are present", () => {
    const env = parseEnv({ DATABASE_URL: "postgres://x" });
    expect(requireEnv(env, ["DATABASE_URL"]).DATABASE_URL).toBe("postgres://x");
  });
});
