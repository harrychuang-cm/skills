# Anti-AI Style Guide

[繁體中文](README.md) | English

`anti-ai-style` has an AI agent find the places where a UI looks AI-generated and replace each one with a decision that belongs to the product. By default it reviews and changes no files. The full instructions an agent reads are in [SKILL.md](SKILL.md); this page is the guide for people.

## The idea

A screen reads as generated when its visible choices were never made. Where the references, the content, or the brief left a gap, the most common answer was filled in: an indigo gradient, one large radius, a bordered card with a soft shadow, three equal feature tiles, a centered hero, "John Doe", "Seamlessly manage your workflow".

Each of these is harmless alone. Together, and with nobody having chosen them, they make the screen look generated.

The whole skill follows from two rules:

- **A pattern is judged by whether anything supports it, not by what it is.** A gradient the product's own design uses is evidence. The same gradient added to fill an empty area is a default.
- **Removal is half a fix.** A screen stripped down to gray boxes is the other default. Every fix names what replaces the tell: real content, a structure the content needs, or a treatment the design evidence shows.

## When to use it, and how to ask

One mode per request. When the request is ambiguous, the skill runs `review`.

| Situation | Mode | What you get | What to say |
| --- | --- | --- | --- |
| A screen exists and you want to know where it looks AI-made | `review` (default) | A report. No files change | Use $anti-ai-style to review src/pages/Dashboard.tsx. Review only. |
| You want the AI look removed | `fix` | The review, the applied fixes, and their verification | Use $anti-ai-style to fix the home page in ./prototype. Design evidence is in design-system/. |
| New UI is about to be generated | `prevent` | The decisions stated before generating, and a self-review before handing back | Before generating this screen, run $anti-ai-style in prevent mode. |
| A project needs its own rules file | `rules` | `design-system/ANTI_AI_STYLE_RULES.md` | Use $anti-ai-style in rules mode to write this project's rules file from design-system/. |

Invoke it as `/anti-ai-style` in Claude Code and Cursor, and as `$anti-ai-style` in Codex. Phrases such as "AI slop", "generic-looking", "looks vibe-coded", or 去 AI 味 also trigger it.

It works without a reference design: it first writes a short Design Direction and judges against that. For pixel comparison against a reference, use `ui-pixel-align-report` or `ui-compare-to-reference` instead.

## How a candidate is judged

Whether a pattern stays is decided by the first source below that speaks to it. A higher source overrides a lower one.

1. The project's rules: `design-system/ANTI_AI_STYLE_RULES.md` (including its Evidenced Exceptions), the design-system docs, and the tokens
2. Design evidence: Figma, reference screenshots, the existing product as rendered
3. Direction the user stated for this work, or a recorded Design Direction
4. The generic catalog in [references/tells.md](references/tells.md)

When the first three are all absent, a nine-line Design Direction is written first: genre, content, hierarchy, density, type, color roles, surface, motion, and what is not being done. Without it, a review can only report generic catalog matches, and has to say so. The template is in [references/decisions.md](references/decisions.md).

Every candidate gets one verdict:

| Verdict | Meaning | Action |
| --- | --- | --- |
| `evidenced` | A source shows this pattern in this role | Keep. Cite the source |
| `chosen` | The recorded direction calls for it | Keep. Cite the direction |
| `default` | Nothing supports it | Finding. Fix |
| `wrong genre` | The pattern belongs to a different kind of screen, such as a marketing hero on an app screen | Finding. Restructure, not restyle |
| `open` | A brand-level choice (primary color, typeface) with no evidence either way | Ask. Do not swap it on a guess |

Five tests settle the unclear cases:

- **Reason.** Can you state why the element is there, in terms of this product? "It looks modern" and "it feels premium" fail.
- **Swap.** Replace the product name with a competitor's. If the screen still works unchanged, nothing on it belongs to this product.
- **Removal.** Delete the element. If no information and no function is lost, it was decoration.
- **Squint.** Blur the screen. One element should lead and a second should follow. Equal weight everywhere means hierarchy was never decided.
- **Edge content.** Put in the longest real name, a zero, a negative, an empty list, an error. Does the layout hold?

