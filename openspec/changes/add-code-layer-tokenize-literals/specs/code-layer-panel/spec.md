## MODIFIED Requirements

### Requirement: Property rows in the panel

The inspector SHALL render the traced rows in the sections and order of the tracing table. Each row SHALL show its label, the resolved value, and the bound token as a pill. A row whose value is a tokenizable literal SHALL show, in place of the pill, a mark that no token is bound, and SHALL be visibly editable. Activating a row SHALL open a popover beside the inspector: for an editable row the token picker; for a read-only row the reason in words. An inherited row SHALL be marked as inherited, and its popover SHALL name the element it is inherited from and, when that element is selectable, offer to select it.

#### Scenario: A read-only row explains itself

- **WHEN** a row's value is a keyword, a literal expression, a literal list, or a literal for which the project has no token of an accepted kind
- **THEN** the row shows the value, is visibly not editable, and its tooltip and its popover state the reason, without a token picker

#### Scenario: A literal row offers tokens

- **WHEN** a row's value is a tokenizable literal
- **THEN** the row shows the value with the mark that no token is bound, and activating it opens the token picker headed by the literal value

#### Scenario: A staged tokenization shows both values

- **WHEN** a token has been chosen for a literal row and the change is staged
- **THEN** the row shows the chosen token as a pill together with the literal it replaces

### Requirement: Token picker

Activating an editable row SHALL open a picker that lists the tokens the row can be re-bound to at the row's current scope: tokens of a compatible kind, at the tier the scope's rule allows, with tokens of the same category as the current token first. The picker SHALL filter by typing over token names and resolved values, show each token's resolved value for the active theme, and show a swatch for colors. Highlighting an entry by pointer or keyboard SHALL preview it on the page without staging it; choosing an entry SHALL stage a change and close the picker; closing the picker without choosing SHALL remove the preview. Entries SHALL NOT be choosable until the row's probe has confirmed the trace.

For a row whose value is a tokenizable literal the picker SHALL list the tokens the declaration is allowed to reference whose kind the row's property accepts, in three groups in this order. First, tokens of a home category whose resolved value for the active theme equals the literal, each marked as having the same value. Second, the remaining tokens of the home categories, nearest value to the literal first where the values are comparable and by name otherwise. Third, tokens of every other category, by name, with a token of equal value still marked. The home categories of a row SHALL be the token categories that declarations of the same property group already reference, directly or through a component token, in the project's component stylesheets; when that group references none, they SHALL be the categories referenced by the other property groups of the same inspector section. Two values SHALL count as equal when they are the same color, or the same number with the same unit, or both zero. Choosing an entry of a literal row SHALL stage a tokenization.

#### Scenario: Highlight previews, choice stages

- **WHEN** a person highlights a token in the picker and then presses Escape
- **THEN** the page shows the highlighted token while it is highlighted and returns to the staged state after Escape, with nothing added to the changes list

#### Scenario: Tier rule filters the list

- **WHEN** the picker is opened for a component token at component scope
- **THEN** it lists system tokens of a compatible kind and no reference tokens and no component tokens

#### Scenario: Tokens for a literal are ordered by equal value, home category, other

- **WHEN** the picker is opened for a literal row
- **THEN** the entries are ordered as in the table below

##### Example: the literal `8px` on a padding row, where padding declarations in the project reference only spacing tokens

| Token | Resolved value | Category | Group | Same-value mark |
| --- | --- | --- | --- | --- |
| `--md-sys-spacing-sm` | 8px | spacing | 1 | yes |
| `--md-sys-spacing-xs` | 4px | spacing | 2 | no |
| `--md-sys-spacing-md` | 16px | spacing | 2 | no |
| `--md-sys-shape-corner-md` | 8px | shape | 3 | yes |
| `--md-sys-typescale-body-size` | 16px | typescale | 3 | no |

#### Scenario: A zero margin is not matched to a corner token

- **WHEN** the picker is opened for the literal `0` of a margin declaration, margin declarations in the project reference only spacing tokens, no spacing token resolves to zero, and a corner token resolves to zero
- **THEN** the first group is empty, the spacing tokens come first, and the corner token is listed after them

#### Scenario: A size row borrows the categories of its section

- **WHEN** the picker is opened for the literal of a maximum inline size row, no maximum inline size declaration in the project references a token, and minimum size declarations reference tokens of the size category
- **THEN** tokens of the size category are listed before tokens of other categories

### Requirement: Scale stepping

With an editable row focused, ArrowUp and ArrowDown SHALL move the row to the next and previous token on the row's scale, dragging the row's label horizontally SHALL move along the same scale, and the row's popover SHALL offer a step-down and a step-up control. The scale of a row SHALL be the tokens its picker offers that belong to the current token's category, ordered by resolved value. Stepping SHALL preview immediately; releasing the drag, pressing Enter or using a step control SHALL stage the change, and Escape SHALL cancel a keyboard or drag step. A row whose scale has fewer than two tokens with comparable values SHALL NOT offer stepping. A row whose value is a literal has no current token and SHALL NOT offer stepping until a tokenization of it has been applied.

#### Scenario: Stepping walks the scale in value order

- **WHEN** a corner radius row is bound to a 4px token on a scale of 0, 2px, 4px, 8px and 16px tokens and the person presses ArrowUp twice and then Enter
- **THEN** the page previews 8px, then 16px, and a change to the 16px token is staged

#### Scenario: A literal row does not step

- **WHEN** a literal row is focused and the person presses ArrowUp
- **THEN** nothing is previewed or staged, and the row's popover has no step controls

### Requirement: Changes list

The inspector SHALL list every staged change in one line with the row, the old and the new token and its state, and SHALL give the element, the write location and the impact on demand. For a tokenization the line SHALL show the old literal value in the place of the old token. It SHALL offer to remove one change, discard all, and hold a control to compare against the unmodified page. While changes are staged the inspector SHALL say in one line, beside the actions, that they are a preview in this browser and not yet written to files, with their count, and the apply action SHALL be labelled as writing to files. With no staged change and no report, the changes area SHALL take no space. Staged changes SHALL be saved immediately when they change and restored after a reload. A change that has been applied SHALL leave the list and SHALL NOT reappear after any reload.

#### Scenario: Applied changes do not come back

- **WHEN** two changes are applied and the browser tab is reloaded while the result is still being verified
- **THEN** after the reload the changes list is empty

#### Scenario: Staged is not written

- **WHEN** two changes are staged and none has been applied
- **THEN** the changes area says that two changes are previewed and not yet written to files, the apply action reads as writing to files, and no file on disk has changed

#### Scenario: Hold to compare

- **WHEN** a person holds the compare control
- **THEN** every preview is removed while it is held and re-applied on release, and the control does not move under the pointer

#### Scenario: A tokenization reads as value to token

- **WHEN** the literal `70%` of a row is staged to a token
- **THEN** its line in the changes list shows `70%` as the old value and that token as the new one, and the stylesheet on disk still holds `70%`
