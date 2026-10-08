## Purpose

Keeps the Prototype Inspector UI Flow fast on large flows by rendering each route frame at the cheapest level of detail that still looks right at the current zoom: nothing off-screen, cached snapshots when zoomed out, and a small budget of live Storybook iframes when zoomed in. Snapshots are produced in the browser without package dependencies and cached across sessions.

## ADDED Requirements

### Requirement: Frame render tiers

The inspector SHALL assign every rendered route frame one of four tiers, culled, placeholder, snapshot or live, from the camera zoom, the frame's on-screen width W (frame box width multiplied by the zoom) and its visible fraction f (the share of the frame box inside the canvas viewport). Each rendered route frame SHALL be identified by its instance key: its node id in the complete flow, or the step instance key that another UI Flow canvas capability defines for a view that renders one route more than once, such as the journey focus view. Tiers, hover, promotion and pinning SHALL be tracked per instance key, while the frame size cache and snapshot records SHALL stay keyed by route, so every instance of one route shares one cached size and one snapshot.

A frame pinned live by another canvas feature SHALL be live while it stays pinned, regardless of the zoom, its on-screen width, its visible fraction and culling. Any other frame that does not intersect the canvas viewport expanded on each side by half of the viewport's own width and half of the viewport's own height SHALL be culled: it keeps its positioned box and connected edges but renders no preview. Among the remaining frames, a frame SHALL be a live candidate when the zoom is at least 0.8 and f is at least 0.4, when it has been hovered for at least 200 milliseconds and the zoom is at least 0.4, when another canvas feature promotes it (for example by selecting it) and the zoom is at least 0.4, or when it is already live, the zoom is at least 0.64 and f is greater than 0, since route content renders at 1:1 CSS pixels and its legibility depends on the zoom alone. Other frames SHALL show a placeholder when W is below 40 pixels and a snapshot otherwise, falling back to a skeleton with the route title and id until a snapshot exists.

Tiers SHALL be recomputed only when the camera becomes idle, the hovered frame changes or the current hover reaches 200 milliseconds, a frame is pinned, unpinned, promoted or no longer promoted, frame sizes change, the canvas viewport is resized, or frame positions or the set of displayed frames change (drag release, nudge commit, undo, redo, Reset Layout, Import Layout or a journey focus switch). Tier changes caused by the camera becoming idle SHALL be applied in the same React commit that hands the idle camera state to React. Tiers SHALL be derived during rendering, and route frame loads, preview size measurements, snapshot results, cache reads and hover dwell timers that arrive while the camera moves or a frame is dragged SHALL be held and applied in the commit that settles the camera or releases the drag. The one exception is the read of stored snapshots while opening: until it completes the canvas stays hidden, and it SHALL apply in the commit that reveals the canvas even while the opening fit's camera idle timer runs. In every tier, culled and placeholder included, the element carrying the route's comment anchor SHALL stay the same element with the same size, and no cover, snapshot image, skeleton or renderer SHALL carry comment anchor attributes.

#### Scenario: The opening overview needs no live iframe

- **WHEN** a 30-route prototype opens fitted at zoom 0.13 on a 1190 x 800 canvas
- **THEN** every route frame shows a snapshot, a skeleton with its route title and id, or a placeholder, and no route preview iframe other than the snapshot renderer exists

##### Example: tier selection for a 377-pixel-wide phone frame

| Zoom | W | Visible fraction | Hovered 200 ms | Previously live | Tier |
| ----- | ----- | ----- | ----- | ----- | ----- |
| 0.1 | 37.7 | 1 | no | no | placeholder |
| 0.15 | 56.6 | 1 | no | no | snapshot |
| 0.5 | 188.5 | 1 | no | no | snapshot |
| 0.5 | 188.5 | 1 | yes | no | live |
| 0.8 | 301.6 | 0.5 | no | no | live |
| 0.8 | 301.6 | 0.3 | no | no | snapshot |
| 0.7 | 263.9 | 0.5 | no | yes | live |
| 0.6 | 226.2 | 1 | no | yes | snapshot |
| 1 | 377 | 0 and outside the expanded viewport | no | no | culled |

##### Example: tier selection for a 1282-pixel-wide desktop frame

