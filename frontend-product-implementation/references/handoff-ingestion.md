# Handoff Ingestion

Use this reference when reading prototype or product handoff docs before implementing frontend code.

## Input Priority

Read in this order when available:

1. `PRODUCTION_HANDOFF.md`
2. `PRD.md`
3. `FLOW_SPEC.md`
4. `UI_SPEC.md`
5. `DATA_SPEC.md`
6. `ACCEPTANCE.md`
7. `IMPLEMENTATION_GUIDE.md`

If `PRODUCTION_HANDOFF.md` is missing, continue from the remaining docs and create a short implementation map before coding.

## Review Status Gate

Before treating the docs as an implementation brief, read the `Review Status` section of `PRODUCTION_HANDOFF.md`:

- `confirmed`: continue, and record who confirmed and when in the working map.
- `pending`, or the section is missing: stop and ask the user whether the team demo confirmation happened. Do not start implementation until the user confirms; record that confirmation as the decision source.

This is the receiving half of the gate; the prototype side enforces the same rule through `validate_prototype.py --handoff-ready`. Docs that skipped that validator still do not skip this check.

## Consumed Manifest

When `docs/HANDOFF_MANIFEST.json` exists next to the handoff docs, record in the implementation map:

- its `docsDigest` (the sha256 of the docs hash object) as the consumed handoff version
- the latest changelog `version`

When no manifest exists, record the handoff as consumed `unversioned` and list the missing manifest as a traceability limitation in the final report. Before final reporting, re-check for drift with `validate_prototype.py <prototype-folder> --verify-manifest` when the prototype folder is reachable; on drift, surface the changed docs instead of silently finishing against the stale version.

## Extract These Contracts

Build a working map with:

- Review Status confirmation state, and the consumed manifest `docsDigest` and changelog version (or `unversioned`)
- product goal and primary user
- target surface: web, app, hybrid, shared package, or unknown
- proposed runtime architecture: target root, delivery mode, platform, framework/version, rendering model, build tool, language, and package manager
- runtime integrations: routing, state, data boundary, i18n, styling/design-system, tests, and Storybook renderer
- architecture decision sources, confidence, conflicts, and unresolved choices
- route ids, screen ids, flow-only nodes, and transition triggers
- UI composition, shell, responsive behavior, accessibility, and interaction rules
- expected API/data contracts, fixture groups, states, and branch conditions
- Storybook-only boundaries that must not ship
- frontend handoff acceptance criteria
- open product, design-system, data, API, auth, persistence, or platform decisions

Normalize these architecture inputs into the decision record defined in `runtime-architecture.md`. Treat the handoff as evidence: it may propose a production stack, but it does not silently override a clear existing repo or authorize a migration.

## Handoff To Repo Mapping

For each route or screen, map:

- delivery scope, copied verbatim from the `Scope` column of `PRODUCTION_HANDOFF.md`'s Prototype To Frontend Map: `A` already ships (do not rebuild), `B` new, `C` Storybook-only, `U` unverified. Never infer it from whether the prototype renders the screen — a prototype re-creates existing screens on purpose. If the handoff predates this column, treat every row as `U`.
- for any row claimed `A`: the evidence path in the target repo that confirms it already ships. When the target repo is unreachable, record `claimed pre-existing, unverified` and ask before excluding it — never exclude silently.
- handoff route id
- selected target root and runtime architecture
- production route/screen/navigation target
- components to reuse
- missing child components or tokens
- reusable prototype source files for components to port, when the handoff lists them
- data adapter or fixture provider
- tests and stories to add
- owner of real API/data integration if known

Keep unresolved architecture choices visible in the implementation map. Do not map code into a guessed root or framework while a blocking target decision remains open.

## Data Boundary

Handoff docs describe API and data shapes as contract expectations; real data wiring is never this pass's work.

Always:

- create typed interfaces for request, response, errors, and UI state
- create deterministic fixtures or mock adapters
- keep adapter seams easy to replace
- avoid real auth, persistence, storage, cache, and environment assumptions
- record the named data-integration owner from the handoff's Data Integration Ownership field; when none is named, list the hand-over as a blocking open decision that asks the user to name one

## Conflict Handling

When docs disagree:

- Prefer `PRODUCTION_HANDOFF.md` for implementation ownership and platform target.
- Prefer `FLOW_SPEC.md` for route ids and transition triggers.
- Prefer `UI_SPEC.md` for composition, responsive behavior, accessibility, and interaction detail.
- Prefer `DATA_SPEC.md` for fixture groups and API/data shape expectations.
- Prefer `ACCEPTANCE.md` for testable completion criteria.

For runtime architecture, also inspect the selected repo using `runtime-architecture.md`. An existing app's consistent stack is inherited for normal feature work; a handoff that requires a different stack creates a migration decision rather than overriding the repo.

If the conflict would change target root, framework, rendering/build architecture, UI behavior, data shape, or design-system scope, stop and ask before implementing. Record the unresolved decision, competing sources, and required approval.
