// Pure UI Flow geometry tests: node --test storybook-product-prototype/scripts/test_flow_canvas_geometry.test.mjs
//
// test_flow_canvas_geometry.fixture.json holds outputs produced by the
// pre-move preview.js (see its "about" and "source" fields). Every case here
// recomputes the same value from flow-canvas-geometry.js and must match
// exactly, which proves the move out of preview.js changed no behavior.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import * as geometry from "../assets/prototype-inspector/flow-canvas-geometry.js";

const golden = JSON.parse(
  fs.readFileSync(new URL("./test_flow_canvas_geometry.fixture.json", import.meta.url), "utf8"),
);

const tag = (value) => Object.prototype.toString.call(value);

// Same encoding as the fixture: Map, Set, undefined and non-JSON numbers
// become sentinel objects so deep comparison stays exact.
function encode(value) {
  if (value === undefined) return { $undefined: true };
  if (typeof value === "number") {
    if (Number.isNaN(value)) return { $number: "NaN" };
    if (value === Infinity) return { $number: "Infinity" };
    if (value === -Infinity) return { $number: "-Infinity" };
    if (Object.is(value, -0)) return { $number: "-0" };
    return value;
  }
  if (tag(value) === "[object Map]") {
    return { $map: [...value].map(([key, item]) => [encode(key), encode(item)]) };
  }
  if (tag(value) === "[object Set]") return { $set: [...value].map(encode) };
  if (Array.isArray(value)) return value.map(encode);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
  }
  return value;
}

function decode(value) {
  if (Array.isArray(value)) return value.map(decode);
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 1) {
      if (keys[0] === "$undefined") return undefined;
      if (keys[0] === "$number") return Number(value.$number);
      if (keys[0] === "$map") {
        return new Map(value.$map.map(([key, item]) => [decode(key), decode(item)]));
      }
      if (keys[0] === "$set") return new Set(value.$set.map(decode));
    }
    return Object.fromEntries(keys.map((key) => [key, decode(value[key])]));
  }
  return value;
}

// Stands in for preview.js getDefaultPreviewDimension on a page whose tier
// tokens live only on documentElement (the fixture's setup).
function createTokenReader(tokens, reads) {
  return (cssVariableName, fallbackValue) => {
    reads.push(cssVariableName);
    const parsedValue = Number.parseFloat(String(tokens[cssVariableName] ?? "").trim());
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue;
  };
}

