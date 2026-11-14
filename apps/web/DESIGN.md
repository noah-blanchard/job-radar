---
name: JobRadar
description: Relevé, a registrar's ledger for triaging new-grad job offers by keyboard, in two inks, light or dark.
colors:
  # Keys are <ink>-<mode>-<css custom property>. One ink is active at a time (data-palette on <html>:
  # bleu, the default, or violet) and one mode (.dark on <html>). Every block defines the same roles;
  # components bind to the role through its custom property, so they resolve per ink and mode.
  # Encre bleue, clair
  bleu-light-background: "#f7f8fa"
  bleu-light-surface: "#ffffff"
  bleu-light-raised: "#e8eef9"
  bleu-light-raised-hover: "#f0f3f8"
  bleu-light-rail: "#eef1f6"
  bleu-light-rail-active: "#dfe6f2"
  bleu-light-rail-hover: "#e6ebf3"
  bleu-light-rail-border: "#dfe4ec"
  bleu-light-border: "#dde2ea"
  bleu-light-border-soft: "#e9ecf1"
  bleu-light-foreground: "#161b23"
  bleu-light-muted-foreground: "#5b6574"
  bleu-light-primary: "#2f5fd0"
  bleu-light-primary-foreground: "#ffffff"
  bleu-light-secondary: "#eef1f5"
  bleu-light-secondary-hover: "#e4e8ee"
  bleu-light-input: "#cfd6e0"
  bleu-light-input-hover: "#b9c2cf"
  bleu-light-field: "#ffffff"
  bleu-light-card-ground: "#ffffff"
  bleu-light-drop: "#e9eff9"
  bleu-light-overlay: "rgb(15 20 30 / 0.35)"
  bleu-light-code: "#f1f3f6"
  bleu-light-mark: "#8c98aa"
  bleu-light-scrollbar: "#c9d0da"
  bleu-light-st-saved: "#6d4fd6"
  bleu-light-st-applied: "#1d8a5c"
  bleu-light-st-interview: "#a8670f"
  bleu-light-st-rejected: "#c23b2a"
  bleu-light-st-ignored: "#6b7380"
  bleu-light-ledger-1: "#2f5fd0"
  bleu-light-ledger-2: "#4f7be0"
  bleu-light-ledger-3: "#7598ea"
  bleu-light-ledger-4: "#9fb7f1"
  bleu-light-ledger-track: "#e2e7ef"
  bleu-light-chart-1-hover: "#2f5fd0"
  # Encre bleue, sombre
  bleu-dark-background: "#0f141b"
  bleu-dark-surface: "#131a23"
  bleu-dark-raised: "#18222e"
  bleu-dark-raised-hover: "#141b25"
  bleu-dark-rail: "#121a24"
  bleu-dark-rail-active: "#1a2636"
  bleu-dark-rail-hover: "#16202c"
  bleu-dark-rail-border: "#1c2633"
  bleu-dark-border: "#232d3a"
  bleu-dark-border-soft: "#19222d"
  bleu-dark-foreground: "#e6e9ee"
  bleu-dark-muted-foreground: "#9aa4b2"
  bleu-dark-primary: "#7ea6ff"
  bleu-dark-primary-foreground: "#0b1220"
  bleu-dark-secondary: "#1a2330"
  bleu-dark-secondary-hover: "#212c3a"
  bleu-dark-input: "#2b3645"
  bleu-dark-input-hover: "#3a4657"
  bleu-dark-field: "#121922"
  bleu-dark-card-ground: "#131a24"
  bleu-dark-drop: "#152030"
  bleu-dark-overlay: "rgb(4 7 12 / 0.6)"
  bleu-dark-code: "#0b1016"
  bleu-dark-mark: "#6d7f99"
  bleu-dark-scrollbar: "#2b3645"
  bleu-dark-st-saved: "#b29cff"
  bleu-dark-st-applied: "#5fc59a"
  bleu-dark-st-interview: "#e6b45a"
  bleu-dark-st-rejected: "#ef7a68"
  bleu-dark-st-ignored: "#7d8796"
  bleu-dark-ledger-1: "#7ea6ff"
  bleu-dark-ledger-2: "#5f8be8"
  bleu-dark-ledger-3: "#4670c9"
  bleu-dark-ledger-4: "#3459a6"
  bleu-dark-ledger-track: "#1e2733"
  bleu-dark-chart-1-hover: "#a9c3ff"
  # Encre violette, clair
  violet-light-background: "#f8f7fb"
  violet-light-surface: "#ffffff"
  violet-light-raised: "#ece8fa"
  violet-light-raised-hover: "#f2f0f8"
  violet-light-rail: "#f0eef8"
  violet-light-rail-active: "#e4dff7"
  violet-light-rail-hover: "#e9e5f6"
  violet-light-rail-border: "#e3dff0"
  violet-light-border: "#e0dcea"
  violet-light-border-soft: "#ebe8f2"
  violet-light-foreground: "#1a1724"
  violet-light-muted-foreground: "#615b74"
  violet-light-primary: "#5b3fd0"
  violet-light-primary-foreground: "#ffffff"
  violet-light-secondary: "#f0eef6"
  violet-light-secondary-hover: "#e7e3f0"
  violet-light-input: "#d2cde2"
  violet-light-input-hover: "#bdb6d3"
  violet-light-field: "#ffffff"
  violet-light-card-ground: "#ffffff"
  violet-light-drop: "#eeeafb"
  violet-light-overlay: "rgb(20 15 35 / 0.35)"
  violet-light-code: "#f3f1f8"
  violet-light-mark: "#9a93b3"
  violet-light-scrollbar: "#cfc9de"
  violet-light-st-saved: "#2a72c4"
  violet-light-st-applied: "#1d8a5c"
  violet-light-st-interview: "#a8670f"
  violet-light-st-rejected: "#c23b3b"
  violet-light-st-ignored: "#6f6a80"
  violet-light-ledger-1: "#5b3fd0"
  violet-light-ledger-2: "#7a61e0"
  violet-light-ledger-3: "#9a86ea"
  violet-light-ledger-4: "#bbaef2"
  violet-light-ledger-track: "#e6e2f2"
  violet-light-chart-1-hover: "#5b3fd0"
  # Encre violette, sombre
  violet-dark-background: "#121219"
  violet-dark-surface: "#16151f"
  violet-dark-raised: "#1d1b2b"
  violet-dark-raised-hover: "#17161f"
  violet-dark-rail: "#17162a"
  violet-dark-rail-active: "#221f3d"
  violet-dark-rail-hover: "#1c1a33"
  violet-dark-rail-border: "#211f36"
  violet-dark-border: "#29273a"
  violet-dark-border-soft: "#1e1d2a"
  violet-dark-foreground: "#e9e7f1"
  violet-dark-muted-foreground: "#a19db4"
  violet-dark-primary: "#a693ff"
  violet-dark-primary-foreground: "#120e24"
  violet-dark-secondary: "#1c1a28"
  violet-dark-secondary-hover: "#242233"
  violet-dark-input: "#332f48"
  violet-dark-input-hover: "#423d5b"
  violet-dark-field: "#15141d"
  violet-dark-card-ground: "#17161f"
  violet-dark-drop: "#1e1b30"
  violet-dark-overlay: "rgb(6 5 12 / 0.6)"
  violet-dark-code: "#0e0d14"
  violet-dark-mark: "#8a84a8"
  violet-dark-scrollbar: "#332f48"
  violet-dark-st-saved: "#6fb4f0"
  violet-dark-st-applied: "#5fc59a"
  violet-dark-st-interview: "#e6b45a"
  violet-dark-st-rejected: "#f07a7a"
  violet-dark-st-ignored: "#827d96"
  violet-dark-ledger-1: "#a693ff"
  violet-dark-ledger-2: "#8a74f0"
  violet-dark-ledger-3: "#6f58d6"
  violet-dark-ledger-4: "#5844b3"
  violet-dark-ledger-track: "#221f30"
  violet-dark-chart-1-hover: "#c4b8ff"
  # Palette identity swatches (each ink's dark-mode ledger-3), shown in Réglages > Apparence
  identity-bleu: "#4670c9"
  identity-violet: "#6f58d6"
