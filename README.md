# CM Skills

Reusable Cursor / Claude Code skills for UI implementation workflows.

## Skills

### `ui-compare-to-reference`

Compare an implemented UI against one or more reference screenshots, then apply focused visual fixes. This skill is project-agnostic: it discovers the target repo's screenshots, routes, components, Storybook stories, styling system, and design tokens before editing.

Supported target examples:

```text
screen-2.png
screen-2.png http://localhost:3000/dashboard
screen-2.png /dashboard
screen-2.png src/pages/Dashboard.tsx
http://localhost:3000/dashboard
src/pages/Dashboard.tsx
Dashboard.stories.tsx
```

Use this when you need visual parity checks, layout drift fixes, token alignment, or screenshot-to-implementation comparison.

### `ui-screenshot-to-storybook-product`

Turn a UI screenshot, mockup, or Figma export into a token-backed implementation workflow:

1. Parse the image into reusable UI building blocks.
2. Map blocks to existing design-system components and tokens.
3. Build or extend Storybook, or the project's equivalent component catalog, first.
4. Compose product screens from documented components.

Use this when implementing a new screen from an image and you want reusable components, documented examples, and token-backed styles to remain the source of truth.

## Usage

Install or reference these folders as agent skills in Cursor / Claude Code. Each skill lives in its own directory and exposes a `SKILL.md` with frontmatter metadata and workflow instructions.

When invoking the visual comparison skill, provide the most specific target pair available. For example, prefer:

```text
Use ui-compare-to-reference on reference/dashboard.png and http://localhost:3000/dashboard
```

or:

```text
Use ui-compare-to-reference on reference/dashboard.png and src/pages/Dashboard.tsx
```

If only a screenshot, URL, route, or file is available, the skill will attempt to infer the matching target.

## Repository Structure

```text
.
├── ui-compare-to-reference/
│   └── SKILL.md
└── ui-screenshot-to-storybook-product/
    └── SKILL.md
```

## Notes

- Keep skills generic unless a project-specific assumption is explicitly required.
- Prefer token-backed and component-first guidance for UI workflows.
- Update this README when adding or renaming skills.
