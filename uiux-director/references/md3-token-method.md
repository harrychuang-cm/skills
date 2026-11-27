# Material Design 3 Token Method

The product's design tokens follow Google Material Design 3 (M3): three tiers, M3 role names, and color palettes generated from key colors. Decisions are recorded in `DESIGN_DIRECTION.md` › Material Design 3 Token Plan, created from [../assets/DESIGN_DIRECTION.template.md](../assets/DESIGN_DIRECTION.template.md).

## Method, Not Look

Take from M3: the tier structure, the role vocabulary, palettes derived from key colors, the typescale roles, the shape scale, state layers, and the density scale.

Do not inherit by default:

- The M3 baseline scheme, whose primary is `#6750A4`. An unchosen violet palette is one of the most recognizable generic AI-look tells (`anti-ai-style`).
- Roboto as the typeface.
- Material component visuals and Google sample layouts.

A baseline value is used only when evidence supports it (the product already uses it, the brand guide specifies it) or the PM explicitly chooses it. Record the source next to the value.

## Three Tiers

| Tier | Holds | Aliases | Code name | Figma name | Example |
| --- | --- | --- | --- | --- | --- |
| ref | Raw values: palette tones, spacing steps, radii, type primitives, opacities | Nothing | `--md-ref-*` | `ref/…` | `--md-ref-palette-primary-40: #2f4f8a;` |
| sys | Shared roles used across the product | ref | `--md-sys-*` | `sys/…` | `--md-sys-color-primary: var(--md-ref-palette-primary-40);` |
| comp | Slots of one component or region | sys | `--md-comp-*` | `comp/…` | `--md-comp-primary-button-container-color: var(--md-sys-color-primary);` |

- The code names follow `design-system-extractor/references/token-architecture.md`; the Figma names follow `figma-m3-variables`.
- Key-color palettes use `--md-ref-palette-{key}-{tone}`, matching M3's own `md.ref.palette.primary40`. Other colors use `--md-ref-color-{hue}-{tone}`. When the target already follows a convention (for example the extractor's hue-only reference names), use the target's convention.
- M3 system token names convert to CSS by replacing dots with hyphens: `md.sys.color.primary` → `--md-sys-color-primary`, `md.sys.typescale.body-large.size` → `--md-sys-typescale-body-large-size`, `md.sys.shape.corner.medium` → `--md-sys-shape-corner-medium`, `md.sys.state.hover.state-layer-opacity` → `--md-sys-state-hover-state-layer-opacity`.
- Reference names describe the value or scale step, never a component or a screen.

## Color

1. **Key colors.** Take the primary key color from evidence: the brand guide, the logo, the existing product. Without evidence, derive it from a stated audience or domain reason and offer it as a candidate for the PM to choose. Secondary, tertiary, neutral, and neutral-variant are derived from the primary unless evidence gives them.
2. **Tonal palettes.** Generate tones 0–100 for each key color with Material Theme Builder (keep the export), `@material/material-color-utilities` (record the version), or a designer-supplied palette. Record the tool in Palette source. Do not hand-pick tones by eye and call the result a palette.
3. **System roles.** Map roles to tones with the mapping the palette tool produces, for light and, when the product needs it, dark. Change a mapping by hand only for an accessibility remap, and record the reason.
4. **Contrast.** Check every `on-*` pair against its background: at least 4.5:1 for body text and 3:1 for large text and UI component boundaries (WCAG 2.x AA).
5. **Accent restraint.** `primary` is reserved for the role written in the direction, usually the one main action per region. Everything else starts neutral.
6. **Extension roles.** A domain meaning M3 does not cover gets its own named role with `on-` and `-container` variants as needed: `--md-sys-color-price-rise`, `--md-sys-color-price-fall`, `--md-sys-color-success`, `--md-sys-color-warning`. Never reuse `error` or `primary` for a domain meaning. In Taiwan stock products red means a rise and green a fall, the opposite of many Western products, which is exactly why `error` must not stand in for "down". When an extension role ends up close in value to another role (a red `price-rise` next to `error`), keep both named roles and make sure neither relies on color alone: rises carry ▲ or a sign, errors carry text.

