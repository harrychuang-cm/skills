# Handoff Ingestion (Native)

Use this reference when reading prototype handoff docs before implementing native code.

## Shared Contract, Delegated

The handoff input contract is shared with `frontend-product-implementation` and is not restated here in full. These rules carry identical semantics on a native target:

- **Reading order**: `PRODUCTION_HANDOFF.md`, then `PRD.md`, `FLOW_SPEC.md`, `UI_SPEC.md`, `DATA_SPEC.md`, `ACCEPTANCE.md`, `IMPLEMENTATION_GUIDE.md`.
- **Review Status gate**: read the `Review Status` section before treating the docs as an implementation brief. `confirmed` continues and records who confirmed and when; `pending` or a missing section stops and asks the user whether the team demo confirmation happened. Do not start implementation until the user confirms.
- **Consumed Manifest**: when `docs/HANDOFF_MANIFEST.json` exists, record its `docsDigest` and latest changelog `version` in the implementation map; when absent, record the handoff as consumed `unversioned` and list that as a traceability limitation in the final report. Re-check drift with the prototype's `validate_prototype.py <folder> --verify-manifest` before final reporting when the prototype folder is reachable.
- **Delivery scope, verbatim**: copy each row's scope from the Prototype To Frontend Map — never infer it from whether the prototype renders the screen. `A` already ships (do not rebuild; record the evidence path in the native repo), `B` new, `C` Storybook-only, `U` unverified and therefore a blocking question. A handoff predating the column means every row is `U`.
- **Conflict handling**: prefer `PRODUCTION_HANDOFF.md` for ownership and platform target, `FLOW_SPEC.md` for route ids and triggers, `UI_SPEC.md` for interaction and accessibility detail, `DATA_SPEC.md` for fixture groups and shapes, `ACCEPTANCE.md` for testable criteria. Material conflicts stop for a decision instead of being resolved silently.

Only the native-specific deltas below are defined in this file.

## Native Deltas

### Which columns are yours

