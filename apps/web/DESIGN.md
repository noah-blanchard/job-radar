---
name: JobRadar
description: Relevé, a registrar's ledger for triaging new-grad job offers by keyboard.
colors:
  registrar-ink: "#10161d"
  reading-surface: "#141c24"
  raised-ground: "#182630"
  raised-hover: "#131d26"
  field-ground: "#121a22"
  card-ground: "#131b23"
  security-paper-rail: "#13201c"
  rail-active: "#1c2f28"
  rail-hover: "#182a23"
  rail-border: "#1e3029"
  hairline: "#24303a"
  hairline-soft: "#1a242d"
  control-stroke: "#2a3742"
  control-stroke-hover: "#384754"
  control-ground: "#1b2730"
  control-ground-hover: "#223039"
  paper-white: "#e8e3d4"
  metadata-grey: "#a0aaa2"
  ledger-green: "#8fc7a0"
  ledger-green-ink: "#0d1912"
  ledger-green-2: "#6ead84"
  ledger-green-3: "#4f8d66"
  ledger-green-4: "#3b6e4f"
  ledger-track: "#1e2a33"
  chart-green-hover: "#a9dbb7"
  due-amber: "#e3b45c"
  penalty-red: "#e8735f"
  saved-blue: "#7aa5e0"
  ignored-grey: "#808b83"
typography:
  display:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\", \"cv11\""
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
  rail: "208px"
  ledger: "72px"
components:
  button-primary:
    backgroundColor: "{colors.ledger-green}"
    textColor: "{colors.ledger-green-ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-outline-hover:
    backgroundColor: "{colors.control-ground}"
  button-secondary:
    backgroundColor: "{colors.control-ground}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.control-ground-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.metadata-grey}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.control-ground}"
    textColor: "{colors.paper-white}"
  button-destructive:
    backgroundColor: "transparent"
    textColor: "{colors.penalty-red}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  input:
    backgroundColor: "{colors.field-ground}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  input-focus:
    backgroundColor: "{colors.registrar-ink}"
  badge:
    backgroundColor: "{colors.control-ground}"
    textColor: "{colors.paper-white}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  segmented-on:
    backgroundColor: "{colors.raised-ground}"
    textColor: "{colors.paper-white}"
    height: "32px"
  segmented-off:
    backgroundColor: "transparent"
    textColor: "{colors.metadata-grey}"
    height: "32px"
  kbd:
    backgroundColor: "transparent"
    textColor: "{colors.metadata-grey}"
    rounded: "{rounded.key}"
    height: "18px"
    padding: "0 4px"
  rail-link:
    backgroundColor: "transparent"
    textColor: "{colors.metadata-grey}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  rail-link-active:
    backgroundColor: "{colors.rail-active}"
    textColor: "{colors.paper-white}"
  job-row:
    backgroundColor: "{colors.registrar-ink}"
    textColor: "{colors.paper-white}"
    height: "58px"
    padding: "0 24px"
  job-row-hover:
    backgroundColor: "{colors.raised-hover}"
  job-row-selected:
    backgroundColor: "{colors.raised-ground}"
  ledger-bar:
    backgroundColor: "{colors.ledger-track}"
    rounded: "{rounded.hair}"
    width: "72px"
    height: "5px"
  pipeline-card:
    backgroundColor: "{colors.card-ground}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.md}"
    padding: "12px"
  floating-layer:
    backgroundColor: "{colors.reading-surface}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.lg}"
    padding: "12px"
  toast:
    backgroundColor: "{colors.reading-surface}"
    textColor: "{colors.paper-white}"
    rounded: "{rounded.md}"
    padding: "8px 8px 8px 12px"
---

# Design System: JobRadar

## Overview

**Creative North Star: "The Relevé"**

JobRadar reads like a university transcript or a registrar's ledger. Every offer is a record line, and its score is itemized rather than given as a bare figure: a fixed-scale ledger bar in the list that expands into the "Relevé du score" in the reading pane. The ground is registrar ink, the navigation sits on a security-paper green rail, and text is paper-white with a single metadata grey below it.

The density is that of a working instrument for one person at a desktop keyboard, phone second. Body copy is 13px, rows are 58px, and controls are 32px. Depth comes from tone and hairlines, never shadows or elevation. Status colours are flat and committed: each status has one colour that it carries everywhere it appears. Motion exists only to confirm a change of state, and every write is instant, optimistic and undoable.

The direction refuses the category default: a grey table with a coloured score pill beside a separate stats dashboard.

