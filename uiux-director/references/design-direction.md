# Design Direction

Use this in `discover` to turn a confirmed brief into a direction the PM can see and choose, and in `build` and `review` to read what was chosen. The result is `DESIGN_DIRECTION.md`, created from [../assets/DESIGN_DIRECTION.template.md](../assets/DESIGN_DIRECTION.template.md). `anti-ai-style` treats this file as the product's recorded Design Direction.

## Where Answers Come From

In this order of preference:

1. The audience and core tasks in `PRODUCT_BRIEF.md`.
2. Design evidence: the brand guide, the logo, Figma, the existing product as rendered, existing tokens.
3. Platform conventions (iOS, Android, the web) and domain conventions from the research.
4. Taste, last, and only with a stated reason.

A choice justified only by appearance words ("modern", "premium", "clean", "fresh") is a default with a reason attached afterward. Re-derive it from 1–3.

## The Eight Decisions

The decisions and their order come from `anti-ai-style/references/decisions.md`; each one constrains the next. Write each as one sentence that names its source or audience reason.

| # | Decision | The question | Recorded in `DESIGN_DIRECTION.md` |
| --- | --- | --- | --- |
| 1 | Genre | What kind of screens are these, and what does the user do on them? | Design Decisions |
| 2 | Content | Which real objects appear, how many, and what are the longest and emptiest cases? | Design Decisions |
| 3 | Hierarchy | What does the eye land on first on the core-task screen, and what second? | Design Decisions |
| 4 | Density | How much must be visible at once, and how much breathing room does this audience need? | Density Profile |
| 5 | Type | Which families, which typescale roles, which roles get weight? | Token Plan › Typescale |
| 6 | Color roles | What is each color for; where does the accent appear and where never? | Token Plan › Key Colors, System Color Roles, Extension Roles |
| 7 | Surface | How are regions, sections, and items separated; what is elevated? | Token Plan › Surface And Elevation |
| 8 | Motion | Which changes need explaining with motion? | Token Plan › Motion |

Finish with Not Doing: the two or three defaults most tempting for this product, named in advance so they do not arrive unannounced.

## Density Profile: Breathing Room

Breathing room is not "more whitespace". `anti-ai-style` lists inflated whitespace as a generic AI-look tell. Breathing room is spacing that fits how this audience reads and acts, written as numbers so the next agent can apply and check it.

### 1. Read the audience signals

| Signal in the brief | Points toward |
| --- | --- |
| Comparing many items at once; expert users; daily or intraday use; pointer and keyboard | compact |
| Mixed tasks; regular users; a mix of reading and acting | regular |
| Reading and deciding calmly; infrequent use; novices or older users; touch input; anxious or high-stakes decisions | spacious |

When signals conflict, the core task decides: the density that makes the most frequent core task easiest wins. Different regions can differ (a compact table inside a regular page) when the direction says so.

### 2. Choose the level and fill the values

Start from the per-level table in [md3-token-method.md](md3-token-method.md) › Density And Layout, then fill every row of the Density Profile:

| Value | What to decide | Material Design 3 term |
| --- | --- | --- |
| Spacing scale | The base unit and the ladder steps in use | spacing ladder labels |
| Gap between related elements | Space inside a group: label and value, rows of one list | `gap-stack-*` / `gap-inline-*` |
| Gap between sections | Space between groups | ladder label, e.g. `2xl` |
| Body text size / line height | The size most text is read at | typescale role |
| Maximum content width | Where line length or table width stops growing | — |
| Primary items visible in first viewport | The count with real content at the target viewport | — |
| Component height density | Default or tighter controls and rows | M3 density scale `0` to `-3` |
| Layout margins | Outer margins per window size class | window size class margins |

Every row carries an audience or task reason.

### 3. Check with real content

- **Squint.** One element leads on the core-task screen, one follows.
- **Edge content.** The longest name, a zero, an empty list, an error all keep the layout intact.
- **First viewport.** Count the primary items with real content at the target size. If the count misses the target, change density, not font size alone.

### Rejection rule

