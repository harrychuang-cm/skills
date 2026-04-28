---
name: ui-screenshot-to-storybook-product
description: >-
  Turns an uploaded UI screenshot into a token-backed implementation plan: inventory
  UI building blocks, extend Storybook first with the project's design tokens, then
  compose product screens from documented components only. Use when the user attaches
  a UI mockup, screenshot, or Figma export; asks to implement a screen from an image;
  or wants to sync a visual design into Storybook and the app without one-off styles.
---

# UI Screenshot → Storybook → Product

Use this workflow **together with** design-system governance (Token Gate, Composition Gate, `ref → sys → comp`). **Never** skip governance because a reference image exists.

**Where to load governance from**

- **Extracted design-spec zip from cm-ai-ui-explorer:** read [`./design-system-governance/SKILL.md`](./design-system-governance/SKILL.md) in that folder.
- **Any other product repo:** use that repo’s governance doc, or the `design-system-governance` skill if installed for Cursor / Claude Code.

## When to use

- The user (or tool) provides **one or more UI images** (mockup, production screenshot, Figma PNG).
- The goal is to land the UI in **Storybook as the source of truth**, then **compose the product app** from those exports.

## Inputs the agent must collect

1. **Image(s)** — full viewport or focused region; note platform (web/mobile) if ambiguous.
2. **Project map** — where tokens live (`tokens.css`, `globals.css`, `extracted-design-tokens/design-tokens.json`, or cm-ui-library imports), where components live (`src/components`, `vendor/cm-ui-library`), Storybook config (`.storybook/`).
3. **Existing catalog** — list Storybook titles or run a quick file search for `*.stories.*` so new work **reuses** before inventing.

## Phase 1 — Visual parsing (no code yet)

From the image, produce a structured **UI inventory**:

| ID | Block | Type (atom / molecule / organism / template) | Visible states | Notes |
|----|-------|---------------------------------------------|----------------|-------|

- Call out **navigation**, **data display** (tables, charts, KPI cards), **forms**, **dialogs**, **lists**, **empty/loading/error** if visible or implied.
- Mark **repeated patterns** (same card row, chip row, toolbar) once — they become **one** shared component.
- Record **approximate hierarchy** (sections top → bottom) for later page composition.

## Phase 2 — Map to design system & tokens

1. **Match** each inventory row to an **existing** Storybook component or cm-ui-library primitive when possible.
2. For gaps, run the **Token Gate**: list required **sys/comp** roles (surface, on-surface, outline, spacing, radius, motion). If missing, **stop** and ask to add tokens (see governance skill) — no hex/rgb literals in JSX/CSS.
3. **Composition Gate**: if a block needs a child that does not exist, prefer **splitting** into smaller shared pieces over a monolithic screen component.

## Phase 3 — Storybook first (implementation order)

**Design System Architect (role):** Before hand-writing many component stories, **research the project’s design tokens** (from `CLAUDE.md`, `extracted-design-tokens/design-tokens.json`, and global CSS) and add **Foundations** documentation **inside Storybook** — as **`.tsx` / `.jsx` guide components** (swatches, type scale, spacing table, etc.) with **CSF `.stories.tsx`** under a **Foundations** group (**do not** use **`.mdx`** for these guides). Cover at minimum **Color guide**, **Typography guide**, **Spacing & layout guide**, **Shape / radius guide**, and **Elevation** (if the system uses shadow levels). These pages are the **auditable contract** for designers and devs; **update them whenever tokens change**.

For every **new or extended** shared block:

1. Implement the component using **only** token-backed styles (`var(--…)` aligned with this project's contract).
2. Add or update a **co-located** `.stories.tsx` (CSF3, `tags: ['autodocs']`, meaningful `argTypes`).
3. Cover at minimum: **Default**, **variants**, **interactive states** (hover/focus/disabled as applicable), and **light/dark** if the product has both.
4. **Verify** in `storybook dev` before importing the block into a route or page.

**Rule:** Product routes **import from** the shared component layer / Storybook-documented modules — they do not re-implement the same markup and styles inline.

## Phase 4 — Assemble the product screen

1. Create a **page-level** module (e.g. `src/pages/…` or `src/app/…`) that **only composes** documented components and layout primitives.
2. Map layout to the screenshot **section by section**; use the same spacing/radius tokens as in stories.
3. Wire **data** (props, hooks, loaders) **after** the visual shell matches the reference at the token level.
4. Compare side-by-side with the **uploaded image** and `./reference/` screenshots from this pack if present.

## Quality checklist (before calling the screen "done")

- [ ] No hardcoded colors, spacing, radius, or animation durations outside the token system.
- [ ] **Foundations** guides exist in Storybook (at least color, typography, spacing, shape/radius; elevation if applicable) and match live tokens.
- [ ] Every new reusable block has a Storybook story reviewed in isolation.
- [ ] Page file contains composition and data wiring — not a second copy of design-system markup.
- [ ] Governance **Ask** prompts were used if a token or child component was missing.

## Tooling notes (Cursor / Claude Code)

- **Attach the image** in chat so the vision-capable model can read typography, density, and component boundaries.
- If the repo includes `CLAUDE.md` from this generator, treat it as the **written spec**; the image is an additional or overriding **visual** reference — resolve conflicts explicitly (prefer token spec + governance).
