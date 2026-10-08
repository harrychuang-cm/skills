import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
// Server-renders the UI Flow canvas (assets/prototype-inspector/flow-canvas.js) the way
// test_authority_inspector.mjs renders preview.js: imports are stripped and their values are
// injected into a node:vm context. Run in the skill source checkout after installing the
// Storybook template dependencies: node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(`${root}/design-system-to-storybook/storybook-template/package.json`);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const geometry = await import(new URL("../assets/prototype-inspector/flow-canvas-geometry.js", import.meta.url));
const helper = await import(new URL("../assets/prototype-flow-layout/prototypeFlowLayout.ts", import.meta.url));
// flow-canvas.js imports the snapshot modules; the vm context gets their
// exports, with the IndexedDB adapter replaced by the memory adapter.
const snapshot = await import(new URL("../assets/prototype-inspector/flow-snapshot.js", import.meta.url));
const snapshotCacheModule = await import(new URL("../assets/prototype-inspector/flow-snapshot-cache.js", import.meta.url));
// Loaded natively, import.meta.hot is undefined: subscribeToCodeUpdates is a no-op.
const hmrModule = await import(new URL("../assets/prototype-inspector/flow-canvas-hmr.js", import.meta.url));
const snapshotModules = { ...snapshot, ...snapshotCacheModule, ...hmrModule, createIndexedDbAdapter: snapshotCacheModule.createMemoryAdapter };
const original = fs.readFileSync(`${root}/storybook-product-prototype/assets/prototype-inspector/flow-canvas.js`, "utf8");
const code = original
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(/^export (function|const) /gm, "$1 ");
const addons = { getChannel: () => ({ emit() {} }) };
const context = vm.createContext({ ...React, ...geometry, ...helper, ...snapshotModules, console, URL, Date, JSON, Set, Map, UPDATE_GLOBALS: "UPDATE_GLOBALS", addons });
vm.runInContext(
  `${code}\nglobalThis.testApi = { PrototypeFlow, applyMeasuredSize, getFlowLayoutPositions, getPrototypeViewport, getRoutePreviewSource, createStorybookGlobals, openPrototypeExternalUrl };`,
  context,
);
const { PrototypeFlow, applyMeasuredSize, getFlowLayoutPositions } = context.testApi;

// Frame size cache: measurements of a live frame go through applyMeasuredSize.
{
  const phone = { fallback: { height: 812, width: 375 }, viewportHeight: 812 };
  const measure = (sizes, height, width, appliedHeight) =>
    applyMeasuredSize(sizes, "vh", { ...phone, appliedHeight, size: { height, width } });
  // min-height: calc(100vh + 20px) grows once, however often it is re-measured.
  let sizes = measure({}, 832, 375, 812);
  assert.equal(sizes.vh.height, 832, "100vh content grows the frame once");
  sizes = measure(sizes, 852, 375, 832);
  sizes = measure(sizes, 852, 375, 832);
  assert.equal(sizes.vh.height, 832, "re-measuring 100vh feedback never grows the frame again");
  // A scrollbar narrows the content, never the frame below its viewport.
  assert.equal(measure({}, 832, 360, 812).vh.width, 375, "a frame stays at least as wide as its resolved viewport");
  assert.equal(measure({}, 812, 400, 812).vh.width, 400, "wider content still widens the frame");
  // A width change during feedback keeps the height baseline.
  let wide = measure({}, 832, 375, 812);
  wide = measure(wide, 852, 400, 832);
  assert.deepEqual([wide.vh.height, wide.vh.width], [832, 400], "the width applies while the height feedback is ignored");
  wide = measure(wide, 852, 400, 832);
  assert.equal(wide.vh.height, 832, "the height baseline survives a width-only change");
  // Real growth still applies, and noise under 2 px changes nothing.
  assert.equal(measure(sizes, 1040, 375, 832).vh.height, 1040, "content that really grows still grows the frame");
  assert.equal(measure(sizes, 833, 376, 832), sizes, "a change under 2 px leaves the cache unchanged");
}

const render = (prototype) => renderToStaticMarkup(React.createElement(PrototypeFlow, { prototype }));
const count = (html, pattern) => (html.match(pattern) ?? []).length;
const attr = (name, value) => new RegExp(`${name}="${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`);

const prototype = {
  id: "ssr-flow",
  figmaExport: { flowStoryId: "pages-prototypes-ssr-flow--static-flow" },
  flow: {
    routes: [
      { id: "intake", title: "Intake", flowGroup: "Requests", flowPosition: { x: 0, y: 0 } },
      { id: "review", title: "Review", navigationId: "review-tab", flowPosition: { x: 480, y: 0 } },
    ],
    nodes: [{ id: "decision", title: "Approve?", shape: "decision", flowPosition: { x: 960, y: 329 } }],
    transitions: [
      { from: "intake", to: "review", label: "Submit", flowLine: "key" },
      { from: "review", to: "decision", label: "Request approval", flowLine: "key" },
    ],
  },
};

const html = render(prototype);
assert.equal(count(html, /class="prototype-inspector__flow-frame"/g), 2, "one frame per route");
assert.equal(count(html, /class="prototype-inspector__flow-node"/g), 1, "one flow-only node");
for (const name of [
  "UI Flow zoom controls",
  "Zoom in",
  "Zoom out",
  "Fit canvas",
  "UI Flow layout controls",
  "Reset UI Flow layout",
  "Import UI Flow layout",
  "Export UI Flow layout",
  "Open Static Flow story for Figma export",
]) {
  assert.match(html, attr("aria-label", name), `control named ${name}`);
}
assert.match(html, attr("aria-label", "Intake"), "route frame named by its title");
assert.match(html, attr("aria-label", "Approve?"), "flow node named by its title");

