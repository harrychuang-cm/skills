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

- `confirmed`: record who confirmed, when, and the scope; separately read the named, dated, scoped `Semantic Review` result and its related-update record.
- `pending`, missing, or incomplete confirmation: use existing explicit session authorization when it covers the same scope; otherwise request the missing decision from its owner before implementing the affected brief. Independent discovery and confirmed work can continue.

Demo confirmation approves only its recorded product scope. It never confirms API, analytics, or Remote Config technical contracts. Semantic review checks that suggestions remain proposed, superseded clauses are inactive, and affected docs, flow, fixtures, metadata, and tests were synchronized. A validator checks record completeness, not the truth of the external sources or the correctness of the review.

This is the receiving half of the gate; the prototype side enforces the same rule through `validate_prototype.py --handoff-ready`. Docs that skipped that validator still do not skip this check.

## Consumed Manifest

When `docs/HANDOFF_MANIFEST.json` exists next to the handoff docs, record in the implementation map:

- its `docsDigest` (the sha256 of the docs hash object)
- its `artifactsDigest` when present; version 2 also covers the selected Flow/Data/Meta, fixture files, and existing flow/token exports
- the latest changelog `version`

At ingestion and before completion, run `validate_prototype.py <prototype-folder> --verify-manifest` when the source and script are reachable. Also compare the consumed digests with the current manifest: a republished snapshot can pass its own verification while differing from the one consumed. Report changed, added, or removed artifacts and the routes, seams, acceptance rows, and tests they affect; pause only affected work until the owner resolves the delta.

When no manifest exists, record `docsDigest: unversioned`, `artifactsDigest: unavailable`, and `version: unversioned`. A legacy manifest preserves its recorded docs digest/version but records `artifactsDigest: unavailable` and incomplete carrier integrity; renewed review and version 2 publication are needed for full verification. For a docs-only copy or unavailable verifier, record which checks could not run and the copy's source; do not claim complete integrity or upgrade data authority. Matching hashes prove snapshot consistency only.

## Extract These Contracts

Build a working map with:

- scoped Review Status and Semantic Review, consumed `docsDigest`, `artifactsDigest` when present, changelog version, and integrity results at ingestion
- product goal and primary user
- target surface: web, app, hybrid, shared package, or unknown
- proposed runtime architecture: target root, delivery mode, platform, framework/version, rendering model, build tool, language, and package manager
- runtime integrations: routing, state, data boundary, i18n, styling/design-system, tests, and Storybook renderer
- architecture decision sources, confidence, conflicts, and unresolved choices
- route ids, screen ids, flow-only nodes, and transition triggers with `kind`, `presentation`, `backBehavior`, `motion`, and `motionRef`
- UI composition, shell, responsive behavior, accessibility, and interaction rules
- Data Authority fixture/contract records, UI-model schemas, confirmed transport evidence when supplied, fixture states, and branch conditions
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

Read the shared [handoff authority reference](../../storybook-product-prototype/references/handoff-authority.md). The local rules here remain binding when it is unavailable:

- Consume the single `DATA_SPEC.md` Data Authority JSON registry: `schemaVersion: 1`, `fixtures`, and `contracts`. A fixture records `group`, `values: fake`, `schemaScope: ui-model | transport`, `status`, `source`, `owner`, and optional `contractId`. A contract records `id`, `kind`, `status`, `source`, and `owner`.
- Keep value usage and schema authority separate. A UI-model schema can be `confirmed` and still authorize only a UI model. Fake values do not become real when they follow a confirmed transport schema.
- Only `confirmed` transport evidence with a complete source object (`reference`, `revision`, `confirmedBy`, `confirmedOn`) can authorize transport DTOs. It can come from a confirmed transport-scoped fixture schema or an independent confirmed `contracts[].source` defining the real contract. For a proposed `ui-model` fixture linked by `contractId` to a confirmed API contract, derive the DTO from that contract's source and map it to the UI model; do not require changing the fixture's scope, status, or shape. A proposed/open/superseded/malformed source cannot authorize transport code. Legacy unclassified data has no transport authority by itself.
- Derive typed UI models, UI-facing input/error types, deterministic fixtures, and replaceable mock adapters from display needs. Do not rename a fixture type as an API request/response type. A real DTO can differ from the UI model and later be mapped by the integration owner.
- Preserve `proposed` suggestions separately from confirmed requirements and acceptance criteria. An unconfirmed analytics `reason` parameter is not part of the event contract.
- For Remote Config, consume the controlled region, intended product behavior, demonstrated states, unresolved details, and RD owner. Mock the declared states; do not invent technical keys, providers, polling/cache rules, permissions, rollout settings, or a production default.
- Record the UI model, interface, mock path, injection site, schema authority/source, and integration status/owner per seam. An unknown endpoint or owner blocks only dependent real wiring and its handover; Fake-only UI assembly can complete without an endpoint. Real auth, persistence, storage, cache, and environment wiring remain outside this skill.

## Navigation And Motion Boundary

For each transition entering a visible route, require explicit `motion: none | platform-default | custom`, `presentation` for non-return edges, and `backBehavior` for returns. `custom` requires a `motionRef` pointing to an existing explicit anchor in `FLOW_SPEC.md`. App targets also require presentation on every non-return transition, including edges through flow-only nodes. Navigation (`push`, `sheet`, dismiss, and so on) and animation are separate decisions.

Missing fields are unresolved for that edge; neither a draft export nor a legacy document implies push, pop, or a platform animation. Reuse explicit existing authorization only with its source recorded. Continue unrelated confirmed surfaces, but do not report the affected flow complete until its destination, return action, and motion are resolved. Read the referenced motion description for timing/token, gesture, and reduced-motion requirements before implementation.

## Conflict Handling

When docs disagree:

- Prefer `PRODUCTION_HANDOFF.md` for implementation ownership and platform target.
- Prefer `FLOW_SPEC.md` for route ids and transition triggers.
- Prefer `UI_SPEC.md` for composition, responsive behavior, accessibility, and interaction detail.
- Prefer `DATA_SPEC.md` for fixture groups and UI-model expectations; use Data Authority and its confirmed source for transport authority. A document-priority rule cannot upgrade an unconfirmed contract.
- Prefer `ACCEPTANCE.md` for testable completion criteria.

For runtime architecture, also inspect the selected repo using `runtime-architecture.md`. An existing app's consistent stack is inherited for normal feature work; a handoff that requires a different stack creates a migration decision rather than overriding the repo.

If the conflict would change target root, framework, rendering/build architecture, UI behavior, data semantics, or design-system scope, pause affected implementation and resolve it with the named owner. Record the competing sources, affected work, and existing approval or missing decision; continue independent confirmed work. A confirmed DTO whose shape differs from a UI model is ordinarily a mapper requirement, not a conflict demanding that either shape be copied over the other.