M3 system color roles, for reference:

| Group | Roles |
| --- | --- |
| Accent | `primary`, `on-primary`, `primary-container`, `on-primary-container`; the same four for `secondary` and `tertiary` |
| Error | `error`, `on-error`, `error-container`, `on-error-container` |
| Surface | `surface`, `on-surface`, `on-surface-variant`, `surface-dim`, `surface-bright`, `surface-container-lowest`, `surface-container-low`, `surface-container`, `surface-container-high`, `surface-container-highest` |
| Outline | `outline` (borders), `outline-variant` (dividers, subtle borders) |
| Inverse | `inverse-surface`, `inverse-on-surface`, `inverse-primary` |
| Utility | `scrim`, `shadow` |

## Type

- M3 has two typeface roles, `brand` (display, headline, title-large) and `plain` (the rest). Choose each family from evidence. When the product shows Chinese text, name the CJK face and its Latin pairing. Roboto needs a recorded reason.
- Use only the typescale roles the product needs. M3 baseline sizes (size / line height in px):

| Role family | large | medium | small | Typical use |
| --- | --- | --- | --- | --- |
| display | 57 / 64 | 45 / 52 | 36 / 44 | Rare: one large number or hero statement |
| headline | 32 / 40 | 28 / 36 | 24 / 32 | Page-level headings |
| title | 22 / 28 | 16 / 24 | 14 / 20 | Screen titles, section and card titles |
| body | 16 / 24 | 14 / 20 | 12 / 16 | Running text and data |
| label | 14 / 20 | 12 / 16 | 11 / 16 | Buttons, tabs, chips, captions |

- Adjust for the audience with a recorded reason. An off-scale step is named after the step below it with `-plus`, for example `body-large-plus` at 18 / 28 for older readers. Check line height with real Chinese copy before confirming it.

## Shape

| Step | Value (px) |
| --- | --- |
| `corner-none` | 0 |
| `corner-extra-small` | 4 |
| `corner-small` | 8 |
| `corner-medium` | 12 |
| `corner-large` | 16 |
| `corner-large-increased` | 20 |
| `corner-extra-large` | 28 |
| `corner-extra-large-increased` | 32 |
| `corner-extra-extra-large` | 48 |
| `corner-full` | pill |

Assign steps by component size and role (inputs and chips small, cards medium, sheets extra-large at the top edge). One large radius on everything is a generic default, not a decision.

## Surface And Elevation

- Separate page regions and sections with surface-container tones (`surface-container-lowest` through `surface-container-highest`) or with space and dividers, one method per level, as recorded in Surface And Elevation.
- Elevation levels 1–5 (1, 3, 6, 8, 12 dp) are for layers above the page: menus, sheets, dialogs, and the snackbar. Cards on the page do not need shadows to be cards.

## State Layers

Interaction feedback is an overlay of the content color at a fixed opacity, not a new color:

| State | Opacity |
| --- | --- |
| hover | 8% |
| focus | 10% |
| pressed | 10% |
| dragged | 16% |
| disabled content | 38% |
| disabled container | 12% by default; M3 varies it by component |

Hover applies only on pointer devices; touch uses pressed feedback.

## Density And Layout

- **M3 density scale.** `0` is the default; `-1`, `-2`, and `-3` each make a component 4dp shorter. Use negative density for data-dense screens on pointer devices. On touch devices keep touch targets at least 48 × 48dp even when the visible component is shorter.
- **Spacing ladder.** M3 does not publish spacing tokens. Use the ladder shared with `figma-m3-variables`: `3xs` 2, `2xs` 4, `xs` 8, `sm` 12, `md` 16, `lg` 20, `xl` 24, `2xl` 32, `3xl` 40, `4xl` 48, `5xl` 64 (px), with the roles `inset-horizontal`, `inset-vertical`, `inset`, `gap-inline`, and `gap-stack`: for example `--md-sys-spacing-gap-stack-xs`.
- **Window size classes and margins.** Compact (narrower than 600px) uses 16px margins; medium (600–839px), expanded (840–1199px), large (1200–1599px), and extra-large (1600px and wider) use 24px margins and 24px between panes, unless the direction records a reason to differ.

