## MODIFIED Requirements

### Requirement: Layout payload viewport signature

The shared prototype flow layout helper SHALL write payloads with version 2 and a viewport signature string of the form <formFactor>:<width>x<height>. Reading saved positions SHALL accept an expected viewport: a payload whose signature does not match the expected viewport SHALL be ignored with a console.info notice instead of applying its positions. Version 1 and unsigned payloads SHALL be honored exactly when the expected viewport resolves to phone 375x812, preserving every existing saved layout. Positions SHALL remain the only geometry persisted in the flow layout payload; frame sizes SHALL derive from the flow contract or from runtime measurement of rendered route previews, and a measured-size cache kept outside the payload SHALL NOT be read by the Static Flow export.

#### Scenario: Phone-era layout ignored under desktop frames

- **WHEN** a prototype switches its declared viewport from phone to desktop and a version-1 saved layout exists
- **THEN** the saved positions are ignored, the fallback layout is used, and a console.info notice names the signature mismatch

#### Scenario: Legacy layouts keep working on phone

- **WHEN** a prototype with no declared viewport loads a version-1 saved layout
- **THEN** the saved positions apply exactly as before this change

#### Scenario: Measured sizes stay out of the layout payload

- **WHEN** the UI Flow has measured a route preview at 375 x 1040 and the reviewer then drags that route and exports the layout
- **THEN** the stored and exported layout payloads contain no frame size, and the Static Flow export sizes that route from the flow contract
