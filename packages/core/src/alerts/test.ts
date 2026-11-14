import { buildDigestMessage, loadDigest, type DigestOptions } from "./digest";
import { sendToAll, type AlertDeps, type ChannelResult } from "./dispatch";

export * from "./keys";

/**
 * Test button: a preview of the digest of the last 24 h (top 5 in push, full HTML e-mail),
 * flagged [TEST], sent on every configured channel. Nothing is written to `alerts_sent`.
 */
export async function sendTestAlerts(
  deps: AlertDeps,
  o: Omit<DigestOptions, "anchor">,
): Promise<ChannelResult[]> {
  const now = (deps.now ?? (() => new Date()))();
  const content = await loadDigest(deps, { ...o, anchor: now });
  return sendToAll(deps, buildDigestMessage({ ...content, now, test: true }));
}
