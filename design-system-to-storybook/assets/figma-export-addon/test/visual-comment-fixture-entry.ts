import { createElement as h } from "react";
import { createRoot } from "react-dom/client";

import { FigmaExportReview } from "../src/review";
import {
  beginVisualCommentCapture,
  captureVisualCommentTarget,
  type VisualCommentCapture,
  type VisualCommentCaptureResult,
} from "../src/visualComment";

const results: Array<{ name: string; passed: boolean; detail?: string }> = [];
const resultElement = document.querySelector<HTMLElement>("#fixture-result")!;
resultElement.dataset.stage = "started";

function check(name: string, condition: unknown, detail?: string) {
  results.push({ name, passed: Boolean(condition), ...(detail ? { detail } : {}) });
}

function waitFor(test: () => unknown, timeout = 8_000): Promise<void> {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (test()) resolve();
      else if (performance.now() - started > timeout) reject(new Error("Timed out waiting for fixture state."));
      else setTimeout(poll, 25);
    };
    poll();
  });
}

function dispatchPointerSequence(target: Element, x: number, y: number) {
  target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 }));
  target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 }));
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
}

function fakeCapture(): VisualCommentCapture {
  return {
    dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    mimeType: "image/png",
    width: 1,
    height: 1,
    cssWidth: 400,
    cssHeight: 240,
  };
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (element) => element.textContent?.trim() === label,
  );
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

async function sampleCapture(capture: VisualCommentCapture, cssX: number, cssY: number) {
  const image = new Image();
  image.src = capture.dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = capture.width;
  canvas.height = capture.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  const x = Math.min(capture.width - 1, Math.round((cssX / capture.cssWidth) * capture.width));
  const y = Math.min(capture.height - 1, Math.round((cssY / capture.cssHeight) * capture.height));
  return context.getImageData(x, y, 1, 1).data;
}

