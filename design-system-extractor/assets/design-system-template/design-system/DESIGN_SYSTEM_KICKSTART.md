# Design System Extraction Kickstart

Extract a reusable design-system specification from the provided references.

Do not implement product screens yet. Do not scaffold app routes yet. Do not invent a landing page.

## References

List screenshots, graphic/brand/editorial references, Figma URLs/nodes, rendered routes, project folders, and prototype sources here.

For AI-generated or vibe-coded project folders, include route/state coverage, rendered capture attempts, screenshot paths, Storybook stories, and keep/ignore notes before using source code as high-confidence evidence.

## Required Order

1. Fill `DESIGN_EVIDENCE_MAP.md`, record source fingerprints, and review duplicate source candidates.
2. For vibe-coded projects, complete the route/state manifest, run rendered UI capture when possible, and classify demo-only, unused, dead-code, capture-blocked, auth-blocked, contradictory, or out-of-scope sources before raising confidence.
3. Fill `DESIGN_PRINCIPLES.md`.
4. Fill `DESIGN_ELEMENTS.md`.
5. Fill `TOKEN_ARCHITECTURE.md`, review near token candidates, then fill `tokens/`.
6. Fill `COMPONENT_INVENTORY.md`, including reusable typographic/text-lockup candidates, and review similar component candidates.
7. Extract at least one primary component token spec into `design-system/components/`. For graphic/editorial-heavy references, this may be a high-value typographic lockup instead of an interactive UI control.
8. Fill `PAGE_COMPOSITION_RULES.md`, `INTERACTION_STATES.md`, and `ANTI_AI_STYLE_RULES.md`.
9. Generate `docs/design-system/index.html` and `docs/design-system/review.html`.
10. Run strict source, token, and component audits.
11. For collaborative branch or PR work, update `INTEGRATION_REVIEW.md`.
12. Update `SESSION_STATE.md`.
13. Stop and ask the user what to do next.

## Boundary

This package defines design-system rules and tokens. Product implementation begins only after the user approves the checkpoint.
