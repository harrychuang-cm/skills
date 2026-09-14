## MODIFIED Requirements

### Requirement: Third-stage skill scope and boundary

production-data-integration SHALL own real clients, auth/session, cache, storage, persistence and environment configuration behind assembled DataSource seams. Inputs SHALL include the handoff API contracts and semantics, implementation seam map, fixtures for UI/mock reference, and Data Spec schemas with Data Authority evidence. Only confirmed transport sources SHALL authorize DTOs and real wiring. UI behavior, routes, components and tokens SHALL remain outside scope. Unknown endpoints, auth or semantics SHALL block the affected seam and be assigned to its named owner; independent confirmed seams SHALL continue.

#### Scenario: Contract mismatch discovered during wiring
- **WHEN** a real DTO shape differs from a prototype UI-model schema
- **THEN** the skill SHALL map the confirmed transport DTO to the UI model and SHALL NOT require the service to match the fake fixture; missing business semantics SHALL become an explicit decision

#### Scenario: Unknown endpoint
- **WHEN** a seam has no confirmed endpoint
- **THEN** the skill SHALL request the named decision and SHALL NOT invent a path

### Requirement: Contract test gate

Contract tests SHALL validate responses against the confirmed transport contract, assert the DTO-to-UI mapping, cover documented error classes and behavior for each recorded semantics entry, and use fake fixtures only to verify UI/mock expectations. Raw response fields SHALL NOT be required to equal fake fixture fields. Required fields and type mismatches SHALL fail according to the real schema; additional fields SHALL be governed by that schema. Tests SHALL use existing repo tools without adding a test framework.

#### Scenario: Schema-validated response
- **WHEN** the real source returns data.items and nextCursor while the UI model contains state and rows
- **THEN** the transport test SHALL validate the source schema and the mapper test SHALL verify rows without asserting raw shape equality

#### Scenario: Retryable error mapping
- **WHEN** the confirmed error taxonomy marks timeouts retryable
- **THEN** a test SHALL assert the documented retry state rather than a terminal error
