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
- `viewport`: optional `{ width, height }` preview-size override for this route only, for mixed flows (for example one desktop admin screen inside a phone flow). Falls back to the flow-level viewport.

## Viewport

The flow object carries the primary review viewport as a first-class field:

```ts
viewport: { formFactor: "phone" | "tablet" | "desktop", width: number, height: number }
```

Every renderer — Static Flow export, the prototype shell, and the Prototype Inspector — reads this value at runtime, so editing `flow.viewport` by hand resizes the prototype without re-scaffolding. A flow that declares no viewport resolves to phone 375x812 in every consumer, which keeps existing prototypes working untouched.

Presets are pinned to the storybook-template `--sbt` viewport token tier:

| Preset | formFactor | Size | Token tier |
| --- | --- | --- | --- |
| `phone` | phone | 375x812 | `--sbt-sys-size-viewport-compact-*` |
| `tablet` | tablet | 768x1024 | `--sbt-sys-size-viewport-medium-*` |
| `desktop` | desktop | 1280x800 | `--sbt-sys-size-viewport-wide-*` |

Scaffold with `--viewport {phone|tablet|desktop|<W>x<H>}` (custom sizes classify their formFactor by width: >=1024 desktop, >=600 tablet, else phone; sides must be 240-3840). The Prototype Inspector resolves each card's preview size in this order:

1. `route.viewport` (per-route override)
2. `flow.viewport`
3. the form-factor tier CSS tokens (`--prototype-inspector-viewport-compact/medium/wide-*`, read on the `.prototype-inspector` element first, then `:root`)
4. the built-in phone constants 375x812

`flowPosition` values and saved positions place the top-left corner of a route's frame box, which includes the 64px name band above the preview (the box is preview width + 2 by preview height + 64 + 2 pixels); a flow-only node's position is the top-left of its own box. Values are authored against the declared frame size. The UI Flow camera (pan and zoom) is per-tab review state stored in sessionStorage and is never written into the layout payload, so saved layouts and the Static Flow export carry positions only. Saved drag layouts (localStorage payload version 2) carry a viewport signature (`<formFactor>:<width>x<height>`); when a prototype's declared viewport changes, saved positions with a mismatched signature are ignored with a console.info notice and the fallback layout is used — a one-time re-drag instead of phone-era coordinates rendering desktop frames as an overlapping pile. Unsigned version-1 payloads keep applying for phone 375x812 prototypes.

Auto Layout (UI Flow layout group) writes its positions into the same saved layout as a drag. The feature names it shows beside its lanes are Inspector state, not part of the layout payload: they are stored under `prototype-inspector:flow-lanes:<prototypeId>` (the same normalized prototype id as the layout key) as `{ version: 1, viewport, labels: [{ key, title, anchor }] }`, where `anchor` is the route or flow-node id of the lane's first frame, and they are shown only while `viewport` matches the flow's signature (an unsigned record counts as `phone:375x812`). The layout export adds the shown names as `lanes` in the same label shape; an import writes them back for the current signature and drops names whose anchor is not in the flow. `prototypeFlowLayout.ts` and its schema version are unchanged.

Static Flow export fallback placement scales with the frame: below 900px-wide frames it uses the derived grid pitch (identical to the historical 560x980 at phone); at 900px or wider each `flowGroup` becomes its own horizontal row so desktop frames never overlap. Route cards show a formFactor badge (for example `desktop · 1280x800`).

