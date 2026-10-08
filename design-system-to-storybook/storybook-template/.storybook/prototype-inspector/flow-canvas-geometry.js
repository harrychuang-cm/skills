// Pure UI Flow geometry for the Prototype Inspector: flow normalization,
// edge routing, label placement and viewport resolution. This module imports
// nothing and never reads window or document, so node --test can load it
// directly; preview.js and the UI Flow canvas import from it.

export const defaultPrototypeModeGlobalName = "prototypeMode";

const previewHeightCssVariable =
  "--prototype-inspector-viewport-compact-height";

const previewWidthCssVariable =
  "--prototype-inspector-viewport-compact-width";

// Form-factor tier tokens: compact = phone, medium = tablet, wide = desktop.
const formFactorCssVariables = {
  desktop: {
    height: "--prototype-inspector-viewport-wide-height",
    width: "--prototype-inspector-viewport-wide-width",
  },
  phone: {
    height: previewHeightCssVariable,
    width: previewWidthCssVariable,
  },
  tablet: {
    height: "--prototype-inspector-viewport-medium-height",
    width: "--prototype-inspector-viewport-medium-width",
  },
};

const formFactorFallbackSizes = {
  desktop: { height: 800, width: 1280 },
  phone: { height: 812, width: 375 },
  tablet: { height: 1024, width: 768 },
};

const nodeWidth = 423;

export const nodeHeaderHeight = 64;

export const nodeFrameSize = 2;

const decisionNodeSize = 220;

const stateNodeWidth = 308;

const stateNodeHeight = 124;

const defaultNodePreviewHeight = 812;

export const defaultNodeHeight =
  defaultNodePreviewHeight + nodeHeaderHeight + nodeFrameSize;

const edgeLabelVisualMinWidth = 64;

const edgeLabelVisualMaxWidth = 176;

const edgeLabelVisualHeight = 22;

const edgeLabelPlacementMargin = 18;

const edgeLabelObstacleMargin = 14;

const flowArrowLength = 14;

const flowArrowHalfWidth = 5;

export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Card size the legacy 360x260 auto-grid pitch was tuned for (phone frame).
const fallbackGridBaseSize = { height: 878, width: 377 };

const fallbackGridBasePitch = { x: 360, y: 260 };

export function getFallbackGridPitch(cardSize) {
  return {
    x: Math.round(
      (fallbackGridBasePitch.x * cardSize.width) / fallbackGridBaseSize.width,
    ),
    y: Math.round(
      (fallbackGridBasePitch.y * cardSize.height) / fallbackGridBaseSize.height,
    ),
  };
}

export function getRoutePosition(route, index, gridPitch = fallbackGridBasePitch) {
  const explicitPosition =
    route.flowPosition ?? route.position ?? route.layout?.position;

  if (
    isRecord(explicitPosition) &&
    typeof explicitPosition.x === "number" &&
    typeof explicitPosition.y === "number"
  ) {
    return explicitPosition;
  }

  return {
    x: (index % 3) * gridPitch.x,
    y: Math.floor(index / 3) * gridPitch.y,
  };
}

export function normalizeRoutes(flow) {
  return Array.isArray(flow?.routes) ? flow.routes.filter(isRecord) : [];
}

export function normalizeFlowNodes(flow) {
  return Array.isArray(flow?.nodes)
    ? flow.nodes.filter((node) => isRecord(node) && typeof node.id === "string")
    : [];
}

export function normalizeComponentRoutes(components) {
  return isRecord(components) && Array.isArray(components.routes)
    ? components.routes.filter(isRecord)
    : [];
}

export function normalizeRouteComponents(componentRoute) {
  return Array.isArray(componentRoute?.components)
    ? componentRoute.components.filter(isRecord)
    : [];
}

export function normalizeTransitions(flow) {
  return Array.isArray(flow?.transitions)
    ? flow.transitions.filter(
        (transition) =>
          isRecord(transition) &&
          typeof transition.from === "string" &&
          typeof transition.to === "string",
      )
    : [];
}

function getTransitionText(transition) {
  return transition.label ?? transition.trigger ?? `${transition.from} -> ${transition.to}`;
}

const flowEdgeColorVariants = [
  "primary",
  "secondary",
  "tertiary",
  "quaternary",
];

export function aggregateTransitions(transitions, nodeIds) {
  const edgeMap = new Map();

  for (const transition of transitions) {
    if (!nodeIds.has(transition.from) || !nodeIds.has(transition.to)) {
      continue;
    }

    const key = `${transition.from}->${transition.to}`;
    const edge =
      edgeMap.get(key) ??
      {
        flowLines: [],
        from: transition.from,
        key,
        kinds: [],
        labels: [],
        to: transition.to,
        triggers: [],
      };
    const label = getTransitionText(transition);

    if (!edge.labels.includes(label)) {
      edge.labels.push(label);
    }
    if (transition.trigger && !edge.triggers.includes(transition.trigger)) {
      edge.triggers.push(transition.trigger);
    }
    if (transition.kind && !edge.kinds.includes(transition.kind)) {
      edge.kinds.push(transition.kind);
    }
    if (transition.flowLine && !edge.flowLines.includes(transition.flowLine)) {
      edge.flowLines.push(transition.flowLine);
    }

    edgeMap.set(key, edge);
  }

  return [...edgeMap.values()];
}

export function isVisibleFlowEdge(edge) {
  return edge.flowLines.includes("key");
}

function getFlowEdgeColorAnchor(edge, nodeEdgeCounts) {
  if ((nodeEdgeCounts.get(edge.from) ?? 0) > 1) return edge.from;
  if ((nodeEdgeCounts.get(edge.to) ?? 0) > 1) return edge.to;
  return undefined;
}

export function addFlowEdgeColorVariants(edges) {
  const nodeEdgeCounts = new Map();

  edges.forEach((edge) => {
    [edge.from, edge.to].forEach((nodeId) => {
      nodeEdgeCounts.set(nodeId, (nodeEdgeCounts.get(nodeId) ?? 0) + 1);
    });
  });

  const nodeEdgeIndexes = new Map();

  return edges.map((edge) => {
    const anchor = getFlowEdgeColorAnchor(edge, nodeEdgeCounts);

    if (!anchor) return edge;

    const index = nodeEdgeIndexes.get(anchor) ?? 0;
    nodeEdgeIndexes.set(anchor, index + 1);

    return {
      ...edge,
      colorVariant: flowEdgeColorVariants[index % flowEdgeColorVariants.length],
    };
  });
}

