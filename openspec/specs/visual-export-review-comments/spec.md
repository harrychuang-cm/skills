# visual-export-review-comments Specification

## Purpose

TBD - created by archiving change 'add-local-export-review-comments'. Update Purpose after archive.

## Requirements

### Requirement: Shared meeting session lifecycle

The visual review panel SHALL expose Start meeting and End meeting controls and the server SHALL maintain at most one active meeting per configured comments store. Every browser connected to the same Storybook host SHALL resolve the same active meeting. A closed meeting MUST retain its captures, comments, and reports and MUST reject new comments.

#### Scenario: First participant starts a meeting

- **WHEN** no active meeting exists and a participant starts "Weekly design review"
- **THEN** the server creates one meeting with a server-generated ID and startedAt timestamp, marks it active, and returns HTTP 201

#### Scenario: Another participant joins the active meeting

- **WHEN** a second browser opens the same Storybook host while a meeting is active
- **THEN** the panel displays the same meeting ID, title, current comments, and report URL without creating another meeting

#### Scenario: Concurrent start resolves to one meeting

- **WHEN** two browsers submit Start meeting while no meeting is active
- **THEN** one request creates the meeting and the other receives HTTP 409 with the active meeting in the response

#### Scenario: Participant ends a meeting

- **WHEN** a participant ends the active meeting
- **THEN** the server sets closedAt, clears the active meeting pointer, regenerates reports, and keeps the closed meeting readable

#### Scenario: Closed meeting rejects a comment

- **WHEN** a client posts a comment to a meeting whose closedAt is set
- **THEN** the server returns HTTP 409 and does not modify the meeting or its assets


<!-- @trace
source: add-local-export-review-comments
updated: 2026-07-20
code:
  - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/.storybook/project.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/.storybook/main.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/preview.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.css
  - design-system-to-storybook/scripts/generate_figma_export_config.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/README.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.css
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
  - design-system-to-storybook/scripts/test_generate_figma_export_config.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
-->

---
### Requirement: Point-based pre-action UI capture

The panel SHALL provide an Add visual comment mode only in Story view while an active meeting exists. The preview SHALL intercept the next pointer sequence within the resolved capture target during capture phase, prevent the underlying prototype action, freeze the target bounds and pointer position, hide elements marked data-sbfx-capture-ignore, wait two animation frames, and capture the pre-action UI state before opening the comment composer.

The capture target SHALL resolve from the configured captureSelector, then #storybook-root, then document.body. A configured selector that resolves no element, a target with zero bounds, or an encoding failure MUST produce a visible retryable error and MUST NOT open the composer or call the comment API.

#### Scenario: Commenting on an interactive control preserves its state

- **WHEN** a prototype is in state B and the participant enters comment mode and clicks a button that normally transitions to state C
- **THEN** the button handler does not run and the captured image represents state B

#### Scenario: Addon chrome is excluded

- **WHEN** the Export review panel, export overlay, capture instruction, composer, and transient pin layer carry data-sbfx-capture-ignore
- **THEN** none of those elements appear in the captured image

#### Scenario: Project captures a body portal

- **WHEN** captureSelector is configured as "body" and a modal is rendered through a body portal
- **THEN** the image includes the modal while excluding every element marked data-sbfx-capture-ignore

#### Scenario: Invalid capture target fails safely

- **WHEN** captureSelector matches no element or the resolved target has zero width or height
- **THEN** the panel exits comment mode, reports the capture error, and sends no create-comment request

#### Scenario: Participant cancels capture mode

- **WHEN** the participant presses Escape or activates Cancel before capture completes
- **THEN** the panel removes its pointer interception and creates no capture, asset, or comment

#### Scenario: Docs view does not offer capture

- **WHEN** the current Storybook context has viewMode "docs"
- **THEN** Add visual comment is disabled and no capture listener is installed


<!-- @trace
source: add-local-export-review-comments
updated: 2026-07-20
code:
  - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/.storybook/project.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/.storybook/main.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/preview.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.css
  - design-system-to-storybook/scripts/generate_figma_export_config.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/README.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.css
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
  - design-system-to-storybook/scripts/test_generate_figma_export_config.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
