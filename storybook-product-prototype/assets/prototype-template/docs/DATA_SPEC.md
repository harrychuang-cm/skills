# Data Spec

## Source Of Truth

Prototype fixtures live in `__FEATURE_CAMEL__Data.ts`, mirrored one-to-one as language-neutral JSON in `fixtures/<group>.json` for non-TypeScript consumers and mock adapters.

## Fixture Inventory

- `__FEATURE_CAMEL__Routes`: [Route fixtures or content blocks.]

## Route Data Requirements

- `__ENTRY_ROUTE_ID__`: [Required fixture groups.]

## Data Schemas (JSON Schema)

One fenced `json` block per fixture group. Web, iOS, and Android implementations generate their types (TypeScript, Codable, kotlinx.serialization) from these schemas; keep them in sync with the fixtures.

### `__FEATURE_CAMEL__Routes`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PrototypeRouteContent",
  "type": "object",
  "required": ["id", "title"],
  "properties": {
    "id": { "type": "string", "description": "Stable id used for keys and route mapping." },
    "title": { "type": "string", "description": "Display title." },
    "description": { "type": "string", "description": "Route-specific review copy or content." },
    "state": { "type": "string", "enum": ["default", "loading", "empty", "error"], "description": "Branch state this fixture drives, when present." }
  }
}
```

## API Replacement Points

- [Future API or service name]: [Expected request, response, error, route usage, fixture replacement, and owner.]

## Receiving Data Ownership

- Service owner: [Team, package, or system.]
- Auth and permission: [Requirement or unknown.]
- Cache and persistence: [Client cache, storage, offline behavior, or none.]
- Web/app parity: [Fields or states that must remain consistent across platforms.]
- Receiving implementation responsibility: real data source, API client, auth/session, storage, persistence, cache policy, and environment configuration.

## State And Branch Fixtures

- [Success, error, empty, loading, disabled, or async branch fixtures.]

## AI Update Rules

- Add fixture data before wiring a route.
- Keep fixtures deterministic.
- Mirror every fixture group as `fixtures/<group>.json` with the same values, and keep its JSON Schema block above in sync.
- Document any future API replacement in this file and in `__FEATURE_CAMEL__Meta.ts`.
- Mirror API/data contract expectations in `PRODUCTION_HANDOFF.md`.
- Do not wire real data sources in the prototype.
