## ADDED Requirements

### Requirement: Saved comment pins on the Story

While the visual comments panel is expanded and its `Show pins` control is on, the Story SHALL display one numbered pin for every current-Story comment of the active meeting that passes the panel's kind filter. `Show pins` SHALL be on when the panel mounts and its state MUST NOT be written to browser storage. Collapsing the panel or turning `Show pins` off SHALL remove every saved pin. Each pin SHALL show the comment's meeting-wide ordinal at the comment's own stored normalized position within the current bounds of the resolved capture target, including when the comment's screenshot evidence is unavailable, SHALL be repositioned when the viewport resizes or scrolls, SHALL be marked capture-ignore, and MUST NOT appear in a captured screenshot. While a new comment is being placed, from the start of point selection until its composer closes, saved pins SHALL remain visible and MUST NOT receive pointer events, so that a point under a saved pin can be chosen.

A `Visual fix` pin SHALL be circular and a `Tracking` pin SHALL be a rounded square. Each pin's accessible name SHALL be `Comment <ordinal>, <kind label>, <Open or Completed>`. A Completed comment's pin SHALL use the subdued surface color.

The comments overview SHALL expose, for each comment, a derived `state` object holding the `routeId` and `stateId` recorded on its capture when present, and MUST NOT persist it to canonical meeting JSON. When a comment's recorded `routeId` or `stateId` differs from the Story's current value, its pin MUST NOT be displayed and its list item SHALL show `Captured in another state`. A comment with no recorded `routeId` and no recorded `stateId` SHALL always be eligible for a pin. When a configured capture selector matches no element, or the resolved capture target has zero bounds, no saved pin SHALL be displayed and the panel list SHALL remain usable; saved pins MUST NOT fall back to another element's bounds.

#### Scenario: Expanded panel shows pins for the current Story

- **WHEN** the active meeting holds four comments on the current Story, one of them without screenshot evidence, and one comment on another Story, and the participant expands the panel
- **THEN** the Story shows exactly four numbered pins at those comments' normalized positions with their meeting-wide ordinals

#### Scenario: Collapsing the panel removes the pins

- **WHEN** the participant collapses the panel or turns `Show pins` off
- **THEN** no saved pin remains on the Story and prototype controls beneath the former pins receive clicks again

#### Scenario: Pins follow the kind filter and show kind and status

- **WHEN** the panel lists comments of both kinds and states and the participant changes the kind filter
- **THEN** only pins of comments in the filtered list are displayed, each with the shape and accessible name of its kind and status

##### Example: four comments on the current Story

- **GIVEN** comment 1 `visual-fix` Open, comment 2 `tracking` Completed, comment 3 `visual-fix` Open, and comment 5 `tracking` Open on the current Story, and comment 4 on another Story

| Kind filter | Pins displayed | Accessible names |
| ----------- | -------------- | ---------------- |
| `All` | 1 (circle), 2 (rounded square, subdued), 3 (circle), 5 (rounded square) | `Comment 1, Visual fix, Open`; `Comment 2, Tracking, Completed`; `Comment 3, Visual fix, Open`; `Comment 5, Tracking, Open` |
| `Visual fix` | 1, 3 | `Comment 1, Visual fix, Open`; `Comment 3, Visual fix, Open` |
| `Tracking` | 2, 5 | `Comment 2, Tracking, Completed`; `Comment 5, Tracking, Open` |

#### Scenario: A comment captured in another state has no pin

- **WHEN** a comment was captured with stateId `modal-open` and the Story's current stateId is `default`
- **THEN** that comment has no pin on the Story and its list item shows `Captured in another state`

##### Example: state matching

| Recorded routeId / stateId | Current routeId / stateId | Pin displayed |
| -------------------------- | ------------------------- | ------------- |
| `/order` / `modal-open` | `/order` / `modal-open` | yes |
| `/order` / `modal-open` | `/order` / `default` | no |
| `/order` / none | `/cart` / none | no |
| none / none | `/order` / `default` | yes |
| none / none | none / none | yes |

#### Scenario: Pins are excluded from captures

- **WHEN** saved pins are displayed and the participant adds a new comment
- **THEN** the captured screenshot contains no saved pin

#### Scenario: A point under a saved pin can receive a new comment

- **WHEN** the participant starts a new comment and clicks the point covered by saved pin `3`
- **THEN** the composer opens for a new comment at that point, comment 3 is not selected by that click, and the prototype control beneath runs no handler

