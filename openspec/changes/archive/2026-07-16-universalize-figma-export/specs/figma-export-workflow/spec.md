## ADDED Requirements

### Requirement: Renderer-agnostic preview decorator

The addon's preview decorator SHALL be a pass-through: it returns the story function's return value unchanged (strict identity, no wrapping element, no cloning) and performs only overlay side effects. The preview entry module and the overlay module MUST NOT import react or @storybook/icons, so the addon preview bundle builds in React, Vue, Svelte, Angular, and Web Components Storybooks alike.

#### Scenario: story output is untouched

- **WHEN** the decorator wraps a story in any renderer
- **THEN** the decorator's return value is strictly equal to the story function's return value

#### Scenario: preview bundle has no react imports

- **WHEN** the addon is built
- **THEN** the preview and overlay build outputs contain no import of react or @storybook/icons

### Requirement: Body-mounted export overlay

The export overlay SHALL be a plain-DOM aside element with class sbfx-exporter mounted on document.body, offering the Copy JSON, Plugin Console Script, and Copy design to Figma actions with a data-status attribute cycling idle, copying, copied, and error. The overlay SHALL be present only while the export global is "on" and the view mode is "story"; otherwise the aside MUST be absent from the DOM.

#### Scenario: overlay mounts when enabled

- **WHEN** the decorator runs with the export global set to "on" in story view mode
- **THEN** document.body contains one aside.sbfx-exporter with the three action buttons

#### Scenario: overlay unmounts when disabled

- **WHEN** the decorator runs with the export global set to "off"
- **THEN** no aside.sbfx-exporter exists in the DOM

### Requirement: Export scope resolution

The overlay SHALL resolve the export scope as the element with id storybook-root; when that element does not exist it SHALL fall back to document.body and surface a warning in the overlay status text. The overlay itself MUST NOT be part of the exported tree.

#### Scenario: standard preview root

- **WHEN** the Copy JSON action runs on a page with a storybook-root element
- **THEN** the payload root comes from inside that element and no sbfx-exporter node appears in the payload

### Requirement: Payload auto-sync on export

When the payloadSyncUrl option is configured, the overlay SHALL POST the generated payload to that URL after every successful export action, fire-and-forget: a failed sync MUST NOT break the clipboard flow and SHALL surface a sync-failed note in the status text. When the option is absent, no network request is made.

#### Scenario: successful sync

- **WHEN** Copy JSON succeeds with payloadSyncUrl configured and the endpoint reachable
- **THEN** the endpoint receives one POST whose body is the payload JSON with the matching storyId

#### Scenario: sync failure does not break copying

- **WHEN** Copy JSON succeeds but the payloadSyncUrl endpoint is unreachable
- **THEN** the clipboard still receives the payload JSON and the status text notes the failed sync

### Requirement: Payload store endpoints

The review-server middleware SHALL expose payload store endpoints: POST /__figma-export/payloads persists a valid payload JSON body under its sanitized storyId (lowercase letters, digits, and hyphens only) and answers 201; GET /__figma-export/payloads answers a JSON array of summaries carrying storyId, storyName, componentTitle, and generatedAt; GET /__figma-export/payloads/<storyId> answers the stored payload or 404. Invalid bodies or storyIds that sanitize to empty MUST answer 400. Every endpoint SHALL include Access-Control-Allow-Origin: * and answer OPTIONS preflight with 204.

#### Scenario: store round trip

- **WHEN** a payload with storyId "components-button--primary" is POSTed and the list is fetched
- **THEN** the list contains that storyId and GET of the single entry returns the identical payload JSON

#### Scenario: path traversal is rejected

- **WHEN** a payload whose storyId is "../escape" is POSTed
- **THEN** the server answers 400 and writes no file outside the payload directory

##### Example: storyId sanitize

| input storyId | sanitized | result |
| ------------- | --------- | ------ |
| components-button--primary | components-button--primary | 201 stored |
| ../../etc/passwd | etcpasswd | 201 stored under sanitized name |
| ../.. | (empty) | 400 rejected |