// The steps PrototypeFlow runs on these helpers; values from code that stays
// in preview.js (canvas metrics, display positions, label scales) come from
// the fixture.
function runFlow(fixture) {
  const prototype = decode(fixture.input.prototype);
  const previewSizes = decode(fixture.input.previewSizes);
  const draggedPositions = decode(fixture.input.draggedPositions);
  const flow = prototype.flow;
  const routes = geometry.normalizeRoutes(flow);
  const flowNodes = geometry.normalizeFlowNodes(flow);
  const transitions = geometry.normalizeTransitions(flow);
  const canvasNodeIds = new Set([
    ...routes.map((route) => route.id),
    ...flowNodes.map((node) => node.id),
  ]);
  const readDimension = createTokenReader({}, []);
  const prototypeViewport = geometry.resolvePrototypeViewport(prototype, null, readDimension);
  const fallbackGridPitch = geometry.getFallbackGridPitch({
    height: prototypeViewport.height + geometry.nodeHeaderHeight + geometry.nodeFrameSize,
    width: prototypeViewport.width + geometry.nodeFrameSize,
  });
  const routePositionMap = new Map();

  routes.forEach((route, index) => {
    const position =
      draggedPositions[route.id] ?? geometry.getRoutePosition(route, index, fallbackGridPitch);
    const routeViewport = geometry.resolvePrototypeViewport(prototype, route, readDimension);
    const previewSize = previewSizes[route.id] ?? {};
    const previewHeight = previewSize.height ?? routeViewport.height;
    const previewWidth = previewSize.width ?? routeViewport.width;

    routePositionMap.set(route.id, {
      ...position,
      height: previewHeight + geometry.nodeHeaderHeight + geometry.nodeFrameSize,
      nodeType: "route",
      previewHeight,
      previewWidth,
      width: previewWidth + geometry.nodeFrameSize,
    });
  });

  flowNodes.forEach((node, index) => {
    const size = geometry.getFlowMetadataNodeSize(node);
    const position =
      draggedPositions[node.id] ??
      geometry.getRoutePosition(node, routes.length + index, fallbackGridPitch);

    routePositionMap.set(node.id, {
      ...position,
      ...size,
      description: node.description,
      flowGroup: node.flowGroup,
      nodeType: "flow",
      shape: node.shape,
      title: node.title,
      tone: node.tone,
    });
  });

  const allEdges = geometry.aggregateTransitions(transitions, canvasNodeIds);
  const allEdgesEncoded = encode(allEdges);
  const edges = geometry.addFlowEdgeColorVariants(allEdges.filter(geometry.isVisibleFlowEdge));
  const edgeKeys = new Set(edges.map((edge) => edge.key));
  const reverseEdgeKeys = new Set(
    edges.filter((edge) => edgeKeys.has(`${edge.to}->${edge.from}`)).map((edge) => edge.key),
  );
  const canvasMetrics = decode(fixture.fromPreview.canvasMetrics);
  const displayMap = new Map(decode(fixture.fromPreview.displayPositions));
  const renderedEdges = edges
    .map((edge) => ({
      ...edge,
      polyline: geometry.createPolyline(edge, displayMap, reverseEdgeKeys),
    }))
    .filter((edge) => edge.polyline);
  const labelPositions = fixture.fromPreview.labelScales.map(({ labelScale }) =>
    encode(
      geometry
        .placeEdgeLabels(renderedEdges, displayMap, canvasMetrics, labelScale)
        .map((edge) => [edge.key, edge.polyline.labelPosition]),
    ),
  );

  return {
    prototypeViewport: encode(prototypeViewport),
    fallbackGridPitch: encode(fallbackGridPitch),
    routePositions: encode([...routePositionMap]),
    allEdges: allEdgesEncoded,
    edges: encode(edges),
    reverseEdgeKeys: encode([...reverseEdgeKeys]),
    polylines: encode(renderedEdges.map((edge) => [edge.key, edge.polyline])),
    arrows: encode(
      renderedEdges.map((edge) => [edge.key, geometry.getFlowArrowPoints(edge.polyline.pointList)]),
    ),
    labelPositions,
  };
}

test("the fixture was produced from preview.js before the move", () => {
  assert.equal(golden.source.file, "storybook-product-prototype/assets/prototype-inspector/preview.js");
  assert.match(golden.source.sha256, /^[0-9a-f]{64}$/);
});

test("shared constants keep their values", () => {
  for (const [name, value] of Object.entries(golden.constants)) {
    assert.equal(geometry[name], value, name);
  }
});

test("every helper call returns the pre-move result", () => {
  for (const [index, call] of golden.calls.entries()) {
    assert.equal(typeof geometry[call.fn], "function", `${call.fn} is exported`);
    const actual = encode(geometry[call.fn](...decode(call.args)));
    assert.deepEqual(actual, call.expected, `calls[${index}] ${call.fn}`);
  }
});

for (const fixture of golden.flows) {
  test(`flow "${fixture.name}": positions, routing, arrows and labels match`, () => {
    const actual = runFlow(fixture);
    for (const [key, expected] of Object.entries(fixture.expected)) {
      assert.deepEqual(actual[key], expected, `${fixture.name}: ${key}`);
    }
  });
}

test("resolvePrototypeViewport matches the pre-move viewport chain and token reads", () => {
  for (const [index, testCase] of golden.viewports.entries()) {
    const reads = [];
    const result = geometry.resolvePrototypeViewport(
      decode(testCase.prototype),
      decode(testCase.route),
      createTokenReader(testCase.tokens, reads),
    );
    assert.deepEqual(encode(result), testCase.expected.result, `viewports[${index}] result`);
    assert.deepEqual(reads, testCase.expected.reads, `viewports[${index}] token reads`);
  }
});

test("the geometry module imports nothing and never touches the DOM", () => {
  const source = fs.readFileSync(
    new URL("../assets/prototype-inspector/flow-canvas-geometry.js", import.meta.url),
    "utf8",
  );
  const code = source.replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(code, /^\s*import\b/m);
  assert.doesNotMatch(code, /\b(?:window|document)\b/);
});

// ---------------------------------------------------------------------------
// Camera, zoom, fit, wheel, pointer and shortcut rules (flow-canvas-navigation).

