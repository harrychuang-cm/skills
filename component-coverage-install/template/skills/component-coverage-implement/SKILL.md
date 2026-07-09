---
name: component-coverage-implement
description: "Implement the UI of a confirmed component-coverage report: derive the work list from developer review decisions, extend or build components with stories first, then compose the screen, honoring design-system governance"
---

Implement the UI described by a **confirmed** component-coverage report produced by the Storybook「Component Coverage Analyzer」tool. The report plus its developer review decisions are the requirement source; this skill turns them into component and screen work.

**Contract source of truth**: `src/storybook/component-coverage/coverageTypes.ts`. Every shape and enum below mirrors that file — if they disagree, `coverageTypes.ts` wins and this skill must be updated.

**Input**: A request id (required), e.g. `20260708-114102-request`.

**Steps**

1. **Load the report and its sources**

   - Read `outputs/component-coverage/reports/<request-id>.json`. If it does not exist, stop and tell the user to run `/component-coverage-analyze <request-id>` first.
   - Read the originating request at `outputs/component-coverage/requests/<request-id>/`: `request.json` for `prdText`, and every listed image with the Read tool. These are the visual/functional ground truth for composition.

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

4. **Implement components first, then compose**

   Follow the project's design-system governance throughout (if a governance skill such as `design-system-governance` is available, it applies):

   - Reuse existing tokens and components before creating anything; no hardcoded one-off styles.
   - Do component-level work (extend variants, build new components) before any screen composition; every touched component keeps/gains stories.
   - Only after the component layer is complete, compose the screen per the request images/PRD and the report blocks (skipping excluded blocks).

5. **Validate**

   Run `node scripts/check-component-coverage-reports.mjs` and `node scripts/check-component-catalog.mjs` (or the project's npm aliases for them), plus the project's own check/typecheck pipeline. The report file itself must remain contract-valid — this skill MUST NOT modify the report. Fix failures before finishing.

6. **Report back**

   Summarize per block: the review decision, the work done (component created/extended/reused or skipped), and where to see it (story titles). Note any reviewer note that could not be honored and why.

**Guardrails**

- Never implement from an unconfirmed report — the review gate is the requirement freeze.
- Never alter the report JSON: analyzer output and review state are version-controlled decision records.
- Never invent components outside the work list; if implementation reveals the review conclusion is wrong, stop and ask the user to revise the review in the tool instead of silently deviating.
