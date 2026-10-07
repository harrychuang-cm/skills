// Browser fixture for host-declared comment views, anchors and availability
// (add-anchored-visual-comments). Built and driven by test/run-anchor-fixture.mjs
// in headless Chrome over CDP, so animation frames and real pointer events run.
import {
  createFigmaExportReviewDecorator,
  destroyFigmaReviewWorkspace,
} from "../src/review";
import { placeAnchoredPin, readCommentView, resolveCommentAnchor } from "../src/commentAnchors";

type Result = { name: string; passed: boolean; detail?: string };
const results: Result[] = [];
const resultElement = document.querySelector<HTMLElement>("#fixture-result")!;
resultElement.dataset.stage = "started";

function check(name: string, condition: unknown, detail?: string) {
  results.push({ name, passed: Boolean(condition), ...(detail ? { detail } : {}) });
}

function stage(name: string) {
  resultElement.dataset.stage = name;
}

function waitFor(test: () => unknown, timeout = 8_000): Promise<void> {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (test()) resolve();
      else if (performance.now() - started > timeout) {
        reject(new Error(`Timed out waiting for: ${String(test).replace(/\s+/g, " ").slice(0, 200)}`));
      } else setTimeout(poll, 25);
    };
    poll();
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setNativeValue(element: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function pointer(target: Element, type: string, x: number, y: number, button = 0) {
  const init = { bubbles: true, button, cancelable: true, clientX: x, clientY: y, pointerId: 1 };
  return target.dispatchEvent(
    type.startsWith("pointer") ? new PointerEvent(type, init) : new MouseEvent(type, init),
  );
}

function clickSequence(target: Element, x: number, y: number) {
  pointer(target, "pointerdown", x, y);
  pointer(target, "pointerup", x, y);
  pointer(target, "click", x, y);
}

function centerOf(element: Element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// ---------------------------------------------------------------------------
// In-memory comments API with the real server's overview projection.
// ---------------------------------------------------------------------------
type StoredComment = {
  id: string;
  body: Record<string, any>;
  createdAt: string;
  sessionId: string;
};
const storyId = "pages-prototypes-demo--default";
const sessionId = "meeting-anchor";
const stored: StoredComment[] = [];
const posted: Array<Record<string, any>> = [];
const requestLog: Array<{ method: string; path: string; at: number }> = [];
// Location edits the panel sent, and a switch that fails the next one.
const patchLog: Array<Record<string, any>> = [];
let failNextPatch = false;
let activeSession: Record<string, unknown> | null = null;

function overviewComment(comment: StoredComment, ordinal: number) {
  const { body } = comment;
  return {
    id: comment.id,
    authorName: body.authorName ?? "Anonymous",
    body: body.body,
    createdAt: comment.createdAt,
    kind: body.kind ?? "visual-fix",
    ordinal,
    pin: body.pin,
    preview: { imageUrl: body.capture.dataUrl, width: body.capture.width, height: body.capture.height, pin: body.pin },
    sessionId: comment.sessionId,
    state: {},
    view: body.story?.view ?? "story",
    ...(body.anchor ? { anchor: body.anchor } : {}),
    ...(body.movedAt ? { movedAt: body.movedAt } : {}),
  };
}

// The real server's location edit rules (add-direct-pin-editing).
function applyCommentPatch(comment: StoredComment, patch: Record<string, any>) {
  const target = comment.body;
  if ("movedAt" in patch) {
    if (patch.anchor) target.anchor = patch.anchor;
    else delete target.anchor;
    target.pin = patch.pin;
    if (patch.movedAt) target.movedAt = patch.movedAt;
    else delete target.movedAt;
  } else if (patch.anchor) {
    const previous = target.anchor;
    target.anchor = patch.anchor;
    if (
      !target.movedAt &&
      previous?.type === "element" &&
      patch.anchor.type === "element" &&
      previous.id === patch.anchor.id
    ) {
      target.pin = {
        xRatio: Math.min(1, Math.max(0, patch.anchor.x / patch.anchor.width)),
        yRatio: Math.min(1, Math.max(0, patch.anchor.y / patch.anchor.height)),
      };
    } else {
      target.movedAt = new Date().toISOString();
    }
  } else if (patch.pin) {
    target.pin = patch.pin;
  }
  if (patch.body !== undefined) target.body = patch.body;
  if (patch.kind !== undefined) target.kind = patch.kind;
}

function overview() {
  const forStory = stored.filter((comment) => comment.body.story?.id === storyId);
  return {
    activeProjectRelativeSessionPath: null,
    activeReportUrl: null,
    activeSession,
    activeTracking: { open: 0, total: 0 },
    comments: forStory.map((comment) => overviewComment(comment, stored.indexOf(comment) + 1)),
    meetings: activeSession
      ? [{
          active: true,
          closedAt: null,
          commentCount: stored.length,
          id: sessionId,
          projectRelativeSessionPath: null,
          reportUrl: "/__comments/reports/sessions/meeting-anchor/index.html",
          startedAt: "2026-10-06T00:00:00.000Z",
          storyCommentCount: forStory.length,
          title: "Anchor review",
          tracking: { open: 0, total: 0 },
        }]
      : [],
    recentSessions: [],
    reportUrl: "/__comments/reports",
    version: 1,
  };
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, status });

window.fetch = async (input, init) => {
  const url = new URL(String(input), location.href);
  if (url.pathname === "/status") return json({ entry: null });
  if (!url.pathname.startsWith("/__comments")) return new Response("not found", { status: 404 });
  const path = url.pathname.slice("/__comments".length);
  const method = init?.method ?? "GET";
  requestLog.push({ method, path, at: performance.now() });
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  if (method === "POST" && path === "/sessions") {
    activeSession = {
      captureCount: stored.length,
      closedAt: null,
      commentCount: stored.length,
      id: sessionId,
      startedAt: "2026-10-06T00:00:00.000Z",
      title: body?.title ?? "Anchor review",
    };
    return json({ meeting: { session: activeSession }, reportStale: false }, 201);
  }
  if (method === "POST" && path.endsWith("/comments")) {
    posted.push(body);
    const comment = {
      id: `comment-${stored.length + 1}`,
      body,
      createdAt: `2026-10-06T00:00:${String(10 + stored.length).padStart(2, "0")}.000Z`,
      sessionId,
    };
    stored.push(comment);
    return json({ comment: { id: comment.id, ...body }, reportStale: false }, 201);
  }
  const commentPatch = /^\/sessions\/[^/]+\/comments\/([^/]+)$/.exec(path);
  if (method === "PATCH" && commentPatch) {
    patchLog.push(body);
    if (failNextPatch) {
      failNextPatch = false;
      return json({ error: "Simulated validation failure." }, 400);
    }
    const comment = stored.find((entry) => entry.id === decodeURIComponent(commentPatch[1]));
    if (!comment) return json({ error: "Comment not found." }, 404);
    applyCommentPatch(comment, body);
    return json({ comment: overviewComment(comment, stored.indexOf(comment) + 1), reportStale: false });
  }
  if (method === "GET" && (path === "" || path === "/")) return json(overview());
  return json({ error: "unhandled" }, 404);
};

// ---------------------------------------------------------------------------
// Review mount and helpers
// ---------------------------------------------------------------------------
const root = document.querySelector<HTMLElement>("#storybook-root")!;
const visualComments = { apiPath: "/__comments", enabled: true };
const reviewDecorator = createFigmaExportReviewDecorator(
  { storyTitlePrefix: false, visualComments },
  { apiPath: "/status", visualComments },
);
const storyContext = {
  globals: { figmaExport: "on" },
  id: storyId,
  name: "Default",
  title: "Pages/Prototypes/Demo",
  viewMode: "story",
};

function renderStory(markup: string) {
  root.innerHTML = markup;
  reviewDecorator(() => null, storyContext);
}

function panelButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.getAttribute("aria-label") === label || button.textContent?.trim() === label,
  );
}

async function openPanel() {
  await waitFor(() => panelButton("Open comments") || panelButton("Close comments"));
  if (panelButton("Open comments")) panelButton("Open comments")!.click();
  await waitFor(() => document.querySelector(".sbfx-comments-panel__detail:not([hidden])"));
  await waitFor(() => document.querySelector('[data-comments-capability="available"]'));
}

async function placeComment(target: Element, x: number, y: number, text: string) {
  const before = posted.length;
  const add = document.querySelector<HTMLButtonElement>(".sbfx-comments-panel__add");
  if (!add) throw new Error("Add comment is not shown");
  add.click();
  await waitFor(() => document.documentElement.dataset.sbfxCaptureMode === "true");
  clickSequence(target, x, y);
  await waitFor(() => document.querySelector(".sbfx-comment-composer textarea"), 12_000);
  setNativeValue(document.querySelector<HTMLTextAreaElement>(".sbfx-comment-composer textarea")!, text);
  await nextFrame();
  panelButton("Save comment")!.click();
  await waitFor(() => posted.length === before + 1, 8_000);
  await waitFor(() => !document.querySelector(".sbfx-comment-composer textarea"));
  return posted[posted.length - 1];
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------
async function hostDeclarationScenarios() {
  stage("host-declarations");
  // Example "current view resolution".
  const probe = document.createElement("div");
  const rows: Array<[string, string]> = [
    ["", "story"],
    ['<div data-sbfx-view="ui-flow"></div>', "ui-flow"],
    ['<div data-sbfx-view="UI Flow"></div>', "story"],
    ['<div data-sbfx-view="ui-flow"></div><div data-sbfx-view="docs"></div>', "ui-flow"],
  ];
  for (const [markup, expected] of rows) {
    probe.innerHTML = markup;
    check(`view resolution: ${markup || "(none)"} -> ${expected}`, readCommentView(probe) === expected, readCommentView(probe));
  }

  // A UI Flow comment records its view; a Story comment records none.
  renderStory('<div id="flow" data-sbfx-view="ui-flow" style="width: 600px; height: 400px; background: rgb(30 30 34)"></div>');
  await openPanel();
  const flow = root.querySelector("#flow")!;
  const flowPoint = centerOf(flow);
  const flowRequest = await placeComment(flow, flowPoint.x, flowPoint.y, "UI Flow comment");
  check("a comment in a ui-flow view sends story.view ui-flow", flowRequest.story?.view === "ui-flow", JSON.stringify(flowRequest.story));

  renderStory('<div id="story" style="width: 600px; height: 400px; background: rgb(240 240 244)"></div>');
  await sleep(700);
  const story = root.querySelector("#story")!;
  const storyPoint = centerOf(story);
  const storyRequest = await placeComment(story, storyPoint.x, storyPoint.y, "Story comment");
  check("a comment without a declared view sends no story.view", !("view" in (storyRequest.story ?? {})), JSON.stringify(storyRequest.story));

  // A documentation view declines comments.
  renderStory('<div data-sbfx-comments="unavailable" style="width: 600px; height: 400px"></div>');
  await waitFor(() => document.querySelector("[data-comments-unavailable]"), 3_000).catch(() => undefined);
  check("Add comment is hidden while comments are unavailable", !document.querySelector(".sbfx-comments-panel__add"));
  check(
    "the panel says comments are not available",
    document.querySelector("[data-comments-unavailable]")?.textContent === "Comments are not available in this view.",
    document.querySelector("[data-comments-unavailable]")?.textContent ?? "(missing)",
  );
  const keyEvent = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "c" });
  document.body.dispatchEvent(keyEvent);
  await sleep(100);
  check(
    "C arms no capture while comments are unavailable",
    document.documentElement.dataset.sbfxCaptureMode !== "true" && !keyEvent.defaultPrevented,
  );

  // The canvas view points Figma export to its static export.
  renderStory(
    '<div data-sbfx-view="ui-flow" data-sbfx-export="unavailable" data-sbfx-export-label="Open Static Flow to export this flow." data-sbfx-export-href="/?path=/story/demo--static-flow" style="width: 600px; height: 400px"></div>',
  );
  await waitFor(() => document.querySelector('.sbfx-exporter[data-export-available="false"]'), 3_000).catch(() => undefined);
  const exporter = document.querySelector<HTMLElement>(".sbfx-exporter");
  const notice = exporter?.querySelector<HTMLElement>(".sbfx-exporter__unavailable");
  const link = notice?.querySelector<HTMLAnchorElement>("a");
  check(
    "the export section shows the host's label",
    Boolean(notice && !notice.hidden && notice.textContent?.includes("Open Static Flow to export this flow.")),
    notice?.textContent ?? "(missing)",
  );
  check(
    "the export section links to the same-origin href",
    Boolean(link && !link.hidden && link.href === new URL("/?path=/story/demo--static-flow", location.href).href),
    link?.href ?? "(missing)",
  );
  const actions = exporter?.querySelector<HTMLElement>(".sbfx-exporter__actions");
  check(
    "export actions are not offered",
    Boolean(actions?.hidden) && actions!.getBoundingClientRect().height === 0,
  );
  const downloadButton = Array.from(exporter?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
    (button) => button.textContent?.includes("Download JSON"),
  );
  downloadButton?.click();
  await sleep(150);
  check("an invoked export action refuses to export", exporter?.dataset.status === "idle", exporter?.dataset.status);
  check(
    "Export review stays available",
    Boolean(document.querySelector('[aria-label="Figma export review"]')),
  );
  renderStory('<div style="width: 600px; height: 400px"></div>');
  await waitFor(() => document.querySelector('.sbfx-exporter[data-export-available="true"]'), 3_000).catch(() => undefined);
  check(
    "export actions return when the declaration is gone",
    exporter?.dataset.exportAvailable === "true" && !exporter.querySelector<HTMLElement>(".sbfx-exporter__actions")?.hidden,
  );
}

const near = (actual: number | undefined, expected: number, tolerance = 0.01) =>
  typeof actual === "number" && Math.abs(actual - expected) <= tolerance;

// A canvas like the Prototype Inspector's UI Flow: translate(40, 20) scale(0.5),
// frames route:intake at world (0, 0) and route:review at world (960, 0), and a
// line between them at world y = 400.
const canvasMarkup = `
  <div id="canvas" data-sbfx-canvas style="position: absolute; inset: 0; overflow: hidden; background: rgb(28 28 30)">
    <div data-sbfx-canvas-world style="position: absolute; left: 0; top: 0; transform-origin: 0 0; transform: translate(40px, 20px) scale(0.5)">
      <svg style="position: absolute; left: 0; top: 0; width: 1400px; height: 900px; overflow: visible; pointer-events: none" viewBox="0 0 1400 900">
        <polyline data-sbfx-anchor="edge:intake->review" data-sbfx-anchor-kind="path" data-sbfx-anchor-label="Intake → Review" points="377,400 960,400" style="fill: none; stroke: rgb(124 58 237); stroke-width: 4"></polyline>
      </svg>
      <div data-sbfx-anchor="route:intake" data-sbfx-anchor-label="Intake" style="position: absolute; left: 0; top: 0; width: 377px; height: 878px; background: rgb(90 90 96)"></div>
      <div data-sbfx-anchor="route:review" data-sbfx-anchor-label="Review" style="position: absolute; left: 960px; top: 0; width: 377px; height: 878px; background: rgb(90 90 96)"></div>
    </div>
  </div>`;

