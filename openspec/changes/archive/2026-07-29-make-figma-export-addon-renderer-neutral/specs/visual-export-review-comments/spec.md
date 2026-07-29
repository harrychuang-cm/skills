## ADDED Requirements

### Requirement: Vue visual review and comment feature parity

Every visual review and visual comment requirement supported in React + Vite + Storybook 10 SHALL be supported in Vue 3 + Vite + Storybook 10 through the same addon options, channel events, same-origin HTTP API, meeting records, comment records, assets, and reports. The Vue implementation MUST NOT use a renderer-specific wrapper around the story output.

#### Scenario: Vue participant completes a meeting lifecycle

- **WHEN** a participant uses a Vue story to start a meeting, another browser joins it, and the meeting is ended
- **THEN** both browsers observe the same meeting ID, title, comments, active state, closed state, and report URLs as defined by the shared meeting lifecycle contract

#### Scenario: Vue participant completes a visual comment lifecycle

- **WHEN** a participant captures a point on a Vue story, submits a comment, edits it, and deletes it
- **THEN** capture evidence, normalized anchor, meeting-scoped pin number, persistent record, edit, deletion, and regenerated reports follow the same contracts as the React workflow

#### Scenario: Vue participant accesses historical evidence

- **WHEN** a participant opens a closed meeting from a Vue Storybook
- **THEN** the participant can discover its captures, comment evidence previews, lifecycle actions, portable AI fix context, and static reports with the same availability rules as React

#### Scenario: Vue comment failure is capability scoped

- **WHEN** the visual comment API or capture operation fails in a Vue Storybook
- **THEN** the UI exposes the same actionable comments capability error as React
- **THEN** core Figma export remains available when its own capability is healthy

### Requirement: Renderer-neutral visual capture surface

Visual comment capture SHALL resolve and capture rendered DOM independently of the Storybook renderer. The capture layer, pending composer, pins, and review workspace SHALL live outside the renderer story root, and normalized point anchors SHALL be calculated from the resolved capture target bounds.

#### Scenario: Vue component state is captured before its action

- **WHEN** a Vue component is in state B and the participant enters comment mode and activates a control that normally transitions to state C
- **THEN** the control action is prevented and the evidence records state B

#### Scenario: Vue portal content follows capture selector

- **WHEN** a Vue component renders portal content under `document.body` and `captureSelector` is `body`
- **THEN** the evidence includes the portal content and excludes every node marked `data-sbfx-capture-ignore`

#### Scenario: Vue rerender preserves normalized pin location

- **WHEN** a saved comment at normalized coordinates is displayed after the Vue story rerenders at a different viewport size
- **THEN** its pin resolves against the current capture target bounds using the existing normalized anchor contract

#### Scenario: Addon UI never becomes Vue story content

- **WHEN** review, composer, capture instructions, or pins are visible
- **THEN** none of those nodes is a descendant of the Vue story root
- **THEN** all capture-excluded addon nodes carry `data-sbfx-capture-ignore`

### Requirement: Cross-renderer review data interoperability

Meetings, comments, captures, reports, and AI fix context created from a supported renderer SHALL remain readable and actionable from another supported renderer connected to the same configured comments store. Renderer identity MUST NOT be required by the persistent schema or HTTP endpoints.

#### Scenario: React-created meeting opens in Vue

- **WHEN** a meeting and comments created from the React fixture are opened from the Vue fixture against the same comments store
- **THEN** the Vue workspace displays the same meeting metadata, comments, evidence, pins, and report links without migration

#### Scenario: Vue-created report opens after switching to React

- **WHEN** a Vue participant closes a meeting and a React participant opens its report
- **THEN** the static HTML and Markdown reports contain the same ordered comments, evidence links, lifecycle state, and AI context

#### Scenario: Existing store remains valid after addon upgrade

- **WHEN** a project upgrades from the React-bound review implementation to the renderer-neutral implementation
- **THEN** existing meeting JSON, comment JSON, assets, active meeting pointer, and reports remain readable without schema conversion
