# code-layer-style-tracing Specification

## Purpose

Define how Code Layer explains each style value of the selected element: which authored declaration produces it, which design-token chain it resolves through, and whether, where and at which scope it can be re-bound. Every answer is derived from the dev server's index and the text of the stylesheets on the page, never from guesses based on names.

## Requirements

### Requirement: Index as the source of truth

The dev server SHALL build an index from the sources listed in the project binding only: the token tier files, the read-only token sources and the component stylesheets under the component roots. The browser SHALL treat a custom property as a design token only when the index lists it, and SHALL take the authored text of every declaration from the index. A stylesheet on the page SHALL be matched to an indexed file only when its development identifier equals the file's path, the SHA-256 of its text equals the index's served-text hash, and its number of style rules equals the indexed count. When any of the three differs, every row traced to that file SHALL be read-only with a reason that names the mismatch.

#### Scenario: A stale stylesheet is never edited

- **WHEN** a component stylesheet on the page has different text from the indexed file
- **THEN** rows whose winning declaration is in that stylesheet are read-only and state that the page and the file differ

#### Scenario: Names alone do not make a token

- **WHEN** a declaration references a custom property that matches the token naming pattern but is declared only in a stylesheet outside the binding
- **THEN** the chain marks it as not a design token and it is not offered as a re-binding target


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Shared rule ordinal

The server and the browser SHALL number style rules of a stylesheet with the same walk: style rules only, counted from zero in document order; grouping at-rules are entered whether or not they currently apply; keyframe steps are not counted; nested rules are counted depth-first with the parent before its children. Whether a conditional group currently applies SHALL be tracked separately and SHALL NOT change the numbering.

#### Scenario: Conditional groups do not shift numbering

- **WHEN** a stylesheet contains a media query that does not match the current viewport
- **THEN** rules after the media query have the same ordinal on the server and in the browser

##### Example: one stylesheet, both sides agree

| Source order | Counted | Ordinal |
| --- | --- | --- |
| `.a { }` | yes | 0 |
| `@media (min-width: 9999px) { .b { } }` | yes | 1 |
| `@keyframes spin { from { } to { } }` | no | — |
| `@font-face { }` | no | — |
| `@supports (display: grid) { .c { } }` | yes | 2 |
| `.d { }` | yes | 3 |


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Property rows

For the selected element the tracer SHALL report one row per property of a fixed table, grouped into Layout, Spacing, Size, Appearance, Fill, Stroke and Typography. Each row SHALL carry the computed value, the winning declaration when one exists, the token chain, a verdict, and the files a change would write. Structural layout properties SHALL always be read-only. A property with several sides or corners SHALL be reported as one row when every side resolves to the same slot of the same declaration, and as one row per side otherwise.

#### Scenario: Row table

- **WHEN** an element is selected
- **THEN** the trace contains the rows of the table below, in this order

##### Example: v1 row table

| Section | Rows | Editable by re-binding |
| --- | --- | --- |
| Layout | display, direction, alignment, wrapping | no (read-only values) |
| Layout | gap (row, column) | yes |
| Spacing | padding (four sides), margin (four sides) | yes |
| Size | inline size, block size, and their minimum and maximum | yes |
| Appearance | opacity, corner radius (four corners) | yes |
| Fill | background color | yes |
| Stroke | border color, border width (four sides), outline color, outline width, SVG stroke, SVG stroke width | yes |
| Typography | font family, font size, font weight, line height, letter spacing, text color | yes |

#### Scenario: Equal sides collapse into one row

- **WHEN** an element's padding is set by a single `padding: var(--x)` declaration
- **THEN** the trace reports one padding row for all four sides

#### Scenario: Different sides are reported separately

- **WHEN** an element's padding is set by `padding-block: var(--a)` and `padding-inline: var(--b)`
- **THEN** the trace reports the block sides and the inline sides as separate rows, each with its own declaration


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Winning declaration

For each row the tracer SHALL find the declaration that wins the cascade on the element among the verified stylesheets, ordering matching rules by specificity and then by source order, and counting a rule inside a conditional group only when the group currently applies. The row SHALL be read-only, with the stated reason, when the value comes from an inline style, from a presentation attribute, from a declaration marked important, from a rule inside a cascade layer or a conditional group the tracer cannot evaluate, from a stylesheet outside the index, or when an animation currently affects the property. A read-only row SHALL still show the computed value.

#### Scenario: Reasons for read-only rows

- **WHEN** the winning source of a row is not an editable declaration
- **THEN** the row shows its computed value and the matching reason

##### Example: sources and reasons

| Winning source | Verdict |
| --- | --- |
| `style="background: …"` on the element | read-only: inline style |
| `fill="none"` attribute on an SVG path | read-only: presentation attribute |
| a declaration with `!important` | read-only: important declaration |
| a rule inside `@layer` | read-only: unsupported condition |
| a stylesheet that is not indexed | read-only: unknown source |
| a running animation on the property | read-only: animated |


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Logical and physical properties resolve to the same side

The tracer SHALL map logical and physical properties to the same side using the element's computed writing mode and direction, so a row is traced to the declaration that actually sets it whichever form the author used. When a logical and a physical declaration compete for the same side, the cascade order between them SHALL decide.

#### Scenario: Mapping follows the writing mode

- **WHEN** an element sets `padding-block-start` and is laid out vertically right-to-left
- **THEN** the row for the element's right padding is traced to that `padding-block-start` declaration

##### Example: block-start side

| Writing mode | Direction | `padding-block-start` sets |
| --- | --- | --- |
| horizontal-tb | ltr | top padding |
| vertical-rl | ltr | right padding |
| vertical-lr | ltr | left padding |


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Inherited values are traced to the declaring ancestor

