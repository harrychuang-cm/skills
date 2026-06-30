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

## Extract These Contracts

Build a working map with:

- product goal and primary user
- target surface: web, app, hybrid, shared package, or unknown
- route ids, screen ids, flow-only nodes, and transition triggers
- UI composition, shell, responsive behavior, accessibility, and interaction rules
- expected API/data contracts, fixture groups, states, and branch conditions
- Storybook-only boundaries that must not ship
- frontend handoff acceptance criteria
- open product, design-system, data, API, auth, persistence, or platform decisions

## Handoff To Repo Mapping

For each route or screen, map:

- handoff route id
- production route/screen/navigation target
- components to reuse
- missing child components or tokens
- data adapter or fixture provider
- tests and stories to add
- owner of real API/data integration if known

## Data Boundary

Handoff docs may describe API and data shapes, but they do not require real data wiring.

When real integration is not explicitly scoped:

- create typed interfaces for request, response, errors, and UI state
- create deterministic fixtures or mock adapters
- keep adapter seams easy to replace
- avoid real auth, persistence, storage, cache, and environment assumptions
- list integration ownership as an open decision

## Conflict Handling

When docs disagree:

- Prefer `PRODUCTION_HANDOFF.md` for implementation ownership and platform target.
- Prefer `FLOW_SPEC.md` for route ids and transition triggers.
- Prefer `UI_SPEC.md` for composition, responsive behavior, accessibility, and interaction detail.
- Prefer `DATA_SPEC.md` for fixture groups and API/data shape expectations.
- Prefer `ACCEPTANCE.md` for testable completion criteria.

If the conflict would change UI behavior, data shape, or design-system scope, stop and ask before implementing.
