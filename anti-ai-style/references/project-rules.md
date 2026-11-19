# Writing A Project's Anti-AI Style Rules

Use this reference in `rules` mode, when writing or updating `design-system/ANTI_AI_STYLE_RULES.md` for a product. Start from `assets/ANTI_AI_STYLE_RULES.template.md` when the file does not exist; update in place when it does.

The generic catalog ([tells.md](tells.md)) says what tends to go wrong anywhere. The project file says what must not go wrong here, and what looks like a tell but is the product's own. Agents working on the product read the project file before recommending or implementing UI; it is the first source in the authority order.

## What Goes In The File

### 1. Product character

Two or three sentences on what kind of product this is and what its screens are for, taken from the evidence. This is the answer to the genre and density decisions, written once so every rule below can be read against it. Example: "A dense market-data app. Screens are scanned, not read; rows are compact and full width."

### 2. Evidenced exceptions

Patterns that match a catalog tell and are part of this product. One row each, with the tell ID first:

```markdown
## Evidenced Exceptions

| Tell | Pattern | Allowed where | Evidence |
| --- | --- | --- | --- |
| D1 | Yellow two-stop gradient | Promotional Badge only | Figma node 2114:8830 |
| S5 | Background blur | iOS tab bar and navigation bar | product-screenshots/home-ios.png |
```

The scanner (`--rules`) reads this table and stops reporting those IDs as findings. It cannot check "Allowed where"; reviewers still confirm each use sits inside its allowed scope. Keep the scope narrow: an exception for one component is not permission everywhere.

### 3. Domain semantics

Meanings a generic reading would get wrong: what red and green mean, which color is reserved for which action, what a symbol or a badge stands for. State the meaning and the wrong reading together: "Red means a rise and green a fall in market data; neither is error or success."

### 4. Restraints

The rules themselves, grouped. Use the catalog's groups as the baseline (content, layout, type, color, surface, decoration, motion) and keep only the ones this product can actually violate.

Baseline restraints, to be rewritten in the project's terms:

- No background gradients, glow, blobs, waves, glassmorphism, or illustration panels beyond the evidenced exceptions.
- No concrete product media replaced by abstract decoration.
- No marketing hero or landing structure on app screens.
- No outline on every card, no outlined cards inside outlined cards, no card per row unless the references use rows as cards.
- No whitespace added to look premium; dense screens stay dense.
- No accent color spread into a global tint; no neutrals pushed toward saturation.
- No foreground color assumed without a tokenized `on-*` pair; no semantic color invented without being marked inferred.
- No display type on ordinary UI labels; no blanket bold; no lowered contrast on primary text.
- No distinctive typographic lockup flattened into a heading-and-subheading stack.
- Numeric hierarchy and alignment preserved as in the references.
- Realistic domain data and labels in every example; no symmetrical placeholder data.

### 5. Component restraints

Rules tied to a named component or screen. This section is where most of the file's value is.

## Writing A Rule

A useful rule names four things: the component, the generic thing it tends to be turned into, the specifics that make it itself, and the evidence.

Pattern:

> Do not turn **<component>** into **<the generic version>**. Preserve **<measured specifics>**. (Evidence: **<source>**)

Good:

> Do not turn Realtime Quote Tile into a generic stock card or dashboard tile. Preserve the 170x148 tile, its density, and the bottom chart region. (Evidence: Figma node 1840:2211)

> Do not style the event filter dropdown as a rounded chip group or segmented control; the observed control is a single compact trigger.

Weak:

> Keep the UI clean and consistent.

> Avoid AI-looking design.

The weak versions cannot be checked and name nothing. If a rule would be equally true in another product's file, it belongs in the catalog or nowhere.

Further rules of thumb:

- Write a rule when the evidence shows something a default would overwrite: an unusual size, a missing affordance, a color with a local meaning, a state that looks unfinished but is intended.
- Record what was **not** observed as a limit: "Do not infer loading or disabled states for Stock Card; only default and bullish variants are evidenced." A missing state is where invention starts.
- Do not write rules for things nobody would do. The file is read before every UI task; length costs attention.
- When the file passes about thirty component rules, group them under a heading per component so a task can read only the section it touches.
- When a rule exists because of a past mistake, say so in a few words. It tells the next reader the rule is load-bearing.

## Keeping It Current

- A new authoritative source (a Figma file arriving after screenshots) can turn an inferred rule into an evidenced one, or contradict it. Update the rule and its evidence, do not append a second rule.
- When a review in this skill finds the same default twice in one product, add a component restraint for it.
- When a pattern is approved as part of the product, move it to Evidenced Exceptions with its scope.
- Remove rules for components that no longer exist.
