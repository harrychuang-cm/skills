---
name: production-data-integration
description: "Replace mock data adapters with real API clients, auth/session, cache, storage, persistence, and environment configuration behind the typed DataSource seams a frontend or native assembly pass delivered. Use when a feature runs on mock adapters and needs real data wiring, when connecting a production screen to its backend endpoints, when a PRODUCTION_HANDOFF names a data-integration owner, when contract tests must prove real responses match the documented schemas, or when continuing after frontend-product-implementation or native-product-implementation. This is stage 3 of the prototype-to-production chain: it owns data wiring only and never changes UI behavior, route flow, components, or tokens."
---

# Production Data Integration

Use this skill to turn a mock-mode feature into a real one. The assembly pass before you (`frontend-product-implementation` for web, `native-product-implementation` for iOS/Android) delivered typed `<Feature>DataSource` interfaces with `Mock<Feature>DataSource` implementations backed by the handoff fixtures, and recorded each replacement point. This skill implements the real side of those seams and proves it with contract tests. Pipeline position and gates: `storybook-product-prototype/references/pipeline-stations.md` (station 5).

Integration ownership is three-stage: prototype (`storybook-product-prototype`) → frontend assembly (`frontend-product-implementation` / `native-product-implementation`) → data integration (this skill). You are the named stage-3 receiver.

## Inputs

Four artifacts define the work. Locate all four before writing code:

| Input | What it gives you |
| --- | --- |
| `PRODUCTION_HANDOFF.md` → API And Data Contracts | Per fixture group: expected source/endpoint, request/response/error shapes, the `Adapter interface` column, the `Semantics` column, and the owning team |
| `IMPLEMENTATION_MAP.md` → Data Adapter Seams | The actual interface name, mock implementation path, and injection point for each fixture group |
| `fixtures/*.json` | The deterministic shape reference the mocks return |
| `DATA_SPEC.md` → Data Schemas (JSON Schema) | The machine-readable schema each real response must satisfy |

When `IMPLEMENTATION_MAP.md` is missing, reconstruct the seam inventory from the repo's DataSource interfaces and record that the map was absent. When a schema or contract row is missing for a group, ask the contract owner — do not infer the shape from the mock alone.

## Reference Loading

- Seam inventory, endpoint confirmation, real implementation, and injection swap: `references/data-wiring-workflow.md`
- Contract tests, schema validation, and error taxonomy assertions: `references/contract-testing.md`

## Boundary

This skill owns: real API clients, auth and session integration, cache policy, storage, persistence, environment configuration, and the tests that prove them.

This skill does not own, and must not change:

- UI behavior, layout, or component structure
- route flow, transitions, or navigation semantics
- design tokens, theme values, or shared components
- the acceptance criteria themselves

When reality diverges from the documented contract — the endpoint returns a different shape, an error class the docs never listed, pagination the contract called `none` — report the divergence and ask the contract owner which side changes. When the contract side changes, update `PRODUCTION_HANDOFF.md`, `DATA_SPEC.md`, and the Storybook regression story per the handoff's change rule. Never reshape the UI silently to fit an undocumented response.

When an endpoint, auth mechanism, or semantics entry is unknown, stop and ask the named owner. Do not invent endpoints, guess auth schemes, or ship a placeholder base URL.

## First Actions

1. Locate the four inputs above and the target repo root; record which are present.
2. Inventory every seam from the Data Adapter Seams table: fixture group → interface → mock implementation → injection point.
3. For each contract row, confirm with the named owner: endpoint and method, auth/permission requirement, and each of the five `Semantics` entries (pagination, sort/filter, freshness, mutation semantics, error taxonomy). List every unresolved item as a blocking question before implementing that seam.
4. Discover the repo's existing client, auth, cache, DI, environment-config, and test conventions — the real implementation follows them, not a new pattern introduced by this skill.
5. Implement, swap, and test per `references/data-wiring-workflow.md` and `references/contract-testing.md`, one seam at a time.

## Completion Criteria

Do not consider the work complete until:

- Every seam has a real implementation and its injection point swapped from the mock.
- Every mock implementation is retained for tests and previews, not deleted.
- Contract tests pass for every fixture group: schema validation, error taxonomy mapping, and one behavior assertion per recorded `Semantics` entry.
- Every `AC-P (integration)` acceptance criterion is settled, with its result recorded in the Acceptance Traceability table.
- `IMPLEMENTATION_MAP.md`'s Data Adapter Seams table carries the real implementation path alongside the mock.
- No UI, route, component, or token change was made; any contract divergence is reported and written back to the handoff docs.
- Environment configuration and secrets follow the repo's existing mechanism, with no credential committed to the repo.
- Remaining open items — unresolved semantics, endpoints still owned by another team, deferred capabilities — are listed with their named owners.
