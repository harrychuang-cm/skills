## Purpose

Define the designer-facing review page that design-system-extractor generates: a self-contained static page on which a designer confirms or adjusts the AI's suggested review decisions and exports them as a prompt for the AI to apply. The same data is available in a machine-readable form so other tools report the same numbers the designer sees.

## ADDED Requirements

### Requirement: The review page is one self-contained static file

The review generator SHALL write the review page as a single HTML file that references no network resource and works when opened directly from disk. Screenshots SHALL be referenced by relative path from the assets the generator copies beside the page. The page SHALL NOT write to any project file. When the page template is missing, the generator SHALL exit with a failure status and name the missing path.

#### Scenario: The generated page loads nothing from the network

- **WHEN** the generator writes the review page for any package
- **THEN** the HTML contains no script, stylesheet, font or image reference that starts with a network scheme

#### Scenario: A missing template stops generation

- **WHEN** the generator runs and the page template file is absent
- **THEN** the generator exits with a failure status and its message names the template path


### Requirement: Near values are grouped into review items

The generator SHALL treat every set of reference tokens connected by near pairs as one review item, so a designer decides a set of values once. Color members SHALL be ordered from lightest to darkest and numeric members from smallest to largest. An item's identifier SHALL be derived from its sorted member names, so the identifier is unchanged while its membership is unchanged.

#### Scenario: Connected near pairs become one item

- **WHEN** near pairs link several reference tokens into a chain
- **THEN** the chain is reported as one review item whose pair count equals the number of near pairs among its members

##### Example: nine pairs become three items

- **GIVEN** light neutrals 96, 92, 88 with near pairs 96/92 and 92/88; dark neutrals 18, 15, 12, 8, 5, 0 with near pairs 18/15, 15/12, 12/8, 12/5, 8/5 and 5/0; and type sizes 13px and 14px as one near pair
- **WHEN** the generator builds review items
- **THEN** it reports 3 items with 3, 6 and 2 members and 2, 6 and 1 pairs


### Requirement: Dense groups are presented compactly without hiding values

An item with more than 12 members SHALL be marked dense. The page SHALL present a dense item in a compact form that lists every member in order and distinguishes members that no system role uses and members whose value is not a whole number, and SHALL let the designer expand it to decide each member. No member SHALL be omitted from either form.

#### Scenario: The dense threshold

- **WHEN** an item has 13 members
- **THEN** the item is marked dense

##### Example: threshold boundary

| Members in the item | Marked dense |
| --- | --- |
| 2 | no |
| 12 | no |
| 13 | yes |
| 113 | yes |

#### Scenario: Expanding a dense item exposes every member

- **WHEN** a designer expands a dense item with 113 members
- **THEN** the page offers a keep-or-merge control for each of the 113 members


### Requirement: Each value shows where it is used

For every reference token in a near-token item the page SHALL show the system roles that reference it and the components that use those roles. A component token SHALL be attributed to the component whose specification document names it. A reference token that no system role references SHALL be shown as unused.

#### Scenario: Usage is computed from the token files and component specifications

- **WHEN** a reference token is referenced by system tokens that component tokens reference
- **THEN** the page lists those system roles and the components that own those component tokens

##### Example: usage of two near values

- **GIVEN** `--sl-sys-color-surface-high: var(--sl-ref-color-neutral-warm-96)`, `--sl-comp-app-shell-container-color: var(--sl-sys-color-surface-high)` named in the App Shell specification, and `--sl-ref-color-neutral-warm-15` referenced by no system token
- **WHEN** the generator computes usage
- **THEN** `neutral-warm-96` shows role `surface-high` and component App Shell, and `neutral-warm-15` is shown as unused


### Requirement: Each item starts from its recorded state

An item whose pairs are all confirmed SHALL be shown collapsed with its recorded outcome and SHALL be reopenable for change. An item that has an AI suggestion and is not confirmed SHALL start from that suggestion and show the suggestion with its reason. An item with neither SHALL start with every member kept, SHALL state that the AI has no suggestion, and SHALL NOT offer an action to agree with the AI.

#### Scenario: A suggested item opens on the AI's suggestion

- **WHEN** the page loads an item whose rows suggest merging one member and keeping the rest
- **THEN** that member is shown as merging into the suggested token, the other members are shown as kept, and the suggestion and its reason are visible

#### Scenario: An item without a suggestion asks for a decision

- **WHEN** the page loads an item that has no suggested action and no decision
- **THEN** every member is shown as kept, the page states that the AI has no suggestion, and no agree-with-AI action is offered for that item


### Requirement: Designers decide near values by keeping or merging

Each member of a near-token item SHALL have a control whose checked state means keep. When a designer unchecks a member, the page SHALL merge it into the kept member nearest to it, by color difference for colors and by numeric difference for numbers, and SHALL let the designer choose a different kept member as the target. The page SHALL refuse to uncheck the last kept member. When a color item contains a merge, the page SHALL show the resulting set of colors.

