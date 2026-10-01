## ADDED Requirements

### Requirement: Data Authority registry

The prototype SHALL keep DATA_SPEC as its single entry point with separate Fake Data and Real Data Contract sections and one Data Authority fenced JSON registry. Registry schemaVersion SHALL be 1 with fixtures and contracts arrays. Fixture records SHALL declare group, values=fake, schemaScope=ui-model|transport, status=proposed|open|confirmed|superseded, source, and owner, with an optional contractId. Contract records SHALL declare id, kind=api|analytics|remote-config|storage|static, status, source, and owner. Confirmed records SHALL carry source reference, revision, confirmedBy, and confirmedOn. Confirmation of a UI model SHALL NOT confer transport authority. Fake values SHALL remain fake when their transport schema is confirmed.

#### Scenario: Fake-only handoff
- **WHEN** every fixture is fake with a proposed UI model, a named owner, and an empty contracts array
- **THEN** data authority validation SHALL pass without requiring an endpoint

#### Scenario: Unsupported confirmation
- **WHEN** a record is confirmed without complete source evidence
- **THEN** validation SHALL fail and SHALL NOT infer evidence from demo confirmation

#### Scenario: Registry structure failures
- **WHEN** the registry has malformed JSON, an unsupported version, invalid enum, duplicate group or id, empty owner, or an unknown contractId
- **THEN** validation SHALL report the offending record and fail

#### Scenario: Legacy and active coverage
- **WHEN** a legacy prototype lacks the registry
- **THEN** draft validation SHALL warn and handoff-ready SHALL fail until all fixture groups are classified; active fixtures SHALL NOT depend on superseded records

### Requirement: Decision Review

The producer and receiving skills SHALL distinguish confirmed, proposed, open, and superseded decisions with source, owner, and scope. Builder suggestions SHALL NOT become normative acceptance criteria. Unknowns SHALL identify the affected behavior and owner; unrelated confirmed work SHALL continue. Product demo confirmation SHALL NOT confirm API or analytics contracts. Handoff-ready SHALL require named, dated, scoped demo confirmation and a Semantic Review record. Semantic review SHALL check suggestion promotion, superseded active clauses, and updates to affected docs, flow, fixtures, metadata and tests. Mechanical checks SHALL NOT claim external source truth or semantic correctness.

#### Scenario: Analytics suggestion
- **WHEN** Builder suggests a reason parameter absent from the confirmed delete_email_failed analytics specification
- **THEN** receivers SHALL retain it only as a proposed decision and SHALL NOT add it to the formal event or acceptance criteria

### Requirement: Remote Config intent handoff

A prototype SHALL describe the controlled region, intended product behavior, demonstrated states, unresolved decisions, and RD owner for Remote Config. Technical keys, providers, polling, cache, permissions and rollout details SHALL remain open without confirmed sources. Explicitly open technical details SHALL NOT prevent independent UI and mock assembly, and SHALL block dependent real integration.

#### Scenario: Text-only Remote Config
- **WHEN** a requirement states that a named region is remotely shown or hidden and names its RD owner without a key
- **THEN** the prototype SHALL demonstrate declared states without inventing a production key or default

### Requirement: Authority display and consumption

The Inspector SHALL read the registry from the existing raw Data Spec, show fixture values as FAKE separately from schema scope and confirmation, and expose source and owner. Missing or invalid authority SHALL display unverified. Frontend and native receivers SHALL create UI models and mocks from UI schema, generate transport DTOs only from confirmed transport evidence, and record authority, injection site, UI model and integration owner/status in Data Adapter Seams. Unclassified legacy data SHALL have no transport authority.

#### Scenario: Confirmed UI data display
- **WHEN** a fake fixture has a confirmed UI-model schema
- **THEN** the Inspector and receiver SHALL distinguish UI confirmation from a confirmed real transport contract
