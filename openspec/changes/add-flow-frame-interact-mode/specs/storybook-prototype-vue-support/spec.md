## MODIFIED Requirements

### Requirement: Vue prototype contract parity

The Vue overlay templates SHALL satisfy the same review contract as the React templates: the story templates SHALL set fullscreen layout and attach the prototype meta object to `parameters.prototype`; the static flow story SHALL export a story named StaticFlow; the prototype component SHALL implement the `prototypeFlowPreview`, `prototypeRoute` and `prototypeFlowInteractive` query modes internally and expose the `data-prototype-root` and `data-prototype-route-preview` attributes, with `data-route` holding the currently rendered route id and `data-prototype-interactive="true"` while the interactive mode is active; the static flow export SHALL import the shared prototypeFlowLayout helper, read saved inspector layout positions through the shared storage key, support the flow preview mode, and expose the `data-layout-source` and `data-figma-text-auto-width` attributes. Component references inside Vue SFC templates SHALL use PascalCase.

#### Scenario: Route preview modes work without the inspector

- **WHEN** a scaffolded Vue prototype story is opened with `?prototypeRoute=<entry-route>` or `?prototypeFlowPreview=true` in the story iframe URL
- **THEN** the prototype renders the requested route preview using its internal query handling, without requiring the Prototype Inspector addon

#### Scenario: Interactive preview mode matches React

- **WHEN** a Vue prototype is scaffolded
- **THEN** its component implements `prototypeFlowInteractive` with the same initial-route, in-preview navigation, `data-route` and `data-prototype-interactive` behaviour as the React template, verified by the smoke test's contract assertions, and the validator reports no interact-mode warning for it
