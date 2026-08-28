# flow-viewport-declaration Specification

## Purpose

TBD - created by archiving change 'add-flow-viewport-contract'. Update Purpose after archive.

## Requirements

### Requirement: Viewport declaration on the flow contract

The flow template's Flow type SHALL gain an optional viewport field of shape { formFactor: "phone" | "tablet" | "desktop"; width: number; height: number }, and the Route type SHALL gain an optional viewport field of shape { width: number; height: number } that overrides the flow-level value for that route only. Every renderer of the prototype (Static Flow export, prototype shell, Prototype Inspector) SHALL resolve the preview size from the flow object at runtime rather than from baked-in constants. A flow that declares no viewport SHALL resolve to formFactor phone with width 375 and height 812 in every consumer, preserving current behavior for existing prototypes without modification.

#### Scenario: Desktop flow renders desktop frames

- **WHEN** a flow declares viewport { formFactor: "desktop", width: 1280, height: 800 } and no route overrides
- **THEN** the Static Flow export renders every route card with a 1280x800 preview frame derived from the flow object at runtime

#### Scenario: Per-route override wins over the flow value

- **WHEN** a desktop flow contains one route declaring viewport { width: 375, height: 812 }
- **THEN** that route's card renders at 375x812 while all other route cards render at the flow-level 1280x800

#### Scenario: Legacy flow without a viewport

- **WHEN** a prototype whose flow file predates the viewport field is rendered or validated
- **THEN** every consumer resolves phone 375x812 and no new finding, behavior change, or output field appears

---
### Requirement: Scaffold viewport selection

scaffold_prototype.py SHALL accept a --viewport option taking one of the presets phone, tablet, desktop, or a custom <W>x<H> value, defaulting to phone. Preset dimensions SHALL be phone 375x812, tablet 768x1024, and desktop 1280x800, matching the storybook-template viewport token tier values. A custom <W>x<H> SHALL be classified by width (>= 1024 desktop, >= 600 tablet, otherwise phone) unless an optional --form-factor option overrides the label. The scaffold SHALL validate custom values against a strict pattern of positive integers within 240-3840 and SHALL exit with an argparse error before writing any file when the value is malformed. The scaffold SHALL fill the template tokens __FORM_FACTOR__, __VIEWPORT_WIDTH__, __VIEWPORT_HEIGHT__, and __SHELL_WIDE_CAP__ (720px for phone, 100% otherwise), SHALL print the resolved viewport in its summary output, and SHALL print a reminder that re-scaffolding with --force must repeat the viewport flags.

#### Scenario: Desktop preset scaffold

- **WHEN** the scaffold runs with --viewport desktop
- **THEN** the generated flow file declares viewport { formFactor: "desktop", width: 1280, height: 800 } and the summary output names the resolved viewport

#### Scenario: Malformed custom viewport is rejected

- **WHEN** the scaffold runs with --viewport 12x9999999
- **THEN** the command exits non-zero with an argument error and creates no files

##### Example: custom value classification

| --viewport value | formFactor | Accepted |
| ---------------- | ---------- | -------- |
| 1440x900         | desktop    | yes      |
| 768x1024         | tablet     | yes      |
| 320x568          | phone      | yes      |
| 100x100          | (none)     | no — below 240 minimum |
| abcx800          | (none)     | no — not a WxH pattern |

#### Scenario: Default scaffold keeps the phone baseline

- **WHEN** the scaffold runs without --viewport, --form-factor, or --target-surface
- **THEN** the generated flow declares viewport { formFactor: "phone", width: 375, height: 812 }, the meta declares surface { target: "web" }, the stylesheet keeps its 375px/812px fallbacks and 720px wide cap, and the rendered output (frame sizes and fallback pitch) matches the pre-change phone scaffold exactly

---
### Requirement: Surface declaration in the prototype meta

The prototype meta template SHALL gain a surface field of shape { target: "web" | "app" | "hybrid" | "package" }, filled by a scaffold --target-surface option defaulting to web, so the target-platform decision made during product framing is machine-readable from parameters.prototype.

#### Scenario: Surface serialized at scaffold time

- **WHEN** the scaffold runs with --target-surface app
- **THEN** the generated meta declares surface { target: "app" } and the value is readable from parameters.prototype in the built story

---
### Requirement: Prototype shell renders at the contract size

The prototype component templates (React and Vue) SHALL set the route preview width and height CSS custom properties inline on the shell root element from the resolved flow viewport (honoring a route-level override when rendering a single route preview), so that iframe measurement through the data-prototype-route-preview element reports the declared width and a runtime edit to the flow viewport takes effect without re-scaffolding. The scaffolded shell stylesheet SHALL keep its CSS fallback values equal to the scaffold-time viewport, and the wide-screen shell cap SHALL be 720px for phone scaffolds and fluid 100% for tablet and desktop scaffolds.

