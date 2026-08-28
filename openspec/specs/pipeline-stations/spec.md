# pipeline-stations Specification

## Purpose

TBD - created by archiving change 'prototype-production-family'. Update Purpose after archive.

## Requirements

### Requirement: Six-station pipeline reference

A new reference, storybook-product-prototype/references/pipeline-stations.md, SHALL define the prototype-to-production pipeline as six stations, each with its inputs, outputs, and machine or human gate: (1) prototype authoring by storybook-product-prototype gated by validate_prototype.py plus typecheck and Storybook build; (2) team demo confirmation, a human gate that flips Review Status to confirmed; (3) handoff finalization gated by --handoff-ready and producing HANDOFF_MANIFEST.json; (4) frontend assembly in mock mode by frontend-product-implementation for web or native-product-implementation for iOS/Android, gated by governance gates, the mock-mode walkthrough, and validate_implementation.py; (5) data integration by production-data-integration gated by contract tests and the AC-P integration criteria; (6) visual and acceptance QA gated by ui-pixel-align-report evidence, ui-compare-to-reference fixes, and a fully passing acceptance traceability table. The reference SHALL state that the platform fork sits after station 3: one handoff, per-platform implementation skills.

#### Scenario: Reading the pipeline for a native delivery

- **WHEN** a team plans an iOS delivery from an existing prototype
- **THEN** the reference tells them stations 1-3 are platform-neutral, station 4 uses native-product-implementation, and stations 5-6 close the loop with contract tests and visual QA

---
### Requirement: Orchestrate encoding example

pipeline-stations.md SHALL include an agent-automation-orchestrate configuration example encoding the six stations as tasks in a .agent-automation/config.json shape: stations 1 and 3 as automatable tasks, station 2 as a designer decision stop, stations 4 through 6 as separate tasks whose start condition is the station-3 manifest, with per-station commands left as named placeholders and a note that the orchestrate skill's own config contract is authoritative.

#### Scenario: Bootstrapping a repeatable pipeline

- **WHEN** a project wants the pipeline re-runnable
- **THEN** the example config is copied, its placeholder commands are replaced with the project's real commands, and station 2 remains a human stop rather than an automated step

---
### Requirement: Cross-skill pipeline pointers

The SKILL.md files of storybook-product-prototype, frontend-product-implementation, native-product-implementation, and production-data-integration SHALL each contain a line naming pipeline-stations.md (by skill and reference name) as the definition of where that skill sits in the pipeline and which gates precede and follow it.

#### Scenario: Discovering the pipeline from any skill

- **WHEN** an agent loads any of the four skills
- **THEN** the skill text names the pipeline reference and the agent can locate its own station and gates without conversation context

---
### Requirement: Scope B visual parity coverage

frontend-product-implementation's verification-reporting reference SHALL extend prototype parity comparison from newly created components to every surface the Prototype To Frontend Map marks Scope B: each B route or region is compared side by side against the prototype Storybook route in mock mode, with ui-pixel-align-report producing the evidence and ui-compare-to-reference owning fixes. Scope A surfaces SHALL be explicitly excluded from parity fixing — prototype fidelity is never a reason to modify an already-shipping surface.

#### Scenario: Parity sweep on a mixed map

- **WHEN** the map marks the entry route B and the settings route A
- **THEN** the parity sweep compares the entry route against the prototype and skips the settings route, recording the exclusion
