## ADDED Requirements

### Requirement: Prototype Metadata Contract

The template SHALL define parameters.prototype as the portable metadata contract for product prototypes. The contract SHALL include an optional top-level components key that records per-route component composition: components.routes[] entries joined to flow routes by route id, each entry carrying name, origin (shared | local | promoted), importPath, and optional storyId, storyTitle, and note; plus an optional components.classPrefix (project-wide component root-class prefix) and an optional per-entry domSelector that overrides the classPrefix + kebab(name) selector derivation.

#### Scenario: Story exposes prototype metadata

- **WHEN** a Storybook story defines parameters.prototype with id, title, description, docs, flow, and data
- **THEN** the prototype inspector reads that metadata without requiring project-specific component names or token prefixes

#### Scenario: Story exposes component composition metadata

- **WHEN** parameters.prototype.components defines routes[] entries with name, origin, and importPath, optionally storyId, storyTitle, note, and domSelector, and optionally a components.classPrefix
- **THEN** the prototype inspector joins each entry to flow.routes by route id and renders the Components workspace from that metadata

#### Scenario: Missing components metadata

- **WHEN** parameters.prototype omits the components key, or components carries unknown extra fields
- **THEN** all other review modes render unchanged, unknown fields are ignored, and Components mode displays an explanatory empty state describing the components.routes[] contract instead of an error

#### Scenario: Missing prototype metadata

- **WHEN** a Storybook story does not define parameters.prototype
- **THEN** Story mode renders the original story and prototype-specific review modes display no prototype surface

### Requirement: Prototype Review Modes

The prototype inspector SHALL provide Story, Docs, UI Flow, Components, and Data modes, in that toolbar order, for stories that expose parameters.prototype.

#### Scenario: Story mode

- **WHEN** the prototype toolbar is set to Story
- **THEN** the original story renders without prototype inspector replacement content

#### Scenario: Docs mode

- **WHEN** the prototype toolbar is set to Docs and parameters.prototype.docs contains at least the minimum document set of PRD, UI Spec, Flow Spec, Data Spec, Acceptance, and Implementation Guide markdown
- **THEN** the inspector renders document tabs for each available document and displays the selected markdown document, and when the optional productionHandoff document is present it additionally renders a Frontend Handoff tab that is hidden while the document is absent

#### Scenario: Components workspace

- **WHEN** the prototype toolbar is set to Components and parameters.prototype.components provides entries for at least one route
- **THEN** the inspector renders a three-pane workspace: a route rail listing flow routes in flow order, a component card list for the selected route where each card shows name, an origin badge (shared | new | promoted), storyTitle, importPath, and note with Story and Docs open-links via the storybook-path URL mechanism, and a live same-origin route preview iframe (prototypeFlowPreview plus prototypeRoute) with a 375x812 natural viewport scaled to fit the pane

#### Scenario: Card-to-preview highlight

- **WHEN** a reviewer hovers or keyboard-focuses a component card whose highlight selector resolves (entry.domSelector when present, else "." + classPrefix + kebab(name), else the card offers no highlight affordance)
- **THEN** the inspector outlines every matching element inside the preview iframe through an injected data-pi-highlight style, scrolls the first match into view, and shows the match count on the card, and when the selector matches zero elements the card shows a muted "not in current state" chip

#### Scenario: Preview-to-card reverse hover

- **WHEN** a reviewer hovers a rendered component instance inside the route preview iframe
- **THEN** the inspector resolves the deepest closest-match among the selected route's entries, outlines only that hovered instance, marks the matching card with the .prototype-inspector__components-card--preview-hover modifier, and scrolls that card into nearest view; reverse-hover owns the highlight while the pointer remains inside the preview, any keyboard-focused card highlight is restored when reverse-hover clears, and the preview listeners never intercept clicks or navigation inside the preview

#### Scenario: Data mode

- **WHEN** the prototype toolbar is set to Data and parameters.prototype.data contains overview, apiContracts, dataSources, schemas, routeDataRequirements, stateRules, and fixtures
- **THEN** the inspector renders structured data sections plus a raw payload section

### Requirement: UI Flow Canvas

The prototype inspector SHALL render a UI Flow canvas from parameters.prototype.flow routes, nodes, and transitions.