typography:
  display:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\", \"cv11\""
  headline-page:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.375
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.45
  row-title:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
    lineHeight: "20px"
  body:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"tnum\", \"cv11\""
  meta:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  label:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0.06em"
rounded:
  hair: "1px"
  key: "4px"
  sm: "4px"
  md: "7px"
  lg: "9px"
  dot: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  gutter: "24px"
  pane: "28px"
  row: "58px"
  control: "32px"
  control-sm: "28px"
  bar: "44px"
  rail: "208px"
  ledger: "72px"
  pane-default: "520px"
  pane-min: "360px"
  list-min: "380px"
components:
  button-primary:
    backgroundColor: "{colors.bleu-light-primary}"
    textColor: "{colors.bleu-light-primary-foreground}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.bleu-light-foreground}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-outline-hover:
    backgroundColor: "{colors.bleu-light-secondary}"
  button-secondary:
    backgroundColor: "{colors.bleu-light-secondary}"
    textColor: "{colors.bleu-light-foreground}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.bleu-light-secondary-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.bleu-light-muted-foreground}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.bleu-light-secondary}"
    textColor: "{colors.bleu-light-foreground}"
  button-destructive:
    backgroundColor: "transparent"
    textColor: "{colors.bleu-light-st-rejected}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  input:
    backgroundColor: "{colors.bleu-light-field}"
    textColor: "{colors.bleu-light-foreground}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  input-focus:
    backgroundColor: "{colors.bleu-light-background}"
  badge:
    backgroundColor: "{colors.bleu-light-secondary}"
    textColor: "{colors.bleu-light-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  segmented-on:
    backgroundColor: "{colors.bleu-light-raised}"
    textColor: "{colors.bleu-light-foreground}"
    height: "32px"
  segmented-off:
    backgroundColor: "transparent"
    textColor: "{colors.bleu-light-muted-foreground}"
    height: "32px"
  ink-choice:
    backgroundColor: "transparent"
    textColor: "{colors.bleu-light-muted-foreground}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  ink-choice-on:
    textColor: "{colors.bleu-light-foreground}"
  kbd:
    backgroundColor: "transparent"
    textColor: "{colors.bleu-light-muted-foreground}"
    rounded: "{rounded.key}"
    height: "18px"
    padding: "0 4px"
  rail-link:
    backgroundColor: "transparent"
    textColor: "{colors.bleu-light-muted-foreground}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  rail-link-hover:
    backgroundColor: "{colors.bleu-light-rail-hover}"
    textColor: "{colors.bleu-light-foreground}"
  rail-link-active:
    backgroundColor: "{colors.bleu-light-rail-active}"
    textColor: "{colors.bleu-light-foreground}"
  job-row:
    backgroundColor: "{colors.bleu-light-background}"
    textColor: "{colors.bleu-light-foreground}"
    height: "58px"
    padding: "0 24px"
  job-row-hover:
    backgroundColor: "{colors.bleu-light-raised-hover}"
  job-row-selected:
    backgroundColor: "{colors.bleu-light-raised}"
  ledger-bar:
    backgroundColor: "{colors.bleu-light-ledger-track}"
    rounded: "{rounded.hair}"
    width: "72px"
    height: "5px"
  list-footer:
    backgroundColor: "{colors.bleu-light-background}"
    textColor: "{colors.bleu-light-muted-foreground}"
    height: "44px"
    padding: "0 24px"
  pane-bar:
    backgroundColor: "{colors.bleu-light-surface}"
    textColor: "{colors.bleu-light-muted-foreground}"
    height: "44px"
    padding: "0 28px"
  pipeline-card:
    backgroundColor: "{colors.bleu-light-card-ground}"
    textColor: "{colors.bleu-light-foreground}"
    rounded: "{rounded.md}"
    padding: "12px"
  floating-layer:
    backgroundColor: "{colors.bleu-light-surface}"
    textColor: "{colors.bleu-light-foreground}"
    rounded: "{rounded.lg}"
    padding: "12px"
  toast:
    backgroundColor: "{colors.bleu-light-surface}"
    textColor: "{colors.bleu-light-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 8px 8px 12px"
