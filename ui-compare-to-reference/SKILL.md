---
name: ui-compare-to-reference
description: >-
  Compare an implemented UI against a reference and apply the visual fixes. The
  reference can be a Figma file or frame, a design export or screenshot, or
  another platform's source code — a web implementation used as the truth for an
  app, or an app implementation used as the truth for web. Use when an app or web
  UI does not match its design, when porting a screen between web and
  React Native / Flutter / iOS / Android, or when auditing and repairing layout
  and token drift. Enforces token-first and component-first repair, and refuses
  to "fix" legitimate platform adaptations.
---

# UI Compare to Reference

Compare a reference UI with the current implementation, then apply focused visual fixes. Project-agnostic: discover the repository's screenshot locations, routing conventions, component structure, styling system, and design tokens before changing code.

Treat visual repair as a design-system exercise. Trace the UI back to its tokens, theme, shared primitives, and composed components before editing the screen. Do not patch differences with one-off styles unless the difference is truly unique to the selected screen and no shared abstraction owns it.

To produce a reviewable evidence report instead of (or before) fixing, use `ui-pixel-align-report`.

## What can be compared

| Reference | Implementation | Typical ask |
|---|---|---|
| Figma frame or node URL | web | "設計稿跟網頁對不上，幫我修" |
| Figma frame or node URL | app (RN / Flutter / iOS / Android) | "App 跟設計稿差很多" |
| Web source or live URL | app | "照著網頁版把 App 修對" |
| App source or running app | web | "Web 版要跟 App 一致" |
| Screenshot / design export | web or app | no Figma access |
| App on one OS | app on the other OS | iOS ↔ Android parity |

## Inputs

Accept any of these from the user message:

- **A findings file:** `reports/design-pixel-align/wallet/findings.json` — the strongest input. Skip straight to the fix loop.
- **Figma + target:** `https://figma.com/design/...?node-id=1-234 src/screens/WalletHome.tsx`, or with a URL, route, or story.
- **Reference code + target:** `apps/web/src/pages/Wallet.tsx apps/mobile/src/screens/WalletHome.tsx`, or two repo paths, or a reference URL plus an app screen.
- **Screenshot + target:** `screen-2.png http://localhost:3000/dashboard`, `screen-2.png /dashboard`, `screen-2.png src/pages/Dashboard.tsx`.
- **Screenshot only:** `screen-2`, `designs/dashboard.png`.
- **Target only:** `http://localhost:3000/dashboard`, `/dashboard`, `Dashboard.stories.tsx`.
- **Empty target:** compare all discoverable reference/implementation pairs.

An explicit reference + target pair is authoritative. Do not override it with auto-discovery unless a side cannot be found or loaded.

## Discovery

Before comparing or editing:

1. **Identify both platforms.** Web, React Native, Flutter, iOS, Android, or Figma — for the reference and for the target. Everything downstream depends on this pair.
2. **Find the reference.** Explicit paths first, then `reference/`, `references/`, `screenshots/`, `design/`, `designs/`, `mockups/`, `spec/`, `specs/`, `public/`. For a monorepo, the reference implementation is often a sibling workspace (`apps/web`, `apps/mobile`, `packages/ui`).
3. **Find the implementation entry point.** Explicit files first, then `src/pages/`, `src/screens/`, `src/app/`, `app/`, `pages/`, `src/routes/`, `src/components/`, `components/`, `lib/`, and Storybook stories.
4. **Identify the styling system** on the target: Tailwind, CSS modules, vanilla CSS, Sass, styled-components, CSS-in-JS, StyleSheet, ThemeData, MaterialTheme, SwiftUI constants, or a component library.
5. **Identify design guidance:** `README.md`, `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/`, theme files, token files, Storybook docs, component documentation.
6. **Check what can be rendered.** If a URL is provided, verify whether a server is already running before starting one. For app targets, check for a running simulator, an Expo/Metro process, or a Storybook.

## Target Resolution

1. **findings.json:** use it as-is. Only re-derive when a finding is stale against the current code.
2. **Reference + target pair:** compare exactly that pair.
3. **Reference + route:** find the route's implementation, then compare.
4. **Reference only:** match by filename, nearby docs, route names, component names, story names, visible copy, and visual intent.
5. **Target only:** capture the current UI, then find the closest reference.
6. **Empty target:** compare all plausible pairs, but ask before editing when multiple matches are ambiguous.

If either side is ambiguous, list the likely candidates and ask before applying fixes.

## Comparison

When a `findings.json` from `ui-pixel-align-report` exists, skip to **Fix Strategy** — the diagnosis is done.

Without one, do a condensed version of the same method. Do not eyeball one surface against the other; establish both sides in comparable terms first.

