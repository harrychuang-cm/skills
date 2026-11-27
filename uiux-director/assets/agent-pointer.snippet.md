<!-- uiux-director:START -->
## Product Design Documents

Before designing or changing UI in this project, read the documents in `product-design/`:

- `PRODUCT_BRIEF.md`: target users, product purpose, core tasks, research
- `DESIGN_DIRECTION.md`: design decisions, density, the Material Design 3 token plan
- `EXPERIENCE_MAP.md`: navigation, core-task depth limits, feature registry
- `DECISION_LOG.md`: document language, decision history, open questions

Entries marked `confirmed` are the product's authority. Follow them; when a request conflicts with one, ask before changing it and record the change in `DECISION_LOG.md`. Entries marked `unconfirmed` are assumptions. Write design documents in the language recorded in `DECISION_LOG.md`. UI code uses system- or component-tier tokens (`--md-sys-*`, `--md-comp-*`, or the mapped existing tokens), never raw values. Use the `uiux-director` skill for design direction, UX review, and feature changes when it is available.
<!-- uiux-director:END -->