function createPolylineResult(points, labelPosition) {
  const compactPoints = points.filter((point, index) => {
    const previousPoint = points[index - 1];

    return !previousPoint || point.x !== previousPoint.x || point.y !== previousPoint.y;
  });
  const labelStart = compactPoints[1] ?? compactPoints[0];
  const labelEnd =
    compactPoints[compactPoints.length - 2] ??
    compactPoints[compactPoints.length - 1];

  return {
    labelPosition:
      labelPosition ??
      {
        x: (labelStart.x + labelEnd.x) / 2,
        y: (labelStart.y + labelEnd.y) / 2,
      },
    pointList: compactPoints,
    points: compactPoints.map((point) => `${point.x},${point.y}`).join(" "),
  };
}

// arrowScale sizes the arrowhead in canvas units (1 / the representative zoom
// keeps it 14 screen pixels long at that zoom).
export function getFlowArrowPoints(points, arrowScale = 1) {
  const compactPoints = points.filter((point, index) => {
    const previousPoint = points[index - 1];

    return !previousPoint || point.x !== previousPoint.x || point.y !== previousPoint.y;
  });
  const tip = compactPoints[compactPoints.length - 1];
  const previous = [...compactPoints]
    .reverse()
    .find((point) => point.x !== tip?.x || point.y !== tip?.y);

  if (!tip || !previous) {
    return "";
  }

  const dx = tip.x - previous.x;
  const dy = tip.y - previous.y;
  const length = Math.hypot(dx, dy);

  if (length <= 0) {
    return "";
  }

  const ux = dx / length;
  const uy = dy / length;
  const baseCenter = {
    x: tip.x - ux * flowArrowLength * arrowScale,
    y: tip.y - uy * flowArrowLength * arrowScale,
  };
  const normal = {
    x: -uy,
    y: ux,
  };
  const halfWidth = flowArrowHalfWidth * arrowScale;
  const left = {
    x: baseCenter.x + normal.x * halfWidth,
    y: baseCenter.y + normal.y * halfWidth,
  };
  const right = {
    x: baseCenter.x - normal.x * halfWidth,
    y: baseCenter.y - normal.y * halfWidth,
  };

  return [tip, left, right]
    .map((point) => `${Math.round(point.x)},${Math.round(point.y)}`)
    .join(" ");
}

export function getFlowMetadataNodeSize(node) {
  if (node.shape === "decision") {
    return {
      height: decisionNodeSize,
      width: decisionNodeSize,
    };
  }

  return {
    height: stateNodeHeight,
    width: stateNodeWidth,
  };
}

export function getNodeWidth(node) {
  return node.width ?? nodeWidth;
}

function getNodeHeight(node) {
  return node.height ?? defaultNodeHeight;
}

function normalizeDeclaredViewportSize(value) {
  return isRecord(value) &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    Number.isFinite(value.height) &&
    value.height > 0
    ? { height: value.height, width: value.width }
    : null;
}

// Resolution chain: route.viewport → flow.viewport → form-factor tier CSS
// tokens → the built-in phone constants. `declared` marks whether the
// prototype names a viewport (drives the badge; legacy prototypes show none).
// readDimension(cssVariableName, fallbackValue) reads one tier token.
export function resolvePrototypeViewport(prototype, route, readDimension) {
  const flowViewportValue = prototype?.flow?.viewport;
  const formFactor =
    isRecord(flowViewportValue) &&
    typeof flowViewportValue.formFactor === "string" &&
    formFactorCssVariables[flowViewportValue.formFactor]
      ? flowViewportValue.formFactor
      : "phone";
  const declaredSize =
    normalizeDeclaredViewportSize(route?.viewport) ??
    normalizeDeclaredViewportSize(flowViewportValue);

  if (declaredSize) {
    return { declared: true, formFactor, ...declaredSize };
  }

  const cssVariables = formFactorCssVariables[formFactor];
  const fallbackSize = formFactorFallbackSizes[formFactor];

  return {
    declared: isRecord(flowViewportValue),
    formFactor,
    height: readDimension(cssVariables.height, fallbackSize.height),
    width: readDimension(cssVariables.width, fallbackSize.width),
  };
}

export function getRouteBottom(route) {
  return route.y + getNodeHeight(route);
}

function getRouteCenter(route) {
  return {
    x: route.x + getNodeWidth(route) / 2,
    y: route.y + getNodeHeight(route) / 2,
  };
}

function createGlobalPolyline(source, target) {
  const sourceBottom = {
    x: source.x + getNodeWidth(source) / 2,
    y: getRouteBottom(source),
  };
  const targetBottom = {
    x: target.x + getNodeWidth(target) / 2,
    y: getRouteBottom(target),
  };
  const laneY = Math.max(sourceBottom.y, targetBottom.y) + 44;
  const points = [
    sourceBottom,
    { x: sourceBottom.x, y: laneY },
    { x: targetBottom.x, y: laneY },
    targetBottom,
  ];

  return createPolylineResult(points, {
    x: (sourceBottom.x + targetBottom.x) / 2,
    y: laneY,
  });
}

function createSameColumnBypassPolyline(source, target) {
  const sourceCenter = getRouteCenter(source);
  const targetCenter = getRouteCenter(target);
  const columnOverlap =
    Math.abs(sourceCenter.x - targetCenter.x) <
    Math.min(getNodeWidth(source), getNodeWidth(target)) / 2;
  const upperRoute = source.y < target.y ? source : target;
  const lowerRoute = source.y < target.y ? target : source;
  const verticalGap = lowerRoute.y - getRouteBottom(upperRoute);
  const bypassThreshold = Math.min(getNodeHeight(source), getNodeHeight(target));

  if (!columnOverlap || verticalGap <= bypassThreshold) {
    return null;
  }

  const laneX =
    Math.max(source.x + getNodeWidth(source), target.x + getNodeWidth(target)) + 40;
  const start = { x: source.x + getNodeWidth(source), y: sourceCenter.y };
  const end = { x: target.x + getNodeWidth(target), y: targetCenter.y };
  const points = [
    start,
    { x: laneX, y: start.y },
    { x: laneX, y: end.y },
    end,
  ];

  return createPolylineResult(points, {
    x: laneX,
    y: (start.y + end.y) / 2,
  });
}

function createInterRowPolyline(source, target) {
  const sourceCenter = getRouteCenter(source);
  const targetCenter = getRouteCenter(target);
  const sourceIsUpper = source.y < target.y;
  const upperRoute = sourceIsUpper ? source : target;
  const lowerRoute = sourceIsUpper ? target : source;
  const gapStart = getRouteBottom(upperRoute);
  const gapEnd = lowerRoute.y;
  const laneY = gapStart + (gapEnd - gapStart) / 2;

  if (gapEnd - gapStart < 42) {
    return null;
  }

  const start = sourceIsUpper
    ? { x: sourceCenter.x, y: getRouteBottom(source) }
    : { x: sourceCenter.x, y: source.y };
  const end = sourceIsUpper
    ? { x: targetCenter.x, y: target.y }
    : { x: targetCenter.x, y: getRouteBottom(target) };
  const points = [
    start,
    { x: start.x, y: laneY },
    { x: end.x, y: laneY },
    end,
  ];

  return createPolylineResult(points, {
    x: (start.x + end.x) / 2,
    y: laneY,
  });
}

