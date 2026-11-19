# Anti-AI Style Rules

Use this reference when writing `design-system/ANTI_AI_STYLE_RULES.md`.

The maintained source for this topic is the standalone `anti-ai-style` skill. When it is available (a sibling skill folder, or the host's skill catalog), follow its `rules` mode: read `anti-ai-style/references/project-rules.md` for how to write each rule and `anti-ai-style/references/tells.md` for the tell IDs. This file is the baseline to use when that skill is not installed. Do not extend the baseline here; new generic rules go into the `anti-ai-style` catalog.

## What The Project File Must Contain

- **Evidenced Exceptions**: patterns that resemble a generic tell and are part of this product, each with its allowed scope and its evidence. Keep the heading and the table from the template; `anti-ai-style`'s scanner reads the first column.
- **Domain Semantics**: meanings a generic reading would get wrong, such as what red and green mean in this product.
- **Component Restraints**: rules that name a component, the generic version it must not become, the measured specifics to preserve, and the evidence. A rule that would be equally true in another product's file is too generic to keep.

## Decorative Restraints

- Do not add background gradients unless references clearly use them.
- Do not add glow blobs, bokeh orbs, abstract SVG waves, glassmorphism, or decorative illustration panels unless references show them.
- Do not replace concrete product media with generic abstract decoration.
- Do not use generic SaaS hero sections for app screens.

## Surface Restraints

- Do not outline every card.
- Do not nest outlined cards inside outlined cards.
- Do not wrap every row in its own card unless references clearly use row-as-card treatment.
- Prefer spacing, surface contrast, dividers, and elevation according to observed patterns.

## Density Restraints

- Do not increase whitespace to make the UI feel more premium.
- Preserve dense operational screens as dense operational screens.
- Use spacious rhythm only where the references show section-level breathing room.

## Color Restraints

- Do not turn one accent color into a global tint.
- Do not over-saturate neutral surfaces.
- Do not assume white or black foreground text without a tokenized `on-*` pair.
- Do not invent semantic colors outside observed or required product states without marking them inferred.

## Type Restraints

- Do not use display typography for normal UI labels.
- Do not make all text bold.
- Do not reduce primary text contrast unless content is secondary or disabled.
- Preserve numeric hierarchy and alignment from the references.
- Do not flatten distinctive typographic lockups into generic heading/subheading stacks when the references show reusable hierarchy, spacing, alignment, or line-break behavior.

## Product-Specificity Restraints

- Use realistic domain data and labels when examples are needed.
- Avoid symmetrical placeholder data and generic dashboard metrics.
- Preserve concrete workflows over marketing copy.
