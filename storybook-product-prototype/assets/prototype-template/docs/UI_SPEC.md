# UI Spec

## Design Principle

[Describe the product experience and reuse expectations.]

## Shell

- [Describe viewport, navigation, header, footer, sheet, or modal shell.]

## Platform Targets

- Web: [Responsive layout, keyboard/focus behavior, browser constraints, or `Not in scope`.]
- App: [Safe areas, navigation shell, gestures, dynamic type, reduced motion, or `Not in scope`.]

## Routes

### `__ENTRY_ROUTE_ID__`

- [Describe entry route composition and expected interactions.]

## Interaction

- [List how controls map to route transitions.]

## Visual Constraints

- Use existing design-system components before local markup.
- Use design tokens or project theme values.
- Keep prototype-only CSS scoped under `.__FEATURE_CSS_CLASS__`.
- Move reusable UI into production components before shipping; do not ship Storybook-only preview wrappers.

## Accessibility

- The root prototype region must have an accessible label.
- Navigation, buttons, overlays, and dismiss controls must have labels.
- Production web or app surfaces must preserve focus order, screen reader labels, and platform text scaling expectations.

## AI Composition Rules

- Compose from existing components first.
- Keep event handlers close to route state.
- Keep fixture data in `__FEATURE_CAMEL__Data.ts`.
- Do not infer route behavior from screenshots; use `FLOW_SPEC.md`.
- Use `PRODUCTION_HANDOFF.md` for production routing, app navigation, and integration boundaries.
