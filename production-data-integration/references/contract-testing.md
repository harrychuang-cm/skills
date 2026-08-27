# Contract Testing

Use this reference to prove that a real data source satisfies the contract the UI was built against.

The mock adapters made the UI's expectations executable. Contract tests keep them executable after the real source replaces the mock — without them, the first shape drift in a backend response surfaces as a broken screen in production instead of a red test.

## Scope And Framework

Write contract tests with the target repo's existing test framework and its existing HTTP-stubbing or fixture-loading tools. Do not introduce a new test framework, assertion library, or mocking system for this purpose; a second framework in the repo is a maintenance cost this work has no mandate to add.

Tests belong wherever the repo keeps integration or service-layer tests. Each fixture group gets its own test group, named after the group so the handoff, schema, fixture, and test are traceable by one identifier.

## What Every Fixture Group Needs

### 1. Schema validation

Validate the real response against the group's JSON Schema block from `DATA_SPEC.md`:

| Platform | How validation happens |
| --- | --- |
| Web | A schema validator (the repo's existing one, e.g. an ajv-style validator) run against the parsed response |
| iOS | `Codable` decoding into the schema-derived types — a decode failure is the assertion |
| Android | `kotlinx.serialization` decoding into the schema-derived types, with strict mode so unknown-but-required mismatches surface |

The test must fail on a missing required field and on a type mismatch. A test that only checks the request was made proves nothing about the contract.

Where the real service can be called in CI, validate a recorded real response; where it cannot, validate the response fixture captured from the real service during implementation, and record in the test which environment and date it came from.

### 2. Error taxonomy mapping

For each class in the contract's error taxonomy, assert that the DataSource surfaces the documented UI state:

- retryable classes (timeout, 5xx, offline) surface the documented retry state, not a terminal error
- non-retryable classes (validation failures, 4xx) surface the documented terminal error state
- reauthentication classes surface the documented auth-required state and trigger the app's existing refresh/sign-in path

Trigger each class by stubbing the transport or by the repo's existing failure-injection mechanism. A class the tests never exercise is a class production will discover.

### 3. Semantics behavior assertions

Write at least one behavior assertion per recorded `Semantics` entry:

- `pagination`: a second page is requested with the documented cursor or offset parameter, and the response's page marker is honored — including the terminal page
- `sort` / `filter`: a documented sort or filter parameter reaches the request
- `freshness`: `poll` asserts the documented interval drives a refetch; `push` asserts the transport's message updates state; `static` asserts no background refetch happens
- `mutation`: the documented verb is used; an idempotent mutation asserts that a repeat is safe; when optimistic updates are allowed, assert the rollback path on failure
- `errors`: covered by the taxonomy assertions above

A `Semantics` entry that was `unknown` at handoff and got confirmed during wiring gets its assertion here, and its confirmed value written back to the handoff.

### 4. Fixture shape reference

Use `fixtures/<group>.json` as the golden reference for shape: assert that the real response's field set and field types match the fixture's. Do not assert on values — the fixture's values are deterministic prototype data, and a real service will never return them. When the real response legitimately carries fields the fixture lacks, that is a contract change: write it back to `DATA_SPEC.md` and the fixture rather than loosening the test.

## Failure Handling

A failing contract test means one of three things. Resolve it, never silence it:

1. **The implementation is wrong** — fix the client, decoding, or error mapping.
2. **The contract is wrong** — the real service legitimately differs. Report the divergence to the contract owner, agree on the change, update `DATA_SPEC.md`, `PRODUCTION_HANDOFF.md`, the fixture, and the Storybook regression story, then update the test.
3. **The UI's expectation is wrong** — surface it as a product decision. This skill does not change the UI; it reports the finding to the assembly-pass owner.

Weakening an assertion to make a test pass converts a caught contract break into an uncaught one.

## Reporting

Report per fixture group: schema validation result, error classes covered, semantics assertions written, and any assertion deferred with its reason and owner. These results settle the `AC-P (integration)` rows of the Acceptance Traceability table.
