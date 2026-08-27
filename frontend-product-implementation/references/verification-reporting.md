# Verification And Reporting

Use this reference before final response or handoff.

## Verification Order

Run framework-native commands from the selected target root using its recorded package manager and scripts:

1. formatter or lint for changed files
2. typecheck
3. unit/component tests
4. Storybook build or story smoke test
5. app build
6. local dev server or preview smoke test when the user needs to try it

If a command is unavailable, say so and name the closest check that was run.

## Runtime Architecture Verification

Before reporting completion:

- compare the implemented target root, framework/version, rendering model, build tool, language, and package manager with the decision record
- verify routing/navigation, state, data, i18n, styling/design-system, test, and Storybook integrations through the selected stack's native entry points
- use the repo's framework-native compiler, type checker, linter, test utilities, and production build rather than substituting React-oriented checks
- confirm any Storybook config and stories use a renderer compatible with the selected component framework
- verify SSR/SSG/client boundaries, hydration, server/client-only APIs, or embedded-runtime constraints when applicable
- report any deviation, its evidence or explicit approval, and its effect on scope

For an existing product, confirm that a feature request did not introduce an unapproved framework or architecture migration. For greenfield work, confirm that generated files match the user-confirmed record.

## UI Verification

For UI changes, verify:

- route or screen renders in the target shell
- loading, empty, error, disabled, permission, and success states in scope render correctly
- text comes from the i18n source when the repo has one
- visual values come from tokens
- focus-visible and accessibility labels are present
- responsive or app viewport behavior matches `UI_SPEC.md`
- Storybook stories cover changed shared components when Storybook exists
- a newly created component with a prototype counterpart matches it: compare the implemented variants and states against the prototype component source and stories args, and record any intentional divergence (platform adaptation, production token differences) with its reason

Use browser or screenshot verification when the app can be run locally and visual risk is meaningful.

## Prototype Parity Sweep

Parity covers every surface the Prototype To Frontend Map marks Scope `B`, not only newly created components. A `B` route or region is new in production, so the prototype is the only reference that says what it should look like; checking components in isolation leaves the assembled screen unverified.

For each Scope `B` route or region, with the app running in mock mode and the prototype Storybook running:

- compare the production surface side by side with the prototype's corresponding route (`prototypeRoute=<route-id>` renders it in isolation)
- let `ui-pixel-align-report` produce the evidence and `ui-compare-to-reference` own the fixes
- record intentional divergences — platform adaptation, production token differences, real-density content — with their reason rather than "fixing" them

Scope `A` surfaces are explicitly excluded from the sweep. The prototype re-creates them only as context, so prototype fidelity is never a reason to modify an already-shipping screen; a diff there is expected, not a defect. Scope `C` never ships and is out of scope too.

When the prototype Storybook cannot be run, say so and record which `B` surfaces went unverified rather than reporting parity as passed.

## Mock-Mode Flow Walkthrough

Single-route rendering checks do not prove the flow works. After UI verification, walk the full flow in the production shell with mock adapters:

1. Start from the `FLOW_SPEC.md` entry route and complete the primary journey end to end.
2. Reach every in-scope branch state — loading, empty, error, disabled, permission, optimistic, retry — through real interactions, not by hardcoding the state.
3. Trigger every documented transition through its interaction trigger; a transition that cannot be triggered interactively is a defect or an explicitly recorded deferral with a reason.
4. Record the result — journey completed, branches reached, transitions triggered, deferrals with reasons — in the final report, and use it to settle the AC-P `(assembly)` rows of the Acceptance Traceability table.

The implementation is not complete while the walkthrough is unrecorded or failing.

## Implementation Map File

Alongside the final response, write `IMPLEMENTATION_MAP.md` in the location the repo keeps implementation notes (or next to the feature). It is the durable, machine-audited record of what the implementation actually did with the handoff, with four fixed sections:

- `## Consumed Manifest` — bullet lines `- docsDigest: <sha256>` and `- version: <n>` copied from the consumed `HANDOFF_MANIFEST.json`, or `- docsDigest: unversioned` when the handoff had no manifest.
- `## Route Outcomes` — a table with columns `Route id`, `Outcome`, `Evidence`: one row per handoff route id. `Outcome` is `implemented`, `existing-verified` (repo-relative evidence path in `Evidence`), or `deferred` (reason in `Evidence`).
- `## Acceptance Traceability` — a table with columns `AC id`, `Target`, `Result`, `Notes`: the same rows the Final Response Contract reports (`pass` / `deferred` / `not-applicable`).
- `## Data Adapter Seams` — a table with columns `Fixture group`, `Interface`, `Mock implementation`: one row per fixture group.

Audit it before reporting completion:

```sh
python3 <skill-root>/scripts/validate_implementation.py \
  --handoff <handoff-docs-dir> --map IMPLEMENTATION_MAP.md --repo <production-root>
```

The audit fails on: a manifest route id with no terminal outcome, an `existing-verified` evidence path that does not exist under the production root, an AC-P `(assembly)` criterion missing or recorded `deferred`, and a consumed `docsDigest` that no longer matches the current manifest.

## Final Response Contract

Report:

- handoff docs used
- target root and mode: greenfield or existing product
- selected platform, framework/version, rendering model, build tool, language, and package manager
- selected routing, state, data, i18n, styling/design-system, tests, and Storybook approach
- architecture decision sources, confidence, unresolved/not-applicable fields, and approved deviations
- design-system governance findings: token system, shared components, i18n, Storybook
- existing components reused; when the handoff comes from a prototype, report them as a prototype-to-production component map covering each handoff component in scope: reused production component (with name mapping), newly created with approval, or deferred with reason
- tokens reused or new token decisions requested
- new components created only with approval — each with its prototype source evidence and parity check result or recorded divergences when a prototype counterpart exists — or missing-component blockers
- routes/screens/features implemented
- data/API contracts implemented as mocks, adapters, or deferred real integrations
- an Acceptance Traceability table: one row per acceptance id in scope from `ACCEPTANCE.md`, mapping the id to its implementing files, tests, or stories and to a result — `pass`, `deferred` with the named owner, or `not-applicable` with the reason. Every id appears exactly once. AC-P criteria tagged `(assembly)` are settled by the mock-mode flow walkthrough; AC-P criteria tagged `(integration)` are recorded as `deferred` to the data-integration owner, never omitted. When the acceptance doc predates ids, say so and report against the criteria text instead.
- verification commands run and results
- open architecture decisions and deferred production integration work

If blocked by design-system governance, lead with the blocking gate and the exact user decision needed.

## Completion Bar

The implementation is complete only when:

- the feature can run or build in the target repo
- implementation and verification follow the selected framework's native conventions
- the final architecture matches the inherited or confirmed decision record, except for explicitly approved and reported deviations
- documented route transitions and UI states are represented
- the mock-mode flow walkthrough passes: the `FLOW_SPEC.md` primary journey and every in-scope branch state complete in the production shell on mock adapters, and every documented transition trigger is interactively reachable
- every fixture group has a typed `<Feature>DataSource` interface, a `Mock<Feature>DataSource` implementation, and a recorded replacement point
- no real endpoint, auth flow, storage, persistence, or environment variable was introduced
- every real integration item has a named receiving owner recorded in the final report
- no unapproved tokens, unapproved shared components, or hardcoded visual values were added
- no unapproved framework, renderer, build, package-manager, routing, state, styling, or app-root migration was introduced
- verification results are reported clearly