---

# Design System: JobRadar

## Overview

**Creative North Star: "The Relevé"**

JobRadar reads like a university transcript or a registrar's ledger. Every offer is a record line, and its score is itemized rather than given as a bare figure: a fixed-scale ledger bar in the list that expands into the "Relevé du score" in the reading pane. The record is written in one of two inks, Encre bleue (the default) or Encre violette, on paper by day or on ink by night. Text is one record tone with a single metadata tone below it.

The density is that of a working instrument for one person at a desktop keyboard, phone second. Body copy is 13px, rows are 58px, and controls are 32px. From md up the app is the viewport: the rail stays put and each work area scrolls on its own, so the list, the reading pane and their footers never leave the screen. Depth comes from tone and hairlines, never shadows or elevation. Status colours are flat and committed, and they never share the ink's hue. Motion exists only to confirm a change of state, and every write is instant, optimistic and undoable.

The direction refuses the category default: a grey table with a coloured score pill beside a separate stats dashboard.

**Key Characteristics:**
- Two inks (`data-palette`: bleu, violet), each with a light and a dark mode (`.dark`); mode is Auto, Clair or Sombre.
- One accent per ink; the ledger ramp starts at it and fades toward the ground.
- Two text tones, nothing in between.
- The score ledger bar: one 100-point scale, same size and baseline everywhere.
- Hairline borders for all separation, including floating layers.
- Tabular figures throughout (`tnum`, `cv11` on body).
- The viewport is the app from md up; work areas scroll independently.
- Keyboard-first, optimistic, undoable.