**Key Characteristics:**
- Dark only (`color-scheme: dark`), ink ground with a green rail.
- Two text tones, nothing in between.
- The score ledger bar: one 100-point scale, same size and baseline everywhere.
- Hairline borders for all separation, including floating layers.
- Tabular figures throughout (`tnum`, `cv11` on body).
- Keyboard-first, optimistic, undoable.

## Colors

A cold ink-and-green registrar palette with paper-white text, one green accent, and four flat status hues that each mean exactly one thing.

### Primary
- **Ledger Green** (`ledger-green`): the only accent. It marks the primary action (Postuler), selection (the 1px rule on the selected row), positive score points, active rail icons, pressed counts, the caret and the focus ring. Text placed on it uses **Ledger Green Ink**.
- **Ledger Ramp** (`ledger-green-2` to `ledger-green-4`, on `ledger-track`): the positive parts of a score, filled in breakdown order. `ledger-green-2` is also the chart fill on /stats, and `chart-green-hover` is its hover.

### Secondary (status and state roles)
- **Saved Blue** (`saved-blue`): saved status, info, and links (including links inside job descriptions).
- **Applied Green** (= `ledger-green`): applied status and success.
- **Due Amber** (`due-amber`): interview status, due follow-ups, warnings and caps.
- **Penalty Red** (`penalty-red`): rejected status, score penalties, closed offers, machine problems and errors. It was raised from #e06a55 for contrast on ink.
- **Ignored Grey** (`ignored-grey`): ignored status. It sits just below metadata grey so that ignored rows recede.
- **New** uses metadata grey and shows no pill.

### Neutral
- **Registrar Ink** (`registrar-ink`): page ground, unselected rows, and focused field ground.
- **Reading Surface** (`reading-surface`): the reading pane, popovers, dialogs and toasts.
- **Raised Ground** (`raised-ground`): the selected row, the pressed segment and the active press state.
- **Raised Hover** (`raised-hover`): the hovered row. It is solid so that overlaid row actions can inherit it.
- **Security-Paper Rail** (`security-paper-rail`), **Rail Active**, **Rail Hover** and **Rail Border**: the 208px navigation rail and the phone top bar, and nothing else.
- **Hairline** (`hairline`) and **Hairline Soft** (`hairline-soft`): section rules and row separators.
- **Control Stroke**, **Control Stroke Hover**, **Control Ground**, **Control Ground Hover** and **Field Ground**: the borders and grounds of buttons, fields, segments and keys.
- **Paper White** (`paper-white`): all primary text.
- **Metadata Grey** (`metadata-grey`): all secondary text, labels and placeholders.

### Named Rules
**The Two-Tone Rule.** Text is paper-white or metadata grey. There is no third grey, and opacity tints of text are not allowed. Job description prose is the one documented exception, mixed at 88% foreground.

**The Committed Status Rule.** Each status has one colour, used for its pill, dot, column rule and due-list label. A status colour never decorates anything that is not that status.

**The One Accent Rule.** Ledger green is the only accent. Selection, the primary action and positive points share it, which is why it stays scarce.

## Typography

**Body and Display Font:** Public Sans (via next/font, self-hosted), falling back to ui-sans-serif, system-ui and Segoe UI.
**Mono:** ui-monospace stack, used only inside job description `pre` blocks.

**Character:** One sober humanist grotesk at every size, with tabular figures on by default. Hierarchy comes from weight (400/500/600) and a small set of steps, never from a second family.

