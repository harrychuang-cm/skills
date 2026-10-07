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
const original = fs.readFileSync(`${root}/storybook-product-prototype/assets/prototype-inspector/flow-canvas.js`, "utf8");
const code = original
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(/^export (function|const) /gm, "$1 ");
const addons = { getChannel: () => ({ emit() {} }) };
const context = vm.createContext({ ...React, ...geometry, ...helper, console, URL, Date, JSON, Set, Map, UPDATE_GLOBALS: "UPDATE_GLOBALS", addons });
vm.runInContext(
  `${code}\nglobalThis.testApi = { PrototypeFlow, getPrototypeViewport, getRoutePreviewSource, createStorybookGlobals, openPrototypeExternalUrl };`,
  context,
);
const { PrototypeFlow } = context.testApi;

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
  ...React, ...geometry, ...helper, console, URL, URLSearchParams, Date, JSON, Set, Map, UPDATE_GLOBALS: "UPDATE_GLOBALS", addons,
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

console.log("PASS UI Flow server render: frames, flow node, control names, camera layers, fit tracking, frame labels, zoom menu, contrast, comment declarations, comment anchors, empty state");
