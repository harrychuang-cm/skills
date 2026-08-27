# Data Contract

Use this reference when creating `DATA_SPEC.md` and `<featurePrototypeData>.ts`.

## Fixture Rules

- Keep fixtures local and deterministic.
- Author every fixture group in two carriers with the same values: typed data in the `.ts` file, and language-neutral JSON at `fixtures/<group>.json` inside the prototype folder. The JSON carrier is what native platforms and the receiving mock adapters load; `validate_prototype.py --handoff-ready` cross-checks the two.
- Use existing component prop types when possible.
- Name fixture groups by route or domain.
- Include branch fixtures when the UI Flow contains branch nodes.
- Include empty, loading, disabled, and error fixtures when those states are in scope.
- Do not call live product APIs from a prototype.
- For frontend handoff, map every fixture group to an expected API, service, local storage, feature flag, or static content contract.
- Do not wire real data sources, auth/session, backend clients, cache, storage, or persistence inside the prototype unless the user explicitly scopes that work.

## Data Spec Sections

Use these sections:

```markdown
# Data Spec

## Source Of Truth

## Fixture Inventory

## Route Data Requirements

## Data Schemas (JSON Schema)

## API Replacement Points

## State And Branch Fixtures

## AI Update Rules
```

## JSON Schema Blocks

The `Data Schemas (JSON Schema)` section holds one fenced `json` block per fixture group, describing the group's entity shape, its request/response/error expectations when they exist, and its state enumeration. Write or update a block whenever a fixture group is created or changed. Web generates TypeScript types from the schema, iOS generates Codable types, Android generates kotlinx.serialization types — the schema, not the `.ts` file, is the cross-platform contract.

## API Replacement Points

For each future API or service, document:

- endpoint or service name
- method if known
- request shape
- response shape
- owning team or source
- routes that consume it
- fixture group that currently mocks it
- auth, permission, cache, persistence, or offline constraints when known
- receiving implementation owner for real data wiring
- the five semantics the data-integration pass must know before it can wire anything:
  - `pagination`: `cursor`, `offset`, or `none` — and the parameter and response fields that carry it
  - `sort` / `filter`: which fields the caller may pass
  - `freshness`: `static`, `poll` (with interval), or `push` (with transport)
  - `mutation`: create/update/delete, whether it is idempotent, whether optimistic updates are allowed
  - `errors`: which classes are retryable, which are terminal, which require reauthentication

Record an unresolved semantic as `unknown` with the owner who answers it. Never guess one — a missing entry costs one question, a wrong one ships as a silent product decision (an invented poll interval, a pagination scheme the backend does not implement).

## Data Invariants

Document invariants that UI and tests rely on, such as:

- stable ids for route keys
- required fields for each card or row
- direction or status values controlling visual state
- branch fixture values that trigger success and error flows
- fixture fields that must remain stable across web and app frontend implementations