## Workflow and fix order

1. **Resolve the target and the authority.** Name the screens, stories, files, or Figma frames in scope, and note which sources exist.
2. **Collect candidates.** Three places, each finding what the others miss: the source (the scanner), the rendered result, and the copy and data.
3. **Judge each candidate.** Three or more tells from one cluster on a screen mean it was built from a template. Rebuild it from decisions instead of patching tell by tell.
4. **Plan the fixes in decision order.** Write each replacement and its source before touching code.
5. **Apply.** Only `fix` mode changes files.
6. **Verify.** Re-run the scanner, look at the rendered result again, repeat the five tests, and check the screen did not end up blank.
7. **Report.** Written in the user's language.

Fixes always follow this order:

**genre → content → hierarchy → density → type → color → surface → decoration → motion**

Each layer decorates what the one before it decided. Polishing shadows while the data is still placeholder produces a well-finished placeholder.

The code layer has an order too: token or theme, shared component, composition, single page. A tell that repeats across screens is almost never a page-level fix. Changing a token or a shared component goes through the project's design-system approval gates (`ds-governance` when it is available).

The report contains the verdict, the findings (tell ID, location, what is there, verdict, replacement, the layer to fix), the patterns kept, open questions, the fix plan, verification, and what the review did not look at. Kept patterns are listed with their source so the next reviewer does not flag them again. The structure is in [references/review-report-template.md](references/review-report-template.md).

## The tell catalog

The catalog holds 41 tells in seven groups. Each has a stable ID, the decision it skipped, and what should replace it. The scanner can detect 18 of them from source; the rest are judged from the rendered result or by reading the content. The full catalog is [references/tells.md](references/tells.md).

| Group | Count | Examples | Covered by the scanner |
| --- | --- | --- | --- |
| C Content | 6 | Placeholder names, tidy symmetrical data, filler copy, happy path only, emoji as icons | C1, C3, C6 |
| L Layout | 6 | Wrong genre, everything in a card, equal-weight grids, centered everything, whitespace added to look premium | L4 |
| T Type | 7 | An unchosen default typeface, display type on UI labels, everything bold, washed-out text, gradient text | T1, T6 |
| K Color | 6 | Default indigo or violet, the accent as a global tint, generic semantics over domain semantics, translucent whites | K1, K6 |
| S Surface and shape | 6 | An outline on every card, nested outlined cards, border plus shadow plus large radius on one element, glassmorphism, glow | S3, S4, S5, S6 |
| D Decoration | 6 | Background gradients, blobs and waves, an icon in a tinted rounded square, decoration in place of product media, badge sprinkling | D1, D2, D3 |
| M Motion | 4 | `transition: all`, hover lift or scale, entrance animation on everything, ambient loops | M1, M2, M3 |

Domain meaning comes before generic meaning. In Taiwan market data, red is a rise and green is a fall; neither is error or success.

Tells arrive in groups, and the group says more than any single member. The catalog names four common clusters: Landing template, Default dashboard, Dark glass, and Soft everything.

To add or change a tell, edit only `references/tells.md`: take the next free ID in its group, never renumber, bump the version, and add a change-log line. Add a scanner rule and a test when the tell is mechanical. A rule that applies to one product belongs in that project's rules file, not in the catalog.

## The scanner and the project rules file

The scanner reads source and reports candidates for the 18 mechanical tells with `file:line`. A hit is a candidate, never a verdict.

```bash
node anti-ai-style/scripts/scan_ai_tells.mjs <ui source path> --rules design-system/ANTI_AI_STYLE_RULES.md
```

