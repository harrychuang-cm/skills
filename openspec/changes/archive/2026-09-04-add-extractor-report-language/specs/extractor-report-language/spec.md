## ADDED Requirements

### Requirement: First-run report language selection

The design-system-extractor skill SHALL resolve the report language before Input Discovery. When `design-system/SESSION_STATE.md` contains no recognizable Report Language record, the skill MUST ask the user to choose a report language exactly once, offering the user's current conversation language as the default recommended option, plus English, Japanese, and a custom-language option. The skill SHALL NOT ask again in later sessions for the same package while a recognizable record exists.

#### Scenario: First extraction on a fresh package

- **WHEN** the skill starts extraction and `design-system/SESSION_STATE.md` has no Report Language record
- **THEN** the skill asks the user for the report language before Input Discovery, with the conversation language as the default option

#### Scenario: Subsequent session reuses the recorded language

- **WHEN** the skill starts on a package whose `SESSION_STATE.md` contains `Report Language: zh-Hant (繁體中文)`
- **THEN** the skill writes all new report content in that language without asking again

#### Scenario: Missing or unrecognizable record is re-asked

- **WHEN** `SESSION_STATE.md` exists but its Report Language line is absent or unrecognizable
- **THEN** the skill treats the package as first-run, asks the user once, and records the answer

### Requirement: Report language persistence in SESSION_STATE

The skill SHALL record the chosen report language in `design-system/SESSION_STATE.md` as a language tag plus a human-readable name (for example `Report Language: zh-Hant (繁體中文)`). Post-checkpoint passes (Component Expansion, Late-Arriving Authoritative Source, Collaboration Review And Integration) MUST reuse the recorded language. When the user explicitly requests a language switch, the skill SHALL update the record, log the switch in the Key Design Decisions table, and apply the new language to subsequently updated sections; it SHALL NOT rewrite existing sections unless the user explicitly requests a full rewrite.

#### Scenario: Language recorded after selection

- **WHEN** the user selects 繁體中文 during the first-run question
- **THEN** `SESSION_STATE.md` contains a `Report Language: zh-Hant (繁體中文)` line at the next checkpoint

#### Scenario: Mid-project language switch

- **WHEN** the user explicitly asks to switch the report language from 繁體中文 to English
- **THEN** the skill updates the Report Language record, logs the switch in Key Design Decisions, and writes subsequently updated sections in English without rewriting untouched sections

### Requirement: Bilingual annotated structure with English canonical forms

When the report language is not English, generated report files under `design-system/` SHALL keep section headings and table headers in their English canonical form and append a report-language annotation in full-width parentheses after the English text (for example `## Source Inventory（來源清單）`). Annotations MUST be appended and MUST NOT replace, rewrite, or precede the English canonical text. Status values, decision keywords (such as `merge`, `keep distinct`, `reuse existing source`), token names, file names, and CSS marker comments (`token-review:`, `a11y-remap`) SHALL remain in English, with optional appended annotations in table cells. Narrative body content SHALL be written in the report language. When the report language is English, no annotations SHALL be added.

#### Scenario: Non-English report passes strict audits

- **WHEN** a report written with 繁體中文 annotations and body content is checked with `audit_sources.mjs --strict`, `audit_tokens.mjs --strict`, and `audit_components.mjs --strict`
- **THEN** all three audits parse the English canonical headings, headers, and decision keywords and pass without script changes

##### Example: annotated structures that audits still parse

| Element | English-only output | Annotated output (zh-Hant) |
| --- | --- | --- |
| Section heading | `## Source Inventory` | `## Source Inventory（來源清單）` |
| Table header | `Developer Decision` | `Developer Decision（開發者決定）` |
| Decision cell | `keep distinct` | `keep distinct（保留區分）` |

#### Scenario: English report stays unchanged

- **WHEN** the recorded report language is English
- **THEN** generated reports contain no parenthetical annotations and match the current English-only format

### Requirement: HTML docs default UI locale follows the report language

The `generate_docs_html.mjs` script SHALL accept an optional `--locale <zh-Hant|en|ja>` flag. When the flag is present with a supported value, both the statically rendered chrome labels and the embedded client default locale SHALL use that value. When the flag is absent, the script SHALL keep the current `zh-Hant` default. When the flag value is unsupported, the script SHALL print a warning to stderr and fall back to `zh-Hant` without aborting. The skill instructions SHALL map the report language to the flag value: Traditional or Simplified Chinese maps to `zh-Hant`, Japanese maps to `ja`, and English and every other language map to `en`.

#### Scenario: Locale flag drives the generated docs

- **WHEN** `node scripts/generate_docs_html.mjs <target-root> --locale en` is run
- **THEN** the generated `index.html` renders English chrome labels and defaults to the English UI on first load without stored preferences

#### Scenario: Flag absent keeps current behavior

- **WHEN** the script is run without `--locale`
- **THEN** the generated docs default to the `zh-Hant` UI exactly as before this change

#### Scenario: Unsupported flag value falls back safely

- **WHEN** the script is run with `--locale ko`
- **THEN** the script prints a warning to stderr, generates the docs with the `zh-Hant` default, and exits successfully

##### Example: report language to locale mapping

| Report language | --locale value |
| --- | --- |
| zh-Hant (繁體中文) | zh-Hant |
| zh-Hans (简体中文) | zh-Hant |
| ja (日本語) | ja |
| en (English) | en |
| ko (한국어) | en |
| any other language | en |