const close = (actual, expected, label, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${label}: ${actual} != ${expected}`);

test("zoom range is 0.05 to 4 with the discrete step table", () => {
  assert.equal(geometry.MIN_ZOOM, 0.05);
  assert.equal(geometry.MAX_ZOOM, 4);
  assert.deepEqual(geometry.ZOOM_STEPS, [0.05, 0.1, 0.25, 0.5, 1, 2, 4]);
  assert.equal(geometry.DRAG_THRESHOLD_PX, 3);
  assert.equal(geometry.clampZoom(9), 4);
  assert.equal(geometry.clampZoom(0.01), 0.05);
  assert.equal(geometry.clampZoom(0.7), 0.7);
});

test("discrete steps follow the spec example", () => {
  const rows = [
    [1, "in", 2],
    [1, "out", 0.5],
    [0.3, "in", 0.5],
    [0.48, "in", 1],
    [0.52, "out", 0.25],
    [4, "in", 4],
    [0.05, "out", 0.05],
  ];
  for (const [zoom, direction, expected] of rows) {
    assert.equal(geometry.stepZoom(zoom, direction), expected, `${zoom} ${direction}`);
  }
});

test("continuous zoom clamps each event to ±30 px of deltaY", () => {
  const anchor = { x: 0, y: 0 };
  const rows = [
    [1, -8, 0, Math.exp(0.08)],
    [1, 100, 0, Math.exp(-0.3)],
    [1, -3, 1, Math.exp(0.3)],
    [3.9, -30, 0, 4],
    [0.06, 30, 0, 0.05],
  ];
  for (const [zoom, deltaY, deltaMode, expected] of rows) {
    const next = geometry.applyWheelZoom({ x: 0, y: 0, z: zoom }, { deltaY, deltaMode }, anchor, 800);
    close(next.z, expected, `zoom ${zoom} deltaY ${deltaY} mode ${deltaMode}`);
  }
  const page = geometry.applyWheelZoom({ x: 0, y: 0, z: 1 }, { deltaY: 0.05, deltaMode: 2 }, anchor, 800);
  close(page.z, Math.exp(-0.3), "deltaMode 2 multiplies by the canvas height (40 px, clamped)");
});

test("wheel zoom keeps the pointed world point fixed (spec scenario)", () => {
  const camera = { x: 100, y: 50, z: 0.5 };
  const pointer = { x: 600, y: 400 };
  const before = geometry.screenToWorld(pointer, camera);
  assert.deepEqual(before, { x: 1000, y: 700 });
  const next = geometry.applyWheelZoom(camera, { ctrlKey: true, deltaY: -20, deltaMode: 0 }, pointer, 800);
  close(next.z, 0.5 * Math.exp(0.2), "zoom");
  const drawn = geometry.worldToScreen({ x: 1000, y: 700 }, next);
  close(drawn.x, 600, "x", 1e-9);
  close(drawn.y, 400, "y", 1e-9);
});

test("property: zooming never moves the world point under the anchor", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let index = 0; index < 500; index += 1) {
    const camera = { x: (random() - 0.5) * 4000, y: (random() - 0.5) * 4000, z: 0.05 + random() * 3.95 };
    const anchor = { x: random() * 1600, y: random() * 1000 };
    const nextZoom = 0.01 + random() * 5;
    const before = geometry.screenToWorld(anchor, camera);
    const after = geometry.screenToWorld(anchor, geometry.zoomAtPoint(camera, nextZoom, anchor));
    close(after.x, before.x, `case ${index} x`, 1e-6);
    close(after.y, before.y, `case ${index} y`, 1e-6);
  }
});

test("fit follows the spec computation", () => {
  const rows = [
    [1190, 800, 3929, 4990, 0.1283],
    [1600, 1000, 1200, 878, 0.9203],
    [1600, 1000, 377, 500, 1],
  ];
  for (const [width, height, bw, bh, expected] of rows) {
    const camera = geometry.fitCamera({ x: 40, y: -260, width: bw, height: bh }, { width, height });
    close(Math.round(camera.z * 10000) / 10000, expected, `${width}x${height} / ${bw}x${bh}`);
    const center = geometry.worldToScreen({ x: 40 + bw / 2, y: -260 + bh / 2 }, camera);
    close(center.x, width / 2, "centered x", 1e-9);
    close(center.y, height / 2, "centered y", 1e-9);
  }
  const huge = geometry.fitCamera({ x: 0, y: 0, width: 400000, height: 10 }, { width: 1000, height: 800 });
  assert.equal(huge.z, 0.05, "fit zoom is clamped to the zoom range");
});

test("zoom buckets follow the spec example", () => {
  const rows = [[2, 2], [1, 0], [0.75, -1], [0.5, -2], [0.35, -3], [0.1, -7], [1.1, 0]];
  for (const [zoom, bucket] of rows) {
    assert.equal(geometry.getZoomBucket(zoom), bucket, `zoom ${zoom}`);
  }
});

test("flow bounds and the visible rect", () => {
  assert.equal(geometry.getFlowBounds([]), null);
  assert.deepEqual(
    geometry.getFlowBounds([
      { x: 0, y: 0, width: 377, height: 878 },
      { x: 0, y: -260, width: 220, height: 220 },
      { x: 960, y: 980, width: 377, height: 878 },
    ]),
    { x: 0, y: -260, width: 1337, height: 2118 },
  );
  const box = { x: 480, y: 980, width: 377, height: 878 };
  const visible = geometry.getFrameVisibleRect(box, "route");
  assert.deepEqual(visible, { x: 481, y: 1045, width: 375, height: 812 });
  assert.deepEqual([visible.x + visible.width, visible.y + visible.height], [856, 1857]);
  assert.deepEqual(geometry.getFrameVisibleRect({ x: 0, y: -260, width: 220, height: 220 }, "node"), {
    x: 0,
    y: -260,
    width: 220,
    height: 220,
  });
});

test("wheel and pointer classification follow the spec example", () => {
  const viewport = { overViewport: true, canvasHeight: 800 };
  const mac = { ...viewport, isMac: true };
  const windows = { ...viewport, isMac: false };
  assert.deepEqual(geometry.classifyWheel({ deltaY: 40, deltaMode: 0 }, windows), { action: "pan", dx: 0, dy: 40, preventDefault: true });
  assert.deepEqual(geometry.classifyWheel({ deltaX: 25, deltaY: 10, deltaMode: 0 }, mac), { action: "pan", dx: 25, dy: 10, preventDefault: true });
  assert.deepEqual(geometry.classifyWheel({ deltaY: -8, ctrlKey: true }, windows), { action: "zoom", preventDefault: true });
  assert.deepEqual(geometry.classifyWheel({ deltaY: 100, metaKey: true }, mac), { action: "zoom", preventDefault: true });
  assert.deepEqual(geometry.classifyWheel({ deltaY: 100, altKey: true }, windows), { action: "zoom", preventDefault: true });
  assert.deepEqual(geometry.classifyWheel({ deltaY: 100, shiftKey: true, deltaMode: 0 }, windows), { action: "pan", dx: 100, dy: 0, preventDefault: true });
  assert.deepEqual(geometry.classifyWheel({ deltaY: 100, shiftKey: true, deltaMode: 0 }, mac), { action: "pan", dx: 0, dy: 100, preventDefault: true });
  // Zoom wheels are cancelled anywhere in the root (pinch over the zoom group).
  assert.deepEqual(geometry.classifyWheel({ deltaY: -8, ctrlKey: true }, { isMac: true, overViewport: false }), { action: "zoom", preventDefault: true });
  // A Safari gesture already drives the zoom: the ctrl wheel is cancelled and ignored.
  assert.deepEqual(geometry.classifyWheel({ deltaY: -8, ctrlKey: true }, { ...mac, gestureActive: true }), { action: "ignore", preventDefault: true });
  // Plain wheels keep native scrolling over a scrollable panel and are swallowed elsewhere in the root.
  assert.deepEqual(geometry.classifyWheel({ deltaY: 40 }, { isMac: true, overViewport: false, overScrollable: true }), { action: "native", preventDefault: false });
  assert.deepEqual(geometry.classifyWheel({ deltaY: 40 }, { isMac: true, overViewport: false, overScrollable: false }), { action: "ignore", preventDefault: true });

  assert.deepEqual(geometry.classifyPointerDown({ button: 1 }, { spaceHeld: false, onFrame: true }), { action: "pan", preventDefault: true });
  assert.deepEqual(geometry.classifyPointerDown({ button: 0 }, { spaceHeld: true, onFrame: false }), { action: "pan", preventDefault: true });
  assert.deepEqual(geometry.classifyPointerDown({ button: 0, metaKey: true }, { spaceHeld: false, onFrame: false }), { action: "canvas", preventDefault: false });
  assert.deepEqual(geometry.classifyPointerDown({ button: 0 }, { spaceHeld: false, onFrame: true }), { action: "frame", preventDefault: false });
});

test("key routing follows the spec example", () => {
  const key = (code, extra = {}) => ({ type: "keydown", code, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra });
  const canvas = { isMac: true, isTextEntry: false, targetIsControl: false, overlayOpen: false, dragActive: false };
  const rows = [
    ["Shift+1", key("Digit1", { shiftKey: true }), canvas, "fit"],
    ["=", key("Equal"), canvas, "zoom-in"],
    ["+ (Shift+=)", key("Equal", { shiftKey: true }), canvas, "zoom-in"],
    ["keypad +", key("NumpadAdd"), canvas, "zoom-in"],
    ["-", key("Minus"), canvas, "zoom-out"],
    ["keypad -", key("NumpadSubtract"), canvas, "zoom-out"],
    ["Cmd+0 (macOS)", key("Digit0", { metaKey: true }), canvas, "zoom-100"],
    ["Ctrl+0 (Windows)", key("Digit0", { ctrlKey: true }), { ...canvas, isMac: false }, "zoom-100"],
    ["Ctrl+0 (macOS) is not Mod", key("Digit0", { ctrlKey: true }), canvas, null],
    ["Shift+0", key("Digit0", { shiftKey: true }), canvas, "zoom-100"],
    ["Cmd+= (macOS)", key("Equal", { metaKey: true }), canvas, "zoom-in"],
    ["Cmd+- (macOS)", key("Minus", { metaKey: true }), canvas, "zoom-out"],
    ["1", key("Digit1"), canvas, null],
    ["2", key("Digit2"), canvas, null],
    ["3", key("Digit3"), canvas, null],
    ["M", key("KeyM"), canvas, null],
    ["C", key("KeyC"), canvas, null],
    ["Alt+ArrowRight", key("ArrowRight", { altKey: true }), canvas, null],
    ["Alt+Shift+1", key("Digit1", { altKey: true, shiftKey: true }), canvas, null],
    ["Space down", key("Space"), canvas, "pan-start"],
    ["Space up", { ...key("Space"), type: "keyup" }, canvas, "pan-end"],
    ["Space with Zoom in focused by Tab", key("Space"), { ...canvas, targetIsControl: true }, null],
    ["Space up with a focused control", { ...key("Space"), type: "keyup" }, { ...canvas, targetIsControl: true }, null],
    ["Enter on a focused control", key("Enter"), { ...canvas, targetIsControl: true }, null],
    ["Shift+1 with a focused control", key("Digit1", { shiftKey: true }), { ...canvas, targetIsControl: true }, "fit"],
    ["Escape with the Reset dialog open", key("Escape"), { ...canvas, overlayOpen: true }, "close-overlay"],
    ["Shift+1 with the Reset dialog open", key("Digit1", { shiftKey: true }), { ...canvas, overlayOpen: true }, null],
    ["Escape during a frame drag", key("Escape"), { ...canvas, dragActive: true }, "cancel-drag"],
    ["Escape with nothing to close or cancel", key("Escape"), canvas, null],
    ["Shift+0 while typing in an input", key("Digit0", { shiftKey: true }), { ...canvas, isTextEntry: true }, null],
    ["Shift+1 keyup", { ...key("Digit1", { shiftKey: true }), type: "keyup" }, canvas, null],
  ];
  for (const [label, eventLike, context, expected] of rows) {
    assert.equal(geometry.resolveCanvasShortcut(eventLike, context), expected, label);
  }
});

test("edges anchor on the visible rect of route frames", () => {
  const box = (x, y) => ({ x, y, width: 377, height: 878, nodeType: "route", previewWidth: 375, previewHeight: 812 });
  const boxes = new Map([
    ["a", box(0, 0)],
    ["b", box(480, 0)],
    ["c", box(0, 980)],
  ]);
  const visibleMap = new Map(
    [...boxes].map(([id, position]) => [id, { ...position, ...geometry.getFrameVisibleRect(position, "route") }]),
  );
  const onEdge = (point, rect) =>
    (Math.abs(point.x - rect.x) < 1e-9 || Math.abs(point.x - (rect.x + rect.width)) < 1e-9) &&
      point.y >= rect.y - 1e-9 && point.y <= rect.y + rect.height + 1e-9 ||
    (Math.abs(point.y - rect.y) < 1e-9 || Math.abs(point.y - (rect.y + rect.height)) < 1e-9) &&
      point.x >= rect.x - 1e-9 && point.x <= rect.x + rect.width + 1e-9;
  for (const [from, to] of [["a", "b"], ["a", "c"]]) {
    const polyline = geometry.createPolyline({ from, to, key: `${from}->${to}`, kinds: [], labels: [] }, visibleMap, new Set());
    const first = polyline.pointList[0];
    const last = polyline.pointList[polyline.pointList.length - 1];
    assert.ok(onEdge(first, visibleMap.get(from)), `${from}->${to} starts on ${from}'s visible rect: ${JSON.stringify(first)}`);
    assert.ok(onEdge(last, visibleMap.get(to)), `${from}->${to} ends on ${to}'s visible rect: ${JSON.stringify(last)}`);
    assert.ok(first.y >= visibleMap.get(from).y, "no anchor inside the 64 px label band");
  }
});

