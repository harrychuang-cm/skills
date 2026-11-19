---
name: anti-ai-style
description: "Remove and prevent the generic AI-generated look in UI and visual design. Review screens, prototypes, Storybook stories, static HTML pages, Figma frames, or design-system docs for AI tells (unchosen gradients, glassmorphism, stacked border-shadow-radius cards, inflated whitespace, default indigo or violet palettes, emoji icons, symmetrical placeholder data, filler marketing copy, decoration standing in for product content), then replace each default with a decision backed by design evidence, real content, or a stated direction. Use before generating UI, when reviewing or fixing UI that looks AI-made, templated, or vibe-coded, when writing a project's design-system/ANTI_AI_STYLE_RULES.md, or when the user says 去 AI 味, AI 感, 很 AI, 罐頭感, 模板感, anti-AI, AI slop, or generic-looking. Ships a tell catalog with stable IDs, a source scanner for mechanical tells, a project rules template, and a review report format."
---

# Anti-AI Style

Find the places where a design looks generated, and replace each one with a decision that belongs to the product.

## What The AI Look Is

A screen reads as generated when its visible choices were never made. Wherever the references, the content, or the brief left a gap, the most common answer was filled in: an indigo gradient, one large radius, a soft shadow on a bordered card, three equal feature tiles, a centered hero, "John Doe", "Seamlessly manage your workflow". Each is harmless alone. Together and unchosen, they are the tell.

Two rules follow, and the rest of this skill applies them:

- **A pattern is a tell because nothing supports it, not because of what it is.** A gradient the product's own design uses is evidence. The same gradient added to fill an empty area is a default. Judge every candidate by whether it traces to a source.
- **Removal is half a fix.** A screen stripped down to gray boxes is the other default. Every fix names what replaces the tell: real content, a structure the content needs, or a treatment the evidence shows.

## Loading And Scope

- The maintained source is `anti-ai-style/` in the cm-skills repository. Reading this `SKILL.md` directly is sufficient in any agent. Resolve the `references/`, `assets/`, and `scripts/` paths relative to this file, not the product working directory.
- This skill owns the judgment about generic-looking design. It does not own tokens or shared components: a fix that changes a token, a theme, or a shared component API goes through the project's design-system rules (`ds-governance` when it is available), including its approval gates.
- It does not compare a screen to a reference pixel by pixel; that is `ui-pixel-align-report` and `ui-compare-to-reference`. Use this skill when the question is "does this look like nobody decided it", including when no reference exists.
- No other skill, MCP connection, or browser tool is a prerequisite. Use what the host exposes to render and capture UI; when the rendered result cannot be seen, say so and limit the verdict to what the source shows.

## Authority

Whether a pattern stays is decided by the first source that speaks to it:

1. The project's rules: `design-system/ANTI_AI_STYLE_RULES.md` (including its Evidenced Exceptions) and the design-system docs and tokens.
2. Design evidence: Figma, reference screenshots, the existing product as rendered.
3. Direction the user stated for this work, or a recorded Design Direction.
4. The generic catalog in [references/tells.md](references/tells.md).

A higher source overrides a lower one. If sources 1 to 3 are all absent, the work is in **direction mode**: write a Design Direction first ([references/decisions.md](references/decisions.md)), get it confirmed when the user is available, and judge against it. Without one, a review can only report generic catalog matches and must say that.

## Modes

Resolve one mode per request.

| Mode | When | Output |
| --- | --- | --- |
| `review` | An existing UI and a question about how it looks. The default when the request is ambiguous. | A report. No files change. |
| `fix` | The user asks to remove, repair, or optimize the AI look. | The review, then the applied fixes and their verification. |
| `prevent` | New UI is about to be generated, in this skill or as a step of another one. | The decisions stated up front, then a self-review of the result before it is handed back. |
| `rules` | A project needs its own `design-system/ANTI_AI_STYLE_RULES.md`, or the existing one needs new rules. | The project rules file, written from evidence. |

## Workflow

### 1. Resolve the target and the authority

Name the exact screens, stories, files, or frames in scope. Read the sources in the authority order and note which ones exist. Record the mode: evidence or direction.

### 2. Collect candidates

Collect from three places; each finds things the others miss.

- **Source.** Run the scanner on the UI source:

  ```bash
  node <skill>/scripts/scan_ai_tells.mjs <path...> [--rules design-system/ANTI_AI_STYLE_RULES.md]
  ```

  It reports candidates for the mechanical tells with `file:line`. `strong` candidates are rarely supported by evidence; `check` candidates often are. The scanner reads web source, plus SwiftUI gradient and material calls and Compose gradient brushes. It cannot see values hidden behind tokens, and it cannot see layout.
- **Rendered result.** Look at the screen as rendered: a screenshot, a running page, a Storybook story, a simulator capture, or a Figma frame. Walk the `eye` tells in [references/tells.md](references/tells.md). For Figma, read fills, effects, corner radii, and text styles from the node data; the same IDs apply.
- **Content.** Read the copy and the data as a user of the product would. Check the C tells: placeholder names, tidy numbers, filler sentences, missing states.

