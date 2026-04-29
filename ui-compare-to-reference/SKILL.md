---
name: ui-compare-to-reference
description: >-
  Compare a UI implementation against one or more reference screenshots, optionally
  paired with a live URL, route, page, or component file. Use when auditing visual
  parity, fixing layout/token drift, or aligning implemented UI with screenshot
  references across any frontend project. Enforces component-first, token-first
  visual fixes before page-level style overrides.
---

# UI Compare to Reference

Use this skill to compare a reference UI screenshot with the current implementation, then apply focused visual fixes. It is intentionally project-agnostic: discover the repository's screenshot locations, routing conventions, component structure, styling system, and design tokens before changing code.

Treat visual repair as a design-system exercise: trace the UI back to its tokens, theme, shared primitives, and composed components before editing the screen. Do not patch visual differences with one-off CSS unless the difference is truly unique to the selected screen and no shared abstraction owns it.

The reference can be paired with:

- a running page URL, such as `http://localhost:3000/dashboard`;
- an app route, such as `/dashboard`;
- a source file, such as `src/pages/Dashboard.tsx`;
- a component or story file, such as `Dashboard.tsx` or `Dashboard.stories.tsx`;
- an automatically inferred implementation target.

## Inputs

Accept any of these target forms from the user message:

- **Empty target:** compare all discoverable reference screenshots against likely pages.
- **Screenshot only:** `screen-2`, `screen-2.png`, `reference/screen-2.png`, `designs/dashboard.png`.
- **Screenshot + URL:** `screen-2.png http://localhost:3000/dashboard`.
- **Screenshot + route:** `screen-2.png /dashboard`.
- **Screenshot + file:** `screen-2.png src/pages/Dashboard.tsx`.
- **URL or route only:** `http://localhost:3000/dashboard`, `/dashboard`.
- **File only:** `src/pages/Dashboard.tsx`, `Dashboard.tsx`, `Dashboard.stories.tsx`.

Treat a screenshot + URL/file pair as the strongest signal. Do not override an explicit pair with auto-discovery unless the target cannot be found or loaded.

## Discovery

Before comparing or editing, discover project conventions:

1. Find reference screenshots. Check explicit paths first, then common folders such as `reference/`, `references/`, `screenshots/`, `design/`, `designs/`, `mockups/`, `spec/`, `specs/`, and `public/`.
2. Find UI entry points. Check explicit files first, then common locations such as `src/pages/`, `src/screens/`, `src/app/`, `app/`, `pages/`, `src/routes/`, `src/components/`, `components/`, and Storybook stories.
3. Identify the styling system: Tailwind, CSS modules, vanilla CSS, Sass, styled-components, CSS-in-JS, design tokens, theme files, or component libraries.
4. Identify available design guidance in files such as `README.md`, `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/`, theme files, token files, Storybook docs, or component documentation.
5. If a live URL is provided, verify whether an app server is already running before starting one. Use the browser tools to inspect the page and capture the current implementation visually.

## Target Resolution

Resolve targets in this order:

1. **Screenshot + URL:** compare the screenshot to the rendered URL. Use source inspection only to understand and fix the implementation.
2. **Screenshot + file:** compare the screenshot to the component/page represented by the file. If possible, find or run the route/story that renders it; otherwise compare against the code structure and styles.
3. **Screenshot + route:** find the route's implementation file, then compare the screenshot to that route.
4. **Screenshot only:** match by filename, nearby docs, route names, component names, visible copy, and visual intent.
5. **URL or route only:** capture the current UI, then find the closest reference screenshot.
6. **File only:** find the rendered URL/story if possible, then match the closest reference screenshot.
7. **Empty target:** compare all plausible screenshot/page pairs, but ask before editing if there are multiple ambiguous matches.

If the screenshot or implementation target is ambiguous, list the likely candidates and ask the user to choose before applying fixes.

## Comparison Workflow

For each selected screen:

1. Inspect the reference screenshot and describe the intended visual structure: layout regions, hierarchy, spacing, alignment, typography, colors, borders, radii, shadows, imagery, and interactive states visible in the image.
2. Inspect the implementation source and its imported components.
3. Trace component ownership before editing: identify whether each visible block comes from a shared component, design-system primitive, third-party library wrapper, local page composition, or ad hoc markup.
4. If a URL or story can be rendered, compare the live UI against the reference visually. Use screenshots when helpful.
5. Cross-reference colors, spacing, typography, radius, elevation, and animation choices against the project's tokens or theme files when they exist.
6. Classify each discrepancy by likely source: token/theme, shared component, component variant/props, page composition, or one-off page style.
7. List visual discrepancies before editing.

Use this report format:

`| Block | Expected (reference) | Actual (implementation) | Fix |`

## Component-First Fix Strategy

Prefer the same layered repair model used by mature design systems such as Material Design 3:

1. **Token/theme layer:** If the mismatch is a repeated color, spacing, typography, radius, shadow, elevation, breakpoint, or motion value, update or use the existing token/theme value first.
2. **Primitive/shared component layer:** If multiple screens or usages would expect the same visual behavior, fix the shared primitive or component variant instead of styling the page instance.
3. **Composition layer:** If the selected screen composes correct components incorrectly, adjust layout, props, slots, wrappers, or responsive structure at the screen/component composition level.
4. **Page-only layer:** Use page-level CSS, utility classes, or inline style only when the visual difference is unique to the selected target and no shared token, primitive, variant, or composition API owns it.

Before editing, state which layer owns each planned fix. If ownership is ambiguous, inspect nearby stories, docs, component call sites, and token/theme files before choosing.

## Fixing Rules

- Apply fixes only for the selected target.
- Prefer existing components, design tokens, utility classes, theme variables, and project conventions.
- Do not introduce one-off hardcoded styles when a token or shared primitive exists.
- Do not bypass shared components by restyling their rendered markup from the page. Update the component, variant, props, or token that owns the visual behavior.
- If a shared component change may affect other screens, inspect representative call sites or stories and keep the change compatible with existing intended variants.
- When a one-off style is unavoidable, keep it local, explain why no shared owner exists, and avoid hardcoded values when an existing token can express the same value.
- Keep changes scoped to visual parity unless the user asks for broader refactoring.
- If a URL was provided, verify the result against that URL after editing whenever practical.
- If a file was provided but no renderable URL/story is available, validate with typecheck, lint, tests, or the project's cheapest reliable check.