async function run() {
  resultElement.dataset.stage = "capture-controller";
  const prototypeButton = document.querySelector<HTMLButtonElement>("#prototype-action")!;
  const root = document.querySelector<HTMLElement>("#storybook-root")!;
  const portal = document.querySelector<HTMLElement>("#portal")!;
  let actionCount = 0;
  prototypeButton.addEventListener("click", () => {
    actionCount += 1;
    prototypeButton.dataset.count = String(actionCount);
  });
  prototypeButton.click();
  check("normal prototype action works before capture", actionCount === 1);

  let captured: VisualCommentCaptureResult | null = null;
  let resolveCaptured!: () => void;
  const capturedPromise = new Promise<void>((resolve) => {
    resolveCaptured = resolve;
  });
  const pointController = beginVisualCommentCapture({
    capture: async () => fakeCapture(),
    onCaptured: (value) => {
      captured = value;
      resultElement.dataset.stage = "point-captured";
      resolveCaptured();
    },
    onError: (error) => {
      throw error;
    },
    selector: "#storybook-root",
  });
  dispatchPointerSequence(prototypeButton, 100, 64);
  await capturedPromise;
  pointController.cancel();
  check("capture phase blocks prototype click", actionCount === 1);
  check("capture preserves pre-action modal state", root.dataset.prototypeState === "modal-open");
  check("pin x is normalized", Math.abs(captured!.pin.xRatio - 0.25) < 0.01);
  check("pin y is normalized", Math.abs(captured!.pin.yRatio - 64 / 240) < 0.01);
  check("pin remains aligned after resize", Math.abs(captured!.pin.xRatio * 200 - 50) < 0.01);

  resultElement.dataset.stage = "escape-test";
  let cancelCount = 0;
  let cancelledCaptureCount = 0;
  const bodyController = beginVisualCommentCapture({
    capture: async () => {
      cancelledCaptureCount += 1;
      return fakeCapture();
    },
    onCancel: () => {
      cancelCount += 1;
    },
    onCaptured: () => undefined,
    onError: () => undefined,
  });
  document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
  dispatchPointerSequence(prototypeButton, 100, 64);
  check("Escape cancels capture mode", cancelCount === 1 && cancelledCaptureCount === 0);

  let resolveDelayedCapture!: (capture: VisualCommentCapture) => void;
  let delayedComposerCount = 0;
  const delayedController = beginVisualCommentCapture({
    capture: () =>
      new Promise<VisualCommentCapture>((resolve) => {
        resolveDelayedCapture = resolve;
      }),
    onCancel: () => undefined,
    onCaptured: () => {
      delayedComposerCount += 1;
    },
    onError: () => undefined,
  });
  dispatchPointerSequence(prototypeButton, 100, 64);
  delayedController.cancel();
  resolveDelayedCapture(fakeCapture());
  await Promise.resolve();
  await Promise.resolve();
  check("Cancel during encoding never opens composer", delayedComposerCount === 0);

  resultElement.dataset.stage = "ignore-test";
  let ignoreCaptures = 0;
  const ignoreController = beginVisualCommentCapture({
    capture: async () => {
      ignoreCaptures += 1;
      return fakeCapture();
    },
    onCaptured: () => undefined,
    onError: () => undefined,
  });
  dispatchPointerSequence(document.querySelector("#ignored-chrome")!, 380, 220);
  ignoreController.cancel();
  check("capture ignore chrome does not select a point", ignoreCaptures === 0);

  resultElement.dataset.stage = "body-test";
  let bodyTarget = false;
  let resolveBodyCapture!: () => void;
  const bodyCapturePromise = new Promise<void>((resolve) => {
    resolveBodyCapture = resolve;
  });
  beginVisualCommentCapture({
    capture: async (target) => {
      bodyTarget = target === document.body;
      resolveBodyCapture();
      return fakeCapture();
    },
    onCaptured: () => undefined,
    onError: () => undefined,
    selector: "body",
  });
  dispatchPointerSequence(portal, 20, 270);
  await bodyCapturePromise;
  bodyController.cancel();
  check("body selector includes portal content", bodyTarget);

  resultElement.dataset.stage = "bitmap-start";
  const cleanCapture = await captureVisualCommentTarget(root);
  resultElement.dataset.stage = "bitmap-captured";
  const ignoredPixel = await sampleCapture(cleanCapture, 380, 220);
  check(
    "captured bitmap excludes addon chrome",
    !(ignoredPixel[0] > 220 && ignoredPixel[1] < 80 && ignoredPixel[2] < 80),
    Array.from(ignoredPixel).join(","),
  );
  check("capture respects longest side", Math.max(cleanCapture.width, cleanCapture.height) <= 2048);
  check("capture respects 4MP", cleanCapture.width * cleanCapture.height <= 4 * 1024 * 1024);
  check("capture respects 2MiB", atob(cleanCapture.dataUrl.split(",")[1]).length <= 2 * 1024 * 1024);

  let zeroError = "";
  await captureVisualCommentTarget(document.querySelector<HTMLElement>("#zero")!).catch((error: Error) => {
    zeroError = error.message;
  });
  check("zero-size target fails without composer", /zero bounds/i.test(zeroError));

  let activeSession: VisualCommentOverview["activeSession"] = null;
  const comments: Array<Record<string, unknown>> = [];
  const requests: Array<{ method: string; path: string; body?: unknown }> = [];
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(String(input), location.href);
    if (url.pathname === "/status") {
      return new Response(JSON.stringify({ entry: null }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.startsWith("/__comments")) {
      const path = url.pathname.slice("/__comments".length);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ method, path, ...(body ? { body } : {}) });
      if (method === "POST" && path === "/sessions") {
        activeSession = { id: "meeting-1", title: body.title, startedAt: new Date().toISOString(), closedAt: null };
        return new Response(JSON.stringify({ meeting: { session: activeSession }, reportStale: false }), { status: 201 });
      }
      if (method === "POST" && path.endsWith("/comments")) {
        comments.push({ id: "comment-1", ...body, createdAt: new Date().toISOString() });
        return new Response(JSON.stringify({ comment: comments.at(-1), reportStale: false }), { status: 201 });
      }
      if (method === "POST" && path.endsWith("/close")) activeSession = null;
      return new Response(
        JSON.stringify({
          activeSession,
          activeReportUrl: activeSession ? "/__comments/reports/sessions/meeting-1/index.html" : null,
          comments,
          recentSessions: activeSession ? [activeSession] : [],
          reportUrl: "/__comments/reports",
          version: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return originalFetch(input, init);
  };

  const mount = createRoot(document.querySelector("#review-mount")!);
  resultElement.dataset.stage = "review-mounted";
  mount.render(
    h(FigmaExportReview, {
      apiPath: "/status",
      componentTitle: "Button",
      enabled: true,
      showNotes: false,
      storyId: "demo--story",
      storyName: "Story",
      storyTitle: "Demo",
      storyUrl: location.href,
      viewMode: "story",
      visualComments: { apiPath: "/__comments", captureSelector: "#storybook-root" },
    }),
  );
  await waitFor(() => button("Start meeting"));
  resultElement.dataset.stage = "review-loaded";
  check("review panel is excluded from captures", Boolean(document.querySelector(".sbfx-review[data-sbfx-capture-ignore]")));
  const startButton = button("Start meeting")!;
  check("Start meeting button is enabled", !startButton.disabled);
  startButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  resultElement.dataset.stage = `start-clicked-${requests.length}`;
  await waitFor(() => button("Add visual comment"));
  check("Start meeting performs API round trip", requests.some((request) => request.method === "POST" && request.path === "/sessions"));
  button("Add visual comment")!.click();
  dispatchPointerSequence(prototypeButton, 100, 64);
  await waitFor(() => button("Save comment"));
  resultElement.dataset.stage = "composer-open";
  const authorField = document.querySelector<HTMLInputElement>(".sbfx-review__composer input")!;
  const textarea = document.querySelector<HTMLTextAreaElement>(".sbfx-review textarea")!;
  setNativeValue(authorField, "Mina");
  setNativeValue(textarea, "Keep this modal spacing");
  await waitFor(() => !button("Save comment")!.disabled);
  button("Save comment")!.click();
  await waitFor(() => requests.some((request) => request.method === "POST" && request.path.endsWith("/comments")));
  resultElement.dataset.stage = "comment-saved";
  check("comment composer posts screenshot and normalized pin", comments.length === 1 && typeof comments[0].capture === "object");
  check("author is stored locally", localStorage.getItem("sbfx:review-author") === "Mina");
  check("polling overview uses current story id", requests.some((request) => request.method === "GET" && request.path === ""));
  window.fetch = originalFetch;
  mount.unmount();
}

type VisualCommentOverview = {
  activeSession: { id: string; title: string; startedAt: string; closedAt: string | null } | null;
};

run()
  .then(() => {
    resultElement.textContent = btoa(JSON.stringify({ results }));
  })
  .catch((error: unknown) => {
    const panelText = document.querySelector(".sbfx-review")?.outerHTML ?? "no review panel";
    resultElement.textContent = btoa(
      JSON.stringify({ error: `${error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)}\nPanel: ${panelText}`, results }),
    );
  });
