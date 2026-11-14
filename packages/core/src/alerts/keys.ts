/** kv keys shared with the dashboard (light entry point: no nodemailer in the web bundle). */

/**
 * Written by the dashboard ("Tester les canaux"), claimed by the worker at its one-minute tick.
 * One per user: `alert_test_request:<user id>` (the bare key is the owner's, from before
 * accounts existed).
 */
export const ALERT_TEST_REQUEST_KEY = "alert_test_request";
/** Last test outcome, shown on /settings (same per-user suffix). */
export const ALERT_TEST_RESULT_KEY = "alert_test_result";

export const alertTestRequestKey = (userId: number) => `${ALERT_TEST_REQUEST_KEY}:${userId}`;
export const alertTestResultKey = (userId: number) => `${ALERT_TEST_RESULT_KEY}:${userId}`;

export interface AlertTestResult {
  requestedAt?: string;
  finishedAt: string;
  results: { channel: string; sent: number; ok: boolean; error?: string }[];
}