Starting points per density level, adjusted with audience reasons in the Density Profile:

| Density level | M3 density scale | Gap between related elements | Gap between sections | Body text role |
| --- | --- | --- | --- | --- |
| compact | `-1` to `-2` (`-3` only for desktop data tables) | `2xs`–`xs` (4–8px) | `md` (16px) | `body-medium` |
| regular | `0` | `xs`–`sm` (8–12px) | `xl`–`2xl` (24–32px) | `body-medium` or `body-large` |
| spacious | `0` | `sm`–`md` (12–16px) | `2xl`–`3xl` (32–40px) | `body-large` or a `body-large-plus` step |

## Motion

Use the M3 easing tokens (`standard`, `emphasized`, with their accelerate and decelerate variants) and duration tokens (`short1`–`short4`, `medium1`–`medium4`, `long1`–`long4`, `extra-long1`–`extra-long4`). Animate only the changes recorded in the direction's Motion table, and honor the platform's reduce-motion setting.

## Existing Token Systems

Discover the target's tokens first (the `ds-governance` discovery phase).

- **Target already uses `--md-*` tokens:** use them and extend within them.
- **Target uses another system:** fill Existing Token Mapping in `DESIGN_DIRECTION.md` with MD3 role → existing token, for example `primary` → `--brand-blue-500` and `on-surface` → `--text-primary`. Use MD3 role names in documents and conversation; UI code keeps using the existing tokens. A role with no match is written as "no match" and listed as an open question; an addition is proposed through the `ds-governance` Token Gate in the target's naming. Do not create a parallel `--md-sys-*` layer and do not migrate the existing system.

## No Token System: Starter Set Through The Token Gate

When `build` needs tokens and the target has none:

1. List the smallest starter set the current work needs, with values from `DESIGN_DIRECTION.md`: the system color roles in use (including extension roles), the typescale roles in use, the shape steps in use, the spacing ladder steps in use, the state-layer opacities, and the reference palette tones they alias.
2. Propose a file location that follows the target's conventions, and present the list through the `ds-governance` Token Gate. Write nothing until the PM or the owner approves.
3. After approval, write the ref and sys tiers, and comp tokens only for the components being built. Record the approval in `DECISION_LOG.md`.
4. When the proposal is declined, record it and follow the `ds-governance` declined path. Do not fall back to literal values silently.

## Using Tokens In UI

UI code references `--md-comp-*` for component slots and `--md-sys-*` for page-level styling. It never references `--md-ref-*` and never writes literal colors, spacing, radii, or type values. Structural values (`0`, `100%`, layout fractions) do not need tokens.

```css
/* Good */
.buy-button {
  background: var(--md-comp-primary-button-container-color);
  border-radius: var(--md-sys-shape-corner-full);
}

/* Findings: a literal color, and a reference token used in UI */
.buy-button {
  background: #2f4f8a;
  color: var(--md-ref-palette-primary-100);
}
```

## Figma

When the design is maintained in Figma and `figma-m3-variables` is available, hand it the Token Plan: Workflow B creates a new token system, Workflow F tokenizes an existing design. Its names (`ref/palette/primary/40`, `sys/color/primary`) map one-to-one to the code names above. Without it, give the designer the Token Plan table.

## Review Checks

`review` reports each of these as a finding:

- Literal color, spacing, radius, or type values in UI code.
- `--md-ref-*` referenced outside the token definition files.
- Baseline values (`#6750A4`, Roboto) with no recorded source.
- A domain meaning expressed by reusing `error` or `primary`.
- An `on-*` pair below the contrast minimum.
