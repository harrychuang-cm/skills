# Acceptance Criteria

> These criteria accept the **Storybook prototype**, not the production delivery.
> Where a criterion names a surface that `PRODUCTION_HANDOFF.md` marks scope `A`, it
> checks that the prototype re-creates that existing surface faithfully enough to judge
> the new behavior against — it is not a request to build that surface in production.
> The build-or-not decision lives only in the Prototype To Frontend Map's `Scope` column.

## Storybook

- The default story renders the interactive `__FEATURE_TITLE__` prototype.
- `parameters.prototype.docs` exposes PRD, UI Spec, Flow Spec, Data Spec, Frontend Handoff, Implementation Guide, and Acceptance.
- `parameters.prototype.flow.routes` contains every interactive route.
- `parameters.prototype.flow.nodes` contains every flow-only branch node.
- `parameters.prototype.flow.transitions` contains every user-triggered transition.
- `parameters.prototype.components.routes` records each route's composing components with `origin` (`shared`, `local`, or `promoted`) and `storyId` links where resolvable.
- UI Flow iframe previews can render a specific route through `prototypeRoute`.
- The prototype route shell exposes `data-prototype-route-preview` for template-compatible preview measurement.
- The prototype root keeps `data-prototype-root` for backward-compatible preview measurement.
- `parameters.prototype.figmaExport.flowStoryId` points to the `StaticFlow` story.
- The `StaticFlow` story renders route cards, flow-only nodes, and key transitions from the same metadata as UI Flow.

## Interaction

- Initial route is `__ENTRY_ROUTE_ID__`.
- [Every documented trigger changes route, updates local state, or is explicitly out of scope.]

## Data

- Fixtures are local and deterministic.
- API replacement points are documented.

## Frontend Handoff

- `PRODUCTION_HANDOFF.md` maps prototype routes to web routes, app screens, shared components, or open decisions.
- Storybook-only boundaries are listed and are not described as production runtime requirements.
- API/data contract expectations are documented for each fixture group without requiring real data wiring.
- Integration ownership is explicit: real APIs, data sources, auth, cache, storage, persistence, and final production tests belong to the receiving implementation.
- Frontend handoff acceptance criteria are separate from Storybook acceptance criteria and final production integration acceptance.
- Web and app implementation notes are either filled in or explicitly marked `Not in scope`.

## Engineering

- Prototype-only CSS is scoped to `.__FEATURE_CSS_CLASS__`.
- Existing reusable components are used before local markup.
- Every route's composition is recorded in `meta.components` and origin-marked against the UI Spec Component Map and Component Gaps.
- Static Flow export reads saved layout from `../prototypeFlowLayout`.
- TypeScript passes in the target project.