test("settling within one zoom bucket keeps label placement inputs unchanged", () => {
  // Placement runs only when the idle camera's bucket changes: 1.0 and 1.1 share bucket 0.
  assert.equal(geometry.getZoomBucket(1.0), geometry.getZoomBucket(1.1));
  assert.notEqual(geometry.getZoomBucket(1.0), geometry.getZoomBucket(1.5));
});

test("arrowheads are sized for the representative zoom of the bucket", () => {
  const points = [{ x: 0, y: 0 }, { x: 400, y: 0 }];
  const zoom = 0.25;
  const representative = 2 ** (geometry.getZoomBucket(zoom) / 2);
  assert.equal(representative, 0.25);
  const arrow = geometry.getFlowArrowPoints(points, 1 / representative).split(" ").map((pair) => pair.split(",").map(Number));
  const [tip, left] = arrow;
  assert.equal((tip[0] - left[0]) * zoom, 14, "14 CSS pixels long on screen at zoom 0.25");
  assert.equal(geometry.getFlowArrowPoints(points), geometry.getFlowArrowPoints(points, 1), "default scale is unchanged");
});

test("measured label sizes replace the text estimate in label placement", () => {
  const routes = new Map([
    ["a", { x: 0, y: 0, width: 377, height: 878 }],
    ["b", { x: 1000, y: 0, width: 377, height: 878 }],
  ]);
  const edge = { key: "a->b", from: "a", to: "b", kinds: [], labels: ["Next"], polyline: geometry.createPolyline({ key: "a->b", from: "a", to: "b", kinds: [], labels: ["Next"] }, routes, new Set()) };
  const metrics = { width: 1500, height: 1000, offsetX: 0, offsetY: 0 };
  const estimated = geometry.placeEdgeLabels([edge], routes, metrics, 1)[0].polyline.labelPosition;
  const huge = geometry.placeEdgeLabels([edge], routes, metrics, 1, () => ({ width: 1400, height: 900 }))[0].polyline.labelPosition;
  const same = geometry.placeEdgeLabels([edge], routes, metrics, 1, () => null)[0].polyline.labelPosition;
  assert.deepEqual(same, estimated, "no measurement falls back to the estimate");
  assert.notDeepEqual(huge, estimated, "a measured size changes the placement");
});

