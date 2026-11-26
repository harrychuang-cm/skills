## MODIFIED Requirements

### Requirement: Property rows

For the selected element the tracer SHALL report one row per property of a fixed table, grouped into Layout, Spacing, Size, Appearance, Fill, Stroke and Typography. Each row SHALL carry the computed value, the winning declaration when one exists, the token chain, a verdict, and the files a change would write. The display row SHALL always be read-only. The direction, alignment, distribution and wrapping rows SHALL be editable only as the requirement "Layout rows of a flex container" states, and read-only with a reason otherwise. A property with several sides or corners SHALL be reported as one row when every side resolves to the same slot of the same declaration, and as one row per side otherwise.

#### Scenario: Row table

- **WHEN** an element is selected
- **THEN** the trace contains the rows of the table below, in this order

##### Example: row table

| Section | Rows | Editable |
| --- | --- | --- |
| Layout | display | no (read-only value) |
| Layout | direction, alignment, distribution, wrapping | by choosing a keyword, on a flex container |
| Layout | gap (row, column) | by re-binding |
| Spacing | padding (four sides), margin (four sides) | by re-binding |
| Size | inline size, block size, and their minimum and maximum | by re-binding |
| Appearance | opacity, corner radius (four corners) | by re-binding |
| Fill | background color | by re-binding |
| Stroke | border color, border width (four sides), outline color, outline width, SVG stroke, SVG stroke width | by re-binding |
| Typography | font family, font size, font weight, line height, letter spacing, text color | by re-binding |

#### Scenario: Equal sides collapse into one row

- **WHEN** an element's padding is set by a single `padding: var(--x)` declaration
- **THEN** the trace reports one padding row for all four sides

#### Scenario: Different sides are reported separately

- **WHEN** an element's padding is set by `padding-block: var(--a)` and `padding-inline: var(--b)`
- **THEN** the trace reports the block sides and the inline sides as separate rows, each with its own declaration

## ADDED Requirements

### Requirement: Layout rows of a flex container

When the computed display of the selected element is `flex` or `inline-flex`, the tracer SHALL report the direction (`flex-direction`), wrapping (`flex-wrap`), alignment (`align-items`) and distribution (`justify-content`) rows as editable by keyword. Each such row SHALL carry the fixed list of keywords its property accepts and exactly one scope, which names the stylesheet, the rule and the line a change writes.

The target of the row SHALL be decided as follows. When a declaration in an identity-verified, writable component stylesheet wins the row and the component of its value that sets the row is a single keyword, the target SHALL be that component, addressed by its position among the top-level components of the value. When no declaration sets the row, the target SHALL be a new declaration appended to the rule that holds the element's winning `display` declaration, provided that rule is in an identity-verified, writable component stylesheet and the index marks it as able to take a new declaration.

The row SHALL be read-only with a reason when: the element is not a flex container; the winning declaration is important, is declared twice in its rule, or is overridden later in its rule; the component that sets the row holds a reference or is not a single keyword; the row is set through a `place-items` or `place-content` shorthand; the winning declaration, or for a new declaration the `display` declaration, is outside the writable component stylesheets; or the rule cannot take a new declaration.

The probe of a layout row SHALL use as its sentinel another keyword of the row's list than the current computed value, and for a new declaration SHALL add the property to the rule temporarily and remove it again.

#### Scenario: Keyword lists

- **WHEN** a layout row is editable
- **THEN** it offers exactly the keywords of the table below, in this order

##### Example: keywords per row

| Row | Property | Keywords |
| --- | --- | --- |
| direction | `flex-direction` | `row`, `column`, `row-reverse`, `column-reverse` |
| wrapping | `flex-wrap` | `nowrap`, `wrap` |
| alignment | `align-items` | `flex-start`, `center`, `flex-end`, `stretch`, `baseline` |
| distribution | `justify-content` | `flex-start`, `center`, `flex-end`, `space-between`, `space-around`, `space-evenly` |

#### Scenario: Targets and verdicts

- **WHEN** the layout rows of an element are traced
- **THEN** the verdict and target follow the table below

##### Example: one rule `.box` that matches the element

| Declarations of `.box` | Row | Verdict and target |
| --- | --- | --- |
| `display: flex; flex-direction: column;` | direction | editable; target is component 0 of the `flex-direction` declaration |
| `display: flex; flex-direction: column;` | wrapping | editable; target is a new `flex-wrap` declaration appended to `.box` |
| `display: inline-flex; flex-flow: column wrap;` | direction | editable; target is component 0 of the `flex-flow` declaration |
| `display: inline-flex; flex-flow: column wrap;` | wrapping | editable; target is component 1 of the `flex-flow` declaration |
| `display: flex; align-items: start;` | alignment | editable; the current value `start` is shown and is not one of the offered keywords |
| `display: flex; place-items: center;` | alignment | read-only: set through a shorthand |
| `display: flex; justify-content: var(--x);` | distribution | read-only: not a single keyword |
| `display: grid; align-items: center;` | alignment | read-only: not a flex container |
| `display: block;` | direction | read-only: not a flex container |

#### Scenario: The display declaration is somewhere the tool cannot write

- **WHEN** an element is a flex container because of a rule in a stylesheet outside the component roots, and no declaration sets its wrapping
- **THEN** the wrapping row is read-only and names that stylesheet

### Requirement: Rules that can take a new declaration

The index SHALL mark, for every rule of a component stylesheet, whether a declaration can be appended to it. A rule SHALL be able to take a new declaration only when it has at least one declaration, its last declaration ends with a semicolon, and it contains no nested rule and no nested at-rule. For a rule that cannot, the index SHALL state which of these conditions failed.

#### Scenario: Marking

- **WHEN** a component stylesheet is indexed
- **THEN** each rule is marked as in the table below

##### Example: rules and their marks

| Rule text | Can take a new declaration |
| --- | --- |
| `.a { display: flex; gap: 4px; }` | yes |
| `.b { display: flex; gap: 4px }` | no: the last declaration has no semicolon |
| `.c { }` | no: the rule is empty |
| `.d { display: flex; .e { color: red; } }` | no: nested content |
| `.f { display: flex; /* layout */ }` | yes |