| Zoom | W | Visible fraction | Hovered 200 ms | Previously live | Tier |
| ----- | ----- | ----- | ----- | ----- | ----- |
| 0.3 | 384.6 | 1 | no | no | snapshot |
| 0.8 | 1025.6 | 0.5 | no | no | live |

#### Scenario: A pinned frame stays live off-screen

- **WHEN** a frame pinned live by another canvas feature is panned outside the expanded viewport or zoomed out until it is 30 pixels wide
- **THEN** it keeps its live iframe until it is unpinned

##### Example: pinned 377-pixel-wide phone frame

| Zoom | W | Visible fraction | Tier |
| ----- | ----- | ----- | ----- |
| 0.08 | 30.2 | 1 | live |
| 0.3 | 113.1 | 1 | live |
| 1 | 377 | 0 and outside the expanded viewport | live |

#### Scenario: Repeated route instances keep separate tiers

- **WHEN** a view renders route review as two frames with instance keys 1:review and 3:review at zoom 0.5 and the reviewer hovers 1:review for 200 milliseconds
- **THEN** 1:review becomes live while 3:review keeps showing the snapshot of route review, and both frames use the cached size of route review

#### Scenario: The comment anchor survives tier changes

- **WHEN** the frame of route review changes from snapshot to culled and then to live
- **THEN** the element carrying data-sbfx-anchor="route:review" is the same element throughout, keeps the frame's preview size, and is the only element carrying that anchor

#### Scenario: Idle tiers share the camera commit

- **WHEN** a pinch zoom from 0.13 to 1 ends with a phone frame 60% visible and the camera becomes idle
- **THEN** exactly one pi:flow:commit mark is recorded within 100 milliseconds after the camera becomes idle, not counting commits caused by route frame loads, preview size measurements or snapshot tile updates, and that commit already renders the frame in the live tier

---

### Requirement: Live iframe budget

At most 6 route frames SHALL be live at the same time, plus at most 1 frame pinned live by another canvas feature and the snapshot renderer, so the UI Flow never holds more than 8 route preview iframes. When more frames qualify as live candidates than the budget allows, the inspector SHALL keep the pinned frame, then promoted frames, then the hovered frame, then frames with the largest on-screen visible area, preferring frames that are already live on ties and then frames nearest the viewport center; the others SHALL use the snapshot tier. At most one route iframe SHALL be loading at a time, and the snapshot renderer counts for this rule: it SHALL NOT switch routes or reload its src while a live frame is loading or waiting to load, and no live frame SHALL start loading while the renderer loads its document. A live frame SHALL keep the same DOM parent for its whole live lifetime, with stacking changed only through z-index. While a newly live frame loads, its snapshot or skeleton SHALL stay visible above it until the frame's story render completes. Demoting a frame SHALL remove its iframe element and release every reference, listener and observer bound to the iframe's window or document.

#### Scenario: Zooming into a dense area caps live frames

- **WHEN** the reviewer zooms to 100% over an area where 9 frames are at least 40% visible
- **THEN** exactly 6 of them become live, the other 3 show snapshots, and the page holds at most 8 route preview iframes including the renderer

#### Scenario: Promotion does not flash blank

- **WHEN** a frame showing a snapshot at zoom 0.5 is selected and therefore promoted to live
- **THEN** the snapshot stays visible until the live frame's story render completes and is then removed

---

### Requirement: Frame size cache

The inspector SHALL keep the last measured preview size of each route, keyed by story id, prototype id, route id and viewport signature, initialised from the resolved viewport, persisted with the route's snapshot record, and used for frame geometry in every tier, so changing a frame's tier never moves frames or edges. The cached measured size SHALL be a non-authoritative, per-browser rendering cache keyed by viewport signature: it SHALL never be written into the flow layout payload or read by the Static Flow export, so positions remain the only geometry persisted in the layout payload and the flow contract remains the source of declared sizes. The snapshot renderer and live frames SHALL both update the cache. Live frames SHALL be measured by a ResizeObserver created from the frame's own window on the element matching [data-prototype-route-preview="true"], falling back to the first child of #storybook-root, with updates coalesced to at most one per animation frame and changes of less than 2 pixels on both axes ignored. Measurement observers SHALL be created after every load of a live frame's document and released before that iframe reloads or is removed. When a measured height exceeds the previous height by the amount the iframe itself grew since the previous measurement, within 2 pixels, or exceeds 8 times the resolved viewport height, the inspector SHALL keep the previous height. Size measurements of a frame SHALL NOT update the frame size cache or any persisted size or snapshot record while another canvas capability suspends measurement for that frame, such as a frame in interact mode. The fixed-interval polling of preview sizes SHALL be removed.