function getAnchorPair(source, target, hasReverse) {
  const sourceCenter = getRouteCenter(source);
  const targetCenter = getRouteCenter(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const isHorizontalFlow = Math.abs(dx) >= Math.abs(dy);
  const offset = hasReverse
    ? isHorizontalFlow
      ? dx >= 0
        ? 18
        : -18
      : dy >= 0
        ? 18
        : -18
    : 0;

  if (isHorizontalFlow) {
    if (dx >= 0) {
      return {
        end: { x: target.x, y: targetCenter.y + offset },
        start: { x: source.x + getNodeWidth(source), y: sourceCenter.y + offset },
      };
    }

    return {
      end: { x: target.x + getNodeWidth(target), y: targetCenter.y + offset },
      start: { x: source.x, y: sourceCenter.y + offset },
    };
  }

  if (dy >= 0) {
    return {
      end: { x: targetCenter.x + offset, y: target.y },
      start: { x: sourceCenter.x + offset, y: getRouteBottom(source) },
    };
  }

  return {
    end: { x: targetCenter.x + offset, y: getRouteBottom(target) },
    start: { x: sourceCenter.x + offset, y: source.y },
  };
}

export function createPolyline(edge, routePositionMap, reverseEdgeKeys) {
  const source = routePositionMap.get(edge.from);
  const target = routePositionMap.get(edge.to);

  if (!source || !target) {
    return null;
  }

  const hasReverse = reverseEdgeKeys.has(edge.key);
  const isGlobalTransition = edge.kinds.includes("global");

  if (isGlobalTransition) {
    return createGlobalPolyline(source, target);
  }

  if (!hasReverse) {
    const bypassPolyline = createSameColumnBypassPolyline(source, target);

    if (bypassPolyline) {
      return bypassPolyline;
    }

    const interRowPolyline = createInterRowPolyline(source, target);

    if (interRowPolyline) {
      return interRowPolyline;
    }
  }

  const { start, end } = getAnchorPair(source, target, hasReverse);
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const points = horizontal
    ? [
        start,
        { x: start.x + (end.x - start.x) / 2, y: start.y },
        { x: start.x + (end.x - start.x) / 2, y: end.y },
        end,
      ]
    : [
        start,
        { x: start.x, y: start.y + (end.y - start.y) / 2 },
        { x: end.x, y: start.y + (end.y - start.y) / 2 },
        end,
      ];

  return createPolylineResult(points);
}

function getLabelRect(position, size) {
  return {
    bottom: position.y + size.height / 2,
    left: position.x - size.width / 2,
    right: position.x + size.width / 2,
    top: position.y - size.height / 2,
  };
}

function getIntersectionArea(firstRect, secondRect) {
  const width =
    Math.min(firstRect.right, secondRect.right) -
    Math.max(firstRect.left, secondRect.left);
  const height =
    Math.min(firstRect.bottom, secondRect.bottom) -
    Math.max(firstRect.top, secondRect.top);

  return width > 0 && height > 0 ? width * height : 0;
}

function expandRect(rect, margin) {
  return {
    bottom: rect.bottom + margin,
    left: rect.left - margin,
    right: rect.right + margin,
    top: rect.top - margin,
  };
}

function clampLabelPosition(position, size, canvasMetrics) {
  return {
    x: Math.min(
      canvasMetrics.width - size.width / 2 - edgeLabelPlacementMargin,
      Math.max(size.width / 2 + edgeLabelPlacementMargin, position.x),
    ),
    y: Math.min(
      canvasMetrics.height - size.height / 2 - edgeLabelPlacementMargin,
      Math.max(size.height / 2 + edgeLabelPlacementMargin, position.y),
    ),
  };
}

function getRouteObstacleRects(routePositionMap) {
  return [...routePositionMap.values()].map((route) => ({
    bottom: getRouteBottom(route) + edgeLabelObstacleMargin,
    left: route.x - edgeLabelObstacleMargin,
    right: route.x + getNodeWidth(route) + edgeLabelObstacleMargin,
    top: route.y - edgeLabelObstacleMargin,
  }));
}

export function getEdgeLabelPrefix(edge) {
  return edge.kinds.includes("condition") ? "條件" : "點擊";
}

function getLabelCanvasSize(edge, labelScale) {
  const labelText = `${getEdgeLabelPrefix(edge)} ${edge.labels.join(" / ")}`;
  const textUnits = [...labelText].reduce((units, character) => {
    if (/\s/.test(character)) {
      return units + 0.35;
    }

    return units + (/^[\u4e00-\u9fff]$/.test(character) ? 1 : 0.62);
  }, 0);
  const visualWidth = Math.min(
    edgeLabelVisualMaxWidth,
    Math.max(edgeLabelVisualMinWidth, textUnits * 7 + 32),
  );

  return {
    height: edgeLabelVisualHeight * labelScale,
    width: visualWidth * labelScale,
  };
}

function getLabelPositionScore(
  position,
  size,
  origin,
  routeObstacles,
  placedLabelRects,
  canvasMetrics,
) {
  const rect = getLabelRect(position, size);
  const routeOverlap = getTotalIntersectionArea(rect, routeObstacles);
  const labelOverlap = getTotalIntersectionArea(rect, placedLabelRects);
  const overflow =
    Math.max(0, -rect.left) +
    Math.max(0, -rect.top) +
    Math.max(0, rect.right - canvasMetrics.width) +
    Math.max(0, rect.bottom - canvasMetrics.height);
  const distance = Math.hypot(position.x - origin.x, position.y - origin.y);

  return routeOverlap * 1000 + labelOverlap * 600 + overflow * 200 + distance;
}

// Plain loops: label placement runs these for every candidate of every edge,
// so they avoid per-obstacle allocations. Summation order matches the array.
function getTotalIntersectionArea(rect, obstacles) {
  let total = 0;

  for (let index = 0; index < obstacles.length; index += 1) {
    total += getIntersectionArea(rect, obstacles[index]);
  }

  return total;
}

// The obstacle with the largest intersection; the first one wins a tie.
function getLargestOverlappingObstacle(rect, obstacles) {
  let largest = null;
  let largestArea = 0;

  for (let index = 0; index < obstacles.length; index += 1) {
    const area = getIntersectionArea(rect, obstacles[index]);

    if (area > largestArea) {
      largest = obstacles[index];
      largestArea = area;
    }
  }

  return largest;
}

function resolveLabelCandidate(position, size, obstacles, canvasMetrics) {
  let nextPosition = clampLabelPosition(position, size, canvasMetrics);

  for (let index = 0; index < 8; index += 1) {
    const rect = getLabelRect(nextPosition, size);
    const obstacle = getLargestOverlappingObstacle(rect, obstacles);

    if (!obstacle) {
      return nextPosition;
    }

    const pushOptions = [
      {
        x: obstacle.left - rect.right - edgeLabelPlacementMargin,
        y: 0,
      },
      {
        x: obstacle.right - rect.left + edgeLabelPlacementMargin,
        y: 0,
      },
      {
        x: 0,
        y: obstacle.top - rect.bottom - edgeLabelPlacementMargin,
      },
      {
        x: 0,
        y: obstacle.bottom - rect.top + edgeLabelPlacementMargin,
      },
    ]
      .map((push) => {
        const positionAfterPush = clampLabelPosition(
          {
            x: nextPosition.x + push.x,
            y: nextPosition.y + push.y,
          },
          size,
          canvasMetrics,
        );
        const rectAfterPush = getLabelRect(positionAfterPush, size);

        return {
          distance: Math.hypot(positionAfterPush.x - position.x, positionAfterPush.y - position.y),
          overlap: getTotalIntersectionArea(rectAfterPush, obstacles),
          position: positionAfterPush,
        };
      })
      .sort(
        (first, second) =>
          first.overlap - second.overlap || first.distance - second.distance,
      );

    nextPosition = pushOptions[0]?.position ?? nextPosition;
  }

  return nextPosition;
}

function getLabelCandidatePositions(polyline, size) {
  const candidates = [polyline.labelPosition];
  const points = polyline.pointList ?? [];
  const segmentRatios = [0.5, 0.35, 0.65];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.hypot(dx, dy);

    if (segmentLength < edgeLabelPlacementMargin * 2) {
      continue;
    }

    const isHorizontal = Math.abs(dx) >= Math.abs(dy);
    const primaryOffset =
      (isHorizontal ? size.height : size.width) / 2 + edgeLabelPlacementMargin;
    const offsets = [
      0,
      -primaryOffset,
      primaryOffset,
      -primaryOffset * 2,
      primaryOffset * 2,
    ];

    for (const ratio of segmentRatios) {
      const base = {
        x: start.x + dx * ratio,
        y: start.y + dy * ratio,
      };

      for (const offset of offsets) {
        candidates.push(
          isHorizontal
            ? { x: base.x, y: base.y + offset }
            : { x: base.x + offset, y: base.y },
        );
      }
    }
  }

  const uniqueCandidates = new Map();
  candidates.forEach((candidate) => {
    uniqueCandidates.set(`${Math.round(candidate.x)}:${Math.round(candidate.y)}`, candidate);
  });

  return [...uniqueCandidates.values()];
}

