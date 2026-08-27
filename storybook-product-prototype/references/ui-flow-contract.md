# UI Flow Contract

Use this reference when creating `FLOW_SPEC.md` and `<featurePrototypeFlow>.ts`.

## Route Metadata

Each route should define:

- `id`: stable route id used by React state and flow diagrams.
- `title`: review label.
- `navigationId`: shell navigation context when applicable.
- `component`: free-form display summary of the primary component or composed surface. Display text only — the structured per-route composition lives in `meta.components` (contract in `references/storybook-integration.md`); do not duplicate it here.
- `description`: behavior the route proves.
- `flowGroup`: optional grouping label.
- `flowPosition`: optional stable `{ x, y }` coordinate.
- `params`: optional array of `{ name, type }` route parameters production navigation needs (URL params on web, destination arguments on iOS/Android). Declare them here so codegen and the receiving implementation never re-derive them from fixtures.
- `deepLink`: optional direct-entry pattern for the route (for example `/alerts/:alertId` or `app://alerts/:alertId`). Declare it when the route is a deep-link target.

## Flow-Only Nodes

Use flow-only nodes for branch logic that is not a full product screen:

- API success/failure decisions.
- Async loading or queued states.
- Permission decisions.
- Validation outcomes.
- Background status nodes.

Flow-only nodes should define:

- `id`
- `title`
- `description`
- `shape`: usually `decision` or `state`.
- `tone`: optional `success`, `error`, `warning`, or project-specific tone.
- `flowPosition`: optional stable coordinate.

## Transitions

Every user-triggered route change must define:

- `from`: source route or flow-node id.
- `to`: target route or flow-node id.
- `trigger`: stable event or branch condition name.
- `label`: human-readable edge label.
- `kind`: optional semantic category such as `primary`, `return`, `global`, `secondary`, `outcome`, or `condition`.
- `presentation`: optional presentation semantics for the target surface — `push` (stack navigation / page change), `modal` (blocking overlay), `sheet` (partial overlay), `fullscreen` (full-screen cover), or `replace` (swap without history). This is what lets iOS map the edge to NavigationStack vs sheet and Android to NavHost vs dialog; web benefits too (modal vs page). Required at handoff time for non-`return` transitions when an app target is in scope (`validate_prototype.py --handoff-ready` warns, `--strict-style` fails).
- `backBehavior`: optional exit semantics — `pop` (one step back), `popToRoot` (back to the flow's root), `dismiss` (close the overlay), or `none` (no user-initiated back). Declare it whenever leaving the surface is not a plain `pop`.
- `flowLine`: optional display hint. Use `key` only for transitions drawn on the simplified canvas.
- `sourceAnchor`: optional `{ x, y }` route-card-relative ratio used only when Static Flow export needs a stable edge origin for Figma-ready layout. Use sparingly and keep values between `0` and `1`.

## Trigger Naming

Use stable, implementation-facing names:

- `quoteRow.click`
- `submitButton.click`
- `orderSubmit.success`
- `orderSubmit.error`
- `bottomNavigation.watchlist`
- `topAction.search`
- `settingsSheet.dismiss`

Do not use rendered labels as route logic.

## Control Mapping

Create mapping objects before wiring handlers:

- bottom navigation id to route id
- top action id to route id
- tab or segmented control id to route id
- menu action id to route id
- sheet action id to route id

## Production Mapping

When preparing frontend handoff, map route ids and transitions to the target platform:

- web routes, nested layouts, modals, sheets, or query params
- app screens, tabs, navigation stack entries, sheets, or deep links
- shared component states when no route or screen boundary exists
- service, permission, or async branch nodes that production must implement

Keep route ids stable across prototype docs and handoff docs so engineers and AI agents can trace behavior without relying on visible labels.

## Acceptance

- Every visible route appears in route metadata.
- Every documented click appears in transition metadata.
- Every transition target exists as a route or flow-only node.
- UI Flow canvas uses key transitions; Transition Index uses the full transition list.
- The prototype supports `prototypeRoute=<route-id>` for route-specific iframe previews.
- The prototype supports `prototypeFlowPreview=true` for compact embedded rendering.
- The route preview shell exposes `data-prototype-route-preview="true"` for template-compatible iframe measurement.
- The prototype root keeps `data-prototype-root="true"` for backward-compatible iframe height measurement.
- Static Flow export reads saved layout from `prototypeFlowLayout.ts` using the same storage key as the Prototype Inspector.
- Production handoff maps every route and branch node that must become a web/app surface, service decision, API/data contract expectation, or shared state.
