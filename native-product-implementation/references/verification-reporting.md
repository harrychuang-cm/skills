# Verification And Reporting (Native)

Use this reference before final response or hand-over.

## Verification Order

Run the platform's native commands from the selected target root. When a command is unavailable in this environment, say so explicitly and name the closest check that did run — a skipped build is never reported as a pass.

iOS:

1. `xcodebuild build` for the app scheme and destination in scope (or `swift build` for an SPM-only package)
2. `xcodebuild test` for the test scheme (or `swift test`)
3. `swiftlint` when the repo configures it
4. Simulator smoke run of the implemented flow

Android:

1. `gradlew assembleDebug` for the module in scope
2. `gradlew test` (plus `connectedAndroidTest` when an emulator or device is available)
3. `gradlew lint`
4. `detekt` when the repo configures it
5. Emulator smoke run of the implemented flow

## Architecture Verification

Before reporting completion:

- compare the implemented target root, platform, minimum OS/SDK, UI framework, navigation system, language version, and dependency management against the decision record
- confirm navigation destinations register through the app's existing router rather than a second navigation system introduced by this work
- confirm tokens resolve through the app's theme layer, and localized text through the platform's localization source
- confirm no dependency, minimum-version, or module-structure change happened without the migration gate's explicit approval
- report every deviation with its evidence or approval and its effect on scope

## UI Verification

For UI changes, verify on simulator or emulator:

- each in-scope route renders in the real app shell through its registered destination
- loading, empty, error, disabled, permission, and success states in scope render correctly from fixture `state` values
- text comes from the localization source; visual values come from tokens
- safe area, orientation, dynamic type / font scaling, and reduce-motion behavior match the App Implementation Notes
- accessibility labels and traversal order are present for interactive elements
- a newly created component with a prototype counterpart matches it: compare implemented variants and states against the prototype source and stories args, and record every intentional divergence — platform adaptation, token differences, dropped hover states — with its reason

For prototype parity on Scope `B` surfaces, run a side-by-side comparison against the prototype Storybook route when it can be run; `ui-compare-to-reference` or `ui-pixel-align-report` can own that check, judging platform adaptations as legitimate rather than as drift. Scope `A` surfaces are excluded: prototype fidelity is never a reason to modify an already-shipping screen.

## Mock-Mode Flow Walkthrough

Single-screen rendering checks do not prove the flow works. After UI verification, walk the full flow on simulator or emulator with mock DataSources:

1. Start from the `FLOW_SPEC.md` entry route and complete the primary journey end to end.
2. Reach every in-scope branch state through real interactions, not by hardcoding state.
3. Trigger every documented transition through its interaction trigger, and confirm the destination's presentation and back behavior match the declared `presentation` / `backBehavior` — a `sheet` that pushed, or a `none` that the system back button still dismisses, is a defect.
4. Record the result — journey completed, branches reached, transitions triggered, divergences and deferrals with reasons — and use it to settle the `AC-P (assembly)` rows of the Acceptance Traceability table.

The implementation is not complete while the walkthrough is unrecorded or failing.

## Implementation Map File

Write `IMPLEMENTATION_MAP.md` where the repo keeps implementation notes (or next to the feature module), with the same four sections the `frontend-product-implementation` contract defines:

- `## Consumed Manifest` — `- docsDigest: <sha256>` and `- version: <n>` from the consumed `HANDOFF_MANIFEST.json`, or `- docsDigest: unversioned`.
- `## Route Outcomes` — columns `Route id`, `Outcome`, `Evidence`; one row per handoff route id, `Outcome` being `implemented`, `existing-verified` (evidence path), or `deferred` (reason).
- `## Acceptance Traceability` — columns `AC id`, `Target`, `Result`, `Notes`; `AC-P (assembly)` settled by the walkthrough, `AC-P (integration)` deferred to the named data-integration owner.
- `## Data Adapter Seams` — columns `Fixture group`, `Interface`, `Mock implementation`; one row per fixture group.

Audit it before claiming completion by running the shared script from the `frontend-product-implementation` skill — it reads the handoff and the map and resolves evidence paths under `--repo`, so it is platform-agnostic:

```sh
python3 <frontend-product-implementation-skill-root>/scripts/validate_implementation.py \
  --handoff <handoff-docs-dir> --map IMPLEMENTATION_MAP.md --repo <native-target-root>
```

When that sibling skill is not installed in this environment, do not skip the check: verify the same four conditions by hand — every manifest route id has a terminal outcome, every `existing-verified` evidence path exists, every `AC-P (assembly)` id is present and not deferred, and the consumed `docsDigest` still matches the current manifest — and record in the final report that the audit was manual.

## Final Response Contract

Report:

- handoff docs used, the consumed manifest digest and version (or `unversioned`)
- target root and mode: greenfield or existing product
- platform, minimum OS/SDK, UI framework, navigation system, language version, dependency management, state/DI approach
- architecture decision sources, confidence, unresolved or not-applicable fields, and approved deviations
- design-system governance findings: token source, theme layer, shared components, localization
- existing components reused, as a prototype-to-native component map with name mappings
- new components created only with approval, each with prototype source evidence and its parity result or recorded divergences
- routes/screens implemented, with their navigation destinations and presentation semantics
- data contracts implemented as typed DataSources and mocks, with the replacement points and the named integration owner
- the Acceptance Traceability table: every in-scope acceptance id exactly once with `pass`, `deferred` (with owner), or `not-applicable` (with reason)
- the mock-mode walkthrough result
- verification commands run, their results, and any command unavailable in this environment
- open decisions, especially real API/data/auth/persistence ownership and platform capability questions

## Completion Bar

The implementation is complete only when:

- the feature builds and runs on simulator or emulator from the target root
- implementation and verification follow the platform's native conventions
- the final architecture matches the inherited or confirmed decision record, except for explicitly approved and reported deviations
- documented routes, transitions, presentation semantics, and UI states are represented
- the mock-mode flow walkthrough passes
- every fixture group has a typed DataSource, a mock implementation, and a recorded replacement point
- no real endpoint, auth flow, storage, persistence, or environment secret was introduced
- no unapproved token, shared component, hardcoded visual value, framework, navigation-system, minimum-version, or dependency migration was introduced
- `IMPLEMENTATION_MAP.md` exists and its audit passes (or its manual equivalent is recorded)
- every real integration item has a named receiving owner
