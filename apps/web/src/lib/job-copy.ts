import type { Format } from "@/i18n/format";
import type { T } from "@/i18n/messages";
import type { JobDetail } from "./job-detail";
import type { SafeNode } from "./sanitize";

/**
 * The offer as Markdown, for the "Copy offer" button: facts, links and the full description, to
 * paste into an AI assistant (CV, cover letter). Personal data (notes, score) stays out.
 */

/** Marks one indent level while the text is built; turned into spaces once lines are cleaned. */
const INDENT = "\uE000";

const block = (s: string) => `\n\n${s.trim()}\n\n`;

function inline(nodes: SafeNode[], pre: boolean): string {
  return nodes.map((n) => render(n, pre)).join("");
}

function listItems(nodes: SafeNode[], ordered: boolean): string {
  let i = 0;
  const lines = nodes.flatMap((n) => {
    if (typeof n === "string") return n.trim() ? [`- ${n.trim()}`] : [];
    const marker = ordered ? `${++i}.` : "-";
    // Nested blocks of the item (paragraphs, sub-lists) are indented under its marker.
    const body = inline(n.t === "li" ? n.c : [n], false)
      .trim()
      .replace(/\n[ \t]*(?:\n[ \t]*)+/g, "\n")
      .replace(/\n/g, `\n${INDENT}`);
    return body ? [`${marker} ${body}`] : [];
  });
  return lines.length ? block(lines.join("\n")) : "";
}

function render(n: SafeNode, pre: boolean): string {
  if (typeof n === "string") return pre ? n : n.replace(/\s+/g, " ");
  const inner = () => inline(n.c, pre);
  switch (n.t) {
    case "br":
      return "\n";
    case "hr":
      return block("---");
    case "p":
      return block(inner());
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const text = inner().trim();
      return text ? block(`${"#".repeat(Number(n.t[1]))} ${text}`) : "";
    }
    case "ul":
    case "ol":
      return listItems(n.c, n.t === "ol");
    case "li":
      return block(`- ${inner()}`);
    case "blockquote":
      return block(
        inline(n.c, pre)
          .trim()
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n"),
      );
    case "pre":
      return block(`\`\`\`\n${inline(n.c, true).replace(/^\n+|\s+$/g, "")}\n\`\`\``);
    case "code":
      return pre ? inner() : `\`${inner().trim()}\``;
    case "strong": {
      const text = inner().trim();
      return text ? ` **${text}** ` : "";
    }
    case "em": {
      const text = inner().trim();
      return text ? ` *${text}* ` : "";
    }
    case "a": {
      const text = inner().trim();
      if (!n.h) return text;
      return !text || text === n.h ? n.h : `[${text}](${n.h})`;
    }
    case "table":
    case "thead":
    case "tbody":
      return block(inner());
    case "tr": {
      const cells = n.c
        .map((c) => (typeof c === "string" ? c : inline(c.c, false)).trim())
        .filter(Boolean);
      return cells.length ? `\n| ${cells.join(" | ")} |\n` : "";
    }
    default:
      return inner();
  }
}

/** A sanitized description tree as readable Markdown. */
export function descriptionToMarkdown(nodes: SafeNode[]): string {
  return inline(nodes, false)
    .split("\n")
    .map((line) => {
      const lead = line.match(/^[ \t\uE000]*/)![0];
      const depth = lead.split(INDENT).length - 1;
      const text = line
        .replaceAll(INDENT, "")
        .replace(/[ \t]+/g, " ")
        .replace(/ +([.,;:!?)])/g, "$1")
        .trim();
      return text ? "  ".repeat(depth) + text : "";
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The whole offer as Markdown, labels in the interface language. */
export function jobToMarkdown(job: JobDetail, t: T, format: Format): string {
  const place =
    format.place(job) +
    (job.location_raw && job.location_raw !== job.city ? ` (${job.location_raw})` : "");
  const newGrad =
    job.is_new_grad === null ? null : job.is_new_grad ? t("common.yes") : t("common.no");
  const facts: [string, string | null][] = [
    [t("job.copy.company"), job.company_name],
    [t("job.copy.location"), place],
    [t("job.copy.employmentType"), job.employment_type],
    [t("job.copy.seniority"), job.seniority],
    [t("job.copy.newGrad"), newGrad],
    [t("job.copy.salary"), job.salary],
    [t("job.copy.domains"), job.domains.length ? job.domains.join(", ") : null],
    [t("job.copy.posted"), job.posted_at ? format.date(job.posted_at) : null],
    [t("job.copy.closed"), job.closed_at ? format.date(job.closed_at) : null],
    [t("job.copy.applyUrl"), job.apply_url ?? job.url],
    [t("job.copy.originalUrl"), job.apply_url && job.apply_url !== job.url ? job.url : null],
  ];

  const description = job.description
    ? descriptionToMarkdown(job.description)
    : job.description_text?.trim() || t("job.copy.noDescription");

  return [
    `# ${job.title}`,
    facts
      .filter((f): f is [string, string] => Boolean(f[1]))
      .map(([label, value]) => `- **${label}** ${value}`)
      .join("\n"),
    `## ${t("job.description")}`,
    description,
  ].join("\n\n");
}