async function anchorResolutionScenarios() {
  stage("anchor-resolution");
  root.style.height = "900px";

  // A press on a frame records an element anchor in layout pixels.
  renderStory(`
    <div style="position: absolute; left: 100px; top: 200px; transform-origin: 0 0; transform: scale(0.5)">
      <div id="frame" data-sbfx-anchor="route:review" data-sbfx-anchor-label="Review Request" data-sbfx-anchor-route="review" style="width: 375px; height: 812px; background: rgb(60 60 66)"></div>
    </div>`);
  await sleep(600);
  const frameRequest = await placeComment(root.querySelector("#frame")!, 150, 300, "Frame comment");
  const frameAnchor = frameRequest.anchor;
  check(
    "a press on a frame records an element anchor (x 100, y 200, 375 x 812)",
    frameAnchor?.type === "element" &&
      frameAnchor.id === "route:review" &&
      frameAnchor.label === "Review Request" &&
      frameAnchor.route === "review" &&
      near(frameAnchor.x, 100) &&
      near(frameAnchor.y, 200) &&
      frameAnchor.width === 375 &&
      frameAnchor.height === 812,
    JSON.stringify(frameAnchor),
  );

  // A press near a line records a path anchor; the line is drawn inside a
  // scaled layer to cover CSS transforms on SVG ancestors.
  renderStory(`
    <div id="path-area" style="position: absolute; left: 0; top: 600px; width: 900px; height: 200px; background: rgb(240 240 244)">
      <div style="position: absolute; left: 100px; top: 50px; transform-origin: 0 0; transform: scale(0.5)">
        <svg style="width: 800px; height: 20px; overflow: visible; pointer-events: none" viewBox="0 0 800 20">
          <polyline data-sbfx-anchor="edge:intake->review" data-sbfx-anchor-kind="path" points="0,10 800,10" style="fill: none; stroke: rgb(0 0 0); stroke-width: 2"></polyline>
        </svg>
      </div>
    </div>`);
  await sleep(600);
  const pathArea = root.querySelector("#path-area")!;
  const pathRequest = await placeComment(pathArea, 200, 660, "Line comment");
  check(
    "a press 5 px from a line records a path anchor at t 0.25",
    pathRequest.anchor?.type === "path" &&
      pathRequest.anchor.id === "edge:intake->review" &&
      near(pathRequest.anchor.t, 0.25, 0.005),
    JSON.stringify(pathRequest.anchor),
  );
  check(
    "anchor order: 9 px from a line outside a declared canvas has no anchor",
    resolveCommentAnchor(root, 200, 664, pathArea) === undefined,
    JSON.stringify(resolveCommentAnchor(root, 200, 664, pathArea)),
  );
  // Curved or general <path> elements use the sampling fallback.
  renderStory(`
    <div id="general-path-area" style="position: absolute; left: 0; top: 600px; width: 900px; height: 200px">
      <div style="position: absolute; left: 100px; top: 50px; transform-origin: 0 0; transform: scale(0.5)">
        <svg style="width: 800px; height: 20px; overflow: visible; pointer-events: none" viewBox="0 0 800 20">
          <path data-sbfx-anchor="edge:general" data-sbfx-anchor-kind="path" d="M0 10 L800 10" style="fill: none; stroke: rgb(0 0 0)"></path>
        </svg>
      </div>
    </div>`);
  await sleep(100);
  const generalPath = resolveCommentAnchor(root, 200, 660, root.querySelector("#general-path-area"));
  check(
    "a general <path> anchor resolves by sampling (t 0.25)",
    generalPath?.type === "path" && generalPath.id === "edge:general" && near(generalPath.t, 0.25, 0.005),
    JSON.stringify(generalPath),
  );

  // A press on blank canvas records a canvas anchor with nearby frames.
  renderStory(canvasMarkup);
  await sleep(600);
  const canvas = root.querySelector("#canvas")!;
  const canvasRequest = await placeComment(canvas, 340, 170, "Canvas comment");
  const canvasAnchor = canvasRequest.anchor;
  check(
    "a press on blank canvas records world (600, 300) with nearby intake then review",
    canvasAnchor?.type === "canvas" &&
      near(canvasAnchor.x, 600) &&
      near(canvasAnchor.y, 300) &&
      canvasAnchor.nearby?.length === 2 &&
      canvasAnchor.nearby[0].id === "route:intake" &&
      canvasAnchor.nearby[0].label === "Intake" &&
      near(canvasAnchor.nearby[0].dx, 600) &&
      near(canvasAnchor.nearby[0].dy, 300) &&
      canvasAnchor.nearby[1].id === "route:review" &&
      near(canvasAnchor.nearby[1].dx, -360) &&
      near(canvasAnchor.nearby[1].dy, 300),
    JSON.stringify(canvasAnchor),
  );
  const frameOnCanvas = root.querySelector('[data-sbfx-anchor="route:intake"]')!;
  check(
    "anchor order: inside an element anchor resolves the element",
    resolveCommentAnchor(root, 100, 100, frameOnCanvas)?.type === "element",
  );
  const sixPx = resolveCommentAnchor(root, 400, 226, canvas);
  check(
    "anchor order: 6 px from a line inside the canvas resolves the path",
    sixPx?.type === "path" && near(sixPx.t, (720 - 377) / 583, 0.005),
    JSON.stringify(sixPx),
  );
  check(
    "anchor order: 9 px from the line inside the canvas resolves the canvas",
    resolveCommentAnchor(root, 400, 229, canvas)?.type === "canvas",
    JSON.stringify(resolveCommentAnchor(root, 400, 229, canvas)),
  );

  // Path hit-testing cost: 150 lines of 1000 units whose bounds all cover the press.
  const lines = Array.from({ length: 150 }, (_, index) =>
    `<polyline data-sbfx-anchor="edge:bench-${index}" data-sbfx-anchor-kind="path" points="${index * 4},0 ${index * 4 + 600},800" style="fill: none; stroke: rgb(0 0 0)"></polyline>`,
  ).join("");
  renderStory(`
    <div id="bench" data-sbfx-canvas style="position: absolute; inset: 0">
      <div data-sbfx-canvas-world style="position: absolute; left: 0; top: 0; transform-origin: 0 0">
        <svg style="position: absolute; left: 0; top: 0; width: 1200px; height: 900px; overflow: visible" viewBox="0 0 1200 900">${lines}</svg>
      </div>
    </div>`);
  await sleep(300);
  const bench = root.querySelector("#bench")!;
  const started = performance.now();
  const benchAnchor = resolveCommentAnchor(root, 640, 450, bench);
  const elapsed = performance.now() - started;
  check(
    "measure: path hit-testing for 150 lines of 1000 units",
    true,
    `${elapsed.toFixed(1)} ms (resolved ${benchAnchor?.type ?? "none"})`,
  );
  root.style.height = "";
}

function worldLayer(): HTMLElement {
  return root.querySelector<HTMLElement>("[data-sbfx-canvas-world]")!;
}

// Moves the world layer and dispatches sbfx:anchors-moved in one animation
// frame, then reads the given element's left/top in that same frame.
function moveWorldAndRead(transform: string, read: () => HTMLElement | null) {
  return new Promise<{ left: string; top: string; display: string } | null>((resolve) => {
    requestAnimationFrame(() => {
      worldLayer().style.transform = transform;
      worldLayer().dispatchEvent(new CustomEvent("sbfx:anchors-moved", { bubbles: true }));
      const element = read();
      resolve(element ? { display: element.style.display, left: element.style.left, top: element.style.top } : null);
    });
  });
}

async function anchoredPlacementScenarios() {
  stage("anchored-placement");
  root.style.height = "900px";
  renderStory(canvasMarkup);
  await sleep(600);
  const reviewFrame = () => root.querySelector('[data-sbfx-anchor="route:review"]');
  const request = await placeComment(reviewFrame()!, 600, 200, "Pinned to review");
  const commentId = `comment-${stored.length}`;
  check("the frame comment carries an element anchor", request.anchor?.type === "element", JSON.stringify(request.anchor));
  const pin = () => document.querySelector<HTMLElement>(`[data-saved-comment-pin="${commentId}"]`);
  await waitFor(() => pin() && pin()!.style.display !== "none", 4_000).catch(() => undefined);
  check(
    "the saved anchored pin is drawn at its anchor",
    pin()?.dataset.anchoredPin === "true" && near(parseFloat(pin()!.style.left), 600, 0.5) && near(parseFloat(pin()!.style.top), 200, 0.5),
    `${pin()?.style.left} ${pin()?.style.top}`,
  );

  // A pin follows its frame while the canvas pans (same animation frame).
  const panned = await moveWorldAndRead("translate(-260px, 20px) scale(0.5)", pin);
  check(
    "a pin moves 300 px left in the same frame the host moves its anchor",
    Boolean(panned) && near(parseFloat(panned!.left), 300, 0.5) && near(parseFloat(panned!.top), 200, 0.5),
    JSON.stringify(panned),
  );

  // A pin whose anchor is gone is hidden; the comment stays listed.
  await moveWorldAndRead("translate(40px, 20px) scale(0.5)", pin);
  reviewFrame()!.remove();
  document.dispatchEvent(new CustomEvent("sbfx:anchors-moved"));
  check("a pin whose anchor element is removed is hidden", pin()?.style.display === "none", pin()?.style.display);
  check(
    "the comment stays in the list",
    Boolean(document.querySelector(`.sbfx-comments-panel [data-comment-id="${commentId}"]`)),
  );

  // Moving the anchor out of the canvas element hides the pin.
  renderStory(canvasMarkup);
  document.dispatchEvent(new CustomEvent("sbfx:anchors-moved"));
  check("the pin returns when its anchor is back", pin()?.style.display !== "none", pin()?.style.display);
  const outside = await moveWorldAndRead("translate(-2000px, 20px) scale(0.5)", pin);
  check("a pin whose anchor leaves the canvas element is hidden", outside?.display === "none", JSON.stringify(outside));
  await moveWorldAndRead("translate(40px, 20px) scale(0.5)", pin);

  // A pending pin follows its anchor too.
  document.querySelector<HTMLButtonElement>(".sbfx-comments-panel__add")!.click();
  await waitFor(() => document.documentElement.dataset.sbfxCaptureMode === "true");
  clickSequence(reviewFrame()!, 650, 300);
  await waitFor(() => document.querySelector(".sbfx-comment-composer textarea"), 12_000);
  const livePin = () => document.querySelector<HTMLElement>("[data-sbfx-live-comment-pin]");
  await waitFor(() => livePin() && near(parseFloat(livePin()!.style.left), 650, 0.5), 3_000).catch(() => undefined);
  const before = livePin() ? parseFloat(livePin()!.style.left) : NaN;
  const movedDraft = await moveWorldAndRead("translate(-60px, 20px) scale(0.5)", livePin);
  check(
    "a pending anchored pin moves with its frame in the same frame",
    near(before, 650, 0.5) && Boolean(movedDraft) && near(parseFloat(movedDraft!.left), 550, 0.5),
    `${before} -> ${JSON.stringify(movedDraft)}`,
  );
  document.querySelector<HTMLElement>(".sbfx-comment-composer textarea")!.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
  );
  await waitFor(() => !document.querySelector(".sbfx-comment-composer textarea"));
  root.style.height = "";
}

const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function seedComment(id: string, view: string | undefined, extra: Record<string, unknown> = {}) {
  stored.push({
    id,
    body: {
      authorName: "Seed",
      body: `Seeded ${id}`,
      capture: { cssHeight: 400, cssWidth: 600, dataUrl: tinyPng, height: 1, mimeType: "image/png", width: 1 },
      kind: "visual-fix",
      pin: { xRatio: 0.2 + stored.length * 0.05, yRatio: 0.3 },
      story: { id: storyId, name: "Default", title: "Pages/Prototypes/Demo", ...(view ? { view } : {}) },
      ...extra,
    },
    createdAt: `2026-10-06T01:00:${String(stored.length).padStart(2, "0")}.000Z`,
    sessionId,
  });
}

async function waitForOverviewPoll() {
  const count = requestLog.filter((entry) => entry.method === "GET").length;
  await waitFor(() => requestLog.filter((entry) => entry.method === "GET").length > count, 7_000);
  await sleep(150);
}

async function viewScopedPanelScenarios() {
  stage("view-scoped-panel");
  stored.length = 0;
  seedComment("story-1", undefined);
  seedComment("story-2", "story");
  seedComment("flow-1", "ui-flow");
  seedComment("flow-2", "ui-flow");
  seedComment("flow-3", "ui-flow");
  renderStory('<div data-sbfx-view="ui-flow" style="width: 600px; height: 400px; background: rgb(30 30 34)"></div>');
  await waitForOverviewPoll();
  await waitFor(() => document.querySelector('[data-comment-view-option="story"]'), 4_000).catch(() => undefined);
  const listed = () =>
    Array.from(document.querySelectorAll<HTMLElement>(".sbfx-comments-panel__list [data-comment-id]")).map(
      (item) => item.dataset.commentId,
    );
  const allFilter = () => document.querySelector<HTMLElement>('[data-comment-filter="all"]')?.textContent;
  check(
    "the ui-flow view lists only its 3 comments",
    listed().length === 3 && listed().every((id) => id?.startsWith("flow-")),
    JSON.stringify(listed()),
  );
  check("the All count is 3", allFilter() === "All 3", allFilter() ?? "(missing)");
  const storyControl = document.querySelector<HTMLButtonElement>('[data-comment-view-option="story"]');
  check("one control reads story · 2", storyControl?.textContent === "story · 2", storyControl?.textContent ?? "(missing)");
  check(
    "pins are drawn for the listed current-view comments",
    document.querySelectorAll("[data-saved-comment-pin]").length === 3,
    String(document.querySelectorAll("[data-saved-comment-pin]").length),
  );

  // Listing another view shows no pins and sends no request.
  await waitForOverviewPoll();
  const requestsBefore = requestLog.length;
  storyControl?.click();
  await sleep(300);
  check(
    "listing the story view shows its 2 comments with the view note",
    listed().length === 2 &&
      listed().every((id) => id?.startsWith("story-")) &&
      document.querySelector("[data-comment-view-note]")?.textContent === "These comments' pins appear only in their own view.",
    `${JSON.stringify(listed())} ${document.querySelector("[data-comment-view-note]")?.textContent ?? "(no note)"}`,
  );
  check("no saved pins while another view is listed", document.querySelectorAll("[data-saved-comment-pin]").length === 0);
  check("changing the listed view sends no request", requestLog.length === requestsBefore, `${requestLog.length - requestsBefore} requests`);
  const backControl = document.querySelector<HTMLButtonElement>('[data-comment-view-option="ui-flow"]');
  check("a control leads back to ui-flow · 3", backControl?.textContent === "ui-flow · 3", backControl?.textContent ?? "(missing)");

  // A change of the current view lists that view again.
  renderStory('<div style="width: 600px; height: 400px; background: rgb(240 240 244)"></div>');
  await sleep(800);
  check(
    "a new current view (story) becomes the listed view",
    listed().length === 2 && document.querySelector('[data-comment-view-option="ui-flow"]')?.textContent === "ui-flow · 3" && !document.querySelector("[data-comment-view-note]"),
    JSON.stringify(listed()),
  );
}

