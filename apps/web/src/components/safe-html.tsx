import { sanitizeHtml } from "../lib/sanitize";
import { SafeNodes } from "./safe-nodes";

/** Server-side convenience: sanitize then render job-description HTML (see `sanitizeHtml`). */
export function SafeHtml({ html, className }: { html: string; className?: string }) {
  return <SafeNodes nodes={sanitizeHtml(html)} className={className} />;
}
