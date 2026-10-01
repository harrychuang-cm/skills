import { randomBytes } from "node:crypto";

import { resolveVisualCommentKind, type VisualCommentKind } from "./visualComment";
import {
  buildCommentPromptContext,
  createCommentPromptFormatter,
  safeHttpUrl,
} from "./visualCommentPrompt";

export {
  createCommentPromptFormatter,
  formatTrackingPrompt,
  formatVisualFixPrompt,
  type CommentPromptContext,
  type CommentPromptEntry,
} from "./visualCommentPrompt";
import type {
  VisualCommentReportRenderContext,
  VisualMeetingFile,
  VisualMeetingSummary,
} from "./visualCommentStore";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] ?? char,
  );
}

function htmlSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (char) =>
      ({
        "<": "\\u003c",
        ">": "\\u003e",
        "&": "\\u0026",
        "\u2028": "\\u2028",
        "\u2029": "\\u2029",
      })[char] ?? char,
  );
}

function ratioPercent(value: number): string {
  return String(Math.round(value * 10_000) / 100);
}

const kindLabels: Record<VisualCommentKind, string> = {
  "visual-fix": "Visual fix",
  tracking: "Tracking",
};

const baseCsp =
  "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

const trashIcon = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M5.5 4.5A.5.5 0 016 5v5a.5.5 0 01-1 0V5a.5.5 0 01.5-.5zM9 5a.5.5 0 00-1 0v5a.5.5 0 001 0V5z" fill="currentColor"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M4.5.5A.5.5 0 015 0h4a.5.5 0 01.5.5V2h3a.5.5 0 010 1H12v8a2 2 0 01-2 2H4a2 2 0 01-2-2V3h-.5a.5.5 0 010-1h3V.5zM3 3v8a1 1 0 001 1h6a1 1 0 001-1V3H3zm2.5-2h3v1h-3V1z" fill="currentColor"></path></svg>`;

const deleteDialog = `<div class="delete-dialog" data-delete-dialog role="dialog" aria-modal="true" hidden aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description"><div class="delete-dialog__content"><h2 id="delete-dialog-title">Delete comment?</h2><p id="delete-dialog-description">This permanently deletes the comment and its screenshot. This cannot be undone.</p><div class="delete-dialog__actions"><button type="button" class="comment__action" data-delete-confirm="cancel">Cancel</button><button type="button" class="comment__action comment__action--delete-confirm" data-delete-confirm="confirm">Confirm delete</button></div></div></div>`;

