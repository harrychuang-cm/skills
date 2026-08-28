---
name: native-product-implementation
description: "Implement native iOS (SwiftUI, Xcode, SPM) and Android (Jetpack Compose, Gradle, Kotlin) production features from PRD, UI Flow, UI Spec, Data Spec, Acceptance, Implementation Guide, and PRODUCTION_HANDOFF docs. Use when a Storybook prototype handoff targets a native app, when building an iOS or Android feature from storybook-product-prototype handoff docs, when translating flow presentation/backBehavior semantics into NavigationStack or NavHost navigation, when consuming docs/TOKENS.json into Swift or Compose tokens, or when continuing after storybook-product-prototype toward a native production target. Sibling of frontend-product-implementation: same handoff contracts and gates, native execution layers. Resolve the native architecture from repo evidence before scaffolding, inherit a clear existing app without re-asking, and never re-platform on a feature request. Always follow design-system-governance: discover tokens, theme layers, motion, localization, and shared component modules first; reuse existing native components; stop for approval before creating missing tokens or shared components. Real data wiring is never in scope; deliver typed DataSource seams with mock implementations and hand real integration to the named data-integration owner."
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

## Required Companion Skill

Before implementing UI, load and follow `$design-system-governance`.

Apply its Phase 0 discovery and gates as mandatory:

- Discover token naming, token layers, theme structure, motion values, shared component modules, previews, and the localization source before writing UI. Run that discovery against the native sources listed in `references/implementation-workflow.md` Repo Discovery, not against the web paths the governance skill names.
- If the target app has no token system, stop and ask whether to establish one first; if the user approves establishing one, follow the token bootstrap path recorded in `references/implementation-workflow.md` Token Consumption.
- If a required token is missing, ask: `找不到對應的 design token（sys/comp 層）。是否要先建立這組 token，再繼續元件開發？`
- If a required shared component is missing, ask: `目前既有元件無法完整組裝此組件。是否要先建立新的共用子元件，再繼續？`
- Do not add hardcoded visual values, one-off inline child views or composables, or display text outside the app's localization source when it has one.

Report the governance discovery findings and every gate decision in the final response.

### Platform Tailoring

`$design-system-governance` is written in web vocabulary. That wording does not exempt native work: every rule below has a native counterpart, and the skill is applied through those counterparts. Do not conclude that the governance skill does not apply here because its examples are web-shaped, and do not skip it wholesale.

| Governance rule as written | Native counterpart |
| --- | --- |
| Storybook stories for each changed component (`Default` / `Hover` / `FocusVisible` / `Disabled`) | SwiftUI `#Preview` and Compose `@Preview` declarations covering the same documented states, driven by the mock data source — see `references/platform-conventions.md` |
| Hover state coverage | Pressed and focused states (press and focus interactions on Compose; button-style press state and focus state on SwiftUI). Hover applies only to pointer- or keyboard-attached targets such as iPadOS with a trackpad or desktop-class builds; where it does not exist, cover pressed and focused instead of reporting the story as missing |
| CSS keyframes, `animation-delay`, `cubic-bezier` and raw `ms` literals | SwiftUI animation curves (`.easeInOut`, `.spring`, and `Animation` values held in the token/theme layer) and Compose `AnimationSpec` values (`tween`, `spring`) resolved from the app's motion tokens rather than typed inline at the call site |
| Pixel breakpoints (for example a 960 / 600 step-down) and the grid container class as page root | iOS size classes and the app's adaptive layout convention; Android window size classes. Use whichever adaptive-layout convention discovery found in the target module — never port pixel breakpoints verbatim |
| `src/components/`, `packages/ui`, `src/styles/`, `*.css`, `*.scss`, `tokens/`, `locales/` | The native shared component library plus the token/theme and localization sources located by `references/implementation-workflow.md` Repo Discovery. The shared component library usually lives outside the app module, so read the dependency declarations before deciding the scan scope |

## Reference Loading

Read only the reference needed for the current step:

- Native architecture resolution and migration gates: `references/native-architecture.md` (always read first)
- Handoff ingestion deltas for native targets: `references/handoff-ingestion.md`
- Discovery, tokens, DataSource, navigation, and implementation flow: `references/implementation-workflow.md`
- Native implementation conventions that have no web equivalent — safe area and window insets, dark mode, type scaling, orientation, state restoration and large-screen adaptation, predictive back, accessibility, permission prompts, and previews as a deliverable: `references/platform-conventions.md` (read when implementing screens)
- Verification and final reporting: `references/verification-reporting.md`

## First Actions

