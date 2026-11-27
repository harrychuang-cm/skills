# Discovery Interview

Use this in `discover` to get from a product idea to a confirmed `PRODUCT_BRIEF.md`. The `review` variant at the end is for an existing product without a brief.

## Rules

- **One question per message.** Wait for the answer before asking the next one.
- **Offer a suggested answer** with every question, drawn from what is already known: the idea as stated, existing screens, earlier answers. Label it as a suggestion so the PM can reply "好" or "OK" to accept it, or correct it.
- **Ask in the conversation language and in plain words.** No design jargon; when a term is needed, explain it in the same sentence.
- **Skip what is already answered.** When the conversation, an existing document, or the product itself answers a question, say which answer is being used and move on.
- **Let the PM skip.** A skipped question becomes an `unconfirmed` assumption with a row under Open Questions in `DECISION_LOG.md`.
- **Do not write documents mid-interview.** Content is written only after the PM confirms the summary.

## Before The First Question

If `DECISION_LOG.md` has no recognizable `Document Language:` line, the document language question comes first (see SKILL.md › Document Language).

## Stop Conditions

Stop interviewing and summarize when all of these hold:

1. The primary target users are known, confirmed or explicitly assumed: who they are, their context of use, their primary device, their domain expertise.
2. The product purpose is known: the problem and the outcome for the user.
3. Up to three core tasks are known.
4. How success is observed is known.
5. Questions 9–12 (brand evidence, references, secondary users, non-goals) have each been asked once. Later steps depend on them: key colors need brand evidence, research starts from the PM's references, and the summary lists non-goals. The PM may skip any of them; a skipped one becomes an `unconfirmed` assumption.

## Question Bank

Ask in this order and skip what is answered. The example wording is for a Traditional Chinese conversation.

| # | Topic | Goal | Example wording |
| --- | --- | --- | --- |
| 1 | Primary user | A concrete person, not a market segment | 「最常用這個產品的是誰？請描述一個具體的人：做什麼工作、大概幾歲、對這個領域熟不熟。」 |
| 2 | Context of use | Where, when, how often, under what pressure | 「他們通常在什麼情況下打開它？例如通勤用手機、上班用電腦、盤中很急、週末慢慢看。」 |
| 3 | Primary device | Phone, desktop, tablet, or mixed | 「主要是手機、電腦，還是兩種都有？哪一種比較多？」 |
| 4 | Domain expertise | What they already know and what confuses them | 「他們對這個領域的熟悉程度？有哪些專有名詞他們不一定懂？」 |
| 5 | Problem | How they cope today and what hurts | 「沒有這個產品時，他們現在怎麼做？最麻煩的是哪一步？」 |
| 6 | Outcome | What they can do afterward | 「用了之後，他們能做到什麼以前做不到、或做得很辛苦的事？」 |
| 7 | Core tasks | At most three, with frequency | 「如果使用者只能在這個產品做三件事，是哪三件？各多久做一次？」 |
| 8 | Success | An observable sign, not a feeling | 「上線後，看到什麼現象會讓你覺得成功？例如第一次就完成下單、客服詢問變少。」 |
| 9 | Brand evidence | Inputs for key colors and type | 「有沒有品牌色、logo、品牌規範、既有產品或 Figma 可以參考？」 |
| 10 | References the PM has in mind | Seeds for research | 「你心中有沒有競爭對手，或想參考的產品（不限同產業）？」 |
| 11 | Secondary users | Optional | 「還有沒有第二類使用者？例如主管、客服、家人。」 |
| 12 | Non-goals | What the product will not do | 「有沒有明確不做的事？先講清楚可以避免之後功能越長越多。」 |

## Summary And Confirmation

When the stop conditions are met:

1. Show a short summary in the conversation: target users, purpose, core tasks, success measures, non-goals, and any assumptions marked as unconfirmed.
2. Ask the PM to confirm or correct it.
3. After confirmation, write `PRODUCT_BRIEF.md` from [../assets/PRODUCT_BRIEF.template.md](../assets/PRODUCT_BRIEF.template.md), copy the core tasks into `EXPERIENCE_MAP.md`, and append a `DECISION_LOG.md` entry.
4. Continue with research ([product-research.md](product-research.md)).

## Review Variant: Existing Product Without A Brief

`review` does not run the full interview. Infer the answers from the code and the rendered screens, then confirm with **at most three questions**, each carrying the inferred answer:

1. Target users and context: 「從畫面看，主要使用者像是＿＿，在＿＿情境使用，對嗎？」
2. Product purpose: 「這個產品主要是幫他們＿＿，對嗎？」
3. Core tasks: 「我推測最重要的三件事是＿＿、＿＿、＿＿，對嗎？」

Write what the PM confirms as `confirmed` and the rest as `unconfirmed`, then proceed with the review.
