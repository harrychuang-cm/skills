## ADDED Requirements

### Requirement: Tracking comment ingestion

When a producer or receiving skill records an analytics requirement that originates from a `tracking` visual comment into the Data Authority registry, the contract record SHALL declare kind `analytics`, status `proposed`, source `null`, and a named owner. A tracking comment, a product demo confirmation, a passing validation run, or an implemented tracking call SHALL NOT change that status to `confirmed`; confirmation SHALL require a complete source object with reference, revision, confirmedBy, and confirmedOn. Event names, parameters, recording timing, and value definitions that the comment does not state SHALL NOT be added to the contract, the formal event payload, or the acceptance criteria. The handoff authority reference SHALL document this rule and SHALL name the four event fields.

#### Scenario: Tracking comment becomes a proposed analytics contract

- **WHEN** a developer's tracking comment `點擊送出按鈕時送 order_submit_click，帶 stock_id` is recorded for a prototype that keeps a Data Authority registry
- **THEN** the contracts array gains one record with kind `analytics`, status `proposed`, source `null`, and a named owner, and data authority validation passes

#### Scenario: Implemented tracking call does not confirm the contract

- **WHEN** the tracking call for a proposed analytics contract is implemented and its tests pass while no source evidence exists
- **THEN** the contract status remains `proposed`

#### Scenario: Source evidence confirms the contract

- **WHEN** the owner supplies a tracking specification with reference, revision, confirmedBy, and confirmedOn
- **THEN** the contract status becomes `confirmed` with that complete source object

#### Scenario: Unstated parameter stays out of the contract

- **WHEN** an implementer suggests a `reason` parameter that the tracking comment does not state
- **THEN** the parameter is retained only as a separate proposed decision and is absent from the formal event payload and acceptance criteria