1. Identify the exact native target root (Xcode project/workspace, SPM package, or Gradle module) and whether the request is greenfield or existing-product work.
2. Read `references/native-architecture.md`.
3. Locate the handoff docs (`PRD.md`, `FLOW_SPEC.md`, `UI_SPEC.md`, `DATA_SPEC.md`, `PRODUCTION_HANDOFF.md`, `ACCEPTANCE.md`, `IMPLEMENTATION_GUIDE.md`) plus the machine carriers: `docs/HANDOFF_MANIFEST.json`, `docs/TOKENS.json`, `docs/flow.json` when exported, and `fixtures/*.json`.
4. Read `PRODUCTION_HANDOFF.md` first. Check its `Review Status` before anything else — `pending` or missing stops for user confirmation. Record the consumed manifest digest and changelog version (or `unversioned`) in the implementation map.
5. Platform applicability gate — run it after the handoff is read and before any implementation. Read `PRODUCTION_HANDOFF.md`'s `Target Surfaces` section and, in `FLOW_SPEC.md`, the implementing platform's column of the Production Navigation Map (`iOS destination` / `Android route`). The handoff addresses your platform only when that column carries at least one real destination. Stop and ask when `Target Surfaces` marks `App:` as `Not in scope` (or omits it) **and** the platform column is absent, empty, or `Not in scope` in every row — the template always emits all four columns, so a web-only handoff shows up as a column full of `Not in scope`, not as a missing column. Then ask which way to go: send the handoff back to `storybook-product-prototype` to add the native target surface, fill the navigation-map column, and write the App Implementation Notes, or confirm that native behavior is to be derived without a native spec (then record that confirmation as a divergence). Never proceed silently on a web-only handoff. When the column carries real destinations for some routes and blanks for others, keep going and treat each blank cell as a blocking question instead of stopping the whole pass.
6. Resolve the native architecture decision record from repo evidence; stop at the migration gate for any implied re-platform.
7. Read the Scope column (or `Scope(app)`) of every map row and carry it verbatim into the implementation map; verify `A` rows against the native repo with evidence paths.
8. Load `$design-system-governance` and run its Phase 0 discovery per `## Required Companion Skill` before writing any UI: native design-token and theme sources, shared component modules, localization source, navigation setup, and test conventions.
9. Build the implementation map: routes from the `FLOW_SPEC.md` Production Navigation Map's iOS/Android columns, transitions with their `kind`, `presentation`, and `backBehavior` semantics, fixture groups with their JSON Schemas.
10. Implement per `references/implementation-workflow.md`; stop for approval before creating new shared components or token sets.

## Implementation Rules

- Follow the platform's native conventions: SwiftUI view composition, Swift concurrency, and SPM/Xcode structure on iOS; Compose functions, Kotlin coroutines, and Gradle module structure on Android. Never translate web or prototype framework idioms verbatim.
- Consume `docs/TOKENS.json` for tokens; never hand-transcribe values from prototype CSS while the DTCG export exists.
- Implement the adapter seam as `<Feature>DataSource` (Swift protocol / Kotlin interface) plus `Mock<Feature>DataSource` loading the handoff's `fixtures/*.json`; generate entity types from the DATA_SPEC JSON Schemas.
- Map transition `presentation`/`backBehavior` to platform navigation per the mapping table in `references/implementation-workflow.md`. A non-return transition that lacks `presentation` is implemented as `push` and recorded as a divergence; a transition whose `kind` is `return` is always implemented as a back action per its `backBehavior`, defaulting to a single-step back when `backBehavior` is absent too.
- Preserve handoff route ids in navigation destinations, tests, or metadata for traceability.
- Implement loading, empty, error, disabled, permission, optimistic, and retry states when documented; drive them from fixture `state` values.
- Keep display text in the app's localization source when the module has one (`*.strings`, `*.stringsdict`, `*.xcstrings` on iOS; `res/values*/strings.xml` on Android). When discovery finds no localization source at all, stop and ask whether to establish one before implementing UI text — the same gate a missing token system gets. If the user declines, in-place strings are allowed and every location is recorded as a divergence in `IMPLEMENTATION_MAP.md`; a single-language app with no catalog is never treated as an unfixable violation.
- Do not wire real API clients, auth, storage, persistence, or environment-specific behavior under any condition; hand the replacement work to the named data-integration owner.
- Do not re-platform, change minimum OS/SDK versions, or swap UI/navigation frameworks without the explicit approval the migration gate requires.

## Completion Criteria

Do not consider work complete until:

- The native architecture decision record is reported with evidence, confidence, and unresolved fields.
- Every handoff route and state reached a terminal outcome (implemented / existing-verified with evidence path / deferred with reason / not-applicable for a route the Production Navigation Map marks out of scope on this platform, per `references/verification-reporting.md`).
- The mock-mode flow walkthrough passes on simulator or emulator: the FLOW_SPEC primary journey and every in-scope branch complete on mock adapters, every documented transition trigger interactively reachable — or a recorded degraded substitute covers the same items and the uncovered ones are listed with a named owner, per the degraded path in `references/verification-reporting.md`.
- Every in-scope fixture group has a typed DataSource, a mock implementation, and a recorded replacement point. Fixture groups belonging to routes or regions the map scopes `A` on this platform are excluded and recorded as such — they never become DataSource seams, and they never become integration work for the next stage. Zero real endpoints, auth flows, or environment secrets were introduced.
- `IMPLEMENTATION_MAP.md` is written per `references/verification-reporting.md` and the shared audit passes — or its only failures are `not-applicable` rows explained per the known gap in that reference, or the manual equivalent is recorded when the sibling skill's script is unavailable. Never re-label a `not-applicable` row as `deferred` to make the audit green.
- Platform verification commands ran and are reported, and any command unavailable in this environment is named as such alongside the closest check that did run (`references/verification-reporting.md`).
- Every real integration item is handed to a named receiving owner or listed as a blocking open decision asking for one.