const styles = `
:root{color-scheme:light dark;--sbfx-surface:#fff;--sbfx-surface-subtle:#f3f4f6;--sbfx-surface-inset:#f3f4f6;--sbfx-surface-control:#e6e8ec;--sbfx-surface-control-hover:#d9dce1;--sbfx-surface-raised:#20222d;--sbfx-foreground:#1b1c1d;--sbfx-muted:#5b6068;--sbfx-field-border:#c5cad3;--sbfx-accent:#6d28d9;--sbfx-accent-contrast:#fff;--sbfx-success:#1f9d63;--sbfx-error:#d92d4b;--sbfx-radius:12px;--sbfx-shadow:0 1px 2px #0000001a,0 8px 24px #0000001f}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;background:var(--sbfx-surface-subtle);color:var(--sbfx-foreground);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,sans-serif}
main{width:min(1360px,calc(100% - 32px));margin:0 auto;padding:20px 0 64px}
a{color:var(--sbfx-accent)}
h1,h2,h3,p{margin-top:0}
h1{font-size:28px;line-height:1.2;margin-bottom:6px}
.topline{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px;font-size:13px}
.eyebrow,.status{color:var(--sbfx-muted);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.summary{color:var(--sbfx-muted);font-size:13px;margin-bottom:24px}
time{font-variant-numeric:tabular-nums}
.toolbar{position:sticky;top:0;z-index:5;display:grid;gap:10px;margin:0 -16px 20px;padding:12px 16px;background:var(--sbfx-surface-subtle)}
.toolbar__title{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 14px}
.toolbar h1{font-size:22px;line-height:1.25;margin-bottom:0}
.toolbar .summary{margin-bottom:0}
.toolbar__controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px}
.filter{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.chip{appearance:none;min-height:32px;padding:5px 12px;border:0;border-radius:999px;background:var(--sbfx-surface-control);color:var(--sbfx-foreground);font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.chip:hover{background:var(--sbfx-surface-control-hover)}
.chip[aria-pressed="true"]{background:var(--sbfx-accent);color:var(--sbfx-accent-contrast)}
.chip:focus-visible{outline:2px solid var(--sbfx-accent);outline-offset:2px}
@media(max-height:599px){.toolbar{position:static}}
.group{margin-top:28px}
.group h2{font-size:16px;margin-bottom:10px}
.meeting-grid,.evidence-list{display:grid;gap:16px}
.meeting-card,.evidence-card{background:var(--sbfx-surface);border-radius:var(--sbfx-radius);overflow:hidden;box-shadow:var(--sbfx-shadow)}
.meeting-card{display:grid;grid-template-columns:1fr auto;align-items:center;gap:16px;padding:18px}
.meeting-card h3{margin-bottom:4px;font-size:16px}
.meeting-card .summary{margin-bottom:4px}
.counts{color:var(--sbfx-muted);font-size:13px;font-variant-numeric:tabular-nums}
.empty{padding:12px 0;color:var(--sbfx-muted)}
.evidence-card__header{display:grid;gap:6px;padding:16px 18px 12px}
.evidence-card__title{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 16px}
.evidence-card__title h2{margin:0;font-size:16px;line-height:1.35}
.story-link{font-size:13px;font-weight:700;white-space:nowrap}
.metadata{display:flex;flex-wrap:wrap;gap:4px 16px;margin:0;color:var(--sbfx-muted);font-size:12px}
.evidence-card__body{display:grid;gap:14px;padding:0 18px 18px}
@media(min-width:1024px){.evidence-card__body{grid-template-columns:minmax(0,1.7fr) minmax(300px,1fr);align-items:start}}
.snapshot{position:relative;background:var(--sbfx-surface-raised)}
.snapshot{border-radius:10px;overflow:hidden}
.snapshot img{display:block;width:100%;height:100%;object-fit:contain}
.pin{position:absolute;transform:translate(-50%,-50%);display:grid;place-items:center;width:26px;height:26px;padding:0;border:0;border-radius:50%;background:#d93025;color:#fff;font:inherit;font-size:12px;font-weight:800;line-height:1;box-shadow:0 0 0 2px #fff,0 2px 8px #0005}
.comments{display:grid;gap:10px;align-content:start}
.comment{padding:14px 16px;border-radius:10px;background:var(--sbfx-surface-inset)}
.comment__meta{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px}
.comment__identity{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;font-size:13px}
.comment time{color:var(--sbfx-muted);font-size:12px}
.comment__body{margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
.comment__status,.comment__kind{color:var(--sbfx-muted);font-size:12px;font-weight:700}
.comment__status{display:inline-flex;align-items:center;gap:6px}
.comment__status::before{width:7px;height:7px;border-radius:50%;background:var(--sbfx-muted);content:""}
.comment__status--completed{color:var(--sbfx-foreground)}
.comment__status--completed::before{background:var(--sbfx-success)}
.comment__kind--tracking{color:var(--sbfx-accent)}
.tracking-batch{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}
.tracking-batch__controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px}
.tracking-batch label{color:var(--sbfx-muted);font-size:12px;font-weight:700}
.tracking-batch__scope{min-height:32px;max-width:100%;padding:5px 10px;border:1px solid var(--sbfx-field-border);border-radius:8px;background:var(--sbfx-surface);color:var(--sbfx-foreground);font:inherit;font-size:13px}
.tracking-batch__scope:focus-visible{outline:2px solid var(--sbfx-accent);outline-offset:2px}
.tracking-batch .comment__copy-status{margin:0}
.comment__actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px}
.comment__actions-end{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-inline-start:auto}
.comment__action{appearance:none;min-height:32px;padding:6px 12px;border:0;border-radius:8px;background:var(--sbfx-surface-control);color:var(--sbfx-foreground);font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.comment__action:hover{background:var(--sbfx-surface-control-hover)}
.comment__action:focus-visible{outline:2px solid var(--sbfx-accent);outline-offset:2px}
.comment__action:disabled{cursor:wait;opacity:.55}
.comment__action--primary,.comment__action--primary:hover{background:var(--sbfx-accent);color:var(--sbfx-accent-contrast)}
.comment__action--delete{display:inline-grid;place-items:center;width:32px;padding:0;background:transparent;color:var(--sbfx-error)}
.comment__action--delete svg{width:14px;height:14px}
.comment__action--delete-confirm,.comment__action--delete-confirm:hover{background:var(--sbfx-error);color:#fff}
.comment__copy-status{margin:10px 0 0;color:var(--sbfx-muted);font-size:13px}
.comment__copy-status[hidden],.ai-fix-context{display:none}
.delete-dialog{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;background:rgb(0 0 0 / 55%)}
.delete-dialog[hidden]{display:none}
.delete-dialog__content{width:min(420px,calc(100% - 32px));padding:22px;border-radius:var(--sbfx-radius);background:var(--sbfx-surface);color:var(--sbfx-foreground);box-shadow:var(--sbfx-shadow)}
.delete-dialog__content h2{margin-bottom:8px;font-size:20px}
.delete-dialog__content p{margin-bottom:20px;color:var(--sbfx-muted)}
.delete-dialog__actions{display:flex;justify-content:flex-end;gap:8px}
.comment__error{margin:10px 0 0;color:var(--sbfx-error);font-size:13px}
.comment__error[hidden]{display:none}
@media(max-width:640px){main{width:min(100% - 20px,1360px);padding-top:12px}
.meeting-card{grid-template-columns:1fr}
.toolbar{margin-inline:-10px;padding-inline:10px}
}
.comment__body[hidden],.comment__editor[hidden]{display:none}
.comment__editor{display:grid;gap:10px;margin-top:12px}
.comment__editor label{color:var(--sbfx-muted);font-size:12px;font-weight:700}
.comment__edit-preview{position:relative;overflow:hidden;background:var(--sbfx-surface-raised);border-radius:8px;cursor:crosshair;touch-action:none}
.comment__edit-preview[hidden]{display:none}
.comment__edit-preview img{display:block;width:100%;height:100%;object-fit:contain}
.pin--editable{appearance:none;cursor:grab;touch-action:none}
.pin--editable:active{cursor:grabbing}
.pin--editable:focus-visible{outline:2px solid var(--sbfx-accent);outline-offset:2px}
.comment__point-hint,.comment__evidence-error{margin:0;color:var(--sbfx-muted);font-size:12px}
.comment__evidence-error[hidden]{display:none}
.comment__draft{width:100%;min-height:88px;margin-top:5px;padding:9px 11px;border:1px solid var(--sbfx-field-border);border-radius:8px;background:var(--sbfx-surface);color:var(--sbfx-foreground);font:inherit;line-height:1.5;resize:vertical}
.comment__draft:focus{outline:2px solid var(--sbfx-accent);outline-offset:2px}
.comment__editor-actions{display:flex;justify-content:flex-end;gap:8px}
.comment__kind-draft{display:block;min-height:34px;margin-top:5px;padding:6px 10px;border:1px solid var(--sbfx-field-border);border-radius:8px;background:var(--sbfx-surface);color:var(--sbfx-foreground);font:inherit}
.comment__kind-draft:focus-visible{outline:2px solid var(--sbfx-accent);outline-offset:2px}
@media(prefers-color-scheme:dark){:root{--sbfx-surface:#1d1f24;--sbfx-surface-subtle:#121316;--sbfx-surface-inset:#272a30;--sbfx-surface-control:#32363e;--sbfx-surface-control-hover:#3e434c;--sbfx-surface-raised:#20222d;--sbfx-foreground:#f2f3f5;--sbfx-muted:#afb3bb;--sbfx-field-border:#4a4e57;--sbfx-accent:#c4a7ff;--sbfx-accent-contrast:#1b1c1d;--sbfx-success:#32d583;--sbfx-error:#ff7b93;--sbfx-shadow:0 1px 2px #00000066,0 8px 24px #00000066}
}
`;

