# Acceptance Criteria

## Storybook

- The default story renders the interactive `__FEATURE_TITLE__` prototype.
- `parameters.prototype.docs` exposes PRD, UI Spec, Flow Spec, Data Spec, Implementation Guide, and Acceptance.
- `parameters.prototype.flow.routes` contains every interactive route.
- `parameters.prototype.flow.nodes` contains every flow-only branch node.
- `parameters.prototype.flow.transitions` contains every user-triggered transition.
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

## Engineering

- Prototype-only CSS is scoped to `.__FEATURE_CSS_CLASS__`.
- Existing reusable components are used before local markup.
- Static Flow export reads saved layout from `../prototypeFlowLayout`.
- TypeScript passes in the target project.
