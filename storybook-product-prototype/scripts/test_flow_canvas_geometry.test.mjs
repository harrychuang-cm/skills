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

// ---------------------------------------------------------------------------
// Feature journeys (flow-journey-focus)

const quiet = { warn: () => {} };
const route = (id, title = id.toUpperCase()) => ({ id, title });
const node = (id, title = id.toUpperCase()) => ({ id, shape: "decision", title });
const link = (from, to, extra = {}) => ({ flowLine: "key", from, label: "", to, trigger: `${from}.${to}`, ...extra });
const summary = (result) => result.journeys.map(({ key, steps, title, loopTarget }) => ({ key, steps, title, ...(loopTarget ? { loopTarget } : {}) }));

const exampleFlow = {
  nodes: [node("approval-decision", "Ready for handoff?")],
  routes: [route("intake", "Project Intake"), route("review", "Review Request"), route("handoff", "Implementation Handoff")],
  transitions: [
    link("intake", "review", { kind: "primary", label: "Submit intake" }),
    link("review", "approval-decision", { kind: "primary", label: "Request approval" }),
    link("approval-decision", "handoff", { kind: "condition", label: "Approved" }),
    link("approval-decision", "review", { flowLine: "reference", kind: "condition", label: "Needs changes" }),
    link("review", "intake", { flowLine: "reference", kind: "return", label: "Edit intake" }),
    link("handoff", "intake", { flowLine: "reference", kind: "return", label: "Start another request" }),
  ],
};

test("branch journeys of the storybook-template example (spec example)", () => {
  const result = geometry.deriveBranchJourneys(exampleFlow, quiet);

  assert.deepEqual(summary(result), [
    { key: "derived:approval-decision:handoff", steps: ["intake", "review", "approval-decision", "handoff"], title: "Approved · Implementation Handoff" },
    { key: "derived:approval-decision:review", loopTarget: "review", steps: ["intake", "review", "approval-decision"], title: "Needs changes · ↩ Review Request" },
  ]);
  assert.equal(result.truncatedCount, 0);
  assert.ok(result.journeys.every((journey) => journey.branchTitle === "Ready for handoff?"));

  const declared = {
    ...exampleFlow,
    journeys: [
      { id: "approve-request", steps: ["intake", "review", "approval-decision", "handoff"], title: "Approve a request" },
      { id: "request-changes", steps: ["intake", "review", "approval-decision", "review"], title: "Request changes" },
    ],
  };
  assert.deepEqual(geometry.deriveBranchJourneys(declared, quiet).journeys, [], "declared journeys cover both branches");
});

test("six branches become six journeys", () => {
  const targets = ["t1", "t2", "t3", "t4", "t5", "t6"];
  const flow = {
    nodes: [node("d")],
    routes: [route("start"), ...targets.map((id) => route(id))],
    transitions: [link("start", "d"), ...targets.map((id, index) => link("d", id, { flowLine: index % 2 ? "reference" : "key", kind: "condition", label: `Branch ${index + 1}` }))],
  };
  const result = geometry.deriveBranchJourneys(flow, quiet);

  assert.equal(result.journeys.length, 6);
  assert.deepEqual(result.journeys[0].steps, ["start", "d", "t1"]);
  assert.equal(result.journeys[5].title, "Branch 6 · T6");
  assert.ok(result.journeys.every((journey) => journey.branchId === "d"));
});

test("three chained decisions derive one journey per branch edge (spec example)", () => {
  const flow = {
    nodes: [node("d1"), node("d2"), node("d3")],
    routes: ["a", "b1", "b2", "m1", "c1", "c2", "m2", "e1", "e2"].map((id) => route(id)),
    transitions: [
      link("a", "d1"),
      link("d1", "b1", { label: "Left" }),
      link("d1", "b2", { label: "Right" }),
      link("b1", "m1"),
      link("b2", "m1"),
      link("m1", "d2"),
      link("d2", "c1", { label: "Left" }),
      link("d2", "c2", { label: "Right" }),
      link("c1", "m2"),
      link("c2", "m2"),
      link("m2", "d3"),
      link("d3", "e1", { label: "Left" }),
      link("d3", "e2", { label: "Right" }),
    ],
  };

  assert.deepEqual(
    geometry.deriveBranchJourneys(flow, quiet).journeys.map(({ branchId, steps, title }) => [branchId, title, steps.join(", ")]),
    [
      ["d1", "Left · B1", "a, d1, b1, m1"],
      ["d1", "Right · B2", "a, d1, b2, m1"],
      ["d2", "Left · C1", "b1, m1, d2, c1, m2"],
      ["d2", "Right · C2", "b1, m1, d2, c2, m2"],
      ["d3", "Left · E1", "c1, m2, d3, e1"],
      ["d3", "Right · E2", "c1, m2, d3, e2"],
    ],
  );
});

test("parallel and loop-back edges keep distinct identities", () => {
  const flow = {
    nodes: [node("d")],
    routes: [route("s", "S"), route("r1", "R1"), route("r2", "R2"), route("x", "X")],
    transitions: [
      link("s", "r1"),
      link("r1", "r2"),
      link("r2", "d"),
      link("d", "r1", { label: "Back to first" }),
      link("d", "r2", { label: "Back to second" }),
      link("d", "x", { label: "Retry" }),
      link("d", "x", { label: "Try again" }),
    ],
  };

  assert.deepEqual(summary(geometry.deriveBranchJourneys(flow, quiet)), [
    { key: "derived:d:r1", loopTarget: "r1", steps: ["r1", "r2", "d"], title: "Back to first · ↩ R1" },
    { key: "derived:d:r2", loopTarget: "r2", steps: ["r1", "r2", "d"], title: "Back to second · ↩ R2" },
    { key: "derived:d:x", steps: ["r1", "r2", "d", "x"], title: "Retry / Try again · X" },
  ]);
});

