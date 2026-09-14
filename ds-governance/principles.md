# Design Principles In Project Context

Read this reference when a visual choice needs rationale. Start from the user's reference and the project's documented design language. These principles help evaluate consistency; they do not prescribe a brand style or authorize a redesign.

## Preserve the intended visual language

A neutral enterprise tool, dense trading interface, expressive consumer app and native settings screen can all be well designed. Choose color intensity, geometry, typography, density and depth from the product's evidence. Saturated accents, pill shapes, large display text and layered cards are options, not universal requirements.

When a visual reference conflicts with the existing design system, identify the conflict and its scope. Reuse existing semantics when they express the intended result; resolve a new visual role through the token/component gate when they do not.

## Give tokens meaningful responsibilities

Separate raw values from their roles according to the existing architecture. A primitive name communicates a reusable value; a semantic name communicates intent; a component slot binds a particular structure when that layer exists. Consistent roles make themes and modes maintainable. Renaming a working system just to resemble an example adds no useful evidence.

## Compose before extending

Shared components carry behavior, accessibility and API conventions as well as pixels. Reuse their supported variants before proposing a new one. Feature-local composition is useful when it arranges existing capabilities without creating a duplicate primitive or modifying a shared contract.

## Make hierarchy fit the task

Use the established type and spacing scales to express grouping and reading order. Judge density against actual content, viewport, localization and text scaling. A fixed hero font size, page grid or breakpoint cannot serve every product or platform.

## Verify accessible behavior

Foreground/background token pairs need checks in their actual themes and states. Color names or an on-* prefix do not prove contrast. Interactive controls need meaningful names, supported focus and pressed feedback, and state distinctions beyond color when necessary. Use the project's accessibility requirements and report what was actually tested.

## Make motion purposeful

Motion can explain navigation, state changes and interaction feedback. Preserve the platform's expected behavior and the project's reduce-motion handling. An interface without decorative animation is valid. When animation is required, reuse theme timing and curves rather than inventing fixed delays or ambient effects.

## Match evidence to the claim

Source inspection establishes mappings and intended behavior. A build establishes compilation. Stories, previews, snapshots and interactive walkthroughs establish different aspects of the rendered result. Record the evidence that exists and the behavior it leaves unverified; do not collapse these into a single claim of visual parity or acceptance.
