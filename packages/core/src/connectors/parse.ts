import type { z } from "zod";
import type { Logger } from "../logger";

/** Validates items one by one: an invalid item is logged and skipped, never fatal. */
export function* parseItems<T extends z.ZodType>(
  schema: T,
  items: readonly unknown[],
  log: Logger,
  source: string,
): Generator<z.infer<T>> {
  let invalid = 0;
  for (const item of items) {
    const r = schema.safeParse(item);
    if (r.success) yield r.data;
    else {
      invalid++;
      if (invalid <= 3)
        log.warn({ source, issues: r.error.issues.slice(0, 3) }, "invalid item skipped");
    }
  }
  if (invalid > 3) log.warn({ source, invalid }, "invalid items skipped");
}