test("a route linked only by excluded transitions appears in no journey (spec example)", () => {
  const flow = {
    routes: [route("a", "A"), route("b", "B"), route("c", "C"), route("lonely", "L")],
    transitions: [
      link("a", "b", { label: "x" }),
      link("a", "c", { label: "y" }),
      link("lonely", "a", { flowLine: "reference", kind: "return" }),
      link("a", "lonely", { kind: "global" }),
      link("lonely", "b", { flowLine: "hidden" }),
      { from: "c", label: "", to: "lonely", trigger: "c.lonely" },
    ],
  };

  assert.deepEqual(summary(geometry.deriveBranchJourneys(flow, quiet)), [
    { key: "derived:a:b", steps: ["a", "b"], title: "x · B" },
    { key: "derived:a:c", steps: ["a", "c"], title: "y · C" },
  ]);
});

test("a long fan keeps 24 journeys and reports the rest", () => {
  const targets = Array.from({ length: 30 }, (_, index) => `t${index}`);
  const flow = {
    nodes: [node("d")],
    routes: [route("start"), ...targets.map((id) => route(id))],
    transitions: [link("start", "d"), ...targets.map((id) => link("d", id, { label: id }))],
  };
  const result = geometry.deriveBranchJourneys(flow, quiet);

  assert.equal(result.journeys.length, 24);
  assert.equal(result.truncatedCount, 6);
  assert.equal(result.journeys[23].key, "derived:d:t23");
});

// Anonymous ids, shaped like growth-fund: four entry routes converge on one
// chain with seven branch nodes of 2, 2, 2, 2, 2, 3 and 4 targets.
function growthShapedFlow() {
  const routes = ["e1", "e2", "e3", "e4", "hub"].map((id) => route(id));
  const nodes = [];
  const transitions = ["e1", "e2", "e3", "e4"].map((id) => link(id, "hub"));
  let previous = "hub";

  [2, 2, 2, 2, 2, 3, 4].forEach((count, branchIndex) => {
    const branch = `b${branchIndex + 1}`;
    const merge = `m${branchIndex + 1}`;

    nodes.push(node(branch));
    transitions.push(link(previous, branch));
    for (let target = 1; target <= count; target += 1) {
      const id = `${branch}t${target}`;

      routes.push(route(id));
      transitions.push(link(branch, id, { kind: "condition", label: `Option ${target}` }));
      if (branchIndex < 6) transitions.push(link(id, merge));
    }
    if (branchIndex < 6) routes.push(route(merge));
    previous = merge;
  });
  return { nodes, routes, transitions };
}

test("converging entries do not multiply journeys (growth-fund shape)", () => {
  const result = geometry.deriveBranchJourneys(growthShapedFlow(), quiet);

  assert.equal(result.journeys.length, 17);
  assert.equal(result.truncatedCount, 0);
  assert.equal(new Set(result.journeys.map((journey) => journey.branchId)).size, 7);
  for (const journey of result.journeys) {
    const index = journey.steps.indexOf(journey.branchId);

    assert.ok(index >= 0 && index <= 2, `${journey.key} keeps its branch node within the first three steps`);
  }
  for (const branchId of new Set(result.journeys.map((journey) => journey.branchId))) {
    const titles = result.journeys.filter((journey) => journey.branchId === branchId).map((journey) => journey.title);

    assert.equal(new Set(titles).size, titles.length, `names under ${branchId} are unique`);
  }
});

test("several entries reaching one success/error decision give one journey per branch edge", () => {
  const shapes = {
    inventory: { entries: ["list", "scan", "search"], decision: "submit-result", outcomes: ["saved", "failed"] },
    music: { entries: ["home", "library", "radio", "search"], decision: "play-result", outcomes: ["playing", "unavailable", "offline"] },
  };

  for (const [name, { entries, decision, outcomes }] of Object.entries(shapes)) {
    const flow = {
      nodes: [node(decision)],
      routes: [...entries, ...outcomes].map((id) => route(id)),
      transitions: [
        ...entries.map((id) => link(id, decision)),
        ...outcomes.map((id) => link(decision, id, { kind: "condition", label: id === outcomes[0] ? "Success" : "Error" })),
      ],
    };
    const { journeys } = geometry.deriveBranchJourneys(flow, quiet);

    assert.equal(journeys.length, outcomes.length, `${name}: one journey per branch edge`);
    assert.equal(new Set(journeys.map((journey) => journey.title)).size, journeys.length, `${name}: unique names`);
    assert.ok(journeys.every((journey) => journey.steps.includes(decision)), `${name}: every journey holds its branch node`);
  }
});

test("declared journeys skip unknown steps, short journeys and duplicate ids", () => {
  const warnings = [];
  const journeys = geometry.normalizeJourneys(
    {
      ...exampleFlow,
      journeys: [
        { id: "main", steps: ["intake", "missing", "review"], title: "Main" },
        { id: "main", steps: ["intake", "handoff"], title: "Again" },
        { id: "short", steps: ["intake", "missing"], title: "Short" },
        { id: "untitled", steps: ["review", "handoff"] },
      ],
    },
    { warn: (message) => warnings.push(message) },
  );

  assert.deepEqual(journeys.map(({ id, steps, title }) => ({ id, steps, title })), [
    { id: "main", steps: ["intake", "review"], title: "Main" },
    { id: "untitled", steps: ["review", "handoff"], title: "untitled" },
  ]);
  assert.equal(warnings.length, 4);
});

const phone = { height: 878, visibleHeight: 812, visibleLeft: 1, visibleTop: 65, visibleWidth: 375, width: 377 };
const decisionBox = { height: 220, visibleHeight: 220, visibleTop: 0, width: 220 };

