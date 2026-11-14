/** kv keys shared with the dashboard (light entry point: no nodemailer in the web bundle). */

/** Written by the dashboard ("Tester les canaux"), claimed by the worker at its one-minute tick. */
export const ALERT_TEST_REQUEST_KEY = "alert_test_request";
/** Last test outcome, shown on /settings. */
export const ALERT_TEST_RESULT_KEY = "alert_test_result";

export interface AlertTestResult {
  requestedAt?: string;
  finishedAt: string;
  results: { channel: string; sent: number; ok: boolean; error?: string }[];
}
