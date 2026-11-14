/**
 * Optional LLM pass (LLM_ENABLED=false by default): only for jobs the rules leave ambiguous
 * (is_new_grad = null). The score never depends on it: it only settles those ambiguous cases.
 * Strict JSON output, daily call cap (dbQuota "llm"), cache per job fingerprint in `kv`.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Logger } from "../logger";

export const LlmVerdictSchema = z.object({
  is_new_grad: z.boolean().nullable(),
  seniority: z.enum(["intern", "entry", "mid", "senior", "manager"]).nullable(),
  years_required: z.number().int().min(0).max(40).nullable(),
  visa_or_work_auth_notes: z.string().nullable(),
  /** ISO 639-1 codes of the languages the job requires ("fr", "en", "de"). */
  language_required: z.array(z.string()),
});
export type LlmVerdict = z.infer<typeof LlmVerdictSchema>;

export interface LlmJobInput {
  title: string;
  companyName: string;
  locationRaw: string | null;
  descriptionText: string | null;
}

export interface LlmClassifier {
  /** Null when the model declines (refusal) or returns nothing usable. */
  classify(job: LlmJobInput): Promise<LlmVerdict | null>;
}

const SYSTEM = `You classify job postings for a candidate graduating in May 2027 who wants a full-time new-grad role (internships, co-ops and student jobs do not count).
Answer from the posting only:
- is_new_grad: true if a new graduate with no full-time experience is a realistic hire (entry level, junior, level I, 0-2 years), false if the role needs more experience or is an internship/co-op, null if the posting gives no usable signal.
- seniority: intern, entry, mid, senior or manager; null if unknown.
- years_required: minimum years of professional experience required, null if not stated.
- visa_or_work_auth_notes: short quote or summary of work authorization, citizenship, clearance or visa sponsorship constraints; null if none.
- language_required: ISO 639-1 codes of the spoken languages the job requires (empty if none stated).`;

/** Description sent to the model: enough for requirements, bounded cost. */
const MAX_DESCRIPTION_CHARS = 8_000;

export function createAnthropicClassifier(opts: {
  apiKey: string;
  model: string;
  log: Logger;
  /** Injected in tests; defaults to the real SDK client. */
  client?: Pick<Anthropic, "messages">;
}): LlmClassifier {
  const client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, maxRetries: 2 });
  return {
    async classify(job) {
      const posting = [
        `Title: ${job.title}`,
        `Company: ${job.companyName}`,
        `Location: ${job.locationRaw ?? "unknown"}`,
        "",
        (job.descriptionText ?? "(no description)").slice(0, MAX_DESCRIPTION_CHARS),
      ].join("\n");
      const response = await client.messages.parse({
        model: opts.model,
        max_tokens: 2048,
        system: SYSTEM,
        output_config: { effort: "low", format: zodOutputFormat(LlmVerdictSchema) },
        messages: [{ role: "user", content: posting }],
      });
      if (response.stop_reason === "refusal") {
        opts.log.warn({ title: job.title }, "llm declined to classify the job");
        return null;
      }
      return response.parsed_output ?? null;
    },
  };
}

/** True for errors worth stopping the whole LLM pass for (auth, rate limit, overload). */
export function isFatalLlmError(err: unknown): boolean {
  return (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError ||
    err instanceof Anthropic.RateLimitError ||
    (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500)
  );
}
