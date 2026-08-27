## MODIFIED Requirements

### Requirement: Payload store endpoints

The review-server middleware SHALL expose payload store endpoints: POST /__figma-export/payloads persists a valid payload JSON body under its sanitized storyId (lowercase letters, digits, and hyphens only) and answers 201; GET /__figma-export/payloads answers a JSON array of summaries carrying storyId, storyName, componentTitle, generatedAt, hasBaseline (boolean, true when a synced baseline exists for that storyId), and baselineGeneratedAt (the baseline payload's generatedAt string, or an empty string when no baseline exists); GET /__figma-export/payloads/<storyId> answers the stored payload or 404. Invalid bodies or storyIds that sanitize to empty MUST answer 400. Every endpoint SHALL include Access-Control-Allow-Origin: * and answer OPTIONS preflight with 204.

#### Scenario: store round trip

- **WHEN** a payload with storyId "components-button--primary" is POSTed and the list is fetched
- **THEN** the list contains that storyId and GET of the single entry returns the identical payload JSON

#### Scenario: path traversal is rejected

- **WHEN** a payload whose storyId is "../escape" is POSTed
- **THEN** the server answers 400 and writes no file outside the payload directory

##### Example: storyId sanitize

| input storyId | sanitized | result |
| ------------- | --------- | ------ |
| components-button--primary | components-button--primary | 201 stored |
| ../../etc/passwd | etcpasswd | 201 stored under sanitized name |
| ../.. | (empty) | 400 rejected |

#### Scenario: list summaries expose baseline presence

- **WHEN** the list is fetched for a store where storyId "components-button--primary" has a synced baseline and storyId "components-card--default" does not
- **THEN** the "components-button--primary" summary carries hasBaseline true with the baseline payload's generatedAt, and the "components-card--default" summary carries hasBaseline false with an empty baselineGeneratedAt

## ADDED Requirements

### Requirement: Synced baseline payload store

The payload store SHALL keep a synced baseline copy per storyId in a synced/ subdirectory of the payload directory, written only by an explicit promote action and never by a regular payload POST. POST /__figma-export/payloads/<storyId>/promote SHALL copy the currently stored payload for that storyId into synced/<storyId>.json and answer 200 with a baseline summary (storyId, storyName, componentTitle, generatedAt); when no current payload exists for that storyId it MUST answer 404 with a JSON error. GET /__figma-export/payloads/<storyId>/baseline SHALL answer the stored baseline payload, or 404 when none exists. Baseline endpoints SHALL apply the same storyId sanitization, CORS headers, and OPTIONS preflight behavior as the existing payload store endpoints. GET /__figma-export/payloads MUST NOT list files under the synced/ subdirectory as current payloads.

#### Scenario: promote freezes the baseline

- **WHEN** a payload for storyId "components-button--primary" is POSTed, then promoted, then a different payload for the same storyId is POSTed
- **THEN** GET of the baseline returns the payload content as it was at promote time, and GET of the current payload returns the newer content

#### Scenario: promote without a current payload

- **WHEN** promote is requested for a storyId that has no stored payload
- **THEN** the server answers 404 with a JSON error and writes nothing under synced/

#### Scenario: baseline read misses

- **WHEN** GET of the baseline is requested for a storyId that was never promoted
- **THEN** the server answers 404 with a JSON error
