## MODIFIED Requirements

### Requirement: Low-text presentation

In its default view the inspector SHALL present each property as one compact row — an icon or short label, the resolved value, and the bound token as a pill — and SHALL NOT show explanatory sentences, file paths or line numbers in rows. Why a row cannot be edited, where a value is inherited from, and what a scope affects SHALL be given on demand: as the row's tooltip and in the popover that opens from the row. Rows that have neither a declaration nor an inherited source SHALL be hidden by default, with a control per section that reveals them and says how many there are; the direction, wrapping, alignment and distribution rows of a flex container SHALL be shown even when no declaration sets them. A developer-details setting, off by default and remembered, SHALL add the stylesheet file, selector and line and the token chain to the header and to the popover. Size rows SHALL be labelled by the physical dimension they have in the element's writing mode.

#### Scenario: The default view has no sentences

- **WHEN** a component root is selected with the default settings
- **THEN** no row contains a file path, and every read-only row is visibly not editable and carries its reason as a tooltip

#### Scenario: Hidden rows can be revealed

- **WHEN** a section has rows without a declaration and the person activates the section's reveal control
- **THEN** those rows are listed with their computed values

#### Scenario: Developer details are opt-in

- **WHEN** the person turns developer details on and opens a row
- **THEN** the popover shows the declaration's file and line and the token chain, and the setting is still on after a reload

#### Scenario: Layout rows of a flex container are always listed

- **WHEN** a flex container that declares only its display and its direction is selected with the default settings
- **THEN** the Layout section lists the direction, wrapping, alignment and distribution rows, and the three undeclared ones show their computed values marked as defaults

### Requirement: Property rows in the panel

The inspector SHALL render the traced rows in the sections and order of the tracing table. Each row SHALL show its label, the resolved value, and the bound token as a pill. An editable layout row SHALL show the icon and the name of its current keyword in place of a token pill. Activating a row SHALL open a popover beside the inspector: for a row that is editable by re-binding the token picker; for an editable layout row the layout options; for a read-only row the reason in words. An inherited row SHALL be marked as inherited, and its popover SHALL name the element it is inherited from and, when that element is selectable, offer to select it.

#### Scenario: A read-only row explains itself

- **WHEN** a row's value is a literal with no token
- **THEN** the row shows the value, is visibly not editable, and its tooltip and its popover state that no token is bound, without a token picker

#### Scenario: The display row stays read-only

- **WHEN** a flex container is selected
- **THEN** its display row is visibly not editable and states that display is view-only, while its direction row is editable

### Requirement: Changes list

The inspector SHALL list every staged change in one line with the row, the old and the new token and its state, and SHALL give the element, the write location and the impact on demand. For a layout change the line SHALL show the old and the new keyword in the place of the tokens, and for an added declaration it SHALL show that the property was not set in the place of the old keyword. It SHALL offer to remove one change, discard all, and hold a control to compare against the unmodified page. While changes are staged the inspector SHALL say in one line, beside the actions, that they are a preview in this browser and not yet written to files, with their count, and the apply action SHALL be labelled as writing to files. With no staged change and no report, the changes area SHALL take no space. Staged changes SHALL be saved immediately when they change and restored after a reload. A change that has been applied SHALL leave the list and SHALL NOT reappear after any reload.

#### Scenario: Applied changes do not come back

- **WHEN** two changes are applied and the browser tab is reloaded while the result is still being verified
- **THEN** after the reload the changes list is empty

#### Scenario: Staged is not written

- **WHEN** two changes are staged and none has been applied
- **THEN** the changes area says that two changes are previewed and not yet written to files, the apply action reads as writing to files, and no file on disk has changed

#### Scenario: Hold to compare

- **WHEN** a person holds the compare control
- **THEN** every preview is removed while it is held and re-applied on release, and the control does not move under the pointer

#### Scenario: A layout change reads as keyword to keyword

- **WHEN** the distribution of a flex container is staged from `center` to `space-between`, and its wrapping, which no declaration sets, is staged to `wrap`
- **THEN** the changes list has one line showing `center` and `space-between` and one line showing that wrapping was not set and is now `wrap`, and the stylesheet on disk is unchanged

## ADDED Requirements

### Requirement: Layout options

Activating an editable layout row SHALL open a popover that lists the keywords of the row, each with an icon and its name, with the keyword in effect marked. The icons SHALL show the result for the element's current flex direction and writing direction, so that a person does not need to reason about main and cross axes. Highlighting an option by pointer or keyboard SHALL preview it on the page without staging it; choosing an option SHALL stage a change and close the popover; closing the popover without choosing SHALL remove the preview. Options SHALL NOT be choosable until the row's probe has confirmed the trace. The popover SHALL name the rule the change is written to, and for a row that no declaration sets it SHALL say that a declaration is added to that rule. A layout row SHALL NOT offer a scope switch or scale stepping. Choosing the keyword the source already holds SHALL remove the staged change of that row.

#### Scenario: Highlight previews, choice stages

- **WHEN** a person opens the direction row of a horizontal flex container, highlights the vertical option and then presses Escape
- **THEN** the page shows the children stacked vertically while the option is highlighted and returns to the horizontal layout after Escape, with nothing added to the changes list

#### Scenario: Choosing stages one change

- **WHEN** a person chooses the vertical option
- **THEN** the popover closes, the row shows the vertical direction as staged, the page shows the children stacked vertically, and the changes list has one more line

#### Scenario: The popover says where a new declaration goes

- **WHEN** a person opens the wrapping row of a flex container that does not declare wrapping
- **THEN** the popover names the rule that declares the element's display and says that a declaration is added to it

#### Scenario: Choosing the original value un-stages

- **WHEN** the direction of a row is staged from `row` to `column` and the person opens the row again and chooses `row`
- **THEN** the changes list no longer has a line for that row and the page shows the original layout