async function locationScenarios() {
  stage("location");
  root.style.height = "900px";
  renderStory(canvasMarkup);
  await sleep(800);
  const reviewFrame = () => root.querySelector<HTMLElement>('[data-sbfx-anchor="route:review"]')!;
  await placeComment(reviewFrame(), 600, 200, "Frame location");
  const frameId = `comment-${stored.length}`;
  await placeComment(root.querySelector("#canvas")!, 340, 170, "Canvas location");
  const canvasId = `comment-${stored.length}`;
  const item = (id: string) => document.querySelector<HTMLElement>(`.sbfx-comments-panel [data-comment-id="${id}"]`);
  await waitFor(() => item(frameId) && item(canvasId), 4_000).catch(() => undefined);
  check(
    "the list describes a frame comment by its label",
    item(frameId)?.querySelector("[data-comment-anchor]")?.textContent === "On Review",
    item(frameId)?.querySelector("[data-comment-anchor]")?.textContent ?? "(missing)",
  );
  check(
    "the list describes a canvas comment by its nearby frames",
    item(canvasId)?.querySelector("[data-comment-anchor]")?.textContent === "Canvas near Intake, Review",
    item(canvasId)?.querySelector("[data-comment-anchor]")?.textContent ?? "(missing)",
  );
  check("no layout change before frames move", !item(canvasId)?.querySelector("[data-comment-layout-changed]"));

  // The host reveals an off-screen frame.
  const framePin = () => document.querySelector<HTMLElement>(`[data-saved-comment-pin="${frameId}"]`);
  await moveWorldAndRead("translate(-2000px, 20px) scale(0.5)", framePin);
  const showLocation = () => item(frameId)?.querySelector<HTMLButtonElement>("[data-comment-show-location]");
  await waitFor(() => showLocation(), 3_000).catch(() => undefined);
  check("an off-screen anchored comment offers Show location", Boolean(showLocation()));
  let requestDetail: any = null;
  const host = (event: Event) => {
    requestDetail = (event as CustomEvent).detail;
    event.preventDefault();
    worldLayer().style.transform = "translate(40px, 20px) scale(0.5)";
    worldLayer().dispatchEvent(new CustomEvent("sbfx:anchors-moved", { bubbles: true }));
  };
  document.addEventListener("sbfx:reveal-anchor", host);
  showLocation()?.click();
  await nextFrame();
  await nextFrame();
  check(
    "the reveal request carries the comment id, view and anchor",
    requestDetail?.commentId === frameId && requestDetail?.view === "story" && requestDetail?.anchor?.id === "route:review",
    JSON.stringify(requestDetail),
  );
  check(
    "a handled request selects the comment and shows its pin",
    item(frameId)?.getAttribute("aria-current") === "true" && framePin()?.style.display !== "none",
    `${item(frameId)?.getAttribute("aria-current")} ${framePin()?.style.display}`,
  );
  document.removeEventListener("sbfx:reveal-anchor", host);

  // Nobody handles the request.
  await moveWorldAndRead("translate(-2000px, 20px) scale(0.5)", framePin);
  await waitFor(() => showLocation(), 3_000).catch(() => undefined);
  showLocation()?.click();
  await sleep(50);
  check(
    "an unhandled request shows that the location is not available",
    item(frameId)?.querySelector("[data-comment-location-notice]")?.textContent === "This location is not available in this view.",
    item(frameId)?.querySelector("[data-comment-location-notice]")?.textContent ?? "(missing)",
  );
  await moveWorldAndRead("translate(40px, 20px) scale(0.5)", framePin);

  // A nearby frame moved after commenting.
  reviewFrame().style.left = "1200px";
  await waitForOverviewPoll();
  await waitFor(() => item(canvasId)?.querySelector("[data-comment-layout-changed]"), 3_000).catch(() => undefined);
  check(
    "a moved nearby frame marks the canvas comment",
    item(canvasId)?.querySelector("[data-comment-layout-changed]")?.textContent === "Layout changed since this comment",
  );
  const canvasPin = document.querySelector<HTMLElement>(`[data-saved-comment-pin="${canvasId}"]`);
  check(
    "the canvas pin stays at world (600, 300)",
    near(parseFloat(canvasPin?.style.left ?? ""), 340, 0.5) && near(parseFloat(canvasPin?.style.top ?? ""), 170, 0.5),
    `${canvasPin?.style.left} ${canvasPin?.style.top}`,
  );
  root.style.height = "";
}

async function samplePixel(dataUrl: string, xRatio: number, yRatio: number) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  const x = Math.min(canvas.width - 1, Math.max(0, Math.round(xRatio * canvas.width)));
  const y = Math.min(canvas.height - 1, Math.max(0, Math.round(yRatio * canvas.height)));
  return Array.from(context.getImageData(x, y, 1, 1).data);
}

const isMagenta = ([r, g, b]: number[]) => r > 200 && g < 90 && b > 70 && b < 190;

async function framedElement(src: string) {
  renderStory(`
    <div id="framed" data-sbfx-anchor="route:framed" data-sbfx-anchor-label="Framed" style="position: absolute; left: 100px; top: 100px; width: 375px; height: 300px; background: rgb(60 60 66)">
      <iframe src="${src}" style="display: block; width: 375px; height: 300px; border: 0; pointer-events: none"></iframe>
    </div>`);
  const iframe = root.querySelector<HTMLIFrameElement>("#framed iframe")!;
  await waitFor(() => iframe.contentDocument?.documentElement.dataset.fixtureFrameReady === "true", 8_000);
  await sleep(300);
  return root.querySelector<HTMLElement>("#framed")!;
}

async function anchoredCaptureScenarios() {
  stage("anchored-capture");
  root.style.height = "900px";

  // A frame comment captures the embedded route page through its hook.
  const framed = await framedElement("/frame.html");
  const framedRequest = await placeComment(framed, 200, 150, "Embedded page comment");
  check(
    "the frame comment's screenshot pin is relative to the embedded page",
    near(framedRequest.pin?.xRatio, 100 / 375, 0.005) && near(framedRequest.pin?.yRatio, 50 / 300, 0.005),
    JSON.stringify(framedRequest.pin),
  );
  const framedPixel = await samplePixel(framedRequest.capture.dataUrl, framedRequest.pin.xRatio, framedRequest.pin.yRatio);
  check("the screenshot shows the embedded route content", isMagenta(framedPixel), JSON.stringify(framedPixel));
  check(
    "the embedded capture keeps the page's own size",
    near(framedRequest.capture.cssWidth, 375, 1) && near(framedRequest.capture.cssHeight, 300, 1),
    `${framedRequest.capture.cssWidth} x ${framedRequest.capture.cssHeight}`,
  );

  // A failing hook falls back to the anchor element without iframe content.
  const failing = await framedElement("/frame.html?fail=1");
  const before = posted.length;
  const fallbackRequest = await placeComment(failing, 200, 150, "Fallback capture");
  const fallbackPixel = await samplePixel(fallbackRequest.capture.dataUrl, fallbackRequest.pin.xRatio, fallbackRequest.pin.yRatio);
  check(
    "a failed embedded capture falls back to the anchor element and still saves",
    posted.length === before + 1 && !isMagenta(fallbackPixel) && fallbackPixel[0] < 120,
    JSON.stringify(fallbackPixel),
  );

  // A canvas comment captures the canvas with the visible frames' pages drawn
  // in; a frame whose capture fails stays empty.
  renderStory(canvasMarkup);
  const intake = root.querySelector<HTMLElement>('[data-sbfx-anchor="route:intake"]')!;
  intake.innerHTML = '<iframe src="/frame.html" style="display: block; width: 377px; height: 300px; border: 0; pointer-events: none"></iframe>';
  const review = root.querySelector<HTMLElement>('[data-sbfx-anchor="route:review"]')!;
  review.innerHTML = '<iframe src="/frame.html?fail=1" style="display: block; width: 377px; height: 300px; border: 0; pointer-events: none"></iframe>';
  await waitFor(
    () =>
      [intake, review].every(
        (frameHost) => frameHost.querySelector("iframe")?.contentDocument?.documentElement.dataset.fixtureFrameReady === "true",
      ),
    8_000,
  );
  await sleep(300);
  const canvasElement = root.querySelector<HTMLElement>("#canvas")!;
  // The open workspace narrows the Story root, so ratios use the measured canvas.
  const canvasRect = canvasElement.getBoundingClientRect();
  const canvasStarted = performance.now();
  const canvasRequest = await placeComment(canvasElement, 340, 170, "Canvas capture");
  check("measure: canvas comment with 2 frames saved", true, `${Math.round(performance.now() - canvasStarted)} ms`);
  const sampleCanvas = (x: number, y: number) =>
    samplePixel(canvasRequest.capture.dataUrl, (x - canvasRect.left) / canvasRect.width, (y - canvasRect.top) / canvasRect.height);
  // Intake's iframe covers client (40..228, 20..170), review's (520..708, 20..170).
  const intakeArea = await sampleCanvas(120, 80);
  const reviewArea = await sampleCanvas(600, 80);
  check(
    "a canvas comment's screenshot shows the visible frames' pages",
    canvasRequest.anchor?.type === "canvas" && isMagenta(intakeArea),
    JSON.stringify(intakeArea),
  );
  check(
    "a frame whose capture fails stays empty while the canvas comment is saved",
    Boolean(canvasRequest.capture?.dataUrl) && !isMagenta(reviewArea),
    JSON.stringify(reviewArea),
  );
  check(
    "a canvas comment's screenshot pin is relative to the canvas",
    near(canvasRequest.pin?.xRatio, (340 - canvasRect.left) / canvasRect.width, 0.005) &&
      near(canvasRequest.pin?.yRatio, (170 - canvasRect.top) / canvasRect.height, 0.005),
    JSON.stringify({ canvasRect, pin: canvasRequest.pin }),
  );
  root.style.height = "";
}

async function captureInputScenarios() {
  stage("capture-input");
  renderStory('<div id="page-target" style="width: 600px; height: 400px; background: rgb(200 200 210)"></div>');
  await sleep(600);
  const pageTarget = root.querySelector<HTMLElement>("#page-target")!;
  const received: Record<string, number> = {};
  for (const type of ["pointerdown", "pointerup", "click", "dblclick", "contextmenu"]) {
    pageTarget.addEventListener(type, () => {
      received[type] = (received[type] ?? 0) + 1;
    });
  }
  const point = centerOf(pageTarget);

  // A quick double-click places one pin and reaches nothing else.
  document.querySelector<HTMLButtonElement>(".sbfx-comments-panel__add")!.click();
  await waitFor(() => document.documentElement.dataset.sbfxCaptureMode === "true");
  clickSequence(pageTarget, point.x, point.y);
  await sleep(120);
  pointer(pageTarget, "pointerdown", point.x, point.y);
  pointer(pageTarget, "pointerup", point.x, point.y);
  pointer(pageTarget, "click", point.x, point.y);
  pointer(pageTarget, "dblclick", point.x, point.y);
  await waitFor(() => document.querySelector(".sbfx-comment-composer textarea"), 12_000);
  await sleep(500);
  check(
    "a double-click within 300 ms reaches the page with neither press nor dblclick",
    !received.pointerdown && !received.click && !received.dblclick,
    JSON.stringify(received),
  );
  check("one pending pin is placed", document.querySelectorAll("[data-sbfx-live-comment-pin]").length === 1);

  // Escape closes the composer only.
  const pageKeys: string[] = [];
  const documentListener = (event: KeyboardEvent) => pageKeys.push(`document:${event.key}`);
  const windowListener = (event: KeyboardEvent) => pageKeys.push(`window:${event.key}`);
  document.addEventListener("keydown", documentListener);
  window.addEventListener("keydown", windowListener);
  document.querySelector<HTMLElement>(".sbfx-comment-composer textarea")!.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
  );
  await waitFor(() => !document.querySelector(".sbfx-comment-composer textarea"), 3_000).catch(() => undefined);
  check(
    "Escape closes the composer and no bubble-phase page listener receives it",
    !document.querySelector(".sbfx-comment-composer textarea") && pageKeys.length === 0,
    JSON.stringify(pageKeys),
  );

  // A middle-button press reaches the page and keeps the capture armed.
  for (const key of Object.keys(received)) delete received[key];
  document.querySelector<HTMLButtonElement>(".sbfx-comments-panel__add")!.click();
  await waitFor(() => document.documentElement.dataset.sbfxCaptureMode === "true");
  pointer(pageTarget, "pointerdown", point.x, point.y, 1);
  pointer(pageTarget, "pointerup", point.x, point.y, 1);
  await sleep(100);
  check(
    "a middle-button press reaches the page and the capture stays armed",
    received.pointerdown === 1 && document.documentElement.dataset.sbfxCaptureMode === "true",
    `${JSON.stringify(received)} ${document.documentElement.dataset.sbfxCaptureMode}`,
  );
  document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
  await sleep(100);
  check(
    "Escape cancels the armed capture without reaching page listeners",
    document.documentElement.dataset.sbfxCaptureMode !== "true" && pageKeys.length === 0,
    JSON.stringify(pageKeys),
  );
  document.removeEventListener("keydown", documentListener);
  window.removeEventListener("keydown", windowListener);
}

// The location canvas plus route:handoff at world (1400, 0).
const relocationMarkup = canvasMarkup.replace(
  '<div data-sbfx-anchor="route:review"',
  '<div data-sbfx-anchor="route:handoff" data-sbfx-anchor-label="Handoff" style="position: absolute; left: 1400px; top: 0; width: 377px; height: 878px; background: rgb(90 90 96)"></div><div data-sbfx-anchor="route:review"',
);

const savedPin = (id: string) => document.querySelector<HTMLElement>(`[data-saved-comment-pin="${id}"]`);

async function dragPin(
  element: HTMLElement,
  dx: number,
  dy: number,
  options: { beforeRelease?: () => void; offset?: { x: number; y: number }; steps?: number } = {},
) {
  const center = centerOf(element);
  const start = { x: center.x + (options.offset?.x ?? 0), y: center.y + (options.offset?.y ?? 0) };
  const steps = options.steps ?? 6;
  pointer(element, "pointerdown", start.x, start.y);
  for (let index = 1; index <= steps; index += 1) {
    pointer(element, "pointermove", start.x + (dx * index) / steps, start.y + (dy * index) / steps);
    await nextFrame();
  }
  options.beforeRelease?.();
  pointer(element, "pointerup", start.x + dx, start.y + dy);
  pointer(element, "click", start.x + dx, start.y + dy);
  return center;
}

async function settleMove(before: number) {
  await waitFor(() => patchLog.length > before, 4_000);
  await waitFor(() => !document.querySelector("[data-saved-comment-pin][data-saving]"), 4_000);
  await nextFrame();
}

async function showSeededPins(ids: string[]) {
  await waitForOverviewPoll();
  if (!ids.every((id) => savedPin(id))) {
    const toggle = document.querySelector<HTMLButtonElement>("[data-meeting-view]");
    if (toggle?.getAttribute("aria-checked") !== "true") toggle?.click();
  }
  await waitFor(() => ids.every((id) => savedPin(id) && savedPin(id)!.style.display !== "none"), 6_000);
}

