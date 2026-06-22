# Figma Export Readiness

Read this before implementing or changing a component/story when the bundled Figma export addon is installed or planned.

The addon exports the rendered Storybook DOM into a JSON payload with:

- one root `FigmaExportNode`
- child nodes with `kind`, `name`, `layoutStrategy`, `styles`, `bindings`, and optional `text` / `svgText`
- token variables collected from CSS custom properties referenced by exported node bindings

Optimize the Storybook implementation so the exported JSON imports as editable Figma layers, not just as a visual snapshot.

## Component Markup Contract

- Render one stable visible root per exportable story. Avoid extra wrapper DOM unless it has a design role.
- Add stable naming metadata when class names are not enough:
  - `data-component="<component-slug>"` on the component root
  - `data-variant="<variant-or-state>"` when a story or root node represents a variant/state
  - `data-icon="<icon-name>"` for reusable icon nodes
  - `data-graphic="<graphic-name>"` for exported graphics that map to `embeddedSvgByDataGraphic`
- Use component class prefixes configured in `.storybook/figma-export.config.ts`; the exporter prefers matching prefixed classes when `data-*` metadata is absent.
- Keep text as real text nodes/elements. Do not rasterize editable labels, headings, values, or captions.
- Avoid generated content for meaningful text. Pseudo-elements are acceptable only for simple decorative bars, dots, badges, or borders.

## Token Binding Contract

The exporter creates Figma variable bindings by finding `var(--token-name)` in matching CSS declarations. Keep these properties token-backed whenever the design-system tokens exist:

- `background-color`, `color`, border color/width, `border-radius`
- `font-family`, `font-size`, `font-weight`, `line-height`
- `gap`, padding, opacity
- fixed icon/graphic dimensions when represented by size tokens

Prefer component or semantic tokens (`--<prefix>-comp-*`, `--<prefix>-sys-*`) in component CSS. Avoid raw colors, numbers, font values, and inline style values for exportable visual properties. Use shorthand only when the exporter can still map the intended token to the right binding; expand ambiguous values when validation reports missing bindings.

## Layout Contract

- Prefer `display: flex` for component internals that should become Figma auto-layout.
- Use `gap` and padding tokens instead of margins between child slots.
- Use absolute positioning only when the Figma layer must preserve pixel fidelity or when children are intentionally overlaid. Add those component slugs to `absoluteFidelityComponents` and record the decision.
- Avoid CSS grid for small reusable components when Figma editability matters; grid normally exports as positioned frames rather than clean auto-layout.
- Avoid transform-driven placement, filter effects, masks, clip-paths, and complex shadows unless the imported result is allowed to be a static SVG/raster-like layer.
- Keep fixed-format elements stable with explicit dimensions or aspect ratios so exported bounds do not depend on hover text, loading states, or viewport quirks.

## Asset Contract

- Use inline SVG or configured `data-graphic` embedded SVG for icons/graphics that need editable or crisp Figma output.
- Ensure SVG paint values resolve before export. Do not leave `var(...)` references inside serialized SVG text.
- Use raster images only when the design requires raster content; otherwise prefer SVG or DOM/CSS shapes.
- Keep decorative assets named and scoped so they do not obscure the component root.

## Story Contract

- Give each exportable component a stable default story with realistic content, fixed state, and no product-route side effects.
- Keep the story root visually tight around the component. Avoid preview-only margins/padding inside the exported root; use Storybook decorators outside the `sbfx-story-scope` when needed.
- Add source URL parameters as described in `SKILL.md`, preferably `parameters.figmaSourceUrl`.
- Cover variants/states with stories whose DOM root names and `data-variant` values match the component spec.

## Validation

After a component story renders with the addon enabled:

1. Use the Figma export panel to copy JSON.
2. Save it as a temporary `.sbfx.json` file.
3. Run:

```sh
node <skill-root>/scripts/validate_figma_export_payload.mjs <payload.sbfx.json>
```

Use `--strict` for CI-style blocking after the component is stable:

```sh
node <skill-root>/scripts/validate_figma_export_payload.mjs <payload.sbfx.json> --strict
```

Treat validator warnings as implementation feedback. Prefer fixing component DOM/CSS/token usage over patching the generated payload. Record accepted warnings in the implementation map only when the visual design genuinely requires the less-editable output.