#### Scenario: Unresolvable capture target shows no pins

- **WHEN** the configured capture selector matches no element while the panel is expanded
- **THEN** no saved pin is displayed and the panel list still shows the comments

### Requirement: Pin and list correspondence

Activating a saved pin by pointer or keyboard SHALL select its comment in the panel list: the list item SHALL scroll into view, carry `aria-current="true"`, and receive focus, and any previously selected item SHALL lose `aria-current`. Every activation SHALL scroll and focus the list item, including when that comment is already selected. The selected comment's pin SHALL carry a selected mark, and no other pin SHALL carry it. Activating a pin MUST NOT deliver a pointer or click event to the prototype beneath it. Hovering or focusing a list item SHALL mark its pin as highlighted, and leaving the item SHALL remove that mark. The highlighted mark SHALL be separate from the selected mark and SHALL be on at most one pin: the hovered item's pin, otherwise the focused item's pin. These interactions MUST NOT send a request.

#### Scenario: Activating a pin selects its list item

- **WHEN** the participant clicks saved pin `7` while the list item for comment 7 is scrolled out of view
- **THEN** that list item is scrolled into view with `aria-current="true"` and focus, no other item carries `aria-current`, pin `7` alone carries the selected mark, and the prototype control beneath the pin does not run its handler

#### Scenario: Activating the selected pin again reveals its list item

- **WHEN** comment 7 is already selected, its list item has been scrolled out of view, and the participant clicks saved pin `7` again
- **THEN** that list item is scrolled into view again and receives focus

#### Scenario: Focusing a list item highlights its pin

- **WHEN** the participant hovers or focuses the list item for comment 2 while another comment is selected
- **THEN** pin `2` is marked highlighted, no other pin is, the selected pin keeps only its selected mark, and the highlighted mark is removed when the pointer or focus leaves the item

### Requirement: Single prompt formatter

The Visual UI Fix Request and the Tracking Instrumentation Request SHALL each be produced by one formatter implementation that both the meeting report and the visual comments panel execute. For the same comments, evidence, and page origin, the Markdown produced from the panel and from the report MUST be identical character for character. Moving the formatter MUST NOT change the Markdown produced by `Copy AI prompt` or by the report's `Copy tracking prompts` for any comment.

#### Scenario: Panel and report produce identical tracking prompts

- **WHEN** the same meeting data is formatted from the panel and from the report's batch control for the same scope
- **THEN** the two Markdown documents are equal character for character

#### Scenario: Existing prompt output is unchanged

- **WHEN** `Copy AI prompt` runs for a `visual-fix` comment and for a `tracking` comment after the formatter is shared
- **THEN** each copied document equals the document the previous addon version produced for the same comment and evidence

### Requirement: Panel tracking prompt handoff

When the active meeting holds at least one `tracking` comment, the expanded visual comments panel SHALL render a `Copy tracking prompts` action. Activating it SHALL collect the current Story's `tracking` comments whose status is Open, order them by meeting-wide ordinal ascending, and write one Tracking Instrumentation Request containing one `### Comment <ordinal>` subsection per collected comment through `navigator.clipboard.writeText`. When another Story of the active meeting also has an Open `tracking` comment, the panel SHALL additionally render a `Copy all stories` action that collects the Open `tracking` comments of every Story in the active meeting. When the active meeting holds no `tracking` comment, neither action SHALL render. Completed comments and `visual-fix` comments MUST NOT be included. The actions MUST NOT attach images, change any comment, or send a request to an AI service.

The comments overview SHALL expose `activeProjectRelativeSessionPath`, the active meeting's session directory relative to the project root with forward slashes, or `null` when that directory is outside the project root or no meeting is active. Each subsection's Evidence SHALL be the same fields the report emits for that comment.

The panel SHALL show exactly one of these messages in a polite live region after each activation:

- `Tracking prompt copied. Comments included: <N>.` after the clipboard write succeeds.
- `No open tracking comments to copy.` when the scope holds no Open `tracking` comment; no clipboard write SHALL occur.
- `Unable to copy AI prompt. Check browser clipboard permission.` when meeting data cannot be read or the clipboard write fails.

#### Scenario: Panel copies the current Story's open tracking comments

