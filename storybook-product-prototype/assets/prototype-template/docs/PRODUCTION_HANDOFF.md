# Production Handoff

## Review Status

- Status: `pending` [Set to `confirmed` only after the team reviews the Storybook demo and confirms the product direction.]
- Confirmed by: [Reviewer or team, once confirmed.]
- Confirmed on: [Date, once confirmed.]
- Reviewed demo: [Storybook story id or UI Flow the team reviewed.]
- Confirmed scope: [What the confirmation covers or explicitly excludes.]

## Target Surfaces

- Web: [Route, page, embedded widget, or `Not in scope`.]
- App: [Native screen, tab, sheet, webview, or `Not in scope`.]
- Shared package: [Reusable component or domain module, if any.]
- Release scope: [Feature flag, rollout, or environment assumptions.]

## Scope Classification

Every row of the map below carries one of these. The receiving implementation
reads this column to decide what to build; nothing outside `B` is a build item.

| Scope | Meaning | What the receiver does |
| --- | --- | --- |
| `A` | Already ships in production. The prototype re-creates it only so the new behavior can be judged at real information density. | **Do not rebuild.** Modify only where a row says so. |
| `B` | New in this change. Does not exist in production yet. | Build it. |
| `C` | Storybook-only scaffolding. | Never ships. Strip it. |
| `U` | Not verified yet. | **Stop and ask.** Every `U` must also appear in Open Product Decisions with an owner. |

## Prototype To Frontend Map

Rows may be a whole route or a region inside one — a route that is `A` overall
can contain a `B` region, so split it rather than forcing one label onto the
route. A parent row's scope does not carry down to its children.
When more than one platform is in scope, replace the `Scope` column with
`Scope(web)` and `Scope(app)` columns — the same region can be `A` on web and
`B` on app; single-target deliveries keep one `Scope` column.

| Prototype part | Scope | Production location or existing source | What to do | Source |
| --- | --- | --- | --- | --- |
| `__ENTRY_ROUTE_ID__` | [`A` / `B` / `C` / `U`] | [Web route, app screen, or the existing surface it stands in for.] | [Build it / do not rebuild / modify just this region / strip.] | `__FEATURE_PASCAL__.tsx`, `__FEATURE_CAMEL__Flow.ts`, `__FEATURE_CAMEL__Data.ts` |
| Storybook-only query modes and fixtures | `C` | — | Strip. | `prototypeRoute`, `prototypeFlowPreview`, local fixtures |

## Do Not Rebuild

[List the `A` rows the receiver is most likely to build by mistake, and the
evidence that settles it — a component with no fixture, a route where only one
handler drives navigation, a screen already shipping under a known name. The
table states the verdict; this section says why it is safe to trust it. Delete
this section only if the map has no `A` rows.]

## Web Implementation Notes

- Route: [URL path, nested layout, modal, query params, or `Not in scope`.]
- Rendering: [SPA, SSR, SSG, server component, embedded widget, or unknown.]
- Responsive behavior: [Breakpoints and layout changes.]
- Accessibility: [Keyboard, focus, ARIA, and screen reader requirements.]
- Browser state: [Cache, local storage, session, or none.]
- Analytics and flags: [Events, feature flag, experiment, or none.]

## App Implementation Notes

- Navigation: [Stack, tab, sheet, modal, deep link, or `Not in scope`.]
- Platform constraints: [Safe area, orientation, dynamic type, reduce motion.]
- Gestures and feedback: [Dismissal, swipe, haptics, or none.]
- Permissions and OS services: [Permission prompt, native capability, or none.]
- Offline and retry: [Reconnect, background refresh, retry, or none.]
- Accessibility: [Labels, order, dynamic type, and screen reader behavior.]

## Shared Domain And UI State Model

- Route state: `__ENTRY_ROUTE_ID__` starts the flow.
- UI states: [Loading, empty, error, disabled, permission, optimistic, retry states.]
- Domain entities: [Stable ids and required fields.]
- Validation rules: [Client-side validation, if any.]
- Cache and refresh: [Invalidation, polling, push, or manual refresh.]

## API And Data Contracts

| Fixture group | Expected source | Request | Response | Errors | Semantics | Adapter interface | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `__FEATURE_CAMEL__Routes` | [Expected endpoint, service, local store, or static content.] | [Shape or unknown.] | [Shape or unknown.] | [Error shape or unknown.] | [`key: value` shorthand, e.g. `pagination: cursor; freshness: poll 30s; mutation: none; errors: retryable/reauth` — or `unknown (owner: <team>)`.] | [`pending` at handoff; the frontend assembly pass fills in the `<Feature>DataSource` method and mock implementation path.] | [Team or owner.] |

## Frontend Handoff Acceptance

- Production web route or app screen target is identified for the real product shell.
- Route transitions match `FLOW_SPEC.md`.
- API/data contracts are documented well enough for the receiving engineer or AI to wire later.
- Loading, empty, error, disabled, and permission fixture states in scope are documented.
- Accessibility requirements in `UI_SPEC.md` are specified for the target platform.
- Web/app platform notes above are filled in or explicitly marked `Not in scope`.
- Suggested tests cover the primary journey and scoped branch states.

## Integration Ownership

Ownership is three-stage; each stage hands a contract to the next.

- Stage 1 — Prototype (this handoff): UI behavior, route flow, interaction triggers, visual states, deterministic fixtures, and API/data contract expectations.
- Stage 2 — Frontend assembly (`frontend-product-implementation`): production routes/screens, interaction states, typed adapter interfaces, and mock adapters backed by these fixtures. Delivers a replaceable seam; never wires real integrations.
- Stage 3 — Data integration: real API clients, data sources, auth/session integration, cache policy, storage, persistence, environment configuration, and final production tests.
- Data Integration Ownership: [Named team, system, person, or the `production-data-integration` skill that replaces the mock adapters with real integrations — or an `Open Product Decisions` entry with the owner responsible for resolving it.]
- Change rule: if a later stage changes route behavior, data shape, or branch states, update these docs and the Storybook regression story.

## Storybook-Only Boundaries

- `parameters.prototype` is for Storybook review only.
- `prototypeRoute` and `prototypeFlowPreview` are iframe preview helpers only.
- `data-prototype-root` and `data-prototype-route-preview` are measurement hooks only.
- `StaticFlow` is for design/review export, not product runtime.
- Local fixtures are test data until replaced by the receiving implementation.

## Design System Continuity

This section records discovery results for the receiving implementation; it does not restate governance rules.

- Token namespace: [Prefix and defining file paths from the UI_SPEC Token Binding record, or `none`.]
- Component Map: [Echo the UI_SPEC Component Map, or link to it.]
- Per-screen composition (echo of `meta.components`):
  - Route `__ENTRY_ROUTE_ID__`: [One entry per component — name, origin (`shared`, `local`, or `promoted`), import path, and story id in backticks when one exists, e.g. ExampleCard — `shared` — `src/components/example-card` — story `components-example-card--default`. One indented sub-bullet per route.]
- Promotion candidates: [One line per Component Gaps candidate: name — `promoted` with its hub shared-component path and story id, or `local` with its prototype file path and the routes/regions that use it — or `none`.]
- Receiving pass: run `design-system-governance` discovery and gates against this record before implementing; when no token system existed, follow the `frontend-product-implementation` skill's token-bootstrap reference.

## Open Product Decisions

- [Decision that affects production routing, navigation, API, auth, security, analytics, release, or platform behavior.]