- **Scope**: on a multi-target handoff the map carries `Scope(web)` and `Scope(app)` columns. Read `Scope(app)`. A region that is `A` on web is routinely `B` on app — the web column is not evidence about your target, and treating it as such silently drops work.
- **Routes**: the route-to-surface mapping comes from `FLOW_SPEC.md`'s Production Navigation Map table — the `iOS destination` column on iOS, the `Android route` column on Android. `Not in scope` in your column means the route is out of scope for this platform; a blank cell is a blocking question, not an invitation to invent a destination.
- **Platform notes**: `PRODUCTION_HANDOFF.md`'s App Implementation Notes carries navigation stack, safe-area, orientation, gestures, haptics, permissions, offline/retry, and accessibility requirements. Web Implementation Notes is not your section.
- **Components**: your component inventory comes from `PRODUCTION_HANDOFF.md`'s `Design System Continuity` section — the Token namespace record (prefix and defining file paths, echoed from the UI spec's Token Binding), the Component Map echo, the per-screen composition echo of `meta.components` (per route: each component's name, origin `shared` / `local` / `promoted`, import path, and story id when one exists), and the Promotion candidates — together with `UI_SPEC.md`'s Component Map, Component Gaps, and Token Binding sections. Read them before the design-system governance discovery pass, so the composition gate compares the handoff's expected inventory against the native component library instead of starting from an empty list. Hub paths and story ids in those records are web artifacts: they are evidence of what exists and where the prototype source lives, never something a SwiftUI view or a composable can import.

Per-component native counterparts live in the prototype's `meta.components[].targets` (contract: `storybook-product-prototype/references/storybook-integration.md`, Component Composition Metadata). Read `targets.ios` on iOS and `targets.android` on Android — three states, no fourth:

| `targets` on your platform | Native reading |
| --- | --- |
| a string — `{ "ios": "AlertRowView" }`, `{ "android": "AlertRow" }` | an existing production counterpart: reuse that SwiftUI view or composable, do not rebuild it, and record the mapping in the implementation map |
| an explicit `null` — `{ "ios": null }` | production has no counterpart yet: treat it as a missing shared component and take it through the composition gate before creating anything |
| the key is absent — `{ "web": "AlertRow" }` with no `ios` | that entry is out of scope for this platform; it is not silent permission to build it |

The full `targets` object lives in the prototype story's `parameters.prototype.components`, so it is directly readable only when the prototype source is reachable. The `Design System Continuity` per-screen composition echo is the docs-only mirror and may carry no `targets` at all. When `targets` is absent for an entry, or the prototype predates the field, derive the prototype-to-native mapping yourself and record it as derived rather than inherited — a derived mapping is a claim to verify at the composition gate, not a fact from the handoff.

### Machine carriers to prefer over prose

The handoff ships platform-neutral carriers; read them instead of re-deriving their content from markdown:

| Carrier | Use it for |
| --- | --- |
| `docs/TOKENS.json` | Token values and their layered names (W3C DTCG). The prototype CSS is not your token source. |
| `fixtures/*.json` | Deterministic fixture data for mock adapters, loadable directly on both platforms. |
| `DATA_SPEC.md` JSON Schema blocks | Entity/request/response/error shapes for generating `Codable` or `kotlinx.serialization` types. |
| `docs/flow.json` when present | Routes, nodes, and transitions with navigation semantics and no layout fields. |
| `docs/HANDOFF_MANIFEST.json` | The consumed handoff version and drift detection. |

When a carrier is absent, fall back to the corresponding doc section and record the fallback in the implementation map.

### Transition semantics to extract

For every transition in scope, extract `from`, `to`, `trigger`, `label`, `kind`, and the navigation semantics `presentation` and `backBehavior`. `presentation` and `backBehavior` decide whether the destination is a pushed screen, a sheet, a dialog, or a root swap, and how the user leaves it. `kind` — `primary`, `return`, `global`, `secondary`, `outcome`, or `condition` — decides how a missing `presentation` is resolved, so extract it even though it carries no presentation of its own:

- **Non-`return` edge with no `presentation`**: the transition predates the field. Implement it as `push` and record the assumption as a divergence rather than guessing a modal.
- **`kind: return` edge**: always implement it as a return action driven by `backBehavior` — dismiss the presented sheet or cover, pop one step, or pop to the flow root — never as a push, and never as a newly pushed copy of the destination. The contract only requires `presentation` on non-`return` edges, so its absence on a return edge carries no information. When `backBehavior` is also absent, default to a single-step back.

This matches the upstream export rather than reinterpreting it: `export_flow.py`'s `group_transitions_by_presentation` deliberately keeps presentation-less `return` edges in an unspecified bucket instead of the push bucket, because pushing a destination for what is actually a dismiss or a pop is exactly the failure it exists to prevent. The platform call shapes for each case are in `implementation-workflow.md`'s navigation mapping tables.

## Extract These Contracts

Build a working map with:

- Review Status confirmation state, and the consumed manifest `docsDigest` and changelog version (or `unversioned`)
- product goal and primary user
- the native architecture decision record from `native-architecture.md`
- route ids with their platform destinations, plus flow-only nodes and their branch meaning
- transitions with trigger, `kind`, `presentation`, and `backBehavior` — and, for every `return` edge, the return action its `backBehavior` implies
- route parameters and deep links declared on routes
- UI composition, safe-area and orientation constraints, dynamic type, reduce-motion, and screen-reader requirements
- components to reuse, per route or region: the handoff entry, its origin, and the native counterpart resolved from `targets` on your platform (marked as derived when the handoff carries none)
- missing components or tokens: every entry whose counterpart is `null` or unresolved, every Component Gaps entry, and every Token Binding role with no native token — carried into the composition and token gates instead of being created inline
- reusable prototype source files to port, when the handoff lists them, as the parity reference for a new component's variants, props, and states
- tests and previews to add: the `#Preview` / `@Preview` states each implemented screen and component owes, and the unit or UI tests the in-scope acceptance ids require
- fixture groups with their JSON Schemas, states, and branch conditions
- Storybook-only boundaries that must not ship
- acceptance criteria ids in scope, with `AC-P` owner tags
- the named data-integration owner, or the absence of one as a blocking open decision

## Cross-Repository Access And Re-Sync

The native app almost never lives in the prototype's repository. Settle how the handoff reaches you before ingestion, and record which route you took — it decides which checks are runnable later:

- **Local path**: the prototype folder is checked out on this machine and reachable by absolute path. Preferred, because the prototype's own scripts (`validate_prototype.py --verify-manifest`, `export_flow.py`) can actually run against it.
- **Git submodule or vendored checkout**: the prototype, or just its `docs/` and `fixtures/`, is pinned inside the native repo at a commit. Record that commit next to the manifest digest; the pin and the digest disagree only when someone edited the vendored copy in place.
- **Manual copy**: only exported `docs/` and `fixtures/` were handed over — a zip, a PR, a shared drive. The prototype scripts are then unavailable; see Delegation Resilience below for the hand checks that replace them.

When fixture JSON or handoff docs are copied into the native repo:

- Record the provenance in two places: a short source note beside the copied files (repo, path, commit or delivery it came from, and the copy date), and the `## Consumed Manifest` section of `IMPLEMENTATION_MAP.md` with the `docsDigest` and changelog version from `docs/HANDOFF_MANIFEST.json` — `unversioned` when there is no manifest. A copied fixture whose origin nobody can name is untraceable the moment the prototype moves.
- Keep the copied fixtures byte-identical to the prototype's. They are the golden reference the contract tests compare real responses against later; a locally "corrected" copy stops being evidence about the contract and starts being a second, unversioned opinion about it.
- Place them where the build can actually load them — `Bundle.module` versus `Bundle.main` on iOS, `assets/` versus `res/raw` versus test resources on Android. A copy the build never packages fails at runtime or passes only in tests; the rules are in `implementation-workflow.md`.

Re-sync when the handoff moves under an in-flight implementation:

1. **Detect drift, do not assume it.** With the prototype reachable, run `python3 <prototype-skill-root>/scripts/validate_prototype.py <prototype-folder> --verify-manifest`: it exits non-zero and lists every document that no longer matches its recorded hash. Independently, compare the `docsDigest` you recorded at ingestion against the current `docs/HANDOFF_MANIFEST.json` — a different digest means the handoff was republished after you consumed it. When neither check is runnable, say so and treat the copy as `unversioned` from that point.
2. **Re-copy the changed fixtures and docs from the prototype.** Never hand-patch the copy inside the app to match what you believe changed: a hand-patched fixture corrupts the golden reference silently, and the next contract test then measures real responses against something the prototype never published.
3. **Re-record** the new `docsDigest` and version in the implementation map, and regenerate the navigation skeleton when the flow metadata changed rather than hand-adding the new routes.
4. **Report the delta**: which documents drifted, what was re-copied, and which already-implemented screens the change affects.

## Delegation Resilience

This skill deliberately delegates shared contracts and one script to `frontend-product-implementation` instead of restating them, so the two siblings cannot drift apart. That skill may not be installed here. Nothing below becomes optional when it is missing — each delegated item has a hand equivalent, and the substitution is named in the final report next to the checks that did run.

| Delegated item | Where it is delegated | When the sibling is absent |
| --- | --- | --- |
| Handoff input contract: reading order, Review Status gate, Consumed Manifest record, verbatim Scope consumption, conflict handling | this file's `Shared Contract, Delegated` section | the operative rules are summarized there; follow them as written and record that the sibling's full text was unavailable |
| The `IMPLEMENTATION_MAP.md` four-section contract | `verification-reporting.md`, Implementation Map File | write the four sections exactly as that reference specifies them; no section is dropped for lack of the sibling |
| The `validate_implementation.py` machine audit | `verification-reporting.md`, Implementation Map File | check the same four conditions by hand — every manifest route id has a terminal outcome, every `existing-verified` evidence path exists, every `AC-P (assembly)` id is present and not deferred, the consumed `docsDigest` still matches the current manifest — and record that the audit was manual |
| Token bootstrap for a repo that has a token source but no DTCG export | `implementation-workflow.md`, Token Consumption | port the minimal token subset by hand under the same source priority and the same approval gate, and record which source each token came from |

Delegations to skills other than the sibling are handled where they appear and are not covered by this table: `$design-system-governance` where `SKILL.md` binds it, the prototype's `validate_prototype.py` and `export_flow.py` under Cross-Repository Access above, and `production-data-integration` as one possible named receiving owner for the seams.