#### Scenario: Switching tiers keeps the layout still

- **WHEN** a route whose cached size is 375 x 1040 changes from snapshot to live and the live frame measures 375 x 1040
- **THEN** no frame position, frame size or edge path changes

#### Scenario: Cached size holds until the first measurement

- **WHEN** a route whose cached size is 375 x 1040 becomes live and no ResizeObserver measurement has arrived yet
- **THEN** the frame keeps 375 x 1040 and no frame position or edge path changes until a measurement differing by at least 2 pixels arrives

#### Scenario: Viewport-relative content does not grow forever

- **WHEN** a route's content is styled min-height calc(100vh + 20px) inside an 812-pixel-tall frame
- **THEN** the frame grows once to 832 pixels and further measurements caused only by the frame's own growth are ignored

#### Scenario: Reloading a live frame re-creates its observer

- **WHEN** the live frame of route review reloads in place and its new document measures 375 x 1040
- **THEN** the observer bound to the previous document is released before the reload, and a new observer created after the load sets the cached size of route review to 375 x 1040

#### Scenario: Suspended measurement leaves the cache unchanged

- **WHEN** another canvas capability suspends measurement for a live frame whose cached size is 375 x 812 and the frame's document grows to 1040 pixels tall
- **THEN** the cached size stays 375 x 812, the frame box does not change, and the route's stored snapshot record is not rewritten until the suspension ends

---

### Requirement: Route snapshot capture

The inspector SHALL capture route snapshots without any package dependency, from the inspector's window against a same-origin frame document, reading styles through the frame window's getComputedStyle and identifying nodes by nodeType instead of instanceof. A capture SHALL clone the frame document's body clipped to the frame's measured preview box. For each cloned element and its ::before and ::after pseudo-elements, the capture SHALL inline only the standard CSS properties whose computed values differ from the user-agent default for that element type, comparing inherited properties with the parent's computed value unless the user agent sets them on that element type, and SHALL NOT enumerate custom properties. It SHALL embed the @font-face rules of the font families in use as data URLs once per page session, convert images, CSS url() references and canvas content to data URLs, replace nested iframes and video elements with placeholders, omit elements carrying data-sbfx-capture-ignore, and hide scrollbars. It SHALL serialize the clone into an SVG foreignObject image loaded from a data: URL, draw it at scale min(1, 0.8 × devicePixelRatio) with the longest side capped at 4096 pixels and the area capped at 4 megapixels, and encode WebP at quality 0.8, falling back to PNG when the browser does not produce WebP. A capture SHALL fail, leaving the frame on its skeleton, when it takes longer than 8 seconds, when the bitmap has no visible pixels, or when the frame shows Storybook's preparing or error display.

#### Scenario: Portals and overlays appear in the snapshot

- **WHEN** a route renders a 320-pixel-tall bottom sheet through a portal appended to the frame document's body
- **THEN** the route's snapshot shows the bottom sheet at the bottom of the frame as the live frame does

#### Scenario: Token-heavy projects stay fast

- **WHEN** the frame's :root declares 9,577 custom properties
- **THEN** the serialized snapshot markup contains no custom property declarations

#### Scenario: A failed capture keeps the skeleton

- **WHEN** a capture of route review produces a 375 x 812 bitmap with no visible pixels
- **THEN** the frame keeps showing its skeleton with the route title and the id review, and no snapshot record is written

---

### Requirement: Snapshot renderer

The inspector SHALL produce snapshots of frames that are not live through a single hidden renderer iframe that loads the same route preview URL contract as live frames. The renderer SHALL be laid out at the captured route's cached preview size from the frame size cache, initially its resolved viewport, with opacity 0, pointer-events none, the inert attribute, aria-hidden true and tabindex -1, and SHALL NOT use display: none. Before capture it SHALL measure the preview with the same function and the same 100vh guard as live frames, SHALL resize and re-measure at most twice when the result differs, and SHALL write the measured size to the frame size cache together with the snapshot record. It SHALL switch routes in place by replacing the prototypeRoute parameter of its own URL through history.replaceState and posting a Storybook channel FORCE_REMOUNT message directly to its window, never through its channel's emit method, and SHALL post the next FORCE_REMOUNT only after the previous render reached its finished phase. The renderer SHALL sit outside the element that declares the comment canvas (data-sbfx-canvas), inside a layer carrying data-sbfx-capture-ignore, so comment screenshots never include its page.