- `strong` candidates are rarely backed by evidence. `check` candidates are often legitimate and need the evidence to decide.
- `--rules`: tell IDs in the first column of the project file's `Evidenced Exceptions` table are reported as allowed. They stay visible so each use can be confirmed against its allowed scope.
- `--allow <ID,ID>` allows more IDs, `--json` prints machine-readable output, and `--strict` exits 1 while any `strong` candidate is not allowed.
- One-line exception: a comment `anti-ai-allow: D1 <reason>` on the same line or the line above.
- It reads CSS, SCSS, HTML, JSX, TSX, Vue, Svelte, and Astro, plus SwiftUI gradient and material calls and Compose gradient brushes.
- It cannot see values behind tokens, layout and hierarchy, images, or anything drawn at runtime. Judge those from the rendered result.
- It skips `node_modules`, build output, test files, and minified files.

The project rules file, `design-system/ANTI_AI_STYLE_RULES.md`, is the first source in the authority order. The generic catalog says what tends to go wrong anywhere. The project file says what must not go wrong here, and what looks like a tell but is the product's own. It has five parts:

| Section | Contents |
| --- | --- |
| Product Character | Two or three sentences on what the product is, what its screens are for, and how dense they are |
| Evidenced Exceptions | Patterns that match a tell and belong to the product: tell ID, pattern, allowed scope, evidence |
| Domain Semantics | Meanings a generic reading would get wrong, such as what red and green stand for |
| Do Not Add Unless Evidenced | The baseline restraints |
| Component Restraints | Rules tied to a named component. Most of the file's value is here |

A useful component rule names four things: the component, the generic version it tends to become, the measured specifics to preserve, and the evidence.

- Useful: Do not turn Realtime Quote Tile into a generic stock card or dashboard tile. Preserve the 170x148 tile, its density, and the bottom chart region.
- Weak: "Keep the UI clean and consistent." "Avoid AI-looking design." Neither can be checked, and both would be equally true in another product's file.

Rule-writing detail is in [references/project-rules.md](references/project-rules.md); the starter file is [assets/ANTI_AI_STYLE_RULES.template.md](assets/ANTI_AI_STYLE_RULES.template.md).

## What it will not do

- `review` mode changes no files.
- It does not remove a pattern the evidence shows, however much it resembles a tell.
- It does not replace one default with another. Swapping indigo for teal, or one fashionable typeface for the next, without a source is the same problem.
- It does not add personality for its own sake. Tilted stickers, hand-drawn underlines, and deliberate asymmetry are decoration with no source.
- It does not invent facts, customers, or metrics to make content feel real. Claims with no source are deleted, and sample data is labeled as sample data.
- It does not change a brand-level choice marked `open` without the user's answer.
- It does not own tokens or shared components. Changes to them go through the project's design-system approval gates.
- It does not compare a screen to a reference pixel by pixel.

## Files, install, and companion skills

| File | Purpose |
| --- | --- |
| `SKILL.md` | Workflow, the four modes, the verdict rules |
| `references/tells.md` | The tell catalog, currently version 1.0.0 |
| `references/decisions.md` | The eight decisions, the Design Direction template, the five tests, the over-correction traps |
| `references/project-rules.md` | How to write a project's rules file |
| `references/review-report-template.md` | The report structure |
| `assets/ANTI_AI_STYLE_RULES.template.md` | Starter project rules file |
| `scripts/scan_ai_tells.mjs` | The source scanner |
| `scripts/test_scan_ai_tells.test.mjs` | Scanner tests, run with `node --test` |

Install for Claude Code, Codex, and Cursor from the cm-skills repository root. Preview first, then install:

```bash
node scripts/install_agent_skills.mjs --agent all --scope user --skill anti-ai-style --dry-run
node scripts/install_agent_skills.mjs --agent all --scope user --skill anti-ai-style
```

Companion skills:

- `design-system-extractor`: writes the project rules file through this skill's `rules` mode during extraction. When this skill is not installed, the extractor uses its own baseline.
- `ds-governance`: owns the approval gates when a fix touches a token or a shared component.
- `ui-pixel-align-report` and `ui-compare-to-reference`: use these to compare against a reference item by item and repair the drift.
