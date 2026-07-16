## ADDED Requirements

### Requirement: Shadow effects application

The Figma plugin SHALL apply payload styles.effects to created frame and text nodes as Figma effects, mapping DROP_SHADOW and INNER_SHADOW entries with color, offset x/y, blur radius, and spread, each created with visible true and blendMode NORMAL. Effect application failures MUST be recorded as import warnings without aborting the import.

#### Scenario: drop shadow appears on imported card

- **WHEN** a payload frame node carries effects with one DROP_SHADOW entry (offsetY 4, blur 12, spread 0)
- **THEN** the created Figma node has one DROP_SHADOW effect with radius 12, offset {x: 0, y: 4}, and spread 0

### Requirement: Per-corner radius application

When a payload node carries radiusCorners, the plugin SHALL set topLeftRadius, topRightRadius, bottomRightRadius, and bottomLeftRadius individually instead of the uniform cornerRadius, and cornerRadius token bindings SHALL continue to bind per-corner fields when the uniform binding is unsupported.

#### Scenario: asymmetric tab corners

- **WHEN** a payload node has radiusCorners { topLeft: 8, topRight: 8, bottomRight: 0, bottomLeft: 0 }
- **THEN** the created frame has topLeftRadius 8, topRightRadius 8, bottomRightRadius 0, bottomLeftRadius 0

### Requirement: Wrapped auto layout application

When a payload frame has layoutWrap WRAP and an auto-layout display, the plugin SHALL set the node's layoutWrap to WRAP and apply counterAxisSpacing from the payload.

#### Scenario: chip list wraps in Figma

- **WHEN** a payload frame has display flex, layoutWrap WRAP, gap 8, and counterAxisSpacing 12
- **THEN** the created frame has layoutMode HORIZONTAL, layoutWrap WRAP, itemSpacing 8, and counterAxisSpacing 12

### Requirement: Text style application

The plugin SHALL apply letterSpacing (pixels), textDecoration UNDERLINE or STRIKETHROUGH, and italic font styles from the payload to created text nodes. Font style resolution SHALL combine weight and italic into candidate style names, and the weight-to-style mapping SHALL cover thin (100), extra-light (200), light (300), regular (400), medium (500), semi-bold (600), bold (700), extra-bold (800), and black (900) with graceful fallback toward Regular when a candidate is unavailable.

#### Scenario: italic text loads an italic font style

- **WHEN** a payload text node has fontStyle italic and fontWeight 400 and the resolved family provides an Italic style
- **THEN** the created text node's fontName style is Italic

#### Scenario: light weight maps to Light style

- **WHEN** a payload text node has fontWeight 300 and the family provides a Light style
- **THEN** the created text node's fontName style is Light

##### Example: weight-to-style candidates

| fontWeight | italic | first candidates |
| ---------- | ------ | ---------------- |
| 300 | false | Light, Regular |
| 400 | true | Italic, Regular |
| 700 | true | Bold Italic, Bold |
| 900 | false | Black, ExtraBold, Bold |

### Requirement: Raster image fill creation

When a payload image node carries imageBase64, the plugin SHALL decode it with figma.base64Decode, create an image with figma.createImage, and fill the node with an ImagePaint whose scaleMode comes from styles.imageScaleMode (default FILL). When decoding or image creation fails, the plugin SHALL record a warning and keep the existing empty-frame behavior.

#### Scenario: avatar bitmap is visible after import

- **WHEN** a payload image node has valid PNG imageBase64 and imageScaleMode FILL
- **THEN** the created node has one IMAGE paint with scaleMode FILL and a non-null imageHash

#### Scenario: corrupt base64 degrades gracefully

- **WHEN** a payload image node's imageBase64 cannot be decoded
- **THEN** the import completes, the node is an empty frame, and the import stats contain a warning naming the node path

### Requirement: Robust color parsing

The plugin's CSS color parser SHALL additionally accept 4-digit and 8-digit hex colors, hsl()/hsla() colors, and the space-separated rgb(r g b / a) syntax, converting each to RGBA. Unparseable color strings SHALL keep the existing black fallback.

#### Scenario: eight-digit hex with alpha

- **WHEN** a payload color value is #33667780
- **THEN** the parsed paint color is r 0.2, g 0.4, b 0.4667 (±0.01) with opacity 0.5 (±0.01)

#### Scenario: hsl token value

- **WHEN** a token raw value is hsl(210, 50%, 40%)
- **THEN** the created COLOR variable resolves to the equivalent sRGB value instead of black

### Requirement: Arbitrary gradient angle

The plugin SHALL build the linear-gradient transform from the payload angle using a rotation matrix so that any angle in degrees produces the matching Figma gradient direction, replacing the previous behavior that only recognized 0, 90, 180, and 270 degrees.

#### Scenario: diagonal gradient

- **WHEN** a payload backgroundLinearGradient has angle 45 with two stops
- **THEN** the created GRADIENT_LINEAR paint renders the gradient axis at 45 degrees (bottom-left toward top-right per CSS angle convention)

### Requirement: Backward and forward payload compatibility

The plugin SHALL continue accepting payload versions 1 and 2. Payloads without any newly introduced optional field SHALL import with behavior identical to plugin version 1.1.8. Newly introduced optional fields with invalid types SHALL cause parsePayload to throw an error naming the node path and field. The PLUGIN_VERSION badge SHALL be bumped so imports visibly confirm the running build.

#### Scenario: legacy payload imports unchanged

- **WHEN** a version 1 payload produced by the previous exporter is imported
- **THEN** the import succeeds with the same node structure as plugin 1.1.8 and no new-field warnings

#### Scenario: invalid effects type is rejected with a path

- **WHEN** a payload node's effects field is a string instead of an array
- **THEN** parsePayload throws an error whose message contains the node path and the word effects