test("a three-step journey centres visible rects on the row centre line (spec example)", () => {
  const layout = geometry.computeJourneyLayout(["intake", "approval-decision", "handoff"], (id) => (id === "approval-decision" ? decisionBox : phone));

  assert.deepEqual(layout.map(({ instanceKey, x, y }) => [instanceKey, x, y]), [
    ["0:intake", 0, 0],
    ["1:approval-decision", 537, 361],
    ["2:handoff", 917, 0],
  ]);
});

test("journeys wrap after 8 steps (spec example)", () => {
  for (const [count, rows] of [[3, [3]], [8, [8]], [10, [8, 2]], [17, [8, 8, 1]]]) {
    const layout = geometry.computeJourneyLayout(Array.from({ length: count }, (_, index) => `s${index}`), () => phone);
    const perRow = [];

    for (const step of layout) perRow[step.row] = (perRow[step.row] ?? 0) + 1;
    assert.deepEqual(perRow, rows, `${count} steps`);
  }
  const wrapped = geometry.computeJourneyLayout(Array.from({ length: 10 }, (_, index) => `s${index}`), () => phone);

  assert.equal(wrapped[8].x, 0);
  assert.equal(wrapped[8].y, 878 + 240, "the next row starts 240 below the lowest frame of the row before");
});

test("request-changes renders four distinct step instances", () => {
  const layout = geometry.computeJourneyLayout(["intake", "review", "approval-decision", "review"], (id) => (id === "approval-decision" ? decisionBox : phone));

  assert.deepEqual(layout.map((step) => step.instanceKey), ["0:intake", "1:review", "2:approval-decision", "3:review"]);
});

test("journey edges label consecutive steps like the full flow", () => {
  const steps = ["intake", "review", "approval-decision", "review"];
  const layout = geometry.computeJourneyLayout(steps, (id) => (id === "approval-decision" ? decisionBox : phone));
  const { edges, loopMarker } = geometry.getJourneyEdges(layout, exampleFlow.transitions);

  assert.equal(loopMarker, null);
  assert.deepEqual(edges.map(({ fromKey, toKey, label, dotted, firstOccurrence }) => [fromKey, toKey, label, dotted, firstOccurrence]), [
    ["0:intake", "1:review", "點擊 Submit intake", false, true],
    ["1:review", "2:approval-decision", "點擊 Request approval", false, true],
    ["2:approval-decision", "3:review", "條件 Needs changes", false, true],
  ]);
  // Visible rects: intake spans x 1 to 376, review starts at 537 + 1.
  assert.deepEqual(edges[0].points, [{ x: 376, y: 471 }, { x: 538, y: 471 }]);
  // The label room is the 160 px gap between the frame boxes (377 to 537).
  assert.equal(edges[0].labelWidth, 160);
  assert.equal(edges[0].labelX, 457);

  const joined = geometry.getJourneyEdges(geometry.computeJourneyLayout(["d", "x"], () => decisionBox), [
    link("d", "x", { label: "Retry" }),
    link("d", "x", { label: "Try again" }),
  ]);

  assert.equal(joined.edges[0].label, "點擊 Retry / Try again");
});

test("a step pair without a transition is a dotted line without a label", () => {
  const layout = geometry.computeJourneyLayout(["intake", "handoff", "intake"], () => phone);
  const { edges } = geometry.getJourneyEdges(layout, exampleFlow.transitions);

  assert.deepEqual(edges.map(({ dotted, label }) => [dotted, label]), [
    [true, null],
    [false, "點擊 Start another request"],
  ]);
  assert.equal(edges[0].firstOccurrence, false);
});

test("connectors between rows turn through the gap between the rows", () => {
  const layout = geometry.computeJourneyLayout(Array.from({ length: 9 }, (_, index) => `s${index}`), () => phone);
  const transitions = Array.from({ length: 8 }, (_, index) => link(`s${index}`, `s${index + 1}`, { label: `Step ${index + 1}` }));
  const turn = geometry.getJourneyEdges(layout, transitions).edges[7];
  const lastRight = layout[7].x + 1 + 375;
  const gapY = 878 + 120;

  assert.deepEqual(turn.points, [
    { x: lastRight, y: 471 },
    { x: lastRight + 80, y: 471 },
    { x: lastRight + 80, y: gapY },
    { x: -80, y: gapY },
    { x: -80, y: 878 + 240 + 471 },
    { x: 1, y: 878 + 240 + 471 },
  ]);
  assert.equal(turn.labelY, gapY);
});

test("a derived journey that stops at a repeated step ends with a loop marker", () => {
  const steps = ["intake", "review", "approval-decision"];
  const layout = geometry.computeJourneyLayout(steps, (id) => (id === "approval-decision" ? decisionBox : phone));
  const titles = { review: "Review Request" };
  const { edges, loopMarker } = geometry.getJourneyEdges(layout, exampleFlow.transitions, { loopTarget: "review", titleOf: (id) => titles[id] ?? id });
  const last = layout[2];

  assert.deepEqual(loopMarker, { label: "↩ Review Request", targetId: "review", x: last.x + last.width + 160, y: 471 });
  assert.equal(edges.at(-1).label, "條件 Needs changes");
  assert.equal(edges.at(-1).loop, true);

  const bounds = geometry.getJourneyBounds(layout, { loopMarker });

  assert.equal(bounds.x + bounds.width, last.x + last.width + 320, "fitting reaches 320 past the last frame");
  assert.deepEqual(geometry.getJourneyBounds(layout), { height: 878, width: last.x + last.width, x: 0, y: 0 });
});

test("journey labels hide only when their room on screen is under 24 px", () => {
  assert.equal(geometry.isJourneyLabelHidden(160, 0.336), false, "6 steps fitted in 1190 x 800 (spec example)");
  assert.equal(geometry.isJourneyLabelHidden(160, 0.247), false, "8 steps fitted in 1200 x 900 (spec example)");
  assert.equal(geometry.isJourneyLabelHidden(160, 23 / 160), true, "23 px");
  assert.equal(geometry.isJourneyLabelHidden(160, 24 / 160), false, "24 px");
});

