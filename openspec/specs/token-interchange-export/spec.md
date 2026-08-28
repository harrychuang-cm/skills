# token-interchange-export Specification

## Purpose

TBD - created by archiving change 'prototype-production-readiness'. Update Purpose after archive.

## Requirements

### Requirement: DTCG token export from the prototype alias block

A new script, storybook-product-prototype/scripts/export_prototype_contracts.py, SHALL parse the prototype CSS alias block whose declarations follow the fixed form of a --proto- prefixed custom property bound to a var() reference with a raw fallback, and SHALL write docs/TOKENS.json in W3C Design Tokens (DTCG) format: one token per alias role, with $value taken from the fallback value and $extensions recording the source token name and the project token prefix. When the prototype CSS contains no parseable alias block, the script SHALL print an error naming the expected block and exit with a non-zero code. The script SHALL use only the Python standard library.

#### Scenario: Export from a conforming alias block

- **WHEN** the prototype CSS contains a declaration binding --proto-accent to var(--sbt-sys-color-primary, #2563eb) and the script runs against the prototype folder
- **THEN** docs/TOKENS.json contains an accent token with $value #2563eb and an extension recording --sbt-sys-color-primary as the source token

#### Scenario: Missing alias block

- **WHEN** the prototype CSS has no --proto- alias declarations
- **THEN** the script prints an error that names the expected alias block and exits with a non-zero code

---
### Requirement: Token type inference

The export SHALL infer each token's $type from its fallback value: hex, rgb, rgba, hsl, and hsla values map to color; px, rem, and em values map to dimension; bare numeric values map to number; every other value maps to string with the raw value preserved in $value. Inference failure SHALL never abort the export.

#### Scenario: Mixed value forms

- **WHEN** the alias block contains a color fallback, a rem fallback, and a font stack fallback
- **THEN** the export assigns color, dimension, and string types respectively and completes with exit code 0

##### Example: inference table

| Fallback value | $type |
| -------------- | ----- |
| #2563eb | color |
| rgba(0, 0, 0, 0.4) | color |
| 1.5rem | dimension |
| 12px | dimension |
| 600 | number |
| "IBM Plex Sans", sans-serif | string |
