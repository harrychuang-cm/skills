// Small line icons for the inspector (16 px grid, current color). Property
// icons are keyed by the row group of shared/properties.ts.
import React from "react";

function Svg({ children, size = 14 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const lines = (
  <Svg>
    <path d="M3 4.5h10" strokeWidth="1" />
    <path d="M3 8h10" strokeWidth="1.8" />
    <path d="M3 12h10" strokeWidth="2.6" />
  </Svg>
);
const width = (
  <Svg>
    <path d="M2.5 8h11M5 5.5 2.5 8 5 10.5M11 5.5 13.5 8 11 10.5" />
  </Svg>
);
const height = (
  <Svg>
    <path d="M8 2.5v11M5.5 5 8 2.5 10.5 5M5.5 11 8 13.5l2.5-2.5" />
  </Svg>
);

/** Icons of the property rows, by group id. Size rows pick `width` or `height` by writing mode. */
export const PROPERTY_ICONS: Record<string, React.ReactNode> = {
  display: (
    <Svg>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M8 2.5v11" />
    </Svg>
  ),
  direction: (
    <Svg>
      <path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" />
    </Svg>
  ),
  alignItems: (
    <Svg>
      <path d="M2.5 8h11" />
      <rect x="4" y="4.5" width="3" height="7" rx="1" />
      <rect x="9" y="6" width="3" height="4" rx="1" />
    </Svg>
  ),
  justifyContent: (
    <Svg>
      <path d="M2.5 3v10M13.5 3v10" />
      <rect x="5" y="5.5" width="2.5" height="5" rx="1" />
      <rect x="8.5" y="5.5" width="2.5" height="5" rx="1" />
    </Svg>
  ),
  wrap: (
    <Svg>
      <path d="M2.5 5h9a2 2 0 0 1 0 4H6" />
      <path d="M7.5 7 5.5 9l2 2" />
    </Svg>
  ),
  gap: (
    <Svg>
      <rect x="2.5" y="4" width="3.5" height="8" rx="1" />
      <rect x="10" y="4" width="3.5" height="8" rx="1" />
      <path d="M8 6v4" />
    </Svg>
  ),
  padding: (
    <Svg>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <rect x="6" y="6" width="4" height="4" rx=".8" />
    </Svg>
  ),
  margin: (
    <Svg>
      <rect x="5" y="5" width="6" height="6" rx="1.2" />
      <path d="M2.5 5v6M13.5 5v6M5 2.5h6M5 13.5h6" />
    </Svg>
  ),
  width,
  height,
  opacity: (
    <Svg>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5v11M8 5.2h4.6M8 8h5.4M8 10.8h4.6" strokeWidth="1" />
    </Svg>
  ),
  radius: (
    <Svg>
      <path d="M3 13V7.5A4.5 4.5 0 0 1 7.5 3H13" />
    </Svg>
  ),
  fill: (
    <Svg>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" fill="currentColor" fillOpacity=".35" />
    </Svg>
  ),
  borderColor: (
    <Svg>
      <rect x="3" y="3" width="10" height="10" rx="2" />
    </Svg>
  ),
  borderWidth: lines,
  outlineColor: (
    <Svg>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" strokeDasharray="2 1.7" />
    </Svg>
  ),
  outlineWidth: lines,
  stroke: (
    <Svg>
      <path d="M3 12c2-6 4 2 6-3s3-4 4-5" />
    </Svg>
  ),
  strokeWidth: lines,
  fontFamily: (
    <Svg>
      <path d="M2.5 12.5 6 3.5l3.5 9M3.8 9.5h4.4" />
      <path d="M10.5 12.5a1.7 1.7 0 0 1 0-3.4h2.2V8.4a1.4 1.4 0 0 0-2.6-.7M12.7 9.1v3.4" />
    </Svg>
  ),
  fontSize: (
    <Svg>
      <path d="M2.5 4.5V3.5h7v1M6 3.5v9M4.8 12.5h2.4" />
      <path d="M9.5 8.5V8h4.5v.5M11.75 8v4.5M11 12.5h1.5" />
    </Svg>
  ),
  fontWeight: (
    <Svg>
      <path d="M4.5 3h4a2.4 2.4 0 0 1 0 4.8h-4zM4.5 7.8h4.6a2.6 2.6 0 0 1 0 5.2H4.5z" strokeWidth="1.7" />
    </Svg>
  ),
  lineHeight: (
    <Svg>
      <path d="M3 3h10M3 13h10M8 5.5v5M6.3 7 8 5.3 9.7 7M6.3 9 8 10.7 9.7 9" />
    </Svg>
  ),
  letterSpacing: (
    <Svg>
      <path d="M2.5 3v10M13.5 3v10M5.5 11 8 5l2.5 6M6.4 9h3.2" />
    </Svg>
  ),
  color: (
    <Svg>
      <path d="M4.5 11 8 2.5 11.5 11M5.8 8h4.4" />
      <path d="M3 13.5h10" strokeWidth="1.8" />
    </Svg>
  ),
};

export const GripIcon = () => (
  <Svg size={14}>
    <g fill="currentColor" stroke="none">
      <circle cx="6" cy="4" r="1" />
      <circle cx="10" cy="4" r="1" />
      <circle cx="6" cy="8" r="1" />
      <circle cx="10" cy="8" r="1" />
      <circle cx="6" cy="12" r="1" />
      <circle cx="10" cy="12" r="1" />
    </g>
  </Svg>
);
export const CodeIcon = () => (
  <Svg>
    <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />
  </Svg>
);
export const CopyIcon = () => (
  <Svg>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
    <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
  </Svg>
);
export const CheckIcon = () => (
  <Svg>
    <path d="m3.5 8.5 3 3 6-7" strokeWidth="1.7" />
  </Svg>
);
export const ChevronIcon = ({ up = false }: { up?: boolean }) => (
  <Svg>
    <path d={up ? "m4 10 4-4 4 4" : "m4 6 4 4 4-4"} />
  </Svg>
);
export const CloseIcon = () => (
  <Svg>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Svg>
);
export const LockIcon = () => (
  <Svg size={12}>
    <rect x="3.5" y="7.5" width="9" height="6" rx="1.4" />
    <path d="M5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2" />
  </Svg>
);
export const InheritIcon = () => (
  <Svg size={12}>
    <path d="M8 13V4M4.5 7.5 8 4l3.5 3.5" />
  </Svg>
);
export const WarnIcon = () => (
  <Svg size={12}>
    <path d="M8 2.5 14 13H2zM8 6.5v3M8 11.3v.2" />
  </Svg>
);
export const MinusIcon = () => (
  <Svg>
    <path d="M4 8h8" />
  </Svg>
);
export const PlusIcon = () => (
  <Svg>
    <path d="M4 8h8M8 4v8" />
  </Svg>
);

// ---- layout keywords ---------------------------------------------------------------------
//
// Every icon is drawn for children that run left to right and are aligned from
// the top, then turned to how this element's children really run (its flex
// direction, writing mode and text direction).

export type LayoutFlow = { direction: string; writingMode: string; textDirection: string };

type Axes = { mainHorizontal: boolean; mainFlip: boolean; crossFlip: boolean };

function axesOf(flow: LayoutFlow): Axes {
  const row = !flow.direction.startsWith("column");
  const reversed = flow.direction.endsWith("reverse");
  const horizontalWriting = !flow.writingMode.startsWith("vertical");
  const rtl = flow.textDirection === "rtl";
  // The block axis of vertical-rl runs right to left.
  const blockFlip = flow.writingMode === "vertical-rl";
  return {
    mainHorizontal: row ? horizontalWriting : !horizontalWriting,
    mainFlip: (row ? rtl : blockFlip) !== reversed,
    crossFlip: row ? blockFlip : rtl,
  };
}

/** SVG matrix that maps the drawing (main axis left to right, cross axis top to bottom) onto the element's axes. */
function axisTransform(flow: LayoutFlow): string {
  const { mainHorizontal, mainFlip, crossFlip } = axesOf(flow);
  const main = mainFlip ? [-1, 16] : [1, 0];
  const cross = crossFlip ? [-1, 16] : [1, 0];
  return mainHorizontal ? `matrix(${main[0]} 0 0 ${cross[0]} ${main[1]} ${cross[1]})` : `matrix(0 ${main[0]} ${cross[0]} 0 ${cross[1]} ${main[1]})`;
}

/**
 * The physical side ("left" | "right" | "top" | "bottom") the start or end
 * keyword of a layout property is on for this element; null for the keywords
 * that are not a side.
 */
export function layoutSide(property: string, keyword: string, flow: LayoutFlow): "left" | "right" | "top" | "bottom" | null {
  if (keyword !== "flex-start" && keyword !== "flex-end") return null;
  if (property !== "align-items" && property !== "justify-content") return null;
  const { mainHorizontal, mainFlip, crossFlip } = axesOf(flow);
  const end = keyword === "flex-end";
  const alongMain = property === "justify-content";
  const horizontal = alongMain ? mainHorizontal : !mainHorizontal;
  const flipped = (alongMain ? mainFlip : crossFlip) !== end;
  return horizontal ? (flipped ? "right" : "left") : flipped ? "bottom" : "top";
}

/** Three items along the main axis: [x, width] each; height and y per keyword of align-items. */
const BARS: Array<[number, number]> = [[3, 2.6], [6.7, 2.6], [10.4, 2.6]];
const ALIGN: Record<string, Array<[number, number]>> = {
  "flex-start": [[3, 7], [3, 10], [3, 5]],
  center: [[4.5, 7], [3, 10], [5.5, 5]],
  "flex-end": [[6, 7], [3, 10], [8, 5]],
  stretch: [[3, 10], [3, 10], [3, 10]],
  baseline: [[4, 6], [2.5, 7.5], [5.5, 4.5]],
};
const JUSTIFY: Record<string, number[]> = {
  "flex-start": [2, 5, 8],
  center: [4, 7, 10],
  "flex-end": [6, 9, 12],
  "space-between": [2, 7, 12],
  "space-around": [2.9, 7, 11.1],
  "space-evenly": [3.8, 7, 10.2],
};

/** The icon of one keyword of a layout property, as it applies to this element. */
export function LayoutIcon({ property, keyword, flow, size = 14 }: { property: string; keyword: string; flow: LayoutFlow; size?: number }) {
  let shape: React.ReactNode = null;
  if (property === "flex-direction") {
    shape = <path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" />;
  } else if (property === "flex-wrap") {
    shape =
      keyword === "wrap" ? (
        <>
          <rect x="2.5" y="3" width="4" height="4" rx="0.8" />
          <rect x="9.5" y="3" width="4" height="4" rx="0.8" />
          <rect x="2.5" y="9" width="4" height="4" rx="0.8" />
        </>
      ) : (
        <>
          <rect x="2" y="6" width="3" height="4" rx="0.8" />
          <rect x="6.5" y="6" width="3" height="4" rx="0.8" />
          <rect x="11" y="6" width="3" height="4" rx="0.8" />
        </>
      );
  } else if (property === "align-items" && ALIGN[keyword]) {
    shape = (
      <>
        {BARS.map(([x, w], i) => (
          <rect key={x} x={x} y={ALIGN[keyword][i][0]} width={w} height={ALIGN[keyword][i][1]} rx="0.7" />
        ))}
        {keyword === "baseline" ? <path d="M1.5 10h13" strokeWidth="0.9" /> : null}
      </>
    );
  } else if (property === "justify-content" && JUSTIFY[keyword]) {
    shape = (
      <>
        <path d="M1 2.5v11M15 2.5v11" strokeWidth="0.9" opacity="0.55" />
        {JUSTIFY[keyword].map((x) => (
          <rect key={x} x={x} y="4.5" width="2" height="7" rx="0.6" />
        ))}
      </>
    );
  }
  if (!shape) return <span />;
  // A wrapped line breaks along the cross axis, so the same turn applies to every property.
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-code-layer-layout-icon={keyword} style={{ flex: "0 0 auto" }}>
      <g transform={axisTransform(flow)}>{shape}</g>
    </svg>
  );
}
