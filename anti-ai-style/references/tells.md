# Tell Catalog

Version 1.0.0

Each tell is a place where a default answered a question nobody asked. IDs are stable: cite them in reports, in project rules, and in scanner allow-lists. Never renumber; retire an ID by marking it retired.

How to read the tables:

- **Skipped decision**: what should have been decided and was not. The fix has to supply it.
- **Replace with**: the direction of the fix. The project's evidence overrides it.
- **Scan**: `strong` or `check` when `scripts/scan_ai_tells.mjs` reports candidates for the tell; `eye` when it can only be judged from the rendered result or by reading the content.

`strong` candidates are rarely backed by evidence. `check` candidates are often legitimate and become findings only when nothing in the authority order supports them. A scanner hit is a candidate, never a verdict.

## C — Content

| ID | Tell | Skipped decision | Replace with | Scan |
| --- | --- | --- | --- | --- |
| C1 | Placeholder identities: John Doe, Jane Smith, Acme Corp, Lorem ipsum, 王小明 | Who uses this product and what they call things | Names, organizations, and labels from the product's domain and locale; the project's fixtures when they exist | strong |
| C2 | Symmetrical data: every card has the same text length, every number is round or tidy (12,345 / +12.5%), there are three of everything | What real records look like | Uneven lengths, one long name that wraps or truncates, zeros and negatives, values formatted by the domain's conventions | eye |
| C3 | Filler copy: "Seamlessly", "Elevate", "Unlock the power of", 一站式, 賦能, 全方位. Sentences true of any product | What this screen has to tell this user | The domain's nouns and verbs. Delete any sentence that survives swapping in a competitor's name | check |
| C4 | Over-explanation: every section has a heading, a subheading, and a helper line; captions restate their labels | Whether the user needs the sentence | One label per thing. Helper text only where a mistake is likely | eye |
| C5 | Happy path only: no empty, loading, error, long-content, or permission state | What happens when data is missing or wrong | The states the product reaches. In a review, name the absent ones | eye |
| C6 | Emoji as icons, bullets, or heading decoration | What the icon system is | The project's icon set, or plain text. Emoji only inside user-generated content | strong |

## L — Layout

| ID | Tell | Skipped decision | Replace with | Scan |
| --- | --- | --- | --- | --- |
| L1 | Wrong genre: a landing-page hero on an app screen; a dense tool restyled as a marketing page; a list turned into a "dashboard" | What kind of screen this is and what the user does on it | The shell the task needs: app bar and content for an app, a table for comparison, a form for input | eye |
| L2 | Card-ification: each row or section in its own card; card grids where a list or table carries the data better | How the items relate to each other | Lists with dividers, tables with aligned columns, sections separated by space and a heading | eye |
| L3 | Equal-weight grid: three or four identical tiles (icon, title, two lines) and nothing primary | What matters most on this screen | One primary element sized to its importance; secondary items visibly quieter | eye |
| L4 | Centered everything: centered headings, centered body text, centered cards | Where the reading edge is | A start edge for anything read as text; center only short standalone items | check |
| L5 | Inflated whitespace: large padding to look premium on a screen people work in | How much the user has to see at once | The density the references show. Operational screens stay dense | eye |
| L6 | One section recipe repeated: eyebrow, heading, subheading, grid, again and again down the page | What each section is for | Sections shaped by their content; different content gets a different structure | eye |

## T — Type

| ID | Tell | Skipped decision | Replace with | Scan |
| --- | --- | --- | --- | --- |
| T1 | Unchosen typeface: Inter, Poppins, Space Grotesk, or a similar default with no source | What the product's type is | The evidenced family. For CJK products, the platform or brand CJK face first, then a Latin pairing chosen to sit with it | check |
| T2 | Display type on UI labels: oversized, tight-tracked headings inside working screens | The type scale for UI roles | Display sizes only for the lockups the references show | eye |
| T3 | Weight inflation: everything semibold or bold | Which text leads | Regular as the base; weight reserved for the one or two roles the evidence emphasizes | eye |
| T4 | Washed-out text: mid-gray body and labels, low-contrast primary content | The contrast each text role needs | Full-contrast primary text; reduced contrast only for secondary and disabled roles | eye |
| T5 | Flattened lockups: a distinctive title, metric, or quote composition reduced to heading plus subheading | Whether the composition is a reusable pattern | Keep the evidenced hierarchy, spacing, alignment, and line breaks as a component | eye |
| T6 | Gradient text | How emphasis is shown | Size, weight, or the single accent color | strong |
| T7 | Lost numeric structure: proportional figures in columns, unaligned decimals, numbers set like prose | How numbers are compared | Tabular figures, end alignment, fixed columns, the domain's sign and color conventions | eye |

## K — Color