### Hierarchy
- **Display** (600, 20px, line-height 1, -0.02em): the large figures in the "Aujourd'hui" record and the stats facts. These are numbers, not prose.
- **Headline** (600, 19px in the pane and 22px on the full job page, -0.015em, balanced): the job title in the reading pane or on the page.
- **Title** (600, 15px): page titles (Aujourd'hui, Pipeline, and so on) and the score figure in ScoreMark (15px, -0.01em, line-height 1).
- **Row Title** (500, 13.5px/20px): the offer title in list rows and pipeline cards. Ignored or closed rows drop to 400 in metadata grey.
- **Body** (400, 13px/1.45): everything else. Description prose is 13.5px, relaxed, with a 72ch maximum.
- **Meta** (400, 12px/16px): company, place, age, counts and secondary actions.
- **Label** (500, 11px/16px, 0.06em, uppercase, metadata grey): the registrar's column heads, such as Machine, Notes, Relevé du score, Description, Sources, table heads and palette group heads.

### Named Rules
**The Tabular Rule.** Every figure is set tabular (`tnum` on body, plus `tabular-nums` on counts, scores and dates). Columns of numbers have to align like a ledger.

**The Column-Head Rule.** Uppercase labels head a real section or column whose content follows directly below. They are never placed above a headline as decoration.

## Layout

The shell is a 208px rail on the left (desktop, md and up). Below md it becomes a 48px top bar that keeps the two work areas (Trier, Pipeline) and moves the Machine pages into a popover. The rail lists work first (Trier, Pipeline, with counts), then a "Machine" group (Sources, Entreprises, Stats, Réglages).

On the home view, the "Aujourd'hui" record line sits at the top: a title plus large figures with labels, spaced 28px apart. A red health fact appears at the far right only when something is wrong. Below it is a bar with segmented views, search and filter controls, then a split view: the list on the left, and the reading pane on the right at minmax(420px, 520px) at lg and 560px at xl. Below lg the pane is replaced by the full job page.

The page gutter is 16px on phones and 24px from md. The pane is padded 24px by 28px. Rows are 58px on a grid of 72px (score) / flexible title / 9.5rem place / 2.5rem age. Spacing follows a 4px base, mostly 4, 6, 8, 12, 16, 24 and 28. Section stacks in the pane use 24 to 28px gaps.

The pipeline is a column grid separated by 1px soft-hairline gaps: 2 columns at md, then 3 plus a narrow fourth at xl.

## Elevation & Depth

The system is flat. There are no shadows anywhere, including on popovers, dialogs, toasts and dragged cards. Depth is tonal: ink, then raised hover, then reading surface, then raised ground. Every boundary is a 1px hairline. Floating layers are separated by a control-stroke border and, for dialogs, a 60% near-black scrim.

### Named Rules
**The Hairline Rule.** Separation is always a 1px border or a 1px gap, never a shadow, glow or blur.

**The Selection Rule.** A selected row gets the raised ground plus a 1px ledger-green rule on its left edge. Nothing else marks selection.

## Shapes

Corners are slight and consistent. The base radius is 7px (`md`), used by buttons, fields, segments, rail links and pipeline cards. Floating layers use 9px (`lg`), while badges, skeletons and toast actions use 4px (`sm`). Key caps are 4px. The ledger bar has 1px corners so that it reads as a rule rather than a pill. Status and problem dots are 6px circles. Pipeline column rules are 3px by 12px rounded ticks in the column's status colour.

## Components

### Buttons
Quiet and compact, never louder than the record.
- **Shape:** gently squared (7px), 32px tall (28px `sm`, 36px `lg`), 13px medium label, with a 16px icon and a 6px gap.
- **Primary:** ledger green with green ink. Hover mixes 12% white, and active mixes 15% black. Use it once per view, for Postuler.
- **Outline:** a transparent control-stroke border. On hover the ground becomes the control ground and the stroke lightens.
- **Secondary / Ghost:** control ground, or no ground with metadata-grey text that turns paper-white on hover.
- **Destructive:** red text with a 45% red border and a 14% red wash on hover. It is never filled.
- **Disabled:** 45% opacity. **Transition:** colours only, 120ms ease-out.

### Chips / Badges
- **Badge:** a flat tag with a tinted ground (status hue at 16%) and same-hue text, 11px medium, 4px radius. It is one shape for every status-like label.
- **StatusPill:** no ground at all, just the status colour and a 6px dot. "New" renders nothing.
- **Filter trigger:** an outlined 32px control. Its active count appears in ledger green.

### Segmented Control
A bordered group of toggle buttons with internal hairline dividers. The pressed segment takes the raised ground and paper-white text, and its count turns ledger green. Use it for views, priority and status: a handful of exclusive values that all stay visible.

### Inputs / Fields
- **Style:** 32px, control-stroke border, field ground, 10px horizontal padding, 13px. Native `select` uses the same field class.
- **Hover / Focus:** hover lightens the stroke. Focus turns the stroke ledger green at 70% and the ground to ink. Global focus-visible is a 2px green outline at 75% with a 2px offset.
- **Error:** the border turns penalty red (`aria-invalid`).

### Navigation
The rail is security-paper green with a rail-border right edge. Links are 32px rows with 13px text and 16px icons. The active link has the rail-active ground, a medium-weight label and a green icon, while inactive links are metadata grey and lighten on hover. Triage counts appear in grey and due counts in amber. A machine problem is shown as a 6px red dot. An "Aller à… Ctrl K" trigger sits under the wordmark.

### Job Row (signature)
A 58px record line on ink with a soft-hairline bottom rule. It shows ScoreMark, then the title with company and status, then place, then age. Hover takes the solid raised-hover ground. Selection follows the Selection Rule. Row actions (save, applied, ignore) are 28px ghost icon buttons that appear over the place and age columns on hover or selection on desktop, and are always visible on phones.

### Score Ledger (signature)
**ScoreMark** is a 15px semibold figure over a 72px by 5px Ledger bar, 5px apart. The bar uses a fixed 100-point scale. Positive parts fill it in breakdown order on the four-step green ramp, up to the score, and points lost to penalties follow in red at 80%. The rest is the ledger track. A score below the user's minimum dims the figure to metadata grey. In the pane, "Relevé du score" shows a 144px by 6px bar beside a 20px figure, then a three-column record (label 7.5rem / detail / signed points), each line on a soft hairline, with a total on a stronger rule. The bar is the same object at every size. Do not restyle it per surface.

### Today Record
The page's opening line: a title and Facts. Each Fact is a 20px figure followed by a grey label. A zero figure goes grey, and due figures go amber when non-zero. Facts are links or disclosure buttons with a secondary hover wash. The due-follow-ups disclosure expands into a list of rows, each with its own actions (Fait · +7 j, Reporter 2 j, Retirer).

### Pipeline Card
The only bordered container in the system. It has a card ground, a soft-hairline border, a 7px radius and 12px padding. Hover strengthens the border. Selected cards take the raised ground with a stronger border, and a dragging card drops to 40% opacity. Column heads are 13px medium with a status tick, a count, and an amber due count.

### Floating Layers
Popovers, dialogs (the command palette and the shortcut sheet) and toasts all sit on the reading surface with a control-stroke hairline. Popovers and dialogs use the 9px radius, and toasts use 7px. There is one toast at a time, bottom-right, auto-dismissed after 3s, or after 5s when it carries an action. An error toast takes a red hairline and red text. The undo action is ledger green with a `z` key cap.

### Keyboard Hint (Kbd)
An 18px outlined key cap with 11px medium grey text and a 4px radius, set in the sans face.

### Loading
Skeletons are static control-ground blocks at 70%, sized like the content they stand in for, with no shimmer. Page skeletons keep the real page title.

### Interaction Rules
- **Optimistic writes.** Status changes, follow-ups and pipeline moves apply in the UI immediately. If the server write fails, the change rolls back and an error toast says what to do.
- **Undo.** Every write pushes an undo entry. `z` (or the toast's "Annuler") reverts it.
- **Keyboard map.** Triage: `j`/`k` (or arrow keys) move, `s` saves, `a` marks applied, `x` ignores, `z` undoes, `o` opens the offer, Enter opens the job page, `e` writes a note, `f` sets the follow-up date, `/` searches. Pipeline: `j`/`k`, `h`/`l`, `1`–`4` to move a card, Enter. Everywhere: Ctrl K for the palette, `g` chords (`g t`, `g p`, `g s`, `g e`, `g x`, `g r`), and `?` for the help sheet.
- **Motion.** Fast (120ms) and standard (180ms), both on `cubic-bezier(0.22, 1, 0.36, 1)`, applied only to state changes: colour transitions, the triaged row collapsing (grid rows to 0fr plus a fade), a 150ms crossfade in the pane, and fade or 1-step slides on floating layers. Reduced motion collapses every duration to 0.01ms.

## Do's and Don'ts

### Do:
- **Do** show every score as ScoreMark or Ledger, on the fixed 72px, 100-point scale, wherever a score appears.
- **Do** keep text to paper-white and metadata grey, with tabular figures.
- **Do** separate with 1px hairlines (`hairline`, `hairline-soft`) and depth through tone (ink, raised hover, surface, raised).
- **Do** mark selection with the raised ground plus a 1px ledger-green rule.
- **Do** use one status colour per status, everywhere that status appears.
- **Do** make every write optimistic, undoable with `z`, and rolled back with an error toast on failure.
- **Do** give every new action a key and list it in the `?` sheet.
- **Do** limit motion to 120 or 180ms ease-out on state changes, and respect reduced motion.
- **Do** head sections with 11px uppercase labels only when real content follows.

### Don't:
- **Don't** use box shadows, glows or blur, on floating layers or anywhere else.
- **Don't** show a bare score number or a coloured score pill without its ledger.
- **Don't** wrap list rows or pane sections in cards. The pipeline card is the only bordered tile.
- **Don't** add a third text grey or use opacity-tinted text.
- **Don't** use a status hue for decoration, or ledger green for anything other than selection, the primary action and positive points.
- **Don't** animate on load, loop, shimmer, or move layout outside a state change.
- **Don't** add a second typeface or a system display face.
