# Design Direction

<!--
Written by uiux-director into the target project's product-design/ folder.
- Headings and table headers stay in English. When the Document Language in DECISION_LOG.md is not English, append the translation in full-width parentheses. Write narrative content in the document language.
- Every entry carries a Confirmation value: `confirmed` or `unconfirmed`. Every `unconfirmed` entry is also listed under Open Questions in DECISION_LOG.md.
- A decision is made when it can be written as one sentence that names a source or an audience reason. "Clean and modern" is not a decision.
- anti-ai-style reads this file as the product's recorded Design Direction.
-->

## Direction Summary

<One sentence that ties the look and feel to the primary audience and core task.>

| Item | Answer |
| --- | --- |
| Chosen from | <candidate name(s) on product-design/direction-comparison.html, or "mixed: density of A, color of B"> |
| Confirmed | <YYYY-MM-DD, by whom> |

## Design Decisions

| # | Decision | Answer | Source or audience reason | Confirmation |
| --- | --- | --- | --- | --- |
| 1 | Genre | <what kind of screens; what the user does on them> | | |
| 2 | Content | <the real objects shown, typical count, the longest and the emptiest case> | | |
| 3 | Hierarchy | <the one element that leads on the core-task screen; what is second> | | |
| 4 | Density | See Density Profile | | |
| 5 | Type | See Material Design 3 Token Plan › Typescale | | |
| 6 | Color roles | See Material Design 3 Token Plan › System Color Roles | | |
| 7 | Surface | See Material Design 3 Token Plan › Surface And Elevation | | |
| 8 | Motion | See Material Design 3 Token Plan › Motion | | |

## Density Profile

| Item | Answer |
| --- | --- |
| Density level | <compact \| regular \| spacious> |
| Audience or task reason | <why this audience needs this density> |
| Confirmation | |

| Value | Setting | Material Design 3 term | Audience or task reason | Confirmation |
| --- | --- | --- | --- | --- |
| Spacing scale | <base unit and ladder in use> | spacing ladder labels in use | | |
| Gap between related elements | <px> | <e.g. gap-stack-xs> | | |
| Gap between sections | <px> | <e.g. 2xl> | | |
| Body text size / line height | <px / px> | <typescale role, e.g. body-large> | | |
| Maximum content width | <px or "full width"> | — | | |
| Primary items visible in first viewport | <count, at which viewport size> | — | | |
| Component height density | <default or tighter> | M3 density scale <0 \| -1 \| -2 \| -3> | | |
| Layout margins | <px per window size class> | window size class margins | | |

## Material Design 3 Token Plan

Material Design 3 is the method here, not the look. Every value below traces to evidence, the PM's explicit choice, or an audience reason.

| Item | Answer |
| --- | --- |
| Token system in the target | <none \| MD3 (`--md-*`) \| other: name and file> |
| Naming | <`--md-ref-*` / `--md-sys-*` / `--md-comp-*`, or the target's existing convention> |
| Figma naming | <`ref/` / `sys/` / `comp/`, or "no Figma file"> |
| Palette source | <Material Theme Builder export, @material/material-color-utilities with version, or designer-supplied file> |

### Key Colors

| Key color | Value | Source or audience reason | Confirmation |
| --- | --- | --- | --- |
| primary | <hex> | | |
| secondary | <hex or "derived from primary"> | | |
| tertiary | <hex or "not used"> | | |
| neutral | <hex or "derived"> | | |
| neutral-variant | <hex or "derived"> | | |
| error | <hex or "derived"> | | |

### System Color Roles

| Role | Light value or alias | Dark value or alias | Meaning in this product | Confirmation |
| --- | --- | --- | --- | --- |
| primary | <e.g. var(--md-ref-palette-primary-40)> | | <the one action color; where it never appears> | |
| on-primary | | | | |
| primary-container | | | | |
| surface | | | | |
| surface-container | | | | |
| on-surface | | | | |
| on-surface-variant | | | | |
| outline-variant | | | | |
| error | | | <only errors and destructive actions> | |

### Extension Roles

Domain meanings that the M3 roles do not cover. Never reuse `error` or `primary` for a domain meaning.

| Role | Value or alias | Domain meaning | Source | Confirmation |
| --- | --- | --- | --- | --- |
| <e.g. price-rise> | | | <URL or brand guide> | |

### Typescale

| Typeface role | Family | Source or reason | Confirmation |
| --- | --- | --- | --- |
| brand | <family, including the CJK face when the product shows Chinese text> | | |
| plain | | | |

| Typescale role | Used for | Size / line height | Confirmation |
| --- | --- | --- | --- |
| <e.g. title-large> | <screen titles> | | |
| <e.g. body-large> | <body text> | | |
| <e.g. label-large> | <buttons> | | |

### Shape

| Shape step | Used for | Confirmation |
| --- | --- | --- |
| <e.g. corner-small> | <inputs, chips> | |

### Surface And Elevation

One separation method per level.

| Level | Separation method | Surface role or elevation level | Confirmation |
| --- | --- | --- | --- |
| Page regions | | | |
| Sections | | | |
| Items in a list | | | |
| Layers above the page | | | |

### State Layers

| State | Opacity | Confirmation |
| --- | --- | --- |
| hover | <8 unless the evidence differs> | |
| focus | <10> | |
| pressed | <10> | |
| dragged | <16> | |

### Motion

| Change that animates | Duration and easing token | Confirmation |
| --- | --- | --- |
| <e.g. sheet opens> | | |

### Existing Token Mapping

Fill only when the target already has a token system that does not follow MD3. Map roles; do not create a parallel `--md-sys-*` system.

| MD3 role | Existing token | Note | Confirmation |
| --- | --- | --- | --- |
| <primary> | <existing token name> | <"no match" when none fits; list it as an open question> | |

## Not Doing

- <The two or three defaults most tempting for this product, and what is done instead.>
