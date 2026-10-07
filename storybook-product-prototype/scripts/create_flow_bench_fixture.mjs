#!/usr/bin/env node
// Creates a disposable copy of design-system-to-storybook/storybook-template
// with generated UI Flow bench prototypes, for bench_flow_canvas.mjs and for
// manual UI Flow canvas checks. Uses only Node built-ins.
//
//   node storybook-product-prototype/scripts/create_flow_bench_fixture.mjs --out <new folder>
//
// The copy never lives inside the repo: --out must be outside the repo (and
// outside the template), and must be a new or empty folder. node_modules is
// shared with the template through per-package symlinks inside a real
// <out>/node_modules folder, so Vite and Storybook caches (node_modules/.cache,
// node_modules/.vite, node_modules/.vite-temp) are written into the copy and
// never back into the template.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.dirname(scriptDir);
const defaultTemplateRoot = path.resolve(
  skillRoot,
  "..",
  "design-system-to-storybook",
  "storybook-template",
);

// Copied from the template root only; everything else is copied as is.
const topLevelExclusions = new Set([
  ".agents",
  ".claude",
  ".cursor",
  ".cursorrules",
  ".git",
  ".spectra",
  ".spectra.yaml",
  "design-system-to-storybook",
  "openspec",
  "outputs",
  "storybook-static",
]);
const anyLevelExclusions = new Set(["node_modules", ".DS_Store"]);
// Caches inside the template's node_modules that must not be shared.
const nodeModulesExclusions = new Set([".cache", ".vite", ".vite-temp", ".DS_Store"]);
const benchStoriesGlob =
  "../src/pages/prototypes/bench-*/*.stories.@(js|jsx|mjs|ts|tsx)";
const exampleStoriesGlob =
  '"../src/pages/prototypes/example-prototype/*.stories.@(js|jsx|mjs|ts|tsx)"';

