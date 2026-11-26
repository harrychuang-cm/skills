## Purpose

Define the in-page experience of asking an AI agent to change the selected element: where the entry points are, what the person is shown before, during and after a run, and how they keep or revert the result. The dialog is deliberately thin — every decision about what the agent is allowed to do belongs to the agent-runs capability.

## ADDED Requirements

### Requirement: AI entry points

While the tool is active, an element is selected and agent runs are ready, the label of the selection outline and the inspector header SHALL each carry an AI control. Activating either control SHALL open the prompt dialog for the selected element. The control on the outline label SHALL only notify the inspector, carrying no text. When agent runs are not ready the outline label SHALL carry no AI control, and the inspector header's AI control SHALL be disabled with the reason as its tooltip.

#### Scenario: From the selection to the dialog

- **WHEN** a person selects a component and activates the AI control on its selection label
- **THEN** the prompt dialog opens beside the inspector and names that component

#### Scenario: Not ready is explained, not hidden

- **WHEN** agent runs are disabled for the project
- **THEN** no AI control appears on the outline label, and the inspector header's AI control is disabled and says AI editing is unavailable with the reason

### Requirement: Prompt dialog

The prompt dialog SHALL open beside the inspector, in the place where a row's popover opens, and SHALL replace an open row popover. It SHALL name the selected element and SHALL let the person expand and read the object reference that will be sent as context. When the selection changes the dialog SHALL follow it, and the typed text SHALL be kept per element. It SHALL show which runner will be used and a notice that each request takes time and has a cost on the person's own account. Enter SHALL submit, Shift+Enter SHALL insert a line break, and Escape SHALL close the dialog keeping the typed text for that element. Keys typed in the dialog SHALL NOT reach the story or Storybook's shortcuts. An empty request SHALL NOT be submittable.

#### Scenario: Closing keeps the draft

- **WHEN** a person types a request, presses Escape, and opens the dialog for the same element again
- **THEN** the typed text is still there

#### Scenario: Typing does not trigger shortcuts

- **WHEN** a person types the letter M in the dialog
- **THEN** Storybook's measure tool does not toggle and the story receives no key event

### Requirement: Confirmation prompt

After a request is submitted the dialog SHALL say that approval is needed outside the page and how to give it for the configured confirmation mode, and SHALL offer a code field only in the one-time-code mode. A denial or a timeout SHALL be shown as such, with the typed request still available to send again. When the project runs without confirmation, the dialog SHALL say so before the request is submitted.

#### Scenario: A declined request can be retried

- **WHEN** a person declines the confirmation
- **THEN** the dialog reports that the request was declined and still contains the request text

### Requirement: Progress and cancellation

From approval until a final state the dialog and the inspector's report area SHALL show the run's state, the runner name and the elapsed time, and SHALL offer to cancel. The same state SHALL be shown again after a browser reload, together with the request text, which the page keeps itself because the server never returns it. While a run is active, the controls that apply, undo or synchronize SHALL be disabled with the reason.

#### Scenario: Progress survives a reload

- **WHEN** the browser tab is reloaded while the agent is working
- **THEN** after the reload the inspector shows the run as running with its elapsed time, the request text and the cancel action

### Requirement: Result review

When a run ends as imported, the inspector's report area SHALL show the agent's own summary as plain text, the list of changed files with the number of changed lines in each, the checks that ran, and for the selected element which traced rows have a different computed value than before the run. It SHALL offer to revert the import, which uses the undo of the write-back capability; the reverse apply of the write-back capability SHALL NOT be offered for an import. When a run ends as rejected or failed, the report area SHALL show every reason, SHALL state that the project was not changed, and SHALL offer to copy the object reference as the manual fallback. Text produced by the agent SHALL never be rendered as markup.

#### Scenario: Reverting an imported result

- **WHEN** a person reverts an imported run
- **THEN** every file the run changed has its previous bytes and the page shows the element as before the run

#### Scenario: A rejected run says why and that nothing changed

- **WHEN** a run is rejected because the agent created a file
- **THEN** the report area names the created file, states that the project was not changed, and offers to copy the object reference

### Requirement: Decision follow-up

When a run ends as needs-decision, the dialog SHALL show the agent's question as plain text and SHALL let the person answer it or dismiss it. Submitting an answer SHALL start a new request for the same element that carries the original request, the question and the answer, and SHALL go through confirmation like any request.

#### Scenario: Answering starts a confirmed new run

- **WHEN** a person answers the agent's question
- **THEN** a new run is created that awaits confirmation, and its request file contains the original request, the question and the answer

### Requirement: Dialog strings come from the message catalog

Every string of the entry points, the dialog, the progress display and the result review SHALL come from the tool's message catalog in both of its languages, with identical key sets.

#### Scenario: The dialog follows the interface language

- **WHEN** the interface language is English
- **THEN** the dialog, its notices and the result review are in English
