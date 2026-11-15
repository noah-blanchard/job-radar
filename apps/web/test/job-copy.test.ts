import { describe, expect, it } from "vitest";
import { createFormat } from "../src/i18n/format";
import { MESSAGES, type MessageKey } from "../src/i18n/messages";
import { createT } from "../src/i18n/translate";
import { descriptionToMarkdown, jobToMarkdown } from "../src/lib/job-copy";
import type { JobDetail } from "../src/lib/job-detail";
import { sanitizeHtml } from "../src/lib/sanitize";

const t = createT<MessageKey>("fr", MESSAGES.fr);
const format = createFormat("fr", t);

const job: JobDetail = {
  id: 1,
  title: "Développeur·se Full Stack Junior",
  company_name: "Acme",
  company_priority: "high",
  location_raw: "Montréal, QC",
  city: "Montréal",
  region: "QC",
  country: "CA",
  remote: "hybrid",
  employment_type: "Temps plein",
  seniority: "junior",
  is_new_grad: true,
  salary: "70 000 $ – 85 000 $",
  posted_at: "2026-11-10T12:00:00Z",
  first_seen_at: "2026-11-10T12:00:00Z",
  closed_at: null,
  url: "https://board.example/jobs/1",
  apply_url: "https://acme.example/apply/1",
  description: sanitizeHtml(
    "<h2>Le rôle</h2><p>Tu rejoins   l'équipe <b>Produit</b>.</p>" +
      "<ul><li>React et <i>TypeScript</i></li><li>Postgres<ul><li>SQL avancé</li></ul></li></ul>" +
      "<ol><li>Entrevue</li><li>Test technique</li></ol>" +
      '<p>Voir <a href="https://acme.example/culture">notre culture</a>.</p>',
  ),
  description_text: null,
  score: 87,
  score_breakdown: null,
  domains: ["web", "backend"],
  status: "saved",
  notes: "Contact : Marie, très personnel",
  next_action_at: null,
  sources: [],
};

describe("copy offer", () => {
  it("turns the description tree into readable Markdown", () => {
    expect(descriptionToMarkdown(job.description!)).toBe(
      [
        "### Le rôle",
        "",
        "Tu rejoins l'équipe **Produit**.",
        "",
        "- React et *TypeScript*",
        "- Postgres",
        "  - SQL avancé",
        "",
        "1. Entrevue",
        "2. Test technique",
        "",
        "Voir [notre culture](https://acme.example/culture).",
      ].join("\n"),
    );
  });

  it("copies facts, links and description, but not notes or score", () => {
    const md = jobToMarkdown(job, t, format);
    expect(md.startsWith("# Développeur·se Full Stack Junior\n")).toBe(true);
    expect(md).toContain("- **Entreprise :** Acme");
    expect(md).toContain("- **Lieu :** Montréal, CA");
    expect(md).toContain("(Montréal, QC)");
    expect(md).toContain("- **Salaire :** 70 000 $ – 85 000 $");
    expect(md).toContain("- **Domaines :** web, backend");
    expect(md).toContain("- **New grad :** oui");
    expect(md).toContain("- **Postuler :** https://acme.example/apply/1");
    expect(md).toContain("- **Offre d'origine :** https://board.example/jobs/1");
    expect(md).toContain("## Description\n\n### Le rôle");
    expect(md).not.toContain("Marie");
    expect(md).not.toContain("87");
  });

  it("falls back to plain text, and skips missing facts", () => {
    const md = jobToMarkdown(
      {
        ...job,
        description: null,
        description_text: "Texte brut.\nLigne 2.",
        apply_url: null,
        salary: null,
      },
      t,
      format,
    );
    expect(md).toContain("## Description\n\nTexte brut.\nLigne 2.");
    expect(md).toContain("- **Postuler :** https://board.example/jobs/1");
    expect(md).not.toContain("Offre d'origine");
    expect(md).not.toContain("Salaire");
  });
});