## Colors

Two inks over cool paper and night ink. Each ink defines the same roles in the same order for light and dark, so a component written once renders correctly in all four. The frontmatter keys are `<ink>-<mode>-<role>`; the role name is the CSS custom property in `src/app/globals.css`.

### Primary
- **Ink Accent** (`primary`): the only accent. Encre bleue is a deep registry blue on paper and a bright periwinkle on ink; Encre violette is a stamp violet on paper and a soft lavender on ink. It marks the primary action (Postuler), selection (the 1px rule on the selected row), positive score points (`--positive` is the accent), active rail icons, pressed counts, links (`--info` is the accent), the undo action, the caret, the text-selection wash (32%), the focus ring (75%), the radar needle, and the divider handle while it is hovered or dragged. Text placed on it uses **Text on Accent** (`primary-foreground`).
- **Ledger Ramp** (`ledger-1` to `ledger-4`, on `ledger-track`): the positive parts of a score, filled in breakdown order. `ledger-1` is the accent itself; each step moves toward the ground (lighter on paper, darker on ink). `ledger-2` is also the chart fill on /stats (`chart-1`), and `chart-1-hover` is its hover.
- **Identity Swatches** (`identity-bleu`, `identity-violet`): each ink's dark-mode `ledger-3`, shown as the 12px dot on the ink choice in Réglages > Apparence. They name an ink; they are not used for anything else.

### Secondary (status and state roles)
- **Saved** (`st-saved`): saved status. It is violet in Encre bleue and blue in Encre violette, so it never reads as the accent.
- **Applied Green** (`st-applied`): applied status, success and the new-grad mark. Same in both inks.
- **Due Amber** (`st-interview`): interview status, due follow-ups, warnings and caps. Same in both inks.
- **Penalty Red** (`st-rejected`): rejected status, score penalties, closed offers, machine problems and errors.
- **Ignored Grey** (`st-ignored`): ignored status. It sits just below metadata text so that ignored rows recede.
- **New** uses metadata text and shows no pill.

