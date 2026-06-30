# Verification And Reporting

Use this reference before final response or handoff.

## Verification Order

Run commands that fit the repo:

1. formatter or lint for changed files
2. typecheck
3. unit/component tests
4. Storybook build or story smoke test
5. app build
6. local dev server or preview smoke test when the user needs to try it

If a command is unavailable, say so and name the closest check that was run.

## UI Verification

For UI changes, verify:

- route or screen renders in the target shell
- loading, empty, error, disabled, permission, and success states in scope render correctly
- text comes from the i18n source when the repo has one
- visual values come from tokens
- focus-visible and accessibility labels are present
- responsive or app viewport behavior matches `UI_SPEC.md`
- Storybook stories cover changed shared components when Storybook exists

Use browser or screenshot verification when the app can be run locally and visual risk is meaningful.

## Final Response Contract

Report:

- handoff docs used
- target mode: greenfield or existing product
- design-system governance findings: token system, shared components, i18n, Storybook
- existing components reused
- tokens reused or new token decisions requested
- new components created only with approval, or missing-component blockers
- routes/screens/features implemented
- data/API contracts implemented as mocks, adapters, or deferred real integrations
- verification commands run and results
- open decisions and deferred production integration work

If blocked by design-system governance, lead with the blocking gate and the exact user decision needed.

## Completion Bar

The implementation is complete only when:

- the feature can run or build in the target repo
- documented route transitions and UI states are represented
- real data integration is either implemented by explicit scope or isolated behind typed contracts/mocks
- no unapproved tokens, unapproved shared components, or hardcoded visual values were added
- verification results are reported clearly