Before posting FORCE_REMOUNT, the inspector SHALL subscribe to the renderer's storyRenderPhaseChanged events through renderer.contentWindow.__STORYBOOK_ADDONS_CHANNEL__ or through a window message listener that accepts only messages whose source is renderer.contentWindow, and SHALL treat the switch as rendered only after it observes, after the post, a newPhase of loading followed by a newPhase of completed. When the frame's [data-prototype-root] element carries a data-route value that is one of the flow's route ids, that value SHALL also equal the target route. After any src change, the inspector SHALL wait for the iframe load event and a new contentDocument before reading __STORYBOOK_PREVIEW__ or attaching listeners. It SHALL reload its src instead of switching when the previous render has not reached its finished phase within 2 seconds, and SHALL reload its src when the render following a switch has not reached the completing phase within 2 seconds or has not completed within 6 seconds, after every 25 switches, and after a failed capture. A route whose story has not completed after a switch, a reload and one more attempt SHALL count as a failed capture. A route SHALL be captured only after its story render has completed, document.fonts is ready, its images are decoded and two animation frames have passed, each frame wait capped at 120 milliseconds.

Captures SHALL run one at a time at browser idle time, ordered by visible frames, then frames inside the expanded viewport, then all others, each group nearest the viewport center first, and SHALL pause while the camera moves, while a drag is active and while the document is hidden. When the camera starts moving or a drag starts, an in-flight capture SHALL be aborted through its AbortSignal at its next yield point and requeued; an aborted capture SHALL NOT count as a failed capture and SHALL NOT reload the renderer. When the current story id equals the prototype's flow export story id, read from figmaExport.flowStoryId with the fallbacks figmaExport.storyId, flow.figmaExport.storyId and flow.figmaExportStoryId, the inspector SHALL NOT start the snapshot renderer or write snapshot records, and frames that are not live SHALL show their skeletons.

#### Scenario: Snapshots fill in after the first open

- **WHEN** a 30-route prototype with no cached snapshots opens fitted at zoom 0.13
- **THEN** visible frames receive snapshots one at a time, nearest the viewport center first, while the camera stays idle

#### Scenario: Panning pauses capture

- **WHEN** the reviewer starts panning while a capture is in flight and 12 further captures are pending
- **THEN** the in-flight capture is aborted at its next yield point and requeued, and none of the 13 captures starts until the camera has been idle again

#### Scenario: A route switch never captures the previous route

- **WHEN** the renderer switches from route intake to route review, whose roots carry data-route intake and data-route review
- **THEN** the snapshot stored for review is captured only after a storyRenderPhaseChanged event with newPhase loading and then one with newPhase completed have been observed after the switch, and its serialized markup contains data-route="review"

#### Scenario: Comment screenshots leave out the renderer

- **WHEN** a reviewer places a comment on a transition line while the renderer is loaded with route intake
- **THEN** the comment's screenshot contains no page drawn from the renderer iframe

#### Scenario: The flow export story produces no snapshots

- **WHEN** the UI Flow is opened from the story pages-prototypes-example-prototype--static-flow, which the example prototype declares as its figmaExport.flowStoryId
- **THEN** the page holds 0 snapshot renderer iframes, 0 snapshot records are written, and frames that are not live show their skeletons

---

### Requirement: Snapshot cache and invalidation

Snapshot records SHALL be kept in an in-memory least-recently-used cache and in an IndexedDB database named prototype-inspector-snapshots with an object store named tiles, keyed '<formatVersion>|<storyId>|<prototypeId>|<routeId>|<viewportSignature>|default' and holding the image blob, its pixel size, the measured preview size, a 53-bit hash of the serialized markup, the capture time and the last-use time. The store SHALL be capped at 300 records and 60 megabytes, evicting the least recently used records first. Any IndexedDB failure SHALL fall back to memory-only caching without surfacing an error. Changing the snapshot format version SHALL leave all earlier records unused.

