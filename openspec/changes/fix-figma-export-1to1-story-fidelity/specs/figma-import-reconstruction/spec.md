## MODIFIED Requirements

### Requirement: Text style application

The plugin SHALL apply letterSpacing (pixels), textDecoration UNDERLINE or STRIKETHROUGH, and italic font styles from the payload to created text nodes. Font style resolution SHALL combine weight and italic into candidate style names, and the weight-to-style mapping SHALL cover thin (100), extra-light (200), light (300), regular (400), medium (500), semi-bold (600), bold (700), extra-bold (800), and black (900) with graceful fallback toward Regular when a candidate is unavailable.

When every candidate style name fails to load for a font family, the plugin SHALL query the list of available fonts (cached once per import run), parse the weight and italic semantics of that family's actual style names — recognizing W-number names (W3 maps to weight 300, W6 to 600), purely numeric names, and the standard weight-name table from Thin (100) through Black (900) — and SHALL load the style whose parsed weight is nearest to the requested weight, preferring the heavier style on ties. The plugin SHALL only fall back to the next CSS font family after this available-style resolution also fails, and SHALL fall back to Inter Regular last.

#### Scenario: italic text loads an italic font style

- **WHEN** a payload text node has fontStyle italic and fontWeight 400 and the resolved family provides an Italic style
- **THEN** the created text node's fontName style is Italic

#### Scenario: light weight maps to Light style

- **WHEN** a payload text node has fontWeight 300 and the family provides a Light style
- **THEN** the created text node's fontName style is Light

#### Scenario: Japanese W-number styles resolve without family fallback

- **WHEN** a payload text node requests family "Hiragino Kaku Gothic ProN" at fontWeight 700 and that family only provides styles W3 and W6
- **THEN** the created text node's fontName is family "Hiragino Kaku Gothic ProN" with style W6, and no later CSS fallback family is used

##### Example: weight-to-style candidates

| fontWeight | italic | first candidates |
| ---------- | ------ | ---------------- |
| 300 | false | Light, Regular |
| 400 | true | Italic, Regular |
| 700 | true | Bold Italic, Bold |
| 900 | false | Black, ExtraBold, Bold |

##### Example: nearest-weight resolution from available styles

| requested weight | available styles | chosen style |
| ---------------- | ---------------- | ------------ |
| 700 | W3, W6 | W6 |
| 400 | W3, W6 | W3 |
| 500 | W3, W6 | W6 |
| 300 | 100, 300, 500 | 300 |
