# flow-codegen Specification

## Purpose

TBD - created by archiving change 'prototype-production-family'. Update Purpose after archive.

## Requirements

### Requirement: Flow JSON export

A new script, storybook-product-prototype/scripts/export_flow.py, SHALL parse a prototype folder's *PrototypeFlow.ts using the parsing helpers already in validate_prototype.py and write docs/flow.json with flowSchemaVersion 1, the feature name, routes (id, title, navigationId, and the optional component, description, params, deepLink), nodes (id, title, shape, and the optional tone, description), and transitions (from, to, trigger, label, and the optional kind, presentation, backBehavior). The layout-only fields flowPosition, sourceAnchor, and flowLine SHALL NOT appear anywhere in the output. When the folder has no *PrototypeFlow.ts or the flow declares no routes, the script SHALL print a named error and exit non-zero. The script SHALL use only the Python standard library.

#### Scenario: Export strips layout fields

- **WHEN** the flow file declares routes with flowPosition and a transition with sourceAnchor and flowLine
- **THEN** docs/flow.json contains those routes and transitions with navigation fields intact and none of the three layout keys anywhere in the document

#### Scenario: Missing flow file

- **WHEN** the script runs against a folder without a *PrototypeFlow.ts
- **THEN** it prints an error naming the expected file pattern and exits with a non-zero code

---
### Requirement: Swift navigation skeleton generation

With --swift <path>, the script SHALL generate a Swift file containing an enum named after the feature with a Route suffix, conforming to Hashable, with one case per route: kebab-case route ids become camelCase case names, and declared params become associated values using the type mapping string to String, number to Double, boolean to Bool, and any other type to String. The file SHALL carry a generated-by header naming the regeneration command, a deep-link table comment for routes that declare deepLink, and a navigation scaffold comment grouping transitions by their presentation value (push, sheet, fullscreen, modal, replace).

#### Scenario: Route with parameters

- **WHEN** the flow declares route alert-detail with params name alertId type string
- **THEN** the Swift output contains a case named alertDetail with an associated value alertId of type String

##### Example: case naming and typing

| Route id | params | Swift case |
| -------- | ------ | ---------- |
| price-watch | none | case priceWatch |
| alert-detail | alertId: string | case alertDetail(alertId: String) |
| history | days: number | case history(days: Double) |

---
### Requirement: Kotlin navigation skeleton generation

With --kotlin <path>, the script SHALL generate a Kotlin file containing a sealed class named after the feature with a Route suffix: routes without params become objects, routes with params become data classes using the same type mapping (string to String, number to Double, boolean to Boolean, other to String), each carrying a route pattern string derived from the route id and params for NavHost registration, with deepLink patterns preserved where declared and a NavHost scaffold comment grouping transitions by presentation.

#### Scenario: Sealed class output

- **WHEN** the flow declares routes price-watch and alert-detail (alertId param)
- **THEN** the Kotlin output contains a sealed class with an object for PriceWatch and a data class AlertDetail with alertId of type String and a route pattern containing the alertId placeholder

---
### Requirement: Codegen regression coverage

test_scaffold_validate.py SHALL exercise export_flow.py against the scaffolded prototype in both framework rounds' shared flow file: it SHALL assert that docs/flow.json is written and contains none of the three layout keys, that the --swift output contains the enum declaration and at least one case, and that the --kotlin output contains the sealed class declaration. Compilation of the generated files is out of scope for the smoke test.

#### Scenario: Smoke test coverage

- **WHEN** test_scaffold_validate.py runs
- **THEN** an export_flow round runs against a scaffolded prototype and the structural assertions above pass in the same run that validates scaffolding