A cached snapshot SHALL be shown immediately and SHALL be revalidated exactly once per page session, visible frames first, by recapturing the route and comparing markup hashes, replacing the tile only when the hash differs. In development, each Vite vite:afterUpdate event SHALL additionally mark every snapshot of the open prototype stale and schedule one more revalidation of each, visible frames first, outside the once-per-session count; stale tiles SHALL stay visible with an updating indicator. An HMR-triggered recapture SHALL start only after the snapshot renderer has applied the same update, signalled by its own storyHotUpdated channel message received from renderer.contentWindow (matched by MessageEvent.source), followed by a quiet period of at least 100 milliseconds without further notifications. When the renderer is not loaded, HMR-triggered recaptures SHALL start after it loads, and when no renderer signal arrives within 2 seconds the renderer SHALL reload its src before capturing. A tile's updating indicator SHALL clear only when a capture that started after that signal completes. Updates applied while the UI Flow is not mounted in the same page session SHALL count as well: when the UI Flow mounts again, every snapshot revalidated before such an update SHALL show the updating indicator and be recaptured.

Only a live frame whose iframe was loaded from the plain route preview URL, whose story render has completed and that no canvas capability has marked as interacted since that load SHALL refresh its route's snapshot when its markup hash differs from the stored one. After an HMR notification, a live frame SHALL be re-hashed for this refresh only after its own storyHotUpdated message and the same quiet period.

#### Scenario: Reopening shows cached snapshots at once

- **WHEN** a 30-route prototype whose snapshots were captured in an earlier session is reopened
- **THEN** its frames show the cached snapshots at their cached preview sizes before any capture runs, and each visible route is recaptured exactly once in the background

#### Scenario: The opening fit does not delay cached snapshots

- **WHEN** a prototype whose snapshots are stored opens in a new browser tab with no stored camera, so the canvas fits the flow on open
- **THEN** the canvas is revealed with the cached snapshots in the commit right after the stored records are read, without waiting 120 milliseconds for the fit's camera idle

#### Scenario: Code edits refresh snapshots

- **WHEN** a route component is edited while the UI Flow is open in Storybook dev mode with 4 snapshot frames visible
- **THEN** the 4 visible snapshots show an updating indicator and are replaced by new captures whose markup hash differs

#### Scenario: Edits made outside the UI Flow refresh snapshots

- **WHEN** a route component is edited in Storybook dev mode while the Story mode is shown, after the UI Flow revalidated its 30 snapshots in the same page session
- **THEN** switching back to the UI Flow shows the 30 snapshots with an updating indicator and replaces them with captures of the edited code

#### Scenario: Edits are not captured from stale code

- **WHEN** a route heading is edited from "Review" to "Review request" and the inspector receives vite:afterUpdate before the renderer has applied the update
- **THEN** no recapture starts until the renderer's own storyHotUpdated message plus 100 milliseconds without further notifications, and the resulting tile shows "Review request"

#### Scenario: Interacted frames do not refresh snapshots

- **WHEN** a live frame was loaded with a parameter that another canvas capability adds to the route preview URL, or was marked interacted after its last load, and its markup hash differs from the stored one
- **THEN** the stored snapshot is not replaced from that frame until the frame has reloaded its plain route preview URL

##### Example: least-recently-used eviction

| Store state before write | New record | Store state after write |
| ----- | ----- | ----- |
| 300 records, oldest last used yesterday | 1 record of 20 KB | 300 records, the record last used yesterday removed |
| 120 records totaling 59.99 MB | 1 record of 40 KB | the least recently used records removed until the total is at most 60 MB |
| IndexedDB open throws | 1 record | record kept in memory only, no error shown |

---

### Requirement: Inactive frames stay inert

Every route preview iframe that is not in an interaction mode, including the snapshot renderer, SHALL carry pointer-events none, tabindex -1, aria-hidden true and the inert attribute, so pointer input reaches the canvas and keyboard navigation never moves focus into a route document.

#### Scenario: Tab does not enter route documents

- **WHEN** the reviewer presses Tab 20 times in the UI Flow with 3 live frames on screen
- **THEN** focus moves only between canvas controls and never into a route preview document
