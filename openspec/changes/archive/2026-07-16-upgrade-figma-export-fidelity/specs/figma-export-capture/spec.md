## ADDED Requirements

### Requirement: Modern CSS color normalization

The exporter SHALL normalize every color it emits (computed style colors and token raw values that represent colors) into hex or rgb()/rgba() form before writing the payload, using the browser's own color engine (canvas fillStyle round-trip). Colors expressed as oklch(), oklab(), lab(), lch(), color(), hsl(), or named colors MUST NOT reach the payload in their original functional form.

#### Scenario: oklch background color is normalized

- **WHEN** an exported element has a computed background color serialized as an oklch() value
- **THEN** the payload node's backgroundColor is a hex or rgb()/rgba() string representing the same color clamped to sRGB

#### Scenario: token raw value in a modern color space

- **WHEN** a design token referenced by a binding has a raw CSS value in hsl() or oklch() form
- **THEN** the exported token entry has type COLOR and a value parsed from the normalized sRGB form instead of falling back to black or STRING

### Requirement: Shadow capture as effects

The exporter SHALL parse the computed box-shadow list of exported frame nodes and the computed text-shadow of exported text nodes into an ordered styles.effects array, where each entry carries type (DROP_SHADOW for outer shadows, INNER_SHADOW for inset shadows), normalized color, offsetX, offsetY, blur, and spread. Elements without visible shadows MUST NOT emit an effects field.

#### Scenario: single drop shadow

- **WHEN** an element has box-shadow with offset 0px 4px, blur 12px, spread 0px and a semi-transparent color
- **THEN** the payload node contains effects with one DROP_SHADOW entry whose offsetY is 4, blur is 12, spread is 0, and color is the normalized rgba value

#### Scenario: inset shadow

- **WHEN** an element's box-shadow list contains an inset shadow
- **THEN** the corresponding effects entry has type INNER_SHADOW

### Requirement: Per-corner radius capture

The exporter SHALL read all four computed corner radii. When the four values are equal it SHALL emit the single radius field; when they differ it SHALL emit radiusCorners with topLeft, topRight, bottomRight, and bottomLeft pixel values.

#### Scenario: asymmetric corners

- **WHEN** an element has border-radius 8px 8px 0px 0px
- **THEN** the payload node contains radiusCorners { topLeft: 8, topRight: 8, bottomRight: 0, bottomLeft: 0 } and no uniform radius field

### Requirement: Raster image capture

The exporter SHALL capture raster img elements (PNG, JPEG, WebP, GIF sources) and canvas elements by drawing them onto a temporary canvas capped at 2048px on the longest side and emitting node.imageBase64 (PNG base64 without the data: prefix), node.imageMimeType, and styles.imageScaleMode mapped from object-fit (cover or fill maps to FILL; contain, none, or scale-down maps to FIT). When canvas capture fails due to cross-origin tainting the exporter SHALL attempt a fetch-based fallback; when both fail the node MUST still be exported as an image node without imageBase64.

#### Scenario: raster avatar exports pixels

- **WHEN** a story contains an img element with a same-origin PNG source
- **THEN** the exported image node carries non-empty imageBase64 and imageMimeType image/png

#### Scenario: oversized image is downscaled

- **WHEN** an img element's natural size exceeds 2048px on its longest side
- **THEN** the encoded bitmap's longest side is 2048px and the node's width/height styles keep the on-screen rendered size

### Requirement: Text style capture

The exporter SHALL capture per-text-node fidelity fields: computed text-transform applied directly to the exported text string (uppercase, lowercase, capitalize); rendered line breaks preserved (via innerText for flow content, and whitespace-preserving extraction when computed white-space is pre, pre-wrap, pre-line, or break-spaces); letter-spacing emitted in pixels when non-normal; text-decoration underline or line-through emitted as textDecoration UNDERLINE or STRIKETHROUGH; and computed font-style italic emitted as fontStyle "italic".

#### Scenario: uppercase transform is baked into the string

- **WHEN** a text element's computed text-transform is uppercase and its DOM text is "Submit order"
- **THEN** the payload text is "SUBMIT ORDER"

#### Scenario: multi-line text keeps line breaks

- **WHEN** a text element renders two lines separated by a br element
- **THEN** the payload text contains a newline character between the two lines

