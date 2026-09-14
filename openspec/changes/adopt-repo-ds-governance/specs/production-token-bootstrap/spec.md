## MODIFIED Requirements

### Requirement: Minimal token subset derivation

The token-bootstrap reference SHALL require deriving the ported token set from the tokens actually referenced by the in-scope handoff documents and prototype components, not from the full prototype token catalog. The derived subset SHALL preserve the source dependency graph and map it to the target layering under ds-governance without forcing an existing two-layer target to add a component layer: every ported comp or sys token SHALL resolve to a ported ref token, and ref tokens with no dependent in the subset SHALL be excluded.

#### Scenario: Subset derivation from handoff scope

- **WHEN** the handoff UI spec references only a subset of the prototype's semantic tokens
- **THEN** the agent ports that subset plus the ref tokens they resolve to, and lists excluded token groups in the implementation notes

##### Example: dependency closure

- **GIVEN** prototype tokens: `ref-color-blue-500`, `ref-color-red-500`, `sys-color-primary` → `ref-color-blue-500`, `sys-color-danger` → `ref-color-red-500`; handoff scope uses only `sys-color-primary`
- **WHEN** the subset is derived
- **THEN** ported tokens are `ref-color-blue-500` and `sys-color-primary`; `ref-color-red-500` and `sys-color-danger` are excluded and recorded as deferred
