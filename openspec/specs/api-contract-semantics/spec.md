# api-contract-semantics Specification

## Purpose

TBD - created by archiving change 'prototype-production-family'. Update Purpose after archive.

## Requirements

### Requirement: Contract semantics fields

The storybook-product-prototype data-contract reference's API Replacement Points list and the production-handoff reference's API And Data Contracts list SHALL each document five semantics per contract: pagination (cursor, offset, or none), sort and filter capabilities, freshness (static, poll, or push), mutation semantics (create/update/delete, idempotency, whether optimistic updates are allowed), and error taxonomy (retryable, non-retryable, reauthentication required). Unknown values SHALL be recorded as unknown with the owner who resolves them, never guessed.

#### Scenario: Documenting a list endpoint

- **WHEN** a fixture group backs an infinite-scrolling list
- **THEN** the contract records pagination cursor, sort by the documented field, freshness poll, mutation none, and the error classes the list distinguishes

---
### Requirement: Handoff semantics column

The PRODUCTION_HANDOFF template's API And Data Contracts table SHALL carry a Semantics column holding the five semantics as semicolon-separated key: value shorthand (for example pagination: cursor; freshness: poll; errors: retryable/reauth). The column is guidance for the data integration pass; validate_prototype.py SHALL NOT fail a handoff over its content, and the production-data-integration workflow SHALL ask the named owner for any missing entry before wiring.

#### Scenario: Filling the column at handoff time

- **WHEN** a handoff is authored from the upgraded template
- **THEN** each contract row carries a Semantics cell in the shorthand form or an unknown marker with an owner, and validation passes regardless of the cell's content

##### Example: shorthand form

| Semantics cell | Reading |
| -------------- | ------- |
| pagination: cursor; freshness: poll; mutation: none; errors: retryable/reauth | list contract, poll-refreshed |
| pagination: none; freshness: static; mutation: create idempotent; errors: non-retryable | one-shot form submission |
| unknown (owner: backend team) | semantics unresolved, backend team answers |