| ID | Tell | Skipped decision | Replace with | Scan |
| --- | --- | --- | --- | --- |
| K1 | Default indigo, violet, or purple as the brand color | What the brand color is | The evidenced palette. If the brand really sits in that range, record it under Evidenced Exceptions | check |
| K2 | Accent as a global tint: accent-colored backgrounds, borders, icons, and headings all at once | What the accent is reserved for | Named roles for the accent (primary action, selection); neutral everywhere else | eye |
| K3 | Generic semantics over domain semantics: red is always error, green is always success | What colors mean in this domain | The domain's meaning first. In Taiwan market data, red is up and green is down | eye |
| K4 | Tinted neutrals: surfaces and grays carrying the accent hue, or neutrals pushed toward saturation | What the neutral scale is | The evidenced neutral ramp; tint only where it was sampled from the references | eye |
| K5 | Assumed foregrounds: white or black text placed on a color with no paired token | Which foreground goes with which surface | An `on-*` pair for every filled surface, contrast checked | eye |
| K6 | Translucent whites: `white/10` surfaces and borders, low-alpha overlays standing in for a surface scale | What the surface steps are | Opaque surface and border tokens for each step | check |

## S — Surface And Shape

| ID | Tell | Skipped decision | Replace with | Scan |
| --- | --- | --- | --- | --- |
| S1 | An outline on every card | How groups are separated | One separation method per level: spacing, a surface step, or a divider | eye |
| S2 | Outlined cards nested inside outlined cards | How many levels of grouping exist | At most one framed level; inner groups use spacing or dividers | eye |
| S3 | The stacked card: border, shadow, and large radius on the same element | Which single cue lifts this surface | One cue (border, or shadow, or surface contrast), as the references show | check |
| S4 | One large radius on everything | The shape scale | Radii by role (control, container, sheet) from evidence; square where the references are square | check |
| S5 | Glassmorphism: backdrop blur, frosted panels | What the surface is made of | Opaque surfaces; blur only where the platform chrome or the references use it | strong |
| S6 | Glow: colored shadows, large zero-offset shadows, a soft shadow on every element | What elevation means here | An elevation scale with few steps and a neutral shadow color, used only for layers that float | check |

## D — Decoration

| ID | Tell | Skipped decision | Replace with | Scan |
| --- | --- | --- | --- | --- |
| D1 | A background gradient filling a hero, card, or button | What the surface color is | A flat token color; a gradient only where sampled from the references | check |
| D2 | Blobs, orbs, waves, mesh, noise, grid or dot backgrounds | What belongs in that space | Product content, or nothing | strong |
| D3 | An icon in a tinted rounded square heading a tile | Whether the icon carries information | Remove it, or show the real object: a number, a thumbnail, a status | check |
| D4 | Decoration in place of product media: abstract illustration, stock art, a fake chart | What the product looks like | Real screenshots, charts drawn from real or realistic data, real media | eye |
| D5 | Badge sprinkling: pills and "New" tags on many items | Which state is worth marking | Badges only for states the product tracks | eye |
| D6 | An icon beside every label | Which labels need an icon | Icons where they speed recognition in a repeated list, or are the control itself | eye |

## M — Motion

| ID | Tell | Skipped decision | Replace with | Scan |
| --- | --- | --- | --- | --- |
| M1 | `transition: all` | Which property changes | Named properties with token durations | check |
| M2 | Hover lift or scale on cards and buttons | What feedback a pointer needs | A color or surface-step change; movement only for elements that drag or elevate | check |
| M3 | Entrance animation on everything: fade-up on scroll | What the motion explains | Motion for state changes and spatial transitions; content that is simply present does not animate in | check |
| M4 | Ambient loops: floating, pulsing, shimmering decoration | Whether anything is happening | Loops only for progress the system is making | eye |

## Clusters

Tells arrive in groups, and the group is a stronger signal than any member. Three or more tells from one cluster on the same screen mean the screen came from a template; rebuild it from the decisions in [decisions.md](decisions.md) instead of patching each tell.

| Cluster | Members |
| --- | --- |
| Landing template | L1, D1, T6, L3, D3, C3, L6 |
| Default dashboard | L2, S3, S4, C2, D5, K1 |
| Dark glass | S5, K6, S6, D2 |
| Soft everything | S4, S6, L5, T4, M2 |

## What The Scanner Does Not See

- Values behind tokens: `var(--radius-card)` hides a 24px radius, and a purple brand ramp in a token file is reported once per value, not once per use.
- Layout tells (L1, L2, L3, L5, L6) and everything about hierarchy.
- Images, canvases, and anything drawn at runtime.
- Native UI beyond SwiftUI gradient and material calls and Compose gradient brushes.

Judge these from the rendered result.

## Change Log

- 1.0.0 (2026-11-19): First catalog. Carries over the restraint groups from `design-system-extractor/references/anti-ai-style-rules.md` (decoration, surface, density, color, type, product specificity), gives each a stable ID and its skipped decision, and adds content, motion, and cluster tells.