1. **Read the reference into concrete values.**
   - Figma: use the Figma MCP tools — node metadata for the tree, variable definitions for token names, design context for layout/typography/fills/radii/effects, a screenshot for visual confirmation. Exact numbers and variable names come from here; do not estimate off a PNG when MCP is available.
   - Reference source code: read the layout and style declarations, resolving the theme layer. Convert units to CSS-equivalent px at 1x — RN dp, Flutter logical px, iOS pt, and Android dp are all 1:1 with CSS px; `rem` needs the root font size; `sp` scales with user settings.
   - Screenshot only: establish scale from one element of known size, measure relative to it, round spacing to 4px and type to 1px, and say the values are approximate.
2. **Read the implementation the same way.** Prefer measuring a rendered surface (`getComputedStyle`, layout inspector, widget inspector) over reading source. Source reading misses inherited and themed values.
3. **Compare viewports first.** A reference frame that is an exact 2x or 3x multiple of the target viewport is a scale error, not drift — fix the capture instead of filing findings.
4. **Trace ownership** for each differing block: shared component, design-system primitive, third-party wrapper, page composition, or ad hoc markup.
5. **Classify each difference** before touching code — see Parity Rules below.
6. **List the differences** before editing:

   `| Block | Expected (reference) | Actual (implementation) | Class | Owner | Fix |`

For the full method — spec schema, Figma extraction recipe, per-platform code reading, and a diff script that does the arithmetic — use `ui-pixel-align-report` and its `references/`.

## Parity Rules

Cross-platform repair fails when every difference is treated as a defect. Classify before fixing:

- **Drift** — must match, does not. Fix it. Covers color, radius, border, font weight, structure, reading order, copy, and — at the same form factor — spacing, sizing, and font size.
- **Adaptation** — the platform or form factor justifies the difference. Leave it. Covers sanctioned font substitution (Inter → SF Pro Text on iOS, Roboto on Android), shadow rendering across engines, and density differences between a desktop reference and a phone target.
- **Required adaptation** — the implementation copied the reference where it should have diverged. Fix it by *diverging further*: raise touch targets to 44pt on iOS / 48dp on Android, respect safe-area insets on top of the design's padding, let text containers grow under Dynamic Type, add `:hover` and `:focus-visible` when porting native → web, and add `pressed` when porting web → native.
- **Ignored** — OS chrome, status bars, home indicators, scrollbars, absolute positions, hover states on touch-only surfaces.

Form factor is the deciding axis. Same viewport class → compare absolute values strictly. Desktop reference vs phone target → preserve ratio, rhythm, and hierarchy, not absolute pixels.

State which class each planned fix falls into. Never silently "fix" an adaptation.

## Fix Strategy

Use the layered repair model of mature design systems:

1. **Token/theme layer.** A repeated color, spacing, typography, radius, shadow, elevation, breakpoint, or motion value → update or apply the existing token first.
2. **Primitive/shared component layer.** Multiple screens would expect the same behavior → fix the shared primitive or component variant, not the page instance.
3. **Composition layer.** Correct components composed incorrectly → adjust layout, props, slots, wrappers, or responsive structure at the screen level.
4. **Page-only layer.** Only when the difference is unique to this target and no token, primitive, variant, or composition API owns it.

State which layer owns each planned fix before editing. If ownership is ambiguous, inspect nearby stories, docs, call sites, and token files first.

`references/apply-to-platform.md` covers how to express each correction idiomatically per platform — where tokens live, how gap/padding/radius/typography/elevation are written in web, React Native, Flutter, SwiftUI, and Compose, how to implement the required adaptations, and the layout traps that break naive ports.

## Fixing Rules

- Apply fixes only for the selected target.
- Prefer existing components, tokens, utility classes, theme variables, and project conventions.
- Do not introduce one-off hardcoded values when a token or shared primitive exists. When the reference calls for a value that has no token and it recurs, propose adding the token rather than inlining it.
- Do not bypass shared components by restyling their rendered markup from the page. Update the component, variant, props, or token that owns the behavior.
- If a shared component change may affect other screens, inspect representative call sites or stories and keep the change compatible with existing intended variants.
- When a one-off is unavoidable, keep it local, explain why no shared owner exists, and still avoid raw values an existing token can express.
- Never port a value across platforms without converting it: line height is absolute in CSS/RN/Compose, a multiplier in Flutter, and extra leading in SwiftUI.
- Keep changes scoped to visual parity unless the user asks for broader refactoring.

## Verification

A fix is not done until it is measured again.

1. Re-render the changed surface on **its own platform** — reload the URL or story, hot reload the simulator, rebuild the preview.
2. Re-measure the nodes you changed. Confirm each one now matches the reference value.
3. When working from a `findings.json`, update each finding's `status` to `fixed`, `open`, or `accepted` (for adaptations), and say which ones remain.
4. Run the project's cheapest reliable check: typecheck, lint, tests, or a build.
5. Report honestly which differences were closed, which were left as adaptations, and which could not be fixed without a design-system decision.

If a URL was provided, verify against that URL. If a file was provided with no renderable target, validate with the project's cheapest reliable check and say that no visual confirmation was possible.