#### Scenario: letter spacing and decoration

- **WHEN** a text element has computed letter-spacing 0.5px and text-decoration-line underline
- **THEN** the payload node has letterSpacing 0.5 and textDecoration UNDERLINE

### Requirement: Measured auto-layout spacing

For flex containers exported with the autoLayout strategy, the exporter SHALL derive item spacing by measuring child bounding rects along the main axis instead of trusting only the declared gap: children SHALL first be ordered by main-axis visual position (covering row-reverse, column-reverse, and the order property); when all adjacent spacings are equal within 1px tolerance the measured value SHALL be emitted as gap; when justify-content is space-between the container SHALL keep the space-between mapping; when spacings are non-uniform and justify-content is not space-between the container SHALL fall back to the absolute layout strategy. When children are start-aligned, effective leading and trailing padding SHALL be derived from the first and last child offsets relative to the container content box.

#### Scenario: margin-based spacing is preserved

- **WHEN** a flex row spaces three children using a uniform 12px child margin and no gap declaration
- **THEN** the exported container keeps layoutStrategy autoLayout with gap 12

#### Scenario: non-uniform spacing falls back to absolute

- **WHEN** a flex row's measured adjacent spacings are 8px and 24px and justify-content is flex-start
- **THEN** the exported container uses layoutStrategy absolute and every child keeps its measured x/y

#### Scenario: row-reverse children are exported in visual order

- **WHEN** a flex container has flex-direction row-reverse with DOM children A, B, C
- **THEN** the exported children array is ordered C, B, A (left to right visual order)

##### Example: spacing derivation

| Layout input | Exported strategy | gap |
| ------------ | ----------------- | --- |
| gap 16px, no margins | autoLayout | 16 |
| margin-right 12px on items | autoLayout | 12 |
| justify-content space-evenly, equal gaps 10px | autoLayout | 10 |
| mixed margins 8px / 24px | absolute | (none) |

### Requirement: Flex wrap capture

When a flex container's computed flex-wrap is wrap and its children occupy more than one line (detected by grouping child rects along the cross axis), the exporter SHALL emit layoutWrap "WRAP", the measured in-line spacing as gap, and the measured spacing between lines as counterAxisSpacing.

#### Scenario: wrapped chip list

- **WHEN** a flex-wrap wrap container renders six chips across two lines with 8px horizontal and 12px vertical spacing
- **THEN** the exported container has layoutWrap WRAP, gap 8, and counterAxisSpacing 12

### Requirement: Token binding correctness

When scanning stylesheets for var() token bindings, the exporter SHALL skip rules inside media queries whose condition does not currently match (window.matchMedia), and SHALL order matched declarations by CSS specificity (a-b-c counting of the matched selector) before applying last-wins resolution, with inline styles ranked above all stylesheet declarations.

#### Scenario: non-matching media query is ignored

- **WHEN** a token binding for background-color exists only inside a media query for max-width 600px and the viewport is 1200px wide
- **THEN** the exported node does not bind that token

#### Scenario: higher specificity wins over later low-specificity rule

- **WHEN** an element matches an earlier two-class selector binding token A and a later single-class selector binding token B for the same property
- **THEN** the exported binding references token A

### Requirement: Payload compatibility

The exporter SHALL keep emitting payload version 2. Every field introduced by this change (effects, radiusCorners, layoutWrap, counterAxisSpacing, letterSpacing, textDecoration, fontStyle, imageBase64, imageMimeType, imageScaleMode) SHALL be optional and SHALL be omitted when not applicable, so that payloads from unmodified stories remain byte-compatible in structure with the previous exporter.

#### Scenario: plain node emits no new fields

- **WHEN** an exported element has no shadow, uniform corners, no raster content, default text styling, and gap-declared spacing
- **THEN** its payload node contains none of the newly introduced optional fields

### Requirement: Single authoritative exporter source

The skill SHALL treat the addon package vendored under assets as the authoritative exporter source. Both template copies (the template vendor package and the template .storybook vendor package) SHALL be byte-identical to the assets copy at the source level after any exporter change, verified by recursive diff.

#### Scenario: copies stay in sync

- **WHEN** the exporter sources under assets are modified and the sync step completes
- **THEN** a recursive diff between the assets src directory and each template copy's src directory reports no differences