- **WHEN** the participant activates a panel copy action
- **THEN** the clipboard receives one Tracking Instrumentation Request whose subsections are exactly the Open `tracking` comments of that action's scope in ascending ordinal order

##### Example: five comments across two stories, viewing Story A

- **GIVEN** comment 1 `visual-fix` Open on Story A, comment 2 `tracking` Open on Story A, comment 3 `tracking` Completed on Story A, comment 4 `tracking` Open on Story B, and comment 5 `tracking` Open on Story A

| Action | Subsections in the copied prompt | Message |
| ------ | -------------------------------- | ------- |
| `Copy tracking prompts` | `### Comment 2`, `### Comment 5` | `Tracking prompt copied. Comments included: 2.` |
| `Copy all stories` | `### Comment 2`, `### Comment 4`, `### Comment 5` | `Tracking prompt copied. Comments included: 3.` |

#### Scenario: Copy all stories appears only when another Story has open tracking comments

- **WHEN** every Open `tracking` comment of the active meeting is on the current Story
- **THEN** the panel renders `Copy tracking prompts` and does not render `Copy all stories`

#### Scenario: Meeting without tracking comments has no copy action

- **WHEN** the active meeting holds only `visual-fix` comments
- **THEN** the panel renders neither `Copy tracking prompts` nor `Copy all stories`

#### Scenario: Nothing open to copy

- **WHEN** every `tracking` comment on the current Story is Completed and the participant activates `Copy tracking prompts`
- **THEN** no clipboard write occurs and the live region announces `No open tracking comments to copy.`

#### Scenario: Clipboard failure is reported

- **WHEN** `navigator.clipboard.writeText` rejects during a panel copy
- **THEN** the live region announces `Unable to copy AI prompt. Check browser clipboard permission.` and no mutation request is sent

#### Scenario: Session path outside the project is unavailable

- **WHEN** the configured comments directory resolves outside the project root
- **THEN** the overview returns `activeProjectRelativeSessionPath` `null` and the copied prompt contains `Project-relative screenshot path: unavailable` with no absolute host path

### Requirement: Report comment filters

A meeting report SHALL render one group with the accessible name `Filter comments` containing the toggle options `All`, `Visual fix`, and `Tracking`, each showing the count of the report's comments it matches, and one `Hide completed` toggle. `All` SHALL be selected and `Hide completed` SHALL be off by default. The report SHALL show only comment cards that match the selected kind and, while `Hide completed` is on, only Open comments. A capture with no visible comment card SHALL be hidden entirely, and a report with no visible card SHALL show one empty message.

The filter state SHALL be mirrored in the URL fragment as `kind=<all|visual-fix|tracking>` and `completed=<shown|hidden>` joined by `&`, and SHALL be restored from the fragment when the report loads. An unknown value SHALL be treated as the default. Filtering MUST NOT send a request and MUST NOT change which comments the `Copy tracking prompts` control collects.

#### Scenario: Filters narrow the visible cards

- **WHEN** the viewer selects a kind option or toggles `Hide completed`
- **THEN** only the matching comment cards remain visible, captures without a visible card are hidden, and the URL fragment records the selection

##### Example: comment 1 visual-fix Open, comment 2 tracking Open, comment 3 tracking Completed

| Kind | Hide completed | Visible cards | URL fragment |
| ---- | -------------- | ------------- | ------------ |
| `All` | off | 1, 2, 3 | `#kind=all&completed=shown` |
| `Tracking` | off | 2, 3 | `#kind=tracking&completed=shown` |
| `Tracking` | on | 2 | `#kind=tracking&completed=hidden` |
| `Visual fix` | on | 1 | `#kind=visual-fix&completed=hidden` |

#### Scenario: Fragment restores the filtered view

- **WHEN** a viewer opens the report URL ending in `#kind=tracking&completed=hidden`
- **THEN** `Tracking` is selected, `Hide completed` is on, and only Open `tracking` cards are visible

#### Scenario: Unknown fragment values fall back to defaults

- **WHEN** a viewer opens the report URL ending in `#kind=analytics&completed=maybe`
- **THEN** `All` is selected, `Hide completed` is off, and every card is visible

#### Scenario: Filtering does not change the batch copy

- **WHEN** the `Visual fix` filter is selected and the viewer activates `Copy tracking prompts` with scope `All stories`
- **THEN** the copied prompt still contains every Open `tracking` comment of the meeting

### Requirement: Report evidence layout

