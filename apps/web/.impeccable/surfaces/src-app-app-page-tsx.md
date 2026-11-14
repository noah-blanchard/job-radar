---
version: 1
slug: "src-app-app-page-tsx"
primary_target: "src/app/(app)/page.tsx"
related_targets: ["src/app/(app)/jobs/[id]/page.tsx","src/app/(app)/pipeline/page.tsx"]
---

# Surface brief: JobRadar workspace (Trier home, fiche, pipeline, machine pages)

Mode: Operate. One user, desktop keyboard triage first, phone second (digest link).
Job: decide fast on new offers (keep / apply / ignore), keep follow-ups moving, notice machine problems without reading logs.
Constraints: dark by default, dense, French UI, no invented data, fast on ~100k jobs, 512 MB web.

## Direction contract

THESIS: Every offer reads like a transcript line: the score is an itemized record (a ledger), never a bare number. Refuses the category default of a grey table with a coloured score pill and a separate stats dashboard.

OWN-WORLD: Two registrar inks, chosen in Réglages: Encre bleue (default; accent #2f5fd0 on paper, #7ea6ff on ink) and Encre violette (#5b3fd0 / #a693ff), each in light and dark (Auto follows the device). Cool paper or ink grounds, a rail one step tinted toward the ink, paper/ink text in two tones only. Flat committed status colours that never share the ink's hue (saved violet in bleu, blue in violet; applied green, interview/due amber, rejected red). Public Sans, tabular figures, hairline rules, no shadows or blur, small uppercase section labels. (Replaces the original green security-paper palette at the user's request.)
Raises: fixed registration (botanical folio), fixed ramp carries importance (star atlas), flat committed status colours (garden map), next offer already loaded (vertical feed), two-tone text (datamatics).

STORY: You open the app and read the day as one record line: what's left to triage, which follow-ups are due, interviews, and machine problems only when they exist. You go through the queue by keyboard. The pane shows why each score is what it is. Every action is instant and can be undone.

FIRST VIEWPORT: 208 px green rail (Trier/Pipeline with counts, then Machine group). The top row is the "Aujourd'hui" record: large figures with labels, and a red health fact at the far right only when something's wrong. Then a bar holding segmented views, search and filter chips. Below it, the list (score + 72 px ledger bar, title/company, place, age) with the reading pane on the right (520 px at lg, 560 px at xl): title, action row (Postuler primary, follow-up date, status control), the "Relevé du score" ledger lines with a total, notes, then the description. Selection = raised ground + a 1 px green rule. Floating layers (popover, dialog, toast) use hairlines, never shadows.

FORM: Relevé (university transcripts and registrar ledgers), assigned candidate 4 of 7. seed:299966565959eeef. Signature move: the score ledger bar, the same scale and baseline everywhere, which expands into the itemized record in the pane.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
- None blocking. Motion grammar: 120–180 ms ease-out on state changes only; the row collapse on triage; the pane crossfade.