### Neutral
- **Page Ground** (`background`): page ground, unselected rows, the list footer and focused field ground.
- **Reading Surface** (`surface`): the reading pane, its pinned bar, popovers, dialogs and toasts.
- **Raised Ground** (`raised`): the selected row, the pressed segment and the active press state.
- **Raised Hover** (`raised-hover`): the hovered row. It is solid so that overlaid row actions can inherit it.
- **Rail**, **Rail Active**, **Rail Hover** and **Rail Border**: the 208px navigation rail and the phone top bar, tinted toward the ink, and nothing else.
- **Hairline** (`border`) and **Hairline Soft** (`border-soft`): section rules, row separators, the list/pane divider and pipeline gaps.
- **Control Stroke** (`input`), **Control Stroke Hover** (`input-hover`), **Control Ground** (`secondary`), **Control Ground Hover** (`secondary-hover`) and **Field Ground** (`field`): the borders and grounds of buttons, fields, segments and keys.
- **Card Ground** (`card-ground`) and **Drop Target** (`drop`): pipeline cards and the column a card is dragged over.
- **Scrim** (`overlay`): behind dialogs, ink-tinted, 35% on paper and 60% on ink.
- **Code Ground** (`code`): raw payload blocks in Réglages. **Radar Rings** (`mark`): the wordmark's rings. **Scrollbar Thumb** (`scrollbar`).
- **Record Text** (`foreground`): all primary text.
- **Metadata Text** (`muted-foreground`): all secondary text, labels and placeholders.

### Named Rules
**The Two-Tone Rule.** Text is record text or metadata text. There is no third grey, and opacity tints of text are not allowed. Job description prose is the one documented exception, mixed at 88% foreground into the ground.

**The Committed Status Rule.** Each status has one colour, used for its pill, dot, column rule and due-list label. A status colour never decorates anything that is not that status.

**The Ink-Apart Rule.** No status colour shares the active ink's hue. When an ink changes, the status that would collide with it (saved) moves to the other side.

**The One Accent Rule.** The ink accent is the only accent. Selection, the primary action, positive points and links share it, which is why it stays scarce.

**The Same-Roles Rule.** Every ink and mode defines every role. New colours are added as a role in all four blocks, never as a literal in a component.

## Typography

**Body and Display Font:** Public Sans (via next/font, self-hosted), falling back to ui-sans-serif, system-ui and Segoe UI.
**Mono:** ui-monospace stack, used only inside job description `pre` blocks and raw payloads.

**Character:** One sober humanist grotesk at every size, with tabular figures on by default. Hierarchy comes from weight (400/500/600) and a small set of steps, never from a second family.