-->

---
### Requirement: Immutable snapshot evidence and metadata

Each submitted visual comment SHALL reference an immutable browser-captured image. The client SHALL encode image/webp, with image/png accepted as a compatibility fallback, and SHALL reduce the output to at most 2048 pixels on the longest side, 4 megapixels, and 2 MiB before submission.

Each capture SHALL retain story ID, story title, story name, optional HTTP or HTTPS story URL, viewport width and height, device pixel ratio, scroll position, image pixel dimensions, capture CSS dimensions, and available prototype metadata from data-prototype-root, data-route, and data-prototype-state. The screenshot SHALL remain the canonical evidence of the rendered state; route or state metadata MUST NOT be treated as a replayable serialization.

#### Scenario: In-memory modal state survives as evidence

- **WHEN** a participant opens a modal stored only in component-local state and creates a visual comment
- **THEN** the stored snapshot shows the open modal even if reopening the story URL later renders the modal closed

#### Scenario: Unsupported content prevents submission

- **WHEN** the capture backend cannot encode the target because of unsupported or cross-origin content
- **THEN** the panel displays a capture error and does not submit an empty or partial image

#### Scenario: Historical evidence remains bound to its snapshot

- **WHEN** the live story changes to another state after a comment is created
- **THEN** the historical pin is rendered on its frozen report snapshot and is not automatically overlaid on the changed live story


<!-- @trace
source: add-local-export-review-comments
updated: 2026-07-20
code:
  - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/.storybook/project.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/.storybook/main.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/preview.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.css
  - design-system-to-storybook/scripts/generate_figma_export_config.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/README.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.css
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
  - design-system-to-storybook/scripts/test_generate_figma_export_config.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
-->

---
### Requirement: Normalized point anchors

The client SHALL calculate pin xRatio and yRatio from the frozen capture bounds and SHALL clamp each finite value to the inclusive range 0 through 1. The server SHALL reject non-finite values and SHALL clamp finite out-of-range values to the same range. Reports SHALL position pins using percentage coordinates in a container with the captured image aspect ratio.

#### Scenario: Pin remains aligned after report resize

- **WHEN** a comment stored at xRatio 0.43 and yRatio 0.61 is rendered at any responsive image width
- **THEN** its pin remains at 43 percent from the left and 61 percent from the top of the image

#### Scenario: Finite coordinate is clamped

- **WHEN** a request contains xRatio 1.2 and yRatio -0.1
- **THEN** the stored pin contains xRatio 1 and yRatio 0

#### Scenario: Non-finite coordinate is rejected

- **WHEN** a request supplies a pin value that does not parse to a finite number
- **THEN** the server returns HTTP 400 and writes no capture, asset, or comment


<!-- @trace
source: add-local-export-review-comments
updated: 2026-07-20
code:
  - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/.storybook/project.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/.storybook/main.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/preview.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.css
  - design-system-to-storybook/scripts/generate_figma_export_config.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/README.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.css
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
  - design-system-to-storybook/scripts/test_generate_figma_export_config.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
-->

---
### Requirement: Append-only visual comment records

A create-comment request SHALL contain a clientRequestId, authorName, body, story metadata, viewport metadata, capture metadata and data URL, and normalized pin. The server SHALL generate comment and capture IDs plus createdAt and asset metadata. Comments SHALL be append-only in this capability; the API MUST NOT expose edit or delete operations.

The panel SHALL store the participant's display name in browser localStorage under the configured authorStorageKey. An empty trimmed authorName SHALL persist as "Anonymous". A canonical-save failure SHALL leave the in-memory composer draft and capture available for retry until the participant cancels or navigates away.

#### Scenario: Comment is attributed without authentication

- **WHEN** a browser stores the display name "Mina" and submits a comment
- **THEN** meeting.json records authorName "Mina" on the server-generated comment without creating an account or credential

#### Scenario: Empty author uses the anonymous label

- **WHEN** authorName contains only whitespace
- **THEN** the server stores authorName "Anonymous"

#### Scenario: Save failure preserves the draft