test("[ and ] switch journeys only while the journey list is shown", () => {
  const key = (code, extra = {}) => ({ type: "keydown", code, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra });
  const canvas = { isMac: true, isTextEntry: false, targetIsControl: false, overlayOpen: false, dragActive: false, journeyEntryCount: 3 };
  const rows = [
    ["[ with a list", key("BracketLeft"), canvas, "previous-journey"],
    ["] with a list", key("BracketRight"), canvas, "next-journey"],
    ["] on a focused list button", key("BracketRight"), { ...canvas, targetIsControl: true }, "next-journey"],
    ["] without a list", key("BracketRight"), { ...canvas, journeyEntryCount: 1 }, null],
    ["] with no journey context", key("BracketRight"), { ...canvas, journeyEntryCount: undefined }, null],
    ["Cmd+] (browser forward)", key("BracketRight", { metaKey: true }), canvas, null],
    ["Ctrl+] on macOS", key("BracketRight", { ctrlKey: true }), canvas, null],
    ["Shift+[", key("BracketLeft", { shiftKey: true }), canvas, null],
    ["Alt+[", key("BracketLeft", { altKey: true }), canvas, null],
    ["] while typing", key("BracketRight"), { ...canvas, isTextEntry: true }, null],
  ];

  for (const [label, eventLike, context, expected] of rows) {
    assert.equal(geometry.resolveCanvasShortcut(eventLike, context), expected, label);
  }
});

test("repeated journey steps are separate instances for the level of detail (spec scenario)", () => {
  // request-changes at zoom 0.5: the reviewer hovers the second review
  // instance for 200 ms; only that instance goes live.
  const box = { height: 878, routeId: "review", width: 377, y: 0 };
  const tiers = geometry.selectFrameTiers({
    camera: { x: 0, y: 0, z: 0.5 },
    canvasSize: lodCanvas,
    frames: [
      { ...box, key: "1:review", x: 537 },
      { ...box, key: "3:review", x: 1454 },
    ],
    hovered: { dwellMs: 200, key: "3:review" },
    pinnedId: null,
    previousTiers: new Map(),
    promotedIds: new Set(),
  });

  assert.equal(tiers.get("3:review"), "live");
  assert.equal(tiers.get("1:review"), "snapshot");
});

// ---------------------------------------------------------------------------
// Auto layout (flow-auto-layout)

const lanesOf = (flow) => {
  const declared = geometry.normalizeJourneys(flow, quiet);

  return geometry.resolveAutoLayoutLanes(flow, { declared, derived: geometry.deriveBranchJourneys(flow, { ...quiet, declared }) });
};
const laneRows = (result) => result.lanes.map(({ key, members, order, title }) => [key, title, order, members]);

test("auto layout lane sources (spec example)", () => {
  const journeys = lanesOf({
    journeys: [
      { id: "a", steps: ["a1", "a2"], title: "A" },
      { id: "b", steps: ["a2", "b1"], title: "B" },
    ],
    routes: ["a1", "a2", "b1", "x"].map((id) => route(id)),
    transitions: [link("a1", "a2"), link("a2", "b1")],
  });

  assert.equal(journeys.source, "journeys");
  assert.equal(journeys.showTitles, true);
  assert.deepEqual(laneRows(journeys), [
    ["declared:a", "A", "sequence", ["a1", "a2"]],
    ["declared:b", "B", "sequence", ["b1"]],
    ["other", "Other screens", "graph", ["x"]],
  ]);

  const groups = lanesOf({
    routes: [
      { flowGroup: "entry", id: "intake" },
      { flowGroup: "review", id: "review" },
      { flowGroup: "handoff", id: "handoff" },
    ],
    transitions: [link("intake", "review"), link("review", "handoff")],
  });

  assert.equal(groups.source, "flowGroup");
  assert.deepEqual(laneRows(groups), [
    ["group:entry", "entry", "graph", ["intake"]],
    ["group:review", "review", "graph", ["review"]],
    ["group:handoff", "handoff", "graph", ["handoff"]],
  ]);

  const derived = lanesOf({
    nodes: [node("d")],
    routes: [route("start"), route("yes"), route("no")],
    transitions: [link("start", "d"), link("d", "yes", { label: "Yes" }), link("d", "no", { label: "No" })],
  });

  assert.equal(derived.source, "derived");
  assert.deepEqual(
    derived.lanes.map(({ key, members, order }) => [key, order, members]),
    [
      ["derived:d:yes", "sequence", ["start", "d", "yes"]],
      ["derived:d:no", "sequence", ["no"]],
    ],
  );

  const single = lanesOf({
    routes: [route("home"), route("detail"), route("done")],
    transitions: [link("home", "detail"), link("detail", "done")],
  });

  assert.equal(single.source, "single");
  assert.equal(single.showTitles, false);
  assert.deepEqual(laneRows(single), [["single", null, "graph", ["home", "detail", "done"]]]);
});

test("declared journeys win over flowGroup (spec scenario)", () => {
  const result = lanesOf({
    journeys: [
      { id: "submit", steps: ["intake", "review"], title: "Submit" },
      { id: "close", steps: ["review", "handoff", "archive"], title: "Close" },
    ],
    routes: ["intake", "review", "handoff", "archive"].map((id) => ({ flowGroup: `group-${id}`, id })),
    transitions: [link("intake", "review"), link("review", "handoff"), link("handoff", "archive")],
  });

  assert.equal(result.source, "journeys");
  assert.deepEqual(laneRows(result), [
    ["declared:submit", "Submit", "sequence", ["intake", "review"]],
    ["declared:close", "Close", "sequence", ["handoff", "archive"]],
  ]);
});

