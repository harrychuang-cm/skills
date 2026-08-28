# data-wiring-boundary Specification

## Purpose

TBD - created by archiving change 'prototype-production-readiness'. Update Purpose after archive.

## Requirements

### Requirement: Real data wiring hand-over clause

The frontend-product-implementation skill SHALL NOT wire real API clients, auth, storage, persistence, or environment-specific integrations under any condition. The SKILL.md rule that previously permitted real wiring when the user explicitly asks and the repo provides the pattern SHALL be replaced by a hand-over clause: when the user requests real integration, the skill SHALL deliver the typed adapter interface plus mock implementation, and SHALL transfer the replacement work together with its contract to a named receiving owner instead of implementing it.

#### Scenario: User asks for real API wiring during implementation

- **WHEN** the user asks the frontend-product-implementation pass to connect a screen to the real backend API
- **THEN** the agent produces or confirms the typed adapter interface and mock implementation, records the replacement work and its named receiving owner in the final report, and writes no real API client, auth flow, or environment configuration

#### Scenario: No receiving owner is known

- **WHEN** the handoff documents name no data integration owner and the user has not named one
- **THEN** the agent lists the integration as an open decision that blocks the hand-over and asks the user to name the receiving owner, instead of implementing the integration itself

---
### Requirement: Three-stage integration ownership

The storybook-product-prototype production-handoff reference and the PRODUCTION_HANDOFF template SHALL define integration ownership as three stages: prototype (storybook-product-prototype: UI behavior, fixtures, contract expectations), frontend assembly (frontend-product-implementation: routes, interaction states, typed adapter seams, mock adapters), and data integration (a named receiving owner: real API clients, auth, cache, storage, persistence, environment wiring). The PRODUCTION_HANDOFF template SHALL contain a Data Integration Ownership field that names the receiving owner or records an open decision with an owner responsible for resolving it.

#### Scenario: Handoff written with the upgraded template

- **WHEN** a new PRODUCTION_HANDOFF.md is authored from the template
- **THEN** its Integration Ownership section states the three stages and its Data Integration Ownership field names a team, system, or open decision owner

#### Scenario: Legacy handoff without the field

- **WHEN** validate_prototype.py runs in --handoff-ready mode against a handoff written before this field existed
- **THEN** the missing Data Integration Ownership field is reported as a warning, not an error

---
### Requirement: DataSource contract naming

The frontend-product-implementation implementation-workflow reference SHALL require the adapter seam to follow a named contract: the interface SHALL be named after the feature with a DataSource suffix, the mock implementation SHALL be the same name with a Mock prefix, each fixture group SHALL map to one interface method, and state handling SHALL reuse the DATA_SPEC state vocabulary. The PRODUCTION_HANDOFF API And Data Contracts table SHALL include an Adapter interface column recording the interface name and the mock implementation file path.

#### Scenario: Adapter seam creation for a feature

- **WHEN** the frontend-product-implementation pass implements a feature named Portfolio Alerts with fixture groups for alerts and quotes
- **THEN** it creates a PortfolioAlertsDataSource interface with one method per fixture group and a MockPortfolioAlertsDataSource implementation backed by the deterministic fixtures, and records both in the Adapter interface column

##### Example: naming derivation

| Feature name | Interface | Mock implementation |
| ------------ | --------- | ------------------- |
| Portfolio Alerts | PortfolioAlertsDataSource | MockPortfolioAlertsDataSource |
| Checkout | CheckoutDataSource | MockCheckoutDataSource |

---
### Requirement: Mock-mode flow walkthrough gate

The frontend-product-implementation verification-reporting reference SHALL require, after single-route UI verification, a mock-mode flow walkthrough: driving the production shell with mock adapters through the FLOW_SPEC primary journey and every in-scope branch state, with every documented transition trigger interactively reachable. The completion bar SHALL define done as: the walkthrough passes, every fixture group has a typed interface, a mock implementation, and a recorded replacement point, no real endpoint, auth, or environment variable is introduced, and every real integration item has a named owner.

#### Scenario: Walkthrough finds an unreachable branch

- **WHEN** the mock-mode walkthrough cannot reach a documented error branch through any interaction trigger
- **THEN** the implementation is not complete and the missing branch is fixed or explicitly recorded as deferred with a reason before the final report claims completion

#### Scenario: Completion claim without walkthrough

- **WHEN** the agent prepares the final report and no mock-mode walkthrough result is recorded
- **THEN** the completion criteria are not satisfied and the report states the walkthrough as outstanding work