- **WHEN** capture succeeds but the canonical save returns HTTP 500
- **THEN** the panel retains the body, pin, and captured image and offers retry without recapturing


<!-- @trace
source: add-local-export-review-comments
updated: 2026-07-20
code:
  - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/.storybook/project.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/.storybook/main.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/preview.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.css
  - design-system-to-storybook/scripts/generate_figma_export_config.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/README.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.css
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
  - design-system-to-storybook/scripts/test_generate_figma_export_config.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
-->

---
### Requirement: Same-origin local API and browser synchronization

The comments API SHALL default to /__figma_export_review_comments and SHALL provide GET state, POST sessions, GET session detail, POST session comments, POST session close, and GET report routes described by the design contract. Comment API responses MUST NOT include Access-Control-Allow-Origin: *. The panel SHALL refresh immediately on mount, story change, and successful local mutation and SHALL poll every 5 seconds while a meeting is active.

#### Scenario: Remote browser receives another participant's comment

- **WHEN** one browser creates a comment during an active meeting
- **THEN** another browser connected to the same host displays that comment no later than its next 5-second poll

#### Scenario: Comment API remains same-origin

- **WHEN** a browser calls the comments endpoint from the Storybook preview
- **THEN** the request uses the current Storybook origin and the response does not advertise wildcard CORS

#### Scenario: Host process is offline

- **WHEN** the Storybook host process is stopped
- **THEN** browsers cannot mutate or poll comments while the JSON, images, and generated reports remain on the host filesystem


<!-- @trace
source: add-local-export-review-comments
updated: 2026-07-20
code:
  - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/.storybook/project.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/.storybook/main.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/preview.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.css
  - design-system-to-storybook/scripts/generate_figma_export_config.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/README.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.css
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
  - design-system-to-storybook/scripts/test_generate_figma_export_config.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
-->

---
### Requirement: Canonical persistent meeting storage

The server SHALL persist visual reviews under the configured commentsDir, defaulting to design-system/figma-export-review/. The root SHALL contain state.json, index.html, and sessions/<server-generated-session-id>/. Each session directory SHALL contain meeting.json, index.html, and assets/<sha256>.<validated-extension>.

meeting.json SHALL be the canonical source of truth and SHALL contain version 1, session metadata, capture records, and comment records. Binary image bytes SHALL be stored separately, data URLs or base64 MUST NOT remain in JSON or HTML, and asset filenames and filesystem paths MUST be generated by the server. Equal image bytes SHALL resolve to the same SHA-256 asset without losing distinct capture records.

#### Scenario: Storybook restart preserves the meeting

- **WHEN** the Storybook process is stopped and restarted with the same commentsDir
- **THEN** the active pointer, meetings, captures, comments, assets, and report routes resolve from the persisted files

#### Scenario: Session folder is portable

- **WHEN** a session directory is copied or zipped with its index.html, meeting.json, and assets directory
- **THEN** its HTML uses relative asset references and renders the captured images without the original Storybook process

#### Scenario: Duplicate image bytes reuse an asset

- **WHEN** two submitted captures contain identical validated image bytes
- **THEN** both capture records reference one SHA-256-named asset and neither comment is lost

#### Scenario: Existing review notes remain unchanged

- **WHEN** visual comments are enabled in a project that already has figma-export-review-status.json
- **THEN** the visual comment store neither migrates nor removes existing status, Figma source, or notes fields


<!-- @trace
source: add-local-export-review-comments
updated: 2026-07-20
code:
  - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/.storybook/project.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/.storybook/main.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/preview.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.css
  - design-system-to-storybook/scripts/generate_figma_export_config.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/README.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.css
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
  - design-system-to-storybook/scripts/test_generate_figma_export_config.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
-->

---
### Requirement: Serialized atomic and idempotent mutations

The server SHALL serialize all mutations for one comments store through a server-side queue. JSON and HTML files MUST be written to server-generated temporary files in the destination directory and committed with atomic rename. Assets MUST use hash-derived names and exclusive creation.