function usage() {
  return [
    "Usage: node storybook-product-prototype/scripts/create_flow_bench_fixture.mjs --out <dir> [--template <dir>]",
    "",
    "  --out <dir>       New or empty folder outside the repo for the fixture copy (required).",
    "  --template <dir>  storybook-template to copy (default: the repo's",
    "                    design-system-to-storybook/storybook-template).",
    "",
    "Prints the UI Flow story id of every generated prototype.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = { out: null, template: null, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} needs a value.`);
      }
      index += 1;
      return value;
    };

    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--out") args.out = readValue();
    else if (arg.startsWith("--out=")) args.out = arg.slice("--out=".length);
    else if (arg === "--template") args.template = readValue();
    else if (arg.startsWith("--template=")) args.template = arg.slice("--template=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

// realpath of a path that may not exist yet (resolves its nearest ancestor).
function realpathOfPossiblyMissing(target) {
  const missing = [];
  let current = path.resolve(target);

  while (!existsSync(current)) {
    missing.unshift(path.basename(current));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return path.join(realpathSync(current), ...missing);
}

function findGitRoot(start) {
  let current = start;

  while (true) {
    if (existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function readBuildTag(projectRoot) {
  const previewPath = path.join(projectRoot, ".storybook", "prototype-inspector", "preview.js");
  if (!existsSync(previewPath)) return null;
  const match = readFileSync(previewPath, "utf8").match(
    /prototypeInspectorBuildTag\s*=\s*["'`]([^"'`]+)["'`]/,
  );
  return match ? match[1] : null;
}

function toPascal(kebab) {
  return kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function toCamel(kebab) {
  const pascal = toPascal(kebab);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

// Same rule as Storybook's toId(): lowercase, runs of other characters become "-".
function toStoryId(title, exportName) {
  const sanitize = (value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `${sanitize(title)}--${sanitize(exportName)}`;
}

// ---------------------------------------------------------------------------
// Prototype definitions. Titles and labels are synthetic; only the shapes
// (positions, sizes, groups, edge topology) follow the measured real flows.
// ---------------------------------------------------------------------------

function routeLabel(kind, targetTitle) {
  if (kind === "return") return "Back";
  if (kind === "outcome") return `Finish: ${targetTitle}`;
  if (kind === "condition") return targetTitle;
  return `Open ${targetTitle}`;
}

function buildTransitions(rows, titleOf) {
  return rows.map(([from, to, flowLine, kind, sourceAnchor]) => {
    const transition = {
      from,
      to,
      trigger: `${from}.${kind}`,
      label: routeLabel(kind, titleOf(to)),
      kind,
    };
    if (flowLine) transition.flowLine = flowLine;
    if (sourceAnchor) transition.sourceAnchor = sourceAnchor;
    return transition;
  });
}

function titleLookup(routes, nodes) {
  const titles = new Map([...routes, ...nodes].map((item) => [item.id, item.title]));
  return (id) => titles.get(id) ?? id;
}

// growth-fund shape: 30 routes on COLUMN 480 / ROW 980, an overlapping
// sub-row at ROW * 2 + 420, flow-only nodes of kind decision / async,
// reference branches, and the six flowGroups of the measured flow.
function growthFundShape() {
  const COLUMN = 480;
  const ROW = 980;
  const route = (id, title, flowGroup, shell, x, y) => ({
    id,
    title,
    description: `Synthetic ${flowGroup} screen for the UI Flow bench.`,
    component: "BenchGrowthFund",
    navigationId: "savings-plan",
    shell,
    flowGroup,
    flowPosition: { x, y },
  });
  const routes = [
    route("touch-checkout", "Checkout touchpoint", "us1-touchpoint", "checkout", 0, 0),
    route("touch-transfer", "Transfer touchpoint", "us1-touchpoint", "chat", COLUMN, 0),
    route("touch-gift", "Gift touchpoint", "us1-touchpoint", "chat", COLUMN * 2, 0),
    route("touch-wallet", "Wallet entry", "us1-touchpoint", "wallet", COLUMN * 3, 0),
    route("onboard-intro", "Plan introduction", "us2-onboarding", "landing", 0, ROW),
    route("onboard-terms", "Service terms", "us2-onboarding", "task", COLUMN, ROW),
    route("onboard-profile", "Basic profile", "us2-onboarding", "task", COLUMN * 2, ROW),
    route("onboard-risk", "Risk questions", "us2-onboarding", "task", COLUMN * 3, ROW),
    route("onboard-confirm", "Confirm details", "us2-onboarding", "task", COLUMN * 4, ROW),
    route("onboard-opened", "Account opened", "us2-onboarding", "task", COLUMN * 5, ROW),
    route("purchase-method", "Choose a method", "us2-purchase", "task", 0, ROW * 2),
    route("purchase-self-select", "Self-selected funds", "us2-purchase", "task", 0, ROW * 2 + 420),
    route("purchase-advisor", "Advisor questions", "us2-purchase", "task", COLUMN, ROW * 2),
    route("purchase-compare", "Compare portfolios", "us2-purchase", "task", COLUMN * 2, ROW * 2),
    route("purchase-allocation", "Portfolio allocation", "us2-purchase", "task", COLUMN * 3, ROW * 2),
    route("purchase-setup", "Plan setup", "us2-purchase", "task", COLUMN * 4, ROW * 2),
    route("purchase-activated", "Plan activated", "us2-purchase", "task", COLUMN * 5, ROW * 2),
    route("purchase-wallet", "Wallet after purchase", "us2-purchase", "wallet", COLUMN * 6, ROW * 2),
    route("accrue-spend", "Spend and save", "us3-accumulation", "checkout", 0, ROW * 3),
    route("accrue-transfer", "Transfer received", "us3-accumulation", "chat", COLUMN, ROW * 3),
    route("accrue-group-gift", "Group gift", "us3-accumulation", "chat", COLUMN * 2, ROW * 3),
    route("accrue-record", "Savings record", "us3-accumulation", "task", COLUMN * 3, ROW * 3),
    route("accrue-wallet", "Wallet overview", "us3-accumulation", "wallet", COLUMN * 4, ROW * 3),
    route("assets-detail", "Asset detail", "us3-asset-centre", "task", COLUMN * 5, ROW * 3),
    route("assets-plan-edit", "Edit plan", "us3-asset-centre", "task", COLUMN * 6, ROW * 3),
    route("assets-market", "Fund market", "us3-asset-centre", "task", COLUMN * 7, ROW * 3),
    route("payout-notice", "Payout notice", "us4-dividend", "chat", 0, ROW * 4),
    route("payout-detail", "Payout detail", "us4-dividend", "task", COLUMN, ROW * 4),
    route("payout-wallet", "Wallet with payout", "us4-dividend", "wallet", COLUMN * 2, ROW * 4),
    route("payout-pay", "Pay with payout", "us4-dividend", "checkout", COLUMN * 3, ROW * 4),
  ];
  const nodes = [
    {
      id: "purchase-method-decision",
      title: "Which method?",
      description: "Advisor path or self-selected path; both meet again at plan setup.",
      kind: "decision",
      flowGroup: "us2-purchase",
      flowPosition: { x: COLUMN, y: ROW * 2 + 420 },
    },
    {
      id: "payout-wait",
      title: "Waiting for the first payout",
      description: "No screen to show; the only state change between the two lanes.",
      kind: "async",
      flowGroup: "us4-dividend",
      flowPosition: { x: COLUMN * 5, y: ROW * 4 },
    },
  ];
  const r = routes.map((item) => item.id);
  const decision = nodes[0].id;
  const wait = nodes[1].id;
  const anchor = (x, y) => ({ x, y });
  const rows = [
    [r[0], r[4], "key", "primary", anchor(0.5, 0.82)],
    [r[1], r[4], "key", "primary", anchor(0.5, 0.82)],
    [r[2], r[4], "key", "primary", anchor(0.5, 0.82)],
    [r[3], r[4], "key", "primary", anchor(0.5, 0.6)],
    [r[4], r[5], "key", "primary", anchor(0.5, 0.95)],
    [r[5], r[6], "key", "primary", anchor(0.5, 0.95)],
    [r[6], r[7], "key", "primary", anchor(0.5, 0.95)],
    [r[7], r[8], "key", "primary", anchor(0.5, 0.95)],
    [r[8], r[9], "key", "primary", anchor(0.5, 0.95)],
    [r[9], r[10], "key", "primary", anchor(0.5, 0.95)],
    [r[10], decision, "key", "primary", anchor(0.5, 0.6)],
    [decision, r[12], "key", "branch"],
    [decision, r[11], "key", "branch"],
    [r[12], r[13], "key", "primary", anchor(0.5, 0.95)],
    [r[13], r[14], "key", "primary", anchor(0.5, 0.95)],
    [r[14], r[15], "key", "primary", anchor(0.5, 0.95)],
    [r[11], r[15], "key", "primary", anchor(0.5, 0.95)],
    [r[15], r[16], "key", "outcome", anchor(0.5, 0.95)],
    [r[16], r[17], "key", "outcome", anchor(0.5, 0.95)],
    [r[17], r[18], "key", "primary", anchor(0.5, 0.9)],
    [r[18], r[19], "key", "primary", anchor(0.75, 0.95)],
    [r[19], r[20], "key", "primary", anchor(0.5, 0.6)],
    [r[20], r[21], "key", "primary", anchor(0.5, 0.62)],
    [r[19], r[21], "reference", "primary"],
    [r[21], r[22], "key", "primary", anchor(0.5, 0.95)],
    [r[22], r[23], "key", "primary", anchor(0.5, 0.72)],
    [r[22], r[21], "reference", "branch"],
    [r[23], r[24], "key", "branch", anchor(0.5, 0.12)],
    [r[24], r[25], "key", "branch", anchor(0.83, 0.12)],
    [r[24], r[23], "reference", "branch"],
    [r[25], r[23], "reference", "branch"],
    [r[25], r[24], "reference", "branch"],
    [r[23], r[25], "reference", "branch"],
    [r[25], wait, "key", "outcome", anchor(0.5, 0.5)],
    [wait, r[26], "key", "outcome"],
    [r[26], r[27], "key", "primary", anchor(0.5, 0.6)],
    [r[27], r[28], "key", "primary", anchor(0.5, 0.95)],
    [r[28], r[29], "key", "outcome", anchor(0.5, 0.93)],
    [r[28], r[27], "reference", "branch"],
    [r[28], r[21], "reference", "branch"],
    [r[28], r[23], "reference", "branch"],
    [r[29], r[27], "reference", "branch"],
    [r[5], r[4], "reference", "return"],
    [r[6], r[5], "reference", "return"],
    [r[7], r[6], "reference", "return"],
    [r[8], r[7], "reference", "return"],
    [r[9], r[8], "reference", "return"],
    [r[10], r[9], "reference", "return"],
    [r[11], r[10], "reference", "return"],
    [r[12], r[10], "reference", "return"],
    [r[13], r[12], "reference", "return"],
    [r[14], r[13], "reference", "return"],
    [r[15], r[14], "reference", "return"],
    [r[21], r[19], "reference", "return"],
    [r[23], r[22], "reference", "return"],
    [r[27], r[26], "reference", "return"],
  ];
  const transitions = buildTransitions(rows, titleLookup(routes, nodes));
  // Every route declares components so the ⧉ N button renders.
  const componentRoutes = routes.map((item, index) => ({
    route: item.id,
    components: [
      {
        importPath: "src/pages/prototypes/bench-shared/BenchRouteScreen.tsx",
        name: "BenchRouteScreen",
        note: "Synthetic screen shell shared by every bench route.",
        origin: "local",
      },
      {
        domSelector: ".pi-bench__header",
        importPath: "src/pages/prototypes/bench-shared/BenchRouteScreen.tsx",
        name: "BenchHeader",
        note: "Screen header with the group eyebrow and the title.",
        origin: "local",
      },
      ...(index % 2 === 0
        ? [
            {
              domSelector: ".pi-bench__body",
              importPath: "src/pages/prototypes/bench-shared/BenchRouteScreen.tsx",
              name: "BenchBody",
              note: "Shell-specific body content.",
              origin: "shared",
            },
          ]
        : []),
    ],
  }));

  return { routes, nodes, transitions, componentRoutes };
}

// round-up shape: seven routes in a row whose contents are 364 to 1040 px tall.
function roundUpShape() {
  const heights = [364, 1040, 682, 691, 725, 752, 364];
  const specs = [
    ["wallet-before", "Wallet before", "entry"],
    ["offer", "Round-up offer", "entry"],
    ["setup-method", "Set up method", "setup"],
    ["pick-fund", "Pick a fund", "setup"],
    ["review", "Review settings", "setup"],
    ["done", "Round-up on", "handoff"],
    ["wallet-after", "Wallet after", "handoff"],
  ];
  const routes = specs.map(([id, title, flowGroup], index) => ({
    id,
    title,
    description: `Route content is ${heights[index]} px tall.`,
    component: "BenchRoundUp",
    navigationId: "round-up",
    shell: index === 1 ? "landing" : index === 0 || index === 6 ? "wallet" : "task",
    contentHeight: heights[index],
    flowGroup,
    flowPosition: { x: index * 480, y: 0 },
  }));
  const r = routes.map((item) => item.id);
  const rows = [
    [r[0], r[1], "key", "primary"],
    [r[1], r[2], "key", "primary"],
    [r[2], r[3], "key", "primary"],
    [r[3], r[4], "key", "primary"],
    [r[4], r[5], "key", "outcome"],
    [r[5], r[6], "key", "outcome"],
    [r[2], r[1], "reference", "return"],
    [r[3], r[2], "reference", "return"],
    [r[4], r[3], "reference", "return"],
  ];
  const componentRoutes = routes
    .filter((item, index) => index % 2 === 1)
    .map((item) => ({
      route: item.id,
      components: [
        {
          importPath: "src/pages/prototypes/bench-shared/BenchRouteScreen.tsx",
          name: "BenchRouteScreen",
          origin: "local",
        },
      ],
    }));

  return {
    routes,
    nodes: [],
    transitions: buildTransitions(rows, titleLookup(routes, [])),
    componentRoutes,
  };
}

// inventory shape: no [data-prototype-route-preview] marker (the component
// file handles that), a flow-only node at y = -260 and decision / state nodes.
function inventoryShape() {
  const route = (id, title, flowGroup, navigationId, x, y) => ({
    id,
    title,
    description: "Synthetic route rendered without the route-preview marker.",
    component: "BenchInventory",
    navigationId,
    shell: "task",
    contentHeight: 760,
    flowGroup,
    flowPosition: { x, y },
  });
  const routes = [
    route("portfolio", "Portfolio", "entry", "portfolio", 0, 960),
    route("quote-detail", "Quote detail", "detail", "portfolio", 760, 0),
    route("order-form", "Order form", "transaction", "portfolio", 1520, 0),
    route("settings-sheet", "Settings sheet", "settings", "portfolio", 0, 2260),
    route("watchlist", "Watchlist", "navigation", "watchlist", 760, 1260),
    route("screener", "Screener", "navigation", "screener", 760, 2520),
    route("preferred", "Preferred list", "nested", "screener", 1520, 2520),
    route("market", "Market movers", "navigation", "market", 1520, 1260),
    route("activity", "Activity", "activity", "trend", 2280, 1260),
  ];
  const nodes = [
    {
      id: "order-decision",
      title: "Order accepted?",
      description: "Branches to the success or the error state.",
      flowGroup: "if / else",
      flowPosition: { x: 2280, y: 0 },
      shape: "decision",
    },
    {
      id: "order-success",
      title: "Order placed",
      description: "Success state above the canvas origin (y = -260).",
      flowGroup: "success",
      flowPosition: { x: 3040, y: -260 },
      shape: "state",
      tone: "success",
    },
    {
      id: "order-error",
      title: "Order failed",
      description: "Error state with a retry path.",
      flowGroup: "error",
      flowPosition: { x: 3040, y: 400 },
      shape: "state",
      tone: "error",
    },
  ];
  const side = (sideName, xRatio, yRatio) => ({ side: sideName, xRatio, yRatio });
  const rows = [
    ["portfolio", "quote-detail", "key", "primary", side("right", 0.95, 0.43)],
    ["quote-detail", "order-form", "key", "primary", side("right", 0.95, 0.76)],
    ["quote-detail", "portfolio", null, "return"],
    ["portfolio", "settings-sheet", null, "secondary"],
    ["portfolio", "settings-sheet", null, "secondary"],
    ["settings-sheet", "portfolio", null, "return"],
    ["portfolio", "order-form", "key", "primary", side("right", 0.94, 0.77)],
    ["order-form", "order-decision", "key", "outcome", side("right", 0.95, 0.82)],
    ["order-decision", "order-success", "key", "condition", side("right", 0.96, 0.32)],
    ["order-decision", "order-error", "key", "condition", side("right", 0.96, 0.68)],
    ["order-success", "activity", "key", "outcome", side("bottom", 0.5, 0.94)],
    ["order-error", "order-form", "key", "return", side("left", 0.04, 0.5)],
    ["order-form", "portfolio", null, "return"],
    ["portfolio", "watchlist", null, "global"],
    ["watchlist", "quote-detail", "key", "primary", side("right", 0.95, 0.36)],
    ["watchlist", "order-form", "key", "primary", side("right", 0.95, 0.82)],
    ["portfolio", "screener", null, "global"],
    ["quote-detail", "screener", "key", "secondary", side("bottom", 0.5, 0.95)],
    ["screener", "preferred", "key", "primary", side("right", 0.95, 0.39)],
    ["preferred", "watchlist", "key", "secondary", side("left", 0.05, 0.44)],
    ["portfolio", "market", null, "global"],
    ["market", "quote-detail", "key", "primary", side("left", 0.05, 0.37)],
    ["portfolio", "activity", null, "global"],
    ["portfolio", "activity", null, "global"],
    ["portfolio", "activity", null, "global"],
    ["portfolio", "activity", null, "global"],
    ["portfolio", "activity", null, "global"],
  ];
  const transitions = buildTransitions(rows, titleLookup(routes, nodes)).map(
    (transition, index) => ({ ...transition, trigger: `${transition.trigger}.${index}` }),
  );

  return { routes, nodes, transitions, componentRoutes: [] };
}

// font-size shape: 760 px pitch and a 22 px vertical gutter between the
// frames at (2280, 0) and (2280, 900) (frame height 812 + 66 = 878).
function fontSizeShape() {
  const route = (id, title, flowGroup, x, y) => ({
    id,
    title,
    description: "Synthetic route on a tight vertical gutter.",
    component: "BenchFontSize",
    shell: "task",
    flowGroup,
    flowPosition: { x, y },
  });
  const routes = [
    route("quotes", "Quotes", "entry", 0, 0),
    route("system-settings", "System settings", "entry", 760, 0),
    route("text-size-clean", "Text size", "adjust", 1520, 0),
    route("text-size-dirty", "Text size changed", "adjust", 2280, 0),
    route("unsaved-guard", "Unsaved changes", "adjust", 3040, 0),
    route("save-confirmation", "Saved", "feedback", 2280, 900),
  ];
  const rows = [
    ["quotes", "system-settings", "key", "primary"],
    ["text-size-clean", "system-settings", null, "return"],
    ["system-settings", "text-size-clean", "key", "primary"],
    ["text-size-clean", "text-size-dirty", "key", "primary"],
    ["text-size-dirty", "unsaved-guard", "key", "return"],
    ["text-size-dirty", "save-confirmation", "key", "outcome"],
    ["unsaved-guard", "system-settings", null, "secondary"],
    ["unsaved-guard", "save-confirmation", null, "outcome"],
    ["save-confirmation", "quotes", null, "return"],
  ];

  return {
    routes,
    nodes: [],
    transitions: buildTransitions(rows, titleLookup(routes, [])),
    componentRoutes: [],
  };
}

// One route whose content uses min-height: calc(100vh + 20px).
function viewportOverflowShape() {
  const routes = [
    {
      id: "regular",
      title: "Regular screen",
      description: "Fixed 812 px content.",
      component: "BenchViewportOverflow",
      shell: "task",
      flowGroup: "viewport",
      flowPosition: { x: 0, y: 0 },
    },
    {
      id: "vh-overflow",
      title: "Viewport overflow",
      description: "Content uses min-height: calc(100vh + 20px), so it grows with its frame.",
      component: "BenchViewportOverflow",
      shell: "task",
      contentMinHeight: "calc(100vh + 20px)",
      flowGroup: "viewport",
      flowPosition: { x: 480, y: 0 },
    },
  ];
  const rows = [
    ["regular", "vh-overflow", "key", "primary"],
    ["vh-overflow", "regular", "reference", "return"],
  ];

  return {
    routes,
    nodes: [],
    transitions: buildTransitions(rows, titleLookup(routes, [])),
    componentRoutes: [],
  };
}

// Generated 100-route flow: 10 lanes of 10 routes on COLUMN 480 / ROW 980,
// with a declared phone viewport like newly scaffolded prototypes.
function hundredRoutesShape() {
  const COLUMN = 480;
  const ROW = 980;
  const pad = (value, size) => String(value).padStart(size, "0");
  const routes = Array.from({ length: 100 }, (_, index) => {
    const lane = Math.floor(index / 10);
    const column = index % 10;
    return {
      id: `screen-${pad(index + 1, 3)}`,
      title: `Screen ${pad(index + 1, 3)}`,
      description: `Generated route ${index + 1} in lane ${lane + 1}.`,
      component: "BenchHundredRoutes",
      navigationId: `lane-${pad(lane + 1, 2)}`,
      shell: ["task", "chat", "wallet", "checkout"][index % 4],
      flowGroup: `lane-${pad(lane + 1, 2)}`,
      flowPosition: { x: column * COLUMN, y: lane * ROW },
    };
  });
  const r = routes.map((item) => item.id);
  const rows = [];

  for (let index = 0; index < 100; index += 1) {
    const column = index % 10;
    if (column < 9) rows.push([r[index], r[index + 1], "key", "primary"]);
    else if (index + 1 < 100) rows.push([r[index], r[index + 1], "key", "primary"]);
  }
  for (let index = 3; index + 20 < 100; index += 7) {
    rows.push([r[index], r[index + 20], "key", "branch"]);
  }
  for (let index = 1; index < 100; index += 3) {
    rows.push([r[index], r[index - 1], "reference", "return"]);
  }

  return {
    routes,
    nodes: [],
    transitions: buildTransitions(rows, titleLookup(routes, [])),
    componentRoutes: [],
    viewport: { formFactor: "phone", width: 375, height: 812 },
  };
}

const prototypeDefinitions = [
  {
    label: "growth-fund",
    kebab: "bench-growth-fund",
    title: "Bench Growth Fund",
    description:
      "growth-fund shape: 30 routes on COLUMN 480 / ROW 980 with an overlapping sub-row, decision / async nodes, reference branches and six flowGroups.",
    componentStyle: "live-route",
    shape: growthFundShape,
  },
  {
    label: "round-up",
    kebab: "bench-round-up",
    title: "Bench Round Up",
    description: "round-up shape: route contents from 364 px to 1040 px tall.",
    componentStyle: "live-route",
    shape: roundUpShape,
  },
  {
    label: "inventory",
    kebab: "bench-inventory",
    title: "Bench Inventory",
    description:
      "inventory shape: no route-preview marker, a node at y = -260, prototypeRoute read only in a useState initializer.",
    componentStyle: "initial-route-only",
    shape: inventoryShape,
  },
  {
    label: "font-size",
    kebab: "bench-font-size",
    title: "Bench Font Size",
    description: "font-size shape: frames on a 22 px vertical gutter.",
    componentStyle: "live-route",
    shape: fontSizeShape,
  },
  {
    label: "viewport-overflow",
    kebab: "bench-viewport-overflow",
    title: "Bench Viewport Overflow",
    description: "One route whose content uses min-height: calc(100vh + 20px).",
    componentStyle: "live-route",
    shape: viewportOverflowShape,
  },
  {
    label: "100-route",
    kebab: "bench-hundred-routes",
    title: "Bench Hundred Routes",
    description: "Generated 100-route flow with a declared phone viewport.",
    componentStyle: "live-route",
    shape: hundredRoutesShape,
  },
];

// ---------------------------------------------------------------------------
// File writers
// ---------------------------------------------------------------------------

const sharedScreenSource = `import type { CSSProperties } from "react";

import "./bench-shared.css";

// Generated by storybook-product-prototype/scripts/create_flow_bench_fixture.mjs.
// Synthetic route screen shared by the UI Flow bench prototypes.

export type BenchRoute = {
  id: string;
  title: string;
  description?: string;
  component?: string;
  navigationId?: string;
  shell?: string;
  flowGroup?: string;
  flowPosition?: { x: number; y: number };
  /** Exact content height in CSS pixels (default 812). */
  contentHeight?: number;
  /** CSS min-height used instead of a fixed height. */
  contentMinHeight?: string;
};

export type BenchFlowNode = {
  id: string;
  title?: string;
  description?: string;
  flowGroup?: string;
  flowPosition?: { x: number; y: number };
  kind?: string;
  shape?: "decision" | "state";
  tone?: "default" | "success" | "error";
};

export type BenchTransition = {
  from: string;
  to: string;
  trigger: string;
  label: string;
  flowLine?: "key" | "reference" | "hidden";
  kind?: string;
  sourceAnchor?: Record<string, number | string>;
};

export type BenchFlow = {
  routes: BenchRoute[];
  nodes: BenchFlowNode[];
  transitions: BenchTransition[];
  viewport?: { formFactor: string; width: number; height: number };
};

export type BenchRouteScreenProps = {
  route: BenchRoute;
  routes: readonly BenchRoute[];
  /** Renders the [data-prototype-route-preview] marker (default true). */
  marker?: boolean;
  showChrome?: boolean;
  onNavigate?: (routeId: string) => void;
};

const defaultScreenHeight = 812;

function getScreenStyle(route: BenchRoute): CSSProperties {
  if (route.contentMinHeight) {
    return { blockSize: "auto", minBlockSize: route.contentMinHeight };
  }

  return { blockSize: \`\${route.contentHeight ?? defaultScreenHeight}px\` };
}

function BenchRows({ count, route }: { count: number; route: BenchRoute }) {
  return (
    <ul className="pi-bench__rows">
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          <span aria-hidden="true" className="pi-bench__avatar" />
          <div>
            <strong>{\`\${route.title} item \${index + 1}\`}</strong>
            <p>Synthetic row for the UI Flow bench.</p>
          </div>
          <em>{\`\${(index * 37) % 100}%\`}</em>
        </li>
      ))}
    </ul>
  );
}

function BenchChat({ count, route }: { count: number; route: BenchRoute }) {
  return (
    <ol className="pi-bench__chat">
      {Array.from({ length: count }, (_, index) => (
        <li data-side={index % 2 === 0 ? "in" : "out"} key={index}>
          <p>{\`\${route.title} message \${index + 1}\`}</p>
          <time>{\`09:\${String(10 + index).padStart(2, "0")}\`}</time>
        </li>
      ))}
    </ol>
  );
}

function BenchWallet({ count, route }: { count: number; route: BenchRoute }) {
  return (
    <div className="pi-bench__wallet">
      <section className="pi-bench__balance">
        <p>Balance</p>
        <strong>12,480</strong>
        <span>{route.flowGroup ?? "wallet"}</span>
      </section>
      <div className="pi-bench__tiles">
        {["Pay", "Top up", "Transfer", "Plan"].map((label) => (
          <button key={label} type="button">
            {label}
          </button>
        ))}
      </div>
      <BenchRows count={Math.max(1, count - 3)} route={route} />
    </div>
  );
}

function BenchLanding({ route }: { route: BenchRoute }) {
  // Long content scrolls inside the screen, so the measured height stays fixed.
  return (
    <div className="pi-bench__scroll">
      {Array.from({ length: 18 }, (_, index) => (
        <section key={index}>
          <h2>{\`\${route.title} section \${index + 1}\`}</h2>
          <p>Synthetic paragraph that makes this screen scroll internally.</p>
        </section>
      ))}
    </div>
  );
}

function BenchCheckout({ count, route }: { count: number; route: BenchRoute }) {
  return (
    <dl className="pi-bench__receipt">
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>
          <dt>{\`\${route.title} line \${index + 1}\`}</dt>
          <dd>{\`\${(index + 1) * 120}\`}</dd>
        </div>
      ))}
    </dl>
  );
}

function BenchBody({ count, route }: { count: number; route: BenchRoute }) {
  switch (route.shell) {
    case "chat":
      return <BenchChat count={count} route={route} />;
    case "wallet":
      return <BenchWallet count={count} route={route} />;
    case "landing":
      return <BenchLanding route={route} />;
    case "checkout":
      return <BenchCheckout count={count} route={route} />;
    default:
      return <BenchRows count={count} route={route} />;
  }
}

export function BenchRouteScreen({
  marker = true,
  onNavigate,
  route,
  routes,
  showChrome = false,
}: BenchRouteScreenProps) {
  const height = route.contentHeight ?? defaultScreenHeight;
  const rowCount = Math.max(2, Math.floor((height - 196) / 52));
  const routeIndex = Math.max(
    0,
    routes.findIndex((item) => item.id === route.id),
  );
  const nextRoute = routes[(routeIndex + 1) % routes.length] ?? route;

  return (
    <main
      className="pi-bench"
      data-prototype-root="true"
      data-route={route.id}
    >
      {showChrome ? (
        <nav aria-label="Bench routes" className="pi-bench__chrome">
          <span>{\`\${routeIndex + 1} / \${routes.length}\`}</span>
          <button onClick={() => onNavigate?.(nextRoute.id)} type="button">
            Next route
          </button>
        </nav>
      ) : null}
      <section
        className="pi-bench__screen"
        data-prototype-route-preview={marker ? "true" : undefined}
        data-shell={route.shell ?? "task"}
        style={getScreenStyle(route)}
      >
        <header className="pi-bench__header">
          <p>{route.flowGroup ?? route.navigationId ?? "route"}</p>
          <h1>{route.title}</h1>
        </header>
        <div className="pi-bench__body">
          <BenchBody count={rowCount} route={route} />
        </div>
        <footer className="pi-bench__footer">
          <button onClick={() => onNavigate?.(nextRoute.id)} type="button">
            Continue
          </button>
        </footer>
      </section>
    </main>
  );
}
`;

const sharedCssSource = `/* Generated by create_flow_bench_fixture.mjs: synthetic bench screens. */
.pi-bench {
  box-sizing: border-box;
  inline-size: 100%;
  margin: 0;
  color: var(--sbt-sys-color-on-background, #1d1d1f);
  background: var(--sbt-sys-color-background, #f4f4f5);
  font-family: system-ui, sans-serif;
}

.pi-bench__chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  inline-size: min(100%, 375px);
  margin-inline: auto;
  padding: 8px 16px;
  font-size: 12px;
}

.pi-bench__screen {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  inline-size: min(100%, 375px);
  margin-inline: auto;
  overflow: hidden;
  background: var(--sbt-sys-color-surface, #ffffff);
}

.pi-bench__header {
  flex: 0 0 auto;
  box-sizing: border-box;
  padding: 20px 16px 12px;
}

.pi-bench__header p,
.pi-bench__header h1 {
  margin: 0;
}

.pi-bench__header p {
  color: var(--sbt-sys-color-primary, #2563eb);
  font-size: 12px;
  line-height: 16px;
  text-transform: uppercase;
}

.pi-bench__header h1 {
  font-size: 20px;
  line-height: 28px;
}

.pi-bench__body {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-block-size: 0;
  overflow: hidden;
  padding: 0 16px;
}

.pi-bench__rows,
.pi-bench__chat {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pi-bench__rows li {
  display: grid;
  grid-template-columns: 32px 1fr auto;
  align-items: center;
  gap: 12px;
  block-size: 48px;
  border-block-end: 1px solid var(--sbt-sys-color-outline, #e4e4e7);
}

.pi-bench__rows strong,
.pi-bench__rows p {
  display: block;
  margin: 0;
  overflow: hidden;
  font-size: 13px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pi-bench__rows p {
  font-size: 12px;
  opacity: 0.7;
}

.pi-bench__rows em {
  font-size: 12px;
  font-style: normal;
}

.pi-bench__avatar {
  inline-size: 32px;
  block-size: 32px;
  border-radius: 50%;
  background: var(--sbt-sys-color-outline, #e4e4e7);
}

.pi-bench__chat li {
  max-inline-size: 75%;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--sbt-sys-color-background, #f4f4f5);
}

.pi-bench__chat li[data-side="out"] {
  justify-self: end;
}

.pi-bench__chat p,
.pi-bench__chat time {
  display: block;
  margin: 0;
  font-size: 12px;
  line-height: 16px;
}

.pi-bench__wallet {
  display: grid;
  gap: 12px;
}

.pi-bench__balance {
  padding: 16px;
  border-radius: 12px;
  background: var(--sbt-sys-color-background, #f4f4f5);
}

.pi-bench__balance p,
.pi-bench__balance strong,
.pi-bench__balance span {
  display: block;
  margin: 0;
}

.pi-bench__balance strong {
  font-size: 28px;
  line-height: 36px;
}

.pi-bench__tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.pi-bench__tiles button,
.pi-bench__footer button,
.pi-bench__chrome button {
  min-block-size: 36px;
  border: 1px solid var(--sbt-sys-color-outline, #e4e4e7);
  border-radius: 8px;
  background: var(--sbt-sys-color-surface, #ffffff);
  color: inherit;
  font: inherit;
  font-size: 12px;
}

.pi-bench__scroll {
  flex: 1 1 0;
  min-block-size: 0;
  overflow: auto;
}

.pi-bench__scroll section {
  padding-block: 12px;
  border-block-end: 1px solid var(--sbt-sys-color-outline, #e4e4e7);
}

.pi-bench__scroll h2,
.pi-bench__scroll p {
  margin: 0;
  font-size: 13px;
  line-height: 18px;
}

.pi-bench__receipt {
  display: grid;
  gap: 8px;
  margin: 0;
}

.pi-bench__receipt div {
  display: flex;
  justify-content: space-between;
  block-size: 40px;
  align-items: center;
  border-block-end: 1px dashed var(--sbt-sys-color-outline, #e4e4e7);
}

.pi-bench__receipt dt,
.pi-bench__receipt dd {
  margin: 0;
  font-size: 13px;
}

.pi-bench__footer {
  flex: 0 0 auto;
  padding: 12px 16px 20px;
}

.pi-bench__footer button {
  inline-size: 100%;
  min-block-size: 44px;
}
`;

function componentSource(definition, pascal, camel) {
  const flowName = `${camel}Flow`;
  const readers = `const routes = ${flowName}.routes;

export type ${pascal}Props = {
  initialRouteId?: string;
  isFlowPreview?: boolean;
};

function readPreviewRoute() {
  if (typeof window === "undefined") {
    return null;
  }

  const routeId = new URLSearchParams(window.location.search).get("prototypeRoute");
  return routes.some((route) => route.id === routeId) ? routeId : null;
}

function readFlowPreview() {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("prototypeFlowPreview") === "true";
}
`;

  if (definition.componentStyle === "initial-route-only") {
    return `import { useState } from "react";

import { BenchRouteScreen } from "../bench-shared/BenchRouteScreen";
import { ${flowName} } from "./${flowName}";

// Generated by create_flow_bench_fixture.mjs (inventory shape): reads
// prototypeRoute only in the useState initializer and renders no
// [data-prototype-route-preview] marker, so UI Flow measures #storybook-root.
${readers}
export function ${pascal}({
  initialRouteId = routes[0].id,
  isFlowPreview = false,
}: ${pascal}Props) {
  const [routeId, setRouteId] = useState(() => readPreviewRoute() ?? initialRouteId);
  const route = routes.find((item) => item.id === routeId) ?? routes[0];
  const embedded = isFlowPreview || readFlowPreview();

  return (
    <BenchRouteScreen
      marker={false}
      onNavigate={setRouteId}
      route={route}
      routes={routes}
      showChrome={!embedded}
    />
  );
}
`;
  }

  return `import { useState } from "react";

import { BenchRouteScreen } from "../bench-shared/BenchRouteScreen";
import { ${flowName} } from "./${flowName}";

// Generated by create_flow_bench_fixture.mjs: reads prototypeRoute on every
// render and renders the [data-prototype-route-preview] marker.
${readers}
export function ${pascal}({
  initialRouteId = routes[0].id,
  isFlowPreview = false,
}: ${pascal}Props) {
  const previewRoute = readPreviewRoute();
  const [routeId, setRouteId] = useState(previewRoute ?? initialRouteId);
  const visibleRouteId = previewRoute ?? routeId;
  const route = routes.find((item) => item.id === visibleRouteId) ?? routes[0];
  const embedded = isFlowPreview || readFlowPreview();

  return (
    <BenchRouteScreen
      onNavigate={previewRoute ? undefined : setRouteId}
      route={route}
      routes={routes}
      showChrome={!embedded}
    />
  );
}
`;
}

function flowSource(camel, flow) {
  return `import type { BenchFlow } from "../bench-shared/BenchRouteScreen";

// Generated by create_flow_bench_fixture.mjs. Synthetic titles and labels.
export const ${camel}Flow: BenchFlow = ${JSON.stringify(flow, null, 2)};
`;
}

function metaSource(definition, camel, componentRoutes) {
  const components =
    componentRoutes.length > 0
      ? `  components: {
    classPrefix: "pi-bench-",
    routes: ${JSON.stringify(componentRoutes, null, 2).replace(/\n/g, "\n    ")},
  },
`
      : "";

  return `import { ${camel}Flow } from "./${camel}Flow";

// Generated by create_flow_bench_fixture.mjs.
export const ${camel}Meta = {
${components}  description: ${JSON.stringify(definition.description)},
  flow: ${camel}Flow,
  id: ${JSON.stringify(definition.kebab)},
  owner: "UI Flow bench fixture",
  status: "bench fixture",
  title: ${JSON.stringify(definition.title)},
};
`;
}

function storiesSource(definition, pascal, camel, initialRouteId) {
  return `import type { Meta, StoryObj } from "@storybook/react-vite";

import { ${pascal} } from "./${pascal}";
import { ${camel}Meta } from "./${camel}Meta";

// Generated by create_flow_bench_fixture.mjs.
function getFlowPreviewFromLocation() {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("prototypeFlowPreview") === "true";
}

const meta = {
  title: ${JSON.stringify(`Pages/Prototypes/${definition.title}`)},
  component: ${pascal},
  parameters: {
    layout: "fullscreen",
    prototype: ${camel}Meta,
  },
  args: {
    initialRouteId: ${JSON.stringify(initialRouteId)},
    isFlowPreview: false,
  },
  render: (args) => {
    const isFlowPreview = args.isFlowPreview || getFlowPreviewFromLocation();

    return <${pascal} {...args} isFlowPreview={isFlowPreview} />;
  },
} satisfies Meta<typeof ${pascal}>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
`;
}

async function writePrototypes(fixtureRoot) {
  const prototypesRoot = path.join(fixtureRoot, "src", "pages", "prototypes");
  const sharedDir = path.join(prototypesRoot, "bench-shared");

  await mkdir(sharedDir, { recursive: true });
  await writeFile(path.join(sharedDir, "BenchRouteScreen.tsx"), sharedScreenSource);
  await writeFile(path.join(sharedDir, "bench-shared.css"), sharedCssSource);

  const written = [];

  for (const definition of prototypeDefinitions) {
    const pascal = toPascal(definition.kebab);
    const camel = toCamel(definition.kebab);
    const dir = path.join(prototypesRoot, definition.kebab);
    const { routes, nodes, transitions, componentRoutes, viewport } = definition.shape();
    const flow = { routes, nodes, transitions, ...(viewport ? { viewport } : {}) };
    const storyId = toStoryId(`Pages/Prototypes/${definition.title}`, "Default");

    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${camel}Flow.ts`), flowSource(camel, flow));
    await writeFile(path.join(dir, `${camel}Meta.ts`), metaSource(definition, camel, componentRoutes));
    await writeFile(path.join(dir, `${pascal}.tsx`), componentSource(definition, pascal, camel));
    await writeFile(
      path.join(dir, `${pascal}.stories.tsx`),
      storiesSource(definition, pascal, camel, routes[0].id),
    );

    written.push({
      label: definition.label,
      prototypeId: definition.kebab,
      title: definition.title,
      storyId,
      uiFlowPath: `iframe.html?id=${storyId}&globals=prototypeMode:flow&viewMode=story`,
      routes: routes.length,
      flowNodes: nodes.length,
      transitions: transitions.length,
      keyEdges: new Set(
        transitions
          .filter((transition) => transition.flowLine === "key")
          .map((transition) => `${transition.from}->${transition.to}`),
      ).size,
      declaredViewport: viewport ?? null,
      description: definition.description,
    });
  }

  return written;
}

async function patchStoriesGlob(fixtureRoot) {
  const configPath = path.join(fixtureRoot, ".storybook", "project.config.ts");
  const source = await readFile(configPath, "utf8");

  if (source.includes(benchStoriesGlob)) return;
  if (!source.includes(exampleStoriesGlob)) {
    throw new Error(
      `Cannot find ${exampleStoriesGlob} in ${configPath}; add ${benchStoriesGlob} to storybook.stories by hand.`,
    );
  }

  await writeFile(
    configPath,
    source.replace(exampleStoriesGlob, `${exampleStoriesGlob},\n      ${JSON.stringify(benchStoriesGlob)}`),
  );
}

async function copyTemplate(templateRoot, fixtureRoot) {
  const filter = (source) =>
    !path.relative(templateRoot, source).split(path.sep).some((part) => anyLevelExclusions.has(part));

  for (const entry of await readdir(templateRoot)) {
    if (topLevelExclusions.has(entry) || anyLevelExclusions.has(entry)) continue;
    await cp(path.join(templateRoot, entry), path.join(fixtureRoot, entry), {
      errorOnExist: true,
      filter,
      force: false,
      recursive: true,
      verbatimSymlinks: true,
    });
  }
}

// Shares the template's packages through per-package symlinks. A package that
// is itself a symlink into the template (a file: dependency such as the
// vendored figma-export addon) points at the fixture's own copy instead.
async function linkNodeModules(templateRoot, fixtureRoot) {
  const sourceModules = path.join(templateRoot, "node_modules");
  const targetModules = path.join(fixtureRoot, "node_modules");
  let linked = 0;
  const remapped = [];

  const linkEntry = async (sourcePath, targetPath) => {
    const info = await lstat(sourcePath);
    let linkTarget = sourcePath;

    if (info.isSymbolicLink()) {
      const resolved = path.resolve(path.dirname(sourcePath), await readlink(sourcePath));
      if (isInside(resolved, templateRoot) && !isInside(resolved, sourceModules)) {
        linkTarget = path.join(fixtureRoot, path.relative(templateRoot, resolved));
        remapped.push(path.relative(fixtureRoot, targetPath));
      }
    }

    await symlink(linkTarget, targetPath);
    linked += 1;
  };

  await mkdir(targetModules);

  for (const entry of await readdir(sourceModules, { withFileTypes: true })) {
    if (nodeModulesExclusions.has(entry.name)) continue;
    const sourcePath = path.join(sourceModules, entry.name);

    if (entry.name.startsWith("@") && entry.isDirectory()) {
      await mkdir(path.join(targetModules, entry.name));
      for (const scoped of await readdir(sourcePath, { withFileTypes: true })) {
        if (scoped.name === ".DS_Store") continue;
        await linkEntry(path.join(sourcePath, scoped.name), path.join(targetModules, entry.name, scoped.name));
      }
      continue;
    }

    await linkEntry(sourcePath, path.join(targetModules, entry.name));
  }

  return { linked, remapped };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${error.message}\n\n${usage()}`);
    process.exit(2);
  }

  if (args.help) {
    console.log(usage());
    return;
  }

  if (!args.out) {
    console.error(`--out is required.\n\n${usage()}`);
    process.exit(2);
  }

  const templateRoot = path.resolve(args.template ?? defaultTemplateRoot);
  if (!existsSync(path.join(templateRoot, ".storybook", "prototype-inspector", "preview.js"))) {
    console.error(
      `No storybook-template with a Prototype Inspector at ${templateRoot}.` +
        (args.template ? "" : " Pass --template <dir>."),
    );
    process.exit(1);
  }

  const templateNodeModules = path.join(templateRoot, "node_modules");
  if (!existsSync(path.join(templateNodeModules, "storybook", "package.json"))) {
    console.error(
      `${templateNodeModules} is missing or incomplete; nothing was written.\n` +
        `Run \`npm ci\` in ${templateRoot} first (node_modules is not versioned).`,
    );
    process.exit(1);
  }

  const templateReal = realpathSync(templateRoot);
  const outDir = path.resolve(args.out);
  const outReal = realpathOfPossiblyMissing(outDir);
  const protectedRoots = [
    templateReal,
    findGitRoot(templateReal),
    findGitRoot(realpathSync(scriptDir)),
  ].filter(Boolean);
  const insideRoot = protectedRoots.find((root) => isInside(outReal, root));

  if (insideRoot) {
    console.error(`--out must be outside ${insideRoot} (got ${outDir}); the fixture never lives in the repo.`);
    process.exit(1);
  }

  if (existsSync(outDir) && (await readdir(outDir)).length > 0) {
    console.error(`${outDir} is not empty; pass a new folder.`);
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });
  await copyTemplate(templateRoot, outDir);
  await patchStoriesGlob(outDir);
  const prototypes = await writePrototypes(outDir);
  const modules = await linkNodeModules(templateRoot, outDir);
  const buildTag = readBuildTag(outDir);
  const manifest = {
    createdAt: new Date().toISOString(),
    generator: "storybook-product-prototype/scripts/create_flow_bench_fixture.mjs",
    template: templateReal,
    prototypeInspectorBuildTag: buildTag,
    nodeModules: {
      mode: "per-package symlinks into the template node_modules",
      linkedEntries: modules.linked,
      remappedToFixture: modules.remapped,
    },
    prototypes,
  };

  await writeFile(path.join(outDir, "bench-fixture.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const labelWidth = Math.max(...prototypes.map((item) => item.label.length));
  const idWidth = Math.max(...prototypes.map((item) => item.storyId.length));
  const benchScript = path.join(scriptDir, "bench_flow_canvas.mjs");

  console.log(`Flow bench fixture: ${outDir}`);
  console.log(`  template: ${templateReal}`);
  console.log(`  prototypeInspectorBuildTag: ${buildTag ?? "(not found)"}`);
  console.log(
    `  node_modules: ${modules.linked} symlinked entries` +
      (modules.remapped.length ? `; ${modules.remapped.join(", ")} -> fixture copy` : ""),
  );
  console.log("");
  console.log("UI Flow story ids (iframe.html?id=<id>&globals=prototypeMode:flow&viewMode=story):");
  for (const item of prototypes) {
    console.log(
      `  ${item.label.padEnd(labelWidth)}  ${item.storyId.padEnd(idWidth)}  ` +
        `${item.routes} routes, ${item.flowNodes} nodes, ${item.transitions} transitions`,
    );
  }
  console.log("");
  console.log("Start Storybook:");
  console.log(`  cd ${JSON.stringify(outDir)} && npx storybook dev -p 6006 --ci --no-open`);
  console.log("Bench a flow:");
  console.log(
    `  node ${JSON.stringify(benchScript)} --project-root ${JSON.stringify(outDir)} ` +
      `--url "http://localhost:6006/${prototypes[0].uiFlowPath}"`,
  );
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
