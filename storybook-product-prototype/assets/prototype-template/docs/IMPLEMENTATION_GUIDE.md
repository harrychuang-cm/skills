# Implementation Guide

## Implementation Order

1. Define product scope in `PRD.md`.
2. Define route ids and transitions in `FLOW_SPEC.md`.
3. Implement the same contract in `__FEATURE_CAMEL__Flow.ts`.
4. Define deterministic fixtures in `__FEATURE_CAMEL__Data.ts`.
5. Compose the interactive surface in `__FEATURE_PASCAL__.tsx`.
6. Add only prototype shell styles to `__FEATURE_KEBAB__.css`.
7. Import all documents and flow metadata in `__FEATURE_CAMEL__Meta.ts`.
8. Add `figmaExport.flowStoryId` in `__FEATURE_CAMEL__Meta.ts`.
9. Attach the meta object to `parameters.prototype` in `__FEATURE_PASCAL__.stories.tsx`.
10. Create `__FEATURE_PASCAL__FlowExport.tsx` and `__FEATURE_PASCAL__FlowExport.stories.tsx` with `StaticFlow`.
11. Confirm `prototypeRoute`, `prototypeFlowPreview`, `data-prototype-route-preview`, and `data-prototype-root` support UI Flow iframe previews.
12. Verify Storybook, docs, UI Flow metadata, Static Flow export, and TypeScript.

## Files To Maintain Together

- `__FEATURE_PASCAL__.tsx`
- `__FEATURE_CAMEL__Flow.ts`
- `__FEATURE_CAMEL__Data.ts`
- `__FEATURE_CAMEL__Meta.ts`
- `__FEATURE_PASCAL__.stories.tsx`
- `__FEATURE_PASCAL__FlowExport.tsx`
- `__FEATURE_PASCAL__FlowExport.stories.tsx`
- `../prototypeFlowLayout.ts`
- `docs/*.md`

## Constraints

- Use route ids from `__FEATURE_CAMEL__RouteIds`.
- Keep fixtures local and deterministic.
- Reuse existing design-system components before adding local UI.
- Keep prototype-specific CSS scoped under `.__FEATURE_CSS_CLASS__`.
- Do not call real product APIs.
- Keep `prototypeRoute` query support when adding or renaming routes.
- Keep Static Flow export driven by `__FEATURE_CAMEL__Flow.ts`; do not duplicate route or transition lists.
- Use `sourceAnchor` only when route-card-relative edge origins need Figma export tuning.

## Required Verification

- Run the target project's typecheck.
- Render the Storybook story.
- Render the `StaticFlow` Storybook story.
- Run `python3 <skill-root>/scripts/validate_prototype.py <this-prototype-folder>`.