async function relocationScenarios() {
  stage("relocation");
  root.style.height = "900px";
  stored.length = 0;
  seedComment("rel-frame", undefined, {
    anchor: { type: "element", id: "route:review", label: "Review", x: 100, y: 200, width: 377, height: 878 },
    pin: { xRatio: 100 / 377, yRatio: 200 / 878 },
  });
  seedComment("rel-line", undefined, {
    anchor: { type: "path", id: "edge:intake->review", label: "Intake → Review", t: 0.5 },
  });
  renderStory(relocationMarkup);
  await showSeededPins(["rel-frame", "rel-line"]);
  const near1 = (a: { x: number; y: number }, b: { x: number; y: number }, tolerance = 1.5) =>
    Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
  const storedBody = (id: string) => stored.find((entry) => entry.id === id)!.body;

  // Within the same frame: one move request for the same element anchor.
  // During the drag the pin keeps the press offset, shows no card, and the
  // frame beneath it receives no pointer event.
  let before = patchLog.length;
  const reviewFrame = root.querySelector('[data-sbfx-anchor="route:review"]')!;
  const frameEvents: string[] = [];
  const recordFrameEvent = (event: Event) => frameEvents.push(event.type);
  const frameEventTypes = ["pointerdown", "pointermove", "pointerup", "click"];
  frameEventTypes.forEach((type) => reviewFrame.addEventListener(type, recordFrameEvent));
  let midDrag: { card: boolean; center: { x: number; y: number } } | null = null;
  const sameStart = await dragPin(savedPin("rel-frame")!, 60, 0, {
    beforeRelease: () => {
      midDrag = {
        card: Boolean(document.querySelector("[data-saved-pin-card]")),
        center: centerOf(savedPin("rel-frame")!),
      };
    },
    offset: { x: 3, y: -2 },
  });
  frameEventTypes.forEach((type) => reviewFrame.removeEventListener(type, recordFrameEvent));
  await settleMove(before);
  check(
    "during a drag the pin follows the pointer with the press offset, shows no card, and the frame beneath gets no pointer event",
    Boolean(midDrag) &&
      !midDrag!.card &&
      near1(midDrag!.center, { x: sameStart.x + 60, y: sameStart.y }, 0.5) &&
      frameEvents.length === 0,
    JSON.stringify({ frameEvents, midDrag, sameStart }),
  );
  check(
    "dragging a frame pin within its frame sends one move with the same element anchor",
    patchLog.length === before + 1 &&
      patchLog.at(-1)?.anchor?.type === "element" &&
      patchLog.at(-1)?.anchor?.id === "route:review" &&
      !("pin" in (patchLog.at(-1) ?? {})),
    JSON.stringify(patchLog.at(-1)),
  );
  check(
    "the moved pin stays where it was released and is not marked moved",
    near1(centerOf(savedPin("rel-frame")!), { x: sameStart.x + 60, y: sameStart.y }) && !storedBody("rel-frame").movedAt,
    JSON.stringify({ center: centerOf(savedPin("rel-frame")!), expected: { x: sameStart.x + 60, y: sameStart.y } }),
  );

  // A short press still selects and sends nothing.
  before = patchLog.length;
  const pressPoint = centerOf(savedPin("rel-frame")!);
  pointer(savedPin("rel-frame")!, "pointerdown", pressPoint.x, pressPoint.y);
  pointer(savedPin("rel-frame")!, "pointermove", pressPoint.x + 3, pressPoint.y);
  pointer(savedPin("rel-frame")!, "pointerup", pressPoint.x + 3, pressPoint.y);
  pointer(savedPin("rel-frame")!, "click", pressPoint.x + 3, pressPoint.y);
  await sleep(150);
  check(
    "a press that moves 3 pixels selects the comment and sends no request",
    patchLog.length === before && savedPin("rel-frame")!.dataset.selected === "true" && near1(centerOf(savedPin("rel-frame")!), pressPoint, 0.5),
    JSON.stringify({ patches: patchLog.length - before, selected: savedPin("rel-frame")!.dataset.selected }),
  );

  // Escape during a drag puts the pin back.
  before = patchLog.length;
  let documentEscapes = 0;
  const countEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") documentEscapes += 1;
  };
  document.addEventListener("keydown", countEscape);
  const escapeStart = await dragPin(savedPin("rel-frame")!, 80, 0, {
    beforeRelease: () =>
      document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" })),
  });
  document.removeEventListener("keydown", countEscape);
  await sleep(150);
  check(
    "Escape during a drag returns the pin, sends nothing and reaches no page listener",
    patchLog.length === before && near1(centerOf(savedPin("rel-frame")!), escapeStart, 0.5) && documentEscapes === 0,
    JSON.stringify({ center: centerOf(savedPin("rel-frame")!), documentEscapes, escapeStart, patches: patchLog.length - before }),
  );

  // While placing a new comment, saved pins do not move.
  before = patchLog.length;
  document.querySelector<HTMLButtonElement>(".sbfx-comments-panel__add")!.click();
  await waitFor(() => document.documentElement.dataset.sbfxCaptureMode === "true");
  const passiveStart = centerOf(savedPin("rel-frame")!);
  pointer(savedPin("rel-frame")!, "pointerdown", passiveStart.x, passiveStart.y);
  pointer(savedPin("rel-frame")!, "pointermove", passiveStart.x + 40, passiveStart.y);
  pointer(savedPin("rel-frame")!, "pointerup", passiveStart.x + 40, passiveStart.y);
  await sleep(100);
  check(
    "a saved pin cannot be dragged while a new comment is being placed",
    patchLog.length === before && near1(centerOf(savedPin("rel-frame")!), passiveStart, 0.5) && savedPin("rel-frame")!.dataset.passive === "true",
    JSON.stringify({ center: centerOf(savedPin("rel-frame")!), passiveStart }),
  );
  document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
  await waitFor(() => document.documentElement.dataset.sbfxCaptureMode !== "true");

  // A failed move puts the pin back and says why.
  before = patchLog.length;
  failNextPatch = true;
  const failStart = await dragPin(savedPin("rel-frame")!, 40, 0);
  await settleMove(before);
  check(
    "a failed move returns the pin and shows the error",
    near1(centerOf(savedPin("rel-frame")!), failStart) &&
      (document.querySelector('[data-pin-notice="error"]')?.textContent ?? "").startsWith("Couldn't move the comment."),
    JSON.stringify({ center: centerOf(savedPin("rel-frame")!), failStart, notice: document.querySelector("[data-pin-notice]")?.textContent }),
  );

  // Onto another frame: the anchor changes and the comment is marked moved.
  before = patchLog.length;
  const crossStart = centerOf(savedPin("rel-frame")!);
  const intakeCenter = centerOf(root.querySelector('[data-sbfx-anchor="route:intake"]')!);
  await dragPin(savedPin("rel-frame")!, intakeCenter.x - crossStart.x, 0);
  await settleMove(before);
  check(
    "dragging a frame pin onto another frame sends that frame's element anchor and marks the move",
    patchLog.at(-1)?.anchor?.type === "element" && patchLog.at(-1)?.anchor?.id === "route:intake" && Boolean(storedBody("rel-frame").movedAt),
    JSON.stringify({ patch: patchLog.at(-1), movedAt: storedBody("rel-frame").movedAt }),
  );
  check(
    "the pin moved to another frame is placed from its new anchor",
    near1(centerOf(savedPin("rel-frame")!), { x: intakeCenter.x, y: crossStart.y }),
    JSON.stringify({ center: centerOf(savedPin("rel-frame")!), expected: { x: intakeCenter.x, y: crossStart.y } }),
  );

  // The moved comment says so in its list item and pin card.
  await waitFor(() => document.querySelector('.sbfx-comments-panel [data-comment-id="rel-frame"] [data-comment-moved]'), 3_000).catch(() => undefined);
  savedPin("rel-frame")!.dispatchEvent(new MouseEvent("mouseenter"));
  await waitFor(() => document.querySelector('[data-saved-pin-card="rel-frame"]'), 3_000).catch(() => undefined);
  check(
    "a comment moved to another frame shows the moved note in its list item and pin card",
    document.querySelector('.sbfx-comments-panel [data-comment-id="rel-frame"] [data-comment-moved]')?.textContent === "Moved since the screenshot" &&
      document.querySelector('[data-saved-pin-card="rel-frame"] [data-pin-card-moved]')?.textContent === "Moved since the screenshot",
    JSON.stringify({
      card: document.querySelector('[data-saved-pin-card="rel-frame"]')?.textContent,
      list: document.querySelector('.sbfx-comments-panel [data-comment-id="rel-frame"]')?.textContent,
    }),
  );
  savedPin("rel-frame")!.dispatchEvent(new MouseEvent("mouseleave"));
  check(
    "a comment moved within its frame shows no moved note",
    !document.querySelector('.sbfx-comments-panel [data-comment-id="rel-line"] [data-comment-moved]'),
  );

  // A line comment dragged onto blank canvas becomes a canvas comment.
  before = patchLog.length;
  await dragPin(savedPin("rel-line")!, 0, 120);
  await settleMove(before);
  check(
    "dragging a line comment's pin onto blank canvas sends a canvas anchor",
    patchLog.at(-1)?.anchor?.type === "canvas" && Boolean(storedBody("rel-line").movedAt),
    JSON.stringify(patchLog.at(-1)),
  );

  // An anchored comment dropped where nothing resolves goes back.
  stored.length = 0;
  root.style.height = "";
  renderStory(
    '<div style="position: relative; width: 800px; height: 600px; background: rgb(240 240 244)"><div data-sbfx-anchor="route:solo" data-sbfx-anchor-label="Solo" style="position: absolute; left: 0; top: 0; width: 300px; height: 400px; background: rgb(90 90 96)"></div></div>',
  );
  seedComment("rel-solo", undefined, {
    anchor: { type: "element", id: "route:solo", label: "Solo", x: 100, y: 100, width: 300, height: 400 },
  });
  await showSeededPins(["rel-solo"]);
  before = patchLog.length;
  const soloStart = await dragPin(savedPin("rel-solo")!, 400, 0);
  await sleep(200);
  check(
    "an anchored comment dropped outside every anchor returns without a request",
    patchLog.length === before &&
      near1(centerOf(savedPin("rel-solo")!), soloStart, 0.5) &&
      document.querySelector('[data-pin-notice="error"]')?.textContent === "Drop the pin on a frame, a line or the canvas.",
    JSON.stringify({ center: centerOf(savedPin("rel-solo")!), notice: document.querySelector("[data-pin-notice]")?.textContent, soloStart }),
  );

  // A canvas comment dropped on host chrome over the canvas, which is neither
  // an anchor nor canvas content, goes back too.
  stored.length = 0;
  root.style.height = "900px";
  renderStory(
    `${canvasMarkup}<div id="toolbar" style="position: absolute; left: 0; top: 0; width: 320px; height: 64px; z-index: 1; background: rgb(250 250 252)"></div>`,
  );
  seedComment("rel-canvas", undefined, { anchor: { type: "canvas", x: 700, y: 600 } });
  await showSeededPins(["rel-canvas"]);
  before = patchLog.length;
  const canvasPinStart = centerOf(savedPin("rel-canvas")!);
  const toolbarCenter = centerOf(root.querySelector("#toolbar")!);
  await dragPin(savedPin("rel-canvas")!, toolbarCenter.x - canvasPinStart.x, toolbarCenter.y - canvasPinStart.y);
  await sleep(200);
  check(
    "a canvas comment dropped where neither an anchor nor canvas content resolves returns without a request",
    patchLog.length === before &&
      near1(centerOf(savedPin("rel-canvas")!), canvasPinStart, 0.5) &&
      document.querySelector('[data-pin-notice="error"]')?.textContent === "Drop the pin on a frame, a line or the canvas.",
    JSON.stringify({ canvasPinStart, center: centerOf(savedPin("rel-canvas")!), notice: document.querySelector("[data-pin-notice]")?.textContent }),
  );
  root.style.height = "";
}

async function keyboardRelocationScenarios() {
  stage("keyboard-relocation");
  root.style.height = "900px";
  stored.length = 0;
  seedComment("key-frame", undefined, {
    anchor: { type: "element", id: "route:review", label: "Review", x: 100, y: 200, width: 377, height: 878 },
    pin: { xRatio: 100 / 377, yRatio: 200 / 878 },
  });
  renderStory(relocationMarkup);
  await showSeededPins(["key-frame"]);
  const press = (key: string, shiftKey = false) =>
    savedPin("key-frame")!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, shiftKey }));
  const patchTimes = () => requestLog.filter((entry) => entry.method === "PATCH").map((entry) => entry.at);

  // Three ArrowRight and one Shift + ArrowDown: one save after the keys rest.
  savedPin("key-frame")!.focus();
  let before = patchLog.length;
  const keyStart = centerOf(savedPin("key-frame")!);
  press("ArrowRight");
  press("ArrowRight");
  press("ArrowRight");
  press("ArrowDown", true);
  const lastKeyAt = performance.now();
  const movedBy = { x: centerOf(savedPin("key-frame")!).x - keyStart.x, y: centerOf(savedPin("key-frame")!).y - keyStart.y };
  await sleep(300);
  const patchesAt300 = patchLog.length - before;
  await settleMove(before);
  await sleep(700);
  const savedAt = patchTimes().at(-1) ?? 0;
  check(
    "arrow keys move a focused pin 1 pixel (10 with Shift) and save once after the keys rest",
    Math.abs(movedBy.x - 3) <= 0.01 &&
      Math.abs(movedBy.y - 10) <= 0.01 &&
      patchesAt300 === 0 &&
      patchLog.length === before + 1 &&
      savedAt - lastKeyAt >= 550 &&
      savedAt - lastKeyAt <= 1_000 &&
      patchLog.at(-1)?.anchor?.id === "route:review",
    JSON.stringify({ delay: Math.round(savedAt - lastKeyAt), movedBy, patches: patchLog.length - before, patchesAt300 }),
  );

  // Leaving the pin saves a pending move at once.
  savedPin("key-frame")!.focus();
  before = patchLog.length;
  press("ArrowLeft");
  const blurAt = performance.now();
  savedPin("key-frame")!.blur();
  await settleMove(before);
  check(
    "a pending arrow-key move is saved as soon as the pin loses focus",
    patchLog.length === before + 1 && (patchTimes().at(-1) ?? 0) - blurAt < 300,
    JSON.stringify({ delay: Math.round((patchTimes().at(-1) ?? 0) - blurAt) }),
  );

  // Escape before the save puts the pin back without a request.
  savedPin("key-frame")!.focus();
  before = patchLog.length;
  const escapeStart = centerOf(savedPin("key-frame")!);
  press("ArrowUp");
  press("ArrowUp");
  press("Escape");
  await sleep(900);
  check(
    "Escape before an arrow-key move is saved returns the pin without a request",
    patchLog.length === before &&
      Math.abs(centerOf(savedPin("key-frame")!).x - escapeStart.x) <= 0.5 &&
      Math.abs(centerOf(savedPin("key-frame")!).y - escapeStart.y) <= 0.5,
    JSON.stringify({ center: centerOf(savedPin("key-frame")!), escapeStart, patches: patchLog.length - before }),
  );
  savedPin("key-frame")!.blur();
  root.style.height = "";
}