// Shared by the meeting report and the index.
const reportTimeScript = `
  const formatLocalTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const pad = (part) => String(part).padStart(2, "0");
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
      " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  };
  document.querySelectorAll("time[data-report-time]").forEach((element) => {
    const iso = element.getAttribute("datetime");
    const local = iso ? formatLocalTime(iso) : null;
    if (!local) return;
    element.textContent = local;
    element.setAttribute("title", iso);
  });
`;

const reportActionScript = `
(() => {
${reportTimeScript}
  // Filters run in the page only and are mirrored in the URL fragment so a
  // shared link opens the same view.
  const filterState = { kind: "all", completed: "shown" };
  const readFilterFragment = () => {
    const values = {};
    String(window.location.hash || "").replace(/^#/, "").split("&").forEach((part) => {
      const separator = part.indexOf("=");
      if (separator > 0) values[part.slice(0, separator)] = part.slice(separator + 1);
    });
    filterState.kind =
      values.kind === "visual-fix" || values.kind === "tracking" ? values.kind : "all";
    filterState.completed = values.completed === "hidden" ? "hidden" : "shown";
  };
  const applyFilters = () => {
    let totalCards = 0;
    let visibleCards = 0;
    document.querySelectorAll("[data-capture-card]").forEach((capture) => {
      const hiddenComments = new Set();
      const cards = capture.querySelectorAll("[data-comment-card]");
      let visibleInCapture = 0;
      cards.forEach((card) => {
        const visible =
          (filterState.kind === "all" || card.dataset.commentKind === filterState.kind) &&
          (filterState.completed === "shown" || card.dataset.commentStatus === "open");
        card.hidden = !visible;
        if (visible) visibleInCapture += 1;
        else hiddenComments.add(card.dataset.commentRef);
      });
      capture.querySelectorAll("[data-comment-pin]").forEach((pin) => {
        pin.hidden = hiddenComments.has(pin.dataset.commentPin);
      });
      capture.hidden = cards.length > 0 && visibleInCapture === 0;
      totalCards += cards.length;
      visibleCards += visibleInCapture;
    });
    const emptyMessage = document.querySelector("[data-filter-empty]");
    if (emptyMessage) emptyMessage.hidden = !(totalCards > 0 && visibleCards === 0);
    document.querySelectorAll("[data-report-filter]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.reportFilter === filterState.kind),
      );
    });
    const hideCompleted = document.querySelector("[data-hide-completed]");
    if (hideCompleted) {
      hideCompleted.setAttribute("aria-pressed", String(filterState.completed === "hidden"));
    }
  };
  const writeFilterFragment = () => {
    const fragment = "#kind=" + filterState.kind + "&completed=" + filterState.completed;
    try {
      window.history.replaceState(null, "", fragment);
    } catch {
      window.location.hash = fragment;
    }
  };
  readFilterFragment();
  applyFilters();
  if (typeof window.addEventListener === "function") {
    window.addEventListener("hashchange", () => {
      readFilterFragment();
      applyFilters();
    });
  }

  const deleteDialog = document.querySelector("[data-delete-dialog]");
  let pendingDeleteCard = null;
  let pendingDeleteButton = null;

  const closeDeleteDialog = (restoreFocus = true) => {
    if (!(deleteDialog instanceof HTMLElement)) return;
    deleteDialog.hidden = true;
    const returnTarget = pendingDeleteButton;
    pendingDeleteCard = null;
    pendingDeleteButton = null;
    if (restoreFocus && returnTarget instanceof HTMLButtonElement) {
      returnTarget.focus();
    }
  };

  const openDeleteDialog = (card, button) => {
    if (!(deleteDialog instanceof HTMLElement)) return;
    pendingDeleteCard = card;
    pendingDeleteButton = button;
    deleteDialog.hidden = false;
    const cancelButton = deleteDialog.querySelector('[data-delete-confirm="cancel"]');
    if (cancelButton instanceof HTMLButtonElement) cancelButton.focus();
  };

  const isRecord = (value) =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

  const readPortableContext = (card) => {
    const element = card.querySelector("[data-ai-fix-context]");
    if (!(element instanceof HTMLElement)) throw new Error("AI context is unavailable.");
    const context = JSON.parse(element.textContent || "");
    if (
      !isRecord(context) ||
      context.version !== 1 ||
      !isRecord(context.comment) ||
      typeof context.comment.body !== "string" ||
      !isRecord(context.story) ||
      typeof context.story.id !== "string" ||
      typeof context.story.title !== "string" ||
      typeof context.story.name !== "string" ||
      !isRecord(context.screenshot) ||
      typeof context.screenshot.reportRelativePath !== "string" ||
      !isRecord(context.pin) ||
      !Number.isFinite(context.pin.xRatio) ||
      !Number.isFinite(context.pin.yRatio) ||
      !isRecord(context.viewport) ||
      !Number.isFinite(context.viewport.width) ||
      !Number.isFinite(context.viewport.height) ||
      !Number.isFinite(context.viewport.devicePixelRatio) ||
      typeof context.capturedAt !== "string" ||
      (context.comment.kind === "tracking" &&
        !(Number.isInteger(context.comment.ordinal) && context.comment.ordinal > 0))
    ) {
      throw new Error("AI context is malformed.");
    }
    return context;
  };

  const resolvedScreenshotUrl = (context) => {
    const url = new URL(context.screenshot.reportRelativePath, window.location.href);
    return url.origin === window.location.origin ? url : null;
  };

  // One formatter implementation, shared with the comments panel.
  const commentPrompts = (${createCommentPromptFormatter.toString()})();
  const contextKind = commentPrompts.contextKind;
  const formatTrackingPrompt = commentPrompts.formatTrackingPrompt;
  const formatCommentPrompt = commentPrompts.formatCommentPrompt;

  const screenshotPngBlob = async (screenshotUrl) => {
    const response = await fetch(screenshotUrl.href, { credentials: "omit" });
    if (!response.ok) throw new Error("Screenshot fetch failed.");
    const sourceBlob = await response.blob();
    const bitmap = await createImageBitmap(sourceBlob);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const drawingContext = canvas.getContext("2d");
      if (!drawingContext) throw new Error("Canvas is unavailable.");
      drawingContext.drawImage(bitmap, 0, 0);
      const pngBlob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error("PNG conversion failed.")),
          "image/png",
        );
      });
      return pngBlob;
    } finally {
      if (typeof bitmap.close === "function") bitmap.close();
    }
  };

  const writeCombinedClipboard = async (markdown, screenshotUrl) => {
    if (
      !screenshotUrl ||
      !navigator.clipboard ||
      typeof navigator.clipboard.write !== "function" ||
      typeof ClipboardItem !== "function" ||
      typeof createImageBitmap !== "function"
    ) {
      throw new Error("Rich clipboard is unavailable.");
    }
    const pngBlob = await screenshotPngBlob(screenshotUrl);
    const clipboardItem = new ClipboardItem({
      "text/plain": new Blob([markdown], { type: "text/plain" }),
      "image/png": pngBlob,
    });
    await navigator.clipboard.write([clipboardItem]);
  };

  const showCopyStatus = (statusElement, message) => {
    if (!(statusElement instanceof HTMLElement)) return;
    statusElement.textContent = message;
    statusElement.hidden = false;
  };

  const copyPortablePrompt = async (card, button) => {
    const statusElement = card.querySelector("[data-ai-copy-status]");
    button.disabled = true;
    if (statusElement instanceof HTMLElement) {
      statusElement.hidden = true;
      statusElement.textContent = "";
    }
    let markdown;
    let screenshotUrl;
    try {
      const context = readPortableContext(card);
      screenshotUrl = resolvedScreenshotUrl(context);
      markdown = formatCommentPrompt(context, screenshotUrl);
    } catch {
      showCopyStatus(
        statusElement,
        "Unable to copy AI prompt. Check browser clipboard permission.",
      );
      button.disabled = false;
      return;
    }
    try {
      try {
        await writeCombinedClipboard(markdown, screenshotUrl);
        showCopyStatus(statusElement, "AI prompt and screenshot copied.");
        return;
      } catch {
        await navigator.clipboard.writeText(markdown);
        showCopyStatus(
          statusElement,
          "AI prompt copied. Attach the screenshot manually if your AI cannot open the URL.",
        );
      }
    } catch {
      showCopyStatus(
        statusElement,
        "Unable to copy AI prompt. Check browser clipboard permission.",
      );
    } finally {
      button.disabled = false;
    }
  };

  // Text only: one clipboard item cannot carry a screenshot per comment, so
  // every subsection lists its screenshot path instead.
  const copyTrackingBatch = async (button) => {
    const batch = button.closest("[data-tracking-batch]");
    if (!(batch instanceof HTMLElement)) return;
    const statusElement = batch.querySelector("[data-tracking-batch-status]");
    const scopeElement = batch.querySelector("[data-tracking-scope]");
    const scope =
      scopeElement instanceof HTMLElement && typeof scopeElement.value === "string"
        ? scopeElement.value
        : "";
    button.disabled = true;
    if (statusElement instanceof HTMLElement) {
      statusElement.hidden = true;
      statusElement.textContent = "";
    }
    try {
      const entries = [];
      let skipped = 0;
      document
        .querySelectorAll('[data-comment-card][data-comment-kind="tracking"]')
        .forEach((card) => {
          if (!(card instanceof HTMLElement)) return;
          if (card.dataset.commentStatus !== "open") return;
          if (scope && card.dataset.commentStoryId !== scope) return;
          try {
            const context = readPortableContext(card);
            if (contextKind(context) !== "tracking") {
              throw new Error("AI context is malformed.");
            }
            entries.push({ context, screenshotUrl: resolvedScreenshotUrl(context) });
          } catch {
            skipped += 1;
          }
        });
      if (entries.length === 0) {
        showCopyStatus(statusElement, "No open tracking comments to copy.");
        return;
      }
      entries.sort((a, b) => a.context.comment.ordinal - b.context.comment.ordinal);
      try {
        await navigator.clipboard.writeText(formatTrackingPrompt(entries));
      } catch {
        showCopyStatus(
          statusElement,
          "Unable to copy AI prompt. Check browser clipboard permission.",
        );
        return;
      }
      showCopyStatus(
        statusElement,
        "Tracking prompt copied. Comments included: " + entries.length + "." +
          (skipped ? " Skipped: " + skipped + "." : ""),
      );
    } finally {
      button.disabled = false;
    }
  };

  const commentEditorElements = (card) => ({
    bodyElement: card.querySelector("[data-comment-body]"),
    draftElement: card.querySelector("[data-comment-draft]"),
    editPinElement: card.querySelector("[data-comment-edit-pin]"),
    editPreviewElement: card.querySelector("[data-comment-edit-preview]"),
    editorElement: card.querySelector("[data-comment-editor]"),
    errorElement: card.querySelector("[data-comment-error]"),
  });

  const clampRatio = (value) => Math.min(1, Math.max(0, value));
  const ratioPercent = (value) => String(Math.round(value * 10000) / 100) + "%";

  const setPinDraft = (pinElement, pin) => {
    if (!(pinElement instanceof HTMLButtonElement)) return;
    const xRatio = clampRatio(pin.xRatio);
    const yRatio = clampRatio(pin.yRatio);
    pinElement.dataset.xRatio = String(xRatio);
    pinElement.dataset.yRatio = String(yRatio);
    pinElement.style.left = ratioPercent(xRatio);
    pinElement.style.top = ratioPercent(yRatio);
  };

  const resetPinDraft = (card) => {
    const pinElement = card.querySelector("[data-comment-edit-pin]");
    const xRatio = Number(card.dataset.commentPinX);
    const yRatio = Number(card.dataset.commentPinY);
    if (
      card.dataset.commentPinAvailable !== "true" ||
      !Number.isFinite(xRatio) ||
      !Number.isFinite(yRatio)
    ) return;
    setPinDraft(pinElement, { xRatio, yRatio });
  };

  const readPinDraft = (card) => {
    if (card.dataset.commentPinAvailable !== "true") return null;
    const pinElement = card.querySelector("[data-comment-edit-pin]");
    if (!(pinElement instanceof HTMLButtonElement)) return null;
    const xRatio = Number(pinElement.dataset.xRatio);
    const yRatio = Number(pinElement.dataset.yRatio);
    return Number.isFinite(xRatio) &&
      Number.isFinite(yRatio) &&
      xRatio >= 0 &&
      xRatio <= 1 &&
      yRatio >= 0 &&
      yRatio <= 1
      ? { xRatio, yRatio }
      : null;
  };

  const resetKindDraft = (card) => {
    const kindElement = card.querySelector("[data-comment-kind-draft]");
    if (kindElement instanceof HTMLElement && typeof card.dataset.commentKind === "string") {
      kindElement.value = card.dataset.commentKind;
    }
  };

  // Returns the drafted kind only when the reviewer changed it.
  const readKindDraft = (card) => {
    const kindElement = card.querySelector("[data-comment-kind-draft]");
    if (!(kindElement instanceof HTMLElement)) return null;
    const kind = kindElement.value;
    return (kind === "visual-fix" || kind === "tracking") &&
      kind !== card.dataset.commentKind
      ? kind
      : null;
  };

  const clearCommentError = (errorElement) => {
    if (!(errorElement instanceof HTMLElement)) return;
    errorElement.hidden = true;
    errorElement.textContent = "";
  };

  const openCommentEditor = (card) => {
    const { bodyElement, draftElement, editorElement, errorElement } =
      commentEditorElements(card);
    if (
      !(bodyElement instanceof HTMLElement) ||
      !(draftElement instanceof HTMLTextAreaElement) ||
      !(editorElement instanceof HTMLElement)
    ) return;
    draftElement.value = bodyElement.textContent || "";
    resetPinDraft(card);
    resetKindDraft(card);
    bodyElement.hidden = true;
    editorElement.hidden = false;
    card.dataset.commentEditing = "true";
    clearCommentError(errorElement);
    draftElement.focus();
  };

  const cancelCommentEditor = (card) => {
    const { bodyElement, draftElement, editorElement, errorElement } =
      commentEditorElements(card);
    if (
      !(bodyElement instanceof HTMLElement) ||
      !(draftElement instanceof HTMLTextAreaElement) ||
      !(editorElement instanceof HTMLElement)
    ) return;
    draftElement.value = bodyElement.textContent || "";
    resetPinDraft(card);
    resetKindDraft(card);
    bodyElement.hidden = false;
    editorElement.hidden = true;
    delete card.dataset.commentEditing;
    clearCommentError(errorElement);
  };

  const saveCommentBody = async (card) => {
    const endpoint = card.dataset.commentEndpoint;
    const { bodyElement, draftElement, editorElement, errorElement } =
      commentEditorElements(card);
    if (
      !endpoint ||
      !(bodyElement instanceof HTMLElement) ||
      !(draftElement instanceof HTMLTextAreaElement) ||
      !(editorElement instanceof HTMLElement)
    ) return;
    const body = draftElement.value.trim();
    const pin = readPinDraft(card);
    const kind = readKindDraft(card);
    if (!body || body.length > 2000) {
      if (errorElement instanceof HTMLElement) {
        errorElement.textContent = "Comment must contain 1–2000 characters.";
        errorElement.hidden = false;
      }
      return;
    }
    const actions = card.querySelectorAll("button[data-comment-action]");
    const editActions = card.querySelectorAll("button[data-comment-edit-action]");
    actions.forEach((actionButton) => { actionButton.disabled = true; });
    editActions.forEach((actionButton) => { actionButton.disabled = true; });
    clearCommentError(errorElement);
    try {
      const requestInit = {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, ...(pin ? { pin } : {}) }),
      };
      // Kind joins the same request only when the reviewer changed it.
      if (kind) {
        requestInit.body = JSON.stringify({ body, ...(pin ? { pin } : {}), kind });
      }
      const response = await fetch(endpoint, requestInit);
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        throw new Error(
          payload && typeof payload.error === "string"
            ? payload.error
            : "The comment update failed.",
        );
      }
      window.location.reload();
    } catch (error) {
      if (errorElement instanceof HTMLElement) {
        errorElement.textContent =
          error instanceof Error ? error.message : "The comment update failed.";
        errorElement.hidden = false;
      }
    } finally {
      actions.forEach((actionButton) => { actionButton.disabled = false; });
      editActions.forEach((actionButton) => { actionButton.disabled = false; });
    }
  };

  let activePointPointer = null;

  const updatePointFromPointer = (preview, event) => {
    const card = preview.closest("[data-comment-card]");
    if (!(card instanceof HTMLElement)) return;
    const pinElement = card.querySelector("[data-comment-edit-pin]");
    const bounds = preview.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    setPinDraft(pinElement, {
      xRatio: (event.clientX - bounds.left) / bounds.width,
      yRatio: (event.clientY - bounds.top) / bounds.height,
    });
  };

  const updateComment = async (card, action) => {
    const endpoint = card.dataset.commentEndpoint;
    const status = card.dataset.commentStatus;
    if (!endpoint || (action !== "resolve" && action !== "delete")) return;

    const actions = card.querySelectorAll("button[data-comment-action]");
    const errorElement = card.querySelector("[data-comment-error]");
    actions.forEach((actionButton) => { actionButton.disabled = true; });
    if (errorElement instanceof HTMLElement) {
      errorElement.hidden = true;
      errorElement.textContent = "";
    }

    try {
      const requestOptions = {
        method: action === "delete" ? "DELETE" : "PATCH",
        ...(action === "resolve"
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ resolved: status !== "completed" }),
            }
          : {}),
      };
      const response = await fetch(endpoint, requestOptions);
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        throw new Error(payload && typeof payload.error === "string" ? payload.error : "The comment update failed.");
      }
      window.location.reload();
    } catch (error) {
      if (errorElement instanceof HTMLElement) {
        errorElement.textContent = error instanceof Error ? error.message : "The comment update failed.";
        errorElement.hidden = false;
      }
    } finally {
      actions.forEach((actionButton) => { actionButton.disabled = false; });
    }
  };

  document.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const confirmationButton = target.closest("button[data-delete-confirm]");
    if (confirmationButton instanceof HTMLButtonElement) {
      const decision = confirmationButton.dataset.deleteConfirm;
      const card = pendingDeleteCard;
      closeDeleteDialog(decision !== "confirm");
      if (decision === "confirm" && card instanceof HTMLElement) {
        await updateComment(card, "delete");
      }
      return;
    }

    if (target === deleteDialog) {
      closeDeleteDialog();
      return;
    }

    const filterButton = target.closest("button[data-report-filter]");
    if (filterButton instanceof HTMLButtonElement) {
      filterState.kind = filterButton.dataset.reportFilter;
      writeFilterFragment();
      applyFilters();
      return;
    }
    const hideCompletedButton = target.closest("button[data-hide-completed]");
    if (hideCompletedButton instanceof HTMLButtonElement) {
      filterState.completed = filterState.completed === "hidden" ? "shown" : "hidden";
      writeFilterFragment();
      applyFilters();
      return;
    }

    const batchButton = target.closest("button[data-tracking-batch-copy]");
    if (batchButton instanceof HTMLButtonElement) {
      await copyTrackingBatch(batchButton);
      return;
    }

    const editActionButton = target.closest("button[data-comment-edit-action]");
    if (editActionButton instanceof HTMLButtonElement) {
      const card = editActionButton.closest("[data-comment-card]");
      if (!(card instanceof HTMLElement)) return;
      if (editActionButton.dataset.commentEditAction === "cancel") {
        cancelCommentEditor(card);
      } else if (editActionButton.dataset.commentEditAction === "save") {
        await saveCommentBody(card);
      }
      return;
    }

    const button = target.closest("button[data-comment-action]");
    if (!(button instanceof HTMLButtonElement)) return;
    const card = button.closest("[data-comment-card]");
    if (!(card instanceof HTMLElement)) return;
    const action = button.dataset.commentAction;
    if (action === "copy-ai-prompt") {
      await copyPortablePrompt(card, button);
      return;
    }
    if (action === "delete") {
      openDeleteDialog(card, button);
      return;
    }
    if (action === "edit") {
      openCommentEditor(card);
      return;
    }
    await updateComment(card, action);
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || event.button !== 0) return;
    const preview = target.closest("[data-comment-edit-preview]");
    if (!(preview instanceof HTMLElement) || preview.hidden) return;
    event.preventDefault();
    const pinButton = target.closest("button[data-comment-edit-pin]");
    if (pinButton instanceof HTMLButtonElement) pinButton.focus();
    activePointPointer = { pointerId: event.pointerId, preview };
    try { preview.setPointerCapture?.(event.pointerId); } catch {}
    updatePointFromPointer(preview, event);
  });

  document.addEventListener("pointermove", (event) => {
    if (!activePointPointer || activePointPointer.pointerId !== event.pointerId) return;
    updatePointFromPointer(activePointPointer.preview, event);
  });

  const finishPointPointer = (event) => {
    if (!activePointPointer || activePointPointer.pointerId !== event.pointerId) return;
    const preview = activePointPointer.preview;
    activePointPointer = null;
    try {
      if (preview.hasPointerCapture?.(event.pointerId)) {
        preview.releasePointerCapture(event.pointerId);
      }
    } catch {}
  };
  document.addEventListener("pointerup", finishPointPointer);
  document.addEventListener("pointercancel", finishPointPointer);

  document.addEventListener("error", (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.hasAttribute("data-comment-edit-image")) {
      return;
    }
    const card = image.closest("[data-comment-card]");
    if (!(card instanceof HTMLElement)) return;
    card.dataset.commentPinAvailable = "false";
    const preview = card.querySelector("[data-comment-edit-preview]");
    const evidenceError = card.querySelector("[data-comment-evidence-error]");
    if (preview instanceof HTMLElement) preview.hidden = true;
    if (evidenceError instanceof HTMLElement) evidenceError.hidden = false;
  }, true);

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof Element) {
      const pinButton = target.closest("button[data-comment-edit-pin]");
      if (pinButton instanceof HTMLButtonElement) {
        const step = event.shiftKey ? 0.05 : 0.01;
        let xDelta = 0;
        let yDelta = 0;
        if (event.key === "ArrowLeft") xDelta = -step;
        else if (event.key === "ArrowRight") xDelta = step;
        else if (event.key === "ArrowUp") yDelta = -step;
        else if (event.key === "ArrowDown") yDelta = step;
        else return;
        event.preventDefault();
        setPinDraft(pinButton, {
          xRatio: Number(pinButton.dataset.xRatio) + xDelta,
          yRatio: Number(pinButton.dataset.yRatio) + yDelta,
        });
        return;
      }
    }
    if (event.key !== "Escape" || !(deleteDialog instanceof HTMLElement) || deleteDialog.hidden) return;
    event.preventDefault();
    closeDeleteDialog();
  });
})();`;

