# flow-preview-chrome Specification

## Purpose

TBD - created by archiving change 'fix-flow-preview-chrome-leak'. Update Purpose after archive.

## Requirements

### Requirement: Flow preview hides prototype chrome

The scaffolded prototype component (React and Vue templates) SHALL render its prototype chrome — the header block carrying the "Prototype" eyebrow plus active route title, and the route navigation button row — only outside flow preview mode. When flow preview mode is active (the `isFlowPreview` prop is true, or the `prototypeFlowPreview=true` query parameter is present), the component SHALL NOT render the header block or the route navigation row. Route panel content SHALL remain rendered in both modes.

#### Scenario: Static Flow card renders without chrome (React)

- **WHEN** the Static Flow export renders a route preview by mounting the prototype with `isFlowPreview` set to true
- **THEN** the rendered route card contains no "Prototype" header block and no route navigation buttons, only the route content

#### Scenario: Iframe query mode renders without chrome (Vue)

- **WHEN** a Vue-scaffolded prototype story is loaded with `?prototypeFlowPreview=true&prototypeRoute=<route-id>`
- **THEN** the rendered page contains no header block and no route navigation row, only the addressed route content

#### Scenario: Standalone story keeps chrome

- **WHEN** the prototype story is rendered without the `isFlowPreview` prop and without the `prototypeFlowPreview` query parameter
- **THEN** the header block and route navigation row render as before, and route switching via the navigation buttons still works


<!-- @trace
source: fix-flow-preview-chrome-leak
updated: 2026-08-28
code:
  - storybook-product-prototype/references/ui-flow-contract.md
  - design-system-to-storybook/storybook-template/src/pages/prototypes/README.md
  - storybook-product-prototype/scripts/validate_prototype.py
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/example-prototype.css
  - storybook-product-prototype/assets/prototype-template/feature-prototype.css.template
  - storybook-product-prototype/assets/prototype-template-vue/FeaturePrototype.vue.template
  - storybook-product-prototype/references/storybook-integration.md
  - storybook-product-prototype/SKILL.md
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/.openspec.yaml
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/proposal.md
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/specs/flow-preview-chrome/spec.md
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - storybook-product-prototype/assets/prototype-template/FeaturePrototype.tsx.template
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/tasks.md
-->

---
### Requirement: Defensive CSS chrome hiding

The shared prototype CSS template SHALL contain rules scoped under the flow-preview root modifier class that hide the scaffolded header and navigation class names. These rules SHALL apply even when the component markup renders the chrome elements, so prototypes whose markup was rewritten but whose scaffolded class names survive are still covered.

#### Scenario: Chrome markup with scaffolded classes is hidden by CSS

- **WHEN** a generated prototype renders header or navigation elements carrying the scaffolded chrome class names inside a root element carrying the flow-preview modifier class
- **THEN** those elements are hidden by the stylesheet without any component code change


<!-- @trace
source: fix-flow-preview-chrome-leak
updated: 2026-08-28
code:
  - storybook-product-prototype/references/ui-flow-contract.md
  - design-system-to-storybook/storybook-template/src/pages/prototypes/README.md
  - storybook-product-prototype/scripts/validate_prototype.py
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/example-prototype.css
  - storybook-product-prototype/assets/prototype-template/feature-prototype.css.template
  - storybook-product-prototype/assets/prototype-template-vue/FeaturePrototype.vue.template
  - storybook-product-prototype/references/storybook-integration.md
  - storybook-product-prototype/SKILL.md
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/.openspec.yaml
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/proposal.md
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/specs/flow-preview-chrome/spec.md
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - storybook-product-prototype/assets/prototype-template/FeaturePrototype.tsx.template
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/tasks.md
-->

---
### Requirement: Validator enforces chrome hiding

The prototype validator SHALL verify that the prototype component conditionally suppresses its chrome using the negated embedded flow preview flag (the text `!isEmbeddedFlowPreview`). When the component file lacks this conditional, validation SHALL report an error naming the flow preview chrome requirement. The check SHALL apply identically in React mode and Vue mode.

#### Scenario: Component without the conditional fails validation

- **WHEN** the validator runs against a prototype whose component file does not contain `!isEmbeddedFlowPreview`
- **THEN** the validator reports an error stating the prototype must hide its own chrome in flow preview mode

#### Scenario: Freshly scaffolded prototypes pass

- **WHEN** the scaffold script generates a React prototype and a Vue prototype and the validator runs against each
- **THEN** the chrome-hiding check passes for both frameworks


<!-- @trace
source: fix-flow-preview-chrome-leak
updated: 2026-08-28
code:
  - storybook-product-prototype/references/ui-flow-contract.md
  - design-system-to-storybook/storybook-template/src/pages/prototypes/README.md
  - storybook-product-prototype/scripts/validate_prototype.py
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/example-prototype.css
  - storybook-product-prototype/assets/prototype-template/feature-prototype.css.template
  - storybook-product-prototype/assets/prototype-template-vue/FeaturePrototype.vue.template
  - storybook-product-prototype/references/storybook-integration.md
  - storybook-product-prototype/SKILL.md
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/.openspec.yaml
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/proposal.md
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/specs/flow-preview-chrome/spec.md
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - storybook-product-prototype/assets/prototype-template/FeaturePrototype.tsx.template
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/tasks.md
-->

---
### Requirement: Documentation declares the chrome contract

The skill documentation SHALL state that flow preview mode hides the prototype's own chrome: the UI Flow contract acceptance list, the Storybook integration reference, and the skill entry document SHALL each carry this rule so hand-written prototypes follow it without reading template source.

#### Scenario: Acceptance list carries the chrome rule

- **WHEN** a reader consults the UI Flow contract acceptance list
- **THEN** it contains an item requiring the prototype to hide its own header and route navigation in flow preview mode

<!-- @trace
source: fix-flow-preview-chrome-leak
updated: 2026-08-28
code:
  - storybook-product-prototype/references/ui-flow-contract.md
  - design-system-to-storybook/storybook-template/src/pages/prototypes/README.md
  - storybook-product-prototype/scripts/validate_prototype.py
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/example-prototype.css
  - storybook-product-prototype/assets/prototype-template/feature-prototype.css.template
  - storybook-product-prototype/assets/prototype-template-vue/FeaturePrototype.vue.template
  - storybook-product-prototype/references/storybook-integration.md
  - storybook-product-prototype/SKILL.md
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/.openspec.yaml
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/proposal.md
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/specs/flow-preview-chrome/spec.md
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - storybook-product-prototype/assets/prototype-template/FeaturePrototype.tsx.template
  - design-system-to-storybook/storybook-template/openspec/changes/fix-flow-preview-chrome-leak/tasks.md
-->