// getMeasuredLabelSize(edge), when given, returns the label's rendered size in
// screen pixels (or null); labelScale converts it to canvas units. Without it
// the size is estimated from the label text.
export function placeEdgeLabels(
  edges,
  routePositionMap,
  canvasMetrics,
  labelScale,
  getMeasuredLabelSize,
) {
  const routeObstacles = getRouteObstacleRects(routePositionMap);
  const placedLabelRects = [];

  return edges.map((edge) => {
    const measuredSize = getMeasuredLabelSize?.(edge);
    const labelSize = measuredSize
      ? { height: measuredSize.height * labelScale, width: measuredSize.width * labelScale }
      : getLabelCanvasSize(edge, labelScale);
    const origin = edge.polyline.labelPosition;
    const obstacles = [...routeObstacles, ...placedLabelRects];
    const candidates = getLabelCandidatePositions(edge.polyline, labelSize)
      .map((candidate) =>
        resolveLabelCandidate(candidate, labelSize, obstacles, canvasMetrics),
      )
      .map((candidate) => ({
        position: candidate,
        score: getLabelPositionScore(
          candidate,
          labelSize,
          origin,
          routeObstacles,
          placedLabelRects,
          canvasMetrics,
        ),
      }))
      .sort((first, second) => first.score - second.score);
    const bestPosition = candidates[0]?.position ?? origin;

    placedLabelRects.push(
      expandRect(getLabelRect(bestPosition, labelSize), edgeLabelPlacementMargin / 2),
    );

    return {
      ...edge,
      polyline: {
        ...edge.polyline,
        labelPosition: bestPosition,
      },
    };
  });
}

export function normalizeStorybookGlobals(value) {
  const globals = new Map();

  String(value ?? "")
    .split(";")
    .forEach((entry) => {
      const [key, ...valueParts] = entry.split(":");
      const trimmedKey = key?.trim();
      const trimmedValue = valueParts.join(":").trim();

      if (trimmedKey && trimmedValue) {
        globals.set(trimmedKey, trimmedValue);
      }
    });

  return globals;
}

export function getPrototypeFlowExportStoryId(prototype) {
  const figmaExport = isRecord(prototype.figmaExport)
    ? prototype.figmaExport
    : {};
  const flowExport = isRecord(prototype.flow?.figmaExport)
    ? prototype.flow.figmaExport
    : {};
  const storyId =
    figmaExport.flowStoryId ??
    figmaExport.storyId ??
    flowExport.storyId ??
    prototype.flow?.figmaExportStoryId;

  return typeof storyId === "string" && storyId.trim() ? storyId.trim() : "";
}

// Camera, input and shortcut math for the UI Flow canvas. The camera is
// { x, y, z }: a world point (wx, wy) is drawn at (wx * z + x, wy * z + y)
// on the canvas.
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 4;
export const ZOOM_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 4];
export const DRAG_THRESHOLD_PX = 3;
const wheelDeltaClampPx = 30;
const wheelLinePx = 16;
const zoomStepTolerance = 1.05;
const fitInsetMaxPx = 96;
const fitInsetRatio = 0.1;
const routeVisibleTop = nodeHeaderHeight + 1;

export function clampZoom(zoom) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToWorld(point, camera) {
  return {
    x: (point.x - camera.x) / camera.z,
    y: (point.y - camera.y) / camera.z,
  };
}

export function worldToScreen(point, camera) {
  return {
    x: point.x * camera.z + camera.x,
    y: point.y * camera.z + camera.y,
  };
}

// Changes the zoom while the world point under `anchor` (a canvas position)
// stays where it is on screen: t' = p - (p - t) * z' / z.
export function zoomAtPoint(camera, nextZoom, anchor) {
  const z = clampZoom(nextZoom);
  const ratio = z / camera.z;

  return {
    x: anchor.x - (anchor.x - camera.x) * ratio,
    y: anchor.y - (anchor.y - camera.y) * ratio,
    z,
  };
}