async function undoScenarios() {
  stage("undo");
  root.style.height = "900px";
  stored.length = 0;
  const reviewAnchor = { type: "element", id: "route:review", label: "Review", x: 100, y: 200, width: 377, height: 878 };
  seedComment("undo-frame", undefined, { anchor: reviewAnchor, pin: { xRatio: 100 / 377, yRatio: 200 / 878 } });
  renderStory(relocationMarkup);
  await showSeededPins(["undo-frame"]);
  const storedBody = () => stored.find((entry) => entry.id === "undo-frame")!.body;
  const undoButton = () => document.querySelector<HTMLButtonElement>('[data-pin-undo="undo-frame"]');
  const intakeCenter = () => centerOf(root.querySelector('[data-sbfx-anchor="route:intake"]')!);
  const handoffCenter = () => centerOf(root.querySelector('[data-sbfx-anchor="route:handoff"]')!);

  // Move to another frame, then Undo.
  const originalCenter = centerOf(savedPin("undo-frame")!);
  const scrollBeforeNotice = document.querySelector(".sbfx-comments-panel__scroll");
  let before = patchLog.length;
  await dragPin(savedPin("undo-frame")!, intakeCenter().x - originalCenter.x, 0);
  await settleMove(before);
  await waitFor(() => undoButton());
  const noticeText = document.querySelector('[data-pin-notice="info"]')?.textContent ?? "";
  check(
    "the move notice sits outside the scrolling comment list, which stays the same element",
    Boolean(document.querySelector("[data-pin-notice]")) &&
      !document.querySelector("[data-pin-notice]")!.closest(".sbfx-comments-panel__scroll") &&
      Boolean(document.querySelector("[data-pin-notice]")!.closest(".sbfx-comments-panel")) &&
      Boolean(scrollBeforeNotice) &&
      document.querySelector(".sbfx-comments-panel__scroll") === scrollBeforeNotice,
  );
  before = patchLog.length;
  undoButton()!.click();
  await waitFor(() => patchLog.length > before);
  await waitForOverviewPoll().catch(() => undefined);
  await waitFor(() => Math.abs(centerOf(savedPin("undo-frame")!).x - originalCenter.x) <= 1.5, 4_000).catch(() => undefined);
  check(
    "Undo sends one restore with the location before the move and the pin returns",
    noticeText.startsWith("Comment moved.") &&
      patchLog.length === before + 1 &&
      JSON.stringify(patchLog.at(-1)?.anchor) === JSON.stringify(reviewAnchor) &&
      patchLog.at(-1)?.movedAt === null &&
      Boolean(patchLog.at(-1)?.pin) &&
      !storedBody().movedAt &&
      Math.abs(centerOf(savedPin("undo-frame")!).x - originalCenter.x) <= 1.5 &&
      !document.querySelector("[data-pin-notice]"),
    JSON.stringify({ center: centerOf(savedPin("undo-frame")!), noticeText, originalCenter, patch: patchLog.at(-1) }),
  );

  // Two moves: Undo restores only the second.
  before = patchLog.length;
  await dragPin(savedPin("undo-frame")!, intakeCenter().x - centerOf(savedPin("undo-frame")!).x, 0);
  await settleMove(before);
  const afterFirst = JSON.parse(JSON.stringify({ anchor: storedBody().anchor, movedAt: storedBody().movedAt, pin: storedBody().pin }));
  before = patchLog.length;
  await dragPin(savedPin("undo-frame")!, handoffCenter().x - centerOf(savedPin("undo-frame")!).x, 0);
  await settleMove(before);
  await waitFor(() => undoButton());
  before = patchLog.length;
  undoButton()!.click();
  await waitFor(() => patchLog.length > before);
  check(
    "after two moves Undo restores the location after the first move",
    JSON.stringify(patchLog.at(-1)?.anchor) === JSON.stringify(afterFirst.anchor) &&
      patchLog.at(-1)?.movedAt === afterFirst.movedAt &&
      storedBody().anchor?.id === "route:intake",
    JSON.stringify({ afterFirst, patch: patchLog.at(-1) }),
  );

  // A failed Undo says why.
  before = patchLog.length;
  await waitForOverviewPoll().catch(() => undefined);
  await dragPin(savedPin("undo-frame")!, handoffCenter().x - centerOf(savedPin("undo-frame")!).x, 0);
  await settleMove(before);
  await waitFor(() => undoButton());
  failNextPatch = true;
  before = patchLog.length;
  undoButton()!.click();
  await waitFor(() => patchLog.length > before);
  await waitFor(() => document.querySelector('[data-pin-notice="error"]'), 3_000).catch(() => undefined);
  check(
    "a failed Undo shows the error",
    (document.querySelector('[data-pin-notice="error"]')?.textContent ?? "").startsWith("Couldn't move the comment."),
    document.querySelector("[data-pin-notice]")?.textContent ?? "(no notice)",
  );

  // The notice expires after 5000 ms and the move stays.
  before = patchLog.length;
  await dragPin(savedPin("undo-frame")!, intakeCenter().x - centerOf(savedPin("undo-frame")!).x, 0);
  await settleMove(before);
  await waitFor(() => undoButton());
  await sleep(5_300);
  check(
    "the Undo notice disappears after 5000 ms and the move stays stored",
    !undoButton() && !document.querySelector('[data-pin-notice="info"]') && storedBody().anchor?.id === "route:intake",
    JSON.stringify({ anchor: storedBody().anchor, notice: document.querySelector("[data-pin-notice]")?.textContent }),
  );
  root.style.height = "";
}

async function editPanelScenarios() {
  stage("edit-panel");
  // Full-width Story root, so pins can sit anywhere in the 1280 pixel viewport.
  root.style.height = "900px";
  root.style.maxInlineSize = "none";
  stored.length = 0;
  seedComment("edit-a", undefined, { pin: { xRatio: 200 / 1280, yRatio: 0.4 } });
  seedComment("edit-b", undefined, { pin: { xRatio: 1100 / 1280, yRatio: 0.4 } });
  renderStory('<div style="width: 100%; height: 900px; background: rgb(236 236 240)"></div>');
  await showSeededPins(["edit-a", "edit-b"]);
  const editButton = (id: string) =>
    document.querySelector<HTMLButtonElement>(`.sbfx-comments-panel [data-comment-id="${id}"] button[aria-label="Edit comment"]`);
  const editPanel = (id: string) => document.querySelector<HTMLElement>(`[data-comment-edit-panel="${id}"]`);
  const ordinalOf = (id: string) => stored.findIndex((entry) => entry.id === id) + 1;

  editButton("edit-a")!.click();
  await waitFor(() => editPanel("edit-a"));
  await nextFrame();
  await nextFrame();
  const rectA = editPanel("edit-a")!.getBoundingClientRect();
  check(
    "Edit opens a non-modal panel beside a displayed pin (pin x 200: 224 to 544)",
    Math.abs(rectA.left - 224) <= 1 &&
      Math.abs(rectA.right - 544) <= 1 &&
      !document.querySelector("[data-comment-edit-modal]") &&
      editPanel("edit-a")!.getAttribute("role") === "dialog" &&
      !editPanel("edit-a")!.hasAttribute("aria-modal") &&
      editPanel("edit-a")!.getAttribute("aria-label") === `Edit comment ${ordinalOf("edit-a")}` &&
      document.activeElement === editPanel("edit-a")!.querySelector("textarea"),
    JSON.stringify({ label: editPanel("edit-a")!.getAttribute("aria-label"), left: rectA.left, right: rectA.right }),
  );
  check(
    "the edit panel shows the screenshot, Comment type, the body, Cancel and Save changes in that order",
    Array.from(
      editPanel("edit-a")!.querySelectorAll(
        "[data-comment-edit-panel-preview], [data-comment-edit-kind], textarea, [data-comment-edit-cancel], [data-comment-edit-save]",
      ),
    )
      .map((element) =>
        element.matches("[data-comment-edit-panel-preview]")
          ? "preview"
          : element.matches("[data-comment-edit-kind]")
            ? "kind"
            : element.matches("textarea")
              ? "body"
              : element.textContent,
      )
      .join("|") === "preview|kind|body|Cancel|Save changes",
  );

  // A press outside does not close it; Escape does, without a request.
  pointer(root, "pointerdown", 600, 700);
  pointer(root, "pointerup", 600, 700);
  pointer(root, "click", 600, 700);
  await sleep(100);
  const stillOpen = Boolean(editPanel("edit-a"));
  let before = patchLog.length;
  editPanel("edit-a")!.querySelector("textarea")!.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
  );
  await waitFor(() => !editPanel("edit-a"));
  await nextFrame();
  await nextFrame();
  check(
    "a press outside keeps the edit panel; Escape closes it without a request and returns focus to Edit",
    stillOpen && patchLog.length === before && document.activeElement === editButton("edit-a"),
    JSON.stringify({ active: document.activeElement?.outerHTML.slice(0, 80), stillOpen }),
  );

  // Near the inline-end edge the panel flips to the pin's inline-start side.
  editButton("edit-b")!.click();
  await waitFor(() => editPanel("edit-b"));
  await nextFrame();
  const rectB = editPanel("edit-b")!.getBoundingClientRect();
  check(
    "near the inline-end edge the edit panel flips (pin x 1100: 756 to 1076)",
    Math.abs(rectB.left - 756) <= 1 && Math.abs(rectB.right - 1076) <= 1,
    JSON.stringify({ left: rectB.left, right: rectB.right }),
  );

  // A failed save keeps the panel open with its draft and an error.
  setNativeValue(editPanel("edit-b")!.querySelector("textarea")!, "Draft that fails to save");
  await nextFrame();
  failNextPatch = true;
  before = patchLog.length;
  editPanel("edit-b")!.querySelector<HTMLButtonElement>("[data-comment-edit-save]")!.click();
  await waitFor(() => patchLog.length > before);
  await waitFor(() => editPanel("edit-b")?.querySelector(".sbfx-review__error"), 3_000).catch(() => undefined);
  check(
    "a failed save in the edit panel keeps it open with the draft and a visible error",
    Boolean(editPanel("edit-b")) &&
      editPanel("edit-b")!.querySelector("textarea")!.value === "Draft that fails to save" &&
      Boolean(editPanel("edit-b")!.querySelector(".sbfx-review__error")?.textContent?.includes("Simulated validation failure")) &&
      stored.find((entry) => entry.id === "edit-b")!.body.body === "Seeded edit-b",
    JSON.stringify({
      error: editPanel("edit-b")?.querySelector(".sbfx-review__error")?.textContent ?? null,
      open: Boolean(editPanel("edit-b")),
      value: editPanel("edit-b")?.querySelector("textarea")?.value ?? null,
    }),
  );

  // Save changes sends the body and kind, never a pin.
  setNativeValue(editPanel("edit-b")!.querySelector("textarea")!, "Edited beside the pin");
  editPanel("edit-b")!.querySelector<HTMLButtonElement>('[data-comment-kind-option="tracking"]')!.click();
  await nextFrame();
  before = patchLog.length;
  editPanel("edit-b")!.querySelector<HTMLButtonElement>("[data-comment-edit-save]")!.click();
  await waitFor(() => patchLog.length > before);
  await waitFor(() => !editPanel("edit-b"), 4_000).catch(() => undefined);
  check(
    "Save changes in the edit panel sends the body and kind and no pin, then closes it",
    patchLog.at(-1)?.body === "Edited beside the pin" &&
      patchLog.at(-1)?.kind === "tracking" &&
      !("pin" in (patchLog.at(-1) ?? {})) &&
      !editPanel("edit-b"),
    JSON.stringify(patchLog.at(-1)),
  );
  root.style.maxInlineSize = "";

  // The edit panel follows an anchored pin when the host pans and while dragging.
  stored.length = 0;
  seedComment("edit-frame", undefined, {
    anchor: { type: "element", id: "route:review", label: "Review", x: 100, y: 200, width: 377, height: 878 },
    pin: { xRatio: 100 / 377, yRatio: 200 / 878 },
  });
  renderStory(relocationMarkup);
  await showSeededPins(["edit-frame"]);
  editButton("edit-frame")!.click();
  await waitFor(() => editPanel("edit-frame"));
  await nextFrame();
  const offset = () => {
    const panel = editPanel("edit-frame")!.getBoundingClientRect();
    const pin = centerOf(savedPin("edit-frame")!);
    return { x: panel.left - pin.x, y: panel.top - pin.y };
  };
  const offsetBefore = offset();
  const world = root.querySelector<HTMLElement>("[data-sbfx-canvas-world]")!;
  world.style.transform = "translate(-160px, 20px) scale(0.5)";
  world.dispatchEvent(new CustomEvent("sbfx:anchors-moved", { bubbles: true }));
  const offsetAfterPan = offset();
  const pinAfterPan = centerOf(savedPin("edit-frame")!);
  check(
    "the edit panel keeps its offset from the pin when the host pans 200 pixels",
    Math.abs(offsetAfterPan.x - offsetBefore.x) <= 0.5 && Math.abs(offsetAfterPan.y - offsetBefore.y) <= 0.5,
    JSON.stringify({ offsetAfterPan, offsetBefore, pinAfterPan }),
  );
  let midDragOffset: { x: number; y: number } | null = null;
  before = patchLog.length;
  await dragPin(savedPin("edit-frame")!, 40, 0, {
    beforeRelease: () => {
      midDragOffset = offset();
    },
  });
  await settleMove(before);
  check(
    "the edit panel follows its pin while the pin is dragged",
    Boolean(midDragOffset) &&
      Math.abs(midDragOffset!.x - offsetBefore.x) <= 0.5 &&
      Math.abs(offset().x - offsetBefore.x) <= 1 &&
      Boolean(editPanel("edit-frame")),
    JSON.stringify({ after: offset(), midDragOffset, offsetBefore }),
  );
  editPanel("edit-frame")!.querySelector<HTMLButtonElement>("[data-comment-edit-cancel]")!.click();
  await waitFor(() => !editPanel("edit-frame"));
  world.style.transform = "translate(40px, 20px) scale(0.5)";
  root.style.height = "";
}