#### Scenario: An unchecked value merges into the nearest kept value

- **WHEN** a designer unchecks a member of an item
- **THEN** the page shows that member merging into the kept member with the smallest difference from it

##### Example: nearest kept value

- **GIVEN** members 18, 15, 12, 8, 5, 0 all kept, where 15 differs from 18 by 1.5 and from 12 by 2.67, and 5 differs from 8 by 1.15 and from 0 by 2.82
- **WHEN** the designer unchecks 15 and then 5
- **THEN** 15 merges into 18 and 5 merges into 8

#### Scenario: The last kept value stays kept

- **WHEN** only one member of an item is still kept and the designer tries to uncheck it
- **THEN** the member stays kept


### Requirement: Similar components and duplicate sources are decided by one choice

A similar-component item SHALL offer the choices merge, make variant, keep distinct and blocked. A duplicate-source item SHALL offer reuse existing source, ignore duplicate and keep distinct. Each choice SHALL carry a one-sentence plain-language explanation, and the choice the AI suggests SHALL be marked.

#### Scenario: The suggested choice is marked and preselected

- **WHEN** the page loads a similar-component item whose suggested action is make variant
- **THEN** make variant is selected and marked as the AI's suggestion, and the other three choices remain available


### Requirement: Confirmation, bulk agreement and progress

Each unconfirmed item SHALL offer confirm and skip. When a designer's selection differs from the AI's suggestion, the page SHALL offer a return to the suggestion and an optional note. A confirmed item SHALL collapse to a summary that states whether it agrees with the AI or is the designer's change, and SHALL remain editable. The page SHALL offer one action that confirms every item that has a suggestion and that the designer has not changed, and SHALL show how many items are confirmed out of the total.

#### Scenario: Bulk agreement leaves the designer's changes alone

- **WHEN** a designer changes and confirms one item out of eleven suggested items and then uses the bulk agreement action
- **THEN** the other ten items are confirmed as agreeing with the AI, the changed item keeps the designer's outcome, and the page shows eleven of eleven confirmed


### Requirement: Selections persist in the browser per package

The page SHALL keep a designer's selections, confirmations, notes and display settings in browser storage under a key that is unique to the package, and SHALL restore them when the page is opened again. A stored entry SHALL be discarded when its item no longer exists or when the recorded outcome of its item equals the stored outcome. The page SHALL work without storage, in which case nothing persists.

#### Scenario: Reloading keeps the designer's work

- **WHEN** a designer confirms items and reloads the page
- **THEN** the same items are shown as confirmed with the same outcomes

#### Scenario: Two packages do not share selections

- **WHEN** review pages of two different packages are opened from disk in the same browser
- **THEN** selections made on one page do not appear on the other


### Requirement: The page exports confirmed decisions as a prompt

The page SHALL build a prompt from the items the designer confirmed whose outcome is not yet recorded. The prompt SHALL name the design-system-extractor apply pass, the package, the page's generation date, and the confirmer with the date; SHALL list every decision with a marker that distinguishes agreement with the AI from a designer change and, for a change, the AI's original suggestion; SHALL give complete token names with values for every kept, merged and restored value; SHALL include the designer's notes; and SHALL end with apply instructions that name the review table for each decision type and require re-running the strict audits and regenerating the documents. The prompt SHALL be written in the page's language with decision keywords in their English canonical form. The page SHALL offer copying the whole prompt, copying one item's prompt, and a preview. When the clipboard is unavailable the page SHALL show the preview and tell the designer to copy it by hand. The whole-prompt action SHALL be unavailable while no item qualifies.

#### Scenario: A merge is written with both complete names and values

- **WHEN** a designer confirms merging one near color into another and exports the prompt
- **THEN** the prompt contains one line holding the merged token's complete name and value, the surviving token's complete name and value, and the direction of the merge

##### Example: a designer change

- **GIVEN** an item whose AI suggestion keeps six values, where the designer merges `--sl-ref-color-neutral-warm-15` (`#1a1714`) into `--sl-ref-color-neutral-warm-18` (`#1c1a17`) and adds the note "The dark theme does not need this many steps"
- **WHEN** the prompt is exported in English
- **THEN** the item's entry is marked as a designer change, states that the AI suggested keeping all six, contains the line `merge: --sl-ref-color-neutral-warm-15 (#1a1714) → --sl-ref-color-neutral-warm-18 (#1c1a17)`, and contains the note

#### Scenario: A failed copy falls back to the preview

- **WHEN** the designer uses the copy action and the browser refuses clipboard access
- **THEN** the page opens the prompt preview and tells the designer to copy the text by hand


### Requirement: Merged-away values stay visible and restorable