test("a declared journey that owns no screen is dropped (spec scenario)", () => {
  const result = lanesOf({
    ...exampleFlow,
    journeys: [
      { id: "approve-request", steps: ["intake", "review", "approval-decision", "handoff"], title: "Approve a request" },
      { id: "request-changes", steps: ["intake", "review", "approval-decision", "review"], title: "Request changes" },
    ],
  });

  assert.equal(result.source, "journeys");
  assert.equal(result.showTitles, false);
  assert.deepEqual(laneRows(result), [
    ["declared:approve-request", "Approve a request", "sequence", ["intake", "review", "approval-decision", "handoff"]],
  ]);
});

const layoutBoxes = (sizes = {}) => (id) => sizes[id] ?? phone;
const overlaps = (positions, sizeOf) => {
  const boxes = Object.entries(positions).map(([id, { x, y }]) => ({ id, x, y, ...sizeOf(id) }));
  const hits = [];

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];

      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) hits.push(`${a.id}/${b.id}`);
    }
  }
  return hits;
};
const graphLane = (members) => [{ key: "group:g", members, order: "graph", title: "g" }];

test("a journey lane reads left to right (spec example)", () => {
  const sizeOf = layoutBoxes({ "approval-decision": decisionBox });
  const { labels, positions } = geometry.computeAutoLayout(
    [{ key: "declared:approve-request", members: ["intake", "review", "approval-decision", "handoff"], order: "sequence", title: "Approve a request" }],
    exampleFlow.transitions,
    sizeOf,
  );

  assert.deepEqual(positions, {
    "approval-decision": { x: 1074, y: 361 },
    handoff: { x: 1454, y: 0 },
    intake: { x: 0, y: 0 },
    review: { x: 537, y: 0 },
  });
  assert.deepEqual(labels, [{ anchor: "intake", key: "declared:approve-request", title: "Approve a request" }]);
});

test("a branch opens a sub-row; a return line does not reorder screens (spec scenarios)", () => {
  const { positions } = geometry.computeAutoLayout(
    graphLane(["intake", "review", "approved", "rejected", "handoff"]),
    [
      link("intake", "review"),
      link("review", "approved"),
      link("review", "rejected"),
      link("approved", "handoff"),
      link("handoff", "intake", { kind: "return" }),
    ],
    layoutBoxes(),
  );

  assert.deepEqual(positions.intake, { x: 0, y: 0 });
  assert.deepEqual(positions.review, { x: 537, y: 0 });
  assert.deepEqual(positions.approved, { x: 1074, y: 0 });
  assert.deepEqual(positions.rejected, { x: 1074, y: 878 + 120 });
  assert.deepEqual(positions.handoff, { x: 1611, y: 0 });
});

test("a cycle without an entry takes columns 0, 1 and 2 (spec scenario)", () => {
  const { positions } = geometry.computeAutoLayout(graphLane(["a", "b", "c"]), [link("a", "b"), link("b", "c"), link("c", "a")], layoutBoxes());

  assert.deepEqual([positions.a.x, positions.b.x, positions.c.x], [0, 537, 1074]);
  assert.deepEqual([positions.a.y, positions.b.y, positions.c.y], [0, 0, 0]);
});

test("unconnected screens sit side by side (spec example)", () => {
  const { positions } = geometry.computeAutoLayout(graphLane(["x", "y", "z"]), [], layoutBoxes());

  assert.deepEqual(positions, { x: { x: 0, y: 0 }, y: { x: 537, y: 0 }, z: { x: 1074, y: 0 } });
});

test("narrower frames are centred in their column, lanes stack 240 apart", () => {
  const { labels, positions } = geometry.computeAutoLayout(
    [
      { key: "group:a", members: ["start", "big", "small"], order: "graph", title: "a" },
      { key: "group:b", members: ["next"], order: "graph", title: "b" },
    ],
    [link("start", "big"), link("start", "small")],
    layoutBoxes({ small: decisionBox }),
  );

  assert.deepEqual(positions.big, { x: 537, y: 0 });
  // The decision node shares big's column (377 wide): centred, on its own sub-row.
  assert.deepEqual(positions.small, { x: 537 + Math.round((377 - 220) / 2), y: 878 + 120 });
  assert.deepEqual(positions.next, { x: 0, y: 878 + 120 + 220 + 240 });
  assert.deepEqual(labels.map((label) => label.anchor), ["start", "next"]);
});

test("shared screens stay in their first lane (spec scenario)", () => {
  const flow = {
    journeys: [
      { id: "subscribe", steps: ["fund-detail", "subscribe-form"], title: "Subscribe" },
      { id: "recurring", steps: ["fund-detail", "recurring-form"], title: "Recurring" },
    ],
    routes: ["fund-detail", "subscribe-form", "recurring-form"].map((id) => route(id)),
    transitions: [link("fund-detail", "subscribe-form"), link("fund-detail", "recurring-form")],
  };
  const { lanes } = lanesOf(flow);
  const { labels, positions } = geometry.computeAutoLayout(lanes, flow.transitions, layoutBoxes());

  assert.deepEqual(Object.keys(positions).sort(), ["fund-detail", "recurring-form", "subscribe-form"]);
  assert.deepEqual(positions["recurring-form"], { x: 0, y: 878 + 240 });
  assert.deepEqual(labels.map((label) => label.anchor), ["fund-detail", "recurring-form"]);
});

// 100 routes in 10 lanes of 10, chained, with branches every 7 routes and
// return lines every 3 (the shape of the bench fixture's 100-route flow).
function hundredRouteFlow() {
  const ids = Array.from({ length: 100 }, (_, index) => `screen-${String(index + 1).padStart(3, "0")}`);
  const transitions = [];

  ids.forEach((id, index) => {
    if (index + 1 < ids.length) transitions.push(link(id, ids[index + 1]));
  });
  for (let index = 3; index + 20 < 100; index += 7) transitions.push(link(ids[index], ids[index + 20]));
  for (let index = 1; index < 100; index += 3) transitions.push(link(ids[index], ids[index - 1], { flowLine: "reference", kind: "return" }));
  return { routes: ids.map((id, index) => ({ flowGroup: `lane-${Math.floor(index / 10)}`, id })), transitions };
}