// ---------------------------------------------------------------------------
// Level of detail (flow-canvas-level-of-detail).

const lodCanvas = { height: 800, width: 1190 };

// One frame of the given box seen at `zoom` (camera at the origin): `fraction`
// of it inside the canvas, cut by the canvas's right edge, or far outside the
// expanded viewport when fraction is "outside".
function lodFrame(key, width, height, zoom, fraction, canvas = lodCanvas) {
  if (fraction === "outside") {
    return { height, key, routeId: key.split(":").at(-1), width, x: (canvas.width * 3) / zoom, y: 0 };
  }

  const screenLeft = fraction === 1 ? 20 : canvas.width - fraction * width * zoom;

  return { height, key, routeId: key.split(":").at(-1), width, x: screenLeft / zoom, y: 20 / zoom };
}

function lodTier({ fraction, height, hovered = false, pinned = false, previouslyLive = false, width, zoom }) {
  const frame = lodFrame("review", width, height, zoom, fraction);

  return geometry
    .selectFrameTiers({
      camera: { x: 0, y: 0, z: zoom },
      canvasSize: lodCanvas,
      frames: [frame],
      hovered: hovered ? { dwellMs: 200, key: "review" } : null,
      pinnedId: pinned ? "review" : null,
      previousTiers: new Map(previouslyLive ? [["review", "live"]] : []),
      promotedIds: new Set(),
    })
    .get("review");
}