// Server time is ISO; the page script swaps in the viewer's local time.
function timeElement(value: string): string {
  return `<time datetime="${escapeHtml(value)}" data-report-time>${escapeHtml(value)}</time>`;
}

function documentShell(title: string, body: string, script?: string): string {
  const nonce = script ? randomBytes(18).toString("base64") : "";
  const csp = script
    ? `${baseCsp}; script-src 'nonce-${nonce}'; connect-src 'self'`
    : baseCsp;
  const scriptElement = script
    ? `<script nonce="${nonce}">${script}</script>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${styles}</style></head><body><main>${body}</main>${scriptElement}</body></html>`;
}

export function renderVisualCommentReport(
  meeting: VisualMeetingFile,
  context: VisualCommentReportRenderContext = {
    projectRelativeSessionPath: null,
  },
): string {
  const captures = Object.values(meeting.captures).sort((a, b) =>
    a.capturedAt.localeCompare(b.capturedAt),
  );
  const captureCount = captures.length;
  const commentCount = meeting.comments.length;
  const ordinals = new Map(
    meeting.comments.map((comment, index) => [comment.id, index + 1]),
  );
  const evidence = captures
    .map((capture) => {
      const comments = meeting.comments
        .filter((comment) => comment.captureId === capture.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const pins = comments
        .map((comment) => {
          const ordinal = ordinals.get(comment.id) ?? 0;
          return `<span class="pin" aria-label="Comment ${ordinal}" data-comment-pin="${escapeHtml(comment.id)}" style="left:${ratioPercent(comment.pin.xRatio)}%;top:${ratioPercent(comment.pin.yRatio)}%">${ordinal}</span>`;
        })
        .join("");
      const cards = comments.length
        ? comments
            .map((comment) => {
              const ordinal = ordinals.get(comment.id) ?? 0;
              const completed = Boolean(comment.resolvedAt);
              const kind = resolveVisualCommentKind(comment.kind);
              const endpoint = `../../../sessions/${encodeURIComponent(meeting.session.id)}/comments/${encodeURIComponent(comment.id)}`;
              const portableContext = buildCommentPromptContext({
                capture,
                comment,
                kind,
                ordinal,
                projectRelativeSessionPath: context.projectRelativeSessionPath,
              });
              const escapedBody = escapeHtml(comment.body);
              return [
                `<article class="comment" data-comment-card data-comment-ref="${escapeHtml(comment.id)}" data-comment-status="${completed ? "completed" : "open"}" data-comment-kind="${kind}" data-comment-story-id="${escapeHtml(capture.story.id)}" data-comment-endpoint="${escapeHtml(endpoint)}" data-comment-pin-available="true" data-comment-pin-x="${comment.pin.xRatio}" data-comment-pin-y="${comment.pin.yRatio}">`,
                `<div class="comment__meta"><div class="comment__identity"><strong>${ordinal}. ${escapeHtml(comment.authorName)}</strong><span class="comment__status${completed ? " comment__status--completed" : ""}">${completed ? "Completed" : "Open"}</span><span class="comment__kind comment__kind--${kind}" data-comment-kind-label>${kindLabels[kind]}</span></div>${timeElement(comment.createdAt)}</div>`,
                `<p class="comment__body" data-comment-body>${escapedBody}</p>`,
                `<div class="comment__editor" data-comment-editor hidden><div class="comment__edit-preview" data-comment-edit-preview style="aspect-ratio:${capture.image.width}/${capture.image.height}"><img src="${escapeHtml(capture.image.path)}" alt="Screenshot evidence for comment ${ordinal}" data-comment-edit-image><button type="button" class="pin pin--editable" data-comment-edit-pin data-x-ratio="${comment.pin.xRatio}" data-y-ratio="${comment.pin.yRatio}" aria-label="Adjust comment point ${ordinal}" style="left:${ratioPercent(comment.pin.xRatio)}%;top:${ratioPercent(comment.pin.yRatio)}%">${ordinal}</button></div><p class="comment__point-hint">Click or drag the point. Use arrow keys for 1% steps, or Shift plus arrow keys for 5% steps.</p><p class="comment__evidence-error" data-comment-evidence-error hidden>Screenshot evidence is unavailable. You can still edit the comment text.</p><label>Comment type<select class="comment__kind-draft" data-comment-kind-draft>${(Object.keys(kindLabels) as VisualCommentKind[]).map((option) => `<option value="${option}"${option === kind ? " selected" : ""}>${kindLabels[option]}</option>`).join("")}</select></label><label>Comment<textarea class="comment__draft" data-comment-draft maxlength="2000">${escapedBody}</textarea></label><div class="comment__editor-actions"><button type="button" class="comment__action comment__action--primary" data-comment-edit-action="save">Save changes</button><button type="button" class="comment__action" data-comment-edit-action="cancel">Cancel</button></div></div>`,
                `<script type="application/json" class="ai-fix-context" data-ai-fix-context>${htmlSafeJson(portableContext)}</script>`,
                `<div class="comment__actions"><button type="button" class="comment__action comment__action--delete" data-comment-action="delete" aria-label="Delete comment" title="Delete comment">${trashIcon}</button><div class="comment__actions-end"><button type="button" class="comment__action" data-comment-action="copy-ai-prompt">Copy AI prompt</button><button type="button" class="comment__action" data-comment-action="edit">Edit</button><button type="button" class="comment__action comment__action--primary" data-comment-action="resolve">${completed ? "Reopen" : "Complete"}</button></div></div>`,
                `<p class="comment__copy-status" data-ai-copy-status aria-live="polite" hidden></p><p class="comment__error" data-comment-error aria-live="polite" hidden></p></article>`,
              ].join("");
            })
            .join("")
        : '<p class="empty">No comments on this capture.</p>';
      const storyUrl = safeHttpUrl(capture.story.url);
      const storyLink = storyUrl
        ? `<a class="story-link" href="${escapeHtml(storyUrl)}" target="_blank" rel="noreferrer">Open story</a>`
        : "";
      const metadata = [
        `Story ID: ${escapeHtml(capture.story.id)}`,
        capture.story.prototypeId ? `Prototype: ${escapeHtml(capture.story.prototypeId)}` : "",
        capture.story.routeId ? `Route: ${escapeHtml(capture.story.routeId)}` : "",
        capture.story.stateId ? `State: ${escapeHtml(capture.story.stateId)}` : "",
        `Captured: ${timeElement(capture.capturedAt)}`,
        `Viewport: ${capture.viewport.width}×${capture.viewport.height} @ ${capture.viewport.devicePixelRatio}x`,
      ]
        .filter(Boolean)
        .map((value) => `<span>${value}</span>`)
        .join("");
      return `<article class="evidence-card" data-capture-card><header class="evidence-card__header"><div class="evidence-card__title"><h2>${escapeHtml(capture.story.title)} / ${escapeHtml(capture.story.name)}</h2>${storyLink}</div><p class="metadata">${metadata}</p></header><div class="evidence-card__body"><div class="snapshot" style="aspect-ratio:${capture.image.width}/${capture.image.height}"><img src="${escapeHtml(capture.image.path)}" alt="Captured ${escapeHtml(capture.story.name)}">${pins}</div><div class="comments">${cards}</div></div></article>`;
    })
    .join("");
  const trackingStories = new Map<string, string>();
  for (const comment of meeting.comments) {
    const capture = meeting.captures[comment.captureId];
    if (
      capture &&
      resolveVisualCommentKind(comment.kind) === "tracking" &&
      !trackingStories.has(capture.story.id)
    ) {
      trackingStories.set(
        capture.story.id,
        `${capture.story.title} / ${capture.story.name}`,
      );
    }
  }
  const trackingBatch = trackingStories.size
    ? `<section class="tracking-batch" data-tracking-batch><div class="tracking-batch__controls"><label for="tracking-scope">Tracking scope</label><select id="tracking-scope" class="tracking-batch__scope" data-tracking-scope><option value="">All stories</option>${Array.from(
        trackingStories,
        ([storyId, label]) =>
          `<option value="${escapeHtml(storyId)}">${escapeHtml(label)}</option>`,
      ).join("")}</select><button type="button" class="comment__action comment__action--primary" data-tracking-batch-copy>Copy tracking prompts</button></div><p class="comment__copy-status" data-tracking-batch-status aria-live="polite" hidden></p></section>`
    : "";
  const kindCounts = { "visual-fix": 0, tracking: 0 } as Record<VisualCommentKind, number>;
  for (const comment of meeting.comments) {
    if (meeting.captures[comment.captureId]) {
      kindCounts[resolveVisualCommentKind(comment.kind)] += 1;
    }
  }
  const listedCount = kindCounts["visual-fix"] + kindCounts.tracking;
  const filters = `<div class="filter" role="group" aria-label="Filter comments"><button type="button" class="chip" data-report-filter="all" aria-pressed="true">All ${listedCount}</button>${(
    Object.keys(kindLabels) as VisualCommentKind[]
  )
    .map(
      (kind) =>
        `<button type="button" class="chip" data-report-filter="${kind}" aria-pressed="false">${kindLabels[kind]} ${kindCounts[kind]}</button>`,
    )
    .join("")}<button type="button" class="chip" data-hide-completed aria-pressed="false">Hide completed</button></div>`;
  const status = meeting.session.closedAt ? "Closed meeting" : "Active meeting";
  return documentShell(
    meeting.session.title,
    `<nav class="topline"><a href="../../index.html">← All meetings</a><span class="status">${status}</span></nav><header class="toolbar" data-report-toolbar><div class="toolbar__title"><h1>${escapeHtml(meeting.session.title)}</h1><p class="summary">${captureCount} capture${captureCount === 1 ? "" : "s"} · ${commentCount} comment${commentCount === 1 ? "" : "s"} · Started ${timeElement(meeting.session.startedAt)}${meeting.session.closedAt ? ` · Closed ${timeElement(meeting.session.closedAt)}` : ""}</p></div><div class="toolbar__controls">${filters}${trackingBatch}</div></header><div class="evidence-list">${evidence || '<p class="empty">This meeting has 0 captures and 0 comments. New evidence will appear here after a visual comment is saved.</p>'}</div><p class="empty" data-filter-empty hidden>No comments match these filters.</p>${deleteDialog}`,
    reportActionScript,
  );
}

function meetingCard(meeting: VisualMeetingSummary, active: boolean): string {
  return `<article class="meeting-card"><div><span class="eyebrow">${active ? "Current · Active" : "History · Closed"}</span><h3>${escapeHtml(meeting.title)}</h3><p class="summary">${timeElement(meeting.startedAt)}${meeting.closedAt ? ` · Closed ${timeElement(meeting.closedAt)}` : ""}</p><span class="counts">${meeting.captureCount} capture${meeting.captureCount === 1 ? "" : "s"} · ${meeting.commentCount} comment${meeting.commentCount === 1 ? "" : "s"}</span></div><a href="sessions/${encodeURIComponent(meeting.id)}/index.html">Open report</a></article>`;
}

export function renderVisualCommentIndex(
  meetings: VisualMeetingSummary[],
  activeSessionId: string | null,
): string {
  const withEvidence = meetings
    .filter((meeting) => meeting.captureCount > 0 || meeting.commentCount > 0)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const active = withEvidence.find((meeting) => meeting.id === activeSessionId);
  const closed = withEvidence.filter((meeting) => meeting.id !== activeSessionId);
  const activeGroup = active
    ? `<section class="group"><h2>Current meeting</h2><div class="meeting-grid">${meetingCard(active, true)}</div></section>`
    : "";
  const closedGroup = closed.length
    ? `<section class="group"><h2>Closed meeting history</h2><div class="meeting-grid">${closed.map((meeting) => meetingCard(meeting, false)).join("")}</div></section>`
    : "";
  const groups = activeGroup + closedGroup;
  return documentShell(
    "Visual review meetings",
    `<div class="topline"><span class="eyebrow">Figma export review</span></div><h1>Visual review meetings</h1><p class="summary">Current work and durable closed-session evidence.</p>${groups || '<p class="empty">No saved review evidence yet.</p>'}`,
    `(() => {${reportTimeScript}})();`,
  );
}
