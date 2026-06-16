# Visual Analysis Rubric

Use this rubric before writing design-system decisions.

## Source Inventory

Record every source:

| Source ID | Type | Path / URL / Node | Source fingerprint | Screen or state | Notes | Confidence |
|---|---|---|---|---|---|---|

Source types:

- `image`: screenshots, exports, marketing captures, mobile captures, posters, social graphics, brand/editorial samples
- `figma`: Figma URL, node, page, Variables, component library
- `vibe-project`: AI-generated or vibe-coded project folder, usually used as an umbrella source with rendered/project-code rows below it
- `rendered-project`: localhost route, Storybook story, app screenshot
- `project-code`: CSS, tokens, components, templates
- `prompt`: written user description

Fingerprint guidance:

- Images and screenshots: use `sha256:<hash>` for exact file matches; add `phash:<hash>` or a crop note when perceptual comparison is available.
- Figma: normalize URLs to `figma:<file-key>#<node-id>` or `figma:<file-key>#page:<page-name>`.
- Rendered routes: include route, viewport, state, and screenshot/render command.
- Project code: include normalized file path plus exported token/component name when relevant.

When two sources share the same fingerprint or appear visually/functionally very close, record a row before counting both as independent evidence:

| Candidate source | Duplicate of | Match type | Fingerprint / normalized key | Suggested action | Developer decision | Rationale |
|---|---|---|---|---|---|---|

## Evidence Rows

Every important rule should come from an evidence row:

| Evidence ID | Source ID | Region | Observed pattern | Design decision | Affected output | Confidence |
|---|---|---|---|---|---|---|

Use confidence labels:

- High: repeated in multiple screens or confirmed by code/tokens.
- Medium: clear in one source, not contradicted elsewhere.
- Low: inferred, partially obscured, or only described by prompt.

For vibe-coded or AI-generated project folders, tighten those labels:

- High: visible in repeated rendered routes, screenshots, or stories, and supported by used tokens/components.
- Medium: visible in rendered UI, but source code or token usage is noisy, duplicated, or inconsistent.
- Low: present only in source code, generated demo UI, unused CSS, prompts, or inferred intent.

## Vibe / AI Prototype Intake

Before extracting from a vibe-coded project, create or locate a route/state manifest:

| Route or story | Viewport | State | Render command | Screenshot path | Source files | Keep / ignore | Notes |
|---|---|---|---|---|---|---|---|

Classify project evidence before using it:

| Source | Classification | Visible in rendered UI | Token/component used | Keep / ignore decision | Rationale |
|---|---|---|---|---|---|

Use these classifications:

- `rendered`: observed in a live route or captured browser state.
- `screenshot`: observed in a supplied or generated screenshot.
- `storybook`: observed in an isolated story or component example.
- `token-used`: token is referenced by rendered UI or a live component.
- `component-used`: component is imported or routed into rendered UI.
- `demo-only`: appears only in example, scaffold, starter, or showcase code.
- `unused`: no evidence of route/story/import/render usage.
- `dead-code`: obsolete, unreachable, or contradicted by rendered UI.
- `contradictory`: conflicts with stronger rendered, screenshot, Figma, or user keep/ignore evidence.
- `out-of-scope`: visible or present, but explicitly excluded from extraction.

For vibe projects, prefer this evidence order unless the user says otherwise:

1. User-marked keep/ignore notes tied to visible routes or screenshots.
2. Captured screenshots and rendered routes with viewport/state metadata.
3. Storybook stories or component examples that are representative of the product.
4. Used CSS variables, tokens, components, and route imports.
5. Source-only code, unused CSS, demo pages, starter components, or generated comments.

## Visual Dimensions

Analyze these dimensions for every coherent product surface:

- color proportions: dominant, secondary, accent, semantic colors, neutral usage
- color scale candidates: palette families, light-to-dark order, and near duplicate colors that may need merge review
- duplicate source candidates: repeated screenshots, duplicate Figma nodes, repeated route/state screenshots, or prototype exports that should be reused or ignored
- foreground/background pairs: every background-like color needs a readable text/icon pair
- typography: family clues, scale, weights, line height, numeric behavior
- typographic composition/text lockups: recurring slot relationships such as kicker + headline, headline + subhead, number + unit + caption, quote + attribution, label + value, hierarchy ratios, line breaks, alignment, max line length, and spacing between text slots
- spacing: screen gutters, section gaps, row height, internal padding, density
- near numeric candidates: close spacing, radius, typography, opacity, or motion values that may need merge review
- shape: controls, cards, sheets, dialogs, chips, avatars, images
- elevation/depth: shadows, outlines, dividers, overlap, raised surfaces
- layout rhythm: app shell, top bars, bottom bars, section order, scroll behavior
- component candidates: purpose, behavior or composition role, anatomy/slots, variants, states or display modes, and overlap with existing inventory/specs
- component review visuals: actual Figma node previews/screenshots or screenshot crops for close candidates; schematic SVG only as labeled fallback when source previews are unavailable
- icons: style, stroke, fill, size, labels, accessibility role
- imagery: photo/illustration style, crop, saturation, texture, realism
- data display: alignment, numeric formatting, charts, legends, comparison patterns
- states: selected, active, hover, pressed, focus-visible, disabled, loading, empty, error

## Extraction Rules

- Prefer repeated patterns over one-off decorative moments.
- Treat reusable text groupings as component candidates in any source type, not only graphic design. Keep atomic type values in typography tokens; promote the grouping to a typographic component only when the slot relationship, hierarchy, spacing, alignment, and content rules are reusable.
- Do not promote one-off decorative lettering, art-directed headlines, or single-use campaign copy to component status unless the references prove reuse or brand-critical importance.
- Do not treat duplicate screenshots, Figma nodes, or rendered states as separate proof until the source duplicate review decision is documented.
- Do not create a separate component only because a Figma layer name differs; compare fingerprint, behavior, anatomy, states, tokens, and layout first.
- Do not normalize a distinctive design into generic SaaS defaults.
- Capture what is absent as well as what is present: no gradients, no card outlines, no shadows, no dense nav, etc.
- If the reference shows mobile-only UI, do not invent desktop behavior beyond responsive constraints.
- For project folders, rendered UI beats unused CSS. Existing tokens beat ad hoc CSS only when they are actually used.
- For vibe-coded projects, do not let source-only generated artifacts raise confidence. Exclude demo-only, unused, dead-code, contradictory, or out-of-scope patterns from normative design rules unless the user explicitly keeps them.
- For vibe-coded projects, component filenames and CSS variable names are clues, not proof. Verify them through rendered routes, stories, imports, or user notes before treating them as reusable system decisions.
