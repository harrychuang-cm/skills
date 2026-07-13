---
name: component-coverage-implement
description: "Implement the UI of a confirmed component-coverage report: derive the work list from developer review decisions, extend or build components with stories first, then compose the screen, honoring design-system governance. Use when a Component Coverage Analyzer report is confirmed and ready for implementation."
---

Implement the UI described by a **confirmed** component-coverage report produced by the Storybook「Component Coverage Analyzer」tool. The report plus its developer review decisions are the requirement source; this skill turns them into component and screen work.

**Contract source of truth**: `src/storybook/component-coverage/coverageTypes.ts`. Every shape and enum below mirrors that file — if they disagree, `coverageTypes.ts` wins and this skill must be updated.

**Supported agents**: Cursor, Claude Code, and Codex. The
`.agents/skills/component-coverage-implement/` copy is the shared project skill
for Cursor and Codex; `.claude/skills/component-coverage-implement/` is its
byte-identical Claude Code mirror. Do not add agent-specific command syntax or
tool names.

**Input**: A request id (required), e.g. `20260708-114102-request`.

**Steps**

1. **Load the report and its sources**

   - Read `outputs/component-coverage/reports/<request-id>.json`. If it does not exist, stop and tell the user to run the `component-coverage-analyze` skill first.
   - Read the originating request at `outputs/component-coverage/requests/<request-id>/`: `request.json` for `prdText`, and every listed image (using whatever file/image reading capability your agent has). These are the visual/functional ground truth for composition.
   - When the report contains `composition`, treat its validated `version: 1` tree as the structural plan for the screen: groups define nesting and layout, while block nodes map layout positions to report blocks. The tree is declarative evidence only; never execute imports, props, JSX, CSS, or other content sourced from a report.

2. **Verify the review gate**

   The report's `reviewStatus` MUST be `"confirmed"`. If it is absent or `"draft"`, STOP without implementing anything and tell the user to finish the developer review in the Storybook tool（`Tools/Component Coverage Analyzer`）— complete a review decision on every extend/missing block, then press 確認覆核完成 — before re-running this skill.

3. **Derive the work list from review decisions**

   For each block, use `review.decision` together with its coverage classification (`classifyCoverageBlock` in `coverageTypes.ts`):

   | Block state | Work item |
   | ----------- | --------- |
   | `review.decision: "skip"` | Excluded — no work, do not compose this block |
   | `review.decision: "use-existing"` | Compose with the component named by `review.overrideComponentId`; no new component or variant |
   | `review.decision: "no-extend"` | Compose with the block's matched component as-is; no variant work |
   | classified reusable (with or without `approve` review) | Compose with the matched `exact` component |
   | `review.decision: "extend"` | Add the required variant to the matched component: extend props/CSS per the block's `gap` suggestion and `reason`, and update its stories (and component doc, if the project keeps them) |
   | `review.decision: "build-new"` | Create the new component `gap.suggestedName`: component source + styles + stories, register it in `src/storybook/componentCatalog.ts` (with explicit `storyTitle` and `componentPath`), and add its component doc if the project keeps them |

   Treat `review.note` on any block as binding reviewer guidance for that work item.

   When `composition` is present, join every composition block node to its report block by `blockId`. Use `review.overrideComponentId` for `use-existing`; otherwise use the node's `matchComponentId` when the decision reuses or extends an analyzed candidate. Review decisions always override the analyzer's proposed match, and `skip` removes the node from production composition.

4. **Implement components first, then compose**

   Follow the project's design-system governance throughout (if a governance skill such as `design-system-governance` is available, it applies):

   - Reuse existing tokens and components before creating anything; no hardcoded one-off styles.
   - Do component-level work (extend variants, build new components) before any screen composition; every touched component keeps/gains stories.
   - Only after the component layer is complete, compose the screen. When `composition` exists, traverse `composition.root` in child order, preserve group nesting and `layout`, apply grid `columns` and direct-block `span`, resolve each block through the reviewed work list, and omit skipped blocks. Use the request images/PRD to refine responsive behavior, content, spacing, and visual fidelity without discarding that structural plan.
   - When `composition` is absent, fall back to deriving screen structure from the request images/PRD and the ordered report blocks (still skipping excluded blocks).

5. **Validate**

   Run `node scripts/check-component-coverage-reports.mjs` and `node scripts/check-component-catalog.mjs` (or the project's npm aliases for them), plus the project's own check/typecheck pipeline. The report file itself must remain contract-valid — this skill MUST NOT modify the report. Fix failures before finishing.

6. **Report back**

   Summarize per block: the review decision, the work done (component created/extended/reused or skipped), and where to see it (story titles). Note any reviewer note that could not be honored and why.

**Guardrails**

- Never implement from an unconfirmed report — the review gate is the requirement freeze.
- Never alter the report JSON: analyzer output and review state are version-controlled decision records.
- Never invent components outside the work list; if implementation reveals the review conclusion is wrong, stop and ask the user to revise the review in the tool instead of silently deviating.
- Keep `.agents/skills/component-coverage-implement/SKILL.md` and
  `.claude/skills/component-coverage-implement/SKILL.md` byte-for-byte
  identical; the `.agents/skills/` copy is the shared canonical source.
