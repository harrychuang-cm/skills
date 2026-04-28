---
name: ui-compare-to-reference
description: >-
  Compares the current UI implementation against reference screenshots in ./reference/,
  optionally scoped to one screenshot or one page. Use when auditing visual parity vs
  references, fixing layout/token drift, or mirroring the design-spec ZIP /compare workflow.
---

# UI Compare to Reference

This workflow is a **standalone copy** of the **`/compare`** slash command content that **cm-ai-ui-explorer** embeds in downloaded design-spec ZIPs at `.claude/commands/compare.md`.

**Repository note:** The generator still writes that file from `src/lib/downloadDesignPackage.ts` — this SKILL is **not** wired into that path; it exists so Cursor agents can load the same instructions without changing the app or ZIP flow.

---

## Instructions (same as compare.md)

Compare the current UI implementation against reference UI screenshots in `./reference/`.

**Target** (optional — from the user message, or after `/compare …` in Claude Code): describe what to scope, e.g. empty = all references, `screen-2`, `screen-2.png`, `reference/screen-2.png`, a page name like `Dashboard`, a file path, or a route like `/markets`.

Use the target argument to scope the comparison:

- **Empty target:** compare every screenshot in `./reference/`.
- **Screenshot target:** compare only that file, e.g. `/compare screen-2`, `/compare screen-2.png`, or `/compare reference/screen-2.png`.
- **Page target:** compare only the matching page/screen component, e.g. `/compare Dashboard`, `/compare src/pages/Dashboard.tsx`, or `/compare /markets`.

First resolve the target:

1. If Target is empty, inspect all screenshots in `./reference/` and all likely screen components.
2. If Target names a screenshot, normalize it to `./reference/<target>` and compare only that screenshot.
3. If Target names a route, page, or component, find the corresponding file in `src/pages/`, `src/screens/`, `src/app/`, or `src/routes/`. Then select the matching reference screenshot by filename, nearby text in `CLAUDE.md`, or visual intent. If the match is ambiguous, list the candidates and ask the user to choose before applying fixes.

For the selected page/UI only:

1. Describe what you see in the reference: visual blocks, colors, spacing, component boundaries.
2. Inspect the corresponding implementation file and imported components.
3. List every visual discrepancy: wrong color token, wrong radius tier, wrong spacing, missing component, layout mismatch.

Output a table: `| Block | Expected (reference screenshot) | Actual (in code) | Fix |`

Then apply fixes only for the selected target. Cross-reference token values against the Dark/Light Theme sections in `CLAUDE.md` (if present in this project).
