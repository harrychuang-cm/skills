import { createElement as h, useEffect, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";

import {
  createFigmaExportReviewDecorator,
  destroyFigmaReviewWorkspace,
  type FigmaExportReviewProps,
} from "../src/review";
import { syncFigmaExportOverlay } from "../src/overlay";
import { getCaptureStyleProperties } from "../src/captureStyleProperties";
import { buildCommentPromptContext, formatTrackingPrompt } from "../src/visualCommentPrompt";
import {
  beginVisualCommentCapture,
  captureVisualCommentTarget,
  getCommentComposerPlacement,
  hasVisibleCanvasPixels,
  type VisualCommentCapture,
  type VisualCommentCaptureResult,
} from "../src/visualComment";

const results: Array<{ name: string; passed: boolean; detail?: string }> = [];
const resultElement = document.querySelector<HTMLElement>("#fixture-result")!;
resultElement.dataset.stage = "started";
const canonicalCollapsePath =
  "M3.354.146a.5.5 0 10-.708.708l4 4a.5.5 0 00.708 0l4-4a.5.5 0 00-.708-.708L7 3.793 3.354.146zM6.646 9.146a.5.5 0 01.708 0l4 4a.5.5 0 01-.708.708L7 10.207l-3.646 3.647a.5.5 0 01-.708-.708l4-4z";
const canonicalUnfoldMorePath =
  "M6.646.146a.5.5 0 01.708 0l4 4a.5.5 0 01-.708.708L7 1.207 3.354 4.854a.5.5 0 01-.708-.708l4-4zM3.354 9.146a.5.5 0 10-.708.708l4 4a.5.5 0 00.708 0l4-4a.5.5 0 00-.708-.708L7 12.793 3.354 9.146z";
const canonicalCommentPath =
  "M3.5 5.004a.5.5 0 100 1h7a.5.5 0 000-1h-7zM3 8.504a.5.5 0 01.5-.5h7a.5.5 0 010 1h-7a.5.5 0 01-.5-.5z";
const canonicalEditPath =
  "M13.854 2.146l-2-2a.5.5 0 00-.708 0l-1.5 1.5-8.995 8.995a.499.499 0 00-.143.268L.012 13.39a.495.495 0 00.135.463.5.5 0 00.462.134l2.482-.496a.495.495 0 00.267-.143l8.995-8.995 1.5-1.5a.5.5 0 000-.708zM12 3.293l.793-.793L11.5 1.207 10.707 2 12 3.293zm-2-.586L1.707 11 3 12.293 11.293 4 10 2.707zM1.137 12.863l.17-.849.679.679-.849.17z";

function FigmaExportReview(props: FigmaExportReviewProps) {
  useLayoutEffect(() => {
    createFigmaExportReviewDecorator(
      {
        storyTitlePrefix: false,
        visualComments: props.visualComments,
      },
      {
        apiPath: props.apiPath,
        autoMarkExported: props.autoMarkExported,
        enabled: props.enabled,
        getComponentTitle: () => props.componentTitle,
        labels: props.labels,
        showNotes: props.showNotes,
        visualComments: props.visualComments,
      },
    )(
      () => null,
      {
        globals: { figmaExport: "on" },
        id: props.storyId,
        name: props.storyName,
        title: props.storyTitle,
        viewMode: props.viewMode,
      },
    );
  });
  useEffect(() => destroyFigmaReviewWorkspace, []);
  return null;
}

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

function exportReviewPanel(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[aria-label="Figma export review"]');
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

async function captureContainsDarkPixel(capture: VisualCommentCapture) {
  const image = new Image();
  image.src = capture.dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = capture.width;
  canvas.height = capture.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] > 0 && pixels[index] < 80 && pixels[index + 1] < 80 && pixels[index + 2] < 80) {
      return true;
    }
  }
  return false;
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
  let delayedPoint: { xRatio: number; yRatio: number } | null = null;
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
    onPointSelected: ({ pin }) => {
      delayedPoint = pin;
    },
  });
  dispatchPointerSequence(prototypeButton, 100, 64);
  check(
    "point callback runs before delayed capture settles",
    delayedPoint !== null && delayedComposerCount === 0,
  );
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

  // A token-heavy project registers thousands of custom properties. They exist
  // before the first capture because html-to-image keeps the first property
  // list it sees for the rest of the page.
  const bulkTokenStyle = document.createElement("style");
  bulkTokenStyle.textContent = `:root { ${Array.from(
    { length: 6000 },
    (_, index) => `--sbfx-fixture-bulk-${index}: ${index}px;`,
  ).join(" ")} }`;
  document.head.append(bulkTokenStyle);

  resultElement.dataset.stage = "bitmap-start";
  const cleanCapture = await captureVisualCommentTarget(root);
  resultElement.dataset.stage = "bitmap-captured";
  const backgroundPixel = await sampleCapture(cleanCapture, 10, 10);
  const modalPixel = await sampleCapture(cleanCapture, 100, 120);
  const ignoredPixel = await sampleCapture(cleanCapture, 380, 220);
  check(
    "captured bitmap contains resolved page background",
    backgroundPixel[3] > 0 && backgroundPixel[0] > 230 && backgroundPixel[1] > 230,
    Array.from(backgroundPixel).join(","),
  );
  check(
    "captured bitmap contains rendered UI content",
    modalPixel[3] > 0 && modalPixel[2] > modalPixel[0] && modalPixel[2] > modalPixel[1],
    Array.from(modalPixel).join(","),
  );
  check("captured bitmap contains contrasting border or text pixels", await captureContainsDarkPixel(cleanCapture));
  check(
    "captured bitmap excludes addon chrome",
    !(ignoredPixel[0] > 220 && ignoredPixel[1] < 80 && ignoredPixel[2] < 80),
    Array.from(ignoredPixel).join(","),
  );
  check("capture respects longest side", Math.max(cleanCapture.width, cleanCapture.height) <= 2048);
  check("capture respects 4MP", cleanCapture.width * cleanCapture.height <= 4 * 1024 * 1024);
  check("capture respects 2MiB", atob(cleanCapture.dataUrl.split(",")[1]).length <= 2 * 1024 * 1024);

  // A screen of a few hundred nodes in that token-heavy project. Copying every
  // custom property onto every clone froze the tab for minutes, while an <svg>
  // child filled through var() still needs its token — here one that only
  // appears after the first capture.
  resultElement.dataset.stage = "token-heavy-capture";
  const tokenHeavyStyle = document.createElement("style");
  tokenHeavyStyle.textContent = ":root { --sbfx-fixture-icon: rgb(200 40 160); }";
  document.head.append(tokenHeavyStyle);
  const tokenHeavyTarget = document.createElement("div");
  tokenHeavyTarget.style.cssText =
    "position: relative; width: 200px; height: 80px; background: rgb(255 255 255);";
  tokenHeavyTarget.innerHTML =
    '<svg width="40" height="40" viewBox="0 0 40 40" style="position: absolute; left: 0; top: 0;">' +
    '<rect width="40" height="40" fill="var(--sbfx-fixture-icon)"></rect></svg>' +
    "<span></span>".repeat(200);
  document.body.append(tokenHeavyTarget);
  const tokenHeavyProperties = getCaptureStyleProperties(tokenHeavyTarget);
  check("capture copies standard style properties", tokenHeavyProperties.includes("color"));
  check(
    "capture copies custom properties the markup references",
    tokenHeavyProperties.includes("--sbfx-fixture-icon"),
  );
  check(
    "capture skips custom properties the markup does not reference",
    !tokenHeavyProperties.some((name) => name.startsWith("--sbfx-fixture-bulk-")),
  );
  const tokenHeavyStarted = performance.now();
  try {
    const tokenHeavyCapture = await captureVisualCommentTarget(tokenHeavyTarget);
    const tokenHeavyElapsed = Math.round(performance.now() - tokenHeavyStarted);
    const tokenIconPixel = await sampleCapture(tokenHeavyCapture, 20, 20);
    check(
      "token-heavy capture does not block the page",
      tokenHeavyElapsed < 5_000,
      `${tokenHeavyElapsed}ms`,
    );
    check(
      "token-heavy capture keeps the color of a var()-filled SVG child",
      tokenIconPixel[0] > 170 && tokenIconPixel[1] < 80 && tokenIconPixel[2] > 130,
      Array.from(tokenIconPixel).join(","),
    );
  } catch (error) {
    check(
      "token-heavy capture does not block the page",
      false,
      `${Math.round(performance.now() - tokenHeavyStarted)}ms: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  tokenHeavyTarget.remove();
  tokenHeavyStyle.remove();
  bulkTokenStyle.remove();

  const transparentCanvas = document.createElement("canvas");
  transparentCanvas.width = 2;
  transparentCanvas.height = 2;
  check("all-transparent canvas is rejected", !hasVisibleCanvasPixels(transparentCanvas));

  let zeroError = "";
  await captureVisualCommentTarget(document.querySelector<HTMLElement>("#zero")!).catch((error: Error) => {
    zeroError = error.message;
  });
  check("zero-size target fails without composer", /zero bounds/i.test(zeroError));

  let activeSession: VisualCommentOverview["activeSession"] = null;
  let statusAvailable = true;
  let commentsAvailable = true;
  let failNextCommentPatch = false;
  let failNextCommentCreate = false;
  let failNextMeetingStart = false;
  let conflictNextMeetingStart = false;
  let extraCommentCount = 0;
  let failNextMeetingRead = false;
  let projectRelativeSessionPath: string | null =
    "design-system/figma-export-review/sessions/meeting-1";
  const mockKind = (comment: Record<string, unknown>) =>
    comment.kind === "tracking" ? "tracking" : "visual-fix";
  const mockStory = (comment: Record<string, unknown>) =>
    comment.story as { id: string; routeId?: string; stateId?: string };
  const mockPin = (comment: Record<string, unknown>) => {
    const ordinal = comments.indexOf(comment) + 1;
    return (
      (comment.pin as { xRatio: number; yRatio: number } | undefined) ??
      { xRatio: 0.15 + ordinal * 0.1, yRatio: 0.2 + ordinal * 0.08 }
    );
  };
  // The whole meeting, as GET /sessions/<id> returns it.
  const mockMeeting = () => ({
    captures: Object.fromEntries(
      comments.map((comment) => [
        `capture-${comment.id}`,
        {
          capturedAt: comment.createdAt,
          image: { mimeType: "image/png", path: `assets/${comment.id}.png` },
          story: { name: "Story", title: "Demo", ...mockStory(comment) },
          viewport: { devicePixelRatio: 1, height: 800, width: 1000 },
        },
      ]),
    ),
    comments: comments.map((comment) => ({
      body: comment.body,
      captureId: `capture-${comment.id}`,
      createdAt: comment.createdAt,
      id: comment.id,
      kind: mockKind(comment),
      pin: mockPin(comment),
      ...(comment.resolvedAt ? { resolvedAt: comment.resolvedAt } : {}),
    })),
    version: 1,
  });
  const comments: Array<Record<string, unknown>> = [];
  const requests: Array<{ method: string; path: string; body?: unknown }> = [];
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(String(input), location.href);
    if (url.pathname === "/status") {
      if (!statusAvailable) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify({ entry: null }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.startsWith("/__comments")) {
      const path = url.pathname.slice("/__comments".length);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ method, path, ...(body ? { body } : {}) });
      if (!commentsAvailable) return new Response("not found", { status: 404 });
      if (method === "POST" && path === "/sessions") {
        if (failNextMeetingStart) {
          failNextMeetingStart = false;
          return new Response(JSON.stringify({ error: "Temporary meeting start failure." }), { status: 500 });
        }
        if (conflictNextMeetingStart) {
          // Another browser started a meeting first.
          conflictNextMeetingStart = false;
          activeSession = { id: "meeting-1", title: "Weekly design review", startedAt: new Date().toISOString(), closedAt: null, captureCount: comments.length, commentCount: comments.length };
          return new Response(
            JSON.stringify({ activeMeeting: activeSession, code: "ACTIVE", error: "A meeting is already active." }),
            { status: 409 },
          );
        }
        activeSession = { id: "meeting-1", title: body.title, startedAt: new Date().toISOString(), closedAt: null, captureCount: comments.length, commentCount: comments.length };
        return new Response(JSON.stringify({ meeting: { session: activeSession }, reportStale: false }), { status: 201 });
      }
      if (method === "POST" && path.endsWith("/comments")) {
        if (failNextCommentCreate) {
          failNextCommentCreate = false;
          return new Response(JSON.stringify({ error: "Temporary comment save failure." }), { status: 500 });
        }
        if (comments.length > 0) {
          // The first save seeds the fixture; later saves append one comment.
          extraCommentCount += 1;
          const extraComment = {
            id: `comment-extra-${extraCommentCount}`,
            ...body,
            createdAt: `2026-07-20T00:00:${String(10 + extraCommentCount).padStart(2, "0")}.000Z`,
          };
          comments.push(extraComment);
          if (activeSession) {
            activeSession = {
              ...activeSession,
              captureCount: activeSession.captureCount + 1,
              commentCount: comments.length,
            };
          }
          return new Response(JSON.stringify({ comment: extraComment, reportStale: false }), { status: 201 });
        }
        const savedComment = {
          id: "comment-current-4",
          ...body,
          createdAt: "2026-07-20T00:00:04.000Z",
        };
        comments.push(
          {
            id: "comment-current-1",
            authorName: "Ari",
            body: "Oldest current-story comment",
            createdAt: "2026-07-20T00:00:01.000Z",
            story: { id: "demo--story" },
          },
          {
            id: "comment-current-2",
            authorName: "Bo",
            body: "Middle current-story comment",
            createdAt: "2026-07-20T00:00:02.000Z",
            resolvedAt: "2026-07-20T00:30:00.000Z",
            story: { id: "demo--story" },
          },
          {
            id: "comment-current-3",
            authorName: "Cy",
            body: "Recent current-story comment",
            createdAt: "2026-07-20T00:00:03.000Z",
            story: { id: "demo--story" },
          },
          {
            id: "comment-other-story",
            authorName: "Dee",
            body: "Newest but belongs to another story",
            createdAt: "2026-07-20T00:00:05.000Z",
            story: { id: "demo--other" },
          },
          savedComment,
        );
        if (activeSession) {
          activeSession = {
            ...activeSession,
            captureCount: 1,
            commentCount: 5,
          };
        }
        return new Response(JSON.stringify({ comment: savedComment, reportStale: false }), { status: 201 });
      }
      if (method === "GET" && path === "/sessions/meeting-1") {
        if (failNextMeetingRead) {
          failNextMeetingRead = false;
          return new Response(JSON.stringify({ error: "Temporary meeting read failure." }), { status: 500 });
        }
        return new Response(JSON.stringify(mockMeeting()), { status: 200 });
      }
      const commentMatch = path.match(/^\/sessions\/meeting-1\/comments\/([^/]+)$/);
      if (commentMatch && method === "PATCH") {
        const comment = comments.find((entry) => entry.id === decodeURIComponent(commentMatch[1]));
        if (!comment) return new Response(JSON.stringify({ error: "Comment not found." }), { status: 404 });
        if (failNextCommentPatch) {
          failNextCommentPatch = false;
          return new Response(JSON.stringify({ error: "Temporary comment update failure." }), { status: 500 });
        }
        const keys = body && typeof body === "object" ? Object.keys(body) : [];
        const pin = body?.pin;
        if (
          !body ||
          keys.length < 1 ||
          keys.some((key) => key !== "body" && key !== "pin" && key !== "kind") ||
          ("kind" in body && body.kind !== "visual-fix" && body.kind !== "tracking") ||
          ("body" in body &&
            (typeof body.body !== "string" ||
              !body.body.trim() ||
              body.body.trim().length > 2_000)) ||
          ("pin" in body &&
            (!pin ||
              typeof pin.xRatio !== "number" ||
              !Number.isFinite(pin.xRatio) ||
              pin.xRatio < 0 ||
              pin.xRatio > 1 ||
              typeof pin.yRatio !== "number" ||
              !Number.isFinite(pin.yRatio) ||
              pin.yRatio < 0 ||
              pin.yRatio > 1))
        ) {
          return new Response(JSON.stringify({ error: "Comment edit is invalid." }), { status: 400 });
        }
        if (typeof body.body === "string") comment.body = body.body.trim();
        if (pin) comment.pin = { xRatio: pin.xRatio, yRatio: pin.yRatio };
        if (typeof body.kind === "string") comment.kind = body.kind;
        return new Response(JSON.stringify({ comment, reportStale: false }), { status: 200 });
      }
      if (commentMatch && method === "DELETE") {
        const commentId = decodeURIComponent(commentMatch[1]);
        const commentIndex = comments.findIndex((entry) => entry.id === commentId);
        if (commentIndex < 0) return new Response(JSON.stringify({ error: "Comment not found." }), { status: 404 });
        comments.splice(commentIndex, 1);
        if (activeSession) {
          activeSession = {
            ...activeSession,
            commentCount: Math.max(0, activeSession.commentCount - 1),
          };
        }
        return new Response(JSON.stringify({ deletedCommentId: commentId, reportStale: false }), { status: 200 });
      }
      if (method === "POST" && path.endsWith("/close")) activeSession = null;
      const requestedStoryId = url.searchParams.get("storyId");
      const storyComments = requestedStoryId
        ? comments.filter(
            (comment) =>
              (comment.story as { id?: string } | undefined)?.id === requestedStoryId,
          )
        : comments;
      const trackingComments = comments.filter((comment) => mockKind(comment) === "tracking");
      const overviewComments = storyComments.map((comment) => {
        const ordinal = comments.indexOf(comment) + 1;
        const pin = mockPin(comment);
        const story = mockStory(comment);
        return {
          ...comment,
          pin,
          ordinal,
          state:
            (comment.state as { routeId?: string; stateId?: string } | undefined) ?? {
              ...(story.routeId ? { routeId: story.routeId } : {}),
              ...(story.stateId ? { stateId: story.stateId } : {}),
            },
          preview:
            comment.id === "comment-current-1"
              ? null
              : {
                  imageUrl:
                    comment.id === "comment-current-3"
                      ? "/missing-comment-evidence.png"
                      : fakeCapture().dataUrl,
                  width: 400,
                  height: 240,
                  pin,
                },
        };
      });
      return new Response(
        JSON.stringify({
          activeSession,
          activeProjectRelativeSessionPath: activeSession ? projectRelativeSessionPath : null,
          activeReportUrl: activeSession ? "/__comments/reports/sessions/meeting-1/index.html" : null,
          activeTracking: activeSession
            ? {
                open: trackingComments.filter((comment) => !comment.resolvedAt).length,
                total: trackingComments.length,
              }
            : { open: 0, total: 0 },
          comments: activeSession ? overviewComments : [],
          recentSessions: [{
            id: "meeting-closed",
            title: "Previous review",
            startedAt: "2026-07-19T08:00:00.000Z",
            closedAt: "2026-07-19T09:00:00.000Z",
            captureCount: 1,
            commentCount: 1,
          }],
          reportUrl: "/__comments/reports",
          version: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return originalFetch(input, init);
  };

  // The display name must start unset on every page load.
  localStorage.removeItem("sbfx:review-author");
  const mount = createRoot(document.querySelector("#review-mount")!);
  syncFigmaExportOverlay(
    {
      globals: { figmaExport: "on" },
      id: "demo--story",
      name: "Story",
      title: "Demo",
      viewMode: "story",
    },
    { storyTitlePrefix: false },
  );
  const workspaceBeforeRerender = document.querySelector<HTMLElement>(
    "[data-sbfx-workspace]",
  );
  syncFigmaExportOverlay(
    {
      globals: { figmaExport: "on" },
      id: "demo--story",
      name: "Story",
      title: "Demo",
      viewMode: "story",
    },
    { storyTitlePrefix: false },
  );
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
  await waitFor(() => document.querySelector(".sbfx-comments-panel"));
  let commentsPanel = document.querySelector<HTMLElement>(".sbfx-comments-panel")!;
  let commentsToggle = commentsPanel.querySelector<HTMLButtonElement>(
    ".sbfx-comments-panel__toggle",
  )!;
  let commentsDetail = commentsPanel.querySelector<HTMLElement>(
    ".sbfx-comments-panel__detail",
  )!;
  const collapsedCommentsRect = commentsPanel.getBoundingClientRect();
  const collapsedToggleRect = commentsToggle.getBoundingClientRect();
  const collapsedIconRect = commentsToggle
    .querySelector<SVGElement>("svg")
    ?.getBoundingClientRect();
  const expectedOffset = window.innerWidth <= 720 ? 16 : 24;
  check(
    "visual comments defaults to one top-right Comment icon launcher",
    commentsPanel.dataset.expanded === "false" &&
      commentsToggle.getAttribute("aria-expanded") === "false" &&
      commentsToggle.getAttribute("aria-label") === "Open comments" &&
      commentsToggle.getAttribute("aria-controls") === commentsDetail.id &&
      commentsDetail.hidden &&
      commentsToggle.querySelector("path")?.getAttribute("d") === canonicalCommentPath &&
      Math.abs(collapsedCommentsRect.top - expectedOffset) <= 1 &&
      Math.abs(collapsedCommentsRect.right - (window.innerWidth - expectedOffset)) <= 1,
  );
  check(
    "collapsed Comment launcher centers the button and icon in its surface",
    Boolean(
      collapsedIconRect &&
        Math.abs(collapsedIconRect.width - 14) <= 0.5 &&
        Math.abs(collapsedIconRect.height - 14) <= 0.5 &&
        Math.abs(collapsedCommentsRect.width - 36) <= 0.5 &&
        Math.abs(collapsedCommentsRect.height - 36) <= 0.5 &&
        Math.abs(collapsedToggleRect.left - collapsedCommentsRect.left) <= 0.5 &&
        Math.abs(collapsedToggleRect.top - collapsedCommentsRect.top) <= 0.5 &&
        Math.abs(collapsedToggleRect.right - collapsedCommentsRect.right) <= 0.5 &&
        Math.abs(collapsedToggleRect.bottom - collapsedCommentsRect.bottom) <= 0.5 &&
        Math.abs(
          collapsedToggleRect.left + collapsedToggleRect.width / 2 -
            (collapsedIconRect.left + collapsedIconRect.width / 2),
        ) <= 0.5 &&
        Math.abs(
          collapsedToggleRect.top + collapsedToggleRect.height / 2 -
            (collapsedIconRect.top + collapsedIconRect.height / 2),
        ) <= 0.5
    ),
    JSON.stringify({
      collapsedCommentsRect,
      collapsedIconRect,
      collapsedToggleRect,
    }),
  );
  check(
    "visual comments is independent from the export review workspace slot",
    !document.querySelector('[data-sbfx-workspace-slot="review"] .sbfx-review__visual-comments') &&
      !commentsPanel.closest("[data-sbfx-workspace]"),
  );

  // Shared lookups for the redesigned flow. The composer, capture prompt, and
  // pending pin live on the Story, outside the panel.
  const now = new Date();
  const notesTitle = `Notes ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const reviewProps = (overrides: Partial<FigmaExportReviewProps> = {}): FigmaExportReviewProps => ({
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
    ...overrides,
  });
  const captureMode = () => document.documentElement.dataset.sbfxCaptureMode === "true";
  const composer = () => document.querySelector<HTMLElement>("[data-comment-composer]");
  const composerBody = () =>
    composer()?.querySelector<HTMLTextAreaElement>("textarea") ?? null;
  const capturePrompt = () => document.querySelector<HTMLElement>("[data-capture-prompt]");
  const errorToast = () => document.querySelector<HTMLElement>("[data-comment-error]");
  const livePin = () => document.querySelector<HTMLElement>("[data-sbfx-live-comment-pin]");
  const pendingPin = () =>
    document.querySelector<HTMLButtonElement>("[data-pending-comment-pin]")!;
  const filterOption = (filter: string) =>
    commentsPanel.querySelector<HTMLButtonElement>(`[data-comment-filter="${filter}"]`)!;
  const filterLabels = () =>
    ["all", "visual-fix", "tracking"].map((filter) => filterOption(filter).textContent).join(",");
  const mutationRequests = () =>
    requests.filter((request) => request.method !== "GET").length;
  const meetingStarts = () =>
    requests.filter((request) => request.method === "POST" && request.path === "/sessions");
  const createCommentRequests = () =>
    requests.filter(
      (request) => request.method === "POST" && request.path.endsWith("/comments"),
    );
  const currentCommentCards = () =>
    Array.from(
      commentsPanel.querySelectorAll<HTMLElement>(
        ".sbfx-comments-panel__comment[data-comment-id]",
      ),
    );
  const pressKey = (target: EventTarget, init: KeyboardEventInit) => {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };
  const settle = (ms = 80) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
  const near = (actual: number, expected: number, tolerance = 0.003) =>
    Math.abs(actual - expected) <= tolerance;
  const pinCenter = () => {
    const rect = pendingPin().getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  const pinRatio = () => {
    const rect = root.getBoundingClientRect();
    return {
      x: (pinCenter().x - rect.left) / rect.width,
      y: (pinCenter().y - rect.top) / rect.height,
    };
  };
  const composerRect = () => composer()!.getBoundingClientRect();
  const intersects = (first: DOMRect, second: DOMRect) =>
    first.left < second.right &&
    second.left < first.right &&
    first.top < second.bottom &&
    second.top < first.bottom;
  const openComposer = async () => {
    button("Add comment")!.click();
    dispatchPointerSequence(prototypeButton, 100, 64);
    await waitFor(() => composer());
  };
  const cancelComposer = async () => {
    composer()!.querySelector<HTMLButtonElement>("[data-comment-composer-cancel]")!.click();
    await waitFor(() => !composer() && !livePin());
  };
  // A plain remount starts collapsed, so reopen the panel before continuing.
  const remountReview = async (overrides: Partial<FigmaExportReviewProps> = {}) => {
    mount.render(null);
    await waitFor(() => !document.querySelector(".sbfx-comments-panel"));
    mount.render(h(FigmaExportReview, reviewProps(overrides)));
    await waitFor(() => document.querySelector(".sbfx-comments-panel"));
    commentsPanel = document.querySelector<HTMLElement>(".sbfx-comments-panel")!;
    commentsToggle = commentsPanel.querySelector<HTMLButtonElement>(
      ".sbfx-comments-panel__toggle",
    )!;
    commentsDetail = commentsPanel.querySelector<HTMLElement>(
      ".sbfx-comments-panel__detail",
    )!;
    if (commentsPanel.dataset.expanded !== "true") commentsToggle.click();
    await waitFor(
      () =>
        commentsPanel.dataset.expanded === "true" &&
        commentsDetail.getAttribute("data-comments-capability") === "available",
    );
  };

  // Comment surface visual rules, audited from computed styles.
  type StyleSample = {
    backdropFilter: string;
    backgroundColor: string;
    backgroundImage: string;
    borderColors: string[];
    borderWidths: number[];
    focused: boolean;
    fontSize: number;
    hasText: boolean;
    insideListItem: boolean;
    isListItem: boolean;
    isScrim: boolean;
    outlineWidth: number;
  };
  const colorAlpha = (color: string) => {
    if (color === "transparent") return 0;
    const modern = color.match(/\/\s*([\d.]+%?)\s*\)$/);
    if (modern) {
      const value = Number.parseFloat(modern[1]!);
      return modern[1]!.endsWith("%") ? value / 100 : value;
    }
    const legacy = color.match(/^rgba\(([^)]+)\)$/);
    return legacy ? Number.parseFloat(legacy[1]!.split(",")[3] ?? "1") : 1;
  };
  const styleViolations = (sample: StyleSample): string[] => {
    const violations: string[] = [];
    const translucent = (color: string) => colorAlpha(color) > 0 && colorAlpha(color) < 1;
    const hasBorder = sample.borderWidths.some((width) => width > 0);
    if (sample.hasText && sample.fontSize < 12) {
      violations.push(`font-size ${sample.fontSize}px`);
    }
    if (!sample.isScrim && translucent(sample.backgroundColor)) {
      violations.push(`background-color ${sample.backgroundColor}`);
    }
    sample.borderColors.forEach((color, index) => {
      if (!sample.isScrim && sample.borderWidths[index]! > 0 && translucent(color)) {
        violations.push(`border-color ${color}`);
      }
    });
    if (sample.backgroundImage.includes("gradient")) {
      violations.push(`background-image ${sample.backgroundImage}`);
    }
    if (sample.backdropFilter && sample.backdropFilter !== "none") {
      violations.push(`backdrop-filter ${sample.backdropFilter}`);
    }
    if (sample.isListItem && (hasBorder || (sample.outlineWidth > 0 && !sample.focused))) {
      violations.push("list item has a border or outline");
    }
    if (sample.insideListItem && (hasBorder || colorAlpha(sample.backgroundColor) > 0)) {
      violations.push("nested container has its own border or fill");
    }
    return violations;
  };
  const sampleStyle = (overrides: Partial<StyleSample>): StyleSample => ({
    backdropFilter: "none",
    backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundImage: "none",
    borderColors: ["rgb(0, 0, 0)"],
    borderWidths: [0],
    focused: false,
    fontSize: 14,
    hasText: false,
    insideListItem: false,
    isListItem: false,
    isScrim: false,
    outlineWidth: 0,
    ...overrides,
  });
  check(
    "style audit rejects and accepts the documented sample values",
    styleViolations(sampleStyle({ fontSize: 10, hasText: true, insideListItem: true })).length === 1 &&
      styleViolations(
        sampleStyle({ borderColors: ["rgba(255, 255, 255, 0.08)"], borderWidths: [1] }),
      ).length === 1 &&
      styleViolations(
        sampleStyle({ borderColors: ["rgb(52, 56, 74)"], borderWidths: [1], isListItem: true }),
      ).length === 1 &&
      styleViolations(
        sampleStyle({ backgroundColor: "rgb(32, 34, 45)", isListItem: true }),
      ).length === 0 &&
      styleViolations(
        sampleStyle({ backgroundColor: "rgba(0, 0, 0, 0.68)", isScrim: true }),
      ).length === 0 &&
      styleViolations(sampleStyle({ backgroundColor: "rgb(0 0 0 / 52%)" })).length === 1 &&
      styleViolations(
        sampleStyle({ backgroundImage: "linear-gradient(rgb(0, 0, 0), rgb(1, 1, 1))" }),
      ).length === 1 &&
      styleViolations(sampleStyle({ backdropFilter: "blur(4px)" })).length === 1,
  );
  const auditSurfaces = (name: string, selector: string) => {
    const violations: string[] = [];
    let audited = 0;
    for (const surface of Array.from(document.querySelectorAll(selector))) {
      for (const element of [surface, ...Array.from(surface.querySelectorAll("*"))]) {
        if (!(element instanceof HTMLElement) || element.getClientRects().length === 0) continue;
        const style = getComputedStyle(element);
        const listItem = element.closest(".sbfx-comments-panel__comment");
        audited += 1;
        const found = styleViolations({
          backdropFilter: style.backdropFilter,
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          borderColors: [
            style.borderTopColor,
            style.borderRightColor,
            style.borderBottomColor,
            style.borderLeftColor,
          ],
          borderWidths: [
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
          ].map((width) => Number.parseFloat(width)),
          focused: element.matches(":focus-visible"),
          fontSize: Number.parseFloat(style.fontSize),
          hasText:
            element.matches("input, textarea, select") ||
            Array.from(element.childNodes).some(
              (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
            ),
          insideListItem: Boolean(listItem) && element !== listItem,
          isListItem: element === listItem,
          isScrim: element.matches(
            ".sbfx-comments-panel__dialog-backdrop, .sbfx-comments-panel__edit-backdrop",
          ),
          outlineWidth: style.outlineStyle === "none" ? 0 : Number.parseFloat(style.outlineWidth),
        });
        for (const violation of found) {
          violations.push(
            `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]}: ${violation}`,
          );
        }
      }
    }
    check(
      `style audit: ${name}`,
      audited > 0 && violations.length === 0,
      violations.length
        ? Array.from(new Set(violations)).slice(0, 14).join(" | ")
        : `audited ${audited} elements`,
    );
  };

  commentsToggle.click();
  await waitFor(
    () =>
      commentsPanel.querySelector(".sbfx-review__visual-comments")?.getAttribute(
        "data-comments-capability",
      ) === "available" &&
      button("Add comment")?.disabled === false &&
      commentsPanel.querySelectorAll(".sbfx-review__report-link").length === 1,
  );
  resultElement.dataset.stage = "review-loaded";
  const workspace = document.querySelector<HTMLElement>("[data-sbfx-workspace]")!;
  const workspaceRect = workspace.getBoundingClientRect();
  const commentsRect = commentsPanel.getBoundingClientRect();
  const storyRect = root.getBoundingClientRect();
  const expectedOrientation = window.innerWidth <= 720 ? "bottom" : "side";
  check(
    "Comment launcher expands the comments detail accessibly",
    commentsPanel.dataset.expanded === "true" &&
      commentsToggle.getAttribute("aria-expanded") === "true" &&
      commentsToggle.getAttribute("aria-label") === "Close comments" &&
      !commentsDetail.hidden &&
      document.documentElement.dataset.sbfxCommentsOpen === "true",
  );
  const commentsHeading = commentsPanel.querySelector<HTMLElement>(
    ".sbfx-comments-panel__heading",
  );
  const reportsButton = commentsPanel.querySelector<HTMLAnchorElement>(
    ".sbfx-comments-panel__reports",
  );
  const headingRect = commentsHeading?.getBoundingClientRect();
  const reportsRect = reportsButton?.getBoundingClientRect();
  const expandedToggleRect = commentsToggle.getBoundingClientRect();
  check(
    "expanded header shows the Comments heading with Reports and the launcher in one row",
    Boolean(
      headingRect &&
        reportsRect &&
        commentsHeading?.textContent === "Comments" &&
        !commentsPanel.querySelector("[data-meeting-title]") &&
        reportsButton?.textContent?.trim() === "Reports" &&
        headingRect.right <= reportsRect.left + 1 &&
        reportsRect.right <= expandedToggleRect.left + 1 &&
        reportsRect.width < commentsRect.width / 2 &&
        Math.abs(
          reportsRect.top + reportsRect.height / 2 -
            (expandedToggleRect.top + expandedToggleRect.height / 2),
        ) <= 1,
    ),
    JSON.stringify({ expandedToggleRect, headingRect, reportsRect }),
  );
  const detailTops = () =>
    [
      button("Add comment"),
      commentsPanel.querySelector('[aria-label="Filter comments"]'),
      commentsPanel.querySelector(".sbfx-comments-panel__scroll"),
      commentsPanel.querySelector(".sbfx-comments-panel__footer"),
    ].map((element) => element?.getBoundingClientRect().top ?? Number.NaN);
  check(
    "detail region follows the fixed order and holds no composer",
    detailTops().every((top, index, tops) => index === 0 || top > tops[index - 1]!) &&
      !commentsPanel.querySelector("[data-comment-composer]") &&
      !commentsPanel.querySelector("[data-capture-prompt]"),
    JSON.stringify(detailTops()),
  );
  const filterGroup = commentsPanel.querySelector<HTMLElement>('[aria-label="Filter comments"]');
  check(
    "panel without comments shows one empty message and zero counts",
    commentsPanel.querySelectorAll("[data-comments-empty]").length === 1 &&
      commentsPanel.querySelector("[data-comments-empty]")?.textContent ===
        "No comments on this story yet." &&
      filterGroup?.getAttribute("role") === "group" &&
      filterLabels() === "All 0,Visual fix 0,Tracking 0" &&
      filterOption("all").getAttribute("aria-pressed") === "true" &&
      filterOption("tracking").getAttribute("aria-pressed") === "false",
    filterLabels(),
  );
  const identity = () => commentsPanel.querySelector<HTMLElement>("[data-commenting-as]");
  check(
    "missing name shows Anonymous",
    identity()?.textContent?.startsWith("Commenting as Anonymous") === true &&
      identity()?.dataset.commentingAs === "Anonymous",
    identity()?.textContent ?? "",
  );
  check(
    "a meeting without tracking comments has no copy action",
    !commentsPanel.querySelector("[data-panel-tracking-copy]"),
  );
  check(
    "direct commenting keeps a named meeting as a secondary action",
    Boolean(button("Start a named meeting")) &&
      !button("End meeting") &&
      !button("Start meeting") &&
      !document.querySelector('[aria-label="Meeting title"]'),
  );
  check(
    "default comment action uses concise copy with a shortcut hint outside its name",
    button("Add comment")?.getAttribute("aria-label") === "Add comment" &&
      button("Add comment")?.dataset.shortcut === "C" &&
      !commentsPanel.textContent?.includes("Add visual comment"),
  );
  check(
    "workspace has one idempotent root",
    document.querySelectorAll("[data-sbfx-workspace]").length === 1 &&
      workspace === workspaceBeforeRerender,
  );
  check(
    "workspace contains review and export slots",
    Boolean(
      workspace.querySelector('[data-sbfx-workspace-slot="review"] .sbfx-review') &&
        workspace.querySelector('[data-sbfx-workspace-slot="export"] .sbfx-exporter'),
    ),
  );
  check(
    "workspace exposes one visible version label on Figma export only",
    workspace.querySelectorAll(".sbfx-exporter__version").length === 1 &&
      !workspace.querySelector(".sbfx-review__version"),
  );
  const initialSlots = Array.from(
    workspace.querySelectorAll<HTMLElement>(":scope > [data-sbfx-workspace-slot]"),
  );
  const initialExporterRect = workspace
    .querySelector<HTMLElement>('.sbfx-exporter[aria-label="Figma export"]')
    ?.getBoundingClientRect();
  const initialReviewRect = workspace
    .querySelector<HTMLElement>('.sbfx-review[aria-label="Figma export review"]')
    ?.getBoundingClientRect();
  check(
    "workspace keeps export before review in DOM order",
    initialSlots.length === 2 &&
      initialSlots[0]?.dataset.sbfxWorkspaceSlot === "export" &&
      initialSlots[1]?.dataset.sbfxWorkspaceSlot === "review",
  );
  check(
    "Figma export is visually above Export review",
    Boolean(
      initialExporterRect &&
        initialReviewRect &&
        initialExporterRect.top < initialReviewRect.top,
    ),
  );
  const reviewIcon = workspace.querySelector<SVGElement>(".sbfx-review__mark svg");
  const reviewIconPaths = Array.from(reviewIcon?.querySelectorAll("path") ?? []).map(
    (path) => path.getAttribute("d"),
  );
  check(
    "Export review uses the Storybook Eye icon",
    reviewIcon?.getAttribute("viewBox") === "0 0 14 14" &&
      reviewIconPaths.length === 2 &&
      reviewIconPaths[0] === "M7 9.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" &&
      reviewIconPaths[1] === "M14 7l-.21.293C13.669 7.465 10.739 11.5 7 11.5S.332 7.465.21 7.293L0 7l.21-.293C.331 6.536 3.261 2.5 7 2.5s6.668 4.036 6.79 4.207L14 7zM2.896 5.302A12.725 12.725 0 001.245 7c.296.37.874 1.04 1.65 1.698C4.043 9.67 5.482 10.5 7 10.5c1.518 0 2.958-.83 4.104-1.802A12.72 12.72 0 0012.755 7c-.297-.37-.875-1.04-1.65-1.698C9.957 4.33 8.517 3.5 7 3.5c-1.519 0-2.958.83-4.104 1.802z" &&
      reviewIcon.closest(".sbfx-review__mark")?.getAttribute("aria-hidden") === "true",
  );
  const initialReviewToggle = workspace.querySelector<HTMLButtonElement>(".sbfx-review__toggle");
  const initialExportToggle = workspace.querySelector<HTMLButtonElement>(".sbfx-exporter__toggle");
  check(
    "expanded review and export use matching inward Collapse icons",
    initialReviewToggle?.getAttribute("aria-expanded") === "true" &&
      initialExportToggle?.getAttribute("aria-expanded") === "true" &&
      initialReviewToggle?.getAttribute("aria-label") === "Collapse export review panel" &&
      initialExportToggle?.getAttribute("aria-label") === "Collapse Figma export panel" &&
      initialReviewToggle?.querySelector("path")?.getAttribute("d") === canonicalCollapsePath &&
      initialExportToggle?.querySelector("path")?.getAttribute("d") === canonicalCollapsePath,
  );
  check(
    `${expectedOrientation} workspace orientation is applied`,
    workspace.dataset.orientation === expectedOrientation &&
      document.documentElement.dataset.sbfxWorkspaceOrientation === expectedOrientation,
  );
  check(
    "workspace is anchored at the bottom-right",
    Math.abs(workspaceRect.bottom - (window.innerHeight - expectedOffset)) <= 1 &&
      Math.abs(workspaceRect.right - (window.innerWidth - expectedOffset)) <= 1,
    JSON.stringify({ expectedOffset, workspaceRect }),
  );
  check(
    "top-right comments detail does not overlap the bottom-right workspace",
    commentsRect.bottom <= workspaceRect.top + 1,
    JSON.stringify({ commentsRect, workspaceRect }),
  );
  check(
    "workspace does not overlap Story canvas",
    expectedOrientation === "side"
      ? storyRect.right <= workspaceRect.left + 1
      : storyRect.bottom <= workspaceRect.top + 1,
    JSON.stringify({ expectedOrientation, storyRect, workspaceRect }),
  );
  check(
    "workspace review and independent comments panel are excluded from captures",
    Boolean(
      workspace.querySelector('.sbfx-review[data-sbfx-capture-ignore]') &&
        commentsPanel.matches('[data-sbfx-capture-ignore]'),
    ),
  );
  const reportsLinks = commentsPanel.querySelectorAll<HTMLAnchorElement>(
    ".sbfx-review__report-link",
  );
  check(
    "panel delegates closed meeting browsing to one Reports link",
    reportsLinks.length === 1 &&
      reportsLinks[0]?.textContent === "Reports" &&
      reportsLinks[0]?.href.endsWith("/__comments/reports") &&
      !document.querySelector(".sbfx-review__history") &&
      !document.querySelector(".sbfx-review__history-item") &&
      !commentsPanel.textContent?.includes("Closed meeting history"),
  );

  // Commenting identity: set once in the footer, not asked by the composer.
  button("Change")!.click();
  await waitFor(() => identity()?.querySelector("input"));
  await waitFor(() => document.activeElement === identity()?.querySelector("input"));
  check(
    "the revealed display-name field takes focus",
    document.activeElement === identity()?.querySelector("input"),
  );
  setNativeValue(identity()!.querySelector<HTMLInputElement>("input")!, "Mina");
  button("Save name")!.click();
  await waitFor(() => identity()?.dataset.commentingAs === "Mina");
  check(
    "display name is set once in the panel footer",
    identity()?.textContent?.startsWith("Commenting as Mina") === true &&
      !identity()?.querySelector("input") &&
      localStorage.getItem("sbfx:review-author") === "Mina",
  );

  // Capture prompt lives on the Story and survives collapsing the panel.
  button("Add comment")!.click();
  await waitFor(() => capturePrompt());
  check(
    "capture is available without a meeting and its prompt renders on the Story",
    captureMode() &&
      !capturePrompt()!.closest(".sbfx-comments-panel") &&
      !capturePrompt()!.closest("#storybook-root") &&
      capturePrompt()!.hasAttribute("data-sbfx-capture-ignore") &&
      capturePrompt()!.textContent?.includes("Click where you want to comment") === true &&
      Boolean(button("Cancel capture")) &&
      button("Add comment")!.disabled &&
      meetingStarts().length === 0,
  );
  auditSurfaces("capture prompt", "[data-capture-prompt]");
  commentsToggle.click();
  await waitFor(() => commentsToggle.getAttribute("aria-expanded") === "false");
  check(
    "collapsing the panel keeps armed capture cancellable",
    commentsDetail.hidden &&
      captureMode() &&
      Boolean(capturePrompt()) &&
      Boolean(button("Cancel capture")),
  );
  pressKey(document, { key: "Escape" });
  await waitFor(() => !captureMode() && !capturePrompt());
  const actionCountBeforeRestore = actionCount;
  prototypeButton.click();
  check(
    "Escape cancels armed capture and restores Story pointer interaction",
    actionCount === actionCountBeforeRestore + 1,
  );

  // Keyboard shortcut C, with the panel still collapsed.
  const collapsedShortcut = pressKey(document.body, { key: "c" });
  await waitFor(() => capturePrompt());
  check(
    "C starts a comment while the panel is collapsed",
    collapsedShortcut.defaultPrevented &&
      captureMode() &&
      commentsToggle.getAttribute("aria-expanded") === "false",
  );
  button("Cancel capture")!.click();
  await waitFor(() => !captureMode() && !capturePrompt());
  const prototypeInput = document.createElement("input");
  root.append(prototypeInput);
  prototypeInput.focus();
  const typedShortcut = pressKey(prototypeInput, { key: "c" });
  const prototypeEditable = document.createElement("div");
  prototypeEditable.setAttribute("contenteditable", "plaintext-only");
  root.append(prototypeEditable);
  prototypeEditable.focus();
  const editableShortcut = pressKey(prototypeEditable, { key: "c" });
  // A field inside a web component reports its host as the event target.
  const prototypeHost = document.createElement("div");
  const shadowInput = document.createElement("input");
  prototypeHost.attachShadow({ mode: "open" }).append(shadowInput);
  root.append(prototypeHost);
  shadowInput.focus();
  const shadowShortcut = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    composed: true,
    key: "c",
  });
  shadowInput.dispatchEvent(shadowShortcut);
  const modifiedShortcut = pressKey(document.body, { key: "c", metaKey: true });
  await settle();
  prototypeHost.remove();
  check(
    "C typed into a prototype field or pressed with a modifier is not intercepted",
    !typedShortcut.defaultPrevented &&
      !editableShortcut.defaultPrevented &&
      !shadowShortcut.defaultPrevented &&
      !modifiedShortcut.defaultPrevented &&
      !captureMode() &&
      !capturePrompt(),
  );
  prototypeInput.remove();
  prototypeEditable.remove();

  // A capture failure is visible while the panel is collapsed.
  const commentRequestsBeforeFailure = createCommentRequests().length;
  pressKey(document.body, { key: "c" });
  await waitFor(() => capturePrompt());
  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (_x, _y, width, height) {
    return { data: new Uint8ClampedArray(width * height * 4) } as ImageData;
  };
  dispatchPointerSequence(prototypeButton, 100, 64);
  await waitFor(() => errorToast()?.textContent?.includes("no visible pixels"));
  CanvasRenderingContext2D.prototype.getImageData = originalGetImageData;
  check(
    "transparent production capture stays retryable and sends no comment request",
    !composer() &&
      !livePin() &&
      !captureMode() &&
      createCommentRequests().length === commentRequestsBeforeFailure,
  );
  check(
    "capture error is visible on the Story while the panel is collapsed",
    commentsToggle.getAttribute("aria-expanded") === "false" &&
      errorToast()?.getAttribute("role") === "alert" &&
      errorToast()?.hasAttribute("data-sbfx-capture-ignore") === true &&
      !errorToast()?.closest(".sbfx-comments-panel"),
  );
  auditSurfaces("capture error", "[data-comment-error]");
  button("Dismiss")!.click();
  await waitFor(() => !errorToast());
  commentsToggle.click();
  await waitFor(() => !commentsDetail.hidden && button("Add comment")?.disabled === false);

  // Anchored composer.
  button("Add comment")!.click();
  dispatchPointerSequence(prototypeButton, 100, 64);
  await waitFor(() => livePin());
  check(
    "point selection shows a capture-ignored next-ordinal live tag",
    livePin()?.textContent === "1" &&
      livePin()?.hasAttribute("data-sbfx-capture-ignore") === true,
  );
  await waitFor(() => composer());
  await waitFor(() => document.activeElement === composerBody());
  resultElement.dataset.stage = "composer-open";
  const kindControlState = (control: HTMLElement | null) => ({
    label: control?.getAttribute("aria-label"),
    options: Array.from(
      control?.querySelectorAll<HTMLButtonElement>("button[data-comment-kind-option]") ?? [],
      (option) => `${option.textContent}:${option.getAttribute("aria-pressed")}`,
    ).join(","),
    role: control?.getAttribute("role"),
    value: control?.dataset.commentKindValue,
  });
  const chooseKind = async (control: () => HTMLElement | null, kind: string) => {
    control()!
      .querySelector<HTMLButtonElement>(`button[data-comment-kind-option="${kind}"]`)!
      .click();
    await waitFor(
      () =>
        control()?.dataset.commentKindValue === kind &&
        control()
          ?.querySelector(`button[data-comment-kind-option="${kind}"]`)
          ?.getAttribute("aria-pressed") === "true",
    );
  };
  const composerKindControl = () =>
    composer()?.querySelector<HTMLElement>("[data-comment-kind-select]") ?? null;
  const composerKind = () => composerKindControl()?.dataset.commentKindValue;
  const persistedKindEntries = () =>
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!).filter(
      (key) => /kind/i.test(key) || /tracking|visual-fix/.test(localStorage.getItem(key) ?? ""),
    );
  const kindContinuation = () => {
    const stored = sessionStorage.getItem("sbfx:visual-comments-kind");
    return stored ? (JSON.parse(stored) as { kind: string; expiresAt: number }) : null;
  };
  const trackingSavedMarker = "sbfx-fixture:tracking-comment-saved";
  const previousLoadSavedTracking = localStorage.getItem(trackingSavedMarker) === "1";
  const isLaterPageLoad = new URLSearchParams(location.search).get("viewport") !== "wide";
  const composerControlOrder = () =>
    Array.from(
      composer()!.querySelectorAll<HTMLElement>(
        '[data-comment-kind-select], textarea, [data-comment-composer-cancel], button[aria-label="Save comment"]',
      ),
      (element) =>
        element.matches("[data-comment-kind-select]")
          ? "kind"
          : element.tagName === "TEXTAREA"
            ? "body"
            : element.matches("[data-comment-composer-cancel]")
              ? "cancel"
              : "save",
    ).join(",");
  check(
    "composer opens beside the pin outside the panel with the body focused",
    !composer()!.closest(".sbfx-comments-panel") &&
      !composer()!.closest("#storybook-root") &&
      composer()!.hasAttribute("data-sbfx-capture-ignore") &&
      composer()!.getAttribute("role") === "dialog" &&
      composerControlOrder() === "kind,body,cancel,save" &&
      !composer()!.querySelector("img, input") &&
      !commentsPanel.querySelector("textarea") &&
      document.activeElement === composerBody() &&
      composerBody()!.placeholder === "What should change here?",
    composerControlOrder(),
  );
  check(
    "every composer control is visible without scrolling",
    Array.from(composer()!.querySelectorAll<HTMLElement>("button, textarea")).every((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
      );
    }) && composer()!.scrollHeight <= composer()!.clientHeight + 1,
    JSON.stringify(composerRect()),
  );
  auditSurfaces("comment composer and pending pin", "[data-comment-composer], [data-pending-comment-pin]");
  const expectedPlacement = () =>
    getCommentComposerPlacement(
      { left: pinCenter().x, top: pinCenter().y },
      { height: window.innerHeight, width: window.innerWidth },
      composerRect().height,
    );
  const composerMatchesPlacement = () => {
    const placement = expectedPlacement();
    const rect = composerRect();
    if ("dock" in placement) {
      return (
        composer()!.dataset.composerDock === placement.dock &&
        near(rect.left, 12, 0.6) &&
        near(rect.right, window.innerWidth - 12, 0.6) &&
        (placement.dock === "bottom"
          ? near(rect.bottom, window.innerHeight - 12, 0.6)
          : near(rect.top, 12, 0.6))
      );
    }
    return (
      composer()!.dataset.composerDock === undefined &&
      near(rect.width, 320, 0.6) &&
      near(rect.left, placement.left, 0.6) &&
      near(rect.top, placement.top, 0.6)
    );
  };
  await waitFor(composerMatchesPlacement);
  check(
    "composer sits beside the pin without covering it",
    composerMatchesPlacement() &&
      !intersects(composerRect(), pendingPin().getBoundingClientRect()) &&
      (window.innerWidth < 720
        ? composer()!.dataset.composerDock === "bottom"
        : near(composerRect().left, pinCenter().x + 24, 0.6)),
    JSON.stringify({ composer: composerRect(), pin: pinCenter(), placement: expectedPlacement() }),
  );
  const placementAt = (left: number, top: number, width: number, height: number) =>
    getCommentComposerPlacement({ left, top }, { height, width }, 216);
  check(
    "composer placement flips to stay inside a 1280 pixel wide viewport",
    [
      [200, 224],
      [900, 924],
      [1000, 656],
      [1200, 856],
    ].every(([pinX, expectedLeft]) => {
      const placement = placementAt(pinX!, 300, 1280, 860);
      return "left" in placement && placement.left === expectedLeft && placement.top === 276;
    }),
    JSON.stringify([200, 900, 1000, 1200].map((pinX) => placementAt(pinX, 300, 1280, 860))),
  );
  check(
    "composer placement keeps a 12 pixel margin from the block edges",
    JSON.stringify(placementAt(200, 5, 1280, 860)) === JSON.stringify({ left: 224, top: 12 }) &&
      JSON.stringify(placementAt(200, 850, 1280, 860)) ===
        JSON.stringify({ left: 224, top: 860 - 216 - 12 }),
  );
  check(
    "narrow viewport docks the composer away from the pin",
    JSON.stringify(placementAt(100, 200, 640, 800)) === JSON.stringify({ dock: "bottom" }) &&
      JSON.stringify(placementAt(100, 700, 640, 800)) === JSON.stringify({ dock: "top" }) &&
      JSON.stringify(getCommentComposerPlacement(null, { height: 800, width: 1280 }, 216)) ===
        JSON.stringify({ dock: "bottom" }),
  );
  check(
    "composer defaults to Visual fix",
    JSON.stringify(kindControlState(composerKindControl())) ===
      JSON.stringify({
        label: "Comment type",
        options: "Visual fix:true,Tracking:false",
        role: "group",
        value: "visual-fix",
      }),
    JSON.stringify(kindControlState(composerKindControl())),
  );
  check(
    "a later page load starts from Visual fix and localStorage keeps no comment kind",
    composerKind() === "visual-fix" &&
      persistedKindEntries().length === 0 &&
      (!isLaterPageLoad || previousLoadSavedTracking),
    JSON.stringify({ isLaterPageLoad, previousLoadSavedTracking, stored: persistedKindEntries() }),
  );
  check(
    "Figma export stays visible while composer is open",
    Boolean(workspace.querySelector('.sbfx-exporter[aria-label="Figma export"]')),
  );

  // The pending pin is adjusted on the Story itself.
  check(
    "pending pin is one focusable numbered pin on the Story",
    pendingPin().tagName === "BUTTON" &&
      pendingPin() === livePin() &&
      pendingPin().textContent === "1" &&
      pendingPin().getAttribute("aria-label") === "Adjust comment point 1" &&
      pendingPin().hasAttribute("data-sbfx-capture-ignore") &&
      !pendingPin().closest(".sbfx-comments-panel") &&
      near(pinRatio().x, 0.25) &&
      near(pinRatio().y, 64 / 240),
    JSON.stringify(pinRatio()),
  );
  const rootRect = root.getBoundingClientRect();
  const dragPin = (clientX: number, clientY: number, pointerId: number) => {
    const from = pinCenter();
    const pin = pendingPin();
    pin.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: from.x,
        clientY: from.y,
        pointerId,
      }),
    );
    for (const type of ["pointermove", "pointerup"]) {
      pin.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, clientX, clientY, pointerId }),
      );
    }
    pin.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX, clientY }));
  };
  const actionCountBeforeDrag = actionCount;
  const mutationsBeforeDrag = mutationRequests();
  dragPin(rootRect.right + 100, rootRect.bottom + 100, 7);
  await waitFor(() => near(pinRatio().x, 1) && near(pinRatio().y, 1));
  pressKey(pendingPin(), { key: "ArrowRight", shiftKey: true });
  await settle();
  check(
    "pointer and keyboard adjustment clamp the pin to the capture target",
    near(pinRatio().x, 1) && near(pinRatio().y, 1),
    JSON.stringify(pinRatio()),
  );
  dragPin(rootRect.left + rootRect.width * 0.6, rootRect.top + rootRect.height * 0.7, 8);
  await waitFor(() => near(pinRatio().x, 0.6) && near(pinRatio().y, 0.7));
  await waitFor(composerMatchesPlacement);
  check(
    "dragging the pin moves it on the Story, the composer follows, and the prototype is untouched",
    composerMatchesPlacement() &&
      !intersects(composerRect(), pendingPin().getBoundingClientRect()) &&
      actionCount === actionCountBeforeDrag &&
      mutationRequests() === mutationsBeforeDrag,
    JSON.stringify({ actionCount, actionCountBeforeDrag, pin: pinRatio() }),
  );
  pendingPin().focus();
  const arrowEvent = pressKey(pendingPin(), { key: "ArrowRight" });
  await waitFor(() => near(pinRatio().x, 0.61));
  pressKey(pendingPin(), { key: "ArrowDown", shiftKey: true });
  await waitFor(() => near(pinRatio().y, 0.75));
  check(
    "keyboard adjustment moves one focusable clamped pin on the Story",
    arrowEvent.defaultPrevented &&
      near(pinRatio().x, 0.61) &&
      near(pinRatio().y, 0.75) &&
      document.activeElement === pendingPin(),
    JSON.stringify(pinRatio()),
  );

  // Kind, placeholder, and shortcut hints.
  await chooseKind(composerKindControl, "tracking");
  check(
    "placeholder follows the selected kind",
    composerBody()!.placeholder === "Event name, parameters, and when it fires",
  );
  await chooseKind(composerKindControl, "visual-fix");
  const visualFixPlaceholder = composerBody()!.placeholder;
  await chooseKind(composerKindControl, "tracking");
  const kindOptionStyle = (kind: string) => {
    const option = composerKindControl()!.querySelector<HTMLElement>(
      `button[data-comment-kind-option="${kind}"]`,
    )!;
    const style = getComputedStyle(option);
    return {
      background: style.backgroundColor,
      border: style.borderTopColor,
      height: option.getBoundingClientRect().height,
    };
  };
  check(
    "the pressed Comment type option is visually distinct and comfortably sized",
    kindOptionStyle("tracking").background !== kindOptionStyle("visual-fix").background &&
      kindOptionStyle("tracking").border !== kindOptionStyle("visual-fix").border &&
      kindOptionStyle("tracking").height >= 28 &&
      kindOptionStyle("visual-fix").height >= 28,
    JSON.stringify({ pressed: kindOptionStyle("tracking"), rest: kindOptionStyle("visual-fix") }),
  );
  check(
    "Comment type switches in both directions and shows one pressed option",
    visualFixPlaceholder === "What should change here?" &&
      kindControlState(composerKindControl()).options === "Visual fix:false,Tracking:true",
    JSON.stringify(kindControlState(composerKindControl())),
  );
  check(
    "Save comment is disabled while the body is empty",
    button("Save comment")!.disabled,
  );
  setNativeValue(composerBody()!, "Keep this modal spacing");
  await waitFor(() => !button("Save comment")!.disabled);
  check(
    "Save comment shows its shortcut hint outside its accessible name",
    button("Save comment")!.getAttribute("aria-label") === "Save comment" &&
      Boolean(button("Save comment")!.dataset.shortcut),
  );

  // The composer does not depend on the panel being expanded.
  commentsToggle.click();
  await waitFor(() => commentsDetail.hidden);
  check(
    "collapsing the panel leaves the open composer and its pin untouched",
    commentsToggle.getAttribute("aria-expanded") === "false" &&
      composerBody()?.value === "Keep this modal spacing" &&
      composerKind() === "tracking" &&
      pendingPin().textContent === "1" &&
      near(pinRatio().x, 0.61) &&
      near(pinRatio().y, 0.75),
  );
  commentsToggle.click();
  await waitFor(() => !commentsDetail.hidden);
  check(
    "reopening the panel keeps the same composer draft",
    composerBody()?.value === "Keep this modal spacing" &&
      composerKind() === "tracking" &&
      near(pinRatio().x, 0.61) &&
      near(pinRatio().y, 0.75),
  );

  // Direct commenting: the first save creates a dated meeting.
  failNextMeetingStart = true;
  button("Save comment")!.click();
  await waitFor(() => composer()?.textContent?.includes("Temporary meeting start failure."));
  check(
    "meeting creation failure keeps the draft and sends no comment request",
    meetingStarts().length === 1 &&
      createCommentRequests().length === 0 &&
      composerBody()?.value === "Keep this modal spacing" &&
      composerKind() === "tracking" &&
      near(pinRatio().x, 0.61) &&
      !commentsPanel.querySelector("[data-meeting-title]"),
  );
  await waitFor(() => !button("Save comment")!.disabled);
  const saveShortcut = pressKey(composerBody()!, { ctrlKey: true, key: "Enter" });
  await waitFor(() => createCommentRequests().length === 1);
  await waitFor(() => !composer() && !livePin());
  await waitFor(
    () => commentsPanel.querySelector("[data-meeting-title]")?.textContent === notesTitle,
  );
  resultElement.dataset.stage = "comment-saved";
  const finalCreateRequest = createCommentRequests()[0];
  const finalCreateBody = finalCreateRequest?.body as
    | { authorName?: string; kind?: string; pin?: { xRatio: number; yRatio: number } }
    | undefined;
  check(
    "modifier save shortcut stores the comment exactly once",
    saveShortcut.defaultPrevented && createCommentRequests().length === 1,
  );
  check(
    "first comment creates a dated meeting",
    meetingStarts().length === 2 &&
      (meetingStarts()[1]?.body as { title?: string } | undefined)?.title === notesTitle &&
      finalCreateRequest?.path === "/sessions/meeting-1/comments" &&
      Boolean(button("End meeting")) &&
      !button("Start a named meeting"),
    JSON.stringify({ notesTitle, starts: meetingStarts(), path: finalCreateRequest?.path }),
  );
  check(
    "comment composer posts screenshot and normalized pin",
    comments.length === 5 &&
      typeof comments.find((comment) => comment.id === "comment-current-4")?.capture ===
        "object" &&
      Boolean(
        finalCreateBody?.pin &&
          Math.abs(finalCreateBody.pin.xRatio - 0.61) < 0.0001 &&
          Math.abs(finalCreateBody.pin.yRatio - 0.75) < 0.0001,
      ),
    JSON.stringify({ commentsLength: comments.length, createRequest: finalCreateRequest }),
  );
  check(
    "composer posts the selected comment kind",
    finalCreateBody?.kind === "tracking",
    JSON.stringify({ kind: finalCreateBody?.kind }),
  );
  check(
    "Save comment carries its kind in the sessionStorage continuation and never in localStorage",
    persistedKindEntries().length === 0 &&
      kindContinuation()?.kind === "tracking" &&
      kindContinuation()!.expiresAt > Date.now() &&
      kindContinuation()!.expiresAt <= Date.now() + 15_000,
    JSON.stringify({ continuation: kindContinuation(), persisted: persistedKindEntries() }),
  );
  localStorage.setItem(trackingSavedMarker, "1");
  check(
    "name set once is used by the comment without a composer name field",
    finalCreateBody?.authorName === "Mina" &&
      localStorage.getItem("sbfx:review-author") === "Mina",
  );
  check("polling overview uses current story id", requests.some((request) => request.method === "GET" && request.path === ""));

  mount.render(null);
  await waitFor(() => !document.querySelector(".sbfx-comments-panel"));
  mount.render(h(FigmaExportReview, reviewProps()));
  await waitFor(
    () =>
      document
        .querySelector(".sbfx-comments-panel__detail")
        ?.getAttribute("data-comments-capability") === "available",
  );
  commentsPanel = document.querySelector<HTMLElement>(".sbfx-comments-panel")!;
  commentsToggle = commentsPanel.querySelector<HTMLButtonElement>(
    ".sbfx-comments-panel__toggle",
  )!;
  commentsDetail = commentsPanel.querySelector<HTMLElement>(
    ".sbfx-comments-panel__detail",
  )!;
  check(
    "Save comment keeps the comments panel expanded across a same-story remount",
    commentsPanel.dataset.expanded === "true" &&
      commentsToggle.getAttribute("aria-expanded") === "true" &&
      !commentsDetail.hidden &&
      Boolean(button("Add comment")) &&
      !composer(),
  );
  check(
    "a mounting panel consumes the kind continuation",
    kindContinuation() === null,
    JSON.stringify(kindContinuation()),
  );

  // The list shows every current-Story comment, with a kind filter.
  await waitFor(() => currentCommentCards().length === 4);
  const cardIds = () => currentCommentCards().map((card) => card.dataset.commentId).join(",");
  check(
    "panel lists every current-Story comment newest first with meeting-wide ordinals",
    cardIds() === "comment-current-4,comment-current-3,comment-current-2,comment-current-1" &&
      currentCommentCards()
        .map((card) => card.querySelector(".sbfx-comments-panel__comment-ordinal")?.textContent)
        .join(",") === "5,3,2,1" &&
      !commentsPanel.textContent?.includes("Newest but belongs to another story"),
    cardIds(),
  );
  check(
    "recent comments show their kind label",
    currentCommentCards()
      .map((card) => {
        const kindLabel = card.querySelector<HTMLElement>(".sbfx-comments-panel__comment-kind");
        return `${kindLabel?.dataset.commentKind}:${kindLabel?.textContent}`;
      })
      .join(",") ===
      "tracking:Tracking,visual-fix:Visual fix,visual-fix:Visual fix,visual-fix:Visual fix",
  );
  check(
    "panel exposes author time body and Open or Completed status",
    currentCommentCards().every(
      (card) =>
        Boolean(card.querySelector("time")?.getAttribute("datetime")) &&
        Boolean(card.querySelector(".sbfx-comments-panel__comment-body")) &&
        Boolean(card.querySelector(".sbfx-comments-panel__comment-status")),
    ) &&
      currentCommentCards()[2]?.textContent?.includes("Completed") === true,
  );
  auditSurfaces("expanded panel with comments of both kinds and states", ".sbfx-comments-panel");
  const mutationsBeforeFilter = mutationRequests();
  check(
    "filter options show the count of current-Story comments they match",
    filterLabels() === "All 4,Visual fix 3,Tracking 1",
    filterLabels(),
  );
  filterOption("tracking").click();
  await waitFor(() => currentCommentCards().length === 1);
  const trackingFilterIds = cardIds();
  const trackingFilterLabels = filterLabels();
  filterOption("visual-fix").click();
  await waitFor(() => currentCommentCards().length === 3);
  const visualFixFilterIds = cardIds();
  check(
    "filter narrows the list to one kind and keeps the counts",
    trackingFilterIds === "comment-current-4" &&
      trackingFilterLabels === "All 4,Visual fix 3,Tracking 1" &&
      visualFixFilterIds === "comment-current-3,comment-current-2,comment-current-1" &&
      filterOption("visual-fix").getAttribute("aria-pressed") === "true" &&
      filterOption("all").getAttribute("aria-pressed") === "false",
    JSON.stringify({ trackingFilterIds, visualFixFilterIds }),
  );
  filterOption("all").click();
  await waitFor(() => currentCommentCards().length === 4);
  check(
    "changing the filter sends no request",
    mutationRequests() === mutationsBeforeFilter,
  );

  // A second comment reuses the meeting and the last saved kind.
  const startsBeforeSecondComment = meetingStarts().length;
  await openComposer();
  check(
    "composer keeps Tracking for consecutive comments",
    kindControlState(composerKindControl()).options === "Visual fix:false,Tracking:true" &&
      pendingPin().textContent === "6",
    JSON.stringify(kindControlState(composerKindControl())),
  );
  setNativeValue(composerBody()!, "Second tracking comment");
  await waitFor(() => !button("Save comment")!.disabled);
  dragPin(rootRect.left + rootRect.width * 0.6, rootRect.top + rootRect.height * 0.7, 9);
  await waitFor(() => near(pinRatio().x, 0.6) && near(pinRatio().y, 0.7));
  const metaSave = pressKey(composerBody()!, { key: "Enter", metaKey: true });
  await waitFor(() => createCommentRequests().length === 2 && !composer());
  await waitFor(() => currentCommentCards().length === 5);
  const secondCreateBody = createCommentRequests()[1]?.body as
    | { authorName?: string; body?: string; kind?: string; pin?: { xRatio: number; yRatio: number } }
    | undefined;
  check(
    "Meta+Enter saves the final adjusted point exactly once",
    metaSave.defaultPrevented &&
      createCommentRequests().length === 2 &&
      secondCreateBody?.body === "Second tracking comment" &&
      secondCreateBody?.kind === "tracking" &&
      Boolean(
        secondCreateBody?.pin &&
          Math.abs(secondCreateBody.pin.xRatio - 0.6) < 0.0001 &&
          Math.abs(secondCreateBody.pin.yRatio - 0.7) < 0.0001,
      ),
    JSON.stringify(secondCreateBody?.pin),
  );
  check(
    "later comments reuse the meeting and the display name",
    meetingStarts().length === startsBeforeSecondComment &&
      createCommentRequests()[1]?.path === "/sessions/meeting-1/comments" &&
      secondCreateBody?.authorName === "Mina" &&
      commentsPanel.querySelector("[data-meeting-title]")?.textContent === notesTitle &&
      cardIds().startsWith("comment-extra-1,comment-current-4"),
    cardIds(),
  );

  // Two visual fixes and three tracking comments on the current Story.
  const filterExampleComment = comments.find((comment) => comment.id === "comment-current-3")!;
  filterExampleComment.kind = "tracking";
  await remountReview();
  await waitFor(() => currentCommentCards().length === 5);
  const filterExample: string[] = [];
  for (const filter of ["all", "visual-fix", "tracking"]) {
    filterOption(filter).click();
    await waitFor(() => filterOption(filter).getAttribute("aria-pressed") === "true");
    filterExample.push(`${filterLabels()} -> ${currentCommentCards().length}`);
  }
  check(
    "filter example: two visual fixes and three tracking comments",
    filterExample.join(" | ") ===
      [
        "All 5,Visual fix 2,Tracking 3 -> 5",
        "All 5,Visual fix 2,Tracking 3 -> 2",
        "All 5,Visual fix 2,Tracking 3 -> 3",
      ].join(" | "),
    filterExample.join(" | "),
  );
  delete filterExampleComment.kind;
  await remountReview();
  await waitFor(() => currentCommentCards().length === 5);

  // A failed save keeps the draft and restores the kind continuation.
  await openComposer();
  setNativeValue(composerBody()!, "Send order_submit_click");
  await chooseKind(composerKindControl, "visual-fix");
  await waitFor(() => !button("Save comment")!.disabled);
  failNextCommentCreate = true;
  button("Save comment")!.click();
  await waitFor(() => composer()?.textContent?.includes("Temporary comment save failure."));
  check(
    "a failed save restores the kind continuation to the last saved kind",
    kindContinuation()?.kind === "tracking",
    JSON.stringify(kindContinuation()),
  );
  check(
    "save failure keeps the composer open with its body, kind, and pin",
    composerKind() === "visual-fix" &&
      composerBody()?.value === "Send order_submit_click" &&
      Boolean(livePin()) &&
      createCommentRequests().length === 3 &&
      comments.length === 6,
    JSON.stringify({ kind: composerKind(), comments: comments.length }),
  );

  // sessionStorage can throw in restricted contexts; the composer keeps working
  // with the in-page preselection only.
  const originalStorageSetItem = Storage.prototype.setItem;
  const originalStorageGetItem = Storage.prototype.getItem;
  const originalStorageRemoveItem = Storage.prototype.removeItem;
  const denySessionStorage = function (this: Storage) {
    if (this === sessionStorage) throw new DOMException("denied", "SecurityError");
  };
  Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
    denySessionStorage.call(this);
    return originalStorageSetItem.call(this, key, value);
  };
  Storage.prototype.getItem = function (this: Storage, key: string) {
    denySessionStorage.call(this);
    return originalStorageGetItem.call(this, key);
  };
  Storage.prototype.removeItem = function (this: Storage, key: string) {
    denySessionStorage.call(this);
    return originalStorageRemoveItem.call(this, key);
  };
  let consecutiveKindWithoutStorage: string | undefined;
  let draftSurvivedWithoutStorage = false;
  try {
    // A failed save disables mutations until the next scheduled refresh succeeds.
    await waitFor(() => button("Save comment")?.disabled === false);
    failNextCommentCreate = true;
    button("Save comment")!.click();
    await waitFor(
      () =>
        createCommentRequests().length === 4 &&
        button("Save comment")?.disabled === false,
    );
    draftSurvivedWithoutStorage =
      composerKind() === "visual-fix" &&
      composerBody()?.value === "Send order_submit_click" &&
      Boolean(livePin());
    await cancelComposer();
    await openComposer();
    consecutiveKindWithoutStorage = composerKind();
    await cancelComposer();
  } finally {
    Storage.prototype.setItem = originalStorageSetItem;
    Storage.prototype.getItem = originalStorageGetItem;
    Storage.prototype.removeItem = originalStorageRemoveItem;
  }
  check(
    "unavailable sessionStorage leaves the composer usable with its draft",
    draftSurvivedWithoutStorage,
  );
  check(
    "a cancelled draft kind does not replace the last saved kind, even without sessionStorage",
    consecutiveKindWithoutStorage === "tracking",
    JSON.stringify({ consecutiveKindWithoutStorage }),
  );
  check(
    "failed saves append no comment and cancelling sends no further request",
    createCommentRequests().length === 4 && comments.length === 6,
  );

  // Escape cancels the composer.
  await openComposer();
  const createsBeforeEscape = createCommentRequests().length;
  pressKey(composerBody()!, { key: "Escape" });
  await waitFor(() => !composer() && !livePin());
  check(
    "Escape cancels the composer without a request",
    createCommentRequests().length === createsBeforeEscape,
  );
  // Switching Stories discards a draft; its screenshot shows the previous Story.
  await openComposer();
  setNativeValue(composerBody()!, "Draft for the first story");
  const mutationsBeforeStorySwitch = mutationRequests();
  mount.render(h(FigmaExportReview, reviewProps({ storyId: "demo--other", storyName: "Other" })));
  await waitFor(() => !composer() && !livePin());
  mount.render(h(FigmaExportReview, reviewProps()));
  await waitFor(() => currentCommentCards().length === 5 && button("Add comment")?.disabled === false);
  await openComposer();
  check(
    "switching Stories discards the pending capture and its draft",
    composerBody()?.value === "" && mutationRequests() === mutationsBeforeStorySwitch,
    JSON.stringify({ body: composerBody()?.value }),
  );
  await cancelComposer();
  await openComposer();
  const mutationsBeforeMovedCancel = mutationRequests();
  dragPin(rootRect.left + rootRect.width * 0.9, rootRect.top + rootRect.height * 0.9, 10);
  await waitFor(() => near(pinRatio().x, 0.9) && near(pinRatio().y, 0.9));
  await cancelComposer();
  await openComposer();
  check(
    "cancelling after moving the pin leaves no pin state for the next comment",
    near(pinRatio().x, 0.25) &&
      near(pinRatio().y, 64 / 240) &&
      mutationRequests() === mutationsBeforeMovedCancel,
    JSON.stringify(pinRatio()),
  );
  await cancelComposer();

  // Twelve current-Story comments scroll inside the panel.
  const longListComments = Array.from({ length: 7 }, (_, index) => ({
    id: `comment-long-${index + 1}`,
    authorName: "Lee",
    body: `Long list comment ${index + 1}`,
    createdAt: `2026-07-20T00:01:${String(index + 10).padStart(2, "0")}.000Z`,
    kind: index % 2 ? "tracking" : "visual-fix",
    story: { id: "demo--story" },
  }));
  comments.push(...longListComments);
  await remountReview();
  await waitFor(() => currentCommentCards().length === 12);
  const scrollRegion = commentsPanel.querySelector<HTMLElement>(".sbfx-comments-panel__scroll")!;
  const longPanelRect = commentsPanel.getBoundingClientRect();
  const insidePanel = (element: Element | null | undefined) => {
    const rect = element?.getBoundingClientRect();
    return Boolean(
      rect &&
        rect.height > 0 &&
        rect.top >= longPanelRect.top - 0.5 &&
        rect.bottom <= longPanelRect.bottom + 0.5,
    );
  };
  check(
    "long list scrolls inside the panel while its controls stay reachable",
    scrollRegion.scrollHeight > scrollRegion.clientHeight + 1 &&
      insidePanel(button("Add comment")) &&
      insidePanel(commentsPanel.querySelector('[aria-label="Filter comments"]')) &&
      insidePanel(commentsPanel.querySelector(".sbfx-comments-panel__footer")) &&
      longPanelRect.bottom <= workspace.getBoundingClientRect().top + 1 &&
      filterLabels() === "All 12,Visual fix 7,Tracking 5",
    JSON.stringify({
      clientHeight: scrollRegion.clientHeight,
      labels: filterLabels(),
      scrollHeight: scrollRegion.scrollHeight,
    }),
  );
  for (const comment of [...longListComments, { id: "comment-extra-1" }]) {
    comments.splice(comments.findIndex((entry) => entry.id === comment.id), 1);
  }
  if (activeSession) {
    activeSession = { ...activeSession, captureCount: 1, commentCount: comments.length };
  }

  // Shortcuts can be turned off; Escape keeps cancelling.
  await remountReview({
    visualComments: { apiPath: "/__comments", captureSelector: "#storybook-root", shortcuts: false },
  });
  const disabledShortcut = pressKey(document.body, { key: "c" });
  await settle();
  const shortcutsOffArmed = captureMode();
  const addHintWhenOff = button("Add comment")!.dataset.shortcut;
  await openComposer();
  setNativeValue(composerBody()!, "Shortcut is off");
  await waitFor(() => !button("Save comment")!.disabled);
  const createsBeforeDisabledSave = createCommentRequests().length;
  const disabledSave = pressKey(composerBody()!, { ctrlKey: true, key: "Enter" });
  await settle(150);
  const saveHintWhenOff = button("Save comment")!.dataset.shortcut;
  const composerStillOpen = Boolean(composer());
  pressKey(composerBody()!, { key: "Escape" });
  await waitFor(() => !composer() && !livePin());
  check(
    "shortcuts are disabled by configuration while Escape keeps cancelling",
    !disabledShortcut.defaultPrevented &&
      !shortcutsOffArmed &&
      addHintWhenOff === undefined &&
      !disabledSave.defaultPrevented &&
      saveHintWhenOff === undefined &&
      composerStillOpen &&
      createCommentRequests().length === createsBeforeDisabledSave,
    JSON.stringify({ addHintWhenOff, composerStillOpen, saveHintWhenOff, shortcutsOffArmed }),
  );
  await remountReview();
  await waitFor(() => currentCommentCards().length === 4);

  // ---- Saved comment pins on the Story ----
  const savedPins = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>("[data-saved-comment-pin]"));
  const savedPin = (id: string) =>
    document.querySelector<HTMLButtonElement>(`[data-saved-comment-pin="${id}"]`);
  const describePins = () =>
    savedPins()
      .map((pin) => {
        const radius = Number.parseFloat(getComputedStyle(pin).borderTopLeftRadius);
        return `${pin.textContent}:${radius >= 12 ? "circle" : "rounded-square"}:${pin.getAttribute("aria-label")}`;
      })
      .sort()
      .join(" | ");
  const markedPins = (mark: "highlighted" | "selected") =>
    savedPins()
      .filter((pin) => pin.dataset[mark] === "true")
      .map((pin) => pin.dataset.savedCommentPin)
      .sort()
      .join(",");
  const highlightedPins = () => markedPins("highlighted");
  const selectedPins = () => markedPins("selected");
  const mockComment = (id: string) => comments.find((comment) => comment.id === id)!;
  const pinsToggle = () => commentsPanel.querySelector<HTMLButtonElement>("[data-show-pins]")!;
  const storyRootRect = () => root.getBoundingClientRect();
  // Comment 1 visual-fix Open without stored evidence, comment 2 tracking Completed,
  // comment 3 visual-fix Open, comment 5 tracking Open; comment 4 is on another Story.
  resultElement.dataset.stage = "pins-start";
  mockComment("comment-current-2").kind = "tracking";
  await remountReview();
  await waitFor(() => savedPins().length === 4);
  const pinFor = savedPin("comment-current-4")!;
  const pinForRect = pinFor.getBoundingClientRect();
  check(
    "expanded panel shows a numbered pin at each comment's normalized position",
    savedPins().length === 4 &&
      near(
        (pinForRect.left + pinForRect.width / 2 - storyRootRect().left) / storyRootRect().width,
        0.61,
      ) &&
      near(
        (pinForRect.top + pinForRect.height / 2 - storyRootRect().top) / storyRootRect().height,
        0.75,
      ) &&
      savedPins().every(
        (pin) =>
          pin.hasAttribute("data-sbfx-capture-ignore") &&
          !pin.closest("#storybook-root") &&
          !pin.closest(".sbfx-comments-panel"),
      ) &&
      !savedPin("comment-other-story") &&
      pinsToggle().getAttribute("aria-pressed") === "true" &&
      pinsToggle().getAttribute("aria-label") === "Show pins",
    describePins(),
  );
  resultElement.dataset.stage = "pins-filter";
  const allPins = describePins();
  filterOption("visual-fix").click();
  await waitFor(() => savedPins().length === 2 && !savedPin("comment-current-2"));
  const visualFixPins = describePins();
  filterOption("tracking").click();
  await waitFor(() => savedPins().length === 2 && !savedPin("comment-current-1"));
  const trackingPins = describePins();
  filterOption("all").click();
  await waitFor(() => savedPins().length === 4);
  check(
    "pins follow the kind filter and show kind and status",
    allPins ===
      [
        "1:circle:Comment 1, Visual fix, Open",
        "2:rounded-square:Comment 2, Tracking, Completed",
        "3:circle:Comment 3, Visual fix, Open",
        "5:rounded-square:Comment 5, Tracking, Open",
      ].join(" | ") &&
      visualFixPins ===
        [
          "1:circle:Comment 1, Visual fix, Open",
          "3:circle:Comment 3, Visual fix, Open",
        ].join(" | ") &&
      trackingPins ===
        [
          "2:rounded-square:Comment 2, Tracking, Completed",
          "5:rounded-square:Comment 5, Tracking, Open",
        ].join(" | ") &&
      getComputedStyle(savedPin("comment-current-2")!).backgroundColor !==
        getComputedStyle(savedPin("comment-current-4")!).backgroundColor,
    JSON.stringify({ allPins, trackingPins, visualFixPins }),
  );
  auditSurfaces("saved comment pins", "[data-saved-comment-pin]");
  const pinPoint = () => {
    const rect = savedPin("comment-current-3")?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  };
  const coveredPoint = pinPoint()!;
  const coveredBefore = document.elementFromPoint(coveredPoint.x, coveredPoint.y);
  pinsToggle().click();
  await waitFor(() => savedPins().length === 0);
  const showPinsOff =
    pinsToggle().getAttribute("aria-pressed") === "false" &&
    !document
      .elementFromPoint(coveredPoint.x, coveredPoint.y)
      ?.hasAttribute("data-saved-comment-pin");
  pinsToggle().click();
  await waitFor(() => savedPins().length === 4);
  commentsToggle.click();
  await waitFor(() => commentsDetail.hidden && savedPins().length === 0);
  check(
    "collapsing the panel or turning Show pins off removes every saved pin",
    coveredBefore?.hasAttribute("data-saved-comment-pin") === true &&
      showPinsOff &&
      !document
        .elementFromPoint(coveredPoint.x, coveredPoint.y)
        ?.hasAttribute("data-saved-comment-pin") &&
      !Object.keys(localStorage).some((key) => /pins/i.test(key)) &&
      !Object.keys(sessionStorage).some((key) => /pins/i.test(key)),
  );
  commentsToggle.click();
  await waitFor(() => !commentsDetail.hidden && savedPins().length === 4);

  // A comment captured in another route or state has no pin.
  resultElement.dataset.stage = "pins-state";
  const stateRows: string[] = [];
  const originalRoute = root.dataset.route;
  const originalState = root.dataset.prototypeState;
  for (const [recorded, current, expected] of [
    [{ routeId: "/order", stateId: "modal-open" }, { routeId: "/order", stateId: "modal-open" }, true],
    [{ routeId: "/order", stateId: "modal-open" }, { routeId: "/order", stateId: "default" }, false],
    [{ routeId: "/order" }, { routeId: "/cart" }, false],
    [{}, { routeId: "/order", stateId: "default" }, true],
    [{}, {}, true],
  ] as Array<[Record<string, string>, Record<string, string>, boolean]>) {
    mockComment("comment-current-4").state = recorded;
    if (current.routeId) root.dataset.route = current.routeId;
    else delete root.dataset.route;
    if (current.stateId) root.dataset.prototypeState = current.stateId;
    else delete root.dataset.prototypeState;
    await remountReview();
    await waitFor(() => currentCommentCards().length === 4);
    await settle(700);
    const card = commentsPanel.querySelector<HTMLElement>('[data-comment-id="comment-current-4"]')!;
    const hasPin = Boolean(savedPin("comment-current-4"));
    const hasNote =
      card.querySelector("[data-comment-state-note]")?.textContent === "Captured in another state";
    stateRows.push(`${hasPin === expected}/${hasNote === !expected}`);
  }
  delete mockComment("comment-current-4").state;
  root.dataset.route = originalRoute!;
  root.dataset.prototypeState = originalState!;
  check(
    "a comment captured in another route or state has no pin and is labelled in the list",
    stateRows.join(",") === Array(5).fill("true/true").join(","),
    stateRows.join(","),
  );

  // Pins never appear in a new comment's screenshot.
  await remountReview();
  await waitFor(() => savedPins().length === 4);
  resultElement.dataset.stage = "pins-capture";
  const capturedWithPins = await captureVisualCommentTarget(document.body);
  check(
    "saved pins are excluded from captures",
    savedPins().length === 4 &&
      savedPins().every((pin) => pin.hasAttribute("data-sbfx-capture-ignore")) &&
      capturedWithPins.width > 0,
  );

  // A capture target without bounds shows no pins and keeps the list usable.
  resultElement.dataset.stage = "pins-zero";
  await remountReview({
    visualComments: { apiPath: "/__comments", captureSelector: "#zero" },
  });
  await waitFor(() => currentCommentCards().length === 4);
  await settle(700);
  check(
    "a capture target without bounds shows no pins and keeps the list usable",
    savedPins().length === 0 && currentCommentCards().length === 4,
  );
  resultElement.dataset.stage = "pins-unresolved";
  await remountReview({
    visualComments: { apiPath: "/__comments", captureSelector: "#does-not-exist" },
  });
  await waitFor(() => currentCommentCards().length === 4);
  await settle(700);
  check(
    "a capture selector that matches no element shows no pins and keeps the list usable",
    !document.querySelector("#does-not-exist") &&
      savedPins().length === 0 &&
      currentCommentCards().length === 4,
  );

  // Pin and list correspondence, with a list long enough to scroll.
  resultElement.dataset.stage = "pinlist-start";
  mockComment("comment-current-3").pin = { xRatio: 0.25, yRatio: 64 / 240 };
  const correspondenceComments = Array.from({ length: 8 }, (_, index) => ({
    id: `comment-pinlist-${index + 1}`,
    authorName: "Lee",
    body: `Pin list comment ${index + 1}`,
    createdAt: `2026-07-20T00:02:${String(index + 10).padStart(2, "0")}.000Z`,
    kind: "visual-fix",
    story: { id: "demo--story" },
  }));
  comments.push(...correspondenceComments);
  await remountReview();
  await waitFor(() => currentCommentCards().length === 12 && Boolean(savedPin("comment-current-3")));
  const listScroll = commentsPanel.querySelector<HTMLElement>(".sbfx-comments-panel__scroll")!;
  const targetCard = () =>
    commentsPanel.querySelector<HTMLElement>('[data-comment-id="comment-current-3"]')!;
  // The scroll region can be shorter than one card, so "in view" means the
  // card's top edge or most of its height is inside the region.
  const cardVisible = () => {
    const card = targetCard().getBoundingClientRect();
    const view = listScroll.getBoundingClientRect();
    const overlap = Math.min(card.bottom, view.bottom) - Math.max(card.top, view.top);
    return overlap >= Math.min(card.height, view.height) - 1;
  };
  listScroll.scrollTop = 0;
  const hiddenBeforeClick = !cardVisible();
  let delegatedClicks = 0;
  const delegatedListener = () => {
    delegatedClicks += 1;
  };
  document.addEventListener("click", delegatedListener);
  const actionCountBeforePin = actionCount;
  const mutationsBeforePin = mutationRequests();
  const overButton = savedPin("comment-current-3")!.getBoundingClientRect();
  const beneathPin = document
    .elementsFromPoint(overButton.left + overButton.width / 2, overButton.top + overButton.height / 2)
    .includes(prototypeButton);
  savedPin("comment-current-3")!.click();
  await waitFor(() => targetCard().getAttribute("aria-current") === "true" && cardVisible());
  await waitFor(() => document.activeElement === targetCard());
  document.removeEventListener("click", delegatedListener);
  check(
    "activating a pin selects its list item without reaching the prototype",
    hiddenBeforeClick &&
      beneathPin &&
      cardVisible() &&
      document.activeElement === targetCard() &&
      commentsPanel.querySelectorAll('[aria-current="true"]').length === 1 &&
      selectedPins() === "comment-current-3" &&
      actionCount === actionCountBeforePin &&
      delegatedClicks === 0 &&
      mutationRequests() === mutationsBeforePin,
    JSON.stringify({ actionCount, actionCountBeforePin, delegatedClicks, hiddenBeforeClick }),
  );
  resultElement.dataset.stage = "pinlist-again";
  (document.activeElement as HTMLElement | null)?.blur();
  listScroll.scrollTop = 0;
  const hiddenBeforeSecondClick = !cardVisible() && document.activeElement !== targetCard();
  savedPin("comment-current-3")!.click();
  await waitFor(() => cardVisible() && document.activeElement === targetCard());
  check(
    "activating the pin of the selected comment reveals its list item again",
    hiddenBeforeSecondClick &&
      targetCard().getAttribute("aria-current") === "true" &&
      selectedPins() === "comment-current-3" &&
      mutationRequests() === mutationsBeforePin,
  );
  resultElement.dataset.stage = "pinlist-second";
  const keyboardPin = savedPin("comment-current-2")!;
  keyboardPin.focus();
  keyboardPin.click();
  await waitFor(
    () =>
      commentsPanel
        .querySelector('[data-comment-id="comment-current-2"]')
        ?.getAttribute("aria-current") === "true",
  );
  check(
    "selecting another pin moves the selection",
    commentsPanel.querySelectorAll('[aria-current="true"]').length === 1 &&
      targetCard().getAttribute("aria-current") !== "true" &&
      selectedPins() === "comment-current-2",
  );
  resultElement.dataset.stage = "pinlist-hover";
  const hoverCard = commentsPanel.querySelector<HTMLElement>('[data-comment-id="comment-current-4"]')!;
  hoverCard.dispatchEvent(new MouseEvent("mouseenter"));
  await waitFor(() => savedPin("comment-current-4")?.dataset.highlighted === "true");
  // Comment 2 stays selected and focused; only the hovered item's pin is highlighted.
  const highlightedWhileHovering = highlightedPins();
  const selectedWhileHovering = selectedPins();
  hoverCard.dispatchEvent(new MouseEvent("mouseleave"));
  await waitFor(() => savedPin("comment-current-4")?.dataset.highlighted !== "true");
  hoverCard.focus();
  await waitFor(() => savedPin("comment-current-4")?.dataset.highlighted === "true");
  const highlightedWhileFocused = highlightedPins();
  (document.activeElement as HTMLElement | null)?.blur();
  await waitFor(() => savedPin("comment-current-4")?.dataset.highlighted !== "true");
  check(
    "hovering or focusing a list item highlights only its pin until the pointer or focus leaves",
    highlightedWhileHovering === "comment-current-4" &&
      selectedWhileHovering === "comment-current-2" &&
      highlightedWhileFocused === "comment-current-4" &&
      highlightedPins() === "" &&
      mutationRequests() === mutationsBeforePin,
    JSON.stringify({ highlightedWhileFocused, highlightedWhileHovering, selectedWhileHovering }),
  );
  // A saved pin does not block placing a new comment at the same point.
  resultElement.dataset.stage = "pins-passive";
  const coveredRect = savedPin("comment-current-3")!.getBoundingClientRect();
  const covered = {
    x: coveredRect.left + coveredRect.width / 2,
    y: coveredRect.top + coveredRect.height / 2,
  };
  const pinAt = () =>
    Boolean(document.elementFromPoint(covered.x, covered.y)?.closest("[data-saved-comment-pin]"));
  const pinOnTopBeforeCapture = pinAt();
  const selectionBeforeCapture = selectedPins();
  pressKey(document.body, { key: "c" });
  await waitFor(() => capturePrompt() && !pinAt());
  const pinsShownWhileCapturing = savedPins().length;
  dispatchPointerSequence(document.elementFromPoint(covered.x, covered.y)!, covered.x, covered.y);
  await waitFor(() => composer());
  const passiveWhileComposing = !pinAt() || Boolean(composer()?.contains(document.elementFromPoint(covered.x, covered.y)));
  const selectionWhileComposing = selectedPins();
  pressKey(composerBody() ?? document.body, { key: "Escape" });
  await waitFor(() => !composer() && !captureMode() && pinAt());
  check(
    "a point under a saved pin can receive a new comment",
    pinOnTopBeforeCapture &&
      pinsShownWhileCapturing === 12 &&
      passiveWhileComposing &&
      selectionWhileComposing === selectionBeforeCapture &&
      actionCount === actionCountBeforePin &&
      mutationRequests() === mutationsBeforePin,
    JSON.stringify({ pinOnTopBeforeCapture, pinsShownWhileCapturing, selectionWhileComposing }),
  );
  for (const comment of correspondenceComments) {
    comments.splice(comments.findIndex((entry) => entry.id === comment.id), 1);
  }
  delete mockComment("comment-current-3").pin;

  // ---- Panel tracking prompt handoff ----
  // Comment 1 visual-fix Open, 2 tracking Open, 3 tracking Completed on this
  // Story; comment 4 tracking Open on another Story; comment 5 tracking Open here.
  resultElement.dataset.stage = "handoff-start";
  const clipboardWrites: string[] = [];
  let rejectClipboard = false;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        if (rejectClipboard) throw new Error("clipboard denied");
        clipboardWrites.push(text);
      },
    },
  });
  delete mockComment("comment-current-2").resolvedAt;
  mockComment("comment-current-3").kind = "tracking";
  mockComment("comment-current-3").resolvedAt = "2026-07-20T00:40:00.000Z";
  mockComment("comment-other-story").kind = "tracking";
  await remountReview();
  await waitFor(() => commentsPanel.querySelector('[data-panel-tracking-copy="all"]'));
  const copyAction = (scope: string) =>
    commentsPanel.querySelector<HTMLButtonElement>(`[data-panel-tracking-copy="${scope}"]`);
  const copyStatus = () =>
    commentsPanel.querySelector<HTMLElement>("[data-panel-tracking-status]");
  const subsections = (prompt: string | undefined) =>
    Array.from(prompt?.matchAll(/^### Comment (\d+)$/gm) ?? [], (match) => Number(match[1])).join(",");
  const expectedPanelPrompt = (scope: "all" | "story") => {
    const meeting = mockMeeting();
    return formatTrackingPrompt(
      meeting.comments.flatMap((comment, index) => {
        const capture = meeting.captures[comment.captureId]!;
        if (
          comment.kind !== "tracking" ||
          comment.resolvedAt ||
          (scope === "story" && capture.story.id !== "demo--story")
        ) {
          return [];
        }
        return [
          {
            context: buildCommentPromptContext({
              capture,
              comment: comment as never,
              kind: "tracking",
              ordinal: index + 1,
              projectRelativeSessionPath,
            }),
            screenshotUrl: new URL(
              capture.image.path,
              new URL("/__comments/reports/sessions/meeting-1/index.html", location.href),
            ),
          },
        ];
      }),
    );
  };
  const mutationsBeforeCopy = mutationRequests();
  copyAction("story")!.click();
  await waitFor(() => clipboardWrites.length === 1 && Boolean(copyStatus()?.textContent));
  const storyCopyMessage = copyStatus()?.textContent;
  copyAction("all")!.click();
  await waitFor(() => clipboardWrites.length === 2 && copyStatus()?.textContent !== storyCopyMessage);
  check(
    "panel copies the open tracking comments of its scope in ordinal order",
    copyAction("story")?.textContent === "Copy tracking prompts" &&
      copyAction("all")?.textContent === "Copy all stories" &&
      subsections(clipboardWrites[0]) === "2,5" &&
      storyCopyMessage === "Tracking prompt copied. Comments included: 2." &&
      subsections(clipboardWrites[1]) === "2,4,5" &&
      copyStatus()?.textContent === "Tracking prompt copied. Comments included: 3." &&
      copyStatus()?.getAttribute("aria-live") === "polite" &&
      mutationRequests() === mutationsBeforeCopy,
    JSON.stringify({
      all: subsections(clipboardWrites[1]),
      message: copyStatus()?.textContent,
      story: subsections(clipboardWrites[0]),
      storyCopyMessage,
    }),
  );
  check(
    "panel prompts equal the shared formatter output for the same meeting data",
    clipboardWrites[0] === expectedPanelPrompt("story") &&
      clipboardWrites[1] === expectedPanelPrompt("all") &&
      clipboardWrites[0]!.startsWith("# Tracking Instrumentation Request\n") &&
      clipboardWrites[0]!.includes(
        "- Project-relative screenshot path: design-system/figma-export-review/sessions/meeting-1/assets/comment-current-2.png",
      ) &&
      clipboardWrites[0]!.includes(
        `- Screenshot URL: ${location.origin}/__comments/reports/sessions/meeting-1/assets/comment-current-2.png`,
      ),
  );
  resultElement.dataset.stage = "handoff-failure";
  rejectClipboard = true;
  copyAction("story")!.click();
  await waitFor(
    () =>
      copyStatus()?.textContent ===
      "Unable to copy AI prompt. Check browser clipboard permission.",
  );
  rejectClipboard = false;
  failNextMeetingRead = true;
  copyAction("all")!.click();
  await settle(150);
  await waitFor(() => !copyAction("all")!.disabled);
  check(
    "clipboard or meeting read failure is reported without a mutation",
    copyStatus()?.textContent ===
      "Unable to copy AI prompt. Check browser clipboard permission." &&
      clipboardWrites.length === 2 &&
      mutationRequests() === mutationsBeforeCopy,
    copyStatus()?.textContent ?? "",
  );
  resultElement.dataset.stage = "handoff-external";
  projectRelativeSessionPath = null;
  await remountReview();
  await waitFor(() => copyAction("story"));
  copyAction("story")!.click();
  await waitFor(() => clipboardWrites.length === 3);
  check(
    "a session outside the project reports the project-relative path as unavailable",
    clipboardWrites[2]!.includes("- Project-relative screenshot path: unavailable") &&
      !clipboardWrites[2]!.includes("design-system/figma-export-review"),
  );
  projectRelativeSessionPath = "design-system/figma-export-review/sessions/meeting-1";
  mockComment("comment-other-story").resolvedAt = "2026-07-20T00:41:00.000Z";
  await remountReview();
  await waitFor(() => copyAction("story"));
  check(
    "Copy all stories appears only when another Story has open tracking comments",
    Boolean(copyAction("story")) && !copyAction("all"),
  );
  mockComment("comment-current-2").resolvedAt = "2026-07-20T00:42:00.000Z";
  mockComment("comment-current-4").resolvedAt = "2026-07-20T00:43:00.000Z";
  await remountReview();
  await waitFor(() => copyAction("story"));
  copyAction("story")!.click();
  await waitFor(() => copyStatus()?.textContent === "No open tracking comments to copy.");
  check(
    "nothing open to copy sends no clipboard write",
    clipboardWrites.length === 3 && mutationRequests() === mutationsBeforeCopy,
  );
  auditSurfaces("panel with the tracking handoff", ".sbfx-comments-panel");
  resultElement.dataset.stage = "handoff-visual-fix-only";
  const trackingKinds = comments
    .filter((comment) => comment.kind === "tracking")
    .map((comment) => comment.id as string);
  for (const id of trackingKinds) mockComment(id).kind = "visual-fix";
  await remountReview();
  await waitFor(() => currentCommentCards().length === 4);
  await settle(300);
  check(
    "an active meeting with only visual-fix comments renders no copy action",
    trackingKinds.length > 0 &&
      Boolean(button("End meeting")) &&
      !copyAction("story") &&
      !copyAction("all") &&
      !copyStatus()?.textContent,
    String(trackingKinds),
  );
  for (const id of trackingKinds) mockComment(id).kind = "tracking";
  // Restore the fixture data the later sections rely on.
  delete mockComment("comment-current-2").kind;
  mockComment("comment-current-2").resolvedAt = "2026-07-20T00:30:00.000Z";
  delete mockComment("comment-current-3").kind;
  delete mockComment("comment-current-3").resolvedAt;
  delete mockComment("comment-other-story").kind;
  delete mockComment("comment-other-story").resolvedAt;
  delete mockComment("comment-current-4").resolvedAt;
  await remountReview();
  await waitFor(() => currentCommentCards().length === 4);

  const createCommentRequestCount = () =>
    requests.filter(
      (request) => request.method === "POST" && request.path.endsWith("/comments"),
    ).length;
  const patchCount = () =>
    requests.filter((request) => request.method === "PATCH").length;
  const savedEvidenceCard = () =>
    commentsPanel.querySelector<HTMLElement>(
      '.sbfx-comments-panel__comment[data-comment-id="comment-current-4"]',
    )!;
  const commentEditModal = () =>
    document.querySelector<HTMLElement>("[data-comment-edit-modal]")!;
  const commentEditDialog = () =>
    commentEditModal().querySelector<HTMLElement>('[role="dialog"]')!;
  const captureRequestsBeforeSavedEdit = createCommentRequestCount();
  const savedEditTrigger = savedEvidenceCard().querySelector<HTMLButtonElement>(
    '[aria-label="Edit comment"]',
  )!;
  savedEditTrigger.click();
  await waitFor(() => document.querySelector("[data-comment-edit-modal]"));
  auditSurfaces("panel edit modal", "[data-comment-edit-modal]");
  const savedEvidencePreview = commentEditModal().querySelector<HTMLElement>(
    "[data-comment-evidence-preview]",
  )!;
  const editModalRect = commentEditDialog().getBoundingClientRect();
  const editPreviewRect = savedEvidencePreview.getBoundingClientRect();
  const commentsPanelRect = commentsPanel.getBoundingClientRect();
  check(
    "saved comment edit opens one accessible body-level modal instead of an inline card editor",
    !commentsPanel.contains(commentEditModal()) &&
      commentEditDialog().getAttribute("aria-modal") === "true" &&
      Boolean(commentEditDialog().getAttribute("aria-labelledby")) &&
      commentEditModal().getAttribute("data-sbfx-capture-ignore") === "true" &&
      !savedEvidenceCard().querySelector("textarea") &&
      editModalRect.width > commentsPanelRect.width &&
      editPreviewRect.width > commentsPanelRect.width &&
      editModalRect.left >= 0 &&
      editModalRect.right <= window.innerWidth &&
      editModalRect.top >= 0 &&
      editModalRect.bottom <= window.innerHeight,
    JSON.stringify({
      outsidePanel: !commentsPanel.contains(commentEditModal()),
      modal: {
        bottom: editModalRect.bottom,
        left: editModalRect.left,
        right: editModalRect.right,
        top: editModalRect.top,
        width: editModalRect.width,
      },
      panelWidth: commentsPanelRect.width,
      previewWidth: editPreviewRect.width,
      viewport: { height: window.innerHeight, width: window.innerWidth },
    }),
  );
  check(
    "saved comment modal shows its stored aspect ratio pin and meeting-wide ordinal",
    savedEvidencePreview.style.aspectRatio === "400 / 240" &&
      savedEvidencePreview.querySelector("[data-comment-edit-pin]")?.textContent === "5" &&
      savedEvidencePreview.querySelector("[data-comment-edit-pin]")?.getAttribute("aria-label") ===
        "Adjust comment point 5" &&
      document.activeElement === savedEvidencePreview.querySelector("[data-comment-edit-pin]"),
    JSON.stringify({
      activeElement: document.activeElement?.outerHTML,
      aspectRatio: savedEvidencePreview.style.aspectRatio,
      pinLabel: savedEvidencePreview
        .querySelector("[data-comment-edit-pin]")
        ?.getAttribute("aria-label"),
      pinText: savedEvidencePreview.querySelector("[data-comment-edit-pin]")?.textContent,
    }),
  );
  const savedEditPin = () =>
    commentEditModal().querySelector<HTMLButtonElement>("[data-comment-edit-pin]")!;
  const savedPreviewRect = savedEvidencePreview.getBoundingClientRect();
  dispatchPointerSequence(
    savedEvidencePreview,
    savedPreviewRect.left + savedPreviewRect.width * 0.4,
    savedPreviewRect.top + savedPreviewRect.height * 0.55,
  );
  await waitFor(
    () => savedEditPin().style.left === "40%" && savedEditPin().style.top === "55%",
  );
  savedEditPin().focus();
  savedEditPin().dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
    }),
  );
  savedEditPin().dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowDown",
      shiftKey: true,
    }),
  );
  await waitFor(
    () => savedEditPin().style.left === "41%" && savedEditPin().style.top === "60%",
  );
  check(
    "saved comment point supports pointer and keyboard draft adjustment without a Story tag",
    patchCount() === 0 &&
      createCommentRequestCount() === captureRequestsBeforeSavedEdit &&
      !document.querySelector("[data-sbfx-live-comment-pin]"),
  );
  commentEditModal()
    .querySelector<HTMLButtonElement>("[data-comment-edit-cancel]")!
    .click();
  await waitFor(
    () =>
      !document.querySelector("[data-comment-edit-modal]") &&
      document.activeElement === savedEditTrigger,
  );
  check(
    "cancelling a saved evidence modal restores its canonical point without a request and returns focus",
    patchCount() === 0 &&
      createCommentRequestCount() === captureRequestsBeforeSavedEdit &&
      document.activeElement === savedEditTrigger,
  );

  savedEditTrigger.click();
  await waitFor(() => document.querySelector("[data-comment-edit-pin]"));
  check(
    "reopening a cancelled saved edit restores the canonical point",
    savedEditPin().style.left === "61%" && savedEditPin().style.top === "75%",
  );
  const retryPreview = commentEditModal().querySelector<HTMLElement>(
    "[data-comment-evidence-preview]",
  )!;
  const retryPreviewRect = retryPreview.getBoundingClientRect();
  dispatchPointerSequence(
    retryPreview,
    retryPreviewRect.left + retryPreviewRect.width * 0.32,
    retryPreviewRect.top + retryPreviewRect.height * 0.46,
  );
  await waitFor(
    () => savedEditPin().style.left === "32%" && savedEditPin().style.top === "46%",
  );
  const savedBodyDraft = commentEditModal().querySelector<HTMLTextAreaElement>("textarea")!;
  setNativeValue(savedBodyDraft, "Updated saved comment and point");
  failNextCommentPatch = true;
  commentEditModal()
    .querySelector<HTMLButtonElement>("[data-comment-edit-save]")!
    .click();
  await waitFor(
    () =>
      patchCount() === 1 &&
      commentEditModal().textContent?.includes("Temporary comment update failure."),
  );
  check(
    "failed saved point edit retains both drafts in the open modal",
    savedBodyDraft.value === "Updated saved comment and point" &&
      savedEditPin().style.left === "32%" &&
      savedEditPin().style.top === "46%",
  );
  commentEditModal()
    .querySelector<HTMLButtonElement>("[data-comment-edit-save]")!
    .click();
  await waitFor(
    () =>
      patchCount() === 2 &&
      !document.querySelector("[data-comment-edit-modal]") &&
      savedEvidenceCard().textContent?.includes("Updated saved comment and point"),
  );
  const savedEditPayload = requests.filter((request) => request.method === "PATCH").at(-1)
    ?.body as { body?: string; pin?: { xRatio: number; yRatio: number } } | undefined;
  check(
    "saving a saved point edit sends one atomic body and pin payload and keeps the panel expanded",
    savedEditPayload?.body === "Updated saved comment and point" &&
      Math.abs((savedEditPayload?.pin?.xRatio ?? -1) - 0.32) < 0.0001 &&
      Math.abs((savedEditPayload?.pin?.yRatio ?? -1) - 0.46) < 0.0001 &&
      commentsPanel.dataset.expanded === "true" &&
      !commentsDetail.hidden &&
      createCommentRequestCount() === captureRequestsBeforeSavedEdit,
  );

  const editableCard = () =>
    commentsPanel.querySelector<HTMLElement>(
      '.sbfx-comments-panel__comment[data-comment-id="comment-current-3"]',
    )!;
  editableCard()
    .querySelector<HTMLButtonElement>('[aria-label="Edit comment"]')!
    .click();
  await waitFor(() => document.querySelector("[data-comment-edit-modal] textarea"));
  await waitFor(() =>
    document.querySelector("[data-comment-edit-modal] [data-comment-evidence-unavailable]"),
  );
  check(
    "failed evidence image keeps the comment body editor usable",
    commentEditModal().textContent?.includes("Screenshot evidence is unavailable.") === true &&
      Boolean(commentEditModal().querySelector("textarea")) &&
      document.activeElement === commentEditModal().querySelector("textarea"),
  );
  const cancelledDraft = commentEditModal().querySelector<HTMLTextAreaElement>("textarea")!;
  setNativeValue(cancelledDraft, "Cancelled edit");
  commentEditModal().querySelector<HTMLButtonElement>("[data-comment-edit-cancel]")!.click();
  await waitFor(
    () =>
      !document.querySelector("[data-comment-edit-modal]") &&
      editableCard().textContent?.includes("Recent current-story comment"),
  );
  check(
    "cancelled panel edit sends no request and restores the stored body",
    patchCount() === 2 &&
      createCommentRequestCount() === captureRequestsBeforeSavedEdit &&
      editableCard().textContent?.includes("Recent current-story comment") === true &&
      !document.querySelector("[data-comment-edit-modal]"),
  );

  const editableTrigger = editableCard().querySelector<HTMLButtonElement>(
    '[aria-label="Edit comment"]',
  )!;
  editableTrigger.click();
  await waitFor(() => document.querySelector("[data-comment-edit-modal] textarea"));
  const editDraft = commentEditModal().querySelector<HTMLTextAreaElement>("textarea")!;
  setNativeValue(editDraft, "   ");
  const saveEditButton = commentEditModal().querySelector<HTMLButtonElement>(
    "[data-comment-edit-save]",
  )!;
  check(
    "invalid panel edit is blocked without a request",
    saveEditButton.disabled && patchCount() === 2,
  );
  setNativeValue(editDraft, "Updated recent comment");
  await waitFor(() => !saveEditButton.disabled);
  document.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
  );
  await waitFor(
    () =>
      !document.querySelector("[data-comment-edit-modal]") &&
      document.activeElement === editableTrigger,
  );
  check(
    "Escape closes the comment edit modal without a request and returns focus",
    patchCount() === 2 && document.activeElement === editableTrigger,
  );
  editableTrigger.click();
  await waitFor(() => document.querySelector("[data-comment-edit-modal]"));
  commentEditModal().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await waitFor(
    () =>
      !document.querySelector("[data-comment-edit-modal]") &&
      document.activeElement === editableTrigger,
  );
  check(
    "backdrop closes the comment edit modal without a request and returns focus",
    patchCount() === 2 && document.activeElement === editableTrigger,
  );
  editableTrigger.click();
  await waitFor(() => document.querySelector("[data-comment-edit-modal] textarea"));
  setNativeValue(
    commentEditModal().querySelector<HTMLTextAreaElement>("textarea")!,
    "Updated recent comment",
  );
  const retrySaveEditButton = commentEditModal().querySelector<HTMLButtonElement>(
    "[data-comment-edit-save]",
  )!;
  await waitFor(() => !retrySaveEditButton.disabled);
  retrySaveEditButton.click();
  await waitFor(
    () =>
      patchCount() === 3 &&
      editableCard().textContent?.includes("Updated recent comment"),
  );
  check(
    "missing evidence saves a body-only PATCH and keeps the panel expanded",
    JSON.stringify(
      requests.filter((request) => request.method === "PATCH").at(-1)?.body,
    ) === JSON.stringify({ body: "Updated recent comment" }) &&
      commentsPanel.dataset.expanded === "true" &&
      !commentsDetail.hidden,
    JSON.stringify({
      expanded: commentsPanel.dataset.expanded,
      hidden: commentsDetail.hidden,
      payload: requests.filter((request) => request.method === "PATCH").at(-1)?.body,
    }),
  );

  const deletableCard = () =>
    commentsPanel.querySelector<HTMLElement>(
      '.sbfx-comments-panel__comment[data-comment-id="comment-current-2"]',
    );
  const deleteCount = () =>
    requests.filter((request) => request.method === "DELETE").length;
  const openDeleteDialog = () => {
    deletableCard()
      ?.querySelector<HTMLButtonElement>('[aria-label="Delete comment"]')
      ?.click();
  };
  openDeleteDialog();
  await waitFor(() => commentsPanel.querySelector('[role="dialog"]'));
  auditSurfaces("delete confirmation", ".sbfx-comments-panel__dialog-backdrop");
  const deleteDialog = () =>
    commentsPanel.querySelector<HTMLElement>('[role="dialog"]')!;
  const deleteTrigger = deletableCard()!.querySelector<HTMLButtonElement>(
    '[aria-label="Delete comment"]',
  )!;
  deleteDialog().querySelector<HTMLButtonElement>("[data-comment-delete-cancel]")!.click();
  await waitFor(
    () =>
      !commentsPanel.querySelector('[role="dialog"]') &&
      document.activeElement === deleteTrigger,
  );
  check(
    "panel delete Cancel sends no request and restores focus",
    deleteCount() === 0 && document.activeElement === deleteTrigger,
  );
  openDeleteDialog();
  await waitFor(() => commentsPanel.querySelector('[role="dialog"]'));
  document.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
  );
  await waitFor(
    () =>
      !commentsPanel.querySelector('[role="dialog"]') &&
      document.activeElement === deleteTrigger,
  );
  check(
    "panel delete Escape sends no request and restores focus",
    deleteCount() === 0 && document.activeElement === deleteTrigger,
  );
  openDeleteDialog();
  await waitFor(() => commentsPanel.querySelector('[role="dialog"]'));
  deleteDialog().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await waitFor(
    () =>
      !commentsPanel.querySelector('[role="dialog"]') &&
      document.activeElement === deleteTrigger,
  );
  check(
    "panel delete backdrop sends no request and restores focus",
    deleteCount() === 0 && document.activeElement === deleteTrigger,
  );
  openDeleteDialog();
  await waitFor(() => commentsPanel.querySelector('[role="dialog"]'));
  deleteDialog()
    .querySelector<HTMLButtonElement>("[data-comment-delete-confirm]")!
    .click();
  await waitFor(() => deleteCount() === 1 && !deletableCard());
  check(
    "panel delete confirmation sends one request and keeps the panel expanded",
    commentsPanel.dataset.expanded === "true" &&
      !commentsDetail.hidden &&
      currentCommentCards().map((card) => card.dataset.commentId).join(",") ===
        "comment-current-4,comment-current-3,comment-current-1",
  );
  check(
    "Delete recomputes current panel comments to contiguous meeting-wide ordinals",
    currentCommentCards()[0]?.querySelector("[aria-label='Edit comment']") !== null &&
      comments.findIndex((comment) => comment.id === "comment-current-4") + 1 === 4,
  );
  const missingEvidenceCard = commentsPanel.querySelector<HTMLElement>(
    '.sbfx-comments-panel__comment[data-comment-id="comment-current-1"]',
  )!;
  missingEvidenceCard
    .querySelector<HTMLButtonElement>('[aria-label="Edit comment"]')!
    .click();
  await waitFor(() =>
    document.querySelector("[data-comment-edit-modal] [data-comment-evidence-unavailable]"),
  );
  check(
    "null evidence fallback keeps the body editor usable without recapture",
    Boolean(commentEditModal().querySelector("textarea")) &&
      createCommentRequestCount() === captureRequestsBeforeSavedEdit,
  );
  commentEditModal()
    .querySelector<HTMLButtonElement>("[data-comment-edit-cancel]")!
    .click();
  missingEvidenceCard
    .querySelector<HTMLButtonElement>('[aria-label="Edit comment"]')!
    .click();
  await waitFor(() => document.querySelector("[data-comment-edit-modal]"));
  commentsToggle.click();
  await waitFor(
    () =>
      !document.querySelector("[data-comment-edit-modal]") &&
      commentsPanel.dataset.expanded === "false",
  );
  check(
    "collapsing Visual comments removes the body-level edit overlay without a request",
    patchCount() === 3 && !document.querySelector("[data-comment-edit-modal]"),
  );
  commentsToggle.click();
  await waitFor(() => commentsPanel.dataset.expanded === "true");

  // Kind is corrected in the panel edit modal without replacing evidence.
  const kindCard = () =>
    commentsPanel.querySelector<HTMLElement>(
      '.sbfx-comments-panel__comment[data-comment-id="comment-current-4"]',
    )!;
  const kindCardLabel = () =>
    kindCard().querySelector<HTMLElement>(".sbfx-comments-panel__comment-kind");
  const editKindControl = () =>
    document.querySelector<HTMLElement>(
      "[data-comment-edit-modal] [data-comment-edit-kind]",
    );
  const editKind = () => editKindControl()?.dataset.commentKindValue;
  const selectEditKind = (kind: string) => chooseKind(editKindControl, kind);
  const kindCardCanonical = () =>
    comments.find((comment) => comment.id === "comment-current-4") as {
      body: string;
      capture?: unknown;
      kind?: string;
      pin: { xRatio: number; yRatio: number };
    };
  const kindEvidenceBefore = JSON.stringify({
    body: kindCardCanonical().body,
    capture: kindCardCanonical().capture,
    pin: kindCardCanonical().pin,
  });
  const patchesBeforeKindEdit = patchCount();
  const openKindCardEditor = async () => {
    kindCard().querySelector<HTMLButtonElement>('[aria-label="Edit comment"]')!.click();
    await waitFor(() => editKindControl());
  };
  await openKindCardEditor();
  check(
    "panel edit modal shows the stored comment kind",
    JSON.stringify(kindControlState(editKindControl())) ===
      JSON.stringify({
        label: "Comment type",
        options: "Visual fix:false,Tracking:true",
        role: "group",
        value: "tracking",
      }),
    JSON.stringify(kindControlState(editKindControl())),
  );
  await selectEditKind("visual-fix");
  commentEditModal()
    .querySelector<HTMLButtonElement>("[data-comment-edit-cancel]")!
    .click();
  await waitFor(() => !document.querySelector("[data-comment-edit-modal]"));
  await openKindCardEditor();
  check(
    "cancelling a kind draft sends no request and restores the canonical kind",
    patchCount() === patchesBeforeKindEdit &&
      editKind() === "tracking" &&
      kindCardLabel()?.dataset.commentKind === "tracking",
  );
  await selectEditKind("visual-fix");
  commentEditModal()
    .querySelector<HTMLButtonElement>("[data-comment-edit-save]")!
    .click();
  await waitFor(
    () =>
      !document.querySelector("[data-comment-edit-modal]") &&
      kindCardLabel()?.dataset.commentKind === "visual-fix",
  );
  const visualFixKindPayload = requests.filter((request) => request.method === "PATCH").at(-1)
    ?.body as { body?: string; kind?: string; pin?: unknown } | undefined;
  check(
    "a changed kind travels in the single edit request",
    patchCount() === patchesBeforeKindEdit + 1 &&
      visualFixKindPayload?.kind === "visual-fix" &&
      visualFixKindPayload?.body === kindCardCanonical().body,
    JSON.stringify(visualFixKindPayload),
  );
  // Every current-Story comment is a visual fix now, so Tracking matches none.
  const mutationsBeforeEmptyFilter = mutationRequests();
  filterOption("tracking").click();
  await waitFor(() => commentsPanel.querySelector("[data-comments-empty]"));
  check(
    "empty filter shows one message and stays selectable",
    filterOption("tracking").textContent === "Tracking 0" &&
      filterOption("tracking").getAttribute("aria-pressed") === "true" &&
      currentCommentCards().length === 0 &&
      commentsPanel.querySelectorAll("[data-comments-empty]").length === 1 &&
      commentsPanel.querySelector("[data-comments-empty]")?.textContent ===
        "No comments of this type on this story." &&
      mutationRequests() === mutationsBeforeEmptyFilter,
    filterLabels(),
  );
  filterOption("all").click();
  await waitFor(() => currentCommentCards().length === 3);
  await openKindCardEditor();
  await selectEditKind("tracking");
  commentEditModal()
    .querySelector<HTMLButtonElement>("[data-comment-edit-save]")!
    .click();
  await waitFor(
    () =>
      !document.querySelector("[data-comment-edit-modal]") &&
      kindCardLabel()?.dataset.commentKind === "tracking",
  );
  check(
    "kind is corrected in the panel edit modal",
    kindCardLabel()?.textContent === "Tracking" &&
      kindCardCanonical().kind === "tracking" &&
      patchCount() === patchesBeforeKindEdit + 2 &&
      JSON.stringify({
        body: kindCardCanonical().body,
        capture: kindCardCanonical().capture,
        pin: kindCardCanonical().pin,
      }) === kindEvidenceBefore,
    JSON.stringify({ label: kindCardLabel()?.textContent, kind: kindCardCanonical().kind }),
  );
  await openKindCardEditor();
  commentEditModal()
    .querySelector<HTMLButtonElement>("[data-comment-edit-save]")!
    .click();
  await waitFor(() => !document.querySelector("[data-comment-edit-modal]"));
  check(
    "an unchanged kind is not sent with an edit",
    !("kind" in
      ((requests.filter((request) => request.method === "PATCH").at(-1)?.body ?? {}) as object)),
    JSON.stringify(requests.filter((request) => request.method === "PATCH").at(-1)?.body),
  );

  const reviewSlot = workspace.querySelector<HTMLElement>('[data-sbfx-workspace-slot="review"]')!;
  const reviewPreferenceBeforeParentCollapse = localStorage.getItem("sbfx:review-collapsed");
  document.querySelector<HTMLButtonElement>('[aria-label="Collapse Figma export panel"]')!.click();
  await waitFor(() => workspace.dataset.exportCollapsed === "true");
  const collapsedExportToggle = document.querySelector<HTMLButtonElement>('[aria-label="Expand Figma export panel"]');
  const collapsedWorkspaceRect = workspace.getBoundingClientRect();
  const collapsedExporter = workspace.querySelector<HTMLElement>(".sbfx-exporter")!;
  const collapsedExporterRect = collapsedExporter.getBoundingClientRect();
  const collapsedTitleLabel = collapsedExporter.querySelector<HTMLElement>(
    ".sbfx-exporter__title-label",
  );
  const collapsedSubtitle = collapsedExporter.querySelector<HTMLElement>(
    ".sbfx-exporter__subtitle",
  );
  const collapsedVersion = collapsedExporter.querySelector<HTMLElement>(
    ".sbfx-exporter__version",
  );
  const collapsedToggleIcon = collapsedExportToggle?.querySelector<HTMLElement>(
    ".sbfx-exporter__toggle-icon",
  );
  check(
    "collapsed Figma export hugs only its mark and version",
    Boolean(
      collapsedWorkspaceRect.width < 320 &&
        Math.abs(collapsedWorkspaceRect.width - collapsedExporterRect.width) <= 2.5 &&
        collapsedTitleLabel &&
        getComputedStyle(collapsedTitleLabel).display === "none" &&
        collapsedSubtitle &&
        getComputedStyle(collapsedSubtitle).display === "none" &&
        collapsedVersion &&
        getComputedStyle(collapsedVersion).display !== "none" &&
        collapsedVersion.getBoundingClientRect().width > 0 &&
        collapsedToggleIcon &&
        getComputedStyle(collapsedToggleIcon).display === "none",
    ),
    JSON.stringify({ collapsedExporterRect, collapsedWorkspaceRect }),
  );
  check(
    "collapsed Figma export hides the complete review slot without changing review state",
    collapsedExportToggle?.getAttribute("aria-expanded") === "false" &&
      collapsedExportToggle?.getAttribute("aria-label") === "Expand Figma export panel" &&
      collapsedExportToggle?.querySelector("path")?.getAttribute("d") === canonicalUnfoldMorePath &&
      getComputedStyle(reviewSlot).display === "none" &&
      reviewSlot.getBoundingClientRect().height === 0 &&
      exportReviewPanel()?.getAttribute("data-collapsed") === "false" &&
      localStorage.getItem("sbfx:review-collapsed") === reviewPreferenceBeforeParentCollapse,
  );
  collapsedExportToggle!.click();
  await waitFor(
    () =>
      workspace.dataset.exportCollapsed === "false" &&
      getComputedStyle(reviewSlot).display !== "none",
  );
  const restoredWorkspaceRect = workspace.getBoundingClientRect();
  check(
    "reopening Figma export restores the prior expanded review state",
    document.querySelector(".sbfx-exporter")?.getAttribute("data-collapsed") === "false" &&
      exportReviewPanel()?.getAttribute("data-collapsed") === "false" &&
      localStorage.getItem("sbfx:review-collapsed") === reviewPreferenceBeforeParentCollapse &&
      (expectedOrientation === "side"
        ? Math.abs(restoredWorkspaceRect.width - 320) <= 0.5
        : Math.abs(restoredWorkspaceRect.width - (window.innerWidth - 32)) <= 0.5) &&
      Boolean(
        collapsedTitleLabel &&
          getComputedStyle(collapsedTitleLabel).display !== "none" &&
          collapsedSubtitle &&
          getComputedStyle(collapsedSubtitle).display !== "none" &&
          collapsedToggleIcon &&
          getComputedStyle(collapsedToggleIcon).display !== "none",
      ),
  );
  document.querySelector<HTMLButtonElement>('[aria-label="Collapse export review panel"]')!.click();
  await waitFor(() => exportReviewPanel()?.getAttribute("data-collapsed") === "true");
  document.querySelector<HTMLButtonElement>('[aria-label="Collapse Figma export panel"]')!.click();
  await waitFor(() => workspace.dataset.exportCollapsed === "true");
  document.querySelector<HTMLButtonElement>('[aria-label="Expand Figma export panel"]')?.click();
  await waitFor(
    () =>
      workspace.dataset.exportCollapsed === "false" &&
      getComputedStyle(reviewSlot).display !== "none",
  );
  check(
    "parent disclosure preserves a collapsed Export review preference",
    exportReviewPanel()?.getAttribute("data-collapsed") === "true" &&
      localStorage.getItem("sbfx:review-collapsed") === "1" &&
      localStorage.getItem("sbfx:exporter-collapsed") === "0" &&
      exportReviewPanel()?.querySelector(".sbfx-review__toggle")?.getAttribute("aria-label") === "Expand export review panel" &&
      exportReviewPanel()?.querySelector(".sbfx-review__toggle path")?.getAttribute("d") === canonicalUnfoldMorePath &&
      document.querySelector(".sbfx-exporter__toggle")?.getAttribute("aria-label") === "Collapse Figma export panel" &&
      document.querySelector(".sbfx-exporter__toggle path")?.getAttribute("d") === canonicalCollapsePath,
  );

  syncFigmaExportOverlay(
    {
      globals: { figmaExport: "on" },
      id: "demo--story-two",
      name: "Story two",
      title: "Demo",
      viewMode: "story",
    },
    { storyTitlePrefix: false },
  );
  mount.render(
    h(FigmaExportReview, {
      apiPath: "/status",
      componentTitle: "Button",
      enabled: true,
      showNotes: false,
      storyId: "demo--story-two",
      storyName: "Story two",
      storyTitle: "Demo",
      storyUrl: location.href,
      viewMode: "story",
      visualComments: { apiPath: "/__comments", captureSelector: "#storybook-root" },
    }),
  );
  await waitFor(() => exportReviewPanel()?.getAttribute("data-save-state") !== "loading");
  check(
    "story change preserves each panel preference without duplicating workspace",
    exportReviewPanel()?.getAttribute("data-collapsed") === "true" &&
      document.querySelector(".sbfx-exporter")?.getAttribute("data-collapsed") === "false" &&
      workspace.dataset.exportCollapsed === "false" &&
      document.querySelectorAll("[data-sbfx-workspace]").length === 1,
  );
  const rerenderedSlots = Array.from(
    document.querySelectorAll<HTMLElement>(
      "[data-sbfx-workspace] > [data-sbfx-workspace-slot]",
    ),
  );
  check(
    "story change preserves export-before-review slot order",
    rerenderedSlots.length === 2 &&
      rerenderedSlots[0]?.dataset.sbfxWorkspaceSlot === "export" &&
      rerenderedSlots[1]?.dataset.sbfxWorkspaceSlot === "review",
  );

  statusAvailable = false;
  mount.render(
    h(FigmaExportReview, {
      apiPath: "/status",
      componentTitle: "Button",
      enabled: true,
      showNotes: false,
      storyId: "demo--status-unavailable",
      storyName: "Status unavailable",
      storyTitle: "Demo",
      storyUrl: location.href,
      viewMode: "story",
      visualComments: { apiPath: "/__comments", captureSelector: "#storybook-root" },
    }),
  );
  await waitFor(() => exportReviewPanel()?.getAttribute("data-save-state") === "error");
  check(
    "status 404 names its endpoint without disabling comments",
    exportReviewPanel()?.textContent?.includes("Review status GET /status returned HTTP 404") &&
      commentsPanel.querySelector(".sbfx-review__visual-comments")?.getAttribute("data-comments-capability") === "available" &&
      !button("Add comment")?.disabled,
  );

  statusAvailable = true;
  commentsAvailable = false;
  mount.render(
    h(FigmaExportReview, {
      apiPath: "/status",
      componentTitle: "Button",
      enabled: true,
      showNotes: false,
      storyId: "demo--comments-unavailable",
      storyName: "Comments unavailable",
      storyTitle: "Demo",
      storyUrl: location.href,
      viewMode: "story",
      visualComments: { apiPath: "/__comments", captureSelector: "#storybook-root" },
    }),
  );
  await waitFor(() => commentsPanel.querySelector(".sbfx-review__visual-comments")?.getAttribute("data-comments-capability") === "error");
  check(
    "comments 404 names its endpoint and disables only comments mutations",
    exportReviewPanel()?.getAttribute("data-save-state") !== "error" &&
      commentsPanel.textContent?.includes("Visual comments GET /__comments returned HTTP 404") &&
      Boolean(button("Add comment")?.disabled) &&
      commentsPanel.querySelectorAll(".sbfx-review__report-link").length === 1 &&
      !commentsPanel.querySelector(".sbfx-review__history-item"),
  );

  commentsAvailable = true;
  await waitFor(
    () => commentsPanel.querySelector(".sbfx-review__visual-comments")?.getAttribute("data-comments-capability") === "available" &&
      !button("Add comment")?.disabled,
    8_000,
  );
  check(
    "successful comments poll restores comments controls",
    !commentsPanel.textContent?.includes("Visual comments GET /__comments returned HTTP 404"),
  );

  // Direct commenting when another browser starts a meeting first, and the
  // named meeting that stays available as a secondary action.
  button("End meeting")!.click();
  await waitFor(() => button("Start a named meeting") && !button("Add comment")!.disabled);
  check(
    "ending the meeting returns to direct commenting",
    !commentsPanel.querySelector("[data-meeting-title]") &&
      !button("End meeting") &&
      commentsPanel.dataset.expanded === "true",
  );
  button("Change")!.click();
  await waitFor(() => identity()?.querySelector("input"));
  setNativeValue(identity()!.querySelector<HTMLInputElement>("input")!, "");
  button("Save name")!.click();
  await waitFor(() => identity()?.dataset.commentingAs === "Anonymous");
  conflictNextMeetingStart = true;
  await openComposer();
  check(
    "first comment without a meeting shows ordinal one",
    pendingPin().textContent === "1",
  );
  setNativeValue(composerBody()!, "Concurrent meeting comment");
  await waitFor(() => !button("Save comment")!.disabled);
  const startsBeforeConflict = meetingStarts().length;
  const createsBeforeConflict = createCommentRequests().length;
  button("Save comment")!.click();
  await waitFor(
    () => createCommentRequests().length === createsBeforeConflict + 1 && !composer(),
  );
  await waitFor(
    () =>
      commentsPanel.querySelector("[data-meeting-title]")?.textContent ===
      "Weekly design review",
  );
  check(
    "a concurrently started meeting is reused",
    meetingStarts().length === startsBeforeConflict + 1 &&
      (meetingStarts().at(-1)?.body as { title?: string } | undefined)?.title === notesTitle &&
      createCommentRequests().at(-1)?.path === "/sessions/meeting-1/comments" &&
      (createCommentRequests().at(-1)?.body as { authorName?: string } | undefined)
        ?.authorName === "Anonymous" &&
      !errorToast() &&
      currentCommentCards().some((card) => card.textContent?.includes("Concurrent meeting comment")),
    JSON.stringify({ starts: meetingStarts().length, path: createCommentRequests().at(-1)?.path }),
  );
  button("End meeting")!.click();
  await waitFor(() => button("Start a named meeting"));
  button("Start a named meeting")!.click();
  await waitFor(() => document.querySelector('[aria-label="Meeting title"]'));
  await waitFor(
    () => document.activeElement === document.querySelector('[aria-label="Meeting title"]'),
  );
  setNativeValue(
    document.querySelector<HTMLInputElement>('[aria-label="Meeting title"]')!,
    "Weekly design review 2",
  );
  await waitFor(() => button("Start meeting")?.disabled === false);
  button("Start meeting")!.click();
  await waitFor(
    () =>
      commentsPanel.querySelector("[data-meeting-title]")?.textContent ===
      "Weekly design review 2",
  );
  check(
    "named meeting remains available and keeps the panel expanded",
    (meetingStarts().at(-1)?.body as { title?: string } | undefined)?.title ===
      "Weekly design review 2" &&
      Boolean(button("End meeting")) &&
      !document.querySelector('[aria-label="Meeting title"]') &&
      commentsPanel.dataset.expanded === "true" &&
      commentsToggle.getAttribute("aria-expanded") === "true" &&
      !commentsDetail.hidden,
  );
  // Docs view offers neither capture nor the shortcut.
  mount.render(
    h(FigmaExportReview, reviewProps({ storyId: "demo--docs", viewMode: "docs" })),
  );
  await waitFor(() => !document.querySelector(".sbfx-comments-panel"));
  const docsShortcut = pressKey(document.body, { key: "c" });
  await settle();
  check(
    "Docs view offers no comments panel, capture, or shortcut",
    !document.querySelector(".sbfx-comments-panel") &&
      !button("Add comment") &&
      !docsShortcut.defaultPrevented &&
      !captureMode() &&
      !capturePrompt(),
  );
  mount.render(
    h(FigmaExportReview, {
      apiPath: "/status",
      componentTitle: "Button",
      enabled: true,
      labels: { addVisualComment: "Capture note" },
      showNotes: false,
      storyId: "demo--custom-comment-label",
      storyName: "Custom comment label",
      storyTitle: "Demo",
      storyUrl: location.href,
      viewMode: "story",
      visualComments: { apiPath: "/__comments", captureSelector: "#storybook-root" },
    }),
  );
  await waitFor(() => button("Capture note"));
  button("Capture note")!.click();
  await waitFor(() => button("Cancel capture"));
  check(
    "custom addVisualComment label preserves point capture",
    Boolean(button("Cancel capture")) && !button("Add comment"),
  );
  button("Cancel capture")!.click();
  await waitFor(() => button("Capture note"));
  document.querySelector<HTMLButtonElement>('[aria-label="Expand Figma export panel"]')?.click();
  document.querySelector<HTMLButtonElement>('[aria-label="Expand export review panel"]')?.click();
  const createRequestsBeforeUnmount = createCommentRequestCount();
  button("Capture note")!.click();
  dispatchPointerSequence(prototypeButton, 100, 64);
  window.fetch = originalFetch;
  mount.unmount();
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  check(
    "unmount clears an in-flight live tag without creating a comment",
    !document.querySelector("[data-sbfx-live-comment-pin]") &&
      createCommentRequestCount() === createRequestsBeforeUnmount,
  );

  const identityDecorator = createFigmaExportReviewDecorator(
    { storyTitlePrefix: false },
    { enabled: true, visualComments: { enabled: false } },
  );
  const baseContext = {
    id: "identity--default",
    name: "Default",
    parameters: {},
    title: "Identity",
    viewMode: "story",
  };
  const reactLikeResult = Object.freeze({ type: "react-like", props: {} });
  const vueLikeResult = Object.freeze({ type: "vue-like", children: [] });
  let storyCallCount = 0;
  const returnedReactLike = identityDecorator(
    () => {
      storyCallCount += 1;
      return reactLikeResult;
    },
    { ...baseContext, globals: { figmaExport: "on" } },
  );
  const firstReviewHost = document.querySelector("[data-sbfx-review-host]");
  const returnedVueLike = identityDecorator(
    () => {
      storyCallCount += 1;
      return vueLikeResult;
    },
    { ...baseContext, id: "identity--vue", globals: { figmaExport: "on" } },
  );
  check(
    "review decorator preserves strict story-result identity for React-like and Vue-like values",
    returnedReactLike === reactLikeResult &&
      returnedVueLike === vueLikeResult &&
      storyCallCount === 2,
  );
  check(
    "re-render updates one stable review host without duplication",
    document.querySelector("[data-sbfx-review-host]") === firstReviewHost &&
      document.querySelectorAll("[data-sbfx-review-host]").length === 1,
  );
  const disabledResult = Object.freeze({ type: "disabled" });
  const returnedDisabled = identityDecorator(
    () => disabledResult,
    { ...baseContext, globals: { figmaExport: "off" } },
  );
  check(
    "global off returns the story unchanged and unmounts the review host",
    returnedDisabled === disabledResult &&
      document.querySelectorAll("[data-sbfx-review-host]").length === 0,
  );
  identityDecorator(
    () => vueLikeResult,
    { ...baseContext, id: "identity--remount", globals: { figmaExport: "on" } },
  );
  check(
    "global on remounts exactly one fresh review host",
    document.querySelectorAll("[data-sbfx-review-host]").length === 1 &&
      document.querySelector("[data-sbfx-review-host]") !== firstReviewHost,
  );
  destroyFigmaReviewWorkspace();
}

type VisualCommentOverview = {
  activeSession: { id: string; title: string; startedAt: string; closedAt: string | null; captureCount: number; commentCount: number } | null;
};

run()
  .then(() => {
    resultElement.textContent = btoa(JSON.stringify({ results }));
  })
  .catch((error: unknown) => {
    const panelText = [
      document.querySelector('[aria-label="Figma export review"]')?.outerHTML,
      document.querySelector(".sbfx-comments-panel")?.outerHTML,
    ].filter(Boolean).join("\n") || "no review panels";
    resultElement.textContent = btoa(
      JSON.stringify({ error: `${error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error)}\nPanel: ${panelText}`, results }),
    );
  });