// Camera canvas layers: the viewport holds the transformed world layer and the
// screen-space overlay; controls and dialogs are siblings of the viewport.
const layerOrder = [
  "prototype-inspector__flow-viewport",
  "prototype-inspector__flow-world",
  "prototype-inspector__flow-overlay",
  "prototype-inspector__flow-control-layer",
  "prototype-inspector__flow-dialog-layer",
].map((name) => html.indexOf(`class="${name}"`));
assert.ok(layerOrder.every((index) => index >= 0), `all five layers render: ${layerOrder}`);
assert.deepEqual([...layerOrder].sort((a, b) => a - b), layerOrder, "layers render in viewport, world, overlay, controls, dialogs order");
const worldStart = layerOrder[1];
const worldMarkup = html.slice(worldStart, layerOrder[2]);
assert.doesNotMatch(worldMarkup, /prototype-inspector__flow-controls/, "controls are not inside the world layer");
assert.match(worldMarkup, /transform:translate\([^)]*px, [^)]*px\) scale\([^)]*\)/, "the world layer carries the camera transform");
assert.match(html, /class="prototype-inspector__flow-overlay" style="--prototype-flow-camera-x:[^;"]*px;--prototype-flow-camera-y:[^;"]*px;--prototype-flow-camera-zoom:[0-9.]+"/, "the overlay carries the camera variables (x/y in px, zoom unitless)");
assert.match(html, /aria-label="Fit canvas" aria-pressed="true"/, "Fit canvas starts pressed (fit tracking on open)");
assert.doesNotMatch(html, /prototype-inspector__flow-(wrap|scaled|canvas)"/, "the scroll-based layers are gone");

// Frame labels live in the screen-space overlay: title, badge when a viewport is
// declared, the components button when the route has components, and a hover
// reveal with the route id and group name. Frames draw no in-frame header.
const overlayMarkup = html.slice(layerOrder[2], layerOrder[3]);
assert.equal(count(overlayMarkup, /class="prototype-inspector__flow-frame-label"/g), 2, "one label per route frame, in the overlay");
assert.doesNotMatch(worldMarkup, /<header/, "frames have no in-frame header");
assert.doesNotMatch(worldMarkup, /prototype-inspector__flow-frame-label/, "labels are not in the world layer");
for (const match of overlayMarkup.matchAll(/--prototype-flow-label-w(x|y):([^;"]+)/g)) {
  assert.match(match[2], /px$/, `label world coordinate --prototype-flow-label-w${match[1]} ends with px`);
}
assert.match(overlayMarkup, /--prototype-flow-label-wx:1px;--prototype-flow-label-wy:65px/, "the intake label sits at its preview's top-left (1, 65)");
assert.doesNotMatch(overlayMarkup, /prototype-inspector__flow-frame-badge/, "no badge without a declared viewport");
assert.doesNotMatch(overlayMarkup, /prototype-inspector__components-count/, "no components button without components");
assert.match(overlayMarkup, /<span class="prototype-inspector__flow-frame-reveal"><code>intake<\/code><span>Requests<\/span><\/span>/, "hover reveal shows the route id and flowGroup");
assert.match(overlayMarkup, /<code>review<\/code><span>review-tab<\/span>/, "hover reveal falls back to navigationId");

const desktop = render({ ...prototype, flow: { ...prototype.flow, viewport: { formFactor: "desktop", width: 1280, height: 800 } } });
assert.match(desktop, /<span class="prototype-inspector__flow-frame-badge">desktop · 1280x800<\/span>/, "declared desktop viewport shows its badge in the label");
const withComponents = render({
  ...prototype,
  components: { routes: [{ route: "intake", components: [{ name: "IntakeForm", origin: "new" }] }] },
});
assert.match(withComponents, /aria-label="Show 1 components for Intake"/, "routes with components get the components button");

// Zoom group: Zoom out, the percentage button (opens the zoom menu), Zoom in,
// Fit canvas; the menu is rendered hidden until opened.
assert.match(html, /<button aria-expanded="false" aria-haspopup="menu" class="prototype-inspector__flow-scale"[^>]*><span class="prototype-inspector__visually-hidden">Zoom menu <\/span><span>\d+%<\/span><\/button>/, "the percentage button is named 'Zoom menu <percentage>' and opens a menu");
const zoomGroup = html.slice(html.indexOf('aria-label="UI Flow zoom controls"'), html.indexOf('aria-label="UI Flow layout controls"'));
assert.deepEqual(
  [...zoomGroup.matchAll(/aria-label="(Zoom out|Zoom in|Fit canvas)"|class="prototype-inspector__flow-scale"/g)].map((match) => match[1] ?? "Zoom menu"),
  ["Zoom out", "Zoom menu", "Zoom in", "Fit canvas"],
  "zoom group order",
);
assert.match(zoomGroup, /<div aria-label="Zoom" class="prototype-inspector__flow-zoom-menu" hidden="" role="menu">/, "the zoom menu starts hidden");
for (const item of ["Zoom to fit", "50%", "100%", "200%"]) {
  assert.match(zoomGroup, new RegExp(`role="menuitem" type="button"><span>${item}</span>`), `zoom menu item ${item}`);
}
assert.match(zoomGroup, /<span>Zoom to fit<\/span><kbd>Shift\+1<\/kbd>/, "menu lists the fit shortcut");
assert.match(zoomGroup, /<span>100%<\/span><kbd>Shift\+0<\/kbd>/, "menu lists the 100% shortcut");
assert.match(zoomGroup, /<dt>Zoom to selection<\/dt><dd>Shift\+2<\/dd>/, "menu help lists Shift+2 (flow-canvas-editing)");
assert.match(zoomGroup, /<dt>Next \/ previous frame<\/dt><dd>N \/ Shift\+N<\/dd>/, "menu help lists N / Shift+N (flow-canvas-editing)");

// Reset confirm text uses on-primary over primary; both fallback themes reach 4.5:1.
const css = fs.readFileSync(`${root}/storybook-product-prototype/assets/prototype-inspector/prototype-inspector.css`, "utf8");
assert.match(css, /\.prototype-inspector__flow-reset-dialog-confirm \{\n  color: var\(--pi-sys-color-on-primary\);/, "Reset confirm text uses --pi-sys-color-on-primary");
const fallbacks = (name) => [...css.matchAll(new RegExp(`${name}: var\\(--sbt-sys-color-[a-z-]+, (#[0-9a-f]{6})\\)`, "g"))].map((match) => match[1]);
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const primary = fallbacks("--pi-sys-color-primary");
const onPrimary = fallbacks("--pi-sys-color-on-primary");
assert.deepEqual(primary.slice(0, 2), ["#2563eb", "#4f8df9"], "light and dark primary fallbacks");
for (const index of [0, 1]) {
  assert.ok(contrast(primary[index], onPrimary[index]) >= 4.5, `on-primary ${onPrimary[index]} on ${primary[index]} is ${contrast(primary[index], onPrimary[index]).toFixed(2)}:1`);
}

const withoutExport = render({ ...prototype, figmaExport: undefined });
assert.doesNotMatch(withoutExport, attr("aria-label", "Open Static Flow story for Figma export"), "no Static Flow button without a flow export story");

// figma-export review declarations on the UI Flow root. The Static Flow href is
// built from the preview URL, so that case renders with a browser-like window.
const flowRoot = (markup) => markup.match(/<div class="prototype-inspector prototype-inspector--flow"[^>]*>/)?.[0] ?? "";
const browserContext = vm.createContext({
  ...React, ...geometry, ...helper, ...snapshotModules, console, URL, URLSearchParams, Date, JSON, Set, Map, UPDATE_GLOBALS: "UPDATE_GLOBALS", addons,
  window: { location: new URL("http://localhost:6006/iframe.html?id=pages-prototypes-ssr-flow--default&viewMode=story") },
});
vm.runInContext(`${code}\nglobalThis.testApi = { PrototypeFlow };`, browserContext);
const browserRoot = flowRoot(renderToStaticMarkup(React.createElement(browserContext.testApi.PrototypeFlow, { prototype })));
assert.match(browserRoot, attr("data-sbfx-view", "ui-flow"), "the UI Flow root declares the ui-flow comment view");
assert.match(browserRoot, attr("data-sbfx-export", "unavailable"), "the UI Flow root declines Figma export");
assert.match(browserRoot, attr("data-sbfx-export-label", "Open Static Flow to export this flow."), "the export notice points to Static Flow");
const exportHref = browserRoot.match(/data-sbfx-export-href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
assert.ok(exportHref, "the UI Flow root links the Static Flow story");
assert.equal(new URL(exportHref).searchParams.get("path"), "/story/pages-prototypes-ssr-flow--static-flow", "the export href opens the Static Flow story");
// Level of detail, with a browser-like window so route preview URLs exist
// (before tiers, every route frame rendered its iframe here).
const browserRender = (props = {}) =>
  renderToStaticMarkup(React.createElement(browserContext.testApi.PrototypeFlow, { prototype, ...props }));
const opened = browserRender();
const frameTags = opened.match(/<article[^>]*class="prototype-inspector__flow-frame"[^>]*>/g) ?? [];
assert.equal(count(opened, /<iframe[^>]*src="[^"]*prototypeRoute=/g), 0, "the opening render holds no route iframe");
assert.equal(frameTags.length, 2, "both route frames render");
assert.ok(frameTags.every((tag) => /data-tier="(culled|placeholder|snapshot|live)"/.test(tag)), "every route frame carries its tier");
const hiddenTiers = browserRender({ initialTiers: { intake: "culled", review: "placeholder" } });
assert.equal(count(hiddenTiers, /data-sbfx-anchor="route:/g), 2, "culled and placeholder frames keep their route anchors");
assert.equal(count(hiddenTiers, /--prototype-flow-preview-height:/g), 2, "culled and placeholder frames keep their preview size");
assert.equal(count(hiddenTiers, /<iframe/g), 0, "culled and placeholder frames hold no iframe");
const liveTier = browserRender({ initialTiers: { intake: "live" } });
const liveFrame = liveTier.match(/<div class="prototype-inspector__flow-frame-preview"[^>]*data-sbfx-anchor="route:intake"[^>]*>(<iframe[^>]*>)/)?.[1] ?? "";
assert.ok(liveFrame, "the live frame's iframe is the first child of its preview");
assert.match(liveFrame, /inert=""/, "the live iframe is inert");
assert.match(liveFrame, attr("tabindex", "-1"), "the live iframe is out of the tab order");
assert.match(liveFrame, attr("aria-hidden", "true"), "the live iframe is hidden from assistive technology");
assert.match(liveFrame, /src="[^"]*prototypeRoute=intake/, "the live iframe loads its route");
assert.equal(count(liveTier, /<iframe/g), 1, "only the live frame holds an iframe");
assert.match(liveTier, /data-frame-id="review"[^>]*>/, "the other frame renders");
assert.match(liveTier, /prototype-inspector__flow-frame-skeleton/, "frames without a snapshot show the skeleton");
// Promotion does not flash blank: until its story has rendered, the live
// frame keeps its cover (here the skeleton) after the iframe, on top of it.
const loadingFrame = liveTier.match(/<article[^>]*data-frame-id="intake"[^>]*>[\s\S]*?<\/article>/)?.[0] ?? "";
assert.match(loadingFrame, /^<article[^>]*data-live-loading="true"/, "a live frame whose story has not rendered is marked loading");
assert.match(
  loadingFrame,
  /<iframe[^>]*><\/iframe><div aria-hidden="true" class="prototype-inspector__flow-frame-skeleton"/,
  "the loading live frame keeps its skeleton after (above) the iframe",
);
// Snapshots only for the current story: opening the UI Flow from the flow
// export story (Static Flow) neither waits for nor makes snapshots.
assert.match(browserRoot, attr("data-snapshot-preload", "pending"), "a regular story waits briefly for the cached snapshots");
const exportStoryContext = vm.createContext({
  ...React, ...geometry, ...helper, ...snapshotModules, console, URL, URLSearchParams, Date, JSON, Set, Map, UPDATE_GLOBALS: "UPDATE_GLOBALS", addons,
  window: { location: new URL("http://localhost:6006/iframe.html?id=pages-prototypes-ssr-flow--static-flow&viewMode=story") },
});
vm.runInContext(`${code}\nglobalThis.testApi = { PrototypeFlow };`, exportStoryContext);
const exportStoryRoot = flowRoot(renderToStaticMarkup(React.createElement(exportStoryContext.testApi.PrototypeFlow, { prototype })));
assert.ok(exportStoryRoot, "the flow export story renders the UI Flow");
assert.doesNotMatch(exportStoryRoot, /data-snapshot-preload/, "the flow export story does not wait for snapshots");
// Measured preview sizes stay out of the layout payload: positions only.
assert.deepEqual(
  JSON.parse(JSON.stringify(getFlowLayoutPositions(new Map([["review", { height: 1105, previewHeight: 1040, previewWidth: 375, width: 377, x: 10.4, y: 20.6 }]])))),
  { review: { x: 10, y: 21 } },
  "the layout payload stores rounded positions and no measured size",
);
assert.doesNotMatch(opened, /data-prototype-inspector-renderer/, "server renders hold no snapshot renderer");
assert.match(opened, /<div[^>]*class="prototype-inspector__flow-renderer-layer"[^>]*data-sbfx-capture-ignore="true"/, "comment captures ignore the renderer layer");
assert.ok(
  opened.indexOf("prototype-inspector__flow-renderer-layer") < opened.indexOf('class="prototype-inspector__flow-viewport"'),
  "the renderer layer sits outside (before) the comment canvas",
);

const noExportRoot = flowRoot(render({ ...prototype, figmaExport: undefined }));
assert.match(noExportRoot, attr("data-sbfx-view", "ui-flow"), "the ui-flow view is declared without a Static Flow story");
assert.match(noExportRoot, attr("data-sbfx-export", "unavailable"), "Figma export is declined without a Static Flow story");
assert.match(noExportRoot, attr("data-sbfx-export-label", "Figma export is not available in UI Flow."), "the notice says export is unavailable");
assert.doesNotMatch(noExportRoot, /data-sbfx-export-href/, "no Static Flow link without a Static Flow story");

// Comment anchors: each route's visible rect, the flow-only node, and each
// drawn key line; the complete flow declares the canvas coordinate space.
const element = (markup, pattern) => markup.match(pattern)?.[0] ?? "";
const intakePreview = element(html, /<div class="prototype-inspector__flow-frame-preview"[^>]*data-sbfx-anchor="route:intake"[^>]*>/);
assert.ok(intakePreview, "the intake preview area carries the route anchor");
assert.match(intakePreview, attr("data-sbfx-anchor-label", "Intake"), "the route anchor is named by the route title");
assert.match(intakePreview, attr("data-sbfx-anchor-route", "intake"), "the route anchor carries the route id");
assert.equal(count(html, /data-sbfx-anchor="route:intake"/g), 1, "one route anchor per route");
assert.equal(count(html, /data-sbfx-anchor="route:/g), 2, "every route frame carries an anchor");
const nodeElement = element(html, /<article[^>]*class="prototype-inspector__flow-node"[^>]*>/);
assert.match(nodeElement, attr("data-sbfx-anchor", "node:decision"), "the flow node carries its anchor");
assert.match(nodeElement, attr("data-sbfx-anchor-label", "Approve?"), "the node anchor is named by the node title");
const intakeLine = element(html, /<polyline[^>]*data-sbfx-anchor="edge:intake-&gt;review"[^>]*>/);
assert.ok(intakeLine, "the intake to review line carries the edge anchor");
assert.match(intakeLine, /class="prototype-inspector__flow-line"/, "the edge anchor sits on the line geometry");
assert.match(intakeLine, attr("data-sbfx-anchor-kind", "path"), "the edge anchor is a path anchor");
assert.match(intakeLine, attr("data-sbfx-anchor-label", "Intake → Review"), "the edge anchor is named source → target");
assert.match(html, /<polyline[^>]*data-sbfx-anchor="edge:review-&gt;decision"[^>]*data-sbfx-anchor-label="Review → Approve\?"/, "a line into a flow node is named by the node title");
assert.match(element(html, /<div class="prototype-inspector__flow-viewport"[^>]*>/), /data-sbfx-canvas=""/, "the complete flow viewport declares the canvas");
assert.match(element(html, /<div class="prototype-inspector__flow-world"[^>]*>/), /data-sbfx-canvas-world=""/, "the world layer declares the world coordinate space");

const empty = render({ id: "empty-flow", flow: { routes: [] } });
assert.match(empty, /prototype-inspector__empty/, "a flow without routes renders the empty state");
assert.match(empty, /data-sbfx-comments="unavailable"/, "an empty UI Flow offers no comments");

// Journey focus (flow-journey-focus): the journey list and the simplified
// view. The selection comes from a window.sessionStorage stub.
const example = await import(
  new URL("../../design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/examplePrototypeFlow.ts", import.meta.url)
);
const storageStub = (entries) => {
  const storage = new Map(Object.entries(entries));

  return {
    getItem: (key) => storage.get(key) ?? null,
    removeItem: (key) => storage.delete(key),
    setItem: (key, value) => storage.set(key, String(value)),
  };
};
// sessionStorage entries select a journey; localStorage entries carry auto
// layout names (the layout helper is imported natively and reads neither).
const journeyRender = (prototypeValue, stored = {}, local = {}, props = {}) => {
  const journeyContext = vm.createContext({
    ...React, ...geometry, ...helper, ...snapshotModules, console, URL, URLSearchParams, Date, JSON, Set, Map, UPDATE_GLOBALS: "UPDATE_GLOBALS", addons,
    window: {
      location: new URL("http://localhost:6006/iframe.html?id=pages-prototypes-journeys--default&viewMode=story"),
      localStorage: storageStub(local),
      sessionStorage: storageStub(stored),
    },
  });
  vm.runInContext(`${code}\nglobalThis.testApi = { PrototypeFlow };`, journeyContext);
  return renderToStaticMarkup(React.createElement(journeyContext.testApi.PrototypeFlow, { ...props, prototype: prototypeValue }));
};
const journeyList = (markup) => markup.match(/<section aria-label="UI Flow journeys"[\s\S]*?<\/section>/)?.[0] ?? "";
const journeyButtons = (markup) =>
  [...journeyList(markup).matchAll(/<button aria-label="([^"]+)" aria-pressed="(true|false)" class="prototype-inspector__flow-journey"/g)].map(
    (match) => `${match[1]}${match[2] === "true" ? " *" : ""}`,
  );
const examplePrototype = { id: "example-prototype", flow: example.examplePrototypeFlow };
const { journeys: _declared, ...exampleFlowWithoutJourneys } = example.examplePrototypeFlow;
const undeclaredExample = { id: "example-prototype", flow: exampleFlowWithoutJourneys };
{
  // One branch node with three targets; the derived journey to route a equals
  // a declaration and is left out.
  const branching = {
    id: "branching",
    flow: {
      routes: [
        { id: "start", title: "Start", flowPosition: { x: 0, y: 0 } },
        { id: "a", title: "Route A", flowPosition: { x: 960, y: 0 } },
        { id: "b", title: "Route B", flowPosition: { x: 960, y: 960 } },
        { id: "c", title: "Route C", flowPosition: { x: 960, y: 1920 } },
      ],
      nodes: [{ id: "choice", title: "Choose?", shape: "decision", flowPosition: { x: 480, y: 329 } }],
      transitions: [
        { from: "start", to: "choice", label: "Go", flowLine: "key" },
        { from: "choice", to: "a", label: "A", flowLine: "key", kind: "condition" },
        { from: "choice", to: "b", label: "B", flowLine: "key", kind: "condition" },
        { from: "choice", to: "c", label: "C", flowLine: "reference", kind: "condition" },
      ],
      journeys: [
        { id: "pick-a", title: "Pick A", steps: ["start", "choice", "a"] },
        { id: "tour", title: "Tour", steps: ["start", "a", "b"] },
      ],
    },
  };
  const markup = journeyRender(branching);
  const list = journeyList(markup);

  assert.deepEqual(journeyButtons(markup), ["All *", "Pick A", "Tour", "B · Route B", "C · Route C"], "全部, the declared journeys, then the uncovered derived journeys");
  assert.equal(count(list, /<span class="prototype-inspector__flow-journey-count">3 步<\/span>/g), 4, "every journey entry shows its step count");
  assert.match(list, /<h3>自動分支<\/h3><div class="prototype-inspector__flow-journeys-group"><h4>Choose\?<\/h4><ul><li><button aria-label="B · Route B"/, "derived journeys are grouped under their branch node's title");
  assert.match(markup, /^<div class="prototype-inspector prototype-inspector--flow"[^>]*><section aria-label="UI Flow journeys"/, "the list is the flow root's first child");
  assert.match(list, /^<section aria-label="UI Flow journeys" class="prototype-inspector__flow-journeys" data-sbfx-capture-ignore="true" role="region">/, "the list is a region named UI Flow journeys that comment screenshots leave out");
  assert.doesNotMatch(markup, /data-sbfx-comments=/, "the list leaves comments available");
  assert.match(list, /<button aria-expanded="true" aria-label="Collapse journey list" class="prototype-inspector__flow-journeys-toggle"/, "the collapse toggle is named and expanded on mount");
  assert.match(list, /<button aria-label="All" aria-pressed="true" class="prototype-inspector__flow-journey" type="button"><span class="prototype-inspector__flow-journey-title">全部<\/span><\/button>/, "全部 is named All and starts selected");
  assert.match(flowRoot(markup), attr("data-journey-list", "expanded"), "the root states the expanded list");
  assert.match(flowRoot(markup), /--prototype-flow-journey-list-width:calc\(var\(--pi-ref-size-80\) \* 3\)/, "the root carries the 240 px list width");
  assert.doesNotMatch(flowRoot(markup), /data-journey-focus/, "the complete flow is not a journey focus");
  assert.match(markup, /<dt>切換功能流程<\/dt><dd>\[ \/ \]<\/dd>/, "the zoom menu lists [ / ] while the list renders");
}
{
  const declaredMarkup = journeyRender(examplePrototype);

  assert.deepEqual(journeyButtons(declaredMarkup), ["All *", "Approve a request", "Request changes"], "the example lists its two declared journeys");
  assert.equal(count(journeyList(declaredMarkup), /4 步/g), 2, "both declared journeys have 4 steps");
  assert.doesNotMatch(declaredMarkup, /自動分支/, "declarations cover the example's derived journeys");
  const undeclaredMarkup = journeyRender(undeclaredExample);

  assert.deepEqual(
    journeyButtons(undeclaredMarkup),
    ["All *", "Approved · Implementation Handoff", "Needs changes · ↩ Review Request"],
    "without journeys the example derives two journeys",
  );
  assert.match(journeyList(undeclaredMarkup), /<h4>Ready for handoff\?<\/h4>/, "under the approval decision's title");
  // A flow with neither journeys nor a branch node: no list, no [ / ]
  // (spec example "a linear flow").
  const linear = journeyRender({
    id: "linear",
    flow: {
      routes: [{ id: "home", title: "Home" }, { id: "detail", title: "Detail" }, { id: "done", title: "Done" }],
      transitions: [
        { from: "home", to: "detail", label: "Open detail", flowLine: "key" },
        { from: "detail", to: "done", label: "Finish", flowLine: "key" },
      ],
    },
  });

  assert.doesNotMatch(linear, /UI Flow journeys/, "a linear flow renders no journey list");
  assert.doesNotMatch(flowRoot(linear), /data-journey-list|--prototype-flow-journey-list-width/, "a linear flow's viewport spans the whole tab");
  assert.doesNotMatch(linear, /\[ \/ \]/, "a linear flow lists no [ / ] help");
  assert.doesNotMatch(html, /UI Flow journeys/, "no journey list with a single entry");
  assert.doesNotMatch(html, /\[ \/ \]/, "no [ / ] help without the list");
  assert.doesNotMatch(flowRoot(html), /data-journey-list|--prototype-flow-journey-list-width/, "the viewport spans the whole tab without a list");
  // sessionStorage restores the selection; an unknown entry falls back to 全部.
  const storageKey = "prototype-inspector:flow-journey:example-prototype";
  const restored = journeyRender(examplePrototype, { [storageKey]: "declared:request-changes" });

  assert.deepEqual(journeyButtons(restored), ["All", "Approve a request", "Request changes *"], "the stored entry is selected again");
  assert.match(flowRoot(restored), attr("data-journey-focus", "declared:request-changes"), "the root names the shown journey");
  assert.deepEqual(journeyButtons(journeyRender(examplePrototype, { [storageKey]: "declared:gone" })), ["All *", "Approve a request", "Request changes"], "an unknown stored entry shows 全部");

  // The request-changes view: one instance per step, keyed by instance key.
  const world = restored.slice(restored.indexOf('class="prototype-inspector__flow-world"'), restored.indexOf('class="prototype-inspector__flow-overlay"'));
  const overlay = restored.slice(restored.indexOf('class="prototype-inspector__flow-overlay"'), restored.indexOf('class="prototype-inspector__flow-control-layer"'));

  assert.equal(count(world, /class="prototype-inspector__flow-frame"/g), 3, "three route instances");
  assert.equal(count(world, /class="prototype-inspector__flow-node"/g), 1, "one flow node instance");
  assert.deepEqual(
    [...world.matchAll(/<article[^>]*data-frame-id="([^"]+)"/g)].map((match) => match[1]).sort(),
    ["0:intake", "1:review", "2:approval-decision", "3:review"],
    "instance keys are distinct",
  );
  assert.equal(count(restored, /data-sbfx-anchor="route:review"/g), 1, "one route:review anchor");
  assert.match(element(world, /<article[^>]*data-frame-id="1:review"[\s\S]*?<\/article>/), /data-sbfx-anchor="route:review"/, "the anchor is on the first review instance");
  assert.equal(count(world, /<g data-journey-edge=/g), 3, "exactly three journey edges");
  assert.equal(count(world, /data-sbfx-anchor="edge:/g), 3, "each first transition pair carries its edge anchor");
  assert.match(world, /data-sbfx-anchor="edge:approval-decision-&gt;review"/, "the condition edge is anchored");
  assert.match(overlay, /class="prototype-inspector__flow-edge-label prototype-inspector__flow-journey-label"[^>]*>條件 Needs changes<\/div>/, "the condition edge is labelled 條件 Needs changes");
  assert.deepEqual(
    [...overlay.matchAll(/class="prototype-inspector__flow-frame-label" data-frame-id="([^"]+)"/g)].map((match) => match[1]),
    ["0:intake", "1:review", "3:review"],
    "one frame label per route instance",
  );
  assert.match(element(restored, /<div class="prototype-inspector__flow-viewport"[^>]*>/), /data-sbfx-canvas=""/, "the journey viewport keeps the comment canvas");
  assert.doesNotMatch(element(restored, /<div class="prototype-inspector__flow-world"[^>]*>/), /data-sbfx-canvas-world/, "the journey world declares no canvas world");
  // The journey view is read-only.
  assert.match(restored, /aria-label="Reset UI Flow layout" disabled=""/, "Reset is disabled in a journey view");
  assert.match(restored, /aria-label="Import UI Flow layout" disabled=""/, "Import is disabled in a journey view");
  assert.match(restored, /<p class="prototype-inspector__flow-journey-notice">簡化檢視：位置不會儲存<\/p>/, "the read-only notice is shown");
  assert.doesNotMatch(declaredMarkup, /prototype-inspector__flow-journey-notice|aria-label="Import UI Flow layout" disabled/, "the complete flow keeps Import and shows no notice");
  // The selected entry lists its steps and the edge labels between them.
  assert.match(
    journeyList(restored),
    /<ol class="prototype-inspector__flow-journey-steps"><li><span>Project Intake<\/span><span class="prototype-inspector__flow-journey-step-edge">↓ 點擊 Submit intake<\/span><\/li>/,
    "the selected journey lists its steps with edge labels",
  );

  // More than 24 derived journeys: 24 are listed, with the exact remainder.
  const targets = Array.from({ length: 30 }, (_, index) => `t${String(index + 1).padStart(2, "0")}`);
  const fanOut = journeyRender({
    id: "fan-out",
    flow: {
      routes: [{ id: "hub", title: "Hub" }, ...targets.map((id) => ({ id, title: `Target ${id}` }))],
      transitions: targets.map((id) => ({ from: "hub", to: id, label: `Go ${id}`, flowLine: "key" })),
    },
  });

  assert.equal(journeyButtons(fanOut).length, 25, "全部 and the first 24 derived journeys");
  assert.match(journeyList(fanOut), /<p class="prototype-inspector__flow-journeys-note">另有 6 條未列出，建議在 flow 宣告 journeys<\/p>/, "the list states the 6 journeys left out");
  assert.doesNotMatch(journeyList(undeclaredMarkup), /prototype-inspector__flow-journeys-note/, "no note when nothing is left out");

  // A derived journey with a loop target ends with its loop marker.
  const looped = journeyRender(undeclaredExample, { [storageKey]: "derived:approval-decision:review" });

  assert.match(looped, /<div class="prototype-inspector__flow-journey-loop"[^>]*>↩ Review Request<\/div>/, "the Needs changes journey ends with ↩ Review Request");
  assert.match(journeyList(looped), /<span class="prototype-inspector__flow-journey-step-loop">↩ Review Request<\/span><\/li><\/ol>/, "the list detail ends with the loop marker text");
}

// Auto layout (flow-auto-layout): the button leads the layout group, asks
// nothing on open, and is disabled in a journey view.
{
  const layoutGroup = html.slice(html.indexOf('aria-label="UI Flow layout controls"'));

  assert.match(
    layoutGroup,
    /<button aria-label="Auto layout UI Flow" class="prototype-inspector__flow-auto-layout-button" title="[^"]+" type="button">Auto Layout<\/button>/,
    "the Auto Layout button is named Auto layout UI Flow",
  );
  assert.ok(
    layoutGroup.indexOf('aria-label="Auto layout UI Flow"') < layoutGroup.indexOf('aria-label="Reset UI Flow layout"'),
    "Auto Layout comes before Reset in the layout group",
  );
  assert.doesNotMatch(html, /Auto layout this UI Flow\?|prototype-inspector__flow-auto-layout-notice/, "no dialog or notice on open");
  const journeyView = journeyRender(examplePrototype, { "prototype-inspector:flow-journey:example-prototype": "declared:request-changes" });

  assert.match(journeyView, /aria-label="Auto layout UI Flow" class="prototype-inspector__flow-auto-layout-button" disabled=""/, "Auto Layout is disabled in a journey view");

  // Stored feature names: shown beside their anchor frames when the record
  // matches the flow's viewport, skipped when the anchor is gone.
  const lanesKey = "prototype-inspector:flow-lanes:example-prototype";
  const record = (viewport) =>
    JSON.stringify({
      labels: [
        { anchor: "intake", key: "declared:approve-request", title: "Approve a request" },
        { anchor: "handoff", key: "other", title: "Other screens" },
        { anchor: "missing-route", key: "declared:gone", title: "Gone" },
      ],
      version: 1,
      viewport,
    });
  const named = journeyRender(examplePrototype, {}, { [lanesKey]: record(null) });
  const names = [...named.matchAll(/<div class="prototype-inspector__flow-lane-label" data-lane-anchor="([^"]+)" data-lane-key="([^"]+)" style="([^"]+)">([^<]+)<\/div>/g)].map(
    (match) => ({ anchor: match[1], key: match[2], style: match[3], text: match[4] }),
  );

  assert.deepEqual(
    names.map(({ anchor, key, text }) => [anchor, key, text]),
    [
      ["intake", "declared:approve-request", "Approve a request"],
      ["handoff", "other", "Other screens"],
    ],
    "two names, the one on a missing frame skipped",
  );
  assert.equal(names[0].style, "--prototype-flow-label-wx:1px;--prototype-flow-label-wy:65px", "a name sits at its frame's visible rect");
  const overlayEnd = named.indexOf('class="prototype-inspector__flow-control-layer"');

  assert.ok(named.indexOf("prototype-inspector__flow-lane-label") < overlayEnd, "names are drawn in the screen-space overlay");
  const desktopPrototype = { ...examplePrototype, flow: { ...examplePrototype.flow, viewport: { formFactor: "desktop", height: 800, width: 1280 } } };

  assert.doesNotMatch(journeyRender(desktopPrototype, {}, { [lanesKey]: record(null) }), /flow-lane-label/, "an unsigned (phone) record is not shown for a desktop flow");
  assert.match(journeyRender(desktopPrototype, {}, { [lanesKey]: record("desktop:1280x800") }), /flow-lane-label/, "a record signed for the flow's viewport is shown");
  assert.doesNotMatch(
    journeyRender(examplePrototype, { "prototype-inspector:flow-journey:example-prototype": "declared:request-changes" }, { [lanesKey]: record(null) }),
    /flow-lane-label/,
    "a journey view shows no feature names",
  );
}

// Canvas editing (flow-canvas-editing): the selection.
{
  const selected = renderToStaticMarkup(React.createElement(PrototypeFlow, { initialSelection: ["intake"], prototype }));
  const selectedFrames = [...selected.matchAll(/<(?:article)[^>]*data-frame-id="([^"]+)"[^>]*data-selected="true"/g)].map((match) => match[1]);

  assert.deepEqual(selectedFrames, ["intake"], "only the selected frame carries data-selected");
  assert.match(selected, /<div class="prototype-inspector__flow-selection" data-sbfx-capture-ignore="true">/, "comment screenshots ignore the selection outlines");
  assert.match(
    selected,
    /<div class="prototype-inspector__flow-selection-outline" data-frame-outline="intake" data-selected="true" style="--prototype-flow-outline-wx:1px;--prototype-flow-outline-wy:65px;--prototype-flow-outline-ww:375px;--prototype-flow-outline-wh:812px"><\/div>/,
    "the selected frame's outline wraps its visible rect",
  );
  assert.equal(count(selected, /data-frame-outline="/g), 3, "every displayed frame has an outline, hidden unless selected");
  assert.equal(count(selected, /flow-selection-outline" data-frame-outline="[^"]+" data-selected="true"/g), 1, "one outline shown");
  // Snapping guides: the approved token with its light and dark fallbacks,
  // and two guide lines rendered hidden in a layer screenshots ignore.
  assert.match(css, /--pi-sys-color-annotation-touch-target: var\(--sbt-sys-color-annotation-touch-target, #db2777\);/, "guide token, light fallback");
  assert.match(css, /--pi-sys-color-annotation-touch-target: var\(--sbt-sys-color-annotation-touch-target, #f472b6\);/, "guide token, dark fallback");
  assert.match(
    selected,
    /<div class="prototype-inspector__flow-guides" data-sbfx-capture-ignore="true"><div class="prototype-inspector__flow-guide" data-axis="x" hidden=""><\/div><div class="prototype-inspector__flow-guide" data-axis="y" hidden=""><\/div><\/div>/,
    "two hidden guide lines",
  );
}

// Minimap: shown for 8 frames or more (routes and flow nodes together),
// inside the viewport, ignored by comment screenshots; a stored choice wins.
{
  const flowOf = (routeCount, nodeCount = 0) => ({
    id: `minimap-${routeCount}-${nodeCount}`,
    flow: {
      nodes: Array.from({ length: nodeCount }, (_, index) => ({ id: `n${index}`, shape: "decision", title: `N${index}` })),
      routes: Array.from({ length: routeCount }, (_, index) => ({ id: `r${index}`, title: `R${index}` })),
      transitions: [],
    },
  });
  const hasMinimap = (markup) => /class="prototype-inspector__flow-minimap"/.test(markup);
  const thirty = journeyRender(flowOf(30));

  assert.ok(hasMinimap(thirty), "30 routes show the minimap");
  assert.ok(!hasMinimap(journeyRender(flowOf(5))), "5 routes hide it");
  assert.ok(hasMinimap(journeyRender(flowOf(7, 1))), "7 routes and 1 flow node show it");
  const viewportMarkup = thirty.slice(thirty.indexOf('class="prototype-inspector__flow-viewport"'), thirty.indexOf('class="prototype-inspector__flow-control-layer"'));

  assert.match(viewportMarkup, /<svg aria-hidden="true" class="prototype-inspector__flow-minimap" data-sbfx-capture-ignore="true"/, "the minimap sits inside the viewport and screenshots ignore it");
  assert.equal(count(viewportMarkup, /class="prototype-inspector__flow-minimap-frame"/g), 30, "one minimap rectangle per frame");
  assert.ok(!hasMinimap(journeyRender(flowOf(30), {}, { "prototype-inspector:flow-minimap": "hidden" })), "a stored choice hides it");
  assert.ok(hasMinimap(journeyRender(flowOf(5), {}, { "prototype-inspector:flow-minimap": "shown" })), "a stored choice shows it");
  assert.match(thirty, /role="menuitemcheckbox" type="button"><span>Minimap<\/span><kbd>On<\/kbd>/, "the zoom menu toggles the minimap");
}

// Flow group sections: a flowGroup of two or more routes draws one section
// (inline fill, first in the world layer, kept by comment screenshots); a
// one-route group draws none even with a flow node of that group; an auto
// layout name for the group replaces the section name; a stored choice or a
// journey view hides sections.
{
  const sectionsFlow = {
    id: "sections",
    flow: {
      nodes: [{ id: "decide", flowGroup: "Solo", flowPosition: { x: 480, y: 1200 }, shape: "decision", title: "Decide?" }],
      routes: [
        ...["a", "b", "c", "d"].map((id, index) => ({ id, flowGroup: "Checkout", flowPosition: { x: index * 480, y: 0 }, title: id.toUpperCase() })),
        { id: "e", flowGroup: "Solo", flowPosition: { x: 0, y: 1200 }, title: "E" },
      ],
      transitions: [],
    },
  };
  const markup = journeyRender(sectionsFlow);
  const world = markup.slice(markup.indexOf('class="prototype-inspector__flow-world"'));

  assert.match(world, /^class="prototype-inspector__flow-world"[^>]*><svg aria-hidden="true" class="prototype-inspector__flow-sections"/, "sections are the first child of the world layer");
  const paths = [...markup.matchAll(/<path class="prototype-inspector__flow-section" d="([^"]+)" data-section-group="([^"]+)" style="([^"]+)"/g)];

  assert.deepEqual(paths.map((match) => match[2]), ["Checkout"], "only the four-route group draws a section");
  assert.equal(paths[0][3], "fill:var(--pi-sys-color-surface-raised)", "the fill is an inline style");
  assert.equal((paths[0][1].match(/M/g) ?? []).length, 4, "the section joins its four padded member boxes");
  assert.doesNotMatch(markup.match(/<svg aria-hidden="true" class="prototype-inspector__flow-sections"[^>]*>/)[0], /data-sbfx-capture-ignore/, "comment screenshots keep sections");
  const overlay = markup.slice(markup.indexOf('class="prototype-inspector__flow-overlay"'), markup.indexOf('class="prototype-inspector__flow-control-layer"'));

  assert.match(overlay, /<div class="prototype-inspector__flow-section-label" data-section-group="Checkout" style="[^"]+">Checkout<\/div>/, "the group name is drawn in the screen-space overlay");
  assert.match(markup, /role="menuitemcheckbox" type="button"><span>Sections<\/span><kbd>On<\/kbd>/, "the zoom menu toggles sections, shown by default");
  const hidden = journeyRender(sectionsFlow, {}, { "prototype-inspector:flow-sections": "hidden" });

  assert.doesNotMatch(hidden, /prototype-inspector__flow-section/, "a stored choice hides sections and their names");
  assert.match(hidden, /<span>Sections<\/span><kbd>Off<\/kbd>/, "the menu shows the stored choice");
  const laneNamed = journeyRender(sectionsFlow, {}, {
    "prototype-inspector:flow-lanes:sections": JSON.stringify({ labels: [{ anchor: "a", key: "group:Checkout", title: "Checkout" }], version: 1, viewport: null }),
  });

  assert.match(laneNamed, /data-section-group="Checkout"/, "the section stays under an auto layout name");
  assert.doesNotMatch(laneNamed, /prototype-inspector__flow-section-label/, "an auto layout name for the group replaces the section name");
  assert.doesNotMatch(
    journeyRender(examplePrototype, { "prototype-inspector:flow-journey:example-prototype": "declared:request-changes" }),
    /prototype-inspector__flow-section/,
    "a journey view draws no sections",
  );
}

// Editing in a journey view: the selection holds step instances, so of the
// two review steps only the selected one is outlined.
{
  const journeySelected = journeyRender(
    examplePrototype,
    { "prototype-inspector:flow-journey:example-prototype": "declared:request-changes" },
    {},
    { initialSelection: ["3:review"] },
  );
  const shownOutlines = [...journeySelected.matchAll(/flow-selection-outline" data-frame-outline="([^"]+)" data-selected="true"/g)].map((match) => match[1]);

  assert.deepEqual(shownOutlines, ["3:review"], "only the selected step instance is outlined");
  assert.equal(count(journeySelected, /data-frame-outline="\d+:review"/g), 2, "both review steps have outlines");
  assert.equal(count(journeySelected, /<article[^>]*data-selected="true"/g), 1, "one frame instance carries data-selected");
  assert.doesNotMatch(journeySelected, /prototype-inspector__flow-section/, "no sections in the journey view");
}

console.log("PASS UI Flow server render: frames, flow node, control names, camera layers, fit tracking, frame labels, zoom menu, contrast, comment declarations, comment anchors, empty state, frame size cache, level of detail, journey list, journey focus view, read-only journey view, auto layout button and feature names, selection, snapping guides, minimap, flow group sections, journey view editing");