// Wheel deltas in CSS pixels: deltaMode 1 counts lines (16 px), deltaMode 2
// counts pages (the canvas height).
export function normalizeWheelDelta(eventLike, canvasHeight) {
  const unit =
    eventLike.deltaMode === 1 ? wheelLinePx : eventLike.deltaMode === 2 ? canvasHeight : 1;

  return {
    dx: (eventLike.deltaX ?? 0) * unit,
    dy: (eventLike.deltaY ?? 0) * unit,
  };
}

// What a wheel event inside the UI Flow root does. Modifier wheels (and
// trackpad pinch, which arrives as a ctrlKey wheel) zoom from anywhere in the
// root unless a Safari gesture already drives the zoom; plain wheels pan over
// the viewport, keep native scrolling over scrollable panels and are
// swallowed elsewhere. Pan deltas are in CSS pixels; the camera moves by
// (-dx, -dy).
export function classifyWheel(eventLike, context) {
  const cancelable = eventLike.cancelable !== false;

  if (eventLike.ctrlKey || eventLike.metaKey || eventLike.altKey) {
    return {
      action: context.gestureActive ? "ignore" : "zoom",
      preventDefault: cancelable,
    };
  }

  if (context.overViewport) {
    const { dx, dy } = normalizeWheelDelta(eventLike, context.canvasHeight);

    return eventLike.shiftKey && !context.isMac
      ? { action: "pan", dx: dx + dy, dy: 0, preventDefault: cancelable }
      : { action: "pan", dx, dy, preventDefault: cancelable };
  }

  if (context.overScrollable) {
    return { action: "native", preventDefault: false };
  }

  return { action: "ignore", preventDefault: cancelable };
}

// Continuous zoom from one wheel event: z' = z * exp(-Δ / 100) with Δ the
// pixel deltaY clamped to ±30, anchored at the pointer.
export function applyWheelZoom(camera, eventLike, anchor, canvasHeight) {
  const { dy } = normalizeWheelDelta(eventLike, canvasHeight);
  const delta = Math.min(wheelDeltaClampPx, Math.max(-wheelDeltaClampPx, dy));

  return zoomAtPoint(camera, camera.z * Math.exp(-delta / 100), anchor);
}

// What a pointerdown on the canvas starts: the middle button and a primary
// press while Space is held pan; Cmd/Meta does not. Other primary presses go
// to the frame under the pointer or to empty canvas.
export function classifyPointerDown(eventLike, context) {
  if (eventLike.button === 1) {
    return { action: "pan", preventDefault: true };
  }

  if (eventLike.button !== 0) {
    return { action: "none", preventDefault: false };
  }

  if (context.spaceHeld) {
    return { action: "pan", preventDefault: true };
  }

  return { action: context.onFrame ? "frame" : "canvas", preventDefault: false };
}

// Discrete zoom: the next step table entry beyond 1.05x (in) or below 1/1.05x
// (out) of the current zoom, or the current zoom when none qualifies.
export function stepZoom(zoom, direction) {
  if (direction === "in") {
    return ZOOM_STEPS.find((step) => step > zoom * zoomStepTolerance) ?? zoom;
  }

  const smaller = ZOOM_STEPS.filter((step) => step < zoom / zoomStepTolerance);

  return smaller.length > 0 ? smaller[smaller.length - 1] : zoom;
}

// Centers `bounds` in a canvas of `canvasSize` at
// min(1, (W - 2i) / bw, (H - 2i) / bh) clamped to the zoom range, with
// i = min(96, 10% of min(W, H)).
export function fitCamera(bounds, canvasSize) {
  const { height, width } = canvasSize;

  if (!bounds) {
    return { x: width / 2, y: height / 2, z: 1 };
  }

  const inset = Math.min(fitInsetMaxPx, fitInsetRatio * Math.min(width, height));
  const z = clampZoom(
    Math.min(
      1,
      bounds.width > 0 ? (width - 2 * inset) / bounds.width : 1,
      bounds.height > 0 ? (height - 2 * inset) / bounds.height : 1,
    ),
  );

  return {
    x: width / 2 - (bounds.x + bounds.width / 2) * z,
    y: height / 2 - (bounds.y + bounds.height / 2) * z,
    z,
  };
}

// Zoom bucket round(2 * log2(z)): one bucket per ~1.41x of zoom.
export function getZoomBucket(zoom) {
  return Math.round(2 * Math.log2(zoom));
}

// World bounding box of frame boxes ({ x, y, width, height }), or null.
export function getFlowBounds(frames) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const frame of frames) {
    left = Math.min(left, frame.x);
    top = Math.min(top, frame.y);
    right = Math.max(right, frame.x + frame.width);
    bottom = Math.max(bottom, frame.y + frame.height);
  }

  return Number.isFinite(left)
    ? { height: bottom - top, width: right - left, x: left, y: top }
    : null;
}

// The part of a frame the reviewer sees: a route frame's preview rect (65 px
// below the box top, 1 px in from the other sides) or a flow-only node's box.
export function getFrameVisibleRect(box, frameType) {
  if (frameType === "route") {
    return {
      height: box.height - routeVisibleTop - nodeFrameSize / 2,
      width: box.width - nodeFrameSize,
      x: box.x + nodeFrameSize / 2,
      y: box.y + routeVisibleTop,
    };
  }

  return { height: box.height, width: box.width, x: box.x, y: box.y };
}

// ---------------------------------------------------------------------------
// Level of detail: which route frames render live, as snapshots, as
// placeholders or not at all (flow-canvas-level-of-detail).

// Estimates from 11 real prototypes; the bench and a visual check confirm them,
// and only these numbers change if they do not.
export const LOD_THRESHOLDS = Object.freeze({
  hoverDwellMs: 200,
  hoverLiveMinZoom: 0.4,
  liveKeepZoom: 0.64,
  liveMinVisibleFraction: 0.4,
  liveMinZoom: 0.8,
  placeholderMaxWidth: 40,
});
// Live route iframes, besides one frame pinned live and the snapshot renderer.
export const LIVE_FRAME_LIMIT = 6;

// The canvas viewport grown on each side by expandRatio of its own width and
// height, in world coordinates.
export function getVisibleWorldRect(camera, canvasSize, expandRatio = 0) {
  const padX = canvasSize.width * expandRatio;
  const padY = canvasSize.height * expandRatio;

  return {
    height: (canvasSize.height + padY * 2) / camera.z,
    width: (canvasSize.width + padX * 2) / camera.z,
    x: (-padX - camera.x) / camera.z,
    y: (-padY - camera.y) / camera.z,
  };
}

function getOverlapArea(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

  return width > 0 && height > 0 ? width * height : 0;
}