### Hierarchy
- **Display** (600, 20px, line-height 1, -0.02em): the large figures in the "Aujourd'hui" record and the stats facts. These are numbers, not prose.
- **Headline Page** (600, 20px, line-height 1.25, -0.015em, balanced): the job title on the full job page.
- **Headline** (600, 19px, line-height 1.375, -0.015em, balanced): the job title in the reading pane and its loading state.
- **Title** (600, 15px): page titles (Aujourd'hui, Pipeline, and so on) and the score figure in ScoreMark (15px, -0.01em, line-height 1).
- **Row Title** (500, 13.5px/20px): the offer title in list rows and pipeline cards. Ignored or closed rows drop to 400 in metadata text.
- **Body** (400, 13px/1.45): everything else. Description prose is 13.5px, relaxed, with a 72ch maximum.
- **Meta** (400, 12px/16px): company, place, age, counts, the list footer and secondary actions.
- **Label** (500, 11px/16px, 0.06em, uppercase, metadata text): the registrar's column heads, such as Machine, Notes, Relevé du score, Description, Sources, table heads and palette group heads.

### Named Rules
**The Tabular Rule.** Every figure is set tabular (`tnum` on body, plus `tabular-nums` on counts, scores and dates). Columns of numbers have to align like a ledger.

**The Column-Head Rule.** Uppercase labels head a real section or column whose content follows directly below. They are never placed above a headline as decoration.

## Layout

**Shell.** From md (768px) up, the app is the viewport (`h-dvh`, overflow hidden): the 208px rail is fixed on the left and each page is a frame of fixed header rows over one or more scroll areas of its own (`PageFrame`, `PageScroll`). Below md the rail becomes a 48px sticky top bar that keeps the two work areas (Trier, Pipeline) and moves the Machine pages, the mode toggle and logout into a popover; phones keep the natural page scroll. The rail lists work first (Trier, Pipeline, with counts), then a "Machine" group (Sources, Entreprises, Stats, Réglages), with the mode toggle and logout pinned to its foot.

**Trier.** The "Aujourd'hui" record line sits at the top: a title plus large figures with labels, spaced 28px apart, and a red health fact at the far right only when something is wrong. Below it is a bar with segmented views, search and filter controls, then the split view. At lg (1024px) the grid is list / 1px divider / pane, with the pane at `--pane-w` (default 520px). The list and the pane scroll independently. Under the list, a 44px footer stays fixed: the offer count (and how many are loaded) on the left, the Score / Récentes sort on the right, and between them a 32px accent tick that appears while a page is loading. The list loads more as it nears its end (infinite scroll; there is no pagination) and ends with "Fin de la liste." On top of the pane, a 44px pinned bar carries the `j`/`k` hint and an "Ouvrir en grand (↵)" outline button. Below lg the pane is replaced by the full job page.

**Divider.** The list/pane boundary is a draggable separator: a 1px hairline with an 11px hit area that shows a 1px accent line on hover, focus or drag. The pane is never narrower than 360px and the list never narrower than 380px. Arrow keys move it by 24px (80px with Shift), double-click resets it to 520px, and the width is remembered per browser.

**Rhythm.** The page gutter is 16px on phones and 24px from md. The pane is padded 20px by 28px. Rows are 58px on a grid of 72px (score) / flexible title / 9.5rem place / 2.5rem age. Spacing follows a 4px base, mostly 4, 6, 8, 12, 16, 24 and 28. Section stacks in the pane use 24 to 28px gaps.

**Pipeline.** A column grid separated by 1px soft-hairline gaps that fills the viewport from md, each column scrolling on its own: 2 columns at md, then 3 plus a narrow fourth at xl (1280px).

## Elevation & Depth

The system is flat. There are no shadows anywhere, including on popovers, dialogs, toasts and dragged cards. Depth is tonal: ground, then raised hover, then reading surface, then raised ground, in every ink and mode. Every boundary is a 1px hairline. Floating layers are separated by a control-stroke border and, for dialogs, the ink-tinted scrim.

### Named Rules
**The Hairline Rule.** Separation is always a 1px border or a 1px gap, never a shadow, glow or blur.

**The Selection Rule.** A selected row gets the raised ground plus a 1px accent rule on its left edge. Nothing else marks selection.

## Shapes

Corners are slight and consistent. The base radius is 7px (`md`), used by buttons, fields, segments, rail links, ink choices and pipeline cards. Floating layers use 9px (`lg`), while badges, skeletons and toast actions use 4px (`sm`). Key caps are 4px. The ledger bar has 1px corners so that it reads as a rule rather than a pill. Status and problem dots are 6px circles, and ink identity swatches are 12px circles. Pipeline column rules are 3px by 12px rounded ticks in the column's status colour.

## Components

### Buttons
Quiet and compact, never louder than the record.
- **Shape:** gently squared (7px), 32px tall (28px `sm`, 36px `lg`), 13px medium label, with a 16px icon and a 6px gap.
- **Primary:** the ink accent with text on accent. Hover mixes 12% white, and active mixes 15% black. Use it once per view, for Postuler.
- **Outline:** a transparent control-stroke border. On hover the ground becomes the control ground and the stroke darkens or lightens toward the text.
- **Secondary / Ghost:** control ground, or no ground with metadata text that turns to record text on hover.
- **Destructive:** red text with a 45% red border and a 14% red wash on hover. It is never filled.
- **Link:** accent text, underlined on hover.
- **Disabled:** 45% opacity. **Transition:** colours only, 120ms ease-out.

### Chips / Badges
- **Badge:** a flat tag with a tinted ground (status hue at 16%) and same-hue text, 11px medium, 4px radius. It is one shape for every status-like label.
- **StatusPill:** no ground at all, just the status colour and a 6px dot. "New" renders nothing.
- **Filter trigger:** an outlined 32px control. Its active count appears in the accent.

### Segmented Control
A bordered group of toggle buttons with internal hairline dividers. The pressed segment takes the raised ground and record text, and its count turns to the accent. Use it for views, priority, status, sort and mode: a handful of exclusive values that all stay visible.

### Inputs / Fields
- **Style:** 32px, control-stroke border, field ground, 10px horizontal padding, 13px. Native `select` uses the same field class.
- **Hover / Focus:** hover strengthens the stroke. Focus turns the stroke to the accent at 70% and the ground to the page ground. Global focus-visible is a 2px accent outline at 75% with a 2px offset.
- **Error:** the border turns penalty red (`aria-invalid`).

### Navigation
The rail sits on the ink-tinted rail ground with a rail-border right edge. Links are 32px rows with 13px text and 16px icons. The active link has the rail-active ground, a medium-weight label and an accent icon, while inactive links are metadata text and turn to record text on the rail-hover ground. Triage counts appear in metadata text and due counts in amber. A machine problem is shown as a 6px red dot. An "Aller à… Ctrl K" trigger sits under the wordmark. The wordmark's radar rings use `mark` and its needle the accent.

### Appearance
Réglages > Apparence holds the two choices. **Couleur** is two outlined 32px buttons, each with its 12px identity swatch and its name (Encre bleue, Encre violette); the chosen one takes an accent border and record text. **Mode** is a segmented control: Auto, Clair, Sombre. Auto follows the device and keeps following it while the page is open. The choice is stored in two cookies (`jr-palette`, `jr-mode`) so the server renders `data-palette` and `.dark` on `<html>`, and an inline script resolves Auto before paint, so there is no flash. In the rail, a ghost row at the foot cycles Auto → Clair → Sombre with a monitor, sun or moon icon.

### Job Row (signature)
A 58px record line on the page ground with a soft-hairline bottom rule. It shows ScoreMark, then the title with company and status, then place, then age. Hover takes the solid raised-hover ground. Selection follows the Selection Rule. Row actions (save, applied, ignore) are 28px ghost icon buttons that appear over the place and age columns on hover or selection on desktop, and are always visible on phones.

### Score Ledger (signature)
**ScoreMark** is a 15px semibold figure over a 72px by 5px Ledger bar, 5px apart. The bar uses a fixed 100-point scale. Positive parts fill it in breakdown order on the four-step ink ramp, up to the score, and points lost to penalties follow in red at 80%. The rest is the ledger track. A score below the user's minimum dims the figure to metadata text. In the pane, "Relevé du score" shows a 144px by 6px bar beside a 20px figure, then a three-column record (label 7.5rem / detail / signed points, positive points in `--positive`, penalties in red), each line on a soft hairline, with a total on a stronger rule. The bar is the same object at every size. Do not restyle it per surface.

### Today Record
The page's opening line: a title and Facts. Each Fact is a 20px figure followed by a label in metadata text. A zero figure goes to metadata text, and due figures go amber when non-zero. Facts are links or disclosure buttons with a control-ground hover wash. The due-follow-ups disclosure expands into a list of rows, each with its own actions (Fait · +7 j, Reporter 2 j, Retirer).

### Pipeline Card
The only bordered container in the system. It has a card ground, a soft-hairline border, a 7px radius and 12px padding. Hover strengthens the border. Selected cards take the raised ground with a stronger border, and a dragging card drops to 40% opacity over a column on the drop ground. Column heads are 13px medium with a status tick, a count, and an amber due count.

### Floating Layers
Popovers, dialogs (the command palette and the shortcut sheet) and toasts all sit on the reading surface with a control-stroke hairline. Popovers and dialogs use the 9px radius, and toasts use 7px. There is one toast at a time, bottom-right, auto-dismissed after 3s, or after 5s when it carries an action. An error toast takes a red hairline and red text. The undo action is in the accent with a `z` key cap.

### Keyboard Hint (Kbd)
An 18px outlined key cap with 11px medium metadata text and a 4px radius, set in the sans face.

### Loading
Skeletons are static control-ground blocks at 70%, sized like the content they stand in for, with no shimmer. Page skeletons keep the real page title, and the pane skeleton keeps the known title and company.

### Interaction Rules
- **Optimistic writes.** Status changes, follow-ups and pipeline moves apply in the UI immediately. If the server write fails, the change rolls back and an error toast says what to do.
- **Undo.** Every write pushes an undo entry. `z` (or the toast's "Annuler") reverts it.
- **Keyboard map.** Triage: `j`/`k` (or arrow keys) move, `s` saves, `a` marks applied, `x` ignores, `z` undoes, `o` opens the offer, Enter opens the job page, `e` writes a note, `f` sets the follow-up date, `/` searches. Pipeline: `j`/`k`, `h`/`l`, `1`–`4` to move a card, Enter. Everywhere: Ctrl K for the palette, `g` chords (`g t`, `g p`, `g s`, `g e`, `g x`, `g r`), and `?` for the help sheet. The divider takes ←/→.
- **Motion.** Fast (120ms) and standard (180ms), both on `cubic-bezier(0.22, 1, 0.36, 1)`, applied only to state changes: colour transitions, the triaged row collapsing (grid rows to 0fr plus a fade), a 150ms crossfade in the pane, the list dimming to 55% while a filter applies, and fade or 1-step slides on floating layers. Reduced motion collapses every duration to 0.01ms.

## Do's and Don'ts

### Do:
- **Do** show every score as ScoreMark or Ledger, on the fixed 72px, 100-point scale, wherever a score appears.
- **Do** keep text to record text and metadata text, with tabular figures.
- **Do** use colour only through role custom properties, defined in all four ink/mode blocks.
- **Do** separate with 1px hairlines (`border`, `border-soft`) and depth through tone (ground, raised hover, surface, raised).
- **Do** mark selection with the raised ground plus a 1px accent rule.
- **Do** use one status colour per status, everywhere that status appears, on a hue apart from the ink.
- **Do** give each work area its own scroll from md up, with its header and footer rows fixed.
- **Do** make every write optimistic, undoable with `z`, and rolled back with an error toast on failure.
- **Do** give every new action a key and list it in the `?` sheet.
- **Do** limit motion to 120 or 180ms ease-out on state changes, and respect reduced motion.
- **Do** head sections with 11px uppercase labels only when real content follows.

### Don't:
- **Don't** use box shadows, glows or blur, on floating layers or anywhere else.
- **Don't** show a bare score number or a coloured score pill without its ledger.
- **Don't** wrap list rows or pane sections in cards. The pipeline card is the only bordered tile.
- **Don't** add a third text tone or use opacity-tinted text.
- **Don't** use a status hue for decoration, or the accent for anything other than selection, the primary action, positive points, links and focus.
- **Don't** hard-code a hex in a component; the identity swatches in Apparence are the one exception.
- **Don't** add pagination to the triage list; it loads as you scroll.
- **Don't** animate on load, loop, shimmer, or move layout outside a state change.
- **Don't** add a second typeface or a system display face.
