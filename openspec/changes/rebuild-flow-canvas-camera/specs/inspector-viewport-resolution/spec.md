## MODIFIED Requirements

### Requirement: Form factor badge on flow cards

UI Flow route frames SHALL display a badge naming the resolved formFactor and dimensions (for example "desktop · 1280x800") in the frame label drawn outside the frame whenever the prototype or route declares a viewport, so reviewers can see the intended device class without opening the flow source. Frames of legacy prototypes without any declaration SHALL show no badge.

#### Scenario: Badge shows declared size

- **WHEN** a route frame renders for a flow declaring desktop 1280x800
- **THEN** the frame label outside the frame shows a "desktop · 1280x800" badge

#### Scenario: Legacy prototype shows no badge

- **WHEN** a route frame titled "Home" renders for a flow that declares no viewport on the flow or the route
- **THEN** the frame label shows "Home" and contains no badge text such as "phone · 375x812"