// The tier of every frame instance, keyed by instance key: "culled",
// "placeholder", "snapshot" or "live". frames are { key, routeId, x, y, width,
// height } world boxes; hovered is { key, dwellMs } or null. The pinned frame
// is always live; live candidates beyond LIVE_FRAME_LIMIT fall back in order:
// promoted, hovered, larger visible area, already live, nearer the center,
// then key. promotedIds is a Set or an array; no input is changed.
export function selectFrameTiers({
  camera,
  canvasSize,
  frames,
  hovered = null,
  pinnedId = null,
  previousTiers = new Map(),
  promotedIds = new Set(),
}) {
  const tiers = new Map();
  const promotedKeys = promotedIds instanceof Set ? promotedIds : new Set(promotedIds ?? []);
  const zoom = camera.z;
  const viewport = { height: canvasSize.height, width: canvasSize.width, x: 0, y: 0 };
  const expanded = getVisibleWorldRect(camera, canvasSize, 0.5);
  const candidates = [];

  frames.forEach((frame) => {
    if (frame.key === pinnedId) {
      tiers.set(frame.key, "live");
      return;
    }

    if (getOverlapArea(frame, expanded) === 0) {
      tiers.set(frame.key, "culled");
      return;
    }

    const screen = {
      height: frame.height * zoom,
      width: frame.width * zoom,
      x: frame.x * zoom + camera.x,
      y: frame.y * zoom + camera.y,
    };
    const area = screen.width * screen.height;
    const visibleArea = getOverlapArea(screen, viewport);
    const fraction = area > 0 ? visibleArea / area : 0;
    const promoted = promotedKeys.has(frame.key) && zoom >= LOD_THRESHOLDS.hoverLiveMinZoom;
    const isHovered =
      hovered?.key === frame.key &&
      hovered.dwellMs >= LOD_THRESHOLDS.hoverDwellMs &&
      zoom >= LOD_THRESHOLDS.hoverLiveMinZoom;
    const wasLive = previousTiers.get(frame.key) === "live";

    tiers.set(
      frame.key,
      screen.width < LOD_THRESHOLDS.placeholderMaxWidth ? "placeholder" : "snapshot",
    );

    if (
      promoted ||
      isHovered ||
      (zoom >= LOD_THRESHOLDS.liveMinZoom && fraction >= LOD_THRESHOLDS.liveMinVisibleFraction) ||
      (wasLive && zoom >= LOD_THRESHOLDS.liveKeepZoom && fraction > 0)
    ) {
      candidates.push({
        // Hundredths of a pixel, so equally distant frames tie despite rounding.
        distance:
          Math.round(
            Math.hypot(
              screen.x + screen.width / 2 - canvasSize.width / 2,
              screen.y + screen.height / 2 - canvasSize.height / 2,
            ) * 100,
          ) / 100,
        isHovered,
        key: frame.key,
        promoted,
        // Whole square pixels, so equally visible frames tie despite rounding.
        visibleArea: Math.round(visibleArea),
        wasLive,
      });
    }
  });

  candidates
    .sort(
      (a, b) =>
        Number(b.promoted) - Number(a.promoted) ||
        Number(b.isHovered) - Number(a.isHovered) ||
        b.visibleArea - a.visibleArea ||
        Number(b.wasLive) - Number(a.wasLive) ||
        a.distance - b.distance ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    )
    .slice(0, LIVE_FRAME_LIMIT)
    .forEach((candidate) => tiers.set(candidate.key, "live"));

  return tiers;
}

// cyrb53 (bryc, public domain): a fast 53-bit hash of a string, as 14
// hexadecimal digits. Pure JS, so it needs no secure context.
export function hashMarkup(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);

    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

// The preview size a measurement leaves, or null to keep the previous one.
// Changes under 2 px on both axes are noise; height growth equal to the
// iframe's own growth since the previous measurement (within 2 px) is 100vh
// content feeding back, so the previous height stays; more than 8 viewport
// heights is runaway.
export function acceptMeasuredSize(previous, next, iframeGrowth, viewportHeight) {
  if (!(next?.width > 0) || !(next.height > 0)) {
    return null;
  }

  if (viewportHeight > 0 && next.height > viewportHeight * 8) {
    return null;
  }

  if (!previous) {
    return { height: next.height, width: next.width };
  }

  const widthChange = Math.abs(next.width - previous.width);
  const heightChange = next.height - previous.height;
  const isFeedback = iframeGrowth > 0 && Math.abs(heightChange - iframeGrowth) <= 2;
  const height = isFeedback || Math.abs(heightChange) < 2 ? previous.height : next.height;
  const width = widthChange < 2 ? previous.width : next.width;

  return height === previous.height && width === previous.width ? null : { height, width };
}

// ---------------------------------------------------------------------------
// Feature journeys (flow-journey-focus): journeys a flow declares, one short
// journey per branch edge for flows that declare none, and the single-line
// layout of a journey focus view.

const journeyRowSize = 8;
const journeyColumnGap = 160;
const journeyRowGap = 240;
// Connectors between rows run this far right of a row's last frame and left
// of the next row's start; the loop marker counts as this long a segment.
const journeyTurnOffset = 80;
const journeyLoopSegment = 160;
const journeyLabelMinWidth = 24;

function warnOnConsole(message) {
  console.warn(message);
}

// The transitions that branch journeys follow: key or reference lines that
// are not returns or global navigation.
export function isJourneyEdgeTransition(transition) {
  return (
    (transition.flowLine === "key" || transition.flowLine === "reference") &&
    transition.kind !== "return" &&
    transition.kind !== "global"
  );
}

function getFlowFrameIds(flow) {
  const ids = [];

  for (const frame of [...normalizeRoutes(flow), ...normalizeFlowNodes(flow)]) {
    if (typeof frame.id === "string" && !ids.includes(frame.id)) {
      ids.push(frame.id);
    }
  }
  return ids;
}

// Declared journeys with steps the canvas renders: unknown steps are skipped,
// a journey left with fewer than two steps is omitted, and only the first of
// several journeys sharing an id is kept, each with a warning.
export function normalizeJourneys(flow, { warn = warnOnConsole } = {}) {
  if (!Array.isArray(flow?.journeys)) {
    return [];
  }

  const frameIds = new Set(getFlowFrameIds(flow));
  const seen = new Set();
  const journeys = [];

  for (const journey of flow.journeys) {
    if (!isRecord(journey) || typeof journey.id !== "string" || !Array.isArray(journey.steps)) {
      continue;
    }
    if (seen.has(journey.id)) {
      warn(`[prototype-inspector] Journey "${journey.id}" is declared more than once; the first one is shown.`);
      continue;
    }

    seen.add(journey.id);
    const steps = journey.steps.filter((step) => {
      const known = typeof step === "string" && frameIds.has(step);

      if (!known) {
        warn(`[prototype-inspector] Journey "${journey.id}" skips unknown step "${step}".`);
      }
      return known;
    });

    if (steps.length < 2) {
      warn(`[prototype-inspector] Journey "${journey.id}" has fewer than two known steps and is not shown.`);
      continue;
    }

    journeys.push({
      ...(typeof journey.description === "string" ? { description: journey.description } : {}),
      id: journey.id,
      steps,
      title: typeof journey.title === "string" && journey.title ? journey.title : journey.id,
    });
  }

  return journeys;
}