#### Scenario: Hand-edited flow viewport wins over stale CSS fallbacks

- **WHEN** an author changes a scaffolded flow's viewport from phone to desktop by editing only the flow file
- **THEN** the interactive story and route previews render at the desktop size because the inline variables derive from the flow object at runtime

---
### Requirement: Layout payload viewport signature

The shared prototype flow layout helper SHALL write payloads with version 2 and a viewport signature string of the form <formFactor>:<width>x<height>. Reading saved positions SHALL accept an expected viewport: a payload whose signature does not match the expected viewport SHALL be ignored with a console.info notice instead of applying its positions. Version 1 and unsigned payloads SHALL be honored exactly when the expected viewport resolves to phone 375x812, preserving every existing saved layout. Positions SHALL remain the only persisted geometry; sizes SHALL always derive from the flow contract.

#### Scenario: Phone-era layout ignored under desktop frames

- **WHEN** a prototype switches its declared viewport from phone to desktop and a version-1 saved layout exists
- **THEN** the saved positions are ignored, the fallback layout is used, and a console.info notice names the signature mismatch

#### Scenario: Legacy layouts keep working on phone

- **WHEN** a prototype with no declared viewport loads a version-1 saved layout
- **THEN** the saved positions apply exactly as before this change

---
### Requirement: Static Flow fallback layout scales with frame width

The Static Flow export's fallback placement for routes without saved or authored positions SHALL derive its grid pitch from the resolved route frame size, producing the same 560x980 pitch as today when the frame is phone-sized. When the resolved route frame width is 900px or greater, the fallback SHALL lay out each flowGroup as its own horizontal row so that desktop-width frames never overlap. Route cards SHALL display a form-factor badge naming the resolved formFactor and dimensions.

#### Scenario: Desktop fallback uses one row per flowGroup

- **WHEN** a desktop flow with two flowGroups and no positioned routes renders its Static Flow export
- **THEN** each flowGroup's routes appear in their own horizontal row with no overlapping frames, and each card shows a desktop badge

#### Scenario: Phone fallback pitch is unchanged

- **WHEN** a phone flow without positions renders its Static Flow export
- **THEN** the fallback grid pitch equals the pre-change 560x980 values

---
### Requirement: Viewport validation

validate_prototype.py SHALL error when a declared flow viewport has a formFactor outside phone, tablet, desktop or a width or height outside 240-3840. When no viewport is declared, the validator SHALL report nothing in normal mode and SHALL warn only under --handoff-ready that consumers will assume phone 375x812. The validator SHALL detect the half-converted state where the flow declares a viewport but the Static Flow export file does not reference the flow's viewport, reporting a warning that --strict-style upgrades to an error. Under --handoff-ready, when the declared target surface is web only and the resolved formFactor is phone, the validator SHALL warn asking to confirm that mobile-first is intentional. Prototypes declaring none of the new fields SHALL skip every new check silently.

#### Scenario: Out-of-range viewport errors

- **WHEN** a flow declares viewport width 10000
- **THEN** validation reports an error naming the accepted range

#### Scenario: Half-converted prototype

- **WHEN** the flow declares a desktop viewport but the Static Flow export file lacks any reference to the flow viewport
- **THEN** validation warns in normal mode and errors under --strict-style

#### Scenario: Web-only product on a phone viewport

- **WHEN** --handoff-ready runs against a prototype whose surface target is web and whose resolved formFactor is phone
- **THEN** a warning asks to confirm the mobile-first choice, and no warning appears without --handoff-ready

---
### Requirement: Documentation declares the viewport contract

The ui-flow-contract reference SHALL document the Flow.viewport and Route.viewport shapes, the preset-to-token-tier mapping, the resolution order (route viewport, then flow viewport, then form-factor tier tokens, then the 375x812 constants), the layout payload signature rule, and the widened fallback layout. The SKILL.md product-framing step SHALL ask the primary review viewport question and state how the answer is serialized, and SHALL warn that --force re-scaffolds must repeat the viewport flags. The visual-quality reference SHALL add a Desktop Minimum Bar peer section required when the formFactor is desktop, and its layout-verification guidance SHALL be stated per declared viewport rather than app-first. The production-handoff reference SHALL require a Primary viewport line mirroring the flow declaration. The native-product-implementation handoff-ingestion reference SHALL state that flow.json consumers MUST tolerate the optional viewport field.

#### Scenario: Author finds the resolution order documented

- **WHEN** an author reads the ui-flow-contract reference after this change
- **THEN** the document states the four-step resolution order and the phone/tablet/desktop preset dimensions
