# code-layer-panel Specification

## Purpose

Define the Code Layer inspector, a floating panel over the Storybook canvas modelled on the properties panel of a design tool: how it presents the selected element, lets a person re-bind tokens with a live preview, collects staged changes, and reports what applying them did. The inspector is the only place from which source files are changed. A designer should be able to use it without reading: properties are compact rows of icon, value and token, and every explanation is given on demand.

## Requirements

### Requirement: Floating inspector on the canvas

While the tool is on, the inspector SHALL be shown as a floating panel over the Storybook canvas and SHALL NOT use Storybook's addon panel area: turning the tool on or off SHALL leave the addon panel's position, visibility and selected tab as they are. A person SHALL be able to drag the inspector by its header to any position inside the canvas area and to collapse it to its header. The position and the collapsed state SHALL be remembered for the project across reloads, and the inspector SHALL be brought back inside the canvas area when that area becomes smaller. The inspector SHALL NOT be part of the story document.

#### Scenario: The inspector goes where the person puts it

- **WHEN** a person drags the inspector's header to another place on the canvas and reloads the browser tab
- **THEN** the inspector is at that place again

#### Scenario: Storybook's own layout is left alone

- **WHEN** the addon panel is at the bottom with another tab selected and the tool is turned on and then off
- **THEN** the addon panel is at the bottom with that tab selected throughout

#### Scenario: The inspector stays reachable

- **WHEN** the browser window is made smaller than the inspector's remembered position
- **THEN** the whole header of the inspector is inside the canvas area


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
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


<!-- @trace
source: add-code-layer-layout-editing
updated: 2026-11-26
code:
  - storybook-code-layer/
-->

---
### Requirement: First-use guidance

With nothing selected the inspector SHALL show, in at most three short lines each with its gesture, how to select an element, how to go one level in, and how to change a token.

#### Scenario: An empty inspector says how to start

- **WHEN** the tool is turned on and nothing is selected
- **THEN** the inspector shows the three gestures and no property rows


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Selection header and navigation

For the selected element the inspector SHALL show its label, component and variant, rendered size, and a breadcrumb of its selectable ancestors up to the story root, marking component boundaries. The inspector SHALL list the element's selectable children. Pointing at a breadcrumb entry or a child SHALL outline that element in the preview, and activating it SHALL select it. The header SHALL offer to copy the object reference. With developer details on, the header SHALL also show the stylesheet file, rule selector and line that carry the element's own declarations.

#### Scenario: Navigating from the panel

- **WHEN** a person activates a breadcrumb entry
- **THEN** that ancestor becomes the selection in the preview and the panel shows its rows


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Property rows in the panel

The inspector SHALL render the traced rows in the sections and order of the tracing table. Each row SHALL show its label, the resolved value, and the bound token as a pill. An editable layout row SHALL show the icon and the name of its current keyword in place of a token pill. Activating a row SHALL open a popover beside the inspector: for a row that is editable by re-binding the token picker; for an editable layout row the layout options; for a read-only row the reason in words. An inherited row SHALL be marked as inherited, and its popover SHALL name the element it is inherited from and, when that element is selectable, offer to select it.

#### Scenario: A read-only row explains itself

- **WHEN** a row's value is a literal with no token
- **THEN** the row shows the value, is visibly not editable, and its tooltip and its popover state that no token is bound, without a token picker

#### Scenario: The display row stays read-only

- **WHEN** a flex container is selected
- **THEN** its display row is visibly not editable and states that display is view-only, while its direction row is editable


<!-- @trace
source: add-code-layer-layout-editing
updated: 2026-11-26
code:
  - storybook-code-layer/
-->

---
### Requirement: Token picker

Activating an editable row SHALL open a picker that lists the tokens the row can be re-bound to at the row's current scope: tokens of a compatible kind, at the tier the scope's rule allows, with tokens of the same category as the current token first. The picker SHALL filter by typing over token names and resolved values, show each token's resolved value for the active theme, and show a swatch for colors. Highlighting an entry by pointer or keyboard SHALL preview it on the page without staging it; choosing an entry SHALL stage a change and close the picker; closing the picker without choosing SHALL remove the preview. Entries SHALL NOT be choosable until the row's probe has confirmed the trace.

#### Scenario: Highlight previews, choice stages

- **WHEN** a person highlights a token in the picker and then presses Escape
- **THEN** the page shows the highlighted token while it is highlighted and returns to the staged state after Escape, with nothing added to the changes list

#### Scenario: Tier rule filters the list

- **WHEN** the picker is opened for a component token at component scope
- **THEN** it lists system tokens of a compatible kind and no reference tokens and no component tokens


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Scale stepping

With an editable row focused, ArrowUp and ArrowDown SHALL move the row to the next and previous token on the row's scale, dragging the row's label horizontally SHALL move along the same scale, and the row's popover SHALL offer a step-down and a step-up control. The scale of a row SHALL be the tokens its picker offers that belong to the current token's category, ordered by resolved value. Stepping SHALL preview immediately; releasing the drag, pressing Enter or using a step control SHALL stage the change, and Escape SHALL cancel a keyboard or drag step. A row whose scale has fewer than two tokens with comparable values SHALL NOT offer stepping.

#### Scenario: Stepping walks the scale in value order

- **WHEN** a corner radius row is bound to a 4px token on a scale of 0, 2px, 4px, 8px and 16px tokens and the person presses ArrowUp twice and then Enter
- **THEN** the page previews 8px, then 16px, and a change to the 16px token is staged


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Scope switch