// One journey per branch edge: the (at most two) steps before the branch node
// on the first breadth-first path, the branch node, its target, then the
// single-exit nodes after it up to the next branch node, merge node or end.
// Returns { journeys: [{ key, branchId, branchTitle, title, steps,
// loopTarget? }], truncatedCount }.
export function deriveBranchJourneys(flow, { declared, limit = 24, warn = warnOnConsole } = {}) {
  const order = getFlowFrameIds(flow);
  const frameSet = new Set(order);
  const titles = new Map();

  for (const frame of [...normalizeRoutes(flow), ...normalizeFlowNodes(flow)]) {
    if (typeof frame.id === "string" && !titles.has(frame.id)) {
      titles.set(frame.id, typeof frame.title === "string" && frame.title ? frame.title : frame.id);
    }
  }

  const outgoing = new Map();
  const incoming = new Map();
  const labels = new Map();

  for (const transition of normalizeTransitions(flow)) {
    if (!frameSet.has(transition.from) || !frameSet.has(transition.to) || !isJourneyEdgeTransition(transition)) {
      continue;
    }

    const targets = outgoing.get(transition.from) ?? [];

    if (!targets.includes(transition.to)) {
      targets.push(transition.to);
    }
    outgoing.set(transition.from, targets);
    incoming.set(transition.to, (incoming.get(transition.to) ?? new Set()).add(transition.from));
    const pair = `${transition.from}->${transition.to}`;
    const pairLabels = labels.get(pair) ?? [];
    const text = getTransitionText(transition);

    if (!pairLabels.includes(text)) {
      pairLabels.push(text);
    }
    labels.set(pair, pairLabels);
  }

  const isBranch = (id) => (outgoing.get(id)?.length ?? 0) >= 2;
  const isMerge = (id) => (incoming.get(id)?.size ?? 0) >= 2;
  const routeIds = normalizeRoutes(flow).map((route) => route.id).filter((id) => typeof id === "string");
  const entries = routeIds.length ? [routeIds[0]] : [];

  for (const id of order) {
    if (!entries.includes(id) && !incoming.get(id)?.size) {
      entries.push(id);
    }
  }

  const previous = new Map();
  const reached = new Set(entries);
  const queue = [...entries];

  while (queue.length) {
    const id = queue.shift();

    for (const target of outgoing.get(id) ?? []) {
      if (!reached.has(target)) {
        reached.add(target);
        previous.set(target, id);
        queue.push(target);
      }
    }
  }

  const declaredSteps = new Set((declared ?? normalizeJourneys(flow, { warn })).map((journey) => journey.steps.join("\u0000")));
  const derived = [];

  for (const branch of order) {
    if (!isBranch(branch)) {
      continue;
    }

    const context = [];
    let before = previous.get(branch);

    while (before !== undefined && context.length < 2) {
      context.unshift(before);
      before = previous.get(before);
    }

    const group = [];

    for (const target of outgoing.get(branch)) {
      const steps = [...context, branch];
      let loopTarget = null;
      let current = target;

      for (;;) {
        if (steps.includes(current)) {
          loopTarget = current;
          break;
        }

        steps.push(current);
        const exits = outgoing.get(current) ?? [];

        if (isBranch(current) || (isMerge(current) && current !== target) || exits.length === 0) {
          break;
        }
        current = exits[0];
      }

      const prefix = (labels.get(`${branch}->${target}`) ?? []).join(" / ");

      group.push({
        branchId: branch,
        branchTitle: titles.get(branch),
        key: `derived:${branch}:${target}`,
        ...(loopTarget ? { loopTarget } : {}),
        steps,
        target,
        title: `${prefix} · ${target === loopTarget ? "↩ " : ""}${titles.get(target)}`,
      });
    }

    for (const journey of group) {
      if (group.filter((other) => other.title === journey.title).length > 1) {
        journey.duplicateName = true;
      }
    }

    for (const { duplicateName, target, ...journey } of group) {
      const named = duplicateName ? { ...journey, title: `${journey.title} (${target})` } : journey;
      const fullSteps = named.loopTarget ? [...named.steps, named.loopTarget] : named.steps;

      if (named.steps.length >= 2 && !declaredSteps.has(fullSteps.join("\u0000"))) {
        derived.push(named);
      }
    }
  }

  return { journeys: derived.slice(0, limit), truncatedCount: Math.max(0, derived.length - limit) };
}

// sizeOf(nodeId) returns { width, height, visibleTop, visibleHeight } and,
// optionally, visibleLeft and visibleWidth (the frame box and its visible rect
// relative to the box). Rows hold at most 8 steps; each step's visible rect is
// centred on its row's centre line.
export function computeJourneyLayout(steps, sizeOf) {
  const items = steps.map((nodeId, stepIndex) => {
    const size = sizeOf(nodeId);

    return {
      height: size.height,
      instanceKey: `${stepIndex}:${nodeId}`,
      nodeId,
      stepIndex,
      visibleHeight: size.visibleHeight ?? size.height,
      visibleLeft: size.visibleLeft ?? 0,
      visibleTop: size.visibleTop ?? 0,
      visibleWidth: size.visibleWidth ?? size.width,
      width: size.width,
    };
  });
  const layout = [];
  let rowTop = 0;

  for (let start = 0; start < items.length; start += journeyRowSize) {
    const row = items.slice(start, start + journeyRowSize);
    const centre = Math.max(...row.map((item) => item.visibleTop + item.visibleHeight / 2));
    let x = 0;
    let bottom = rowTop;

    for (const item of row) {
      const y = rowTop + centre - (item.visibleTop + item.visibleHeight / 2);

      layout.push({ ...item, row: start / journeyRowSize, x, y });
      x += item.width + journeyColumnGap;
      bottom = Math.max(bottom, y + item.height);
    }
    rowTop = bottom + journeyRowGap;
  }

  return layout;
}

function getJourneyCentreY(step) {
  return step.y + step.visibleTop + step.visibleHeight / 2;
}

function getJourneyRight(step) {
  return step.x + step.visibleLeft + step.visibleWidth;
}

