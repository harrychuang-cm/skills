## ADDED Requirements

### Requirement: Story-root export scope

The exporter SHALL use the story scope's first element child as the export root, preserving all story markup that surrounds component elements. Component references SHALL be attached to the nodes carrying a data-component attribute at any depth of the exported tree, and the exporter SHALL NOT collapse the export root to a lone data-component element or to the common ancestor of multiple component elements.

#### Scenario: story markup around a component is preserved

- **WHEN** a story renders a paragraph that contains one inline component element among sibling text
- **THEN** the payload root is the paragraph node, the paragraph's text content is captured, and the nested component node carries the component reference

#### Scenario: story root that is itself the component is unchanged

- **WHEN** a story renders the component element as the only top-level element
- **THEN** the payload root is the component node and carries the component reference, matching the previous export shape

## MODIFIED Requirements

### Requirement: Text style capture

The exporter SHALL capture per-text-node fidelity fields: computed text-transform applied directly to the exported text string (uppercase, lowercase, capitalize); rendered line breaks preserved (via innerText for flow content, and whitespace-preserving extraction when computed white-space is pre, pre-wrap, pre-line, or break-spaces); letter-spacing emitted in pixels when non-normal; text-decoration underline or line-through emitted as textDecoration UNDERLINE or STRIKETHROUGH; and computed font-style italic emitted as fontStyle "italic".

Text node geometry SHALL be exported at one-to-one fidelity: the exported width SHALL equal the measured bounding-rect width without any safety margin; single-line text nodes (exported string contains no newline and the node is not constrained by maxLines or a fixed flex basis) SHALL be marked textAutoResize WIDTH_AND_HEIGHT; and bare text runs SHALL detect multi-line rendering from the range's actual line rect count, marking multi-line runs textAutoResize HEIGHT.

For text on elements whose computed display is inline and for bare text runs, the measured box is (n - 1) line boxes plus one font content box, not n full line boxes. When the derived content-box height is smaller than the pixel line-height, the exporter SHALL add the missing leading to the exported height and shift the exported y up by half the leading (half-leading line-box compensation), so that a single-line inline box exports at line-height tall and an n-line run exports at n times line-height tall, both anchored on the browser's line-box top.

#### Scenario: uppercase transform is baked into the string

- **WHEN** a text element's computed text-transform is uppercase and its DOM text is "Submit order"
- **THEN** the payload text is "SUBMIT ORDER"

#### Scenario: multi-line text keeps line breaks

- **WHEN** a text element renders two lines separated by a br element
- **THEN** the payload text contains a newline character between the two lines

#### Scenario: letter spacing and decoration

- **WHEN** a text element has computed letter-spacing 0.5px and text-decoration-line underline
- **THEN** the payload node has letterSpacing 0.5 and textDecoration UNDERLINE

#### Scenario: exact width without safety margin

- **WHEN** a single-line text element measures 48px wide at font-size 16px
- **THEN** the payload node width is 48 and the node is marked textAutoResize WIDTH_AND_HEIGHT

#### Scenario: inline line-box compensation

- **WHEN** an inline element renders one line with bounding-rect height 16 and computed line-height 26.4px at y 100
- **THEN** the payload node height is 26.4 and its y is 94.8

##### Example: inline compensation values

| rect height | line-height | lines | rect y | exported height | exported y |
| ----------- | ----------- | ----- | ------ | --------------- | ---------- |
| 16 | 26.4 | 1 | 100 | 26.4 | 94.8 |
| 20 | 20 | 1 | 40 | 20 | 40 |
| 52.8 | 26.4 | 2 | 0 | 52.8 | 0 |
| 42.4 | 26.4 | 2 | 5.2 | 52.8 | 0 |