test("auto layout never overlaps frames, whatever the lane source", () => {
  const growth = growthShapedFlow();
  const hundred = hundredRouteFlow();
  const sizeOf = (id) => (/^b\d$/.test(id) ? decisionBox : phone);
  const cases = [
    ["growth-fund shape, derived", growth],
    ["growth-fund shape, single", { ...growth, transitions: [] }],
    ["100 routes, flowGroup", hundred],
    ["100 routes, single", { ...hundred, routes: hundred.routes.map(({ id }) => ({ id })) }],
    ["100 routes, journeys", { ...hundred, journeys: [{ id: "j", steps: hundred.routes.slice(0, 30).map(({ id }) => id), title: "J" }] }],
  ];

  for (const [name, flow] of cases) {
    const { lanes } = lanesOf(flow);
    const { positions } = geometry.computeAutoLayout(lanes, flow.transitions, sizeOf);

    assert.equal(Object.keys(positions).length, flow.routes.length + (flow.nodes?.length ?? 0), `${name}: every screen placed`);
    assert.deepEqual(overlaps(positions, sizeOf), [], `${name}: no overlap`);
    assert.ok(Object.values(positions).every(({ x, y }) => Number.isInteger(x) && Number.isInteger(y)), `${name}: whole pixels`);
  }
});

test("100 routes lay out in under 50 ms", () => {
  const flow = hundredRouteFlow();
  // One graph lane of every route: the depth-first walk and the columns.
  const lanes = [{ key: "single", members: flow.routes.map(({ id }) => id), order: "graph", title: null }];
  const started = performance.now();

  geometry.computeAutoLayout(lanes, flow.transitions, () => phone);
  const elapsed = performance.now() - started;

  console.log(`computeAutoLayout, 100 routes: ${elapsed.toFixed(2)} ms`);
  assert.ok(elapsed < 50, `${elapsed.toFixed(2)} ms`);
});

test("lane names sit 24 px left of the anchor frame's visible rect (spec example)", () => {
  const box = { height: 878, width: 377, x: 0, y: 0 };

  assert.deepEqual(geometry.getAutoLayoutLabelPlacement(box, { x: 100, y: 50, z: 0.5 }), { right: 76.5, top: 82.5 });
  assert.deepEqual(geometry.getAutoLayoutLabelPlacement(box, { x: -200, y: 0, z: 2 }), { right: -222, top: 130 });
});

test("auto layout frame sizes take the larger of the measured preview and the viewport", () => {
  const viewport = { height: 812, width: 375 };

  assert.deepEqual(geometry.getAutoLayoutFrameSize({ nodeType: "route", previewHeight: 600, previewWidth: 375 }, viewport), {
    height: 878,
    visibleHeight: 812,
    visibleTop: 65,
    width: 377,
  });
  assert.deepEqual(geometry.getAutoLayoutFrameSize({ nodeType: "route", previewHeight: 1040, previewWidth: 390 }, viewport), {
    height: 1106,
    visibleHeight: 1040,
    visibleTop: 65,
    width: 392,
  });
  assert.deepEqual(geometry.getAutoLayoutFrameSize({ height: 220, nodeType: "flow", width: 220 }, viewport), {
    height: 220,
    visibleHeight: 220,
    visibleTop: 0,
    width: 220,
  });
});

// ---------------------------------------------------------------------------
// Canvas editing (flow-canvas-editing)

const visibleOf = (key, x, y, width = 377, height = 878) => ({ key, ...geometry.getFrameVisibleRect({ height, width, x, y }, "route") });

test("marquee selection selects touching visible rects (spec example)", () => {
  const frames = [visibleOf("A", 0, 0), visibleOf("B", 480, 0), visibleOf("C", 0, 2000)];
  const touchingAB = { height: 100, width: 200, x: 300, y: 100 };
  const touchingNone = { height: 50, width: 50, x: 400, y: 900 };

  assert.deepEqual(geometry.getMarqueeSelection(frames, touchingAB), ["A", "B"]);
  assert.deepEqual(geometry.getMarqueeSelection(frames, touchingAB, { additive: true, base: ["C"] }), ["C", "A", "B"]);
  assert.deepEqual(geometry.getMarqueeSelection(frames, touchingNone), []);
  // The empty name band above a route's preview selects nothing.
  assert.deepEqual(geometry.getMarqueeSelection(frames, { height: 40, width: 100, x: 100, y: 10 }), []);
});

test("snapping threshold by zoom (spec example)", () => {
  for (const [zoom, threshold] of [[4, 2], [1, 6], [0.5, 12], [0.3, 20], [0.1, 20]]) {
    assert.equal(geometry.getSnapThreshold(zoom), threshold, `zoom ${zoom}`);
  }
});

test("snapping between two route frames (spec example)", () => {
  const far = geometry.computeSnap(visibleOf("d", 2290, 905), [visibleOf("c", 2280, 0)], geometry.getSnapThreshold(0.1));

  assert.equal(far.dx, -10);
  assert.equal(far.dy, 0);
  assert.deepEqual(far.guides.map(({ axis, position }) => [axis, position]), [["x", 2281]]);

  const near = geometry.computeSnap(visibleOf("d", 101, 2000), [visibleOf("c", 480, 0)], geometry.getSnapThreshold(1));

  assert.equal(near.dx, 4);
  assert.equal(near.dy, 0);
  assert.deepEqual(near.guides.map(({ axis, position }) => [axis, position]), [["x", 481]]);
});

test("left edges align at zoom 0.5 (spec scenario)", () => {
  const snap = geometry.computeSnap(visibleOf("d", 487, 3000), [visibleOf("c", 480, 0)], geometry.getSnapThreshold(0.5));

  assert.equal(snap.dx, -7);
  assert.equal(snap.dy, 0);
  assert.deepEqual(snap.guides[0], { axis: "x", end: 3000 + 878 - 1, position: 481, start: 65 });
  assert.deepEqual(geometry.computeSnap(visibleOf("d", 487, 3000), [], 12), { dx: 0, dy: 0, guides: [] });
});