function getJourneyLeft(step) {
  return step.x + step.visibleLeft;
}

// Connectors between consecutive steps, labelled like the full flow, plus the
// loop marker of a derived journey that stopped at a repeated step. Each edge:
// { from, to, fromKey, toKey, points, label, labelX, labelY, labelWidth,
// dotted, firstOccurrence }; label geometry is in world coordinates.
export function getJourneyEdges(layout, transitions, { loopTarget = null, titleOf = (id) => id } = {}) {
  const pairs = aggregateTransitions(
    transitions.filter((transition) => typeof transition?.from === "string" && typeof transition?.to === "string"),
    new Set(layout.map((step) => step.nodeId).concat(loopTarget ? [loopTarget] : [])),
  );
  const pairByKey = new Map(pairs.map((pair) => [pair.key, pair]));
  const labelOf = (from, to) => {
    const pair = pairByKey.get(`${from}->${to}`);

    return pair ? `${getEdgeLabelPrefix(pair)} ${pair.labels.join(" / ")}` : null;
  };
  const rowBottoms = new Map();

  for (const step of layout) {
    rowBottoms.set(step.row, Math.max(rowBottoms.get(step.row) ?? -Infinity, step.y + step.height));
  }

  const edges = [];
  const seenPairs = new Set();

  for (let index = 1; index < layout.length; index += 1) {
    const before = layout[index - 1];
    const after = layout[index];
    const startX = getJourneyRight(before);
    const startY = getJourneyCentreY(before);
    const endX = getJourneyLeft(after);
    const endY = getJourneyCentreY(after);
    const label = labelOf(before.nodeId, after.nodeId);
    const pairKey = `${before.nodeId}->${after.nodeId}`;
    let points;
    let labelX;
    let labelY;
    let labelWidth;

    if (before.row === after.row) {
      points = [
        { x: startX, y: startY },
        { x: endX, y: endY },
      ];
      // The room between the two frame boxes (the visible rects sit 1 px
      // inside a route box), so a label truncated to it never covers a box.
      labelX = (before.x + before.width + after.x) / 2;
      labelY = startY;
      labelWidth = after.x - (before.x + before.width);
    } else {
      const turnRight = startX + journeyTurnOffset;
      const turnLeft = -journeyTurnOffset;
      const gapY = rowBottoms.get(before.row) + journeyRowGap / 2;

      points = [
        { x: startX, y: startY },
        { x: turnRight, y: startY },
        { x: turnRight, y: gapY },
        { x: turnLeft, y: gapY },
        { x: turnLeft, y: endY },
        { x: endX, y: endY },
      ];
      labelX = (turnRight + turnLeft) / 2;
      labelY = gapY;
      labelWidth = turnRight - turnLeft;
    }

    edges.push({
      dotted: label === null,
      firstOccurrence: label !== null && !seenPairs.has(pairKey),
      from: before.nodeId,
      fromKey: before.instanceKey,
      label,
      labelWidth,
      labelX,
      labelY,
      points,
      to: after.nodeId,
      toKey: after.instanceKey,
    });
    if (label !== null) {
      seenPairs.add(pairKey);
    }
  }

  let loopMarker = null;
  const last = layout.at(-1);

  if (loopTarget && last) {
    const startX = getJourneyRight(last);
    const y = getJourneyCentreY(last);
    const markerX = last.x + last.width + journeyColumnGap;
    const label = labelOf(last.nodeId, loopTarget);

    loopMarker = { label: `↩ ${titleOf(loopTarget)}`, targetId: loopTarget, x: markerX, y };
    edges.push({
      dotted: label === null,
      firstOccurrence: false,
      from: last.nodeId,
      fromKey: last.instanceKey,
      label,
      labelWidth: markerX - (last.x + last.width),
      labelX: (last.x + last.width + markerX) / 2,
      labelY: y,
      loop: true,
      points: [
        { x: startX, y },
        { x: markerX, y },
      ],
      to: loopTarget,
      toKey: null,
    });
  }

  return { edges, loopMarker };
}

// What fitting a journey frames: its frame boxes and the loop marker, which
// counts as a horizontal segment 160 world px long from its anchor.
export function getJourneyBounds(layout, { loopMarker = null } = {}) {
  const boxes = layout.map((step) => ({ height: step.height, width: step.width, x: step.x, y: step.y }));

  if (loopMarker) {
    boxes.push({ height: 0, width: journeyLoopSegment, x: loopMarker.x, y: loopMarker.y });
  }
  return boxes.length ? getFlowBounds(boxes) : null;
}

// A journey edge label hides only while its room on screen is under 24 px.
export function isJourneyLabelHidden(availableWorldWidth, zoom) {
  return availableWorldWidth * zoom < journeyLabelMinWidth;
}

const controlKeyCodes = new Set(["Space", "Enter", "NumpadEnter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

// Canvas command for a keydown/keyup, or null when the key must reach
// Storybook (or a focused control) unchanged. Matches KeyboardEvent.code;
// Mod is Cmd on macOS and Ctrl elsewhere.
export function resolveCanvasShortcut(eventLike, context) {
  if (context.isTextEntry || eventLike.altKey) {
    return null;
  }

  const { code } = eventLike;
  const keydown = eventLike.type === "keydown";

  if (context.overlayOpen) {
    return keydown && code === "Escape" ? "close-overlay" : null;
  }

  if (context.targetIsControl && controlKeyCodes.has(code)) {
    return null;
  }

  if (code === "Space") {
    return keydown ? "pan-start" : "pan-end";
  }

  if (!keydown) {
    return null;
  }

  const mod = context.isMac ? eventLike.metaKey : eventLike.ctrlKey;
  const otherMod = context.isMac ? eventLike.ctrlKey : eventLike.metaKey;

  if (otherMod) {
    return null;
  }

  // [ and ] switch journeys while the journey list is shown; with a modifier
  // they stay with the browser (Cmd+[ is Back) and Storybook.
  if (code === "BracketLeft" || code === "BracketRight") {
    return !mod && !eventLike.shiftKey && (context.journeyEntryCount ?? 0) > 1
      ? code === "BracketLeft"
        ? "previous-journey"
        : "next-journey"
      : null;
  }

  if (code === "Escape") {
    return !mod && !eventLike.shiftKey && context.dragActive ? "cancel-drag" : null;
  }

  if (code === "Digit1") {
    return eventLike.shiftKey && !mod ? "fit" : null;
  }

  if (code === "Digit0") {
    return eventLike.shiftKey !== mod ? "zoom-100" : null;
  }

  if (code === "Equal" || code === "NumpadAdd") {
    return "zoom-in";
  }

  if (code === "Minus" || code === "NumpadSubtract") {
    return "zoom-out";
  }

  return null;
}