test("LOD thresholds and the live budget keep their values", () => {
  assert.deepEqual({ ...geometry.LOD_THRESHOLDS }, {
    hoverDwellMs: 200,
    hoverLiveMinZoom: 0.4,
    liveKeepZoom: 0.64,
    liveMinVisibleFraction: 0.4,
    liveMinZoom: 0.8,
    placeholderMaxWidth: 40,
  });
  assert.equal(geometry.LIVE_FRAME_LIMIT, 6);
});

test("tier selection for a 377-pixel-wide phone frame (spec example)", () => {
  const rows = [
    [0.1, 1, false, false, "placeholder"],
    [0.15, 1, false, false, "snapshot"],
    [0.5, 1, false, false, "snapshot"],
    [0.5, 1, true, false, "live"],
    [0.8, 0.5, false, false, "live"],
    [0.8, 0.3, false, false, "snapshot"],
    [0.7, 0.5, false, true, "live"],
    [0.6, 1, false, true, "snapshot"],
    [1, "outside", false, false, "culled"],
  ];

  for (const [zoom, fraction, hovered, previouslyLive, expected] of rows) {
    assert.equal(
      lodTier({ fraction, height: 878, hovered, previouslyLive, width: 377, zoom }),
      expected,
      `zoom ${zoom}, fraction ${fraction}, hovered ${hovered}, previously live ${previouslyLive}`,
    );
  }
});