`export_flow.py` includes the resolved viewport in `docs/flow.json` (top-level `viewport` plus per-route overrides; omitted entirely for flows that declare none, `flowSchemaVersion` stays 1) while still stripping the canvas-layout fields — the viewport is product semantics, not layout.

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
- `presentation`: target semantics — `push` (stack navigation / page change), `modal` (blocking overlay), `sheet` (partial overlay), `fullscreen` (full-screen cover), or `replace` (swap without history). Required by `--handoff-ready` for every non-return transition entering a visible route, on every platform; app targets also require it on all other non-return transitions. A missing field is an error without `--strict-style`, never an implied push.
- `backBehavior`: exit semantics — `pop` (one step back), `popToRoot` (back to the flow's root), `dismiss` (close the overlay), or `none` (no user-initiated back). Required at handoff for every return transition entering a visible route. Declare other nontrivial exits explicitly too; missing return behavior never implies pop.
- `motion`: `none`, `platform-default`, or `custom`. Required at handoff for every transition entering a visible route, including return transitions. This is animation intent, separate from navigation presentation. `platform-default` explicitly authorizes the native/browser framework default without a guessed duration; `none` explicitly disables transition animation.
- `motionRef`: required for custom motion, using `FLOW_SPEC.md#explicit-anchor` with a matching actual HTML anchor in that document. Describe entering/returning behavior, direction, duration/easing, and reduced-motion behavior at the anchor. Do not rely on an automatically generated Markdown heading slug.
- `flowLine`: optional display hint. `key`: drawn on the full UI Flow canvas; `reference`: not drawn on the full canvas but used to derive branch journeys; journey focus views draw the transitions between consecutive steps regardless of flowLine.
- `sourceAnchor`: optional `{ x, y }` route-card-relative ratio used only when Static Flow export needs a stable edge origin for Figma-ready layout. Use sparingly and keep values between `0` and `1`.

Draft/legacy files may omit the navigation and motion fields and remain readable. Report the unresolved choice and its owner; do not infer defaults. Missing intent blocks that flow's complete handoff, not independent work. A non-screen branch target does not need motion solely for branch evaluation. `export_flow.py` preserves motion/motionRef in flow JSON and native scaffold comments; it does not implement an animation engine.

## Journeys

`flow.journeys` lists the feature journeys a reviewer walks through, one per PRD Core Journey (`### Journey N: <Name>`). Each journey defines:

- `id`: lowercase kebab-case (`[a-z0-9][a-z0-9-]*`), unique within the flow.
- `title`: the journey name from the PRD.
- `description`: optional.
- `steps`: route or flow-node ids in order, at least two. A step may repeat (for example a return to an earlier screen). Only `flow.routes` and `flow.nodes` ids are steps; a navigation id that exists only in `<name>RouteIds` is not.

Keep the exported array a literal `[]` until the first journey exists. Usage examples belong in the journey type's JSDoc, written as a bare object literal: flow-file scanners such as `export_flow.py` read the file without removing comments, so an example must not contain `export const`, `Flow = {`, `Viewport = {` or `Routes = [`.

`scripts/validate_prototype.py` checks journeys only when a flow declares some:

- error `journey '<id>' references unknown step '<step>'`
- error `journey id '<id>' must be lowercase kebab-case`
- error `journey id '<id>' is duplicated`
- error `journey '<id>' needs at least two steps`
- warning `journey '<id>' has no transition from '<a>' to '<b>'` for consecutive steps without a transition (a pair involving an unknown step is not reported again; `--strict-style` promotes the warning to an error)

In the UI Flow, a journey list beside the canvas offers 全部 (the full canvas), the declared journeys and an 自動分支 section. Selecting a journey shows a read-only, single-line view of its steps. Branch journeys are derived automatically: a branch node is a route or flow node whose qualifying transitions (flowLine `key` or `reference`, kind not `return` or `global`) lead to two or more nodes, and each of its distinct targets yields one short journey (up to two steps of lead-in, the branch node, the target, then the path onward while it does not branch), named by the transition labels and the target title. Derived journeys whose steps equal a declared journey are not listed, and at most 24 are listed, with the number left out. Declare journeys when the derived names are not the feature names reviewers should see.

Journeys live in the Flow file. In a prototype that already has `docs/HANDOFF_MANIFEST.json`, adding or editing journeys changes its artifactsDigest and `--verify-manifest` reports drift. Journeys are review-only and do not change production behavior; once the demo is confirmed, republish the manifest with `python3 <skill-root>/scripts/validate_prototype.py <folder> --handoff-ready --changelog "review-only: journeys"`. `export_flow.py` does not write journeys to `docs/flow.json`.

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

## Interactive Preview

UI Flow interact mode lets a reviewer operate one frame (double-click it, or select it and press Enter; Escape leaves). The Inspector then loads the route preview URL with `prototypeFlowInteractive=true` added to `prototypeRoute=<route-id>` (and `prototypeFlowPreview=true`):

- The prototype renders `prototypeRoute` first, then lets its own navigation change the rendered route: the rendered route comes from component state, and `goTo` (or the equivalent) is not blocked by `prototypeRoute` in this mode.
- `prototypeFlowPreview=true` still hides the prototype chrome.
- `[data-prototype-root]` keeps `data-route` equal to the flow route id currently rendered, and adds `data-prototype-interactive="true"` while this mode is active. The Inspector shows the title of a different flow route in its interaction chip; a `data-route` value that is not a route id of the flow is ignored.
- Without `prototypeFlowInteractive=true`, a `prototypeRoute` preview stays pinned to its route.

Prototypes that do not read `prototypeFlowInteractive` still scroll and take clicks in interact mode, but a prototype that pins `prototypeRoute` cannot navigate; `validate_prototype.py` warns about it (an error only under `--strict-style`).

## Acceptance

- Every visible route appears in route metadata.
- Every documented click appears in transition metadata.
- Every transition target exists as a route or flow-only node.
- Every transition entering a visible route has motion plus its required presentation or return behavior; every custom motion reference resolves to an explicit Flow Spec anchor.
- The full UI Flow canvas uses key transitions; journey focus views use all transitions between consecutive steps; Transition Index uses the full transition list.
- The prototype supports `prototypeRoute=<route-id>` for route-specific iframe previews.
- The prototype supports `prototypeFlowPreview=true` for compact embedded rendering.
- The prototype supports `prototypeFlowInteractive=true` with `prototypeRoute=<route-id>`: it renders that route first, lets in-preview navigation change the rendered route, keeps `data-route` on `[data-prototype-root]` equal to the rendered route and adds `data-prototype-interactive="true"` (see Interactive Preview).
- In flow preview mode (`isFlowPreview` prop or `prototypeFlowPreview=true`), the prototype hides its own chrome — the prototype header and the route navigation — so flow cards and iframe previews show only what the real page shows.
- The route preview shell exposes `data-prototype-route-preview="true"` for template-compatible iframe measurement.
- The prototype root keeps `data-prototype-root="true"` for backward-compatible iframe height measurement.
- Static Flow export reads saved layout from `prototypeFlowLayout.ts` using the same storage key as the Prototype Inspector, passing the resolved viewport signature so mismatched saved layouts are cleanly ignored.
- The Static Flow export derives frame sizes from `Flow.viewport` at runtime (never baked constants), and the prototype shell sets the preview-size CSS variables inline from the same source.
- Production handoff maps every route and branch node that must become a web/app surface, service decision, API/data contract expectation, or shared state.
