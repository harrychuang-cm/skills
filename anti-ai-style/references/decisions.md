# From Defaults To Decisions

A tell marks a decision nobody made. The fix is to make it. This file lists the decisions a screen needs, where each answer comes from, the tests that separate a default from a choice, and the ways a fix goes wrong.

## The Eight Decisions

Make them in this order. Each one constrains the next, and a later decision cannot repair an earlier one that was skipped.

| # | Decision | The question | In evidence mode, read it from | Tells that appear when it is skipped |
| --- | --- | --- | --- | --- |
| 1 | Genre | What kind of screen is this, and what does the user do on it? | The product's existing screens of the same kind; the flow the screen sits in | L1, L6 |
| 2 | Content | What real things appear here, in what quantity, with what extremes? | Project fixtures, production screenshots, the data spec | C1, C2, C3, C4, C5, D4 |
| 3 | Hierarchy | What is the one thing the eye lands on first, and what is second? | The references' largest and highest-contrast element per screen | L3, L4, T3, K2, D5, D6 |
| 4 | Density | How much has to be visible without scrolling? | Row heights, gaps, and items per viewport in the references | L5, L2 |
| 5 | Type | Which family, which scale, which roles get weight? | Measured text styles; the CJK face and its Latin pairing | T1, T2, T4, T5, T6, T7 |
| 6 | Color roles | What is each color for, and what does it mean in this domain? | Token roles; where the accent appears and where it never does | K1, K3, K4, K5, K6 |
| 7 | Surface | How are groups separated and layers lifted? | Whether the references use spacing, dividers, surface steps, borders, or shadow, and at which level | S1, S2, S3, S4, S5, S6, D1, D2, D3 |
| 8 | Motion | What changes need explaining? | Existing transitions and their durations | M1, M2, M3, M4 |

A decision is made when it can be written as one sentence that names a source. "Rows are 44px and separated by dividers, as in the watchlist screens" is a decision. "Clean, modern cards" is not.

## Design Direction

In direction mode there is no evidence to read from, so the decisions are written down before anything is built or judged. Keep it to one line per decision. Confirm it with the user when they are available; when they are not, record it as an assumption at the top of the work.

```markdown
## Design Direction

- Genre: <what kind of screen, what the user does on it>
- Content: <the real objects shown, their typical count, the longest and the emptiest case>
- Hierarchy: <the one element that leads; what is second>
- Density: <compact, regular, or spacious, and why this audience needs it>
- Type: <family and source; base size; which roles get weight>
- Color roles: <neutral base; the one accent and what it is reserved for; domain meanings>
- Surface: <the one separation method per level; whether anything is elevated>
- Motion: <which state changes animate; everything else is still>
- Not doing: <the two or three defaults most tempting for this screen>
```

The last line matters. Naming the tempting defaults in advance is what keeps them from arriving unannounced.

Where direction choices come from, in order of preference: the user's product and audience, the platform's conventions (iOS, Android, the desktop OS), the conventions of the domain (finance, medical, developer tools), and only then taste. A choice justified only by "looks modern" or "feels premium" is a default with a reason attached afterward.

## The Five Tests

Use these when a candidate's verdict is unclear.

**Reason.** State why the element is there, in terms of this product. "It separates the order summary from the line items" passes. "It adds visual interest", "it looks modern", and "it feels premium" fail.

**Swap.** Replace the product name and logo with a competitor's, or with a product from another industry. If the screen still works unchanged, nothing on it belongs to this product. Apply the same test to a single sentence of copy.

**Removal.** Delete the element. If no information and no function is lost, it was decoration. If the screen then looks empty, the problem is the content, and decoration was covering for it.

**Squint.** Blur the screen or step back from it. One element should lead and a second should follow. If everything has the same weight, the hierarchy decision was skipped. If the element that leads is decorative, it was made in the wrong place.

**Edge content.** Put in the longest real name, a zero, a negative, an empty list, an error. A layout that only holds its shape with tidy sample data was designed around the sample.

## Making The Hard Fixes

### Content first

- Take data from the project's fixtures, a data spec, or production screenshots before writing any.
- When sample data has to be written, make it uneven: different lengths, one value that is long enough to wrap or truncate, at least one zero or empty field, numbers that are not round.
- Format by the domain and locale: currency and digit grouping, date style, name order, units. A Taiwan stock list shows four-digit symbols and red for a rise.
- A label is a noun or a verb from the domain. Remove adjectives. Remove any sentence that says what the user can already see.
- A factual claim needs a source. Without one, delete the claim; do not write a more plausible number.

### Hierarchy

- Choose the lead element from the task: the number the user came to read, the action they came to take.
- Create the difference with one or two properties (size and weight, or size and color), not all of them.
- Make the rest quieter instead of making the lead louder. Most screens that lack hierarchy have too many loud elements, not too few.

### Separation

Pick one method per level of grouping and hold it:

| Level | Usual method |
| --- | --- |
| Page regions | Surface step or a full-width divider |
| Sections | Space and a heading |
| Items in a list | Divider or space, not a frame per item |
| A layer above the page (menu, sheet, dialog) | Elevation, and only here |

A border and a shadow and a tinted fill on the same element are three answers to one question.

### Color

- Start neutral. Add the accent only to the roles written in the direction.
- A semantic color means what the domain says it means. Check before reusing red and green.
- Replace opacity-derived colors with opaque tokens, so the same surface looks the same on every background.

## Over-Correction Traps

- **Gray boxes.** Every tell is removed and nothing replaces it. The screen is now a wireframe, which is a default of its own. Each removal needs its replacement written first.
- **Erasing evidence.** A gradient, a blur, or a purple the product really uses is removed because it resembles a tell. The authority order exists to prevent this.
- **Default for default.** Indigo becomes teal, Inter becomes another fashionable grotesque, rounded becomes sharp. Nothing was decided; the default was only changed.
- **Manufactured personality.** Tilted stickers, hand-drawn underlines, random asymmetry, added to look human. Decoration with no source, harder to spot only because it is newer.
- **Decoration before content.** Surfaces and shadows are refined while the data is still "John Doe" and "12,345". The result is a well-finished placeholder.
- **One screen at a time.** A tell that lives in a token or a shared component is patched on the page in front of you. It stays everywhere else.
