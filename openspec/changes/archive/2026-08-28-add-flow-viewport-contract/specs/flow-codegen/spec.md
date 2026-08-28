## MODIFIED Requirements

### Requirement: Flow JSON export

The script storybook-product-prototype/scripts/export_flow.py SHALL parse a prototype folder's *PrototypeFlow.ts using the parsing helpers already in validate_prototype.py and write docs/flow.json with flowSchemaVersion 1, the feature name, routes (id, title, navigationId, and the optional component, description, params, deepLink, viewport), nodes (id, title, shape, and the optional tone, description), and transitions (from, to, trigger, label, and the optional kind, presentation, backBehavior). When the flow declares a viewport, the document SHALL include a top-level viewport object with formFactor, width, and height, and each route declaring an override SHALL include its viewport object with width and height; when the flow declares no viewport, the viewport keys SHALL be omitted entirely so legacy documents are unchanged. The viewport fields are product semantics, not canvas layout, and SHALL NOT be stripped. The layout-only fields flowPosition, sourceAnchor, and flowLine SHALL NOT appear anywhere in the output. When the folder has no *PrototypeFlow.ts or the flow declares no routes, the script SHALL print a named error and exit non-zero. The script SHALL use only the Python standard library.

#### Scenario: Export strips layout fields

- **WHEN** the flow file declares routes with flowPosition and a transition with sourceAnchor and flowLine
- **THEN** docs/flow.json contains those routes and transitions with navigation fields intact and none of the three layout keys anywhere in the document

#### Scenario: Missing flow file

- **WHEN** the script runs against a folder without a *PrototypeFlow.ts
- **THEN** it prints an error naming the expected file pattern and exits with a non-zero code

#### Scenario: Viewport included for declaring flows and omitted for legacy flows

- **WHEN** the script runs against a flow declaring viewport { formFactor: "desktop", width: 1280, height: 800 } and again against a flow declaring none
- **THEN** the first document contains the top-level viewport object with those values while the second document contains no viewport key at any level, and both declare flowSchemaVersion 1