async function editFallbackScenarios() {
  stage("edit-fallback");
  root.style.height = "900px";
  stored.length = 0;
  seedComment("fallback-frame", undefined, {
    anchor: { type: "element", id: "route:review", label: "Review", x: 100, y: 200, width: 377, height: 878 },
    pin: { xRatio: 100 / 377, yRatio: 200 / 878 },
  });
  seedComment("fallback-moved", undefined, {
    anchor: { type: "element", id: "route:intake", label: "Intake", x: 60, y: 300, width: 377, height: 878 },
    movedAt: "2026-10-06T08:00:00.000Z",
  });
  seedComment("fallback-flow", "ui-flow");
  seedComment("fallback-canvas", undefined, { anchor: { type: "canvas", x: 700, y: 600 } });
  seedComment("fallback-line", undefined, {
    anchor: { type: "path", id: "edge:intake->review", label: "Intake → Review", t: 0.5 },
  });
  renderStory(relocationMarkup);
  await showSeededPins(["fallback-frame", "fallback-moved"]);
  const editButton = (id: string) =>
    document.querySelector<HTMLButtonElement>(`.sbfx-comments-panel [data-comment-id="${id}"] button[aria-label="Edit comment"]`);
  const editPanel = () => document.querySelector<HTMLElement>("[data-comment-edit-panel]");
  const editModal = () => document.querySelector<HTMLElement>("[data-comment-edit-modal]");
  const closeEditor = async () => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
    await waitFor(() => !editPanel() && !editModal());
  };
  const world = root.querySelector<HTMLElement>("[data-sbfx-canvas-world]")!;
  const visibleTransform = "translate(40px, 20px) scale(0.5)";
  const offScreen = () => {
    world.style.transform = "translate(-2400px, 20px) scale(0.5)";
    world.dispatchEvent(new CustomEvent("sbfx:anchors-moved", { bubbles: true }));
  };

  // The host brings an off-screen pin into view; the panel opens beside it.
  offScreen();
  const pinHidden = savedPin("fallback-frame")!.style.display === "none";
  const revealRequests: string[] = [];
  const handleReveal = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    revealRequests.push(detail.anchor?.id);
    world.style.transform = visibleTransform;
    world.dispatchEvent(new CustomEvent("sbfx:anchors-moved", { bubbles: true }));
    event.preventDefault();
  };
  document.addEventListener("sbfx:reveal-anchor", handleReveal);
  editButton("fallback-frame")!.click();
  await waitFor(() => editPanel() || editModal(), 3_000).catch(() => undefined);
  document.removeEventListener("sbfx:reveal-anchor", handleReveal);
  check(
    "Edit on an off-screen anchored pin asks the host to show it and opens the panel beside it",
    pinHidden &&
      revealRequests.join() === "route:review" &&
      editPanel()?.dataset.commentEditPanel === "fallback-frame" &&
      !editModal() &&
      savedPin("fallback-frame")!.style.display !== "none",
    JSON.stringify({ modal: Boolean(editModal()), panel: editPanel()?.dataset.commentEditPanel, pinHidden, revealRequests }),
  );
  await closeEditor();

  // Without a host to show it, Edit uses the evidence modal.
  offScreen();
  editButton("fallback-frame")!.click();
  await waitFor(() => editPanel() || editModal(), 3_000).catch(() => undefined);
  check("Edit on an off-screen pin no host shows uses the evidence modal", Boolean(editModal()) && !editPanel());
  await closeEditor();
  world.style.transform = visibleTransform;
  world.dispatchEvent(new CustomEvent("sbfx:anchors-moved", { bubbles: true }));

  // A comment listed from another view has no pin: Edit uses the modal.
  await waitFor(() => document.querySelector('[data-comment-view-option="ui-flow"]'), 4_000).catch(() => undefined);
  document.querySelector<HTMLButtonElement>('[data-comment-view-option="ui-flow"]')?.click();
  await waitFor(() => editButton("fallback-flow"), 3_000).catch(() => undefined);
  editButton("fallback-flow")?.click();
  await waitFor(() => editPanel() || editModal(), 3_000).catch(() => undefined);
  check("Edit on a comment listed from another view uses the evidence modal", Boolean(editModal()) && !editPanel());
  await closeEditor();
  document.querySelector<HTMLButtonElement>('[data-comment-view-option="story"]')?.click();
  await waitFor(() => editButton("fallback-moved"), 3_000).catch(() => undefined);

  // A moved comment's point cannot be edited in the modal.
  const pinsToggle = document.querySelector<HTMLButtonElement>("[data-show-pins]")!;
  pinsToggle.click();
  await waitFor(() => !savedPin("fallback-moved"));
  editButton("fallback-moved")!.click();
  await waitFor(() => editModal(), 3_000).catch(() => undefined);
  check(
    "a moved comment opened in the evidence modal has no draggable point",
    Boolean(editModal()) && !editModal()!.querySelector("[data-comment-edit-pin]"),
    editModal()?.textContent?.slice(0, 120) ?? "(no modal)",
  );
  // Its screenshot still shows, with the point where it was made.
  const ordinalOf = (id: string) => stored.findIndex((entry) => entry.id === id) + 1;
  const fixedEvidence = (id: string) => {
    const modal = editModal();
    const image = modal?.querySelector<HTMLImageElement>(`img[alt="Screenshot evidence for comment ${ordinalOf(id)}"]`);
    const point = modal?.querySelector<HTMLElement>("[data-comment-edit-fixed-pin]");
    return Boolean(
      image &&
        point &&
        point.tagName !== "BUTTON" &&
        point.textContent === String(ordinalOf(id)) &&
        !modal!.querySelector("[data-comment-evidence-unavailable]"),
    );
  };
  await waitFor(() => fixedEvidence("fallback-moved"), 2_000).catch(() => undefined);
  check(
    "a moved comment's evidence modal shows its screenshot with a fixed numbered point and the moved note",
    fixedEvidence("fallback-moved") &&
      Boolean(editModal()?.textContent?.includes("Moved since the screenshot")) &&
      !editModal()?.textContent?.includes("Screenshot evidence is unavailable."),
    editModal()?.textContent?.slice(0, 200) ?? "(no modal)",
  );
  setNativeValue(editModal()!.querySelector("textarea")!, "Edited moved comment");
  await nextFrame();
  const beforeMovedSave = patchLog.length;
  editModal()!.querySelector<HTMLButtonElement>("[data-comment-edit-save]")!.click();
  await waitFor(() => patchLog.length > beforeMovedSave, 3_000).catch(() => undefined);
  await waitFor(() => !editModal(), 3_000).catch(() => undefined);
  check(
    "Save changes in a moved comment's evidence modal sends the body and no pin",
    patchLog.length === beforeMovedSave + 1 &&
      patchLog.at(-1)?.body === "Edited moved comment" &&
      !("pin" in (patchLog.at(-1) ?? {})) &&
      !editModal(),
    JSON.stringify(patchLog.at(-1)),
  );
  editButton("fallback-canvas")!.click();
  await waitFor(() => editModal(), 3_000).catch(() => undefined);
  check(
    "a canvas comment opened in the evidence modal has no draggable point",
    Boolean(editModal()) && !editModal()!.querySelector("[data-comment-edit-pin]"),
    editModal()?.textContent?.slice(0, 120) ?? "(no modal)",
  );
  await closeEditor();
  editButton("fallback-line")!.click();
  await waitFor(() => editModal(), 3_000).catch(() => undefined);
  await waitFor(() => fixedEvidence("fallback-line"), 2_000).catch(() => undefined);
  check(
    "a line comment's evidence modal shows its screenshot with a fixed numbered point",
    fixedEvidence("fallback-line") && !editModal()!.querySelector("[data-comment-edit-pin]"),
    editModal()?.textContent?.slice(0, 200) ?? "(no modal)",
  );
  await closeEditor();
  pinsToggle.click();
  root.style.height = "";
}

async function pinActivationScenarios() {
  stage("pin-activation");
  root.style.height = "900px";
  stored.length = 0;
  seedComment("act-a", undefined, {
    anchor: { type: "element", id: "route:review", label: "Review", x: 100, y: 200, width: 377, height: 878 },
    pin: { xRatio: 100 / 377, yRatio: 200 / 878 },
  });
  seedComment("act-b", undefined, {
    anchor: { type: "element", id: "route:intake", label: "Intake", x: 100, y: 300, width: 377, height: 878 },
    pin: { xRatio: 100 / 377, yRatio: 300 / 878 },
  });
  renderStory(relocationMarkup);
  await showSeededPins(["act-a", "act-b"]);
  const editPanel = () => document.querySelector<HTMLElement>("[data-comment-edit-panel]");
  const listItem = (id: string) => document.querySelector<HTMLElement>(`.sbfx-comments-panel [data-comment-id="${id}"]`);
  const clickPin = (id: string) => {
    const point = centerOf(savedPin(id)!);
    clickSequence(savedPin(id)!, point.x, point.y);
  };

  // Clicking a pin selects its comment and opens its edit panel. The pin is
  // focused first, as a mouse press on a button does in Chrome.
  let before = patchLog.length;
  savedPin("act-a")!.focus();
  clickPin("act-a");
  await waitFor(() => editPanel()?.dataset.commentEditPanel === "act-a", 3_000).catch(() => undefined);
  await waitFor(() => document.activeElement === editPanel()?.querySelector("textarea"), 2_000).catch(() => undefined);
  check(
    "clicking a saved pin opens that comment's edit panel and selects its list item",
    editPanel()?.dataset.commentEditPanel === "act-a" &&
      listItem("act-a")?.getAttribute("aria-current") === "true" &&
      document.activeElement === editPanel()?.querySelector("textarea") &&
      savedPin("act-a")!.dataset.selected === "true" &&
      patchLog.length === before,
    JSON.stringify({ active: document.activeElement?.tagName, current: listItem("act-a")?.getAttribute("aria-current"), panel: editPanel()?.dataset.commentEditPanel }),
  );

  // The edited comment's pin shows no hover card while its panel is open.
  savedPin("act-a")!.dispatchEvent(new MouseEvent("mouseenter"));
  await sleep(100);
  check(
    "a comment whose edit panel is open shows no hover card on its pin",
    !document.querySelector('[data-saved-pin-card="act-a"]'),
  );
  savedPin("act-a")!.dispatchEvent(new MouseEvent("mouseleave"));

  // Clicking the same pin keeps the panel open.
  clickPin("act-a");
  await sleep(150);
  check(
    "clicking the pin of the open comment keeps its edit panel open",
    editPanel()?.dataset.commentEditPanel === "act-a",
    editPanel()?.dataset.commentEditPanel ?? "(closed)",
  );

  // Another pin switches the panel without a request, dropping the draft.
  setNativeValue(editPanel()!.querySelector("textarea")!, "Unsaved draft for act-a");
  before = patchLog.length;
  clickPin("act-b");
  await waitFor(() => editPanel()?.dataset.commentEditPanel === "act-b", 3_000).catch(() => undefined);
  check(
    "clicking another pin switches the edit panel without a request and drops the draft",
    editPanel()?.dataset.commentEditPanel === "act-b" &&
      patchLog.length === before &&
      listItem("act-b")?.getAttribute("aria-current") === "true" &&
      !(editPanel()?.querySelector("textarea")?.value ?? "").includes("Unsaved draft"),
    JSON.stringify({ panel: editPanel()?.dataset.commentEditPanel, value: editPanel()?.querySelector("textarea")?.value }),
  );
  editPanel()!.querySelector<HTMLButtonElement>("[data-comment-edit-cancel]")!.click();
  await waitFor(() => !editPanel());
  root.style.height = "";
}

// Cancelling a move and handing a waiting keyboard move over to a press
// (add-direct-pin-editing, fixes after verify and review).
async function moveCancelScenarios() {
  stage("move-cancel");
  root.style.height = "900px";
  stored.length = 0;
  seedComment("hand-a", undefined, {
    anchor: { type: "element", id: "route:review", label: "Review", x: 100, y: 200, width: 377, height: 878 },
    pin: { xRatio: 100 / 377, yRatio: 200 / 878 },
  });
  seedComment("hand-b", undefined, {
    anchor: { type: "element", id: "route:intake", label: "Intake", x: 100, y: 300, width: 377, height: 878 },
    pin: { xRatio: 100 / 377, yRatio: 300 / 878 },
  });
  renderStory(relocationMarkup);
  await showSeededPins(["hand-a", "hand-b"]);
  const editPanel = () => document.querySelector<HTMLElement>("[data-comment-edit-panel]");
  const listItem = (id: string) => document.querySelector<HTMLElement>(`.sbfx-comments-panel [data-comment-id="${id}"]`);
  const press = (id: string, key: string, shiftKey = false) =>
    savedPin(id)!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, shiftKey }));
  const clickPin = (id: string) => {
    const point = centerOf(savedPin(id)!);
    savedPin(id)!.focus();
    clickSequence(savedPin(id)!, point.x, point.y);
  };
  const closePanel = async () => {
    editPanel()?.querySelector<HTMLButtonElement>("[data-comment-edit-cancel]")?.click();
    await waitFor(() => !editPanel(), 2_000).catch(() => undefined);
    await nextFrame();
    await nextFrame();
  };
  const patchPaths = () => requestLog.filter((entry) => entry.method === "PATCH").map((entry) => entry.path);

  // Escape during an arrow-key move cancels the move, not the open edit panel.
  clickPin("hand-a");
  await waitFor(() => editPanel()?.dataset.commentEditPanel === "hand-a", 3_000).catch(() => undefined);
  await waitFor(() => document.activeElement === editPanel()?.querySelector("textarea"), 2_000).catch(() => undefined);
  setNativeValue(editPanel()!.querySelector("textarea")!, "Draft kept for hand-a");
  await nextFrame();
  savedPin("hand-b")!.focus();
  let before = patchLog.length;
  const keyStart = centerOf(savedPin("hand-b")!);
  press("hand-b", "ArrowRight");
  press("hand-b", "ArrowRight");
  press("hand-b", "Escape");
  await sleep(900);
  check(
    "Escape during an arrow-key move with an edit panel open returns the pin without a request and keeps the panel and its draft",
    patchLog.length === before &&
      Math.abs(centerOf(savedPin("hand-b")!).x - keyStart.x) <= 0.5 &&
      editPanel()?.dataset.commentEditPanel === "hand-a" &&
      editPanel()?.querySelector("textarea")?.value === "Draft kept for hand-a",
    JSON.stringify({
      center: centerOf(savedPin("hand-b")!),
      keyStart,
      panel: editPanel()?.dataset.commentEditPanel ?? null,
      patches: patchLog.length - before,
      value: editPanel()?.querySelector("textarea")?.value ?? null,
    }),
  );
  savedPin("hand-b")!.blur();
  await closePanel();

  // A press on another pin saves the arrow-key move that is waiting first.
  savedPin("hand-b")!.focus();
  before = patchLog.length;
  const waitStart = centerOf(savedPin("hand-b")!);
  press("hand-b", "ArrowRight");
  press("hand-b", "ArrowRight");
  press("hand-b", "ArrowRight");
  const pressPoint = centerOf(savedPin("hand-a")!);
  pointer(savedPin("hand-a")!, "pointerdown", pressPoint.x, pressPoint.y);
  savedPin("hand-a")!.focus();
  pointer(savedPin("hand-a")!, "pointerup", pressPoint.x, pressPoint.y);
  pointer(savedPin("hand-a")!, "click", pressPoint.x, pressPoint.y);
  await waitFor(() => patchLog.length > before, 2_000).catch(() => undefined);
  await waitFor(() => !document.querySelector("[data-saved-comment-pin][data-saving]"), 3_000).catch(() => undefined);
  await sleep(800);
  check(
    "pressing another pin saves a waiting arrow-key move once and the pressed pin opens its edit panel",
    patchLog.length === before + 1 &&
      (patchPaths().at(-1) ?? "").endsWith("/comments/hand-b") &&
      patchLog.at(-1)?.anchor?.id === "route:intake" &&
      Math.abs(centerOf(savedPin("hand-b")!).x - (waitStart.x + 3)) <= 0.6 &&
      !savedPin("hand-b")!.hasAttribute("data-dragging") &&
      editPanel()?.dataset.commentEditPanel === "hand-a",
    JSON.stringify({
      center: centerOf(savedPin("hand-b")!),
      dragging: savedPin("hand-b")!.getAttribute("data-dragging"),
      panel: editPanel()?.dataset.commentEditPanel ?? null,
      patches: patchLog.length - before,
      path: patchPaths().at(-1),
      waitStart,
    }),
  );
  await closePanel();

  // After Escape cancels an arrow-key move, the first Enter activates the pin.
  savedPin("hand-a")!.focus();
  before = patchLog.length;
  press("hand-a", "ArrowUp");
  press("hand-a", "Escape");
  await nextFrame();
  press("hand-a", "Enter");
  // A focused button turns Enter into a click.
  savedPin("hand-a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  await waitFor(() => editPanel()?.dataset.commentEditPanel === "hand-a", 2_000).catch(() => undefined);
  check(
    "after Escape cancels an arrow-key move, the first Enter selects the comment and opens its edit panel",
    editPanel()?.dataset.commentEditPanel === "hand-a" &&
      listItem("hand-a")?.getAttribute("aria-current") === "true" &&
      patchLog.length === before,
    JSON.stringify({ panel: editPanel()?.dataset.commentEditPanel ?? null, patches: patchLog.length - before }),
  );
  await closePanel();

  // After Escape cancels a pointer drag released off the pin, the next click activates it.
  const dragStart = centerOf(savedPin("hand-a")!);
  pointer(savedPin("hand-a")!, "pointerdown", dragStart.x, dragStart.y);
  for (let index = 1; index <= 4; index += 1) {
    pointer(savedPin("hand-a")!, "pointermove", dragStart.x + index * 20, dragStart.y);
    await nextFrame();
  }
  document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
  await nextFrame();
  // The release lands on the page: pointer capture ended with the cancel.
  pointer(root, "pointerup", dragStart.x + 80, dragStart.y);
  pointer(root, "click", dragStart.x + 80, dragStart.y);
  await sleep(100);
  clickPin("hand-a");
  await waitFor(() => editPanel()?.dataset.commentEditPanel === "hand-a", 2_000).catch(() => undefined);
  check(
    "after Escape cancels a pointer drag released off the pin, the next click on the pin opens its edit panel",
    editPanel()?.dataset.commentEditPanel === "hand-a" &&
      Math.abs(centerOf(savedPin("hand-a")!).x - dragStart.x) <= 0.5,
    JSON.stringify({ center: centerOf(savedPin("hand-a")!), dragStart, panel: editPanel()?.dataset.commentEditPanel ?? null }),
  );
  await closePanel();
  root.style.height = "";
}

