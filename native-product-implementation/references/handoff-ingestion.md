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

For every transition in scope, extract `from`, `to`, `trigger`, `label`, and the navigation semantics `presentation` and `backBehavior`. These two decide whether the destination is a pushed screen, a sheet, a dialog, or a root swap, and how the user leaves it. A transition without `presentation` predates the field: implement it as `push` and record the assumption as a divergence rather than guessing a modal.

## Extract These Contracts

Build a working map with:

- Review Status confirmation state, and the consumed manifest `docsDigest` and changelog version (or `unversioned`)
- product goal and primary user
- the native architecture decision record from `native-architecture.md`
- route ids with their platform destinations, plus flow-only nodes and their branch meaning
- transitions with trigger, `presentation`, and `backBehavior`
- route parameters and deep links declared on routes
- UI composition, safe-area and orientation constraints, dynamic type, reduce-motion, and screen-reader requirements
- fixture groups with their JSON Schemas, states, and branch conditions
- Storybook-only boundaries that must not ship
- acceptance criteria ids in scope, with `AC-P` owner tags
- the named data-integration owner, or the absence of one as a blocking open decision
