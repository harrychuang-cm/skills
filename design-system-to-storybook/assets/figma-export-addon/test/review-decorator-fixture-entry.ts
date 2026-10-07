// Browser fixture for the self-registered review decorator. Built by
// test/run-review-decorator-fixture.mjs into its own bundle, next to a separate
// bundle of src/preview.ts, so the preview entry's host decorator and this
// review entry share nothing but the global symbol registry, as in Storybook.
import {
  configureFigmaExportReview,
  createFigmaExportReviewDecorator,
  destroyFigmaReviewWorkspace,
} from "../src/review";

type Decorator = <StoryResult>(
  storyFn: () => StoryResult,
  context: Record<string, unknown>,
) => StoryResult;

const results: Array<{ name: string; passed: boolean; details?: string }> = [];
const resultElement = document.querySelector<HTMLElement>("#fixture-result")!;

function check(name: string, passed: boolean, details?: string): void {
  results.push({ name, passed, ...(details ? { details } : {}) });
}

function finish(error?: unknown): void {
  const payload = error
    ? { error: error instanceof Error ? `${error.message}\n${error.stack}` : String(error) }
    : { results };
  resultElement.textContent = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

// Timers, not animation frames: headless Chrome's virtual time (used with
// --dump-dom) does not produce frames.
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 150));
}

function count(selector: string): number {
  return document.querySelectorAll(selector).length;
}

function workspaceState() {
  return {
    exporters: count(".sbfx-exporter"),
    hosts: count("[data-sbfx-review-host]"),
    panels: count(".sbfx-comments-panel"),
    workspaces: count("[data-sbfx-workspace]"),
    workspaceOpen: document.documentElement.dataset.sbfxWorkspaceOpen === "true",
  };
}

function clearRegistration(): void {
  delete (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("sbfx.review.registry")];
}

const visualComments = { apiPath: "/__comments", enabled: true };
const figmaExportOptions = { storyTitlePrefix: false as const, visualComments };
const reviewOptions = { apiPath: "/status", visualComments };
const contextOn = {
  globals: { figmaExport: "on" },
  id: "pages-prototypes-demo--default",
  name: "Default",
  title: "Pages/Prototypes/Demo",
  viewMode: "story",
};
const contextOff = { ...contextOn, globals: { figmaExport: "off" } };

// A decorator that replaces the story with its own content without calling
// the story function, like the Prototype Inspector in UI Flow mode.
const replacingDecorator: Decorator = <StoryResult>() =>
  "replacing-content" as unknown as StoryResult;

window.fetch = async (input) => {
  const url = new URL(String(input), location.href);
  if (url.pathname === "/status") {
    return new Response(JSON.stringify({ entry: null }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  }
  if (url.pathname.startsWith("/__comments")) {
    return new Response(
      JSON.stringify({
        activeProjectRelativeSessionPath: null,
        activeReportUrl: null,
        activeSession: null,
        activeTracking: { open: 0, total: 0 },
        comments: [],
        meetings: [],
        recentSessions: [],
        reportUrl: "/__comments/reports",
        version: 1,
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    );
  }
  return new Response("not found", { status: 404 });
};

async function run(): Promise<void> {
  const host = (window as unknown as { SbfxPreviewEntry: { figmaExportHostDecorator: Decorator } })
    .SbfxPreviewEntry.figmaExportHostDecorator;
  const legacy = createFigmaExportReviewDecorator(figmaExportOptions, reviewOptions) as Decorator;

  // 1. Review runs around a mode that does not render the story.
  configureFigmaExportReview(figmaExportOptions, reviewOptions);
  const replaced = host(
    () => replacingDecorator(() => legacy(() => "story", contextOn), contextOn),
    contextOn,
  );
  await settle();
  let state = workspaceState();
  check("host decorator returns the replacing decorator's content", replaced === "replacing-content");
  check(
    "review workspace and visual comments panel mount around a replacing decorator",
    state.workspaces === 1 && state.hosts === 1 && state.panels === 1 && state.workspaceOpen,
    JSON.stringify(state),
  );
  check("one export overlay, from the review entry only", state.exporters === 1, JSON.stringify(state));

  // 2. Turning export off in that mode removes the workspace.
  host(() => replacingDecorator(() => legacy(() => "story", contextOff), contextOff), contextOff);
  await settle();
  state = workspaceState();
  check(
    "turning Figma export off removes the workspace, the panel and the html marker",
    state.workspaces === 0 && state.hosts === 0 && state.panels === 0 && !state.workspaceOpen,
    JSON.stringify(state),
  );

  // 3. A project that only uses the legacy decorator keeps working.
  clearRegistration();
  const passThrough = host(() => "story", contextOn);
  await settle();
  check(
    "without a registration the host decorator has no side effect",
    passThrough === "story" && workspaceState().workspaces === 0,
    JSON.stringify(workspaceState()),
  );
  const legacyResult = legacy(() => "story", contextOn);
  await settle();
  state = workspaceState();
  check(
    "the legacy decorator mounts the review workspace on its own",
    legacyResult === "story" && state.workspaces === 1 && state.hosts === 1 && state.panels === 1,
    JSON.stringify(state),
  );
  legacy(() => "story", contextOff);
  await settle();
  destroyFigmaReviewWorkspace();

  // 4. Both wirings mount one workspace.
  configureFigmaExportReview(figmaExportOptions, reviewOptions);
  const bothResult = host(() => legacy(() => "story", contextOn), contextOn);
  await settle();
  state = workspaceState();
  check(
    "configure plus the legacy decorator mount exactly one workspace and one panel",
    bothResult === "story" &&
      state.workspaces === 1 &&
      state.hosts === 1 &&
      state.panels === 1 &&
      state.exporters === 1,
    JSON.stringify(state),
  );
}

run().then(() => finish(), finish);