For an inherited property with no declaration on the selected element, or with the value `inherit`, or for text color with the value `currentcolor`, the tracer SHALL walk up the ancestors to the element whose declaration provides the value and SHALL trace the row there with the full cascade of that ancestor. The row SHALL state that the value is inherited and from which element. The source SHALL be classified as one of four kinds, and only the first SHALL be editable.

#### Scenario: Source kinds

- **WHEN** a row's value is inherited
- **THEN** the row names the source element and applies the rule for its kind

##### Example: four kinds of inherited source

| Declaring ancestor | Verdict | Extra |
| --- | --- | --- |
| an ancestor inside the same component | editable at that ancestor's declaration | states that every descendant of that ancestor changes |
| the root or a part of an enclosing, different component | read-only | offers to select that element |
| a story wrapper, the document root, or a stylesheet outside the component roots | read-only | names the source |
| no declaration found (browser default) | read-only | states that no declaration sets it |

#### Scenario: currentcolor follows the text color

- **WHEN** an element declares `color: currentcolor` and an enclosing component declares `color: var(--x)`
- **THEN** the text color row is traced to the enclosing component's declaration and is read-only with an offer to select that element


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Value shapes and verdicts

The tracer SHALL classify the authored value of the winning declaration and derive the verdict from the shape. A value that is exactly one `var()` reference without fallback SHALL be re-bindable. A space-separated shorthand in which every top-level component is either exactly one `var()` reference without fallback or a value containing no reference SHALL be re-bindable per reference, each reference addressed by its position among the references of the value; the sides or sub-properties set by a component without a reference SHALL be read-only literals. Every other shape — a reference inside a function, a reference with a fallback, a comma-separated list, a slash-separated radius — SHALL be read-only with a reason, and SHALL still show the chain of the first reference when it has one.

#### Scenario: Shapes

- **WHEN** a winning declaration is classified
- **THEN** the verdict follows the table below

##### Example: shape to verdict

| Authored value | Verdict |
| --- | --- |
| `var(--md-comp-x-color)` | re-bindable |
| `var(--a) var(--b)` on `padding` | block sides re-bindable at reference 0, inline sides at reference 1 |
| `var(--w) solid var(--c)` on `border` | width re-bindable at reference 0, color at reference 1, style read-only keyword |
| `0 0 var(--gap)` on `margin` | block-end side re-bindable at reference 0, the other sides read-only literals |
| `calc(var(--a) * 3)` | read-only: expression (chain of `--a` shown) |
| `var(--a, 4px)` | read-only: reference with fallback |
| `var(--a), var(--b), sans-serif` on `font-family` | read-only: list of references |
| `12px` | read-only: literal value, no token bound |
| `fit-content` | read-only: keyword |

#### Scenario: Ambiguity inside a rule blocks editing

- **WHEN** the rule of the winning declaration declares the same property twice, or a later declaration in the rule overrides the same side
- **THEN** the row is read-only and names the duplicate


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Token chain resolution

For a re-bindable reference the tracer SHALL resolve the referenced custom property the way the browser does — from the element upwards to the element that declares it, taking the winning declaration there — and SHALL follow single-reference aliases to the end. Each link SHALL carry its tier, file and line from the index, and SHALL be flagged when a read-only source overrides it in the current theme. When the first link is declared on an element other than the document root, the row SHALL be read-only as a scoped override.

#### Scenario: A chain is shown end to end

- **WHEN** a fill row references a component token that aliases a system token that aliases a reference token
- **THEN** the row shows the three links with their files and lines and the final resolved value

#### Scenario: A theme override is flagged

- **WHEN** a system token on the chain is re-declared by a read-only stylesheet for the active theme
- **THEN** that link is flagged as overridden and names the overriding file, and the value shown is the overridden one


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Edit scopes

For every re-bindable row the tracer SHALL list the scopes at which the change can be made, each with the file and line it writes and the number of declarations and components it affects: the declaration itself, the component token it references, and the system token on its chain. The default scope SHALL be the component token when the declaration references a writable component token that is a single alias, and the declaration otherwise. The system-token scope SHALL be offered only when the binding marks the system tier writable. A scope whose target is shadowed, duplicated, not a single alias or in a file that cannot be written SHALL be listed as unavailable with its reason, and the tracer SHALL NOT silently fall back from it to another scope.

#### Scenario: Scopes of a component-token-backed fill

- **WHEN** a fill row references a writable component token that aliases a system token, and the system tier is writable
- **THEN** the row lists three scopes — declaration, component token (default) and system token — each with its file, line and impact counts

#### Scenario: A broken default scope is not replaced silently

- **WHEN** the referenced component token is declared twice in its file
- **THEN** the component-token scope is listed as unavailable with the duplicate as the reason, and the row has no default scope


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Probe confirms the traced declaration

Before a row is offered for editing, the tool SHALL prove that the traced target drives the element: with transitions suppressed, it temporarily sets the target to a sentinel value of the row's kind, reads the computed value, and restores the original text and priority. The row SHALL become editable only when the computed value changed under the sentinel and returned afterwards. A probe SHALL leave the stylesheet's rule text identical to what it was, and SHALL start no transition or animation.

#### Scenario: An unconfirmed trace is not editable

- **WHEN** the sentinel does not change the element's computed value
- **THEN** the row is read-only with the reason that the cascade could not be confirmed

#### Scenario: Probing under a transition

- **WHEN** the element has a one-second transition on all properties and a row is probed
- **THEN** the probe reports the row as confirmed and the number of running animations on the page is unchanged

<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->