## ADDED Requirements

### Requirement: Third-stage skill scope and boundary

A new skill folder, production-data-integration, SHALL own stage 3 of the integration ownership chain: real API clients, auth/session, cache policy, storage, persistence, and environment configuration, replacing the mock adapters the assembly pass delivered. Its inputs SHALL be four artifacts: the PRODUCTION_HANDOFF API And Data Contracts table (including the Adapter interface and Semantics columns), the IMPLEMENTATION_MAP Data Adapter Seams table, the fixtures/*.json files, and the DATA_SPEC JSON Schema blocks. The skill SHALL NOT change UI behavior, route flow, components, or tokens; when reality diverges from the documented contract, it SHALL report the divergence and update the handoff docs and regression story per the change rule instead of editing the UI in place. Unknown endpoints or auth SHALL be asked of the named owner, never invented.

#### Scenario: Contract mismatch discovered during wiring

- **WHEN** the real API returns a field shape that differs from the DATA_SPEC JSON Schema
- **THEN** the skill reports the divergence, asks the contract owner which side changes, and updates the handoff docs when the contract side changes — the UI code is not silently reshaped

#### Scenario: Unknown endpoint

- **WHEN** a fixture group's Expected source is still marked unknown
- **THEN** the skill stops and asks the named owner for the endpoint instead of inventing one

### Requirement: Data wiring workflow

The data-wiring-workflow reference SHALL define the replacement procedure: inventory every seam from the Data Adapter Seams table; confirm endpoint, auth, and semantics per contract row with the named owner; implement the real DataSource per the target repo's existing client conventions (the repo's fetch/query layer on web, URLSession-based clients on iOS, Retrofit/Ktor-style clients on Android); swap the injection point from Mock to real; and keep the mock implementation in place for tests. Completion SHALL be defined as: every seam has a real implementation and swapped injection, contract tests pass, every AC-P criterion tagged integration is settled, and the IMPLEMENTATION_MAP seams table gains the real implementation path.

#### Scenario: Seam replacement

- **WHEN** the seams table maps the alertsRoutes group to MockAlertsDataSource
- **THEN** the pass implements the real AlertsDataSource against the confirmed endpoint, swaps the injection point, keeps the mock for tests, and records the real path in the seams table

### Requirement: Contract test gate

The contract-testing reference SHALL require, per fixture group: a contract test validating the real response against the group's DATA_SPEC JSON Schema (decode-based validation counts on typed platforms); assertions that each documented error-taxonomy class maps to the documented UI error state; at least one behavior assertion per recorded Semantics entry (pagination, freshness, mutation semantics); and use of fixtures/*.json as the shape reference — field sets and types, not values. Tests SHALL use the target repo's existing test framework; the pass SHALL NOT introduce a new test framework for this purpose.

#### Scenario: Schema-validated response

- **WHEN** the contract test fetches the real alertsRoutes response
- **THEN** the response decodes/validates against the alertsRoutes JSON Schema and the test fails on a missing required field or a type mismatch

#### Scenario: Retryable error mapping

- **WHEN** the error taxonomy marks timeouts as retryable
- **THEN** a test asserts the timeout path surfaces the documented retry state rather than a terminal error state
