## ADDED Requirements

### Requirement: Per-prototype viewport resolution chain

The Prototype Inspector SHALL resolve the preview size for each route card in the order: the route's viewport override, then the prototype's flow viewport, then the form-factor tier CSS tokens, then the built-in 375x812 constants. The resolution SHALL apply to both the UI Flow tab route cards and the Components tab preview pane, and the resolved size SHALL be exposed as inline --prototype-inspector-active-viewport-width and --prototype-inspector-active-viewport-height variables on the inspector root so stylesheet layout caps follow the active prototype without altering the compact token semantics.

#### Scenario: Desktop prototype previews at desktop size

- **WHEN** the inspector opens a prototype whose flow declares viewport { formFactor: "desktop", width: 1280, height: 800 }
- **THEN** UI Flow route cards and the Components preview render 1280x800 frames scaled to fit, with no project-level token configuration required

#### Scenario: Legacy prototype keeps phone previews

- **WHEN** the inspector opens a prototype whose flow declares no viewport and the project sets no viewport tokens
- **THEN** previews render at 375x812 exactly as before this change

### Requirement: Token bridge reads the inspector scope

The inspector's CSS-variable lookup for preview dimensions SHALL read the computed style of the .prototype-inspector root element first, then document.documentElement, then fall back to the built-in constants. Projects that set the documented --sbt-sys-size-viewport tokens (which cascade into the .prototype-inspector scope) SHALL observe their values actually affecting iframe preview sizing, and projects that previously worked around the bug by setting --prototype-inspector-viewport-compact-* directly on :root SHALL keep their existing behavior.

#### Scenario: Documented sbt override finally takes effect

- **WHEN** a project defines --sbt-sys-size-viewport-compact-width: 414px with no other configuration
- **THEN** legacy-resolved route previews render 414px wide instead of silently staying at 375px

#### Scenario: Existing root-level workaround preserved

- **WHEN** a project defines --prototype-inspector-viewport-compact-width only on :root
- **THEN** the value continues to apply exactly as it did before the scope fix

### Requirement: Medium and wide token tiers bridged

The inspector stylesheet SHALL define --pi-sys-size-viewport-medium-width/height bridging --sbt-sys-size-viewport-medium-width/height with 768px/1024px fallbacks, and --pi-sys-size-viewport-wide-width/height bridging --sbt-sys-size-viewport-wide-width/height with 1280px/800px fallbacks, aliased to --prototype-inspector-viewport-medium-* and --prototype-inspector-viewport-wide-*. The compact tier SHALL keep its 375x812 values and its phone semantics unchanged; tablet resolves through the medium tier and desktop through the wide tier.

#### Scenario: Tablet form factor resolves the medium tier

- **WHEN** a prototype declares formFactor tablet without explicit width and height in a context where tier tokens supply the size
- **THEN** the resolved preview dimensions come from the medium tier tokens, defaulting to 768x1024

### Requirement: Layout signature honored by the inspector

The inspector SHALL pass the resolved prototype viewport as the expected viewport when reading saved flow layout positions, so a saved layout whose signature does not match is ignored with a console.info notice and the fallback layout is used, while version-1 payloads keep applying when the resolved viewport is phone 375x812. The inspector's automatic grid fallback pitch SHALL derive from the resolved card size instead of fixed constants.

#### Scenario: Widened prototype falls back cleanly

- **WHEN** a prototype that has a phone-era saved layout is opened after its flow declares desktop
- **THEN** the inspector ignores the saved positions, lays cards out with the derived-pitch fallback, and logs one console.info notice

### Requirement: Form factor badge on flow cards

UI Flow route card headers SHALL display a badge naming the resolved formFactor and dimensions (for example "desktop · 1280x800") whenever the prototype or route declares a viewport, so reviewers can see the intended device class without opening the flow source. Cards of legacy prototypes without any declaration SHALL show no badge.

#### Scenario: Badge shows declared size

- **WHEN** a route card renders for a flow declaring desktop 1280x800
- **THEN** the card header shows a "desktop · 1280x800" badge

### Requirement: Inspector asset copies stay byte-identical

The inspector runtime files (preview.js and prototype-inspector.css) SHALL remain byte-identical between the storybook-product-prototype skill asset copy and the design-system-to-storybook storybook-template .storybook copy, and the skill's smoke test SHALL fail when the copies diverge.

#### Scenario: Divergent copies fail the smoke test

- **WHEN** one inspector copy is edited without mirroring the other
- **THEN** the smoke test exits non-zero naming the divergent file