test("keyboard nudges move 20, or 100 with Shift (spec example)", () => {
  assert.deepEqual(geometry.nudgeOffset("ArrowRight", false), { dx: 20, dy: 0 });
  assert.deepEqual(geometry.nudgeOffset("ArrowDown", true), { dx: 0, dy: 100 });
  assert.deepEqual(geometry.nudgeOffset("ArrowLeft", false), { dx: -20, dy: 0 });
  assert.deepEqual(geometry.nudgeOffset("ArrowUp", true), { dx: 0, dy: -100 });
  assert.equal(geometry.nudgeOffset("KeyA", false), null);
  // Three taps in one action from (480, 980): (540, 980).
  const total = [1, 2, 3].map(() => geometry.nudgeOffset("ArrowRight", false)).reduce((sum, { dx }) => sum + dx, 0);

  assert.equal(480 + total, 540);
});

test("layout history keeps complete position maps (spec example)", () => {
  const history = geometry.createLayoutHistory(100);
  const state = { positions: { A: { x: 0, y: 0 } } };
  const apply = (after) => {
    history.push({ after, before: state.positions });
    state.positions = after;
  };

  apply({ A: { x: 200, y: 0 } });
  assert.equal(history.canRedo(), false);
  apply({ A: { x: 220, y: 0 } });
  state.positions = history.undo().before;
  assert.deepEqual([state.positions.A, history.canRedo()], [{ x: 200, y: 0 }, true]);
  state.positions = history.undo().before;
  assert.deepEqual([state.positions.A, history.canRedo()], [{ x: 0, y: 0 }, true]);
  state.positions = history.redo().after;
  assert.deepEqual([state.positions.A, history.canRedo()], [{ x: 200, y: 0 }, true]);
  apply({ A: { x: 100, y: 100 } });
  assert.deepEqual([state.positions.A, history.canRedo()], [{ x: 100, y: 100 }, false]);

  // Reset records the complete map before and an empty map after.
  apply({});
  assert.deepEqual(history.undo().before, { A: { x: 100, y: 100 } });
  assert.deepEqual(history.redo().after, {});
  // An auto layout entry carries its feature names; a re-arrangement updates its after state.
  history.push({ after: { A: { x: 0, y: 0 } }, before: {}, lanesAfter: [{ anchor: "A", key: "group:a", title: "a" }], lanesBefore: null });
  assert.equal(history.peekUndo().lanesAfter.length, 1);
  history.updateLatestAfter({ A: { x: 0, y: 40 } });
  assert.deepEqual(history.undo().after, { A: { x: 0, y: 40 } });
  assert.deepEqual(history.redo().after, { A: { x: 0, y: 40 } });
  history.clear();
  assert.equal(history.canUndo(), false);

  // The 101st entry drops the oldest.
  const limited = geometry.createLayoutHistory(100);

  for (let index = 0; index < 101; index += 1) limited.push({ after: { A: { x: index + 1, y: 0 } }, before: { A: { x: index, y: 0 } } });
  let undone = 0;
  while (limited.canUndo()) {
    limited.undo();
    undone += 1;
  }
  assert.equal(undone, 100);
});

test("section padding keeps clear of foreign frames (spec example)", () => {
  for (const [gap, padding] of [[103, 32], [60, 26], [22, 7], [6, 0]]) {
    const frames = [
      { group: "g", key: "a", type: "route", x: 0, y: 0, width: 377, height: 878 },
      { group: "g", key: "b", type: "route", x: 0, y: 2000, width: 377, height: 878 },
      { group: "other", key: "c", type: "route", x: 377 + gap, y: 0, width: 377, height: 878 },
    ];
    const [section] = geometry.computeSectionShapes(frames).filter((shape) => shape.group === "g");

    assert.equal(section.rects[0].x, 0 - padding, `gap ${gap}`);
    assert.equal(section.rects[0].width, 377 + padding * 2, `gap ${gap}`);
  }
});

test("only groups with two routes draw a section; nodes join one (spec scenario)", () => {
  const frames = [
    { group: "solo", key: "s", type: "route", x: 0, y: 0, width: 377, height: 878 },
    ...[0, 1, 2, 3].map((index) => ({ group: "four", key: `f${index}`, type: "route", x: 600 + index * 480, y: 0, width: 377, height: 878 })),
    { group: "four", key: "decision", type: "flow", x: 600, y: 1100, width: 220, height: 220 },
    { group: "solo", key: "lonely-node", type: "flow", x: 0, y: 1100, width: 220, height: 220 },
  ];
  const sections = geometry.computeSectionShapes(frames);

  assert.deepEqual(sections.map((section) => section.group), ["four"]);
  assert.equal(sections[0].rects.length, 5, "four routes and the node");
  assert.match(sections[0].path, /^M/);
  assert.equal(sections[0].path.split("Z").filter(Boolean).length, 5);
  assert.deepEqual(sections[0].label, { x: sections[0].rects[0].x, y: sections[0].rects[0].y });
});

test("a section names the top-most, then left-most, member", () => {
  const frames = [
    { group: "g", key: "low", type: "route", x: 0, y: 200, width: 377, height: 878 },
    { group: "g", key: "right", type: "route", x: 960, y: 100, width: 377, height: 878 },
    { group: "g", key: "left", type: "route", x: 480, y: 100, width: 377, height: 878 },
  ];
  const [section] = geometry.computeSectionShapes(frames);

  assert.deepEqual(section.label, { x: 480 - 32, y: 100 - 32 });
  assert.equal(section.memberTop, 100);
  // A route's frame label sits on its visible rect, 65 px below the box top.
  const [labelled] = geometry.computeSectionShapes(frames.map((frame) => ({ ...frame, labelY: frame.y + 65 })));

  assert.equal(labelled.memberTop, 165);
});

