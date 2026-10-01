## MODIFIED Requirements

### Requirement: Return transitions respect their kind

Native ingestion SHALL extract kind, presentation, backBehavior, motion and motionRef for each transition. A return transition SHALL execute its confirmed backBehavior and SHALL never push a copy of the destination. Missing navigation or motion requirements SHALL be recorded as unresolved for the affected edge, and SHALL NOT default to push, single-step back or platform animation without existing explicit authorization. Independent confirmed work SHALL continue.

#### Scenario: Return transition without presentation
- **WHEN** a return transition declares backBehavior dismiss and confirmed motion
- **THEN** it SHALL dismiss the presented surface rather than push a new destination

#### Scenario: Forward transition without presentation
- **WHEN** a non-return transition lacks presentation and no explicit authorized default applies
- **THEN** its implementation SHALL await the named decision instead of assuming push

##### Example: resolution
| kind | presentation | backBehavior | Result |
| --- | --- | --- | --- |
| return | absent | dismiss | dismiss using declared motion |
| return | absent | absent | unresolved return action |
| primary | absent | absent | unresolved presentation |
| primary | sheet | dismiss | sheet with declared dismissal and motion |
