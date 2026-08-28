# acceptance-traceability Specification

## Purpose

TBD - created by archiving change 'prototype-production-readiness'. Update Purpose after archive.

## Requirements

### Requirement: Three-tier acceptance identifiers

The ACCEPTANCE.md template SHALL assign a stable identifier to every acceptance criterion using three prefixes: AC-S- for Storybook prototype acceptance, AC-H- for handoff acceptance, and AC-P- for production acceptance, each followed by a zero-padded three-digit number. The template SHALL contain a Production Integration Acceptance section carrying the AC-P criteria. Every AC-P criterion SHALL carry an owner tag, either assembly for criteria verifiable in mock mode by frontend-product-implementation, or integration for criteria verifiable only after real data wiring.

#### Scenario: Authoring acceptance criteria from the template

- **WHEN** a prototype author fills the ACCEPTANCE.md template for a new feature
- **THEN** every criterion carries a unique AC-S-, AC-H-, or AC-P- identifier and every AC-P criterion carries an assembly or integration tag

##### Example: identifier and tag format

| Criterion line | Valid |
| -------------- | ----- |
| AC-S-001: Every route renders from parameters.prototype metadata | yes |
| AC-P-001 (assembly): Primary journey completes in mock mode | yes |
| AC-P-002 (integration): Real API errors map to the documented error states | yes |
| AC-101: Journey works | no - unknown prefix format |

---
### Requirement: Acceptance identifier validation

validate_prototype.py SHALL check that every acceptance identifier matches the AC-S/AC-H/AC-P pattern and that identifiers are unique across the ACCEPTANCE.md file, reporting violations as errors. In --handoff-ready mode it SHALL additionally check that each of the three tiers contains at least one criterion and that the Production Integration Acceptance section exists; on a legacy ACCEPTANCE.md written before identifiers existed, the absence of identifiers or of the AC-P section SHALL be reported as a warning instead of an error.

#### Scenario: Duplicate identifier

- **WHEN** ACCEPTANCE.md contains two criteria both labeled AC-S-003
- **THEN** validation reports a duplicate-identifier error naming AC-S-003

#### Scenario: Legacy acceptance file

- **WHEN** --handoff-ready runs against an ACCEPTANCE.md that contains no identifiers at all
- **THEN** the missing identifiers are reported as a warning and the run is not failed on that account

---
### Requirement: Acceptance traceability report

The frontend-product-implementation verification-reporting reference SHALL require the final response to include an Acceptance Traceability table with one row per acceptance identifier in scope, mapping the identifier to the implementing files, tests, or stories and to a result of pass, deferred, or not-applicable with a reason. AC-P criteria tagged integration SHALL be recorded as deferred to the data integration owner rather than silently omitted.

#### Scenario: Traceability table in the final report

- **WHEN** the frontend-product-implementation pass completes a feature whose ACCEPTANCE.md defines AC-S, AC-H, and AC-P criteria
- **THEN** the final report contains a table where every identifier appears exactly once with a result and, for deferred rows, the named owner

#### Scenario: Integration-tagged criterion during assembly

- **WHEN** the report is produced while real data wiring has not happened
- **THEN** every AC-P criterion tagged integration appears as deferred with the data integration owner, and every AC-P criterion tagged assembly appears with a pass or a blocking reason