When a value's only reason is an appearance word ("more whitespace feels premium", "tighter looks professional"), replace the reason with an audience or task reason, or change the value.

### Examples

Professional traders and retired investors need opposite densities for the same kind of product:

| Field | Professional traders (compact) | Retired investors checking weekly (spacious) |
| --- | --- | --- |
| Reason | Scan many quotes quickly during market hours | Read calmly; larger targets and text reduce errors |
| M3 density scale | −2 | 0 |
| Gap between related elements | `gap-stack-2xs` to `gap-stack-xs` (4–8px) | `gap-stack-sm` to `gap-stack-md` (12–16px) |
| Gap between sections | `md` (16px) | `2xl` to `3xl` (32–40px) |
| Body text role | `body-medium` (14/20) | `body-large` raised to a custom step `body-large-plus` (18/28) for older readers |
| Primary items visible in first viewport | 15 or more quote rows | 5–6 holdings |
| Spacing scale | 4px base; `2xs`–`xl` | 4px base; `xs`–`3xl` |
| Maximum content width | Full width; columns grow with the window | 720px for reading areas |
| Layout margins | 16px compact window, 24px wider | 16px compact window, 24px wider |

## Candidate Directions And The Comparison Page

The PM chooses by looking, not by reading adjectives. Build `product-design/direction-comparison.html` from [../assets/direction-comparison.template.html](../assets/direction-comparison.template.html).

### Draft the candidates

1. Draft two or three candidates that differ in a way that matters to this audience, usually density and the color and type character. Do not pad the set with a third candidate that only differs in hue.
2. Give each candidate a short name and one sentence tied to the primary users and the core task.
3. Fill its Density Profile values and its Material Design 3 choices: key colors with their source or audience reason, the main system color roles, extension roles, the typescale roles in use, and the shape steps in use ([md3-token-method.md](md3-token-method.md)).
4. Attach at least two real reference products to each candidate: the name, the source URL, what to borrow, and what not to borrow. Put the PM's own liked references first where they fit the candidate, then references from research. Link to sources; show images only when the PM supplied them (from `product-design/references/`).

### Build the demo

- **Same screen everywhere.** Every candidate renders the same demo markup. Use the PM's own core-task screen when the product exists: recreate its structure and real content. For a new product, draft the core-task screen from `PRODUCT_BRIEF.md` with realistic, uneven domain content, and label it as sample data.
- **Tokens only.** Each candidate is one CSS block of `--md-sys-*` values plus `--md-comp-*` slots that alias them (for example which spacing step list rows use, or which corner step the main button uses). The demo markup and its CSS use only `var(--md-sys-*)` and `var(--md-comp-*)`: no hex values and no `--md-ref-*`. Switching a candidate's block switches the whole demo.
- **Works offline.** No web fonts, CDN scripts, or remote images. When the intended typeface is not installed locally, name it in the candidate and say the demo shows the closest local face.
- **Honest label.** Keep the notice that this is a direction sketch, not the final design.
- **Not a tell itself.** The page follows the same rules it demonstrates: no unchosen gradients, glass, or stacked border-shadow cards, and no decorative emoji. Run `node <anti-ai-style>/scripts/scan_ai_tells.mjs product-design/direction-comparison.html` when `anti-ai-style` is available.

### Let the PM choose

1. Tell the PM where the file is and how to open it, and summarize the candidates in two or three lines each in the conversation.
2. Ask once more: 「有沒有哪個網站、App 或截圖，比這幾個方向更接近你想要的？」 Seeing candidates often reminds the PM of one. Handle a new reference as in [product-research.md](product-research.md) › Start From The PM's References, and adjust or add a candidate when it changes the picture.
3. The PM may pick one candidate or mix parts ("density of A, color of B"). Ask about any part a mix leaves ambiguous.
4. Write the chosen or combined direction to `DESIGN_DIRECTION.md` with Chosen from and Confirmed filled in, and append a `DECISION_LOG.md` entry naming the candidates and the parts taken from each.
5. Keep the comparison page as the record of what was considered. When the direction changes later, update the page or add a new one; do not leave the old page implying a different choice.