At a viewport width of 1024 CSS pixels or more, each capture in a meeting report SHALL render its screenshot and its comment cards side by side, with the screenshot on the inline-start side. Below 1024 CSS pixels the screenshot SHALL render above its comment cards. The report SHALL render one toolbar holding the meeting title, the capture and comment counts, the comment filters, and the tracking batch control when present; the toolbar SHALL stay visible while the page scrolls when the viewport is at least 600 CSS pixels tall, and the report MUST NOT scroll horizontally at a viewport width of 390 CSS pixels. Each capture heading SHALL render the Story title and name as plain text and SHALL render an `Open story` link only when the stored Story URL is a valid HTTP or HTTPS URL.

#### Scenario: Wide viewport shows screenshot and comments side by side

- **WHEN** a report with one capture and two comments is viewed at 1280 CSS pixels wide
- **THEN** the screenshot and the first comment card overlap vertically and the screenshot's inline-end edge is before the card's inline-start edge

#### Scenario: Narrow viewport stacks screenshot above comments

- **WHEN** the same report is viewed at 800 CSS pixels wide
- **THEN** the screenshot's bottom edge is above the first comment card's top edge

#### Scenario: Toolbar stays visible while scrolling

- **WHEN** the viewer scrolls a report taller than the viewport at 1280 × 860 CSS pixels
- **THEN** the toolbar with the filters and the tracking batch control remains inside the viewport

#### Scenario: Narrow viewport does not scroll sideways

- **WHEN** a report is viewed at 390 × 860 CSS pixels
- **THEN** the toolbar's left and right edges are inside the viewport and the document is no wider than the viewport

#### Scenario: Unsafe Story URL renders no link

- **WHEN** a capture's stored Story URL is `javascript:alert(1)`
- **THEN** the heading shows the Story title and name as text and no `Open story` link

### Requirement: Readable report timestamps

Every timestamp in a meeting report and in the report index SHALL be rendered inside a `time` element whose `datetime` attribute holds the stored ISO 8601 value and whose default text is that same value. When the report script runs, it SHALL replace the text with the viewer's local time formatted as `YYYY-MM-DD HH:mm` and SHALL place the ISO value in the element's `title`. When the script does not run, the ISO value SHALL remain visible.

#### Scenario: Script localizes the timestamp

- **WHEN** a report containing a comment created at `2026-10-01T05:36:43.790Z` is viewed in a browser whose time zone is UTC+8
- **THEN** the comment's `time` element shows `2026-10-01 13:36`, keeps `datetime="2026-10-01T05:36:43.790Z"`, and has that ISO value as its `title`

#### Scenario: Timestamp stays readable without the script

- **WHEN** the same report is rendered without executing its script
- **THEN** the `time` element shows `2026-10-01T05:36:43.790Z`

### Requirement: Report visual rules

The meeting report and the report index SHALL satisfy all of the following in both the light and the dark color scheme:

- Every rendered text has a computed font size of at least 12 CSS pixels.
- No element has a background color or border color whose alpha is greater than 0 and less than 1, except the scrim behind the delete confirmation.
- No element has a gradient background image or a backdrop filter.
- A capture card, a comment card, and a meeting card have no border and no outline as container decoration, and contain no nested container that has its own border other than a form field; a focus-visible outline is permitted.

Hierarchy between these surfaces SHALL be expressed with opaque surface colors or shadows. The snapshot canvas SHALL keep the `--sbfx-surface-raised` surface required by the Comment evidence preview surfaces requirement.

#### Scenario: Meeting report passes the style audit in both schemes

- **WHEN** a report with captures, comments of both kinds and states, the toolbar, and an open inline editor is rendered in the light scheme and in the dark scheme
- **THEN** every element satisfies the four rules in each scheme

##### Example: values the audit rejects

| Element | Computed style | Result |
| ------- | -------------- | ------ |
| capture card | `border: 1px solid rgb(52, 56, 74)` | rejected |
| kind label inside a comment card | `border: 1px solid rgb(75, 67, 201)` | rejected |
| comment draft field | `border: 1px solid rgb(52, 56, 74)` | accepted |
| capture card | `border: 0px`, `background-color: rgb(32, 34, 45)` | accepted |

#### Scenario: Report index passes the style audit

- **WHEN** the report index lists an active meeting and closed meetings in the light scheme and in the dark scheme
- **THEN** every element satisfies the four rules in each scheme