test("tier selection for a 1282-pixel-wide desktop frame (spec example)", () => {
  assert.equal(lodTier({ fraction: 1, height: 866, width: 1282, zoom: 0.3 }), "snapshot");
  assert.equal(lodTier({ fraction: 0.5, height: 866, width: 1282, zoom: 0.8 }), "live");
});

test("a pinned phone frame stays live at any zoom and off-screen (spec example)", () => {
  for (const [zoom, fraction] of [[0.08, 1], [0.3, 1], [1, "outside"]]) {
    assert.equal(lodTier({ fraction, height: 878, pinned: true, width: 377, zoom }), "live", `zoom ${zoom}`);
  }
});

test("repeated route instances keep separate tiers", () => {
  const frames = [
    { ...lodFrame("1:review", 377, 878, 0.5, 1), routeId: "review" },
    { ...lodFrame("3:review", 377, 878, 0.5, 1), routeId: "review", x: 500 / 0.5 },
  ];
  const tiers = geometry.selectFrameTiers({
    camera: { x: 0, y: 0, z: 0.5 },
    canvasSize: lodCanvas,
    frames,
    hovered: { dwellMs: 200, key: "1:review" },
  });

  assert.equal(tiers.get("1:review"), "live");
  assert.equal(tiers.get("3:review"), "snapshot");
});

test("hover promotes a frame only after 200 ms", () => {
  const select = (dwellMs) =>
    geometry
      .selectFrameTiers({
        camera: { x: 0, y: 0, z: 0.5 },
        canvasSize: lodCanvas,
        frames: [lodFrame("review", 377, 878, 0.5, 1)],
        hovered: { dwellMs, key: "review" },
      })
      .get("review");

  assert.equal(select(199), "snapshot");
  assert.equal(select(200), "live");
});

test("the live budget keeps pinned, promoted, hovered, larger, already live and central frames", () => {
  const canvas = { height: 3000, width: 4000 };
  const zoom = 0.8;
  const at = (key, centerX, centerY) => ({
    height: 878,
    key,
    routeId: key,
    width: 377,
    x: (centerX - (377 * zoom) / 2) / zoom,
    y: (centerY - (878 * zoom) / 2) / zoom,
  });
  const frames = [
    at("pinned", 3000, 2500),
    at("promoted", 400, 600),
    at("hovered", 2000, 2550),
    at("was-live", 3600, 600),
    at("center", 2000, 1500),
    at("right", 2400, 1500),
    at("left", 1600, 1500),
    at("far-right", 3500, 1500),
    at("far-left", 500, 1500),
    // Half of it past the right edge: a candidate with less visible area.
    { ...at("half", 0, 1500), x: (canvas.width - (377 * zoom) / 2) / zoom },
  ];
  const tiers = geometry.selectFrameTiers({
    camera: { x: 0, y: 0, z: zoom },
    canvasSize: canvas,
    frames,
    hovered: { dwellMs: 250, key: "hovered" },
    pinnedId: "pinned",
    previousTiers: new Map([["was-live", "live"]]),
    promotedIds: new Set(["promoted"]),
  });
  const live = frames.filter((frame) => tiers.get(frame.key) === "live").map((frame) => frame.key);

  assert.deepEqual(live.sort(), ["center", "hovered", "left", "pinned", "promoted", "right", "was-live"].sort());
  assert.equal(tiers.get("far-right"), "snapshot");
  assert.equal(tiers.get("far-left"), "snapshot");
  assert.equal(tiers.get("half"), "snapshot");
});