Every create-comment request SHALL include a 1 to 64 character clientRequestId unique within its session. Replaying the same clientRequestId with identical canonical content SHALL return the existing comment with HTTP 200 and MUST NOT append a duplicate. Reusing the ID with different content SHALL return HTTP 409 and MUST NOT modify the meeting.

#### Scenario: Parallel comments are both retained

- **WHEN** two browsers post different valid comments to the same session concurrently
- **THEN** both comments and both capture records exist after both responses complete

#### Scenario: Network retry is idempotent

- **WHEN** a client repeats an identical successful request with the same clientRequestId
- **THEN** the response identifies the original comment and meeting.json contains one matching comment

#### Scenario: Request ID collision is rejected

- **WHEN** a client reuses an existing clientRequestId with a different body, pin, or capture
- **THEN** the server returns HTTP 409 and leaves canonical storage unchanged

#### Scenario: Incomplete temporary file is not canonical

- **WHEN** a process interruption leaves a temporary JSON or HTML file before rename
- **THEN** the next read uses the last fully renamed canonical file and ignores the temporary file


<!-- @trace
source: add-local-export-review-comments
updated: 2026-07-20
code:
  - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/.storybook/project.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/.storybook/main.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/preview.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.css
  - design-system-to-storybook/scripts/generate_figma_export_config.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/README.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.css
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
  - design-system-to-storybook/scripts/test_generate_figma_export_config.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
-->

---
### Requirement: Bounded and validated inputs

The server SHALL stop reading a request after 4 MiB and return HTTP 413. It SHALL enforce a 120-character session title, 80-character author name, 2,000-character comment body, 2 MiB decoded image, 2048-pixel longest side, 4-megapixel image, and 100 MiB total asset budget per session.

The server SHALL accept only image/webp or image/png whose data URL, declared MIME, magic bytes, decoded dimensions, and supplied dimensions agree. Invalid JSON, IDs, text, metadata, image content, or paths SHALL return HTTP 400. Limit or validation failures MUST NOT change canonical JSON and MUST NOT leave an unreferenced asset.

#### Scenario: Oversized request is rejected before mutation

- **WHEN** the streamed request body exceeds 4 MiB
- **THEN** the server returns HTTP 413 without parsing the remaining body or changing session files

#### Scenario: Forged MIME is rejected

- **WHEN** capture.mimeType is image/webp but the decoded bytes do not have valid WebP magic bytes and dimensions
- **THEN** the server returns HTTP 400 and stores no asset

#### Scenario: Image dimensions exceed the limit

- **WHEN** a valid image is wider than 2048 pixels or exceeds 4 megapixels
- **THEN** the server returns HTTP 413 and leaves the meeting unchanged

#### Scenario: Session asset budget is exhausted

- **WHEN** a new unique image would raise the session asset total above 100 MiB
- **THEN** the server returns HTTP 413 and does not create the asset, capture, or comment

#### Scenario: User text cannot control paths

- **WHEN** a title, author, story ID, or comment contains path separators or traversal text
- **THEN** all filesystem paths still use only server-generated session IDs, capture IDs, and image hashes


<!-- @trace
source: add-local-export-review-comments
updated: 2026-07-20
code:
  - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/.storybook/project.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/.storybook/main.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/preview.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.css
  - design-system-to-storybook/scripts/generate_figma_export_config.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/README.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.css
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
  - design-system-to-storybook/scripts/test_generate_figma_export_config.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
-->

---
### Requirement: Static root and meeting reports

The server SHALL regenerate the root index and affected meeting report after session creation, successful comment creation, and session close. The root index SHALL list meetings and their status. A meeting report SHALL group content by story and capture in chronological order, render the clean image, overlay numbered pins with percentage positioning, and render matching plain-text author, server time, and comment cards outside the bitmap.

A report generation failure after a canonical mutation MUST NOT roll back the session or comment. The API SHALL return reportStale true, and the next successful mutation SHALL attempt to regenerate both reports from canonical JSON.

#### Scenario: Report shows a pinned comment

- **WHEN** a valid comment is stored for a capture
- **THEN** the meeting report shows the clean image, one numbered pin at its normalized position, and a matching numbered comment card

#### Scenario: Report generation fails after comment save

