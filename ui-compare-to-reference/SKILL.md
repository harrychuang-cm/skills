---
name: ui-compare-to-reference
description: >-
  Compare a UI implementation against one or more reference screenshots, optionally
  paired with a live URL, route, page, or component file. Use when auditing visual
  parity, fixing layout/token drift, or aligning implemented UI with screenshot
  references across any frontend project.
---

# UI Compare to Reference

Use this skill to compare a reference UI screenshot with the current implementation, then apply focused visual fixes. It is intentionally project-agnostic: discover the repository's screenshot locations, routing conventions, component structure, styling system, and design tokens before changing code.

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
3. If a URL or story can be rendered, compare the live UI against the reference visually. Use screenshots when helpful.
4. Cross-reference colors, spacing, typography, radius, elevation, and animation choices against the project's tokens or theme files when they exist.
5. List visual discrepancies before editing.

Use this report format:

`| Block | Expected (reference) | Actual (implementation) | Fix |`

## Fixing Rules

- Apply fixes only for the selected target.
- Prefer existing components, design tokens, utility classes, theme variables, and project conventions.
- Do not introduce one-off hardcoded styles when a token or shared primitive exists.
- Keep changes scoped to visual parity unless the user asks for broader refactoring.
- If a URL was provided, verify the result against that URL after editing whenever practical.
- If a file was provided but no renderable URL/story is available, validate with typecheck, lint, tests, or the project's cheapest reliable check.
