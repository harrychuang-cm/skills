---
name: ui-pixel-align-report
description: >-
  Generate a design pixel alignment audit between an original design reference
  and an implemented UI, with per-issue screenshot evidence and a static HTML
  plus CSS report. Use when the user asks for design-to-implementation visual
  QA, pixel align documentation, Figma or screenshot comparison reports,
  captured incorrect styles, visual drift evidence, or handoff documentation
  before or alongside UI fixes.
---

# UI Pixel Align Report

Use this skill to compare an original design reference with an implemented UI and produce a durable design pixel alignment report. The primary output is evidence: full screenshots, focused issue crops, measured visual drift, ownership classification, and recommended fixes.

This skill documents visual drift first. Do not edit implementation code unless the user explicitly asks to apply fixes after or during the audit. If the task is only to fix a screen without a report, use `ui-compare-to-reference` instead.

## Inputs

Accept any combination of:

- **Design reference:** Figma URL, Figma node URL, design export, screenshot, image folder, or named design frame.
- **Implementation target:** live URL, route, Storybook URL, story file, page file, component file, or an inferred target.
- **Capture context:** viewport, device scale factor, theme, locale, branch, environment, auth state, or test data state.
- **Report destination:** default to `reports/design-pixel-align/<screen-or-component>/`.

Treat an explicit design reference plus implementation target as authoritative. Do not replace it with auto-discovery unless one side cannot be loaded.

## Workflow

1. Resolve the design source, implementation target, viewport, density, theme, and state to compare.
2. Discover the target project's styling system, tokens, shared components, routes, Storybook stories, and design guidance.
3. Capture or collect a full reference image and a full implementation image at the same viewport and state whenever possible.
4. Inspect the two surfaces and identify visual drift one finding at a time. Focus on incorrect styles: spacing, layout, typography, color, radius, border, shadow, elevation, iconography, imagery, responsive behavior, and visible interaction states.
5. For each finding, create focused evidence crops for the reference and implementation. Add a diff or overlay crop when practical.
6. Classify ownership before recommending a fix: `token/theme`, `primitive/shared component`, `component variant/props`, `composition`, or `page-only`.
7. Write a `findings.json` file and generate the static report with `scripts/generate_report.mjs`.
8. Open or inspect the generated `index.html` and verify that links, images, metadata, and finding details render correctly.

## Finding Rules

- Record one visual problem per finding. Split unrelated problems even when they appear in the same UI block.
- Preserve original design links. For Figma, include the frame or node URL in `source.designUrl` and per-finding `designReference` when available.
- Use concrete deltas when possible: `+8px top padding`, `font 16px expected vs 14px actual`, `radius 12px expected vs 8px actual`, `color expected #111827 vs #1f2937`.
- Prefer token names over raw values when the target project has tokens.
- Keep recommended fixes implementation-aware: cite likely files, components, props, variants, or tokens.
- Mark severity by user impact:
  - `high`: visible layout break, wrong hierarchy, clipped/overlapping content, or brand-critical mismatch.
  - `medium`: noticeable spacing, typography, color, or component-state drift.
  - `low`: small polish issue that does not change comprehension or task flow.
- If no drift is found, still generate a report with full screenshots, comparison metadata, and an empty findings list.

## Findings JSON

Create a JSON file using this shape. Paths may be absolute or relative to the JSON file.

```json
{
  "title": "Dashboard Design Pixel Align",
  "summary": "Reference Figma frame compared with localhost dashboard at 1440x900 light theme.",
  "source": {
    "designName": "Dashboard / Desktop",
    "designUrl": "https://www.figma.com/design/file?node-id=1-2",
    "implementationName": "Dashboard route",
    "implementationUrl": "http://localhost:3000/dashboard",
    "route": "/dashboard",
    "viewport": "1440x900",
    "theme": "light",
    "capturedAt": "2026-06-17T10:00:00Z"
  },
  "screenshots": {
    "reference": "captures/reference-full.png",
    "implementation": "captures/implementation-full.png",
    "diff": "captures/full-diff.png"
  },
  "findings": [
    {
      "id": "PA-001",
      "severity": "high",
      "block": "Portfolio summary card",
      "ownership": "primitive/shared component",
      "status": "open",
      "expected": "Card radius is 12px and horizontal padding is 24px.",
      "actual": "Rendered card radius is 8px and horizontal padding is 16px.",
      "delta": ["radius -4px", "horizontal padding -8px"],
      "recommendedFix": "Update the SummaryCard medium variant to use the existing surface radius and spacing token.",
      "designReference": "https://www.figma.com/design/file?node-id=4-8",
      "implementationReference": "src/components/SummaryCard.tsx",
      "tokens": ["--sys-radius-lg", "--sys-space-6"],
      "files": ["src/components/SummaryCard.tsx", "src/tokens.css"],
      "assets": {
        "reference": "captures/pa-001-reference.png",
        "implementation": "captures/pa-001-implementation.png",
        "diff": "captures/pa-001-diff.png"
      }
    }
  ]
}
```

## Report Generation

Run the bundled generator after writing `findings.json`:

```sh
node <skill-root>/scripts/generate_report.mjs \
  --input reports/design-pixel-align/dashboard/findings.json \
  --output reports/design-pixel-align/dashboard
```

The generator creates:

- `index.html`
- `styles.css`
- `assets/` with copied local screenshots referenced by the JSON

Use `--title "Custom title"` to override the JSON title. Use `--no-copy-assets` only when the referenced image paths are already stable relative to the report.

## Report Quality Bar

- The report must include the original design link or explain why no source link exists.
- The report must include the implementation target: URL, route, story, or source file.
- Every finding should have at least a reference crop and implementation crop unless the source cannot be captured.
- Every finding should include expected, actual, delta, ownership, severity, and recommended fix.
- The HTML should be self-contained except for local image assets and external source links.
- The generated report should be reviewable without private conversation context.

## Validation

Before finishing:

1. Confirm `index.html`, `styles.css`, and copied assets exist.
2. Open or inspect `index.html` and verify that all image references resolve.
3. Check that the design URL, implementation URL or file, viewport, theme, and capture date are visible.
4. Confirm findings are sorted in a useful review order, usually high severity first and top-to-bottom screen order within the same severity.
5. If fixes were also applied, run the target project's cheapest reliable validation and note which findings were fixed versus left open.