test("minimap transform maps world points and back", () => {
  const transform = geometry.getMinimapTransform({ height: 2000, width: 4000, x: 0, y: 0 }, { height: 1000, width: 1000, x: 3500, y: 1500 }, { height: 120, width: 176 });
  const worldPoint = { x: 2400, y: 1200 };
  const panelPoint = { x: (worldPoint.x - transform.originX) * transform.scale + transform.offsetX, y: (worldPoint.y - transform.originY) * transform.scale + transform.offsetY };
  const back = geometry.minimapPointToWorld(panelPoint, transform);

  assert.ok(Math.abs(back.x - 2400) < 1e-6 && Math.abs(back.y - 1200) < 1e-6);
  // The union of content (0..4000 x 0..2000) and viewport (..4500 x ..2500) fits the panel.
  assert.ok(4500 * transform.scale <= 176 + 1e-9 && 2500 * transform.scale <= 120 + 1e-9);
});

test("adjacent routes and journey steps wrap (spec examples)", () => {
  const routes = ["a", "b", "c"];

  assert.equal(geometry.getAdjacentRouteId(routes, "b", 1), "c");
  assert.equal(geometry.getAdjacentRouteId(routes, "c", 1), "a");
  assert.equal(geometry.getAdjacentRouteId(routes, "a", -1), "c");
  assert.equal(geometry.getAdjacentRouteId(routes, null, 1), "a");
  assert.equal(geometry.getAdjacentRouteId(routes, null, -1), "c");
  // intake, review, approval-decision, review
  for (const [current, direction, expected] of [[null, 1, 0], [null, -1, 3], [1, 1, 2], [3, 1, 0], [0, -1, 3]]) {
    assert.equal(geometry.getAdjacentStepIndex(4, current, direction), expected, `${current} ${direction}`);
  }
});

test("editing keys: Escape order and key routing (spec examples)", () => {
  const key = (code, extra = {}) => ({ type: "keydown", code, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra });
  const canvas = { dragActive: false, isMac: true, isTextEntry: false, overlayOpen: false, targetIsControl: false };
  const selected = { ...canvas, selectionSize: 1, selectedRouteCount: 1 };
  const rows = [
    ["Escape, zoom menu open", key("Escape"), { ...selected, overlayOpen: true }, "close-overlay"],
    ["Escape, group drag", key("Escape"), { ...selected, dragActive: true }, "cancel-drag"],
    ["Escape, marquee", key("Escape"), { ...selected, marqueeActive: true }, "cancel-marquee"],
    ["Escape, selection", key("Escape"), selected, "clear-selection"],
    ["Escape, nothing", key("Escape"), canvas, null],
    ["Cmd+A", key("KeyA", { metaKey: true }), canvas, "select-all"],
    ["Cmd+A, dialog open", key("KeyA", { metaKey: true }), { ...canvas, overlayOpen: true }, null],
    ["Cmd+A, drag", key("KeyA", { metaKey: true }), { ...selected, dragActive: true }, null],
    ["ArrowRight, selection", key("ArrowRight"), selected, "nudge"],
    ["Shift+ArrowDown, selection", key("ArrowDown", { shiftKey: true }), selected, "nudge"],
    ["ArrowRight, nothing selected", key("ArrowRight"), canvas, null],
    ["ArrowRight, journey focus", key("ArrowRight"), { ...selected, journeyFocus: true }, null],
    ["ArrowDown, journey list focused", key("ArrowDown"), { ...selected, targetIsControl: true }, null],
    ["Cmd+ArrowRight (macOS)", key("ArrowRight", { metaKey: true }), selected, null],
    ["Cmd+Shift+ArrowUp", key("ArrowUp", { metaKey: true, shiftKey: true }), selected, null],
    ["Cmd+Z, an entry", key("KeyZ", { metaKey: true }), { ...canvas, canUndo: true }, "undo"],
    ["Cmd+Z, no entry", key("KeyZ", { metaKey: true }), canvas, null],
    ["Cmd+Z, group drag", key("KeyZ", { metaKey: true }), { ...selected, canUndo: true, dragActive: true }, null],
    ["Cmd+Z, marquee", key("KeyZ", { metaKey: true }), { ...canvas, canUndo: true, marqueeActive: true }, null],
    ["Cmd+Z, journey focus", key("KeyZ", { metaKey: true }), { ...canvas, canUndo: true, journeyFocus: true }, null],
    ["Cmd+Shift+Z, an entry to redo", key("KeyZ", { metaKey: true, shiftKey: true }), { ...canvas, canRedo: true }, "redo"],
    ["Ctrl+Y (Windows)", key("KeyY", { ctrlKey: true }), { ...canvas, canRedo: true, isMac: false }, "redo"],
    ["Ctrl+Y (macOS)", key("KeyY", { ctrlKey: true }), { ...canvas, canRedo: true }, null],
    ["Shift+2, selection", key("Digit2", { shiftKey: true }), selected, "zoom-to-selection"],
    ["Shift+2, nothing", key("Digit2", { shiftKey: true }), canvas, null],
    ["N", key("KeyN"), canvas, "next-frame"],
    ["Shift+N", key("KeyN", { shiftKey: true }), canvas, "previous-frame"],
    ["N, marquee", key("KeyN"), { ...canvas, marqueeActive: true }, null],
    ["Cmd+N stays with the browser", key("KeyN", { metaKey: true }), canvas, null],
    ["IME composition", key("KeyN", { isComposing: true }), canvas, null],
    ["keyCode 229", key("ArrowRight", { keyCode: 229 }), selected, null],
  ];

  for (const [label, eventLike, context, expected] of rows) {
    assert.equal(geometry.resolveCanvasShortcut(eventLike, context), expected, label);
  }
});