// A pin being moved is drawn where the move took it, through any render
// (add-direct-pin-editing, fixes after verify and review).
async function movingPinRenderScenarios() {
  stage("moving-pin-render");
  root.style.height = "900px";
  stored.length = 0;
  seedComment("render-a", undefined, {
    anchor: { type: "element", id: "route:review", label: "Review", x: 100, y: 200, width: 377, height: 878 },
    pin: { xRatio: 100 / 377, yRatio: 200 / 878 },
  });
  seedComment("render-b", undefined, {
    anchor: { type: "element", id: "route:intake", label: "Intake", x: 100, y: 300, width: 377, height: 878 },
    pin: { xRatio: 100 / 377, yRatio: 300 / 878 },
  });
  renderStory(relocationMarkup);
  await showSeededPins(["render-a", "render-b"]);
  const listItem = (id: string) => document.querySelector<HTMLElement>(`.sbfx-comments-panel [data-comment-id="${id}"]`);

  // The first arrow press shows at once, before the move is saved.
  savedPin("render-a")!.focus();
  let before = patchLog.length;
  const keyStart = centerOf(savedPin("render-a")!);
  savedPin("render-a")!.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowDown", shiftKey: true }),
  );
  await nextFrame();
  const afterFirstPress = centerOf(savedPin("render-a")!);
  const patchesBeforeSave = patchLog.length - before;
  await settleMove(before);
  check(
    "the first Shift + ArrowDown shows the pin 10 pixels lower before the move is saved",
    patchesBeforeSave === 0 &&
      Math.abs(afterFirstPress.x - keyStart.x) <= 0.5 &&
      Math.abs(afterFirstPress.y - (keyStart.y + 10)) <= 0.5,
    JSON.stringify({ afterFirstPress, keyStart, patchesBeforeSave }),
  );
  savedPin("render-a")!.blur();
  await sleep(100);

  // A render during a drag, here from hovering a list item, leaves the pin
  // under the pointer.
  before = patchLog.length;
  const dragFrom = centerOf(savedPin("render-a")!);
  pointer(savedPin("render-a")!, "pointerdown", dragFrom.x, dragFrom.y);
  for (let index = 1; index <= 3; index += 1) {
    pointer(savedPin("render-a")!, "pointermove", dragFrom.x + index * 15, dragFrom.y + index * 5);
    await nextFrame();
  }
  listItem("render-b")!.dispatchEvent(new MouseEvent("mouseenter"));
  await nextFrame();
  const duringRender = centerOf(savedPin("render-a")!);
  const highlighted = savedPin("render-b")!.dataset.highlighted === "true";
  listItem("render-b")!.dispatchEvent(new MouseEvent("mouseleave"));
  document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
  pointer(root, "pointerup", dragFrom.x + 45, dragFrom.y + 15);
  pointer(root, "click", dragFrom.x + 45, dragFrom.y + 15);
  await sleep(150);
  check(
    "a render during a drag keeps the pin under the pointer",
    highlighted &&
      Math.abs(duringRender.x - (dragFrom.x + 45)) <= 0.5 &&
      Math.abs(duringRender.y - (dragFrom.y + 15)) <= 0.5 &&
      patchLog.length === before,
    JSON.stringify({ dragFrom, duringRender, highlighted, patches: patchLog.length - before }),
  );
  root.style.height = "";
}

async function editPanelPreviewScenarios() {
  stage("edit-panel-preview");
  root.style.height = "900px";
  stored.length = 0;
  const capture = (width: number, height: number, dataUrl = tinyPng) => ({
    cssHeight: 400,
    cssWidth: 600,
    dataUrl,
    height,
    mimeType: "image/png",
    width,
  });
  seedComment("preview-tall", undefined, { capture: capture(750, 1624), pin: { xRatio: 0.25, yRatio: 0.5 } });
  seedComment("preview-wide", undefined, {
    capture: capture(1200, 600),
    pin: { xRatio: 0.75, yRatio: 0.25 },
    anchor: { type: "element", id: "route:review", label: "Review", x: 100, y: 200, width: 377, height: 878 },
    movedAt: "2026-10-06T08:00:00.000Z",
  });
  seedComment("preview-broken", undefined, { capture: capture(600, 400, "data:image/png;base64,AAAA"), pin: { xRatio: 0.4, yRatio: 0.4 } });
  renderStory(relocationMarkup);
  await showSeededPins(["preview-tall", "preview-broken"]);
  const editPanel = () => document.querySelector<HTMLElement>("[data-comment-edit-panel]");
  const openFromPin = async (id: string) => {
    const point = centerOf(savedPin(id)!);
    clickSequence(savedPin(id)!, point.x, point.y);
    await waitFor(() => editPanel()?.dataset.commentEditPanel === id, 3_000);
    await nextFrame();
  };
  const closePanel = async () => {
    editPanel()!.querySelector<HTMLButtonElement>("[data-comment-edit-cancel]")!.click();
    await waitFor(() => !editPanel());
  };
  const near1 = (a: number, b: number) => Math.abs(a - b) <= 1;

  // A tall screenshot fits 200 pixels high and keeps its aspect ratio.
  await openFromPin("preview-tall");
  const tallBox = editPanel()!.querySelector<HTMLElement>("[data-comment-edit-panel-preview]")!.getBoundingClientRect();
  const tallMarker = editPanel()!.querySelector<HTMLElement>("[data-comment-edit-panel-pin]")!;
  const tallMarkerCenter = centerOf(tallMarker);
  const bodyField = editPanel()!.querySelector("textarea")!;
  check(
    "the edit panel's screenshot comes before the body, fits 296 by 200 and keeps its aspect ratio",
    Boolean(bodyField.compareDocumentPosition(editPanel()!.querySelector("[data-comment-edit-panel-preview]")!) & Node.DOCUMENT_POSITION_PRECEDING) &&
      tallBox.width <= 296.5 &&
      tallBox.height <= 200.5 &&
      Math.abs(tallBox.width / tallBox.height - 750 / 1624) < 0.02,
    JSON.stringify({ height: tallBox.height, width: tallBox.width }),
  );
  check(
    "the screenshot marks the stored point with the ordinal and the mark cannot be dragged",
    near1(tallMarkerCenter.x, tallBox.left + tallBox.width * 0.25) &&
      near1(tallMarkerCenter.y, tallBox.top + tallBox.height * 0.5) &&
      tallMarker.tagName !== "BUTTON" &&
      getComputedStyle(tallMarker).pointerEvents === "none" &&
      tallMarker.textContent === String(stored.findIndex((entry) => entry.id === "preview-tall") + 1),
    JSON.stringify({ box: tallBox, marker: tallMarkerCenter, tag: tallMarker.tagName }),
  );
  await closePanel();

  // A wide screenshot fills the 296 pixel width; a moved comment says so.
  await showSeededPins(["preview-wide"]);
  await openFromPin("preview-wide");
  const wideBox = editPanel()!.querySelector<HTMLElement>("[data-comment-edit-panel-preview]")!.getBoundingClientRect();
  check(
    "a wide screenshot fills the panel width and a moved comment shows the moved note",
    near1(wideBox.width, 296) &&
      near1(wideBox.height, 148) &&
      editPanel()!.querySelector("[data-comment-edit-panel-moved]")?.textContent === "Moved since the screenshot",
    JSON.stringify({ height: wideBox.height, width: wideBox.width }),
  );
  await closePanel();

  // A screenshot that does not load reads Screenshot unavailable.
  await openFromPin("preview-broken");
  await waitFor(() => editPanel()?.querySelector("[data-comment-edit-panel-screenshot-unavailable]"), 3_000).catch(() => undefined);
  check(
    "a comment whose screenshot cannot be shown reads Screenshot unavailable in the edit panel",
    editPanel()?.querySelector("[data-comment-edit-panel-screenshot-unavailable]")?.textContent === "Screenshot unavailable" &&
      !editPanel()?.querySelector("[data-comment-edit-panel-preview]"),
  );
  await closePanel();
  root.style.height = "";
}

// Places a comment, then pans the canvas 200 CSS pixels left while the
// composer is open and drags the pending pin 30 CSS pixels right before saving.
async function placeAfterPanning(target: Element, x: number, y: number, text: string) {
  const before = posted.length;
  document.querySelector<HTMLButtonElement>(".sbfx-comments-panel__add")!.click();
  await waitFor(() => document.documentElement.dataset.sbfxCaptureMode === "true");
  clickSequence(target, x, y);
  await waitFor(() => document.querySelector(".sbfx-comment-composer textarea"), 12_000);
  const world = root.querySelector<HTMLElement>("[data-sbfx-canvas-world]")!;
  world.style.transform = "translate(-160px, 20px) scale(0.5)";
  world.dispatchEvent(new CustomEvent("sbfx:anchors-moved", { bubbles: true }));
  await nextFrame();
  const pendingPin = document.querySelector<HTMLElement>("[data-pending-comment-pin]")!;
  const start = centerOf(pendingPin);
  pointer(pendingPin, "pointerdown", start.x, start.y);
  for (let step = 1; step <= 3; step += 1) {
    pointer(pendingPin, "pointermove", start.x + step * 10, start.y);
    await nextFrame();
  }
  pointer(pendingPin, "pointerup", start.x + 30, start.y);
  setNativeValue(document.querySelector<HTMLTextAreaElement>(".sbfx-comment-composer textarea")!, text);
  await nextFrame();
  panelButton("Save comment")!.click();
  await waitFor(() => posted.length === before + 1, 8_000);
  await waitFor(() => !document.querySelector(".sbfx-comment-composer textarea"));
  world.style.transform = "translate(40px, 20px) scale(0.5)";
  world.dispatchEvent(new CustomEvent("sbfx:anchors-moved", { bubbles: true }));
  return { pendingStart: start, request: posted[posted.length - 1] };
}

async function pendingAdjustScenarios() {
  stage("pending-adjust");
  root.style.height = "900px";
  stored.length = 0;
  renderStory(relocationMarkup);
  await sleep(300);
  const reviewElement = root.querySelector<HTMLElement>('[data-sbfx-anchor="route:review"]')!;
  const reviewRect = reviewElement.getBoundingClientRect();
  const press = { x: reviewRect.left + 60, y: reviewRect.top + 100 };
  const pressedRatio = (press.x - reviewRect.left) / reviewRect.width;
  const { request: frameRequest } = await placeAfterPanning(reviewElement, press.x, press.y, "Adjusted after a pan");
  check(
    "a pending frame pin adjusted after a pan moves by 30 pixels of the screenshot area",
    near(frameRequest.pin?.xRatio, pressedRatio + 30 / reviewRect.width, 0.004),
    JSON.stringify({ expected: pressedRatio + 30 / reviewRect.width, pin: frameRequest.pin }),
  );
  check(
    "the adjusted frame anchor is resolved at the pin's current point on the moved frame",
    frameRequest.anchor?.type === "element" &&
      frameRequest.anchor.id === "route:review" &&
      near(frameRequest.anchor.x, 60 / 0.5 + 30 / 0.5, 1),
    JSON.stringify(frameRequest.anchor),
  );

  // A blank-canvas comment: the screenshot area is a canvas world rect.
  const canvasElement = root.querySelector<HTMLElement>("#canvas")!;
  const canvasRect = canvasElement.getBoundingClientRect();
  const blank = { x: 374, y: 380 };
  const blankRatio = (blank.x - canvasRect.left) / canvasRect.width;
  const { request: canvasRequest } = await placeAfterPanning(canvasElement, blank.x, blank.y, "Canvas adjusted after a pan");
  check(
    "a pending canvas pin adjusted after a pan moves by 30 pixels of the screenshot area",
    canvasRequest.anchor?.type === "canvas" && near(canvasRequest.pin?.xRatio, blankRatio + 30 / canvasRect.width, 0.004),
    JSON.stringify({ anchor: canvasRequest.anchor, expected: blankRatio + 30 / canvasRect.width, pin: canvasRequest.pin }),
  );
  check(
    "the adjusted canvas anchor is the world point under the pin after the pan",
    near(canvasRequest.anchor?.x, (blank.x - canvasRect.left - 40) / 0.5 + 30 / 0.5, 1),
    JSON.stringify(canvasRequest.anchor),
  );
  root.style.height = "";
}

async function anchorElementRuleScenarios() {
  stage("anchor-element-rules");
  // Two elements share an id: the first in document order is used, unless it
  // sits inside addon chrome marked capture-ignore.
  renderStory(
    '<div style="position: relative; width: 800px; height: 400px">' +
      '<div id="dup-first" data-sbfx-anchor="route:dup" style="position: absolute; left: 0; top: 0; width: 200px; height: 200px"></div>' +
      '<div id="dup-second" data-sbfx-anchor="route:dup" style="position: absolute; left: 400px; top: 0; width: 200px; height: 200px"></div>' +
      "</div>",
  );
  await nextFrame();
  const anchor = { type: "element" as const, id: "route:dup", x: 10, y: 20, width: 200, height: 200 };
  const firstLeft = root.querySelector<HTMLElement>("#dup-first")!.getBoundingClientRect().left;
  const firstPlacement = placeAnchoredPin(root, anchor);
  check(
    "an anchor id on two elements resolves to the first in document order",
    near(firstPlacement?.left, firstLeft + 10, 0.5),
    JSON.stringify({ firstLeft, firstPlacement }),
  );
  // Resolution skips addon chrome: an anchor inside capture-ignore is never
  // resolved, and a press on chrome resolves the anchor beneath it.
  renderStory(
    '<div style="position: relative; width: 800px; height: 400px">' +
      '<div data-sbfx-capture-ignore="true" style="position: absolute; left: 0; top: 0; width: 200px; height: 200px">' +
      '<div id="ignored-anchor" data-sbfx-anchor="route:ignored" style="width: 200px; height: 200px"></div></div>' +
      '<div data-sbfx-anchor="route:under" style="position: absolute; left: 400px; top: 0; width: 200px; height: 200px"></div>' +
      '<div id="chrome-over" data-sbfx-capture-ignore="true" style="position: absolute; left: 400px; top: 0; width: 200px; height: 200px; z-index: 2"></div>' +
      "</div>",
  );
  await nextFrame();
  const rootLeft = root.getBoundingClientRect().left;
  const rootTop = root.getBoundingClientRect().top;
  const ignored = resolveCommentAnchor(root, rootLeft + 50, rootTop + 50, root.querySelector("#ignored-anchor"));
  const beneath = resolveCommentAnchor(root, rootLeft + 450, rootTop + 50, root.querySelector("#chrome-over"));
  check(
    "an anchor inside capture-ignore chrome is never resolved",
    !(ignored?.type === "element" && ignored.id === "route:ignored"),
    JSON.stringify(ignored ?? null),
  );
  check(
    "a press on capture-ignore chrome resolves the anchor beneath it",
    beneath?.type === "element" && beneath.id === "route:under",
    JSON.stringify(beneath ?? null),
  );

  // A pending blank-canvas pin dragged onto a frame is re-anchored to that
  // frame (a frame comment's pending pin stays inside its captured frame).
  root.style.height = "900px";
  stored.length = 0;
  renderStory(relocationMarkup);
  await sleep(300);
  const before = posted.length;
  document.querySelector<HTMLButtonElement>(".sbfx-comments-panel__add")!.click();
  await waitFor(() => document.documentElement.dataset.sbfxCaptureMode === "true");
  const canvasElement = root.querySelector<HTMLElement>("#canvas")!;
  clickSequence(canvasElement, 374, 380);
  await waitFor(() => document.querySelector(".sbfx-comment-composer textarea"), 12_000);
  const pendingPin = document.querySelector<HTMLElement>("[data-pending-comment-pin]")!;
  const from = centerOf(pendingPin);
  const intakePoint = centerOf(root.querySelector('[data-sbfx-anchor="route:intake"]')!);
  pointer(pendingPin, "pointerdown", from.x, from.y);
  for (let step = 1; step <= 4; step += 1) {
    pointer(pendingPin, "pointermove", from.x + ((intakePoint.x - from.x) * step) / 4, from.y);
    await nextFrame();
  }
  pointer(pendingPin, "pointerup", intakePoint.x, from.y);
  setNativeValue(document.querySelector<HTMLTextAreaElement>(".sbfx-comment-composer textarea")!, "Moved before saving");
  await nextFrame();
  panelButton("Save comment")!.click();
  await waitFor(() => posted.length === before + 1, 8_000);
  await waitFor(() => !document.querySelector(".sbfx-comment-composer textarea"));
  check(
    "dragging a pending canvas pin onto a frame re-anchors it to that frame",
    posted.at(-1)?.anchor?.type === "element" && posted.at(-1)?.anchor?.id === "route:intake",
    JSON.stringify(posted.at(-1)?.anchor),
  );
  root.style.height = "";
}