test("promotedIds accepts an array, and the key breaks a full tie", () => {
  const zoom = 0.5;
  const frames = [
    { height: 878, key: "b", routeId: "b", width: 377, x: 300 / zoom, y: 20 / zoom },
    { height: 878, key: "a", routeId: "a", width: 377, x: 700 / zoom, y: 20 / zoom },
  ];
  const promoted = geometry.selectFrameTiers({
    camera: { x: 0, y: 0, z: zoom },
    canvasSize: lodCanvas,
    frames,
    promotedIds: ["a"],
  });

  assert.equal(promoted.get("a"), "live");
  assert.equal(promoted.get("b"), "snapshot");

  // Seven equal frames at the same distance from the center: keys decide.
  const ring = Array.from({ length: 7 }, (_, index) => {
    const angle = (index / 7) * Math.PI * 2;
    const centerX = 2000 + Math.cos(angle) * 600;
    const centerY = 1500 + Math.sin(angle) * 600;
    return { height: 100, key: `k${6 - index}`, routeId: `k${index}`, width: 100, x: centerX - 50, y: centerY - 50 };
  });
  const tiers = geometry.selectFrameTiers({ camera: { x: 0, y: 0, z: 1 }, canvasSize: { height: 3000, width: 4000 }, frames: ring });
  assert.deepEqual(
    ring.filter((frame) => tiers.get(frame.key) === "live").map((frame) => frame.key).sort(),
    ["k0", "k1", "k2", "k3", "k4", "k5"],
  );
});

test("the visible world rect grows by half the viewport on each side", () => {
  assert.deepEqual(
    geometry.getVisibleWorldRect({ x: -100, y: 50, z: 2 }, { height: 800, width: 1000 }, 0.5),
    { height: 800, width: 1000, x: -200, y: -225 },
  );
});

test("hashMarkup is stable and tells one character apart", () => {
  const markup = '<div data-route="review">Review</div>';

  assert.equal(geometry.hashMarkup(markup), geometry.hashMarkup(markup));
  assert.notEqual(geometry.hashMarkup(markup), geometry.hashMarkup(markup.replace("Review<", "Reviews<")));
  assert.match(geometry.hashMarkup(markup), /^[0-9a-f]{14}$/);
  assert.match(geometry.hashMarkup(""), /^[0-9a-f]{14}$/);
});

test("acceptMeasuredSize ignores noise, 100vh feedback and runaway heights", () => {
  const phone = { height: 812, width: 375 };

  assert.deepEqual(geometry.acceptMeasuredSize(null, phone, 0, 812), phone);
  assert.equal(geometry.acceptMeasuredSize(phone, { height: 813, width: 376 }, 0, 812), null);
  // min-height: calc(100vh + 20px) grows once, then only follows the iframe.
  assert.deepEqual(geometry.acceptMeasuredSize(phone, { height: 832, width: 375 }, 0, 812), { height: 832, width: 375 });
  assert.equal(geometry.acceptMeasuredSize({ height: 832, width: 375 }, { height: 852, width: 375 }, 20, 812), null);
  assert.equal(geometry.acceptMeasuredSize(phone, { height: 812 * 8 + 1, width: 375 }, 0, 812), null);
  assert.deepEqual(geometry.acceptMeasuredSize(phone, { height: 1040, width: 375 }, 0, 812), { height: 1040, width: 375 });
  // A width change still applies while the height feeds back.
  assert.deepEqual(geometry.acceptMeasuredSize(phone, { height: 832, width: 390 }, 20, 812), { height: 812, width: 390 });
});
