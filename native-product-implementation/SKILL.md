---
name: native-product-implementation
description: "Implement native iOS (SwiftUI, Xcode, SPM) and Android (Jetpack Compose, Gradle, Kotlin) production features from PRD, UI Flow, UI Spec, Data Spec, Acceptance, Implementation Guide, and PRODUCTION_HANDOFF docs. Use when a Storybook prototype handoff targets a native app, when building an iOS or Android feature from storybook-product-prototype handoff docs, when translating flow presentation/backBehavior semantics into NavigationStack or NavHost navigation, when consuming docs/TOKENS.json into Swift or Compose tokens, or when continuing after storybook-product-prototype toward a native production target. Sibling of frontend-product-implementation: same handoff contracts and gates, native execution layers. Resolve the native architecture from repo evidence before scaffolding, inherit a clear existing app without re-asking, and never re-platform on a feature request. Real data wiring is never in scope; deliver typed DataSource seams with mock implementations and hand real integration to the named data-integration owner."
---

# Native Product Implementation

Use this skill to turn the same frontend handoff document set that `frontend-product-implementation` consumes into working native product code — SwiftUI on iOS, Jetpack Compose on Android. This skill is the native sibling of `frontend-product-implementation`: `frontend-product-implementation` stays web-scoped; this skill owns the native targets. The handoff does not fork — one document set, per-platform implementation skills. Pipeline position and gates: `storybook-product-prototype/references/pipeline-stations.md` (station 4, native branch).

This skill owns native frontend implementation only: UI assembly and flow interaction. Real API clients, auth, persistence, storage, cache policy, and environment wiring are never in scope. Always create typed contracts and mock adapters backed by the handoff fixtures, and hand real integration work — together with its contract — to the named data-integration owner (a team, a system, or the `production-data-integration` skill). When no owner is named, record the hand-over as a blocking open decision and ask the user to name one.

## Inherited Shared Contracts

The following contracts are shared with `frontend-product-implementation` and carry identical semantics here — same document names, same gates, same output shapes:

- Handoff document reading order, with `PRODUCTION_HANDOFF.md` first.
- The Review Status gate: `pending` or missing status stops ingestion until the user confirms the team demo happened.
- Verbatim Scope consumption: `A`/`B`/`C`/`U` copied from the Prototype To Frontend Map, never re-derived; for multi-target maps, read the `Scope(app)` column. `A` needs repo evidence, `U` is a blocking question.
- The Consumed Manifest record: the `HANDOFF_MANIFEST.json` `docsDigest` and changelog version recorded at ingestion, `unversioned` when absent.
- The `IMPLEMENTATION_MAP.md` four-section contract (Consumed Manifest, Route Outcomes, Acceptance Traceability, Data Adapter Seams) and its machine audit.
- Acceptance Traceability against `AC-S-*`/`AC-H-*`/`AC-P-*` ids; `AC-P (assembly)` criteria are settled by the mock-mode flow walkthrough.

## Reference Loading

Read only the reference needed for the current step:

- Native architecture resolution and migration gates: `references/native-architecture.md` (always read first)
- Handoff ingestion deltas for native targets: `references/handoff-ingestion.md`
- Discovery, tokens, DataSource, navigation, and implementation flow: `references/implementation-workflow.md`
- Verification and final reporting: `references/verification-reporting.md`

## First Actions

1. Identify the exact native target root (Xcode project/workspace, SPM package, or Gradle module) and whether the request is greenfield or existing-product work.
2. Read `references/native-architecture.md`.
3. Locate the handoff docs (`PRD.md`, `FLOW_SPEC.md`, `UI_SPEC.md`, `DATA_SPEC.md`, `PRODUCTION_HANDOFF.md`, `ACCEPTANCE.md`, `IMPLEMENTATION_GUIDE.md`) plus the machine carriers: `docs/HANDOFF_MANIFEST.json`, `docs/TOKENS.json`, `docs/flow.json` when exported, and `fixtures/*.json`.
4. Read `PRODUCTION_HANDOFF.md` first. Check its `Review Status` before anything else — `pending` or missing stops for user confirmation. Record the consumed manifest digest and changelog version (or `unversioned`) in the implementation map.
5. Resolve the native architecture decision record from repo evidence; stop at the migration gate for any implied re-platform.
6. Read the Scope column (or `Scope(app)`) of every map row and carry it verbatim into the implementation map; verify `A` rows against the native repo with evidence paths.
7. Discover the native design-token and theme sources, shared UI components, navigation setup, and test conventions before writing UI.
8. Build the implementation map: routes from the Production Navigation Map's iOS/Android columns, transitions with their `presentation`/`backBehavior` semantics, fixture groups with their JSON Schemas.
9. Implement per `references/implementation-workflow.md`; stop for approval before creating new shared components or token sets.

## Implementation Rules

- Follow the platform's native conventions: SwiftUI view composition, Swift concurrency, and SPM/Xcode structure on iOS; Compose functions, Kotlin coroutines, and Gradle module structure on Android. Never translate web or prototype framework idioms verbatim.
- Consume `docs/TOKENS.json` for tokens; never hand-transcribe values from prototype CSS while the DTCG export exists.
- Implement the adapter seam as `<Feature>DataSource` (Swift protocol / Kotlin interface) plus `Mock<Feature>DataSource` loading the handoff's `fixtures/*.json`; generate entity types from the DATA_SPEC JSON Schemas.
- Map transition `presentation`/`backBehavior` to platform navigation per the mapping table in `references/implementation-workflow.md`; a transition without `presentation` is implemented as `push` and recorded as a divergence.
- Preserve handoff route ids in navigation destinations, tests, or metadata for traceability.
- Implement loading, empty, error, disabled, permission, optimistic, and retry states when documented; drive them from fixture `state` values.
- Do not wire real API clients, auth, storage, persistence, or environment-specific behavior under any condition; hand the replacement work to the named data-integration owner.
- Do not re-platform, change minimum OS/SDK versions, or swap UI/navigation frameworks without the explicit approval the migration gate requires.

## Completion Criteria

Do not consider work complete until:

- The native architecture decision record is reported with evidence, confidence, and unresolved fields.
- Every handoff route and state reached a terminal outcome (implemented / existing-verified with evidence path / deferred with reason).
- The mock-mode flow walkthrough passes on simulator or emulator: the FLOW_SPEC primary journey and every in-scope branch complete on mock adapters, every documented transition trigger interactively reachable.
- Every fixture group has a typed DataSource, a mock implementation, and a recorded replacement point; zero real endpoints, auth flows, or environment secrets were introduced.
- `IMPLEMENTATION_MAP.md` is written per `references/verification-reporting.md` and the shared audit passes.
- Platform verification commands ran and are reported (`references/verification-reporting.md`).
- Every real integration item is handed to a named receiving owner or listed as a blocking open decision asking for one.
