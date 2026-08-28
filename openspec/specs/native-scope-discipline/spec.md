# native-scope-discipline Specification

## Purpose

TBD - created by archiving change 'native-skill-hardening'. Update Purpose after archive.

## Requirements

### Requirement: Already-shipping surfaces excluded from seam work

The completion criteria in SKILL.md and the completion bar in the verification reference SHALL exclude fixture groups belonging to surfaces the map scopes as already shipping on this platform: those fixture groups SHALL NOT become DataSource seams, SHALL NOT appear as integration work in the implementation map, and SHALL be recorded as excluded. The DataSource pattern section SHALL scope its instruction to in-scope fixture groups rather than to every feature, so all three statements agree.

#### Scenario: Route that already ships on this platform

- **WHEN** a route is scoped as already shipping and the prototype re-created it only as context
- **THEN** no DataSource protocol or mock implementation is created for its fixture group, and the exclusion is recorded with its evidence path

#### Scenario: Mixed map

- **WHEN** the map scopes one route as already shipping and another as new
- **THEN** only the new route's fixture groups become seams, and the completion check passes without a seam for the existing route

---
### Requirement: Not-applicable route outcome

The implementation map contract SHALL define a fourth terminal outcome, not-applicable, for routes the production navigation map marks as out of scope on the implementing platform, with the evidence cell naming that navigation-map entry. The verification reference SHALL state that the shared audit script recognizes only the other three outcomes, so a not-applicable row is reported by the script as a missing outcome and SHALL be explained and manually confirmed in the final report rather than being silently re-labeled as deferred.

#### Scenario: Route out of scope on this platform

- **WHEN** the production navigation map marks a route as out of scope in the implementing platform's column
- **THEN** the route outcome is not-applicable with the navigation-map entry as evidence, and it is not recorded as deferred

#### Scenario: Audit reports the gap

- **WHEN** the shared audit script runs against a map containing a not-applicable row
- **THEN** the final report explains the script's missing-outcome finding for that row and records the manual confirmation

---
### Requirement: Platform applicability gate

The First Actions list SHALL include a gate that checks whether the handoff addresses the implementing platform: the Target Surfaces section and the implementing platform's column in the production navigation map. When neither carries platform content, the agent SHALL stop and ask whether to send the handoff back for native specification or to proceed by deriving native behavior without a native spec, and SHALL NOT proceed silently.

#### Scenario: Web-only handoff

- **WHEN** Target Surfaces marks the app surface as out of scope and the navigation map's iOS column is empty
- **THEN** the agent stops and asks before implementing anything

#### Scenario: Handoff covering both platforms

- **WHEN** Target Surfaces names a native app and the navigation map's platform column is filled
- **THEN** the gate passes without an extra question