- **WHEN** meeting.json and its asset are committed but HTML generation throws an error
- **THEN** the comment response remains successful with reportStale true and the canonical comment remains readable through the API

#### Scenario: Later mutation repairs a stale report

- **WHEN** a later valid mutation occurs after a reportStale response and report generation succeeds
- **THEN** root and meeting HTML include every canonical comment, including the comment saved before the failure


<!-- @trace
source: add-local-export-review-comments
updated: 2026-07-20
code:
  - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/.storybook/project.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/.storybook/main.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/preview.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.css
  - design-system-to-storybook/scripts/generate_figma_export_config.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/README.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.css
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
  - design-system-to-storybook/scripts/test_generate_figma_export_config.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
-->

---
### Requirement: Plain-text and content-safe reports

Session titles, author names, comment bodies, story metadata, and attributes SHALL be treated as plain text and escaped for their HTML context. The generator MUST NOT insert user-controlled raw HTML, event handlers, style content, filenames, or paths. Clickable story or source links SHALL accept only http: and https: protocols.

Every generated report SHALL include a Content Security Policy equivalent to: default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'.

#### Scenario: Script payload renders as text

- **WHEN** a title, author, or comment contains "</style><script>alert(1)</script><img onerror=alert(2)>"
- **THEN** the report displays the characters as text and creates no script, style escape, image element, or event handler from that input

#### Scenario: Unsafe link protocol is omitted

- **WHEN** story metadata contains a javascript:, data:, file:, or malformed URL
- **THEN** the report renders non-clickable text instead of an anchor for that URL

#### Scenario: Report declares restrictive CSP

- **WHEN** a root or meeting report is generated
- **THEN** its document head contains the required default-src, img-src, style-src, base-uri, and form-action directives


<!-- @trace
source: add-local-export-review-comments
updated: 2026-07-20
code:
  - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/.storybook/project.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/.storybook/main.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/preview.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.css
  - design-system-to-storybook/scripts/generate_figma_export_config.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/README.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.css
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
  - design-system-to-storybook/scripts/test_generate_figma_export_config.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
-->

---
### Requirement: Additive addon configuration and distribution integrity

FigmaExportReviewOptions SHALL expose visualComments.enabled, visualComments.apiPath, visualComments.captureSelector, and visualComments.authorStorageKey. FigmaReviewStatusPluginOptions SHALL expose commentsEnabled, commentsApiPath, and commentsDir. The config generator and React Storybook template SHALL emit and wire the same defaults while preserving project-local overrides.

Visual comments SHALL load only from the React-only review entry and only in Story view. The renderer-agnostic preview decorator and export overlay MUST NOT import React or the DOM-to-image dependency. Shipping the capability SHALL bump the canonical addon minor version, rebuild dist, and synchronize source, dist, and package metadata into both Storybook template vendor mirrors.

#### Scenario: Existing export workflow remains compatible

- **WHEN** a project uses the renderer-agnostic preview decorator without the React review entry
- **THEN** the visual comment runtime is not loaded and existing Figma export behavior is unchanged

#### Scenario: Generated config enables local comments

- **WHEN** generate_figma_export_config.mjs creates a new project config
- **THEN** the output contains enabled visual comments, the default comments API path, the default comments directory, and an overridable capture selector

#### Scenario: Bundled copies have no drift

- **WHEN** the addon release build and template synchronization complete
- **THEN** the canonical package and both template mirrors contain matching visual comment source, built review artifacts, version, and runtime dependency metadata

<!-- @trace
source: add-local-export-review-comments
updated: 2026-07-20
code:
  - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review-server.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/.storybook/project.config.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/.storybook/main.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-CktpX_T5.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/tsup.config.ts
  - design-system-to-storybook/storybook-template/.storybook/preview.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.css
  - design-system-to-storybook/scripts/generate_figma_export_config.mjs
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualComment.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/README.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/options.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/tsup.config.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.css
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BxmVHgJe.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js
  - design-system-to-storybook/assets/figma-export-addon/dist/manager.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Bj3uxPVS.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/manager.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture.html
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
  - design-system-to-storybook/scripts/test_generate_figma_export_config.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
-->