#### Scenario: Render route cards and flow nodes

- **WHEN** flow.routes contains two route records and flow.nodes contains one decision node
- **THEN** UI Flow mode renders two route preview cards and one flow-only node on the canvas

#### Scenario: Render key transition edges

- **WHEN** flow.transitions contains three transitions and two transitions set flowLine to key
- **THEN** UI Flow mode renders visible edges only for the two key transitions and keeps the third transition out of the canvas edge layer

##### Example: key transition filtering

| Transition | flowLine | Visible Edge |
| ---------- | -------- | ------------ |
| overview to detail | key | yes |
| detail to form | key | yes |
| form to detail | reference | no |

### Requirement: UI Flow Layout Persistence

The prototype inspector SHALL support draggable route and node positions, fit/manual zoom, layout export, and layout import using a generic schema.

#### Scenario: Export layout

- **WHEN** a reviewer drags a route card and clicks Export Layout
- **THEN** the downloaded JSON contains schema, version, prototypeId, exportedAt, and positions fields

#### Scenario: Import matching layout

- **WHEN** a reviewer imports a layout JSON whose positions match route or node ids in the current prototype
- **THEN** UI Flow mode applies the imported positions to the matching canvas items

#### Scenario: Reject non-matching layout

- **WHEN** a reviewer imports a layout JSON with no positions matching the current prototype routes or nodes
- **THEN** UI Flow mode keeps the current layout and reports that no matching UI Flow positions were found

### Requirement: Route Preview Measurement

The prototype inspector SHALL measure iframe route previews through generic prototype preview markers and Storybook fallbacks, not through project-specific component selectors.

#### Scenario: Route preview opts into measurement

- **WHEN** a route iframe contains an element with data-prototype-route-preview set to true
- **THEN** UI Flow mode uses that element width and height as the route preview size

#### Scenario: Route preview has no marker

- **WHEN** a route iframe has no data-prototype-route-preview marker
- **THEN** UI Flow mode measures the Storybook root or document body width and height without querying inventory-prototype selectors

### Requirement: Static Flow Export

A prototype SHALL be able to expose a sibling static flow story for Figma export when its metadata includes a flow export story id.

#### Scenario: Open static flow story

- **WHEN** parameters.prototype includes a flow export story id and the reviewer clicks Open Static Flow
- **THEN** Storybook opens the sibling static flow story with Figma export enabled and prototype mode set to Story

#### Scenario: No static flow story

- **WHEN** parameters.prototype has no flow export story id
- **THEN** UI Flow mode omits the Open Static Flow control

#### Scenario: Static flow uses saved UI Flow layout

- **WHEN** a reviewer drags route cards or flow nodes in UI Flow and opens the sibling Static Flow story on the same origin
- **THEN** Static Flow reads the generic `prototype-inspector:flow-layout:<prototype id>` positions before falling back to metadata positions

#### Scenario: Static flow matches route preview sizing

- **WHEN** a static flow route card renders the same route UI used by UI Flow iframe previews
- **THEN** the static preview reserves the same route UI width and height, with headers and borders treated as outer chrome

#### Scenario: Static flow matches UI Flow visual conventions

- **WHEN** the sibling Static Flow story renders route cards, flow-only nodes, visible edges, arrows, and edge labels
- **THEN** it uses the same canvas background, route card chrome, flow-node shape rules, dashed orthogonal edge style, color variants, arrowheads, and label pill conventions as UI Flow mode

### Requirement: Neutral Example Prototype

The template SHALL include one neutral example prototype that demonstrates the complete Prototype UI Flow contract without ChipK domain language.

#### Scenario: Example prototype covers required artifacts

- **WHEN** the initialized template is inspected
- **THEN** src/pages/prototypes/example-prototype contains an interactive story, static flow export story, flow metadata, fixture data, prototype meta object with a components block, scoped CSS, PRD, UI Spec, Flow Spec, Data Spec, Acceptance, and Implementation Guide

#### Scenario: Example prototype verifies all review modes

- **WHEN** the example prototype story is opened in Storybook
- **THEN** Story, Docs, UI Flow, Components, and Data modes each render meaningful content from the example prototype metadata