An editable row with more than one scope SHALL let the person choose the scope in the row's popover before staging. Scopes SHALL be named by their reach — only this place, this component, the whole system — and each SHALL say how many components it affects; the file and line that would be written SHALL be shown with developer details on. The change staged SHALL be the operation of the chosen scope. Choosing the system-token scope SHALL require an explicit confirmation that names the number of affected components.

#### Scenario: The same edit at two scopes

- **WHEN** a fill row is staged at component scope and then switched to declaration scope
- **THEN** the staged change is replaced by one that writes the component stylesheet instead of the token file


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Live preview of staged changes

Every staged change SHALL be previewed by editing, in the page's stylesheet objects, the same rule or token declaration the server would write, using the same text replacement as the server. The state of each staged change SHALL be derived from the text of the page's stylesheets only — the text before the change means previewing, the text after it means already in the source, anything else means a conflict that is not previewed — and SHALL be shown beside the change. Previews SHALL be re-applied after any hot update that leaves the source unchanged, and removed whenever the tool is not active. A preview that does not change the selected element's computed value SHALL be flagged as having no visible effect on this page.

#### Scenario: A hot update keeps previews

- **WHEN** a change is staged and the affected stylesheet is re-sent by the dev server with unchanged content
- **THEN** the preview is still visible afterwards and the change is still listed as previewing

#### Scenario: An external edit becomes a conflict

- **WHEN** a change to a declaration is staged and another program changes that declaration in the file
- **THEN** the change is listed as conflicting with the source, its preview is removed, and applying is refused until it is removed or re-staged


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
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


<!-- @trace
source: add-code-layer-layout-editing
updated: 2026-11-26
code:
  - storybook-code-layer/
-->

---
### Requirement: Apply and report

The inspector SHALL apply the staged changes as one batch on an explicit action and SHALL show a report: writing, verifying, and one of the outcomes defined by the write-back capability. The outcome SHALL be one line with the undo action beside it. The per-change results, the rewritten specification rows, the documents pending sync and the results of post-apply commands SHALL each be a section with a count that opens on demand; a section that needs the person's attention — a change that is not verified, a refusal — SHALL be open from the start. The parts of the report SHALL hold their place: a result that arrives later SHALL NOT move a control the person may be about to use. The report SHALL offer to undo the apply, verify again, reload the preview and verify, and skip an undo that conflicts. When the server refuses the batch the report SHALL show the reason in words, the staged changes SHALL remain listed, and their previews SHALL return. A write request that is refused only because the page's session is no longer the server's — the dev server was restarted while the page stayed open — SHALL be sent again once with the server's current session, without the person acting and without applying twice. When the server serves other inspector code than the page is running, the inspector SHALL say that the page needs a reload and offer it.

#### Scenario: A refusal keeps the work

- **WHEN** the server refuses a batch because the source of truth and its mirror differ
- **THEN** the report says nothing was applied and why, and both staged changes are still listed and previewed

#### Scenario: The dev server was restarted under an open page

- **WHEN** the dev server is restarted while the page stays open with a staged change, and the person applies
- **THEN** the change is written once and verified without a reload

#### Scenario: Newer inspector code on the server

- **WHEN** the restarted server serves inspector code that differs from what the page is running
- **THEN** the inspector says a reload is needed and offers the action, and writes still work in the meantime


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Notices for mirror drift, paired tokens and documents

The panel SHALL show, before a person tries to apply, when the source of truth and its mirror differ, with the number of differing lines per file and an action that synchronizes the mirror from the source of truth after confirmation. The panel SHALL show the paired-token warnings and the documents-pending-sync entries produced by the governance capability next to the changes they belong to.

#### Scenario: Drift is visible before applying

- **WHEN** the mirror of a token file differs from its source of truth
- **THEN** the panel shows the drift and the synchronize action while the apply action is disabled


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Object reference

The tool SHALL copy, from the selection label and from the panel header, a plain-text object reference that an AI assistant can act on without seeing the page: a version marker line, the story, the component, variant and element, the element path, the stylesheet file, selector, rule ordinal and line, and one line per traced row with the property, the token chain with file and line for each link, and the resolved value. Every path, selector and token in a reference SHALL exist in the project at the time it is copied.

#### Scenario: A reference can be resolved from disk

- **WHEN** a reference is copied for a selected component root
- **THEN** each file path in it exists under the workspace root, the selector text occurs in the named stylesheet, and each token is declared in a token file


<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
### Requirement: Interface language

Every string the tool shows — in the toolbar, the panel, the overlay, reasons, reports and the object reference labels — SHALL come from one message catalog with Traditional Chinese and English entries that have identical key sets. The language SHALL follow the binding's `locale` when set and the browser language otherwise, falling back to English. Server error codes SHALL be translated by the catalog; text produced by project check commands SHALL be shown as produced.

#### Scenario: The two catalogs stay complete

- **WHEN** the catalogs are compared
- **THEN** every key present in one language is present in the other

#### Scenario: Language follows the binding

- **WHEN** the binding sets `locale` to `en` and the browser language is Traditional Chinese
- **THEN** the panel, overlay and reports are in English

<!-- @trace
source: add-storybook-code-layer
updated: 2026-11-25
code:
  - storybook-code-layer/
-->

---
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

<!-- @trace
source: add-code-layer-layout-editing
updated: 2026-11-26
code:
  - storybook-code-layer/
-->