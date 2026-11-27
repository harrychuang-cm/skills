# Product Research

Use this in `discover` after the interview summary is confirmed and before candidate directions are drafted. Research gives the PM real reference cases and gives every later decision a source.

## What To Research

| Kind | What it is | What to look at |
| --- | --- | --- |
| Comparable products | Same audience or same core task, usually three to five | How each core task is reached and in how many steps; the navigation pattern; density; how the most important number or action is presented; what frustrates their users |
| Analogous products | A different domain solving a similar problem for a similar audience | The one idea worth borrowing |
| Domain conventions | Meanings and formats users already expect | Color meanings (for example red for a price rise in Taiwan stock apps), number, currency, and date formats, terminology, required disclosures, platform conventions on iOS, Android, or the web |
| Audience needs | Constraints that follow from who the users are | Text size and touch-target needs of older users, one-handed use, low-attention contexts, accessibility expectations |

## Start From The PM's References

Before searching, work through what the PM brought in the interview (questions 9 and 10 in [discovery-interview.md](discovery-interview.md)).

1. **Brand materials first.** Read or view each one and write in Brand Materials what it decides: the primary key color, the typeface, the tone of copy. These are evidence; they override research and taste.
2. **Each liked reference.** Open the URL or view the screenshot. Starting from what the PM said they like, write in Liked References:
   - **Borrow:** the concrete pattern behind what they like, tied to a decision. "Big text" becomes "body text at `body-large-plus`, 18/28 (Type)"; "a clean home screen" becomes "at most four items in the first viewport (Density, Hierarchy)".
   - **Not borrow:** its logo, signature colors, illustration style, product name, and anything else that identifies that brand, plus anything the PM did not mention. What the PM did not say they like is not borrowed by default.
   - **Decisions informed:** which of the eight decisions it feeds ([design-direction.md](design-direction.md)).
3. **When a liked reference conflicts with brand materials**, the brand materials win; record the conflict and what was kept.
4. **Then research** to fill the gaps the PM's references leave. When the PM had nothing, research supplies all the references and nothing is blocked.

## What Research Adds

Research adds the comparable products, analogous products, conventions, and audience needs in the table above, starting from the products the PM named.

## Source Rules

- Every reference product and every convention claim carries a source link that was opened in this session or supplied by the PM. Record the date it was accessed.
- Keep facts and inferences apart. A fact is stated by the source. An inference is a conclusion drawn from one or more sources; it goes in the Inferences table with the sources it is based on.
- Do not invent products, features, numbers, quotes, or user feedback. When a source cannot be opened, mark the entry as unverified or drop it.
- Link to third-party products; do not copy their screenshots or assets into the project yourself. Screenshots the PM supplies are kept in `product-design/references/` and may appear on the comparison page.
- App-store descriptions and marketing pages describe intent, not behavior. Prefer the product itself, help documentation, or reviews for how something actually works, and say which kind of source each entry uses.

## Without Research Tools

When the host exposes no web search or fetch tool:

1. Say so plainly: research could not be performed in this session.
2. List only the references the PM supplied, with their links.
3. Mark the research entries `unconfirmed` and describe the gap under Research Limits.
4. Ask the PM for links to the two or three products they consider closest. Do not fill the gap from memory as if it were research.

## Output

1. Give the PM a short plain-language summary in the conversation: what is worth learning, what to avoid, and which domain conventions apply.
2. After the PM confirms, fill PM References and the Research Summary of `PRODUCT_BRIEF.md` and append a `DECISION_LOG.md` entry.
3. Each candidate direction in [design-direction.md](design-direction.md) cites at least two references, the PM's own liked references first when they fit that candidate.