### 3. Judge each candidate

Give every candidate one verdict:

| Verdict | Meaning | Action |
| --- | --- | --- |
| `evidenced` | A source in the authority order shows this pattern in this role. | Keep. Cite the source. |
| `chosen` | The recorded direction calls for it. | Keep. Cite the direction. |
| `default` | Nothing supports it. | Finding. Fix. |
| `wrong genre` | The pattern belongs to a different kind of screen. | Finding. Restructure, not restyle. |
| `open` | A brand-level choice (primary color, typeface) with no evidence either way. | Ask; do not swap it on a guess. |

When the verdict is unclear, apply the tests in [references/decisions.md](references/decisions.md): reason, swap, removal, squint, edge content. Three or more tells from one cluster in the catalog mean the screen was built from a template; plan to rebuild it from decisions instead of patching tell by tell.

### 4. Plan the fixes in decision order

Fix in this order, because each layer decorates what the one before it decided:

**genre → content → hierarchy → density → type → color → surface → decoration → motion**

Polishing surfaces on placeholder content produces a polished placeholder. For every finding, write the replacement before touching code, and name where it comes from.

### 5. Apply (fix mode only)

- Apply at the right code layer: token or theme first, then shared component, then composition, then the single page. A tell that repeats across screens is almost never a page-level fix.
- Changing a token, a theme value, or a shared component follows the project's approval gates. Carry forward approval the user already gave for the same change; ask for anything broader.
- Replace content with the project's own fixtures or domain data when they exist. Otherwise write sample data that is realistic for the domain and locale, uneven on purpose, and say that it is sample data. Delete factual claims that have no source (customer counts, performance numbers); do not invent replacements.
- Leave `evidenced`, `chosen`, and `open` items alone.

### 6. Verify

Re-run the scanner, look at the rendered result again, and repeat the five tests on the changed screens. Check that the fix did not create the opposite problem: a blank, undifferentiated screen. Report what was rendered and what was only read from source.

### 7. Report

Follow [references/review-report-template.md](references/review-report-template.md). Write the report in the user's language. Every finding carries its tell ID, its location or screenshot region, the verdict, and the replacement. Kept patterns are listed with their source so the next reviewer does not flag them again.

## Prevent Mode

Before generating UI:

1. Read the authority sources. In evidence mode, extract the answers to the eight decisions in [references/decisions.md](references/decisions.md) from them. In direction mode, write the Design Direction.
2. State the decisions in a few lines before building. A decision that cannot be stated is a gap a default will fill.
3. Build with real or realistic content from the first draft. Do not lay out with placeholder text and swap it later; the layout will have been shaped by the placeholder.
4. Review the result with steps 2 to 4 above before handing it back, and fix what is found.

## Rules Mode

Write or update the project's `design-system/ANTI_AI_STYLE_RULES.md` by following [references/project-rules.md](references/project-rules.md), starting from [assets/ANTI_AI_STYLE_RULES.template.md](assets/ANTI_AI_STYLE_RULES.template.md) when the file does not exist. `design-system-extractor` calls for this at its composition step; the same file is what the scanner reads with `--rules`.

## Catalog Changes

The catalog changes as defaults change. When the user names a new tell, changes one, or says one does not apply:

1. Edit only [references/tells.md](references/tells.md): add the tell under its group with the next free ID, or amend the row, or mark it retired with the date and reason. Never renumber.
2. Bump the catalog version and add a line to its change log.
3. If the tell is mechanical and cheap to detect, add a rule and a test to the scanner; otherwise mark it `eye`.
4. A rule that applies to one product belongs in that project's rules file, not in the catalog.

## Stops

- `review` mode changes nothing.
- Do not remove a pattern the evidence shows, however much it resembles a tell.
- Do not replace one default with another: swapping indigo for teal, or one fashionable typeface for the next, without a source is the same problem.
- Do not add personality for its own sake. Rotated stickers, hand-drawn underlines, and deliberate asymmetry added to look human are decoration with no source.
- Do not invent facts, customers, or metrics to make content feel real.
- Do not change a brand-level choice marked `open` without the user's answer.

## Resource Map

- [references/tells.md](references/tells.md): the tell catalog — IDs, the decision each tell skipped, the replacement, and scanner coverage.
- [references/decisions.md](references/decisions.md): the eight decisions, the Design Direction template, the five tests, and the over-correction traps.
- [references/project-rules.md](references/project-rules.md): how to write a project's `ANTI_AI_STYLE_RULES.md`.
- [references/review-report-template.md](references/review-report-template.md): the report structure.
- [assets/ANTI_AI_STYLE_RULES.template.md](assets/ANTI_AI_STYLE_RULES.template.md): starter project rules file.
- `scripts/scan_ai_tells.mjs`: source scanner; `--rules` honors a project's Evidenced Exceptions, `--json` for machine output, `--strict` exits non-zero on unsupported `strong` candidates.
- `scripts/test_scan_ai_tells.test.mjs`: scanner tests (`node --test`).
