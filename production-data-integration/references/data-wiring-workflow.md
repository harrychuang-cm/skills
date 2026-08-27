# Data Wiring Workflow

Use this reference to replace mock adapters with real data sources, one seam at a time.

## Contents

1. Seam Inventory
2. Contract Confirmation
3. Real Implementation
4. Injection Swap
5. Records And Completion

## 1. Seam Inventory

Build the work list before writing any client code. For each fixture group, record:

- fixture group name (the key that ties handoff docs, fixtures, and schema together)
- the `<Feature>DataSource` interface name and its file path
- the `Mock<Feature>DataSource` implementation path
- the injection point: where the app decides which implementation the feature receives (a provider, container, DI module, factory, environment value, or constructor call site)
- the routes or screens that consume the group
- the contract row in `PRODUCTION_HANDOFF.md` that describes its expected source

`IMPLEMENTATION_MAP.md`'s Data Adapter Seams table gives the first four directly. When that file is missing, reconstruct the inventory by finding the DataSource interfaces in the repo and their mock implementations, and record in the final report that the map was absent — the reconstruction is evidence, not a substitute for the assembly pass's record.

A seam with no matching contract row, or a contract row with no matching seam, is a discrepancy: report it before implementing anything for that group.

## 2. Contract Confirmation

For each seam, confirm with the owner named in the contract row before implementing. Confirm:

- **Endpoint and method**: the exact service, path, and verb, or the non-HTTP source (local store, platform service, feature-flag provider, static content).
- **Auth and permission**: the scheme, where the token comes from, how it refreshes, and what an unauthorized response looks like.
- **Semantics**, the five entries the handoff's `Semantics` column records:
  - `pagination`: cursor, offset, or none — and the parameter and response fields that carry it
  - `sort` / `filter`: which fields the caller may pass
  - `freshness`: static, poll (with interval), or push (with transport)
  - `mutation`: create/update/delete, whether it is idempotent, whether optimistic updates are allowed
  - `errors`: which classes are retryable, which are terminal, which require reauthentication
- **Environment**: which environments exist, how base URLs and credentials are supplied, and which environment this work targets.

Every unresolved item is a blocking question for that seam — ask, and implement the other seams meanwhile. Never invent an endpoint, guess an auth scheme, ship a placeholder base URL, or assume a missing `Semantics` entry means "none".

When the confirmed answer contradicts the documented contract, that is a divergence: report it, agree with the owner which side changes, and when the contract side changes, write it back to `PRODUCTION_HANDOFF.md` and `DATA_SPEC.md` before implementing against the new understanding.

## 3. Real Implementation

Implement the real `<Feature>DataSource` following the target repo's established conventions — this skill adds data plumbing, it does not introduce an architecture:

| Target | Follow |
| --- | --- |
| Web | The repo's existing fetch/query/client layer, its error and retry helpers, and its environment-config mechanism |
| iOS | `URLSession`-based clients (or the app's existing networking layer), Swift concurrency conventions, `Codable` decoding, Keychain for credentials |
| Android | The module's existing Retrofit/Ktor-style client, coroutine conventions, `kotlinx.serialization` decoding, and its credential storage |

Rules:

- Generate or reuse the request/response/error types from the `DATA_SPEC.md` JSON Schema blocks; do not hand-shape types from the mock data.
- Map transport and domain failures onto the documented error taxonomy so the UI's existing error states keep working — the UI does not change to accommodate a new error shape.
- Implement pagination, sorting, filtering, and freshness exactly as confirmed; a poll interval or cursor parameter invented here becomes a silent product decision.
- Put credentials and base URLs in the repo's existing environment mechanism. Never commit a secret, and never widen a credential's scope for convenience.
- Respect cache and persistence decisions from the contract; when the contract is silent and the repo has a convention, follow the convention and record the choice.
- Do not touch UI files, route definitions, navigation, components, or tokens. If the feature appears to need such a change, that is a contract divergence to report, not an edit to make.

## 4. Injection Swap

Switch the feature from mock to real at the injection point recorded in the inventory:

1. Register the real implementation where the app resolves the DataSource for this feature.
2. Keep `Mock<Feature>DataSource` in the codebase — tests, previews, screenshot tests, and offline development still depend on it. Deleting the mock destroys the seam the next change needs.
3. Keep the swap explicit and reversible: a single registration or configuration point, not real-client code inlined into the feature.
4. Verify the swap by running the feature's existing tests and a manual pass of the primary journey against the real source.

## 5. Records And Completion

Record the outcome where the assembly pass left its record:

- Add the real implementation path alongside the mock in `IMPLEMENTATION_MAP.md`'s Data Adapter Seams table.
- Settle every `AC-P (integration)` acceptance criterion in the Acceptance Traceability table with `pass`, or with a reason and named owner when it remains blocked.
- Record confirmed `Semantics` answers that the handoff had left unknown, writing them back to the handoff's contract row.
- List remaining open items — unresolved semantics, endpoints owned by another team, capabilities deferred to a later release — each with a named owner.

The work is complete when every seam has a real implementation and a swapped injection point, contract tests pass (`contract-testing.md`), every `AC-P (integration)` criterion is settled, and no UI, route, component, or token changed.
