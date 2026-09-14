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

For each transition, verify its declared navigation, return action, and `motion` independently. `none` means no transition animation; `platform-default` is an explicit choice; `custom` is checked against its `FLOW_SPEC.md#anchor`, including any reduced-motion alternative. An unresolved edge has no authorized fallback and keeps its affected flow acceptance open.

The implementation is not complete while the walkthrough is unrecorded or failing.

## Implementation Map File

Alongside the final response, write `IMPLEMENTATION_MAP.md` in the location the repo keeps implementation notes (or next to the feature). It is the durable, machine-audited record of what the implementation actually did with the handoff, with five fixed sections:

- `## Consumed Manifest` — bullet lines `- docsDigest: <sha256>`, `- artifactsDigest: <sha256>`, and `- version: <n>` copied from the consumed version 2 manifest. With no manifest, use `unversioned` for docs/version and `unavailable` for artifacts; with a legacy manifest, retain its docs/version and record artifacts as `unavailable`. Record integrity checks at ingestion and before completion, copy provenance, and any unavailable checks; incomplete integrity does not upgrade data authority.
- `## Route Outcomes` — a table with columns `Route id`, `Outcome`, `Evidence`: one row per handoff route id. `Outcome` is `implemented`, `existing-verified` (repo-relative evidence path in `Evidence`), or `deferred` (reason in `Evidence`).
- `## Acceptance Traceability` — a table with columns `AC id`, `Target`, `Result`, `Notes`: the same rows the Final Response Contract reports (`pass` / `deferred` / `not-applicable`).
- `## Data Adapter Seams` — columns `Fixture group`, `UI model`, `Interface`, `Mock implementation`, `Injection site`, `Schema authority/source`, `Integration status/owner`; one row per in-scope fixture group. Use `—` for a seam without a fixture group. Record repo-relative type/mock paths, the injection file and symbol, and Data Authority group/contract id, value usage, schema scope/status, and source evidence or explicit `none`. The final cell identifies the integration status (`open`, `ready`, `integrated`, or `not-applicable`) and named owner or explicit unresolved owner decision. `ready` requires confirmed transport evidence; `integrated` also requires the real implementation and integration verification, which this assembly pass does not perform. Fake-only UI assembly can finish with `open` real integration.
- `## Component Map` — an optional lead-in bullet `- source: <description or none>` followed by a table with columns `Handoff component`, `Resolution`, `Production component`, `Evidence`, `Notes`: one row per in-scope handoff component, per the Component Reuse Map contract in `implementation-workflow.md`. `Resolution` is one of `reused`, `composed`, `extended`, `created`, or `deferred`. `Evidence` holds repo-relative paths separated by commas; no path may contain a comma. `created` rows record the approval and prototype source in `Notes`; `deferred` rows record the reason in `Notes`. When the handoff provides no component inventory, the section contains `- source: none` and no table rows.

Audit it before reporting completion:

```sh
python3 <skill-root>/scripts/validate_implementation.py \
  --handoff <handoff-docs-dir> --map IMPLEMENTATION_MAP.md --repo <production-root>
```

The audit checks the route outcomes, acceptance traceability, consumed manifest digests, Data Adapter Seams record, and Component Map. A Component Map section holding `- source: none` and no table rows skips its row-level checks. Report actual findings and limitations; a passing map audit does not replace source `--verify-manifest`, inspect the application, or confirm the truth of a contract source. Perform source integrity checks and compare both current digests with the consumed snapshot at ingestion and before completion, as `handoff-ingestion.md` specifies.

## Final Response Contract

Report:

- handoff docs used, consumed docs/artifact digests and version, both integrity-check results, and incomplete provenance when checks are unavailable
- target root and mode: greenfield or existing product
- selected platform, framework/version, rendering model, build tool, language, and package manager
- selected routing, state, data, i18n, styling/design-system, tests, and Storybook approach
- architecture decision sources, confidence, unresolved/not-applicable fields, and approved deviations
- design-system governance findings: token system, shared components, i18n, Storybook
- existing components reused: reference and summarize the `IMPLEMENTATION_MAP.md` `## Component Map` section as the single source of the prototype-to-production mapping rather than restating an independent list; any discrepancy between response text and map rows resolves in favor of the map
- tokens reused or new token decisions requested
- new components created only with approval — each with its prototype source evidence and parity check result or recorded divergences when a prototype counterpart exists — or missing-component blockers
- routes/screens/features implemented
- UI models and mock seams implemented, fixture value usage and schema authority/source, and each real integration's status and owner; do not describe mock verification as a confirmed API
- an Acceptance Traceability table: one row per acceptance id in scope from `ACCEPTANCE.md`, mapping the id to its implementing files, tests, or stories and to a result — `pass`, `deferred` with the named owner, or `not-applicable` with the reason. Every id appears exactly once. AC-P criteria tagged `(assembly)` are settled by the mock-mode flow walkthrough; AC-P criteria tagged `(integration)` are recorded as `deferred` to the data-integration owner, never omitted. When the acceptance doc predates ids, say so and report against the criteria text instead.
- verification commands run and results
- open architecture decisions and deferred production integration work
- repo skill delivery: actual used skills, dependency roles, `docs/SKILL_USAGE.json`, relative installed paths, and managed instruction-block verification or the exact outstanding delivery limitation

If blocked by design-system governance, lead with the blocking gate and the exact user decision needed.

## Completion Bar

The implementation is complete only when:

- the feature can run or build in the target repo
- implementation and verification follow the selected framework's native conventions
- the final architecture matches the inherited or confirmed decision record, except for explicitly approved and reported deviations
- documented route transitions and UI states are represented
- the mock-mode flow walkthrough passes: the `FLOW_SPEC.md` primary journey and every in-scope branch state complete in the production shell on mock adapters, and every documented transition trigger is interactively reachable
- every in-scope fixture group has a UI model, typed `<Feature>DataSource`, mock implementation, injection site, schema authority/source, and integration status/owner; an open real contract does not prevent otherwise verified Fake-only assembly
- no real endpoint, auth flow, storage, persistence, or environment variable was introduced
- every real integration item has a named receiving owner recorded in the final report
- no unapproved tokens, unapproved shared components, or hardcoded visual values were added
- no unapproved framework, renderer, build, package-manager, routing, state, styling, or app-root migration was introduced
- verification results are reported clearly
