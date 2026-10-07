## MODIFIED Requirements

### Requirement: Static Flow Export

A prototype SHALL be able to expose a sibling static flow story for Figma export when its metadata includes a flow export story id. The Static Flow export SHALL stay geometry-aligned with UI Flow: it SHALL place every route card and flow-only node from the same saved or metadata positions and SHALL reserve the same frame box size (route UI width and height plus outer chrome) as the UI Flow frame, so the offset between any two item boxes in Static Flow equals the offset between the same frames in UI Flow world coordinates. The parity contract between Static Flow and UI Flow SHALL be limited to these positions and frame box sizes; canvas background, frame chrome, edge routing, arrowhead placement and label styling are outside the contract and SHALL NOT be used as acceptance criteria for either surface.

#### Scenario: Open static flow story

- **WHEN** parameters.prototype includes a flow export story id and the reviewer clicks Open Static Flow
- **THEN** Storybook opens the sibling static flow story with Figma export enabled and prototype mode set to Story

#### Scenario: No static flow story

- **WHEN** parameters.prototype has no flow export story id
- **THEN** UI Flow mode omits the Open Static Flow control

#### Scenario: Static flow uses saved UI Flow layout

- **WHEN** a reviewer drags route cards or flow nodes in UI Flow and opens the sibling Static Flow story on the same origin
- **THEN** Static Flow reads the generic `prototype-inspector:flow-layout:<prototype id>` positions before falling back to metadata positions

#### Scenario: Static flow matches route preview sizing

- **WHEN** a static flow route card renders the same route UI used by UI Flow iframe previews
- **THEN** the static preview reserves the same route UI width and height, with headers and borders treated as outer chrome

#### Scenario: Static flow keeps UI Flow geometry

- **WHEN** a reviewer drags a route frame to (960, 1960) in UI Flow and then reloads the sibling Static Flow story on the same origin
- **THEN** Static Flow places that route at (960, 1960), and the offset between that route's item box and every other item box in the Static Flow DOM equals the offset between the same frames in UI Flow world coordinates

##### Example: geometry parity with differing styling

| UI Flow frame A | UI Flow frame B | Static Flow offset B minus A | Canvas background and edge routing |
| --------------- | --------------- | ---------------------------- | ---------------------------------- |
| (0, 0) | (480, 0) | (480, 0) | not compared |
| (960, 1960) | (0, 0) | (-960, -1960) | not compared |