A value that a recorded decision merged into another token SHALL remain on the page together with the surviving token, and the page SHALL let the designer choose to restore it as its own token. A chosen restore SHALL appear in the exported prompt as a restore of that value.

#### Scenario: A previously merged value is offered for restoring

- **WHEN** a recorded row merged `6px` into `--sl-ref-radius-8` and the designer marks `6px` as kept and confirms
- **THEN** the exported prompt instructs restoring `6px` as its own reference token that is currently merged into `--sl-ref-radius-8`


### Requirement: Screenshots enlarge in an in-page viewer

Activating a screenshot SHALL open a viewer on the same page; the page SHALL NOT open a screenshot in a new tab or window. The viewer SHALL show the complete screenshot and offer three sizes: fit to the window, actual size, and twice actual size. Activating the image SHALL step to the next size that differs from the current one. The viewer SHALL close on the Escape key, on activating the empty area around the image, and on its close control, and SHALL return focus to the screenshot that opened it. While the viewer is open the rest of the page SHALL NOT be reachable by keyboard. At every size the whole image SHALL be reachable by scrolling.

#### Scenario: A screenshot opens in place

- **WHEN** a designer activates a screenshot on a card
- **THEN** the viewer opens on the same page, shows the complete screenshot fitted to the window, and no new tab or window opens

#### Scenario: Closing returns to the card

- **WHEN** the viewer is open and the designer presses Escape
- **THEN** the viewer closes and focus is on the screenshot that opened it


### Requirement: The compared parts are marked on both screenshots

A similar-component item SHALL show one screenshot for the new candidate, lettered A, and one for the similar existing component, lettered B. When a side has a region, its thumbnail SHALL be framed so the region is fully visible with some of its surroundings, and the region SHALL be outlined and lettered without covering the screenshot with a fill. The viewer SHALL show every region recorded on the displayed screenshot, so both letters appear together when both sides use the same screenshot; SHALL let the designer switch between the two sides and hide the marks; and SHALL keep each mark on the same part of the image at every size. A side without a screenshot SHALL state that it has none, and a side without a region SHALL show its whole screenshot unmarked.

#### Scenario: Each side shows its marked part

- **WHEN** the page loads a similar-component item whose two images carry regions
- **THEN** the card shows two screenshots, the first with an outlined region lettered A and the second with an outlined region lettered B, and each region lies wholly inside its thumbnail

#### Scenario: Two parts in one screenshot are shown together

- **WHEN** both sides reference the same screenshot with different regions and the designer opens the viewer
- **THEN** the viewer shows both regions on that screenshot, lettered A and B

#### Scenario: A mark does not move when the image is enlarged

- **WHEN** the designer changes the viewer from fit to twice actual size
- **THEN** each mark covers the same fraction of the image as before

#### Scenario: A row with one image shows the missing side

- **WHEN** a similar-component row records a single image
- **THEN** side A shows that image and side B states that it has no screenshot


### Requirement: Machine-readable review output

The generator's machine-readable mode SHALL print one JSON object and write no file. The object SHALL contain the counts `sources`, `colorScaleIssues`, `nearColors`, `nearNumbers`, `components`, `items`, `confirmed`, `needsReview` and `unresolvedNearPairs`; a `needsReview` list holding every item that awaits a designer; and an `items` list holding every review item with its identifier, status, members or sides, AI suggestion and recorded outcome. `counts.needsReview` SHALL equal the number of items awaiting a designer, which is the number the page shows, and SHALL equal the length of the `needsReview` list. An item's status SHALL be `confirmed`, `suggested`, `undecided` or `issue`.

#### Scenario: The count equals the list length and the page

- **WHEN** the machine-readable mode runs on a package with two suggested items, one undecided item and four confirmed items
- **THEN** `counts.needsReview` is 3, the `needsReview` list has 3 entries, `counts.confirmed` is 4 and `counts.items` is 7

#### Scenario: The mode writes nothing

- **WHEN** the machine-readable mode runs
- **THEN** standard output holds exactly one JSON object and no file is created or changed


### Requirement: House rules for the review page interface

The page SHALL use an application-shell layout with a side rail, a main area and a fixed action bar. The page SHALL NOT use gradients, backdrop blur or translucent background fills; cards SHALL NOT carry an outline and SHALL NOT be nested inside cards. No text SHALL be smaller than 12 pixels. Every interactive element SHALL be a native control with a visible keyboard-focus indicator, and smooth scrolling SHALL be disabled when the reader prefers reduced motion. The page SHALL have no horizontal scrolling at a viewport width of 420 pixels.

#### Scenario: The stylesheet contains no banned treatment

- **WHEN** the generated page's stylesheet is inspected
- **THEN** it contains no gradient function, no backdrop filter, and no font size below 12 pixels

#### Scenario: The page fits a narrow viewport

- **WHEN** the page is opened at a viewport width of 420 pixels
- **THEN** the document is no wider than the viewport