async function canvasFrameLimitScenarios() {
  stage("canvas-frame-limits");
  root.style.height = "900px";
  stored.length = 0;
  // 4 × 4 slots at world (440 i, 360 j): 12 large frames (the first one slow),
  // a 13th smaller frame and a tiny one below 24 screen pixels.
  const frames: string[] = [];
  for (let index = 0; index < 14; index += 1) {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const size = index < 12 ? { height: 300, width: 377 } : index === 12 ? { height: 100, width: 377 } : { height: 40, width: 40 };
    const source = index === 0 ? "/frame.html?delay=5000" : "/frame.html";
    frames.push(
      `<iframe data-limit-frame="${index}" src="${source}" style="position: absolute; left: ${column * 440}px; top: ${row * 360}px; width: ${size.width}px; height: ${size.height}px; border: 0; pointer-events: none"></iframe>`,
    );
  }
  renderStory(
    '<div id="canvas" data-sbfx-canvas style="position: absolute; inset: 0; overflow: hidden; background: rgb(28 28 30)">' +
      '<div data-sbfx-canvas-world style="position: absolute; left: 0; top: 0; transform-origin: 0 0; transform: translate(40px, 20px) scale(0.5)">' +
      frames.join("") +
      "</div></div>",
  );
  const limitFrame = (index: number) => root.querySelector<HTMLIFrameElement>(`[data-limit-frame="${index}"]`)!;
  await waitFor(
    () => Array.from({ length: 14 }, (_, index) => limitFrame(index).contentDocument?.documentElement.dataset.fixtureFrameReady === "true").every(Boolean),
    15_000,
  );
  await sleep(300);
  const canvasElement = root.querySelector<HTMLElement>("#canvas")!;
  const canvasRect = canvasElement.getBoundingClientRect();
  const started = performance.now();
  const request = await placeComment(canvasElement, canvasRect.right - 20, canvasRect.bottom - 20, "Many frames");
  check("measure: canvas comment with 14 frames (one slow) saved", true, `${Math.round(performance.now() - started)} ms`);
  const calls = (index: number) =>
    ((limitFrame(index).contentWindow as unknown as { __sbfxHookCalls?: Array<{ maxScale?: number } | null> }).__sbfxHookCalls ?? []);
  check(
    "a canvas capture asks only the 12 largest visible frames and skips frames under 24 pixels",
    Array.from({ length: 12 }, (_, index) => calls(index).length === 1).every(Boolean) && calls(12).length === 0 && calls(13).length === 0,
    JSON.stringify(Array.from({ length: 14 }, (_, index) => calls(index).length)),
  );
  check(
    "every frame hook receives a maxScale between 0.25 and 2",
    Array.from({ length: 12 }, (_, index) => calls(index)[0]?.maxScale).every(
      (value) => typeof value === "number" && value >= 0.25 && value <= 2,
    ),
    JSON.stringify(Array.from({ length: 12 }, (_, index) => calls(index)[0]?.maxScale)),
  );
  const sample = (index: number) => {
    const rect = limitFrame(index).getBoundingClientRect();
    return samplePixel(
      request.capture.dataUrl,
      (rect.left + rect.width / 2 - canvasRect.left) / canvasRect.width,
      (rect.top + rect.height / 2 - canvasRect.top) / canvasRect.height,
    );
  };
  const slowArea = await sample(0);
  const normalArea = await sample(1);
  check(
    "a frame whose hook takes longer than 4000 ms stays empty while the others are drawn",
    !isMagenta(slowArea) && isMagenta(normalArea),
    JSON.stringify({ normalArea, slowArea }),
  );
  root.style.height = "";
}

async function layoutCaptureScenarios() {
  stage("layout-capture");
  root.style.height = "900px";
  stored.length = 0;
  // A flow-only node placed by world coordinates inside a scaled canvas.
  renderStory(
    '<div id="canvas" data-sbfx-canvas style="position: absolute; inset: 0; overflow: hidden; background: rgb(28 28 30)">' +
      '<div data-sbfx-canvas-world style="position: absolute; left: 0; top: 0; transform-origin: 0 0; transform: translate(40px, 20px) scale(0.5)">' +
      '<article data-sbfx-anchor="node:green" data-sbfx-anchor-label="Green node" style="position: absolute; left: 600px; top: 100px; width: 220px; height: 220px; background: linear-gradient(to right, rgb(0 160 80) 50%, rgb(0 90 220) 50%)"></article>' +
      "</div></div>",
  );
  await nextFrame();
  // The node is green on its left half and blue on its right half; the press
  // lands on the blue half, which a capture at the on-screen size would cut off.
  const node = root.querySelector<HTMLElement>('[data-sbfx-anchor="node:green"]')!;
  const nodeRect = node.getBoundingClientRect();
  const request = await placeComment(node, nodeRect.left + nodeRect.width * 0.8, nodeRect.top + nodeRect.height * 0.5, "On the node's blue half");
  const pixel = await samplePixel(request.capture.dataUrl, request.pin.xRatio, request.pin.yRatio);
  check(
    "an anchor element placed in a scaled canvas is captured with its own content",
    request.anchor?.type === "element" && request.anchor.id === "node:green" && pixel[2] > 150 && pixel[0] < 80 && pixel[1] < 140,
    JSON.stringify({ capture: { height: request.capture.height, width: request.capture.width }, pin: request.pin, pixel }),
  );
  root.style.height = "";
}

async function viewAtPressScenarios() {
  stage("view-at-press");
  root.style.height = "900px";
  stored.length = 0;
  const flowMarkup = `<div data-sbfx-view="ui-flow" style="position: absolute; inset: 0">${relocationMarkup}</div>`;
  renderStory(flowMarkup);
  await sleep(300);
  // The host switches to the story view while the composer is open.
  let before = posted.length;
  document.querySelector<HTMLButtonElement>(".sbfx-comments-panel__add")!.click();
  await waitFor(() => document.documentElement.dataset.sbfxCaptureMode === "true");
  const review = root.querySelector<HTMLElement>('[data-sbfx-anchor="route:review"]')!;
  const reviewPoint = centerOf(review);
  clickSequence(review, reviewPoint.x, reviewPoint.y);
  await waitFor(() => document.querySelector(".sbfx-comment-composer textarea"), 12_000);
  renderStory('<div style="width: 600px; height: 400px; background: rgb(240 240 244)"></div>');
  await sleep(200);
  setNativeValue(document.querySelector<HTMLTextAreaElement>(".sbfx-comment-composer textarea")!, "Pressed in UI Flow");
  await nextFrame();
  panelButton("Save comment")!.click();
  await waitFor(() => posted.length === before + 1, 8_000);
  await waitFor(() => !document.querySelector(".sbfx-comment-composer textarea"));
  check(
    "a comment keeps the view declared when its point was pressed",
    posted.at(-1)?.story?.view === "ui-flow" && posted.at(-1)?.anchor?.id === "route:review",
    JSON.stringify({ anchor: posted.at(-1)?.anchor, story: posted.at(-1)?.story }),
  );

  // Saving while another view is listed lists the current view again.
  stored.length = 0;
  seedComment("other-view-story", undefined);
  renderStory(flowMarkup);
  await waitForOverviewPoll();
  await waitFor(() => document.querySelector('[data-comment-view-option="story"]'), 4_000);
  const listedView = () => document.querySelector<HTMLElement>("[data-listed-view]")?.dataset.listedView;
  document.querySelector<HTMLButtonElement>('[data-comment-view-option="story"]')!.click();
  await waitFor(() => listedView() === "story", 2_000).catch(() => undefined);
  const listingStory = listedView() === "story";
  before = posted.length;
  await placeComment(root.querySelector('[data-sbfx-anchor="route:intake"]')!, centerOf(root.querySelector('[data-sbfx-anchor="route:intake"]')!).x, 120, "Saved while listing story");
  const newId = `comment-${stored.length}`;
  await waitFor(() => document.querySelector(`.sbfx-comments-panel__list [data-comment-id="${newId}"]`), 6_000).catch(() => undefined);
  check(
    "saving a comment while another view is listed lists the current view with the new comment",
    listingStory &&
      listedView() === "ui-flow" &&
      Boolean(document.querySelector(`.sbfx-comments-panel__list [data-comment-id="${newId}"]`)),
    JSON.stringify({ listedView: listedView(), listingStory, listed: Array.from(document.querySelectorAll(".sbfx-comments-panel__list [data-comment-id]")).map((item) => (item as HTMLElement).dataset.commentId) }),
  );
  root.style.height = "";
}

async function movedDuringCaptureScenarios() {
  stage("moved-during-capture");
  root.style.height = "900px";
  stored.length = 0;
  // The frame's hook takes 300 ms; the host moves the frame 150 pixels left
  // 100 ms after the press, while the page is being captured.
  const framed = await framedElement("/frame.html?delay=300");
  const iframeRect = framed.querySelector("iframe")!.getBoundingClientRect();
  const press = { x: iframeRect.left + 120, y: iframeRect.top + 90 };
  const expected = { x: (press.x - iframeRect.left) / iframeRect.width, y: (press.y - iframeRect.top) / iframeRect.height };
  const before = posted.length;
  document.querySelector<HTMLButtonElement>(".sbfx-comments-panel__add")!.click();
  await waitFor(() => document.documentElement.dataset.sbfxCaptureMode === "true");
  clickSequence(framed, press.x, press.y);
  await sleep(100);
  framed.style.left = "-50px";
  await waitFor(() => document.querySelector(".sbfx-comment-composer textarea"), 12_000);
  setNativeValue(document.querySelector<HTMLTextAreaElement>(".sbfx-comment-composer textarea")!, "Moved during capture");
  await nextFrame();
  panelButton("Save comment")!.click();
  await waitFor(() => posted.length === before + 1, 8_000);
  await waitFor(() => !document.querySelector(".sbfx-comment-composer textarea"));
  const request = posted.at(-1)!;
  check(
    "a frame moved while its page is captured keeps the screenshot pin where it was pressed",
    near(request.pin?.xRatio, expected.x, 0.005) && near(request.pin?.yRatio, expected.y, 0.005),
    JSON.stringify({ expected, pin: request.pin }),
  );
  root.style.height = "";
}

async function pendingClampScenarios() {
  stage("pending-clamp");
  root.style.height = "900px";
  stored.length = 0;
  // A frame running past the canvas bottom: only its top part is visible.
  renderStory(
    '<div id="canvas" data-sbfx-canvas style="position: absolute; inset: 0; overflow: hidden; background: rgb(28 28 30)">' +
      '<div data-sbfx-canvas-world style="position: absolute; left: 0; top: 0; transform-origin: 0 0; transform: translate(40px, 600px) scale(0.5)">' +
      '<div data-sbfx-anchor="route:tall" data-sbfx-anchor-label="Tall" style="position: absolute; left: 0; top: 0; width: 377px; height: 878px; background: rgb(90 90 96)"></div>' +
      "</div></div>",
  );
  await nextFrame();
  const canvasRect = root.querySelector<HTMLElement>("#canvas")!.getBoundingClientRect();
  const tall = root.querySelector<HTMLElement>('[data-sbfx-anchor="route:tall"]')!;
  const tallRect = tall.getBoundingClientRect();
  const before = posted.length;
  document.querySelector<HTMLButtonElement>(".sbfx-comments-panel__add")!.click();
  await waitFor(() => document.documentElement.dataset.sbfxCaptureMode === "true");
  clickSequence(tall, tallRect.left + 80, canvasRect.bottom - 20);
  await waitFor(() => document.querySelector(".sbfx-comment-composer textarea"), 12_000);
  const pendingPin = document.querySelector<HTMLElement>("[data-pending-comment-pin]")!;
  pendingPin.focus();
  for (let press = 0; press < 3; press += 1) {
    pendingPin.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowDown", shiftKey: true }));
    await nextFrame();
  }
  const pinCenter = centerOf(document.querySelector<HTMLElement>("[data-pending-comment-pin]")!);
  setNativeValue(document.querySelector<HTMLTextAreaElement>(".sbfx-comment-composer textarea")!, "Kept inside the canvas");
  await nextFrame();
  panelButton("Save comment")!.click();
  await waitFor(() => posted.length === before + 1, 8_000);
  await waitFor(() => !document.querySelector(".sbfx-comment-composer textarea"));
  check(
    "a pending frame pin stops at the visible edge and keeps its element anchor",
    pinCenter.y <= canvasRect.bottom && posted.at(-1)?.anchor?.type === "element" && posted.at(-1)?.anchor?.id === "route:tall",
    JSON.stringify({ anchor: posted.at(-1)?.anchor, canvasBottom: canvasRect.bottom, pinCenter }),
  );
  root.style.height = "";
}

async function run() {
  await hostDeclarationScenarios();
  await anchorResolutionScenarios();
  await anchoredPlacementScenarios();
  await viewScopedPanelScenarios();
  await locationScenarios();
  await anchoredCaptureScenarios();
  await captureInputScenarios();
  await relocationScenarios();
  await keyboardRelocationScenarios();
  await undoScenarios();
  await editPanelScenarios();
  await editFallbackScenarios();
  await pinActivationScenarios();
  await moveCancelScenarios();
  await movingPinRenderScenarios();
  await editPanelPreviewScenarios();
  await pendingAdjustScenarios();
  await anchorElementRuleScenarios();
  await canvasFrameLimitScenarios();
  await layoutCaptureScenarios();
  await viewAtPressScenarios();
  await movedDuringCaptureScenarios();
  await pendingClampScenarios();
}

run()
  .then(() => {
    destroyFigmaReviewWorkspace();
    resultElement.textContent = btoa(unescape(encodeURIComponent(JSON.stringify({ results }))));
  })
  .catch((error) => {
    resultElement.textContent = btoa(
      unescape(encodeURIComponent(JSON.stringify({ error: String(error?.stack || error), results }))),
    );
  });
