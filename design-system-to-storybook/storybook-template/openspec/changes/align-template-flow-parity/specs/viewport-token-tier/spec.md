## MODIFIED Requirements

### Requirement: Inspector runtime copies stay in sync with the skill asset

Every file in the .storybook/prototype-inspector folder SHALL be byte-identical to its counterpart in the storybook-product-prototype skill asset folder assets/prototype-inspector, and the two folders SHALL hold the same set of files (today preview.js, prototype-inspector.css, flow-canvas.js, flow-canvas-geometry.js, manager.js and preset.js). The flow layout helper src/pages/prototypes/prototypeFlowLayout.ts SHALL be byte-identical to the skill asset assets/prototype-flow-layout/prototypeFlowLayout.ts, and the review fingerprint scripts/prototype-review/fingerprint.mjs SHALL be byte-identical to the skill asset assets/prototype-review/fingerprint.mjs. Every future edit to either side of any of these pairs, including adding or removing an Inspector module, SHALL be mirrored in the same commit. The template side SHALL NOT introduce behavior of its own into these files.

#### Scenario: Copies match after the sync

- **WHEN** the upstream skill asset Inspector files, flow layout helper or fingerprint are updated and the template syncs them
- **THEN** a byte comparison between each template file and its skill asset counterpart reports no difference

#### Scenario: Divergence is caught upstream

- **WHEN** one side is edited without mirroring the other
- **THEN** the storybook-product-prototype smoke test's byte-diff assertion fails naming the divergent file

#### Scenario: A module added on one side only is caught

- **WHEN** a new Inspector module is added to the skill asset folder without a template copy
- **THEN** the storybook-product-prototype smoke test fails naming that file as present only in the skill asset

##### Example: mirrored pairs

| Template path | Skill asset path |
| ------------- | ---------------- |
| .storybook/prototype-inspector/preview.js | assets/prototype-inspector/preview.js |
| .storybook/prototype-inspector/flow-canvas.js | assets/prototype-inspector/flow-canvas.js |
| .storybook/prototype-inspector/flow-canvas-geometry.js | assets/prototype-inspector/flow-canvas-geometry.js |
| src/pages/prototypes/prototypeFlowLayout.ts | assets/prototype-flow-layout/prototypeFlowLayout.ts |
| scripts/prototype-review/fingerprint.mjs | assets/prototype-review/fingerprint.mjs |
