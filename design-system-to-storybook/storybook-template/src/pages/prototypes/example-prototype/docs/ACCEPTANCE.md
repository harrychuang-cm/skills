# Acceptance

## Storybook

- `Pages/Prototypes/Example Prototype/Default` renders the interactive story.
- `Pages/Prototypes/Example Prototype/Static Flow` renders a static export surface.
- Static Flow route cards render the same `ExamplePrototype` route UI used by UI Flow iframe previews.
- `parameters.prototype` exposes `components.routes[]` entries for every route with origin markers and highlight selectors.

## Docs

- Docs mode shows PRD, UI Spec, Flow Spec, Data Spec, Implementation Guide, and Acceptance.

## Components

- Components mode lists the `intake`, `review`, and `handoff` compositions with origin badges and a live route preview.
- Hovering a component card highlights its rendered instances in the preview; hovering the preview emphasizes the matching card.

## UI Flow

- UI Flow renders three route cards and one decision node.
- On the full canvas (全部), UI Flow draws only the three key transitions.
- The journey list shows 全部, Approve a request (4 步) and Request changes (4 步), with no 自動分支 section.
- Selecting Request changes shows Project Intake, Review Request, Ready for handoff? and a second Review Request in one row, with the edge label 條件 Needs changes into the second Review Request; Reset Layout and Import Layout are disabled and the notice 簡化檢視：位置不會儲存 appears.
- Returning to 全部 shows the saved layout and camera unchanged.
- UI Flow route iframes auto-fit the marked route UI width and height.
- Static Flow keeps flow-only nodes as metadata cards, but route cards use real route UI.
- Static Flow route cards reserve the same route UI width and height as UI Flow previews.
- Static Flow applies saved UI Flow route and node positions before falling back to metadata positions.
- Static Flow keeps the UI Flow geometry: each route card and the decision node sit at the same offsets from each other as the frames in UI Flow.
- Layout export includes schema, version, prototypeId, exportedAt, and positions.
- Layout import applies matching positions and rejects non-matching layouts.

## Data

- Data mode shows overview, API contracts, data sources, schemas, route data requirements, state rules, fixtures, and raw payload.

## Interaction

- Submit intake navigates from `intake` to `review`.
- Request approval navigates from `review` to `handoff` while metadata shows the decision node.
- Edit and start another request return to `intake`.
