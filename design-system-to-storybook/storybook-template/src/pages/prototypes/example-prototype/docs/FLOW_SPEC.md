# Flow Spec

## Source Of Truth

`examplePrototypeFlow.ts` owns route ids, flow-only nodes, and transitions. UI labels are not used as the flow source of truth.

## Routes

- `intake`: default entry route for a project request draft.
- `review`: reviewer checks scope, requirements, and risks.
- `handoff`: approved request is ready for implementation.

## Flow Nodes

- `approval-decision`: decision node that represents approval logic without becoming a rendered product route.

## Key Transitions

- `intake` to `review` through `intakeForm.submit`.
- `review` to `approval-decision` through `reviewPanel.requestApproval`.
- `approval-decision` to `handoff` through `approvalDecision.approved`.

## Reference Transitions

- `approval-decision` to `review` through `approvalDecision.needsChanges`.
- `review` to `intake` through `reviewPanel.editIntake`.
- `handoff` to `intake` through `handoff.startNew`.

## Journeys

`examplePrototypeJourneys` mirrors the PRD Core Journeys, one journey per `### Journey N` heading:

- `approve-request` (Journey 1: Approve a request): `intake`, `review`, `approval-decision`, `handoff`.
- `request-changes` (Journey 2: Request changes): `intake`, `review`, `approval-decision`, `review`. The repeated `review` step shows the return to review.

When a Core Journey changes in the PRD, update its journey in the same edit. UI Flow lists the journeys; selecting one shows only its steps in one line.

## UI Flow Rules

On the full UI Flow canvas, only transitions with `flowLine: "key"` are drawn as canvas edges; reference transitions remain in metadata and Data mode for reviewers. A journey view draws the transitions between consecutive steps whatever their `flowLine`, so `request-changes` shows the reference transition "Needs changes".

UI Flow route cards and Static Flow route cards use the same route UI size contract. The marked `data-prototype-route-preview="true"` surface defines the route preview width and height; headers, borders, and labels are flow chrome outside that UI boundary.

Static Flow reads saved positions from `prototype-inspector:flow-layout:example-prototype` before falling back to `flowPosition` metadata. When another Storybook tab updates that layout through UI Flow dragging, Static Flow refreshes from storage so the export surface matches the reviewed canvas positions.

Static Flow is the static export counterpart of UI Flow. It keeps the UI Flow geometry, meaning the same saved positions and the same frame box sizes, so Figma review exports place every route and node where reviewers left them on the canvas. Canvas background, frame chrome, edge routing and label styling are not required to match.
