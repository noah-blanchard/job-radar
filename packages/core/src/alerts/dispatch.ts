import { alertsSent, and, eq, inArray, type AnyDb } from "@jobradar/db";
import type { Logger } from "../logger";
import { redact, type AlertChannel, type AlertKind, type AlertMessage } from "./channels";

export interface AlertDeps {
  db: AnyDb;
  /** Recipient: the jobs, scores and statuses are this user's. */
  userId: number;
  channels: AlertChannel[];
  log: Logger;
  now?: () => Date;
  /** Values masked in error messages (tokens, webhook URLs). */
  secrets?: readonly string[];
}

/** One thing that must be alerted at most once per channel (a job, a digest, a health issue). */
export interface DedupItem {
  key: string;
  jobId?: number | null;
}

export interface ChannelResult {
  channel: string;
  /** Items delivered by this call (0 when everything was already sent). */
  sent: number;
  ok: boolean;
  error?: string;
}

/** Inserts the (channel, kind, key) rows that do not exist yet; returns the ones inserted. */
async function claim(
  db: AnyDb,
  channel: string,
  kind: AlertKind,
  items: readonly DedupItem[],
): Promise<Set<string>> {
  if (items.length === 0) return new Set();
  const rows = await db
    .insert(alertsSent)
    .values(items.map((i) => ({ channel, kind, dedupKey: i.key, jobId: i.jobId ?? null })))
    .onConflictDoNothing({ target: [alertsSent.channel, alertsSent.kind, alertsSent.dedupKey] })
    .returning({ key: alertsSent.dedupKey });
  return new Set(rows.map((r) => r.key));
}

async function release(db: AnyDb, channel: string, kind: AlertKind, keys: readonly string[]) {
  if (keys.length === 0) return;
  await db
    .delete(alertsSent)
    .where(
      and(
        eq(alertsSent.channel, channel),
        eq(alertsSent.kind, kind),
        inArray(alertsSent.dedupKey, [...keys]),
      ),
    );
}

/**
 * Idempotent send. For each channel, the items not yet in `alerts_sent` are claimed first
 * (INSERT ... ON CONFLICT DO NOTHING, so two concurrent callers can never both win), the
 * message is built from those items only, then sent. A failed send releases its claims: the
 * items are retried at the next call. A crash between claim and send loses the alert rather
 * than sending it twice.
 */
export async function sendOnce(
  deps: AlertDeps,
  kind: AlertKind,
  items: readonly DedupItem[],
  build: (fresh: DedupItem[]) => AlertMessage | undefined,
): Promise<ChannelResult[]> {
  const results: ChannelResult[] = [];
  for (const ch of deps.channels) {
    const claimed = await claim(deps.db, ch.id, kind, items);
    const fresh = items.filter((i) => claimed.has(i.key));
    if (fresh.length === 0) {
      results.push({ channel: ch.id, sent: 0, ok: true });
      continue;
    }
    const msg = build(fresh);
    if (!msg) {
      await release(deps.db, ch.id, kind, [...claimed]);
      results.push({ channel: ch.id, sent: 0, ok: true });
      continue;
    }
    try {
      await ch.send(msg);
      results.push({ channel: ch.id, sent: fresh.length, ok: true });
    } catch (err) {
      await release(deps.db, ch.id, kind, [...claimed]);
      const error = redact(err instanceof Error ? err.message : String(err), deps.secrets ?? []);
      deps.log.error({ channel: ch.id, kind, error }, "alert send failed (will retry)");
      results.push({ channel: ch.id, sent: 0, ok: false, error });
    }
  }
  return results;
}

/** Sends to every channel without any bookkeeping (test button). */
export async function sendToAll(deps: AlertDeps, msg: AlertMessage): Promise<ChannelResult[]> {
  return Promise.all(
    deps.channels.map(async (ch): Promise<ChannelResult> => {
      try {
        await ch.send(msg);
        return { channel: ch.id, sent: 1, ok: true };
      } catch (err) {
        const error = redact(err instanceof Error ? err.message : String(err), deps.secrets ?? []);
        return { channel: ch.id, sent: 0, ok: false, error };
      }
    }),
  );
}
