import {
  Fragment,
  createElement as h,
  createPortal,
  mountDom,
  useEffect,
  useId,
  useRef,
  useState,
  type DomChild,
} from "./domRuntime";

import "./review.css";
import {
  collapseDisclosurePath,
  unfoldMoreDisclosurePath,
} from "./disclosureIcon";
import {
  readCollapsePreference,
  reviewCollapseStorageKey,
  writeCollapsePreference,
} from "./collapsePreference";
import {
  isStoryIncludedForFigmaExport,
  resolveFigmaExportAddonOptions,
  type FigmaExportAddonOptions,
  type ResolvedFigmaExportAddonOptions,
} from "./options";
import { createFigmaExportDecorator } from "./preview";
import { isHostRenderActive, registerFigmaReviewSync } from "./reviewRegistry";
import { syncFigmaExportOverlay } from "./overlay";
import {
  anchorsMovedEvent,
  areCommentsUnavailable,
  captureAnchoredComment,
  getPinDragBounds,
  registerVisualCommentCaptureHook,
  hasCanvasLayoutChanged,
  placeAnchoredPin,
  readCommentView,
  resolveCommentAnchor,
  resolveFrameReference,
  revealAnchorEvent,
} from "./commentAnchors";
import { getParameterUrl } from "./source";
import { getAddonVersion } from "./version";
import {
  acquireFigmaWorkspaceSlot,
  type FigmaWorkspaceSlotHandle,
} from "./workspace";

import { buildCommentPromptContext, formatTrackingPrompt } from "./visualCommentPrompt";
import {
  VISUAL_COMMENT_KINDS,
  VISUAL_COMMENT_LIMITS,
  clampRatio,
  defaultVisualCommentKind,
  defaultVisualCommentView,
  describeVisualCommentAnchor,
  getCommentComposerPlacement,
  getSavedPinCardPlacement,
  getVisualCommentPin,
  isVisualCommentKind,
  normalizeAuthorName,
  resolveVisualCommentKind,
  resolveVisualCommentView,
  type CreateVisualCommentRequest,
  type VisualCommentAnchor,
  type VisualCommentCaptureController,
  type VisualCommentCaptureResult,
  type VisualCommentKind,
  type VisualCommentOptions,
  type VisualCommentPin,
  type VisualCommentPointSelection,
} from "./visualComment";
import {
  createReviewStatusController,
  createVisualCommentsController,
  type FigmaReviewEntry,
  type FigmaReviewStatus,
  type VisualCommentOverview,
} from "./reviewController";

export type { FigmaReviewEntry, FigmaReviewStatus } from "./reviewController";

type DomKeyboardEvent<T extends HTMLElement> = KeyboardEvent & {
  currentTarget: T;
};
type DomInputEvent<T extends HTMLElement> = Event & {
  currentTarget: T;
};
type DomMouseEvent<T extends HTMLElement> = MouseEvent & {
  currentTarget: T;
};
type DomPointerEvent<T extends HTMLElement> = PointerEvent & {
  currentTarget: T;
};

function SvgIcon({
  children,
  size = 14,
  viewBox = "0 0 14 14",
}: {
  children?: DomChild;
  size?: number;
  viewBox?: string;
}) {
  return h(
    "svg",
    {
      "aria-hidden": "true",
      fill: "none",
      height: size,
      viewBox,
      width: size,
    },
    children,
  );
}

function PathIcon({ d, size }: { d: string; size?: number }) {
  return h(SvgIcon, { size }, h("path", {
    d,
    fill: "none",
    stroke: "currentColor",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-width": "1.25",
  }));
}

function CollapseIcon({ size }: { size?: number }) {
  return h(SvgIcon, { size }, h("path", {
    d: collapseDisclosurePath,
    fill: "currentColor",
  }));
}

function EditIcon({ size }: { size?: number }) {
  return h(SvgIcon, { size }, h("path", {
    d: "M13.854 2.146l-2-2a.5.5 0 00-.708 0l-1.5 1.5-8.995 8.995a.499.499 0 00-.143.268L.012 13.39a.495.495 0 00.135.463.5.5 0 00.462.134l2.482-.496a.495.495 0 00.267-.143l8.995-8.995 1.5-1.5a.5.5 0 000-.708zM12 3.293l.793-.793L11.5 1.207 10.707 2 12 3.293zm-2-.586L1.707 11 3 12.293 11.293 4 10 2.707zM1.137 12.863l.17-.849.679.679-.849.17z",
    fill: "currentColor",
  }));
}

// Storybook CommentIcon.
function CommentIcon({ size }: { size?: number }) {
  return h(SvgIcon, { size, viewBox: "0 0 14 15" }, [
    h("path", {
      d: "M3.5 5.004a.5.5 0 100 1h7a.5.5 0 000-1h-7zM3 8.504a.5.5 0 01.5-.5h7a.5.5 0 010 1h-7a.5.5 0 01-.5-.5z",
      fill: "currentColor",
      key: "lines",
    }),
    h("path", {
      "clip-rule": "evenodd",
      d: "M12.5 12.004H5.707l-1.853 1.854a.5.5 0 01-.351.146h-.006a.499.499 0 01-.497-.5v-1.5H1.5a.5.5 0 01-.5-.5v-9a.5.5 0 01.5-.5h11a.5.5 0 01.5.5v9a.5.5 0 01-.5.5zm-10.5-1v-8h10v8H2z",
      fill: "currentColor",
      "fill-rule": "evenodd",
      key: "bubble",
    }),
  ]);
}

function EyeIcon({ size }: { size?: number }) {
  return h(SvgIcon, { size }, [
    h("path", {
      d: "M7 9.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
      fill: "currentColor",
    }),
    h("path", {
      d: "M14 7l-.21.293C13.669 7.465 10.739 11.5 7 11.5S.332 7.465.21 7.293L0 7l.21-.293C.331 6.536 3.261 2.5 7 2.5s6.668 4.036 6.79 4.207L14 7zM2.896 5.302A12.725 12.725 0 001.245 7c.296.37.874 1.04 1.65 1.698C4.043 9.67 5.482 10.5 7 10.5c1.518 0 2.958-.83 4.104-1.802A12.72 12.72 0 0012.755 7c-.297-.37-.875-1.04-1.65-1.698C9.957 4.33 8.517 3.5 7 3.5c-1.519 0-2.958.83-4.104 1.802z",
      fill: "currentColor",
    }),
  ]);
}

function LinkIcon({ size }: { size?: number }) {
  return h(PathIcon, {
    d: "M5.6 8.4l2.8-2.8M4.55 9.45l-1 .95a2.1 2.1 0 01-2.95-2.95l1.85-1.9a2.1 2.1 0 012.95 0M9.45 4.55l1-.95a2.1 2.1 0 012.95 2.95l-1.85 1.9a2.1 2.1 0 01-2.95 0",
    size,
  });
}

function TrashIcon({ size }: { size?: number }) {
  return h(PathIcon, {
    d: "M2.5 4h9M5 4V2.5h4V4m1.5 0l-.55 8H4.05L3.5 4M5.75 6v4M8.25 6v4",
    size,
  });
}

function UnfoldMoreDisclosureIcon(): DomChild {
  return h(SvgIcon, null, h("path", {
    d: unfoldMoreDisclosurePath,
    fill: "currentColor",
  }));
}

export type FigmaReviewLabels = Partial<{
  approved: string;
  activeMeeting: string;
  addVisualComment: string;
  commentsUnavailable: string;
  adjustCommentPoint: string;
  adjustCommentPointHint: string;
  adjustPendingPinHint: string;
  anonymousAuthor: string;
  authorName: string;
  cancelCapture: string;
  capturedInAnotherState: string;
  commentViews: string;
  layoutChanged: string;
  locationUnavailable: string;
  otherViewPinsNote: string;
  showLocation: string;
  pinDropUnavailable: string;
  pinMoveFailed: string;
  commentMoved: string;
  undoMove: string;
  movedSinceScreenshot: string;
  capturePrompt: string;
  changeAuthorName: string;
  cancelCommentEdit: string;
  cancelDelete: string;
  closeVisualComments: string;
  closeNotes: string;
  commentBody: string;
  commentComposer: string;
  commentKind: string;
  commentKindTracking: string;
  commentKindVisualFix: string;
  commentPlaceholderTracking: string;
  commentPlaceholderVisualFix: string;
  commentingAs: string;
  commentsHeading: string;
  commentsList: string;
  confirmDelete: string;
  copyAllStories: string;
  copyTrackingPrompts: string;
  deleteComment: string;
  deleteCommentDescription: string;
  deleteCommentTitle: string;
  dismissError: string;
  endMeeting: string;
  editComment: string;
  editFigmaSource: string;
  evidenceUnavailable: string;
  exported: string;
  figmaSource: string;
  filterAllComments: string;
  filterComments: string;
  imported: string;
  meetingsHeading: string;
  needsFix: string;
  noComments: string;
  noFilteredComments: string;
  notStarted: string;
  notes: string;
  notesSaved: string;
  openNotes: string;
  openSource: string;
  openVisualComments: string;
  review: string;
  saveAuthorName: string;
  saveCommentChanges: string;
  screenshotUnavailable: string;
  showPins: string;
  showPinsShort: string;
  startMeeting: string;
  startNamedMeeting: string;
  submitComment: string;
  sourcePlaceholder: string;
  title: string;
  viewMeeting: string;
  viewMeetingHint: string;
  viewingMeeting: string;
  visualComments: string;
}>;

export type FigmaExportReviewOptions = {
  apiPath?: string;
  autoMarkExported?: boolean;
  enabled?: boolean;
  getComponentTitle?: (
    context: StorybookContext,
    options: ResolvedFigmaExportAddonOptions,
  ) => string;
  getFigmaSourceUrl?: (
    context: StorybookContext,
    componentTitle: string,
  ) => string | undefined;
  labels?: FigmaReviewLabels;
  showNotes?: boolean;
  visualComments?: VisualCommentOptions;
};

export type FigmaExportReviewProps = {
  apiPath?: string;
  autoMarkExported?: boolean;
  children?: DomChild;
  componentTitle: string;
  enabled: boolean;
  figmaSourceUrl?: string;
  labels?: FigmaReviewLabels;
  showNotes?: boolean;
  storyId: string;
  storyName: string;
  storyTitle: string;
  storyUrl?: string;
  viewMode?: string;
  visualComments?: VisualCommentOptions;
};

export type StorybookContext = {
  globals?: Record<string, unknown>;
  id?: string;
  name?: string;
  parameters?: Record<string, unknown>;
  title?: string;
  viewMode?: string;
};

type SaveState = "error" | "idle" | "loading" | "saved" | "saving";

export const defaultFigmaReviewStatusApiPath = "/__figma_export_review_status";

const defaultLabels = {
  approved: "Approved",
  activeMeeting: "Active",
  addVisualComment: "Add comment",
  commentsUnavailable: "Comments are not available in this view.",
  adjustCommentPoint: "Adjust comment point",
  adjustCommentPointHint:
    "Click or drag the point. Use arrow keys for 1% steps, or Shift plus arrow keys for 5% steps.",
  adjustPendingPinHint: "Drag the pin on the story, or focus it and use the arrow keys.",
  anonymousAuthor: "Anonymous",
  authorName: "Display name",
  cancelCapture: "Cancel capture",
  capturedInAnotherState: "Captured in another state",
  commentViews: "Comment views",
  layoutChanged: "Layout changed since this comment",
  locationUnavailable: "This location is not available in this view.",
  showLocation: "Show location",
  pinDropUnavailable: "Drop the pin on a frame, a line or the canvas.",
  pinMoveFailed: "Couldn't move the comment.",
  commentMoved: "Comment moved.",
  undoMove: "Undo",
  movedSinceScreenshot: "Moved since the screenshot",
  otherViewPinsNote: "These comments' pins appear only in their own view.",
  capturePrompt: "Click where you want to comment",
  changeAuthorName: "Change",
  cancelCommentEdit: "Cancel",
  cancelDelete: "Cancel",
  closeVisualComments: "Close comments",
  closeNotes: "Close",
  commentBody: "Comment",
  commentComposer: "New comment",
  commentKind: "Comment type",
  commentKindTracking: "Tracking",
  commentKindVisualFix: "Visual fix",
  commentPlaceholderTracking: "Event name, parameters, and when it fires",
  commentPlaceholderVisualFix: "What should change here?",
  commentingAs: "Commenting as",
  commentsHeading: "Comments",
  commentsList: "Comments on this story",
  confirmDelete: "Confirm delete",
  copyAllStories: "Copy all stories",
  copyTrackingPrompts: "Copy tracking prompts",
  deleteComment: "Delete comment",
  deleteCommentDescription:
    "This permanently deletes the comment and its screenshot when it is no longer referenced. This cannot be undone.",
  deleteCommentTitle: "Delete comment?",
  dismissError: "Dismiss",
  endMeeting: "End meeting",
  editComment: "Edit comment",
  editFigmaSource: "Edit Figma source",
  evidenceUnavailable: "Screenshot evidence is unavailable.",
  exported: "Exported",
  figmaSource: "Figma source",
  filterAllComments: "All",
  filterComments: "Filter comments",
  imported: "Imported",
  meetingsHeading: "Meetings",
  needsFix: "Needs fix",
  noComments: "No comments on this story yet.",
  noFilteredComments: "No comments of this type on this story.",
  notStarted: "Not started",
  notes: "Notes",
  notesSaved: "Notes saved",
  openNotes: "Open",
  openSource: "Open source",
  openVisualComments: "Open comments",
  review: "Review",
  saveAuthorName: "Save name",
  saveCommentChanges: "Save changes",
  screenshotUnavailable: "Screenshot unavailable",
  showPins: "Show pins",
  showPinsShort: "Pins",
  startMeeting: "Start meeting",
  startNamedMeeting: "Start a named meeting",
  submitComment: "Save comment",
  sourcePlaceholder: "https://www.figma.com/design/...",
  title: "Export review",
  viewMeeting: "View",
  viewMeetingHint: "Turn on View for a meeting below to see its comments and pins.",
  viewingMeeting: "Viewing",
  visualComments: "Visual comments",
} satisfies Required<FigmaReviewLabels>;

const defaultEntry = {
  figmaReviewStatus: "not-started",
} satisfies Pick<FigmaReviewEntry, "figmaReviewStatus">;

function normalizeEntry(
  entry: Partial<FigmaReviewEntry> | null | undefined,
): FigmaReviewEntry {
  const notes = entry?.notes ?? "";

  return {
    componentTitle: entry?.componentTitle,
    figmaNodeUrl: entry?.figmaNodeUrl,
    figmaReviewStatus: entry?.figmaReviewStatus ?? defaultEntry.figmaReviewStatus,
    name: entry?.name,
    notes,
    notesOpen: typeof entry?.notesOpen === "boolean" ? entry.notesOpen : Boolean(notes),
    storyTitle: entry?.storyTitle,
    updatedAt: entry?.updatedAt,
  };
}

function normalizeFigmaSourceUrl(value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) return "";
  if (trimmedValue.startsWith("figma.com/") || trimmedValue.startsWith("www.figma.com/")) {
    return `https://${trimmedValue}`;
  }
  return trimmedValue;
}

function getOpenableUrl(value: string | undefined): string {
  const normalizedValue = normalizeFigmaSourceUrl(value ?? "");
  if (!normalizedValue) return "";

  try {
    const url = new URL(normalizedValue);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    return "";
  }

  return "";
}

function getStatusText(state: SaveState): string {
  if (state === "loading") return "Loading";
  if (state === "saving") return "Saving";
  if (state === "saved") return "Saved";
  if (state === "error") return "Save failed";
  return "Ready";
}

export function getDefaultFigmaExportComponentTitle(
  title: string | undefined,
  options: ResolvedFigmaExportAddonOptions,
): string {
  if (!title) return "Component";
  if (options.storyTitlePrefix === false) return title;

  const matchingPrefix = options.storyTitlePrefix.find((prefix) =>
    title.startsWith(prefix),
  );
  return matchingPrefix ? title.slice(matchingPrefix.length) : title;
}

export function getDefaultFigmaSourceUrl(
  parameters: Record<string, unknown> | undefined,
): string | undefined {
  if (!parameters) return undefined;

  return (
    (typeof parameters.figmaSourceUrl === "string"
      ? parameters.figmaSourceUrl
      : undefined) ??
    getParameterUrl(parameters.figma) ??
    getParameterUrl(parameters.design)
  );
}

function getReviewStatusOptions(labels: Required<FigmaReviewLabels>) {
  return [
    { label: labels.notStarted, value: "not-started" },
    { label: labels.exported, value: "exported" },
    { label: labels.imported, value: "imported" },
    { label: labels.needsFix, value: "needs-fix" },
    { label: labels.approved, value: "approved" },
  ] satisfies Array<{ label: string; value: FigmaReviewStatus }>;
}

// Title of the meeting created automatically by the first direct comment.
function notesMeetingTitle(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `Notes ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Time alone for today's comments, a short date and time otherwise.
function formatCommentTime(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === now.toDateString()
    ? time
    : `${date.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

type CommentFilter = "all" | VisualCommentKind;

// The edit panel's screenshot keeps its aspect ratio within this box.
const editPanelPreviewMaxWidth = 296;
const editPanelPreviewMaxHeight = 200;

function editPanelPreviewSize(width: number, height: number) {
  const ratio = width > 0 && height > 0 ? width / height : 1;
  let previewWidth = editPanelPreviewMaxWidth;
  let previewHeight = previewWidth / ratio;
  if (previewHeight > editPanelPreviewMaxHeight) {
    previewHeight = editPanelPreviewMaxHeight;
    previewWidth = previewHeight * ratio;
  }
  return { height: previewHeight, width: previewWidth };
}

// A line or canvas comment's screenshot, or that of a comment moved since,
// does not map back to its anchor, so its point is not edited.
function isCommentPinEditable(comment: { anchor?: VisualCommentAnchor; movedAt?: string }) {
  return !comment.movedAt && (!comment.anchor || comment.anchor.type === "element");
}

// A press on a saved pin becomes a drag once the pointer moves this far.
const savedPinDragThreshold = 4;
// Arrow-key moves of a saved pin are saved once the keys rest this long.
const savedPinKeyboardSaveDelayMs = 600;
// How long the latest saved move can be undone.
const savedPinUndoWindowMs = 5_000;

// A comment's location before a move, sent back as a restore by Undo.
type SavedPinLocation = {
  anchor: VisualCommentAnchor | null;
  movedAt: string | null;
  pin: VisualCommentPin;
};

type SavedPinDrag = {
  bounds: { height: number; left: number; top: number; width: number };
  center: { left: number; top: number };
  commentId: string;
  dragging: boolean;
  element: HTMLElement;
  // Arrow-key moves: saved when the timer fires or the pin loses focus.
  keyboard?: boolean;
  keyboardTimer?: number;
  onBlur?: () => void;
  offsetX: number;
  offsetY: number;
  onKeyDown?: (event: KeyboardEvent) => void;
  originLeft: string;
  originTop: string;
  pointerId: number;
  startX: number;
  startY: number;
};

function defaultMeetingTitle(): string {
  return `Design review ${new Date().toLocaleString()}`;
}

const visualCommentsResumeKeyPrefix = "sbfx:visual-comments-resume:";
const visualCommentsResumeWindowMs = 15_000;

function visualCommentsResumeKey(storyId: string): string {
  return `${visualCommentsResumeKeyPrefix}${storyId}`;
}

function rememberVisualCommentsOpen(storyId: string): void {
  try {
    sessionStorage.setItem(
      visualCommentsResumeKey(storyId),
      String(Date.now() + visualCommentsResumeWindowMs),
    );
  } catch {
    // Session storage can be unavailable in private/restricted contexts.
  }
}

function clearVisualCommentsResume(storyId: string): void {
  try {
    sessionStorage.removeItem(visualCommentsResumeKey(storyId));
  } catch {
    // Session storage can be unavailable in private/restricted contexts.
  }
}

function consumeVisualCommentsResume(storyId: string): boolean {
  try {
    const key = visualCommentsResumeKey(storyId);
    const expiresAt = Number(sessionStorage.getItem(key));
    sessionStorage.removeItem(key);
    return Number.isFinite(expiresAt) && expiresAt >= Date.now();
  } catch {
    return false;
  }
}

// The kind of the last saved comment preselects the next composer. Writing
// comment evidence inside the project makes the dev server reload the preview,
// so panel requests carry the kind across that reload in a short-lived,
// consume-on-read sessionStorage entry; any other page load starts from the
// default again.
let lastSavedCommentKind: VisualCommentKind = defaultVisualCommentKind;
const visualCommentsKindKey = "sbfx:visual-comments-kind";

function rememberVisualCommentKind(kind: VisualCommentKind): void {
  try {
    sessionStorage.setItem(
      visualCommentsKindKey,
      JSON.stringify({ kind, expiresAt: Date.now() + visualCommentsResumeWindowMs }),
    );
  } catch {
    // Session storage can be unavailable in private/restricted contexts.
  }
}

function consumeVisualCommentKind(): VisualCommentKind | null {
  try {
    const stored = sessionStorage.getItem(visualCommentsKindKey);
    if (stored === null) return null;
    sessionStorage.removeItem(visualCommentsKindKey);
    const entry = JSON.parse(stored) as { kind?: unknown; expiresAt?: unknown };
    return isVisualCommentKind(entry?.kind) &&
      typeof entry.expiresAt === "number" &&
      entry.expiresAt >= Date.now()
      ? entry.kind
      : null;
  } catch {
    return null;
  }
}

function VisualCommentsSection({
  componentTitle,
  enabled,
  labels,
  options,
  storyId,
  storyName,
  storyTitle,
  storyUrl,
}: {
  componentTitle: string;
  enabled: boolean;
  labels: Required<FigmaReviewLabels>;
  options: VisualCommentOptions | undefined;
  storyId: string;
  storyName: string;
  storyTitle: string;
  storyUrl?: string;
}) {
  const detailId = useId();
  const deleteDialogTitleId = useId();
  const deleteDialogDescriptionId = useId();
  const apiPath = options?.apiPath ?? "/__figma_export_review_comments";
  const commentsController = createVisualCommentsController({ apiPath });
  const authorStorageKey = options?.authorStorageKey ?? "sbfx:review-author";
  const [overview, setOverview] = useState<VisualCommentOverview | null>(null);
  const [meetingTitle, setMeetingTitle] = useState(defaultMeetingTitle);
  const [authorName, setAuthorName] = useState(() => {
    try {
      return localStorage.getItem(authorStorageKey) ?? "";
    } catch {
      return "";
    }
  });
  const [commentBody, setCommentBody] = useState("");
  const [commentKind, setCommentKind] = useState<VisualCommentKind>(() => {
    lastSavedCommentKind = consumeVisualCommentKind() ?? lastSavedCommentKind;
    return lastSavedCommentKind;
  });
  const [pendingCapture, setPendingCapture] =
    useState<VisualCommentCaptureResult | null>(null);
  const [pendingPoint, setPendingPoint] =
    useState<VisualCommentPointSelection | null>(null);
  // The view declared when the point was pressed: the comment belongs there
  // even when the host switches views before it is saved.
  const pendingViewRef = useRef<string | null>(null);
  const [livePinPosition, setLivePinPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [visualError, setVisualError] = useState("");
  const [commentsCapability, setCommentsCapability] = useState<
    "available" | "error" | "loading"
  >("loading");
  const [commentsCapabilityError, setCommentsCapabilityError] = useState("");
  const [reportPending, setReportPending] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentPinDrafts, setCommentPinDrafts] = useState<
    Record<string, VisualCommentPin>
  >({});
  const [commentKindDrafts, setCommentKindDrafts] = useState<
    Record<string, VisualCommentKind>
  >({});
  const [commentErrors, setCommentErrors] = useState<Record<string, string>>({});
  const [commentPreviewErrors, setCommentPreviewErrors] = useState<
    Record<string, boolean>
  >({});
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  // Edit opens beside the comment's pin when it is shown, else as the modal.
  const [commentEditSurface, setCommentEditSurface] = useState<"modal" | "panel">("modal");
  const commentEditPanelRef = useRef<HTMLDivElement | null>(null);
  const [commentEditPanelHeight, setCommentEditPanelHeight] = useState(200);
  const [commentMutationId, setCommentMutationId] = useState<string | null>(null);
  const [pendingDeleteCommentId, setPendingDeleteCommentId] = useState<string | null>(
    null,
  );
  const [isPanelOpen, setIsPanelOpen] = useState(() =>
    consumeVisualCommentsResume(storyId),
  );
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all");
  // One meeting at a time is laid over the Story; none when the panel mounts.
  // The choice is keyed by Story, so another Story starts with none viewed.
  const [viewedMeetingChoice, setViewedMeetingChoice] = useState<{
    meetingId: string;
    storyId: string;
  } | null>(null);
  const viewedMeetingId =
    viewedMeetingChoice?.storyId === storyId ? viewedMeetingChoice.meetingId : null;
  const setViewedMeetingId = (meetingId: string | null) =>
    setViewedMeetingChoice(meetingId ? { meetingId, storyId } : null);
  const [showSavedPins, setShowSavedPins] = useState(true);
  const [captureTargetRect, setCaptureTargetRect] = useState<{
    height: number;
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const [prototypeState, setPrototypeState] = useState<{
    routeId?: string;
    stateId?: string;
  }>({});
  // What the host declares inside the capture target (data-sbfx-view and
  // data-sbfx-comments), re-read on every capture-target sync.
  const [hostDeclarations, setHostDeclarations] = useState<{
    commentsUnavailable: boolean;
    view: string;
  }>({ commentsUnavailable: false, view: defaultVisualCommentView });
  // Anchored saved pins are moved by direct style writes when the host moves
  // its anchors; the panel re-renders only when a pin is shown or hidden.
  const anchoredPinsRef = useRef(new Map<string, VisualCommentAnchor>());
  const [, setAnchoredVisibilityVersion] = useState(0);
  // A saved pin being moved shows its new location until the move settles;
  // while one is pending that pin cannot be moved again.
  const [pendingLocations, setPendingLocations] = useState<
    Record<string, { anchor: VisualCommentAnchor } | { pin: VisualCommentPin }>
  >({});
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);
  const pinDragRef = useRef<SavedPinDrag | null>(null);
  // The click that ends a drag must not also select the comment.
  const suppressPinClickRef = useRef<string | null>(null);
  // The latest move notice; a saved move carries what Undo restores.
  const [pinNotice, setPinNotice] = useState<{
    text: string;
    tone: "error" | "info";
    undo?: { commentId: string; previous: SavedPinLocation };
  } | null>(null);
  const pinNoticeTimerRef = useRef(0);
  useEffect(() => () => window.clearTimeout(pinNoticeTimerRef.current), []);
  // The view whose comments are listed; null follows the current view.
  const [listedViewChoice, setListedViewChoice] = useState<string | null>(null);
  // Per comment: the message shown when no host could show its location.
  const [locationNotices, setLocationNotices] = useState<Record<string, string>>({});
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  // The saved pin whose information card is shown: hover wins over focus.
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [focusedPinId, setFocusedPinId] = useState<string | null>(null);
  const [pinCardImageErrors, setPinCardImageErrors] = useState<Record<string, boolean>>({});
  const [pinCardHeight, setPinCardHeight] = useState(160);
  const pinCardRef = useRef<HTMLDivElement | null>(null);
  const pinCardId = useId();
  const [trackingCopyStatus, setTrackingCopyStatus] = useState("");
  const [isCopyingTracking, setIsCopyingTracking] = useState(false);
  const [isNameEditing, setIsNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [isNamedMeetingOpen, setIsNamedMeetingOpen] = useState(false);
  const [composerHeight, setComposerHeight] = useState(180);
  const [viewportSize, setViewportSize] = useState(() => ({
    height: window.innerHeight,
    width: window.innerWidth,
  }));
  const composerRef = useRef<HTMLDivElement | null>(null);
  const composerBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const meetingTitleInputRef = useRef<HTMLInputElement | null>(null);
  const pinDragPointerRef = useRef<number | null>(null);
  const shortcutsEnabled = options?.shortcuts !== false;
  const captureControllerRef = useRef<VisualCommentCaptureController | null>(null);
  const commentPreviewDragRef = useRef<{
    commentId: string;
    pointerId: number;
  } | null>(null);
  const commentEditPinRef = useRef<HTMLButtonElement | null>(null);
  const commentEditImageRef = useRef<HTMLImageElement | null>(null);
  const commentEditTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const commentEditTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const commentEditTitleId = useId();
  const commentKindLabels: Record<VisualCommentKind, string> = {
    "visual-fix": labels.commentKindVisualFix,
    tracking: labels.commentKindTracking,
  };
  // Two toggle buttons rather than a select: one click switches the kind.
  const renderCommentKindControl = (
    value: VisualCommentKind,
    onSelect: (kind: VisualCommentKind) => void,
    marker: "data-comment-kind-select" | "data-comment-edit-kind",
    showLabel = true,
  ) =>
    h(
      "div",
      { className: "sbfx-review__field" },
      showLabel ? h("span", null, labels.commentKind) : null,
      h(
        "div",
        {
          "aria-label": labels.commentKind,
          className: "sbfx-review__kind",
          "data-comment-kind-value": value,
          [marker]: "true",
          role: "group",
        },
        ...VISUAL_COMMENT_KINDS.map((kind) =>
          h(
            "button",
            {
              "aria-pressed": kind === value,
              className: "sbfx-review__kind-option",
              "data-comment-kind-option": kind,
              key: kind,
              onClick: () => onSelect(kind),
              type: "button",
            },
            commentKindLabels[kind],
          ),
        ),
      ),
    );
  // Every meeting's comments on this Story, newest first.
  const storyComments = [...(overview?.comments ?? [])].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
  );
  const meetingRows = overview?.meetings ?? [];
  // A meeting can only be viewed while it holds a comment on this Story.
  const viewedMeeting =
    meetingRows.find(
      (meeting) => meeting.id === viewedMeetingId && meeting.storyCommentCount > 0,
    ) ?? null;
  const viewedComments = viewedMeeting
    ? storyComments.filter((comment) => comment.sessionId === viewedMeeting.id)
    : [];
  // Comments are listed, counted and pinned per view: the current view unless
  // the participant switched to another view's comments.
  const listedView = listedViewChoice ?? hostDeclarations.view;
  const isListingCurrentView = listedView === hostDeclarations.view;
  const viewedInListedView = viewedComments.filter(
    (comment) => resolveVisualCommentView(comment.view) === listedView,
  );
  const otherViewCounts = [
    ...viewedComments.reduce((counts, comment) => {
      const view = resolveVisualCommentView(comment.view);
      if (view !== listedView) counts.set(view, (counts.get(view) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  ].sort(([left], [right]) => left.localeCompare(right));
  const commentCounts: Record<CommentFilter, number> = {
    all: viewedInListedView.length,
    "visual-fix": viewedInListedView.filter(
      (comment) => resolveVisualCommentKind(comment.kind) === "visual-fix",
    ).length,
    tracking: viewedInListedView.filter(
      (comment) => resolveVisualCommentKind(comment.kind) === "tracking",
    ).length,
  };
  const listedComments =
    commentFilter === "all"
      ? viewedInListedView
      : viewedInListedView.filter(
          (comment) => resolveVisualCommentKind(comment.kind) === commentFilter,
        );
  const editingComment = viewedComments.find(
    (comment) => comment.id === editingCommentId,
  );
  const nextOrdinal = (overview?.activeSession?.commentCount ?? 0) + 1;
  const editingCommentDraft = editingComment
    ? (commentDrafts[editingComment.id] ?? editingComment.body)
    : "";
  const editingCommentPin =
    editingComment && isCommentPinEditable(editingComment)
      ? (commentPinDrafts[editingComment.id] ?? editingComment.preview?.pin ?? null)
      : null;
  const editingCommentKind = editingComment
    ? (commentKindDrafts[editingComment.id] ??
      resolveVisualCommentKind(editingComment.kind))
    : defaultVisualCommentKind;
  // The screenshot shows whenever it loads; its point is draggable only when
  // the point can be edited.
  const editingCommentScreenshot =
    editingComment?.preview && !commentPreviewErrors[editingComment.id]
      ? editingComment.preview
      : null;
  const editingCommentHasPreview = Boolean(editingCommentScreenshot && editingCommentPin);
  const editingCommentDraftIsValid =
    Boolean(editingCommentDraft.trim()) &&
    editingCommentDraft.trim().length <= VISUAL_COMMENT_LIMITS.maxBodyLength;

  // A poll sent before a mutation can resolve after the mutation's refresh;
  // only the most recently requested overview may replace the current one.
  const overviewRequestRef = useRef(0);
  // The request whose result the panel last applied.
  const appliedOverviewRequestRef = useRef(0);
  const requestOverview = async () => {
    const requestId = ++overviewRequestRef.current;
    const next = await commentsController.getOverview(storyId);
    if (requestId !== overviewRequestRef.current) return null;
    appliedOverviewRequestRef.current = requestId;
    return next;
  };

  async function refresh() {
    const next = await requestOverview();
    if (next) setOverview(next);
    setCommentsCapability("available");
    setCommentsCapabilityError("");
  }

  useEffect(() => {
    if (!enabled || options?.enabled === false) return;
    let active = true;
    const load = async () => {
      try {
        const next = await requestOverview();
        if (active && next) {
          setOverview(next);
          setCommentsCapability("available");
          setCommentsCapabilityError("");
        }
      } catch (error) {
        if (active) {
          setCommentsCapability("error");
          setCommentsCapabilityError(
            error instanceof Error ? error.message : "Unable to load visual comments.",
          );
        }
      }
    };
    void load();
    const interval = window.setInterval(load, 5_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [apiPath, enabled, options?.enabled, storyId]);

  useEffect(
    () => () => {
      captureControllerRef.current?.cancel();
    },
    [],
  );

  useEffect(() => {
    if (isPanelOpen) {
      document.documentElement.dataset.sbfxCommentsOpen = "true";
    } else {
      delete document.documentElement.dataset.sbfxCommentsOpen;
    }
    return () => {
      delete document.documentElement.dataset.sbfxCommentsOpen;
    };
  }, [isPanelOpen]);

  const draftPin = pendingCapture?.pin ?? pendingPoint?.pin ?? null;
  const draftAnchor = pendingCapture?.anchor ?? pendingPoint?.anchor;
  const draftAnchorKey = draftAnchor ? JSON.stringify(draftAnchor) : "";

  useEffect(() => {
    if (!enabled || options?.enabled === false || !draftPin) {
      setLivePinPosition(null);
      return;
    }
    let animationFrame = 0;
    let settleTimer = 0;
    const syncPosition = () => {
      setViewportSize((current) =>
        current.width === window.innerWidth && current.height === window.innerHeight
          ? current
          : { height: window.innerHeight, width: window.innerWidth },
      );
      const target = commentsController.resolveTarget(options?.captureSelector);
      if (!target) {
        setLivePinPosition(null);
        return;
      }
      if (draftAnchor) {
        setLivePinPosition(placeAnchoredPin(target, draftAnchor));
        return;
      }
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        setLivePinPosition(null);
        return;
      }
      setLivePinPosition({
        left: rect.left + rect.width * draftPin.xRatio,
        top: rect.top + rect.height * draftPin.yRatio,
      });
    };
    const scheduleSync = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(syncPosition);
    };
    // The host moved its anchors in this frame: move the draft pin now, and let
    // the composer follow once the anchors settle.
    const onAnchorsMoved = () => {
      if (!draftAnchor) return;
      const target = commentsController.resolveTarget(options?.captureSelector);
      const placement = target ? placeAnchoredPin(target, draftAnchor) : null;
      const pinElement = document.querySelector<HTMLElement>("[data-sbfx-live-comment-pin]");
      if (pinElement) {
        if (placement) {
          pinElement.style.left = `${placement.left}px`;
          pinElement.style.top = `${placement.top}px`;
          pinElement.style.display = "";
        } else {
          pinElement.style.display = "none";
        }
      }
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(syncPosition, 120);
    };
    syncPosition();
    window.addEventListener("resize", scheduleSync);
    document.addEventListener("scroll", scheduleSync, true);
    document.addEventListener(anchorsMovedEvent, onAnchorsMoved);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(settleTimer);
      window.removeEventListener("resize", scheduleSync);
      document.removeEventListener("scroll", scheduleSync, true);
      document.removeEventListener(anchorsMovedEvent, onAnchorsMoved);
    };
  }, [
    draftPin?.xRatio,
    draftPin?.yRatio,
    draftAnchorKey,
    enabled,
    options?.captureSelector,
    options?.enabled,
  ]);

  const isComposerOpen = Boolean(pendingCapture);
  const isPanelActive = enabled && options?.enabled !== false && isPanelOpen;

  // Saved pins sit at ratios of the capture target, and the prototype can change
  // its layout, route, or state without any event this panel could listen to.
  useEffect(() => {
    if (!isPanelActive) {
      setCaptureTargetRect(null);
      return;
    }
    let animationFrame = 0;
    const sync = () => {
      // Capture falls back to the Story root for an unmatched selector; pins do
      // not, because their ratios belong to the configured target.
      const configured = options?.captureSelector;
      let target: HTMLElement | null = null;
      try {
        target =
          configured && !document.querySelector(configured)
            ? null
            : commentsController.resolveTarget(configured);
      } catch {
        // An invalid selector resolves no target.
      }
      const rect = target?.getBoundingClientRect();
      setCaptureTargetRect((current) => {
        if (!rect?.width || !rect.height) return null;
        return current &&
          current.left === rect.left &&
          current.top === rect.top &&
          current.width === rect.width &&
          current.height === rect.height
          ? current
          : { height: rect.height, left: rect.left, top: rect.top, width: rect.width };
      });
      const metadataRoot = target?.matches("[data-prototype-root]")
        ? target
        : target?.querySelector<HTMLElement>("[data-prototype-root]");
      const routeId = metadataRoot?.dataset.route || undefined;
      const stateId = metadataRoot?.dataset.prototypeState || undefined;
      setPrototypeState((current) =>
        current.routeId === routeId && current.stateId === stateId
          ? current
          : { routeId, stateId },
      );
      const view = readCommentView(target);
      const commentsUnavailable = areCommentsUnavailable(target);
      setHostDeclarations((current) =>
        current.view === view && current.commentsUnavailable === commentsUnavailable
          ? current
          : { commentsUnavailable, view },
      );
    };
    const scheduleSync = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener("resize", scheduleSync);
    document.addEventListener("scroll", scheduleSync, true);
    const interval = window.setInterval(sync, 500);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", scheduleSync);
      document.removeEventListener("scroll", scheduleSync, true);
      window.clearInterval(interval);
    };
  }, [isPanelActive, options?.captureSelector]);

  useEffect(() => {
    setListedViewChoice(null);
    setLocationNotices({});
  }, [hostDeclarations.view, storyId]);

  // Anchored saved pins follow their anchors synchronously, inside the host's
  // sbfx:anchors-moved dispatch, by writing their position directly.
  useEffect(() => {
    if (!isPanelActive) return;
    const syncAnchoredPins = () => {
      const target = commentsController.resolveTarget(options?.captureSelector);
      if (!target) return;
      let visibilityChanged = false;
      for (const pinElement of document.querySelectorAll<HTMLElement>(
        "[data-saved-comment-pin][data-anchored-pin]",
      )) {
        const anchor = anchoredPinsRef.current.get(pinElement.dataset.savedCommentPin ?? "");
        if (!anchor) continue;
        // The pin under the pointer follows the pointer, not its anchor.
        if (pinDragRef.current?.dragging && pinDragRef.current.commentId === pinElement.dataset.savedCommentPin) {
          continue;
        }
        const placement = placeAnchoredPin(target, anchor);
        const wasHidden = pinElement.style.display === "none";
        if (placement) {
          pinElement.style.left = `${placement.left}px`;
          pinElement.style.top = `${placement.top}px`;
          pinElement.style.display = "";
        } else {
          pinElement.style.display = "none";
        }
        if (wasHidden !== !placement) visibilityChanged = true;
      }
      if (visibilityChanged) setAnchoredVisibilityVersion((version) => version + 1);
      placeCommentEditPanel();
    };
    document.addEventListener(anchorsMovedEvent, syncAnchoredPins);
    window.addEventListener("resize", syncAnchoredPins);
    document.addEventListener("scroll", syncAnchoredPins, true);
    const interval = window.setInterval(syncAnchoredPins, 500);
    return () => {
      document.removeEventListener(anchorsMovedEvent, syncAnchoredPins);
      window.removeEventListener("resize", syncAnchoredPins);
      document.removeEventListener("scroll", syncAnchoredPins, true);
      window.clearInterval(interval);
    };
  }, [isPanelActive, options?.captureSelector]);

  // Which list item holds focus. Focus events also fire while the list is being
  // re-rendered, so the state is read from the document after the event settles.
  useEffect(() => {
    if (!isPanelActive) {
      setFocusedCommentId(null);
      setFocusedPinId(null);
      return;
    }
    let timer = 0;
    const syncFocus = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const item = document.activeElement?.closest<HTMLElement>(
          ".sbfx-comments-panel [data-comment-id]",
        );
        setFocusedCommentId(item?.dataset.commentId ?? null);
        const pin = document.activeElement?.closest<HTMLElement>("[data-saved-comment-pin]");
        setFocusedPinId(pin?.dataset.savedCommentPin ?? null);
      }, 0);
    };
    document.addEventListener("focusin", syncFocus);
    document.addEventListener("focusout", syncFocus);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusin", syncFocus);
      document.removeEventListener("focusout", syncFocus);
    };
  }, [isPanelActive]);

  useEffect(() => {
    if (selectedCommentId) revealComment(selectedCommentId);
  }, [selectedCommentId]);

  // The viewed meeting lost its last comment on this Story. Only the newest
  // overview may say so: while a newer request is in flight (a save's refresh
  // overtaken by a poll), the current data can predate the saved comment.
  useEffect(() => {
    if (
      overview &&
      viewedMeetingId &&
      !viewedMeeting &&
      appliedOverviewRequestRef.current === overviewRequestRef.current
    ) {
      setViewedMeetingId(null);
    }
  }, [overview, viewedMeetingId]);
  const canSubmitComment =
    isComposerOpen &&
    commentsCapability === "available" &&
    !isBusy &&
    Boolean(commentBody.trim());

  // The composer and the pin card are placed from their measured heights.
  useEffect(() => {
    const height = composerRef.current?.offsetHeight;
    if (height && Math.abs(height - composerHeight) > 0.5) setComposerHeight(height);
    const editPanelHeight = commentEditPanelRef.current?.offsetHeight;
    if (editPanelHeight && Math.abs(editPanelHeight - commentEditPanelHeight) > 0.5) {
      setCommentEditPanelHeight(editPanelHeight);
    }
    placeCommentEditPanel();
    const cardHeight = pinCardRef.current?.offsetHeight;
    if (cardHeight && Math.abs(cardHeight - pinCardHeight) > 0.5) setPinCardHeight(cardHeight);
  });

  useEffect(() => {
    if (isComposerOpen) composerBodyRef.current?.focus();
  }, [isComposerOpen]);

  useEffect(() => {
    if (isNameEditing) nameInputRef.current?.focus();
  }, [isNameEditing]);

  useEffect(() => {
    if (isNamedMeetingOpen) meetingTitleInputRef.current?.focus();
  }, [isNamedMeetingOpen]);

  // Registered on every render so the handler always sees current state.
  useEffect(() => {
    if (!enabled || options?.enabled === false) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialogOpen = Boolean(editingCommentId || pendingDeleteCommentId);
      if (event.key === "Escape") {
        if (isComposerOpen && !dialogOpen) {
          // Captured on the document, so the page never sees this Escape.
          event.preventDefault();
          event.stopPropagation();
          cancelCapture();
        }
        return;
      }
      if (!shortcutsEnabled || dialogOpen) return;
      if (isComposerOpen) {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.stopPropagation();
          if (canSubmitComment) void submitComment();
        }
        return;
      }
      // composedPath reaches the focused field inside a web component's shadow root.
      const origin = event.composedPath()[0];
      const target =
        origin instanceof Element
          ? origin
          : event.target instanceof Element
            ? event.target
            : null;
      if (
        (event.key === "c" || event.key === "C") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !isCapturing &&
        commentsCapability === "available" &&
        !target?.closest("input, textarea, select") &&
        !(target instanceof HTMLElement && target.isContentEditable) &&
        // A view that declines comments leaves C to the page.
        !areCommentsUnavailable(commentsController.resolveTarget(options?.captureSelector))
      ) {
        event.preventDefault();
        event.stopPropagation();
        armCapture();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  });

  useEffect(() => {
    if (!pendingDeleteCommentId) return;
    deleteCancelRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeDeleteDialog();
    };
    // Capture phase: the page's own Escape handling never sees this press.
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [pendingDeleteCommentId]);

  useEffect(() => {
    if (!editingCommentId) return;
    // Next frame: a render restores the focus it started with (the clicked pin
    // or Edit button), which would undo a focus moved inside the render.
    const focusFrame = window.requestAnimationFrame(() => {
      const modalPin = commentEditPinRef.current?.isConnected ? commentEditPinRef.current : null;
      (modalPin ?? commentEditTextareaRef.current)?.focus();
    });
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancelCommentEdit(editingCommentId);
    };
    // Capture phase: the page's own Escape handling never sees this press.
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [editingCommentId]);

  useEffect(() => {
    setEditingCommentId(null);
    setCommentDrafts({});
    setCommentPinDrafts({});
    setCommentKindDrafts({});
    setCommentErrors({});
    setCommentPreviewErrors({});
    commentEditTriggerRef.current = null;
    // A pending capture shows the previous Story; saving it here would file
    // that screenshot under this Story.
    cancelCapture();
    setCommentBody("");
    setVisualError("");
    setSelectedCommentId(null);
    setHighlightedCommentId(null);
    setFocusedCommentId(null);
    setTrackingCopyStatus("");
    // Returning to a Story starts with no meeting viewed, too.
    setViewedMeetingChoice(null);
    setHoveredPinId(null);
    setFocusedPinId(null);
  }, [storyId]);

  if (!enabled || options?.enabled === false) return null;

  async function mutate(path: string, body?: unknown) {
    setIsBusy(true);
    setVisualError("");
    try {
      const payload = await commentsController.post(path, body);
      setReportPending(Boolean(payload.reportStale));
      await refresh();
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Visual comments request failed.";
      setCommentsCapability("error");
      setCommentsCapabilityError(message);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }

  function armCapture() {
    if (commentsCapability !== "available") return;
    if (areCommentsUnavailable(commentsController.resolveTarget(options?.captureSelector))) return;
    captureControllerRef.current?.cancel();
    setVisualError("");
    setPendingCapture(null);
    setPendingPoint(null);
    // A cancelled draft must not decide the next comment's kind.
    setCommentKind(lastSavedCommentKind);
    setIsCapturing(true);
    pendingViewRef.current = null;
    captureControllerRef.current = commentsController.beginCapture({
      onCancel: () => {
        setIsCapturing(false);
        setPendingPoint(null);
      },
      onCaptured: (capture) => {
        setPendingCapture(capture);
        setPendingPoint(null);
        setIsCapturing(false);
      },
      onError: (error) => {
        setIsCapturing(false);
        setPendingPoint(null);
        setVisualError(error.message);
      },
      onPointSelected: (selection) => {
        pendingViewRef.current = readCommentView(
          commentsController.resolveTarget(options?.captureSelector),
        );
        setPendingPoint(selection);
      },
      resolveAnchor: resolveCommentAnchor,
      captureAnchor: captureAnchoredComment,
      selector: options?.captureSelector,
    });
  }

  function cancelCapture() {
    captureControllerRef.current?.cancel();
    captureControllerRef.current = null;
    setIsCapturing(false);
    setPendingCapture(null);
    setPendingPoint(null);
  }

  // The rect the pending pin's ratios refer to: where the anchored capture's
  // area is now (the host can pan or zoom while the composer is open), else
  // where it was captured, else the capture target.
  function pendingPinFrame() {
    if (pendingCapture?.pinFrameReference) {
      const target = commentsController.resolveTarget(options?.captureSelector);
      const live = target ? resolveFrameReference(target, pendingCapture.pinFrameReference) : null;
      if (live?.width && live.height) return live;
    }
    if (pendingCapture?.pinFrame) return pendingCapture.pinFrame;
    const rect = commentsController.resolveTarget(options?.captureSelector)?.getBoundingClientRect();
    return rect?.width && rect.height ? rect : null;
  }

  // A pending pin stays where it can be shown and resolved: inside its
  // screenshot area and the visible capture target, canvas and viewport.
  function clampPendingPin(pin: VisualCommentPin): VisualCommentPin {
    const target = commentsController.resolveTarget(options?.captureSelector);
    const frame = pendingPinFrame();
    if (!target || !frame) return pin;
    const bounds = getPinDragBounds(target);
    const left = Math.max(frame.left, bounds.left);
    const top = Math.max(frame.top, bounds.top);
    // A pixel inside the edges: hit testing rounds a point on the edge out.
    const right = Math.min(frame.left + frame.width, bounds.left + bounds.width) - 1;
    const bottom = Math.min(frame.top + frame.height, bounds.top + bounds.height) - 1;
    if (right <= left || bottom <= top) return pin;
    const x = Math.min(right, Math.max(left, frame.left + frame.width * pin.xRatio));
    const y = Math.min(bottom, Math.max(top, frame.top + frame.height * pin.yRatio));
    return { xRatio: (x - frame.left) / frame.width, yRatio: (y - frame.top) / frame.height };
  }

  // The anchor follows the adjusted point by the same rules as the press.
  function anchorAtPin(pin: VisualCommentPin) {
    const target = commentsController.resolveTarget(options?.captureSelector);
    const frame = pendingPinFrame();
    if (!target || !frame) return undefined;
    return resolveCommentAnchor(
      target,
      frame.left + frame.width * pin.xRatio,
      frame.top + frame.height * pin.yRatio,
    );
  }

  function updatePendingPin(pin: VisualCommentPin) {
    const visiblePin = clampPendingPin(pin);
    const normalizedPin = {
      xRatio: clampRatio(visiblePin.xRatio),
      yRatio: clampRatio(visiblePin.yRatio),
    };
    const anchor = anchorAtPin(normalizedPin);
    setPendingCapture((current) => {
      if (!current) return current;
      const { anchor: _previous, ...rest } = current;
      return { ...rest, pin: normalizedPin, ...(anchor ? { anchor } : {}) };
    });
  }

  function handlePendingPinPointerDown(event: DomPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    pinDragPointerRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic PointerEvents may not have an active browser pointer to capture.
    }
  }

  function handlePendingPinPointerMove(event: DomPointerEvent<HTMLButtonElement>) {
    if (pinDragPointerRef.current !== event.pointerId) return;
    event.stopPropagation();
    const frame = pendingPinFrame();
    if (!frame) return;
    updatePendingPin(getVisualCommentPin(frame, event.clientX, event.clientY));
  }

  function handlePendingPinPointerEnd(event: DomPointerEvent<HTMLButtonElement>) {
    if (pinDragPointerRef.current !== event.pointerId) return;
    event.stopPropagation();
    pinDragPointerRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // The pointer can already be released after cancellation.
    }
  }

  function handlePendingPinKeyDown(event: DomKeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 0.05 : 0.01;
    let xDelta = 0;
    let yDelta = 0;
    if (event.key === "ArrowLeft") xDelta = -step;
    else if (event.key === "ArrowRight") xDelta = step;
    else if (event.key === "ArrowUp") yDelta = -step;
    else if (event.key === "ArrowDown") yDelta = step;
    else return;
    event.preventDefault();
    event.stopPropagation();
    if (!pendingCapture) return;
    updatePendingPin({
      xRatio: pendingCapture.pin.xRatio + xDelta,
      yRatio: pendingCapture.pin.yRatio + yDelta,
    });
  }

  // Hiding saved pins fires no mouseleave on the pin under the pointer, so
  // every action that hides pins also forgets the hovered one.
  function forgetHoveredPin() {
    setHoveredPinId(null);
  }

  function togglePanel() {
    if (isPanelOpen) {
      clearVisualCommentsResume(storyId);
      if (editingCommentId) cancelCommentEdit(editingCommentId, false);
      forgetHoveredPin();
    }
    setIsPanelOpen(!isPanelOpen);
  }

  function preserveOpenPanelDuringMutation(
    kind: VisualCommentKind = lastSavedCommentKind,
  ) {
    if (isPanelOpen) rememberVisualCommentsOpen(storyId);
    rememberVisualCommentKind(kind);
  }

  async function submitComment() {
    if (!pendingCapture || !commentBody.trim()) return;
    const captureRoot = document.querySelector<HTMLElement>(
      options?.captureSelector ?? "#storybook-root",
    );
    const metadataRoot =
      captureRoot?.matches("[data-prototype-root]")
        ? captureRoot
        : captureRoot?.querySelector<HTMLElement>("[data-prototype-root]");
    const view = pendingViewRef.current ?? readCommentView(captureRoot);
    const request: CreateVisualCommentRequest = {
      authorName: normalizeAuthorName(authorName).slice(
        0,
        VISUAL_COMMENT_LIMITS.maxAuthorLength,
      ),
      body: commentBody.trim().slice(0, VISUAL_COMMENT_LIMITS.maxBodyLength),
      kind: commentKind,
      capture: pendingCapture.capture,
      clientRequestId:
        globalThis.crypto?.randomUUID?.() ??
        `comment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      pin: pendingCapture.pin,
      ...(pendingCapture.anchor ? { anchor: pendingCapture.anchor } : {}),
      story: {
        id: storyId,
        name: storyName,
        title: storyTitle || componentTitle,
        ...(storyUrl ? { url: storyUrl } : {}),
        ...(metadataRoot?.dataset.prototypeRoot
          ? { prototypeId: metadataRoot.dataset.prototypeRoot }
          : {}),
        ...(metadataRoot?.dataset.route ? { routeId: metadataRoot.dataset.route } : {}),
        ...(metadataRoot?.dataset.prototypeState
          ? { stateId: metadataRoot.dataset.prototypeState }
          : {}),
        ...(view !== defaultVisualCommentView ? { view } : {}),
      },
      viewport: pendingCapture.viewport,
    };
    try {
      localStorage.setItem(authorStorageKey, authorName);
    } catch {
      // Browser storage can be unavailable in private/restricted contexts.
    }
    try {
      preserveOpenPanelDuringMutation(commentKind);
      setVisualError("");
      setIsBusy(true);
      const sessionId =
        overview?.activeSession?.id ??
        (await commentsController.ensureMeeting(notesMeetingTitle()));
      await mutate(`/sessions/${encodeURIComponent(sessionId)}/comments`, request);
      // Show the meeting that now holds the new comment, and the current view's
      // comments, so its pin appears.
      setViewedMeetingId(sessionId);
      setListedViewChoice(null);
      pendingViewRef.current = null;
      lastSavedCommentKind = commentKind;
      setPendingCapture(null);
      setPendingPoint(null);
      setCommentBody("");
    } catch (error) {
      rememberVisualCommentKind(lastSavedCommentKind);
      setVisualError(error instanceof Error ? error.message : "Unable to save comment.");
    } finally {
      setIsBusy(false);
    }
  }

  function toggleMeetingView(meetingId: string) {
    setViewedMeetingId(viewedMeetingId === meetingId ? null : meetingId);
    setSelectedCommentId(null);
    setHighlightedCommentId(null);
    forgetHoveredPin();
    setTrackingCopyStatus("");
  }

  // Asks the host to bring an anchored comment's location into view.
  function showAnchoredLocation(comment: (typeof storyComments)[number]) {
    if (!comment.anchor) return;
    const request = new CustomEvent(revealAnchorEvent, {
      bubbles: true,
      cancelable: true,
      detail: {
        anchor: comment.anchor,
        commentId: comment.id,
        view: resolveVisualCommentView(comment.view),
      },
    });
    const handled = !document.dispatchEvent(request);
    setLocationNotices((current) => {
      const { [comment.id]: _removed, ...rest } = current;
      return handled ? rest : { ...rest, [comment.id]: labels.locationUnavailable };
    });
    if (!handled) return;
    setSelectedCommentId(comment.id);
    window.requestAnimationFrame(() => setAnchoredVisibilityVersion((version) => version + 1));
  }

  function revealComment(commentId: string, { focus = true }: { focus?: boolean } = {}) {
    const item = Array.from(
      document.querySelectorAll<HTMLElement>(".sbfx-comments-panel [data-comment-id]"),
    ).find((element) => element.dataset.commentId === commentId);
    item?.scrollIntoView({ block: "nearest" });
    if (focus) item?.focus();
  }

  // Activating a saved pin selects its comment and opens its edit panel beside
  // the pin; another comment's open editor closes as Cancel would.
  function activateSavedPin(
    comment: (typeof storyComments)[number],
    pinElement: HTMLButtonElement,
  ) {
    setSelectedCommentId(comment.id);
    revealComment(comment.id, { focus: false });
    if (editingCommentId === comment.id && commentEditSurface === "panel") {
      window.requestAnimationFrame(() => commentEditTextareaRef.current?.focus());
      return;
    }
    if (editingCommentId) {
      // A focused field keeps its text through a re-render; let it go first so
      // the next comment's panel shows that comment's body.
      if (commentEditPanelRef.current?.contains(document.activeElement)) {
        (document.activeElement as HTMLElement).blur();
      }
      cancelCommentEdit(editingCommentId, false);
    }
    beginCommentEdit(
      comment.id,
      comment.body,
      isCommentPinEditable(comment) ? (comment.preview?.pin ?? null) : null,
      resolveVisualCommentKind(comment.kind),
      pinElement,
    );
  }

  // Text only: the prompt lists each screenshot path for the coding agent.
  // Both scopes come from the viewed meeting, so the Markdown matches that
  // meeting's report.
  async function copyTrackingPrompts(scope: "all" | "story") {
    const session = viewedMeeting;
    if (!session) return;
    setIsCopyingTracking(true);
    setTrackingCopyStatus("");
    try {
      const meeting = await commentsController.getMeeting(session.id);
      const reportBase = new URL(session.reportUrl, window.location.href);
      const entries = meeting.comments.flatMap((comment, index) => {
        const capture = meeting.captures[comment.captureId];
        if (
          !capture ||
          comment.resolvedAt ||
          resolveVisualCommentKind(comment.kind) !== "tracking" ||
          (scope === "story" && capture.story.id !== storyId)
        ) {
          return [];
        }
        const screenshotUrl = new URL(capture.image.path, reportBase);
        return [
          {
            context: buildCommentPromptContext({
              capture,
              comment,
              kind: "tracking",
              ordinal: index + 1,
              projectRelativeSessionPath: session.projectRelativeSessionPath,
            }),
            screenshotUrl:
              screenshotUrl.origin === window.location.origin ? screenshotUrl : null,
          },
        ];
      });
      if (!entries.length) {
        setTrackingCopyStatus("No open tracking comments to copy.");
        return;
      }
      await navigator.clipboard.writeText(formatTrackingPrompt(entries));
      setTrackingCopyStatus(
        `Tracking prompt copied. Comments included: ${entries.length}.`,
      );
    } catch {
      setTrackingCopyStatus(
        "Unable to copy AI prompt. Check browser clipboard permission.",
      );
    } finally {
      setIsCopyingTracking(false);
    }
  }

  function saveAuthorName() {
    const next = nameDraft.trim().slice(0, VISUAL_COMMENT_LIMITS.maxAuthorLength);
    setAuthorName(next);
    try {
      localStorage.setItem(authorStorageKey, next);
    } catch {
      // Browser storage can be unavailable in private/restricted contexts.
    }
    setIsNameEditing(false);
  }

  // Shown: rendered with its center inside the viewport. A Story pin keeps its
  // place when the Story scrolls away, so being rendered is not enough.
  function isSavedPinShown(commentId: string) {
    const pinElement = document.querySelector<HTMLElement>(
      `[data-saved-comment-pin="${CSS.escape(commentId)}"]`,
    );
    if (!pinElement || pinElement.style.display === "none") return false;
    const rect = pinElement.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    return x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
  }

  // Edit opens beside the comment's pin. An anchored pin of the current view
  // that is off screen is first brought into view by the host; when nothing
  // can show the pin, Edit uses the evidence modal.
  function beginCommentEdit(
    commentId: string,
    body: string,
    pin: VisualCommentPin | null,
    kind: VisualCommentKind,
    trigger: HTMLButtonElement,
  ) {
    commentEditTriggerRef.current = trigger;
    if (isSavedPinShown(commentId)) {
      openCommentEdit(commentId, body, pin, kind, "panel");
      return;
    }
    const comment = overview?.comments.find((entry) => entry.id === commentId);
    const pinPlaced = document.querySelector(`[data-saved-comment-pin="${CSS.escape(commentId)}"]`);
    if (comment?.anchor && pinPlaced) {
      const request = new CustomEvent(revealAnchorEvent, {
        bubbles: true,
        cancelable: true,
        detail: { anchor: comment.anchor, commentId, view: resolveVisualCommentView(comment.view) },
      });
      if (!document.dispatchEvent(request)) {
        window.requestAnimationFrame(() =>
          openCommentEdit(commentId, body, pin, kind, isSavedPinShown(commentId) ? "panel" : "modal"),
        );
        return;
      }
    }
    openCommentEdit(commentId, body, pin, kind, "modal");
  }

  function openCommentEdit(
    commentId: string,
    body: string,
    pin: VisualCommentPin | null,
    kind: VisualCommentKind,
    surface: "modal" | "panel",
  ) {
    setCommentEditSurface(surface);
    setEditingCommentId(commentId);
    setCommentDrafts({ [commentId]: body });
    setCommentPinDrafts(pin ? { [commentId]: { ...pin } } : {});
    setCommentKindDrafts({ [commentId]: kind });
    setCommentErrors({ [commentId]: "" });
    setCommentPreviewErrors({});
  }

  function cancelCommentEdit(commentId: string, restoreFocus = true) {
    const returnTarget = commentEditTriggerRef.current;
    setEditingCommentId(null);
    setCommentDrafts((current) => {
      const next = { ...current };
      delete next[commentId];
      return next;
    });
    setCommentPinDrafts((current) => {
      const next = { ...current };
      delete next[commentId];
      return next;
    });
    setCommentKindDrafts((current) => {
      const next = { ...current };
      delete next[commentId];
      return next;
    });
    setCommentErrors((current) => {
      const next = { ...current };
      delete next[commentId];
      return next;
    });
    setCommentPreviewErrors((current) => {
      const next = { ...current };
      delete next[commentId];
      return next;
    });
    commentEditTriggerRef.current = null;
    if (restoreFocus && returnTarget) {
      window.requestAnimationFrame(() => {
        if (returnTarget.isConnected) returnTarget.focus();
      });
    }
  }

  // Edits and deletes go to the meeting that stores the comment.
  const commentPath = (commentId: string) => {
    const comment = overview?.comments.find((entry) => entry.id === commentId);
    return comment
      ? `/sessions/${encodeURIComponent(comment.sessionId)}/comments/${encodeURIComponent(commentId)}`
      : null;
  };

  async function saveCommentEdit(commentId: string) {
    const path = commentPath(commentId);
    if (!overview || !path) return;
    const body = commentDrafts[commentId]?.trim() ?? "";
    if (!body || body.length > VISUAL_COMMENT_LIMITS.maxBodyLength) {
      setCommentErrors((current) => ({
        ...current,
        [commentId]: `Comment must contain 1–${VISUAL_COMMENT_LIMITS.maxBodyLength} characters.`,
      }));
      return;
    }
    setCommentMutationId(commentId);
    setCommentErrors((current) => ({ ...current, [commentId]: "" }));
    try {
      preserveOpenPanelDuringMutation();
      const comment = overview.comments.find((entry) => entry.id === commentId);
      const pin = commentPinDrafts[commentId];
      // Only the evidence modal edits the point: where the point maps back to
      // the anchor and its screenshot has loaded.
      const evidenceImage = commentEditImageRef.current;
      const includePin = Boolean(
        commentEditSurface === "modal" &&
          comment &&
          isCommentPinEditable(comment) &&
          comment.preview &&
          !commentPreviewErrors[commentId] &&
          evidenceImage?.isConnected &&
          evidenceImage.complete &&
          evidenceImage.naturalWidth > 0 &&
          pin,
      );
      // Kind joins the same edit request only when the reviewer changed it.
      const kindDraft = commentKindDrafts[commentId];
      const includeKind = Boolean(
        comment && kindDraft && kindDraft !== resolveVisualCommentKind(comment.kind),
      );
      const payload = await commentsController.patch(
        path,
        {
          body,
          ...(includePin ? { pin } : {}),
          ...(includeKind ? { kind: kindDraft } : {}),
        },
      );
      setReportPending(Boolean(payload.reportStale));
      await refresh();
      cancelCommentEdit(commentId);
    } catch (error) {
      setCommentErrors((current) => ({
        ...current,
        [commentId]:
          error instanceof Error ? error.message : "Unable to update comment.",
      }));
    } finally {
      setCommentMutationId(null);
    }
  }

  function updateCommentPin(commentId: string, pin: VisualCommentPin) {
    setCommentPinDrafts((current) => ({
      ...current,
      [commentId]: {
        xRatio: clampRatio(pin.xRatio),
        yRatio: clampRatio(pin.yRatio),
      },
    }));
    setCommentErrors((current) => ({ ...current, [commentId]: "" }));
  }

  function updateCommentPinFromPointer(
    commentId: string,
    event: DomPointerEvent<HTMLElement>,
  ) {
    updateCommentPin(
      commentId,
      getVisualCommentPin(
        event.currentTarget.getBoundingClientRect(),
        event.clientX,
        event.clientY,
      ),
    );
  }

  function handleCommentPreviewPointerDown(
    commentId: string,
    event: DomPointerEvent<HTMLElement>,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    if (event.target instanceof HTMLButtonElement) event.target.focus();
    commentPreviewDragRef.current = { commentId, pointerId: event.pointerId };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic PointerEvents may not have an active browser pointer to capture.
    }
    updateCommentPinFromPointer(commentId, event);
  }

  function handleCommentPreviewPointerMove(
    commentId: string,
    event: DomPointerEvent<HTMLElement>,
  ) {
    const drag = commentPreviewDragRef.current;
    if (drag?.commentId !== commentId || drag.pointerId !== event.pointerId) return;
    updateCommentPinFromPointer(commentId, event);
  }

  function handleCommentPreviewPointerEnd(
    commentId: string,
    event: DomPointerEvent<HTMLElement>,
  ) {
    const drag = commentPreviewDragRef.current;
    if (drag?.commentId !== commentId || drag.pointerId !== event.pointerId) return;
    commentPreviewDragRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // The pointer can already be released after leaving the preview or cancellation.
    }
  }

  function handleCommentPinKeyDown(
    commentId: string,
    event: DomKeyboardEvent<HTMLElement>,
  ) {
    const step = event.shiftKey ? 0.05 : 0.01;
    let xDelta = 0;
    let yDelta = 0;
    if (event.key === "ArrowLeft") xDelta = -step;
    else if (event.key === "ArrowRight") xDelta = step;
    else if (event.key === "ArrowUp") yDelta = -step;
    else if (event.key === "ArrowDown") yDelta = step;
    else return;
    event.preventDefault();
    setCommentPinDrafts((current) => {
      const pin = current[commentId];
      return pin
        ? {
            ...current,
            [commentId]: {
              xRatio: clampRatio(pin.xRatio + xDelta),
              yRatio: clampRatio(pin.yRatio + yDelta),
            },
          }
        : current;
    });
    setCommentErrors((current) => ({ ...current, [commentId]: "" }));
  }

  // Saved pins move by dragging: a press becomes a drag past the threshold,
  // the pin then follows the pointer inside the area pins are shown in, and the
  // release resolves and saves the new location.
  function restoreSavedPinElement(drag: SavedPinDrag) {
    drag.element.style.left = drag.originLeft;
    drag.element.style.top = drag.originTop;
    placeCommentEditPanel();
  }

  // The edit panel follows its pin by direct writes, like anchored pins do, so
  // drags and host camera moves need no re-render.
  function placeCommentEditPanel() {
    const panel = commentEditPanelRef.current;
    const commentId = panel?.dataset.commentEditPanel;
    if (!panel || !commentId) return;
    const pinElement = document.querySelector<HTMLElement>(
      `[data-saved-comment-pin="${CSS.escape(commentId)}"]`,
    );
    if (!pinElement || pinElement.style.display === "none") return;
    const rect = pinElement.getBoundingClientRect();
    const placement = getCommentComposerPlacement(
      { left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 },
      { height: window.innerHeight, width: window.innerWidth },
      panel.offsetHeight || commentEditPanelHeight,
    );
    if ("dock" in placement) {
      panel.dataset.composerDock = placement.dock;
      panel.style.left = "";
      panel.style.top = "";
    } else {
      delete panel.dataset.composerDock;
      panel.style.left = `${placement.left}px`;
      panel.style.top = `${placement.top}px`;
    }
  }

  function endSavedPinDrag(): SavedPinDrag | null {
    const drag = pinDragRef.current;
    pinDragRef.current = null;
    if (!drag) return null;
    window.clearTimeout(drag.keyboardTimer);
    if (drag.onKeyDown) window.removeEventListener("keydown", drag.onKeyDown, true);
    if (drag.onBlur) drag.element.removeEventListener("blur", drag.onBlur);
    try {
      if (drag.element.hasPointerCapture?.(drag.pointerId)) {
        drag.element.releasePointerCapture(drag.pointerId);
      }
    } catch {
      // The pointer can already be released.
    }
    return drag;
  }

  function cancelSavedPinDrag() {
    const drag = endSavedPinDrag();
    if (!drag) return;
    if (drag.dragging) {
      restoreSavedPinElement(drag);
      // The click that ends a cancelled pointer drag is no activation; a
      // keyboard move has no such click.
      if (!drag.keyboard) suppressPinClickRef.current = drag.commentId;
      setDraggingPinId(null);
    }
  }

  // Escape puts a moving pin back. Window capture runs before every other
  // Escape handler, an open edit panel's included, and the page never sees it.
  function listenForMoveEscape(drag: SavedPinDrag) {
    drag.onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      cancelSavedPinDrag();
    };
    window.addEventListener("keydown", drag.onKeyDown, true);
  }

  function handleSavedPinPointerDown(
    comment: { id: string },
    event: DomPointerEvent<HTMLButtonElement>,
  ) {
    event.stopPropagation();
    // A new press: a click held back from an earlier drag no longer comes.
    suppressPinClickRef.current = null;
    // An arrow-key move waiting for its save is saved first; the pin whose
    // move is being saved cannot start another.
    const waiting = pinDragRef.current?.keyboard ? pinDragRef.current : null;
    if (waiting) {
      commitSavedPinKeyboardMove(waiting.commentId);
      if (waiting.commentId === comment.id) return;
    }
    if (event.button !== 0 || isCapturing || isComposerOpen || pendingLocations[comment.id]) return;
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const target = commentsController.resolveTarget(options?.captureSelector);
    pinDragRef.current = {
      bounds: target
        ? getPinDragBounds(target)
        : { height: window.innerHeight, left: 0, top: 0, width: window.innerWidth },
      center: { left: centerX, top: centerY },
      commentId: comment.id,
      dragging: false,
      element,
      offsetX: event.clientX - centerX,
      offsetY: event.clientY - centerY,
      originLeft: element.style.left,
      originTop: element.style.top,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    try {
      element.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic PointerEvents may not have an active browser pointer to capture.
    }
  }

  function handleSavedPinPointerMove(
    comment: { id: string },
    event: DomPointerEvent<HTMLButtonElement>,
  ) {
    const drag = pinDragRef.current;
    if (!drag || drag.commentId !== comment.id || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (!drag.dragging) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distance <= savedPinDragThreshold) return;
      drag.dragging = true;
      listenForMoveEscape(drag);
      setDraggingPinId(comment.id);
      setPinNotice(null);
    }
    const { bounds } = drag;
    const left = Math.min(bounds.left + bounds.width, Math.max(bounds.left, event.clientX - drag.offsetX));
    const top = Math.min(bounds.top + bounds.height, Math.max(bounds.top, event.clientY - drag.offsetY));
    drag.center = { left, top };
    drag.element.style.left = `${left}px`;
    drag.element.style.top = `${top}px`;
    placeCommentEditPanel();
  }

  // Arrow keys move a focused saved pin 1 pixel (10 with Shift) in viewport
  // space; the location is saved once the keys rest or the pin loses focus.
  function handleSavedPinKeyDown(
    comment: { id: string },
    event: DomKeyboardEvent<HTMLButtonElement>,
  ) {
    // A key on the pin: a click held back from an earlier drag no longer comes.
    suppressPinClickRef.current = null;
    const active = pinDragRef.current;
    const step = event.shiftKey ? 10 : 1;
    const delta =
      event.key === "ArrowLeft"
        ? { x: -step, y: 0 }
        : event.key === "ArrowRight"
          ? { x: step, y: 0 }
          : event.key === "ArrowUp"
            ? { x: 0, y: -step }
            : event.key === "ArrowDown"
              ? { x: 0, y: step }
              : null;
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    if (isCapturing || isComposerOpen || pendingLocations[comment.id]) return;
    let drag = active;
    if (!drag?.keyboard || drag.commentId !== comment.id) {
      // A pointer drag of any pin is in progress.
      if (drag) return;
      const element = event.currentTarget;
      const rect = element.getBoundingClientRect();
      const target = commentsController.resolveTarget(options?.captureSelector);
      drag = {
        bounds: target
          ? getPinDragBounds(target)
          : { height: window.innerHeight, left: 0, top: 0, width: window.innerWidth },
        center: { left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 },
        commentId: comment.id,
        dragging: true,
        element,
        keyboard: true,
        offsetX: 0,
        offsetY: 0,
        originLeft: element.style.left,
        originTop: element.style.top,
        pointerId: -1,
        startX: 0,
        startY: 0,
      };
      // Leaving the pin saves the pending move at once. A plain listener, not a
      // rendered prop, so no render runs inside the blur and pulls focus back.
      drag.onBlur = () => commitSavedPinKeyboardMove(comment.id);
      element.addEventListener("blur", drag.onBlur);
      listenForMoveEscape(drag);
      pinDragRef.current = drag;
      setDraggingPinId(comment.id);
      setPinNotice(null);
    }
    const { bounds } = drag;
    const left = Math.min(bounds.left + bounds.width, Math.max(bounds.left, drag.center.left + delta.x));
    const top = Math.min(bounds.top + bounds.height, Math.max(bounds.top, drag.center.top + delta.y));
    drag.center = { left, top };
    drag.element.style.left = `${left}px`;
    drag.element.style.top = `${top}px`;
    placeCommentEditPanel();
    window.clearTimeout(drag.keyboardTimer);
    drag.keyboardTimer = window.setTimeout(
      () => commitSavedPinKeyboardMove(comment.id),
      savedPinKeyboardSaveDelayMs,
    );
  }

  function commitSavedPinKeyboardMove(commentId: string) {
    const drag = pinDragRef.current;
    if (!drag?.keyboard || drag.commentId !== commentId) return;
    endSavedPinDrag();
    setDraggingPinId(null);
    void relocateSavedComment(commentId, drag);
  }

  function handleSavedPinPointerUp(
    comment: (typeof storyComments)[number],
    event: DomPointerEvent<HTMLButtonElement>,
  ) {
    const drag = pinDragRef.current;
    if (!drag || drag.commentId !== comment.id || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    endSavedPinDrag();
    if (!drag.dragging) return;
    suppressPinClickRef.current = comment.id;
    setDraggingPinId(null);
    void relocateSavedComment(comment.id, drag);
  }

  // Resolves where a moved pin landed, in the order comments are placed, and
  // saves it: an anchor, or a ratio pin for a comment that never had an anchor.
  async function relocateSavedComment(commentId: string, drag: SavedPinDrag) {
    const comment = overview?.comments.find((entry) => entry.id === commentId);
    const path = commentPath(commentId);
    const target = commentsController.resolveTarget(options?.captureSelector);
    if (!comment || !path || !target) {
      restoreSavedPinElement(drag);
      return;
    }
    const { left, top } = drag.center;
    const anchor = resolveCommentAnchor(target, left, top);
    let location: { anchor: VisualCommentAnchor } | { pin: VisualCommentPin };
    if (anchor) {
      location = { anchor };
    } else if (!comment.anchor) {
      location = { pin: getVisualCommentPin(target.getBoundingClientRect(), left, top) };
    } else {
      restoreSavedPinElement(drag);
      setPinNotice({ text: labels.pinDropUnavailable, tone: "error" });
      return;
    }
    const previousPin = comment.pin ?? comment.preview?.pin;
    const previous: SavedPinLocation | null = previousPin
      ? { anchor: comment.anchor ?? null, movedAt: comment.movedAt ?? null, pin: previousPin }
      : null;
    setPendingLocations((current) => ({ ...current, [commentId]: location }));
    try {
      preserveOpenPanelDuringMutation();
      const payload = await commentsController.patch(path, location);
      setReportPending(Boolean(payload.reportStale));
      await refresh();
      if (previous) showMovedNotice(commentId, previous);
    } catch (error) {
      restoreSavedPinElement(drag);
      setPinNotice({
        text: `${labels.pinMoveFailed} ${error instanceof Error ? error.message : ""}`.trim(),
        tone: "error",
      });
    } finally {
      setPendingLocations((current) => {
        const { [commentId]: _settled, ...rest } = current;
        return rest;
      });
    }
  }

  // Only the latest saved move can be undone, for savedPinUndoWindowMs.
  function showMovedNotice(commentId: string, previous: SavedPinLocation) {
    window.clearTimeout(pinNoticeTimerRef.current);
    const notice = { text: labels.commentMoved, tone: "info" as const, undo: { commentId, previous } };
    setPinNotice(notice);
    pinNoticeTimerRef.current = window.setTimeout(() => {
      setPinNotice((current) => (current === notice ? null : current));
    }, savedPinUndoWindowMs);
  }

  async function undoSavedPinMove(commentId: string, previous: SavedPinLocation) {
    window.clearTimeout(pinNoticeTimerRef.current);
    setPinNotice(null);
    const path = commentPath(commentId);
    if (!path) return;
    try {
      preserveOpenPanelDuringMutation();
      const payload = await commentsController.patch(path, previous);
      setReportPending(Boolean(payload.reportStale));
      await refresh();
    } catch (error) {
      setPinNotice({
        text: `${labels.pinMoveFailed} ${error instanceof Error ? error.message : ""}`.trim(),
        tone: "error",
      });
    }
  }

  function openDeleteDialog(commentId: string, trigger: HTMLButtonElement) {
    deleteTriggerRef.current = trigger;
    setPendingDeleteCommentId(commentId);
    setCommentErrors((current) => ({ ...current, [commentId]: "" }));
  }

  function closeDeleteDialog(restoreFocus = true) {
    const returnTarget = deleteTriggerRef.current;
    setPendingDeleteCommentId(null);
    deleteTriggerRef.current = null;
    if (restoreFocus && returnTarget) {
      window.requestAnimationFrame(() => returnTarget.focus());
    }
  }

  async function confirmDeleteComment() {
    const path = pendingDeleteCommentId ? commentPath(pendingDeleteCommentId) : null;
    if (!pendingDeleteCommentId || !path) return;
    const commentId = pendingDeleteCommentId;
    setCommentMutationId(commentId);
    setCommentErrors((current) => ({ ...current, [commentId]: "" }));
    try {
      preserveOpenPanelDuringMutation();
      const payload = await commentsController.delete(path);
      setReportPending(Boolean(payload.reportStale));
      closeDeleteDialog(false);
      cancelCommentEdit(commentId);
      await refresh();
    } catch (error) {
      closeDeleteDialog();
      setCommentErrors((current) => ({
        ...current,
        [commentId]:
          error instanceof Error ? error.message : "Unable to delete comment.",
      }));
    } finally {
      setCommentMutationId(null);
    }
  }

  const displayName = authorName.trim() || labels.anonymousAuthor;
  // A pin is a ratio of the capture target, so it is only meaningful while the
  // prototype shows the route and state the comment was captured in.
  const matchesPrototypeState = (comment: (typeof storyComments)[number]) =>
    (comment.state?.routeId === undefined ||
      comment.state.routeId === prototypeState.routeId) &&
    (comment.state?.stateId === undefined ||
      comment.state.stateId === prototypeState.stateId);
  const savedPins =
    isPanelActive &&
    showSavedPins &&
    captureTargetRect &&
    !hostDeclarations.commentsUnavailable &&
    // Another view's comments are listed without pins: their pins belong there.
    isListingCurrentView
      ? listedComments.filter(
          (comment) =>
            (comment.pin ?? comment.preview?.pin) &&
            matchesPrototypeState(comment) &&
            // An anchored pin belongs to the view it was placed in.
            (!comment.anchor || resolveVisualCommentView(comment.view) === hostDeclarations.view),
        ).map((comment) =>
          pendingLocations[comment.id] ? { ...comment, ...pendingLocations[comment.id] } : comment,
        )
      : [];
  const pinTarget = savedPins.some((comment) => comment.anchor)
    ? commentsController.resolveTarget(options?.captureSelector)
    : null;
  const anchoredPlacements = new Map(
    savedPins
      .filter((comment) => comment.anchor)
      .map((comment) => [
        comment.id,
        pinTarget ? placeAnchoredPin(pinTarget, comment.anchor!) : null,
      ]),
  );
  anchoredPinsRef.current = new Map(
    savedPins
      .filter((comment) => comment.anchor)
      .map((comment) => [comment.id, comment.anchor!]),
  );
  // Listed anchored comments: whether their location is off screen in this
  // view (Show location) and whether a canvas comment's nearby frames moved.
  const listTarget = listedComments.some((comment) => comment.anchor)
    ? commentsController.resolveTarget(options?.captureSelector)
    : null;
  const anchorStatus = new Map(
    listedComments
      .filter((comment) => comment.anchor)
      .map((comment) => {
        const inCurrentView = resolveVisualCommentView(comment.view) === hostDeclarations.view;
        const placement =
          listTarget && inCurrentView ? placeAnchoredPin(listTarget, comment.anchor!) : null;
        return [
          comment.id,
          {
            hidden: inCurrentView && !placement,
            layoutChanged: listTarget ? hasCanvasLayoutChanged(listTarget, comment.anchor!) : false,
          },
        ];
      }),
  );
  // Tracking handoff follows the viewed meeting, active or closed.
  const openTrackingOnStory = viewedComments.filter(
    (comment) =>
      resolveVisualCommentKind(comment.kind) === "tracking" && !comment.resolvedAt,
  ).length;
  const hasTrackingComments = (viewedMeeting?.tracking.total ?? 0) > 0;
  const otherStoriesHaveOpenTracking =
    (viewedMeeting?.tracking.open ?? 0) > openTrackingOnStory;
  const saveShortcutHint = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘↵" : "Ctrl ↵";
  // No card while a new comment is being placed: the pins are passive then.
  // The comment being edited in its panel shows no card: the panel has it all.
  const editingInPanelId =
    editingCommentId && commentEditSurface === "panel" ? editingCommentId : null;
  const pinCardComment =
    isCapturing || isComposerOpen || draggingPinId
      ? null
      : (savedPins.find((comment) => comment.id === hoveredPinId && comment.id !== editingInPanelId) ??
        savedPins.find((comment) => comment.id === focusedPinId && comment.id !== editingInPanelId) ??
        null);
  // A pin being moved is drawn where the move took it: the render after the
  // first arrow press, or an overview refresh during a drag, writes the
  // rendered style back and would otherwise put it back.
  const movingPinCenter = (commentId: string) => {
    const drag = pinDragRef.current;
    return drag?.dragging && drag.commentId === commentId ? drag.center : null;
  };
  const savedPinCenter = (comment: (typeof savedPins)[number]) => {
    const moving = movingPinCenter(comment.id);
    if (moving) return moving;
    if (comment.anchor) {
      return anchoredPlacements.get(comment.id) ?? { left: -9999, top: -9999 };
    }
    const pin = (comment.pin ?? comment.preview?.pin)!;
    return {
      left: captureTargetRect!.left + captureTargetRect!.width * pin.xRatio,
      top: captureTargetRect!.top + captureTargetRect!.height * pin.yRatio,
    };
  };
  const pinCardPlacement = pinCardComment
    ? getSavedPinCardPlacement(savedPinCenter(pinCardComment), viewportSize, pinCardHeight)
    : null;
  const composerPlacement = isComposerOpen
    ? getCommentComposerPlacement(livePinPosition, viewportSize, composerHeight)
    : null;

  return h(
    Fragment,
    null,
    h(
    "aside",
    {
      "aria-label": labels.visualComments,
      className: "sbfx-review sbfx-comments-panel",
      "data-expanded": isPanelOpen ? "true" : "false",
      "data-sbfx-capture-ignore": "true",
      "data-version": getAddonVersion(),
    },
    h(
      "header",
      { className: "sbfx-comments-panel__header" },
      h(
        "div",
        {
          className: "sbfx-comments-panel__header-copy",
          hidden: !isPanelOpen,
        },
        h(
          "h2",
          { className: "sbfx-comments-panel__heading" },
          labels.commentsHeading,
        ),
        overview?.activeSession
          ? h(
              "p",
              {
                className: "sbfx-comments-panel__meeting-title",
                "data-meeting-title": "true",
              },
              overview.activeSession.title,
            )
          : null,
      ),
      h(
        "div",
        { className: "sbfx-comments-panel__header-actions" },
        overview?.reportUrl
          ? h(
              "a",
              {
                className:
                  "sbfx-review__button sbfx-review__button--secondary sbfx-review__report-link sbfx-comments-panel__reports",
                hidden: !isPanelOpen,
                href: overview.reportUrl,
                key: "reports",
                rel: "noreferrer",
                target: "_blank",
              },
              "Reports",
            )
          : null,
        h(
          "button",
          {
            "aria-controls": detailId,
            "aria-expanded": isPanelOpen,
            "aria-label": isPanelOpen ? labels.closeVisualComments : labels.openVisualComments,
            className: "sbfx-review__icon-button sbfx-comments-panel__toggle",
            key: "toggle",
            onClick: togglePanel,
            title: isPanelOpen ? labels.closeVisualComments : labels.openVisualComments,
            type: "button",
          },
          h(CommentIcon, { size: 14 }),
        ),
      ),
    ),
    h(
      "section",
    {
      className: "sbfx-review__visual-comments sbfx-comments-panel__detail",
      "data-comments-capability": commentsCapability,
      hidden: !isPanelOpen,
      id: detailId,
    },
    hostDeclarations.commentsUnavailable
      ? h(
          "p",
          {
            className: "sbfx-comments-panel__unavailable",
            "data-comments-unavailable": "true",
            role: "status",
          },
          labels.commentsUnavailable,
        )
      : h(
          "button",
          {
            "aria-label": labels.addVisualComment,
            className: "sbfx-review__button sbfx-comments-panel__add",
            "data-shortcut": shortcutsEnabled ? "C" : undefined,
            disabled:
              commentsCapability !== "available" || isBusy || isCapturing || isComposerOpen,
            onClick: () => armCapture(),
            type: "button",
          },
          labels.addVisualComment,
        ),
    h(
      "div",
      { className: "sbfx-comments-panel__toolbar" },
      h(
        "div",
        {
          "aria-label": labels.filterComments,
          className: "sbfx-comments-panel__filter",
          role: "group",
        },
        ...(["all", ...VISUAL_COMMENT_KINDS] as CommentFilter[]).map((filter) =>
          h(
            "button",
            {
              "aria-pressed": filter === commentFilter,
              className: "sbfx-comments-panel__filter-option",
              "data-comment-filter": filter,
              key: filter,
              onClick: () => {
                setCommentFilter(filter);
                forgetHoveredPin();
              },
              type: "button",
            },
            `${filter === "all" ? labels.filterAllComments : commentKindLabels[filter]} ${commentCounts[filter]}`,
          ),
        ),
      ),
      h(
        "button",
        {
          "aria-label": labels.showPins,
          "aria-pressed": showSavedPins,
          className: "sbfx-comments-panel__filter-option sbfx-comments-panel__pins-toggle",
          "data-show-pins": showSavedPins ? "true" : "false",
          onClick: () => {
            setShowSavedPins(!showSavedPins);
            forgetHoveredPin();
          },
          title: labels.showPins,
          type: "button",
        },
        labels.showPinsShort,
      ),
    ),
    otherViewCounts.length || !isListingCurrentView
      ? h(
          "div",
          {
            "aria-label": labels.commentViews,
            className: "sbfx-comments-panel__views",
            "data-listed-view": listedView,
            role: "group",
          },
          ...otherViewCounts.map(([view, count]) =>
            h(
              "button",
              {
                className: "sbfx-comments-panel__filter-option sbfx-comments-panel__view-option",
                "data-comment-view-option": view,
                key: view,
                onClick: () => {
                  setListedViewChoice(view === hostDeclarations.view ? null : view);
                  setSelectedCommentId(null);
                  setHighlightedCommentId(null);
                  forgetHoveredPin();
                },
                type: "button",
              },
              `${view} · ${count}`,
            ),
          ),
          isListingCurrentView
            ? null
            : h(
                "p",
                {
                  className: "sbfx-comments-panel__view-note",
                  "data-comment-view-note": listedView,
                  key: "view-note",
                },
                labels.otherViewPinsNote,
              ),
        )
      : null,
    // Outside the scrolling list, so a scrolled list never hides it.
    pinNotice
      ? h(
          "p",
          {
            className: "sbfx-comments-panel__pin-notice",
            "data-pin-notice": pinNotice.tone,
            key: "pin-notice",
            role: "status",
          },
          pinNotice.text,
          pinNotice.undo
            ? h(
                "button",
                {
                  className: "sbfx-comments-panel__text-button",
                  "data-pin-undo": pinNotice.undo.commentId,
                  key: "undo",
                  onClick: () => {
                    const { commentId, previous } = pinNotice.undo!;
                    void undoSavedPinMove(commentId, previous);
                  },
                  type: "button",
                },
                labels.undoMove,
              )
            : null,
        )
      : null,
    h(
      "div",
      { className: "sbfx-comments-panel__scroll" },
      viewedMeeting
        ? h(
            "p",
            {
              className: "sbfx-comments-panel__viewing",
              "data-viewed-meeting": viewedMeeting.id,
              key: "viewing",
            },
            `${labels.viewingMeeting} `,
            h("strong", null, viewedMeeting.title),
          )
        : null,
      !viewedMeeting
        ? h(
            "p",
            {
              className: "sbfx-comments-panel__empty",
              "data-comments-empty": "true",
              "data-comments-hint": storyComments.length ? "view" : "none",
              key: "hint",
            },
            storyComments.length ? labels.viewMeetingHint : labels.noComments,
          )
        : listedComments.length
        ? h(
            "div",
            {
              "aria-label": labels.commentsList,
              className: "sbfx-comments-panel__list",
              key: "list",
              role: "list",
            },
            ...listedComments.map((comment) => {
              const isCommentBusy = commentMutationId === comment.id;
              const kind = resolveVisualCommentKind(comment.kind);
              return h(
                "article",
                {
                  "aria-current": selectedCommentId === comment.id ? "true" : undefined,
                  className: "sbfx-comments-panel__comment",
                  "data-comment-id": comment.id,
                  key: comment.id,
                  onMouseEnter: () => setHighlightedCommentId(comment.id),
                  onMouseLeave: () =>
                    setHighlightedCommentId((current) =>
                      current === comment.id ? null : current,
                    ),
                  role: "listitem",
                  tabIndex: -1,
                },
                h(
                  "div",
                  { className: "sbfx-comments-panel__comment-meta" },
                  h(
                    "span",
                    { className: "sbfx-comments-panel__comment-ordinal" },
                    comment.ordinal,
                  ),
                  h(
                    "span",
                    {
                      className: `sbfx-comments-panel__comment-kind sbfx-comments-panel__comment-kind--${kind}`,
                      "data-comment-kind": kind,
                    },
                    commentKindLabels[kind],
                  ),
                  h(
                    "span",
                    {
                      className: `sbfx-comments-panel__comment-status${comment.resolvedAt ? " sbfx-comments-panel__comment-status--completed" : ""}`,
                    },
                    comment.resolvedAt ? "Completed" : "Open",
                  ),
                ),
                matchesPrototypeState(comment)
                  ? null
                  : h(
                      "p",
                      {
                        className: "sbfx-comments-panel__comment-note",
                        "data-comment-state-note": "true",
                        key: "state-note",
                      },
                      labels.capturedInAnotherState,
                    ),
                comment.anchor
                  ? h(
                      "p",
                      {
                        className: "sbfx-comments-panel__comment-anchor",
                        "data-comment-anchor": comment.anchor.type,
                        key: "anchor",
                      },
                      describeVisualCommentAnchor(comment.anchor),
                    )
                  : null,
                anchorStatus.get(comment.id)?.layoutChanged
                  ? h(
                      "p",
                      {
                        className: "sbfx-comments-panel__comment-note",
                        "data-comment-layout-changed": "true",
                        key: "layout-changed",
                      },
                      labels.layoutChanged,
                    )
                  : null,
                comment.movedAt
                  ? h(
                      "p",
                      {
                        className: "sbfx-comments-panel__comment-note",
                        "data-comment-moved": "true",
                        key: "moved",
                      },
                      labels.movedSinceScreenshot,
                    )
                  : null,
                anchorStatus.get(comment.id)?.hidden
                  ? h(
                      "button",
                      {
                        className: "sbfx-review__button sbfx-comments-panel__show-location",
                        "data-comment-show-location": comment.id,
                        key: "show-location",
                        onClick: () => showAnchoredLocation(comment),
                        type: "button",
                      },
                      labels.showLocation,
                    )
                  : null,
                locationNotices[comment.id]
                  ? h(
                      "p",
                      {
                        className: "sbfx-comments-panel__comment-note",
                        "data-comment-location-notice": "true",
                        key: "location-notice",
                        role: "status",
                      },
                      locationNotices[comment.id],
                    )
                  : null,
                h(
                  "p",
                  { className: "sbfx-comments-panel__comment-body", key: "body" },
                  comment.body,
                ),
                h(
                  "div",
                  { className: "sbfx-comments-panel__comment-footer" },
                  h(
                    "span",
                    { className: "sbfx-comments-panel__comment-byline" },
                    h("strong", null, comment.authorName),
                    " · ",
                    h(
                      "time",
                      {
                        dateTime: comment.createdAt,
                        title: new Date(comment.createdAt).toLocaleString(),
                      },
                      formatCommentTime(comment.createdAt),
                    ),
                  ),
                  h(
                    "div",
                    { className: "sbfx-comments-panel__comment-actions" },
                    h(
                      "button",
                      {
                        "aria-label": labels.editComment,
                        className:
                          "sbfx-review__icon-button sbfx-comments-panel__comment-action",
                        disabled: isCommentBusy,
                        onClick: (event: DomMouseEvent<HTMLButtonElement>) =>
                          beginCommentEdit(
                            comment.id,
                            comment.body,
                            isCommentPinEditable(comment) ? (comment.preview?.pin ?? null) : null,
                            kind,
                            event.currentTarget as HTMLButtonElement,
                          ),
                        title: labels.editComment,
                        type: "button",
                      },
                      h(EditIcon, { size: 14 }),
                    ),
                    h(
                      "button",
                      {
                        "aria-label": labels.deleteComment,
                        className:
                          "sbfx-review__icon-button sbfx-comments-panel__comment-action sbfx-comments-panel__comment-action--delete",
                        disabled: isCommentBusy,
                        onClick: (event: DomMouseEvent<HTMLButtonElement>) =>
                          openDeleteDialog(
                            comment.id,
                            event.currentTarget as HTMLButtonElement,
                          ),
                        title: labels.deleteComment,
                        type: "button",
                      },
                      h(TrashIcon, { size: 14 }),
                    ),
                  ),
                ),
              );
            }),
          )
        : h(
            "p",
            {
              className: "sbfx-comments-panel__empty",
              "data-comments-empty": "true",
              key: "empty",
            },
            viewedInListedView.length ? labels.noFilteredComments : labels.noComments,
          ),
      meetingRows.length
        ? h(
            "section",
            {
              "aria-label": labels.meetingsHeading,
              className: "sbfx-comments-panel__recent-meetings",
              key: "meetings",
            },
            h(
              "h3",
              { className: "sbfx-comments-panel__section-heading" },
              labels.meetingsHeading,
            ),
            ...meetingRows.map((meeting) => {
              const isViewed = viewedMeeting?.id === meeting.id;
              return h(
                "article",
                {
                  className: "sbfx-comments-panel__meeting-history",
                  "data-meeting-active": meeting.active ? "true" : undefined,
                  "data-meeting-id": meeting.id,
                  key: meeting.id,
                },
                h(
                  "div",
                  { className: "sbfx-comments-panel__meeting-copy" },
                  h(
                    "div",
                    { className: "sbfx-comments-panel__meeting-title-line" },
                    h("strong", { title: meeting.title }, meeting.title),
                    meeting.active
                      ? h(
                          "span",
                          { className: "sbfx-comments-panel__meeting-active", key: "active" },
                          labels.activeMeeting,
                        )
                      : null,
                  ),
                  h(
                    "div",
                    { className: "sbfx-comments-panel__meeting-meta" },
                    h(
                      "span",
                      { className: "sbfx-review__meta" },
                      `${meeting.commentCount} comment${meeting.commentCount === 1 ? "" : "s"}`,
                    ),
                    h(
                      "a",
                      {
                        className: "sbfx-comments-panel__text-button",
                        href: meeting.reportUrl,
                        rel: "noreferrer",
                        target: "_blank",
                      },
                      "Open report",
                    ),
                  ),
                ),
                meeting.storyCommentCount > 0
                  ? h(
                      "button",
                      {
                        "aria-checked": isViewed ? "true" : "false",
                        "aria-label": `${labels.viewMeeting} ${meeting.storyCommentCount} · ${meeting.title}`,
                        className:
                          "sbfx-comments-panel__filter-option sbfx-comments-panel__meeting-view",
                        "data-meeting-view": meeting.id,
                        key: "view",
                        onClick: () => toggleMeetingView(meeting.id),
                        role: "switch",
                        type: "button",
                      },
                      `${labels.viewMeeting} ${meeting.storyCommentCount}`,
                    )
                  : null,
              );
            }),
          )
        : null,
    ),
    h(
      "footer",
      { className: "sbfx-comments-panel__footer" },
      viewedMeeting && hasTrackingComments
        ? h(
            "div",
            { className: "sbfx-comments-panel__handoff", key: "handoff" },
            h(
              "button",
              {
                className: "sbfx-review__button sbfx-review__button--secondary",
                "data-panel-tracking-copy": "story",
                disabled: isCopyingTracking,
                onClick: () => void copyTrackingPrompts("story"),
                type: "button",
              },
              labels.copyTrackingPrompts,
            ),
            otherStoriesHaveOpenTracking
              ? h(
                  "button",
                  {
                    className: "sbfx-comments-panel__text-button",
                    "data-panel-tracking-copy": "all",
                    disabled: isCopyingTracking,
                    key: "all",
                    onClick: () => void copyTrackingPrompts("all"),
                    type: "button",
                  },
                  labels.copyAllStories,
                )
              : null,
            h(
              "p",
              {
                "aria-live": "polite",
                className: "sbfx-comments-panel__handoff-status",
                "data-panel-tracking-status": "true",
                hidden: !trackingCopyStatus,
                key: "status",
              },
              trackingCopyStatus,
            ),
          )
        : null,
      isNameEditing
        ? h(
            "div",
            {
              className: "sbfx-comments-panel__identity",
              "data-commenting-as": "editing",
              key: "identity-edit",
            },
            h("input", {
              "aria-label": labels.authorName,
              maxLength: VISUAL_COMMENT_LIMITS.maxAuthorLength,
              onChange: (event: DomInputEvent<HTMLInputElement>) =>
                setNameDraft((event.currentTarget as HTMLInputElement).value),
              onKeyDown: (event: DomKeyboardEvent<HTMLInputElement>) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveAuthorName();
                }
              },
              ref: nameInputRef,
              value: nameDraft,
            }),
            h(
              "button",
              {
                className: "sbfx-comments-panel__text-button",
                onClick: () => saveAuthorName(),
                type: "button",
              },
              labels.saveAuthorName,
            ),
          )
        : h(
            "p",
            {
              className: "sbfx-comments-panel__identity",
              "data-commenting-as": displayName,
              key: "identity",
            },
            `${labels.commentingAs} `,
            h("strong", null, displayName),
            h(
              "button",
              {
                className: "sbfx-comments-panel__text-button",
                onClick: () => {
                  setNameDraft(authorName);
                  setIsNameEditing(true);
                },
                type: "button",
              },
              labels.changeAuthorName,
            ),
          ),
      overview?.activeSession
        ? h(
            "button",
            {
              className: "sbfx-comments-panel__text-button",
              disabled: commentsCapability !== "available" || isBusy,
              key: "end-meeting",
              onClick: () => {
                preserveOpenPanelDuringMutation();
                void mutate(
                  `/sessions/${encodeURIComponent(overview.activeSession!.id)}/close`,
                ).catch((error: unknown) =>
                  setVisualError(
                    error instanceof Error ? error.message : "Unable to end meeting.",
                  ),
                );
              },
              type: "button",
            },
            labels.endMeeting,
          )
        : isNamedMeetingOpen
          ? h(
              "div",
              { className: "sbfx-review__meeting-start", key: "meeting-start" },
              h("input", {
                "aria-label": "Meeting title",
                maxLength: VISUAL_COMMENT_LIMITS.maxTitleLength,
                onChange: (event: DomInputEvent<HTMLInputElement>) =>
                  setMeetingTitle((event.currentTarget as HTMLInputElement).value),
                ref: meetingTitleInputRef,
                value: meetingTitle,
              }),
              h(
                "button",
                {
                  className: "sbfx-review__button sbfx-review__button--secondary",
                  disabled:
                    commentsCapability !== "available" || isBusy || !meetingTitle.trim(),
                  onClick: () => {
                    preserveOpenPanelDuringMutation();
                    void mutate("/sessions", { title: meetingTitle })
                      .then(() => setIsNamedMeetingOpen(false))
                      .catch((error: unknown) => {
                        setVisualError(
                          error instanceof Error ? error.message : "Unable to start meeting.",
                        );
                        void refresh().catch(() => undefined);
                      });
                  },
                  type: "button",
                },
                labels.startMeeting,
              ),
            )
          : h(
              "button",
              {
                className: "sbfx-comments-panel__text-button",
                key: "named-meeting",
                onClick: () => setIsNamedMeetingOpen(true),
                type: "button",
              },
              labels.startNamedMeeting,
            ),
    ),
    reportPending
      ? h("p", { className: "sbfx-review__error" }, "Comment saved; report rebuild pending.")
      : null,
    commentsCapabilityError
      ? h("p", { className: "sbfx-review__error" }, commentsCapabilityError)
      : null,
    ),
    editingComment && commentEditSurface === "panel"
      ? createPortal(
          h(
            "div",
            {
              "aria-label": `${labels.editComment} ${editingComment.ordinal}`,
              className: "sbfx-comment-composer sbfx-review__composer sbfx-comments-panel__edit-panel",
              "data-comment-edit-panel": editingComment.id,
              "data-sbfx-capture-ignore": "true",
              key: `edit-panel-${editingComment.id}`,
              ref: commentEditPanelRef,
              role: "dialog",
              style: (() => {
                const pin = savedPins.find((comment) => comment.id === editingComment.id);
                const placement = getCommentComposerPlacement(
                  pin ? savedPinCenter(pin) : null,
                  viewportSize,
                  commentEditPanelHeight,
                );
                return "dock" in placement
                  ? {}
                  : { left: `${placement.left}px`, top: `${placement.top}px` };
              })(),
            },
            // The screenshot taken with the comment, its point marked by the
            // ordinal; the comment itself moves by dragging its pin.
            editingComment.preview && !commentPreviewErrors[editingComment.id]
              ? h(
                  "div",
                  {
                    className: "sbfx-comments-panel__edit-panel-preview",
                    "data-comment-edit-panel-preview": "true",
                    key: "preview",
                    style: (() => {
                      const size = editPanelPreviewSize(
                        editingComment.preview.width,
                        editingComment.preview.height,
                      );
                      return { blockSize: `${size.height}px`, inlineSize: `${size.width}px` };
                    })(),
                  },
                  h("img", {
                    alt: `Screenshot for comment ${editingComment.ordinal}`,
                    onError: () =>
                      setCommentPreviewErrors((current) => ({ ...current, [editingComment.id]: true })),
                    src: editingComment.preview.imageUrl,
                  }),
                  h(
                    "span",
                    {
                      "aria-hidden": "true",
                      className: "sbfx-review__pin sbfx-comments-panel__edit-panel-pin",
                      "data-comment-edit-panel-pin": "true",
                      style: {
                        left: `${editingComment.preview.pin.xRatio * 100}%`,
                        top: `${editingComment.preview.pin.yRatio * 100}%`,
                      },
                    },
                    editingComment.ordinal,
                  ),
                )
              : h(
                  "p",
                  {
                    className: "sbfx-review__pin-card-unavailable",
                    "data-comment-edit-panel-screenshot-unavailable": "true",
                    key: "preview-unavailable",
                  },
                  labels.screenshotUnavailable,
                ),
            editingComment.movedAt
              ? h(
                  "p",
                  {
                    className: "sbfx-comments-panel__comment-note",
                    "data-comment-edit-panel-moved": "true",
                    key: "moved",
                  },
                  labels.movedSinceScreenshot,
                )
              : null,
            renderCommentKindControl(
              editingCommentKind,
              (kind) => {
                setCommentKindDrafts((current) => ({ ...current, [editingComment.id]: kind }));
                setCommentErrors((current) => ({ ...current, [editingComment.id]: "" }));
              },
              "data-comment-edit-kind",
              false,
            ),
            h("textarea", {
              "aria-label": labels.commentBody,
              className: "sbfx-comment-composer__body",
              maxLength: VISUAL_COMMENT_LIMITS.maxBodyLength,
              onChange: (event: DomInputEvent<HTMLTextAreaElement>) => {
                const value = (event.currentTarget as HTMLTextAreaElement).value;
                setCommentDrafts((current) => ({ ...current, [editingComment.id]: value }));
                setCommentErrors((current) => ({ ...current, [editingComment.id]: "" }));
              },
              ref: commentEditTextareaRef,
              rows: 3,
              value: editingCommentDraft,
            }),
            commentErrors[editingComment.id]
              ? h(
                  "p",
                  { "aria-live": "polite", className: "sbfx-review__error", key: "error" },
                  commentErrors[editingComment.id],
                )
              : null,
            h(
              "div",
              { className: "sbfx-comment-composer__actions", key: "actions" },
              h(
                "button",
                {
                  className: "sbfx-review__button sbfx-review__button--secondary",
                  "data-comment-edit-cancel": "true",
                  disabled: commentMutationId === editingComment.id,
                  onClick: () => cancelCommentEdit(editingComment.id),
                  type: "button",
                },
                labels.cancelCommentEdit,
              ),
              h(
                "button",
                {
                  className: "sbfx-review__button",
                  "data-comment-edit-save": "true",
                  disabled: commentMutationId === editingComment.id || !editingCommentDraftIsValid,
                  onClick: () => void saveCommentEdit(editingComment.id),
                  type: "button",
                },
                labels.saveCommentChanges,
              ),
            ),
          ),
          document.body,
        )
      : null,
    editingComment && commentEditSurface === "modal"
      ? createPortal(h(
          "div",
          {
            className: "sbfx-comments-panel__edit-backdrop",
            "data-comment-edit-modal": "true",
            "data-sbfx-capture-ignore": "true",
            onClick: (event: DomMouseEvent<HTMLDivElement>) => {
              if (event.target === event.currentTarget) {
                cancelCommentEdit(editingComment.id);
              }
            },
          },
          h(
            "div",
            {
              "aria-labelledby": commentEditTitleId,
              "aria-modal": "true",
              className: "sbfx-comments-panel__edit-modal",
              role: "dialog",
            },
            h(
              "h2",
              {
                className: "sbfx-comments-panel__edit-heading",
                id: commentEditTitleId,
              },
              `${labels.editComment} ${editingComment.ordinal}`,
            ),
            editingCommentHasPreview && editingComment.preview && editingCommentPin
              ? h(
                  "div",
                  {
                    className:
                      "sbfx-review__snapshot-preview sbfx-comments-panel__edit-preview",
                    "data-comment-evidence-preview": "true",
                    "data-comment-edit-preview": "true",
                    onPointerCancel: (event: DomPointerEvent<HTMLElement>) =>
                      handleCommentPreviewPointerEnd(editingComment.id, event),
                    onPointerDown: (event: DomPointerEvent<HTMLElement>) =>
                      handleCommentPreviewPointerDown(editingComment.id, event),
                    onPointerMove: (event: DomPointerEvent<HTMLElement>) =>
                      handleCommentPreviewPointerMove(editingComment.id, event),
                    onPointerUp: (event: DomPointerEvent<HTMLElement>) =>
                      handleCommentPreviewPointerEnd(editingComment.id, event),
                    style: {
                      aspectRatio: `${editingComment.preview.width}/${editingComment.preview.height}`,
                    },
                  },
                  h("img", {
                    alt: `Screenshot evidence for comment ${editingComment.ordinal}`,
                    ref: commentEditImageRef,
                    onError: () => {
                      setCommentPreviewErrors((current) => ({
                        ...current,
                        [editingComment.id]: true,
                      }));
                      setCommentPinDrafts((current) => {
                        const next = { ...current };
                        delete next[editingComment.id];
                        return next;
                      });
                      window.requestAnimationFrame(() =>
                        commentEditTextareaRef.current?.focus(),
                      );
                    },
                    src: editingComment.preview.imageUrl,
                  }),
                  h(
                    "button",
                    {
                      "aria-describedby": `${commentEditTitleId}-point-hint`,
                      "aria-label": `${labels.adjustCommentPoint} ${editingComment.ordinal}`,
                      className: "sbfx-review__pin sbfx-review__pin--editable",
                      "data-comment-edit-pin": "true",
                      onKeyDown: (event: DomKeyboardEvent<HTMLElement>) =>
                        handleCommentPinKeyDown(editingComment.id, event),
                      ref: commentEditPinRef,
                      style: {
                        left: `${editingCommentPin.xRatio * 100}%`,
                        top: `${editingCommentPin.yRatio * 100}%`,
                      },
                      type: "button",
                    },
                    editingComment.ordinal,
                  ),
                )
              : editingCommentScreenshot
                ? h(
                    "div",
                    {
                      className:
                        "sbfx-review__snapshot-preview sbfx-comments-panel__edit-preview",
                      "data-comment-evidence-preview": "true",
                      "data-comment-edit-fixed-preview": "true",
                      style: {
                        aspectRatio: `${editingCommentScreenshot.width}/${editingCommentScreenshot.height}`,
                      },
                    },
                    h("img", {
                      alt: `Screenshot evidence for comment ${editingComment.ordinal}`,
                      onError: () =>
                        setCommentPreviewErrors((current) => ({
                          ...current,
                          [editingComment.id]: true,
                        })),
                      src: editingCommentScreenshot.imageUrl,
                    }),
                    // Where the comment was made; the comment moves with its pin.
                    h(
                      "span",
                      {
                        "aria-hidden": "true",
                        className: "sbfx-review__pin",
                        "data-comment-edit-fixed-pin": "true",
                        style: {
                          left: `${editingCommentScreenshot.pin.xRatio * 100}%`,
                          top: `${editingCommentScreenshot.pin.yRatio * 100}%`,
                        },
                      },
                      editingComment.ordinal,
                    ),
                  )
                : h(
                    "p",
                    {
                      className: "sbfx-review__evidence-unavailable",
                      "data-comment-evidence-unavailable": "true",
                    },
                    labels.evidenceUnavailable,
                  ),
            editingComment.movedAt
              ? h(
                  "p",
                  {
                    className: "sbfx-comments-panel__comment-note",
                    "data-comment-edit-moved": "true",
                  },
                  labels.movedSinceScreenshot,
                )
              : null,
            editingCommentHasPreview
              ? h(
                  "p",
                  {
                    className: "sbfx-review__meta sbfx-review__point-hint",
                    id: `${commentEditTitleId}-point-hint`,
                  },
                  labels.adjustCommentPointHint,
                )
              : null,
            renderCommentKindControl(
              editingCommentKind,
              (kind) => {
                setCommentKindDrafts((current) => ({
                  ...current,
                  [editingComment.id]: kind,
                }));
                setCommentErrors((current) => ({
                  ...current,
                  [editingComment.id]: "",
                }));
              },
              "data-comment-edit-kind",
            ),
            h(
              "label",
              { className: "sbfx-review__field" },
              h("span", null, labels.commentBody),
              h("textarea", {
                maxLength: VISUAL_COMMENT_LIMITS.maxBodyLength,
                onChange: (event: DomInputEvent<HTMLTextAreaElement>) => {
                  const value = (event.currentTarget as HTMLTextAreaElement).value;
                  setCommentDrafts((current) => ({
                    ...current,
                    [editingComment.id]: value,
                  }));
                  setCommentErrors((current) => ({
                    ...current,
                    [editingComment.id]: "",
                  }));
                },
                ref: commentEditTextareaRef,
                rows: 3,
                value: editingCommentDraft,
              }),
            ),
            commentErrors[editingComment.id]
              ? h(
                  "p",
                  {
                    "aria-live": "polite",
                    className: "sbfx-review__error",
                  },
                  commentErrors[editingComment.id],
                )
              : null,
            h(
              "div",
              { className: "sbfx-comments-panel__edit-actions" },
              h(
                "button",
                {
                  className: "sbfx-review__button",
                  "data-comment-edit-save": "true",
                  disabled:
                    commentMutationId === editingComment.id ||
                    !editingCommentDraftIsValid,
                  onClick: () => void saveCommentEdit(editingComment.id),
                  type: "button",
                },
                labels.saveCommentChanges,
              ),
              h(
                "button",
                {
                  className: "sbfx-review__button sbfx-review__button--secondary",
                  "data-comment-edit-cancel": "true",
                  disabled: commentMutationId === editingComment.id,
                  onClick: () => cancelCommentEdit(editingComment.id),
                  type: "button",
                },
                labels.cancelCommentEdit,
              ),
            ),
          ),
        ), document.body)
      : null,
    pendingDeleteCommentId
      ? h(
          "div",
          {
            "aria-describedby": deleteDialogDescriptionId,
            "aria-labelledby": deleteDialogTitleId,
            "aria-modal": "true",
            className: "sbfx-comments-panel__dialog-backdrop",
            onClick: (event: DomMouseEvent<HTMLDivElement>) => {
              if (event.target === event.currentTarget) closeDeleteDialog();
            },
            role: "dialog",
          },
          h(
            "div",
            { className: "sbfx-comments-panel__dialog" },
            h("h2", { id: deleteDialogTitleId }, labels.deleteCommentTitle),
            h(
              "p",
              { id: deleteDialogDescriptionId },
              labels.deleteCommentDescription,
            ),
            h(
              "div",
              { className: "sbfx-comments-panel__dialog-actions" },
              h(
                "button",
                {
                  className: "sbfx-review__button sbfx-review__button--secondary",
                  "data-comment-delete-cancel": "true",
                  onClick: () => closeDeleteDialog(),
                  ref: deleteCancelRef,
                  type: "button",
                },
                labels.cancelDelete,
              ),
              h(
                "button",
                {
                  className:
                    "sbfx-review__button sbfx-comments-panel__delete-confirm",
                  "data-comment-delete-confirm": "true",
                  disabled: commentMutationId === pendingDeleteCommentId,
                  onClick: () => void confirmDeleteComment(),
                  type: "button",
                },
                labels.confirmDelete,
              ),
            ),
          ),
        )
      : null,
    ),
    isCapturing && !isComposerOpen
      ? createPortal(
          h(
            "div",
            {
              className: "sbfx-comment-prompt",
              "data-capture-prompt": "true",
              "data-sbfx-capture-ignore": "true",
              role: "status",
            },
            h("span", null, labels.capturePrompt),
            h("kbd", { "aria-hidden": "true", className: "sbfx-review__kbd" }, "Esc"),
            h(
              "button",
              {
                className: "sbfx-review__button sbfx-review__button--secondary",
                onClick: () => cancelCapture(),
                type: "button",
              },
              labels.cancelCapture,
            ),
          ),
          document.body,
        )
      : null,
    visualError && !isComposerOpen
      ? createPortal(
          h(
            "div",
            {
              className: "sbfx-comment-toast",
              "data-comment-error": "true",
              "data-sbfx-capture-ignore": "true",
              role: "alert",
            },
            h("p", { className: "sbfx-review__error" }, visualError),
            h(
              "button",
              {
                className: "sbfx-comments-panel__text-button",
                onClick: () => setVisualError(""),
                type: "button",
              },
              labels.dismissError,
            ),
          ),
          document.body,
        )
      : null,
    composerPlacement
      ? createPortal(
          h(
            "div",
            {
              "aria-label": labels.commentComposer,
              className: "sbfx-comment-composer sbfx-review__composer",
              "data-comment-composer": "true",
              "data-composer-dock": "dock" in composerPlacement
                ? composerPlacement.dock
                : undefined,
              "data-sbfx-capture-ignore": "true",
              ref: composerRef,
              role: "dialog",
              style:
                "dock" in composerPlacement
                  ? {}
                  : {
                      left: `${composerPlacement.left}px`,
                      top: `${composerPlacement.top}px`,
                    },
            },
            renderCommentKindControl(
              commentKind,
              setCommentKind,
              "data-comment-kind-select",
              false,
            ),
            h("textarea", {
              "aria-label": labels.commentBody,
              className: "sbfx-comment-composer__body",
              maxLength: VISUAL_COMMENT_LIMITS.maxBodyLength,
              onChange: (event: DomInputEvent<HTMLTextAreaElement>) =>
                setCommentBody((event.currentTarget as HTMLTextAreaElement).value),
              placeholder:
                commentKind === "tracking"
                  ? labels.commentPlaceholderTracking
                  : labels.commentPlaceholderVisualFix,
              ref: composerBodyRef,
              rows: 3,
              value: commentBody,
            }),
            h(
              "p",
              { className: "sbfx-comment-composer__hint", id: `${detailId}-point-hint` },
              labels.adjustPendingPinHint,
            ),
            visualError
              ? h(
                  "p",
                  { "aria-live": "polite", className: "sbfx-review__error", key: "error" },
                  visualError,
                )
              : null,
            h(
              "div",
              { className: "sbfx-comment-composer__actions", key: "actions" },
              h(
                "button",
                {
                  className: "sbfx-review__button sbfx-review__button--secondary",
                  "data-comment-composer-cancel": "true",
                  onClick: () => cancelCapture(),
                  type: "button",
                },
                labels.cancelCommentEdit,
              ),
              h(
                "button",
                {
                  "aria-label": labels.submitComment,
                  className: "sbfx-review__button",
                  "data-shortcut": shortcutsEnabled ? saveShortcutHint : undefined,
                  disabled: !canSubmitComment,
                  onClick: () => void submitComment(),
                  type: "button",
                },
                labels.submitComment,
              ),
            ),
          ),
          document.body,
        )
      : null,
    livePinPosition
      ? isComposerOpen
        ? h(
            "button",
            {
              "aria-describedby": `${detailId}-point-hint`,
              "aria-label": `${labels.adjustCommentPoint} ${nextOrdinal}`,
              className:
                "sbfx-review__pin sbfx-review__pin--editable sbfx-review__live-pin",
              "data-pending-comment-pin": "true",
              "data-sbfx-capture-ignore": "true",
              "data-sbfx-live-comment-pin": "true",
              onClick: (event: DomMouseEvent<HTMLButtonElement>) =>
                event.stopPropagation(),
              onKeyDown: handlePendingPinKeyDown,
              onPointerCancel: handlePendingPinPointerEnd,
              onPointerDown: handlePendingPinPointerDown,
              onPointerMove: handlePendingPinPointerMove,
              onPointerUp: handlePendingPinPointerEnd,
              style: {
                left: `${livePinPosition.left}px`,
                top: `${livePinPosition.top}px`,
              },
              type: "button",
            },
            nextOrdinal,
          )
        : h(
            "span",
            {
              "aria-hidden": "true",
              className: "sbfx-review__pin sbfx-review__live-pin",
              "data-sbfx-capture-ignore": "true",
              "data-sbfx-live-comment-pin": "true",
              style: {
                left: `${livePinPosition.left}px`,
                top: `${livePinPosition.top}px`,
              },
            },
            nextOrdinal,
          )
      : null,
    ...savedPins.map((comment) => {
      const kind = resolveVisualCommentKind(comment.kind);
      const pin = (comment.pin ?? comment.preview?.pin)!;
      const anchoredPlacement = comment.anchor ? anchoredPlacements.get(comment.id) ?? null : undefined;
      const movingCenter = movingPinCenter(comment.id);
      return h(
        "button",
        {
          "aria-label": `Comment ${comment.ordinal}, ${commentKindLabels[kind]}, ${comment.resolvedAt ? "Completed" : "Open"}`,
          className: `sbfx-review__pin sbfx-review__saved-pin sbfx-review__saved-pin--${kind}${comment.resolvedAt ? " sbfx-review__saved-pin--completed" : ""}`,
          "data-comment-kind": kind,
          "data-comment-status": comment.resolvedAt ? "completed" : "open",
          // One pin at a time: the hovered item wins over the focused one.
          "data-highlighted":
            (highlightedCommentId ?? focusedCommentId) === comment.id ? "true" : undefined,
          // While a new comment is being placed, clicks pass through to the Story.
          "data-passive": isCapturing || isComposerOpen ? "true" : undefined,
          "data-selected": selectedCommentId === comment.id ? "true" : undefined,
          "data-saved-comment-pin": comment.id,
          "data-anchored-pin": comment.anchor ? "true" : undefined,
          "data-dragging": draggingPinId === comment.id ? "true" : undefined,
          "data-saving": pendingLocations[comment.id] ? "true" : undefined,
          "data-sbfx-capture-ignore": "true",
          key: `saved-pin-${comment.id}`,
          // The pin sits over the prototype; none of its events may reach it.
          onClick: (event: DomMouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
            if (suppressPinClickRef.current === comment.id) {
              suppressPinClickRef.current = null;
              return;
            }
            activateSavedPin(comment, event.currentTarget as HTMLButtonElement);
          },
          onKeyDown: (event: DomKeyboardEvent<HTMLButtonElement>) =>
            handleSavedPinKeyDown(comment, event),
          onPointerCancel: (event: DomPointerEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            cancelSavedPinDrag();
          },
          onPointerDown: (event: DomPointerEvent<HTMLButtonElement>) =>
            handleSavedPinPointerDown(comment, event),
          onPointerMove: (event: DomPointerEvent<HTMLButtonElement>) =>
            handleSavedPinPointerMove(comment, event),
          onPointerUp: (event: DomPointerEvent<HTMLButtonElement>) =>
            handleSavedPinPointerUp(comment, event),
          onMouseEnter: () => setHoveredPinId(comment.id),
          onMouseLeave: () =>
            setHoveredPinId((current) => (current === comment.id ? null : current)),
          "aria-describedby": pinCardComment?.id === comment.id ? pinCardId : undefined,
          style: movingCenter
            ? { left: `${movingCenter.left}px`, top: `${movingCenter.top}px` }
            : anchoredPlacement === undefined
              ? {
                  left: `${captureTargetRect!.left + captureTargetRect!.width * pin.xRatio}px`,
                  top: `${captureTargetRect!.top + captureTargetRect!.height * pin.yRatio}px`,
                }
              : {
                  display: anchoredPlacement ? "" : "none",
                  left: `${anchoredPlacement?.left ?? 0}px`,
                  top: `${anchoredPlacement?.top ?? 0}px`,
                },
          type: "button",
        },
        comment.ordinal,
      );
    }),
    pinCardComment && pinCardPlacement
      ? h(
          "div",
          {
            className: "sbfx-review__pin-card",
            "data-saved-pin-card": pinCardComment.id,
            "data-sbfx-capture-ignore": "true",
            id: pinCardId,
            key: "saved-pin-card",
            ref: pinCardRef,
            role: "tooltip",
            style: {
              inlineSize: `${pinCardPlacement.width}px`,
              left: `${pinCardPlacement.left}px`,
              top: `${pinCardPlacement.top}px`,
            },
          },
          h(
            "p",
            { className: "sbfx-review__pin-card-title" },
            `Comment ${pinCardComment.ordinal} · ${commentKindLabels[resolveVisualCommentKind(pinCardComment.kind)]} · ${pinCardComment.resolvedAt ? "Completed" : "Open"}`,
          ),
          h("p", { className: "sbfx-review__pin-card-body" }, pinCardComment.body),
          h(
            "p",
            { className: "sbfx-review__pin-card-meta" },
            `${pinCardComment.authorName} · ${formatCommentTime(pinCardComment.createdAt)}`,
          ),
          // The screenshot still shows where the comment was made.
          pinCardComment.movedAt
            ? h(
                "p",
                { className: "sbfx-review__pin-card-meta", "data-pin-card-moved": "true" },
                labels.movedSinceScreenshot,
              )
            : null,
          pinCardComment.preview && !pinCardImageErrors[pinCardComment.id]
            ? h("img", {
                alt: `Screenshot for comment ${pinCardComment.ordinal}`,
                className: "sbfx-review__pin-card-image",
                key: `pin-card-image-${pinCardComment.id}`,
                onError: () =>
                  setPinCardImageErrors((current) => ({
                    ...current,
                    [pinCardComment.id]: true,
                  })),
                src: pinCardComment.preview.imageUrl,
                style: {
                  aspectRatio: `${pinCardComment.preview.width}/${pinCardComment.preview.height}`,
                },
              })
            : h(
                "p",
                {
                  className: "sbfx-review__pin-card-unavailable",
                  "data-pin-card-screenshot-unavailable": "true",
                  key: "pin-card-unavailable",
                },
                labels.screenshotUnavailable,
              ),
        )
      : null,
  );
}

export function FigmaExportReview({
  apiPath = defaultFigmaReviewStatusApiPath,
  autoMarkExported = true,
  componentTitle,
  enabled,
  figmaSourceUrl,
  labels: labelsOverride,
  showNotes = true,
  storyId,
  storyName,
  storyTitle,
  storyUrl,
  viewMode = "story",
  visualComments,
}: FigmaExportReviewProps) {
  const labels = { ...defaultLabels, ...labelsOverride };
  const reviewStatusController = createReviewStatusController({ apiPath });
  const initialFigmaSourceUrl = normalizeFigmaSourceUrl(figmaSourceUrl ?? "");
  const [entry, setEntry] = useState<FigmaReviewEntry>(() => normalizeEntry(null));
  const [draftDetails, setDraftDetails] = useState(() => ({
    figmaNodeUrl: initialFigmaSourceUrl,
    notes: "",
  }));
  const [isSourceEditing, setIsSourceEditing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() =>
    readCollapsePreference(reviewCollapseStorageKey),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [workspaceSlot, setWorkspaceSlot] = useState<HTMLElement | null>(null);
  const autoExportStoryRef = useRef<string | undefined>(undefined);
  const entryRef = useRef(entry);
  const saveQueueRef = useRef(Promise.resolve());
  // Docs (autodocs) pages get no review UI: the manager toolbar toggle is
  // hidden outside Story view, so the panel must not mount there either.
  const shouldShowPanel = enabled && Boolean(storyId) && viewMode === "story";

  useEffect(() => {
    if (!shouldShowPanel) {
      setWorkspaceSlot(null);
      return;
    }

    const workspace: FigmaWorkspaceSlotHandle = acquireFigmaWorkspaceSlot("review");
    setWorkspaceSlot(workspace.slot);
    return () => {
      setWorkspaceSlot(null);
      workspace.release();
    };
  }, [shouldShowPanel]);

  useEffect(() => {
    entryRef.current = entry;
  }, [entry]);

  useEffect(() => {
    if (!enabled || !storyId) return;

    const controller = new AbortController();
    setSaveState("loading");
    setErrorMessage("");

    async function loadReviewStatus() {
      try {
        const savedEntryPayload = await reviewStatusController.load(
          storyId,
          controller.signal,
        );
        const savedFigmaNodeUrl = normalizeFigmaSourceUrl(
          savedEntryPayload?.figmaNodeUrl ?? "",
        );
        const nextEntry = normalizeEntry({
          ...(savedEntryPayload ?? {}),
          figmaNodeUrl: savedFigmaNodeUrl || initialFigmaSourceUrl,
        });
        entryRef.current = nextEntry;
        setEntry(nextEntry);
        setDraftDetails({
          figmaNodeUrl: nextEntry.figmaNodeUrl ?? "",
          notes: nextEntry.notes ?? "",
        });
        setIsSourceEditing(false);
        setSaveState("idle");
      } catch (error) {
        if (controller.signal.aborted) return;
        setSaveState("error");
        setErrorMessage(error instanceof Error ? error.message : "Unable to load status.");
      }
    }

    void loadReviewStatus();

    return () => {
      controller.abort();
    };
  }, [apiPath, enabled, initialFigmaSourceUrl, storyId]);

  async function saveReviewStatus(patch: Partial<FigmaReviewEntry>) {
    const nextEntry = normalizeEntry({
      ...entryRef.current,
      ...patch,
      componentTitle,
      name: storyName,
      storyTitle,
    });

    entryRef.current = nextEntry;
    setEntry(nextEntry);
    setSaveState("saving");
    setErrorMessage("");

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const entryToSave = entryRef.current;
        const payload = await reviewStatusController.save(storyId, entryToSave);
        const savedEntry = normalizeEntry(payload.entry ?? entryToSave);
        entryRef.current = savedEntry;
        setEntry(savedEntry);
        setDraftDetails({
          figmaNodeUrl: savedEntry.figmaNodeUrl ?? "",
          notes: savedEntry.notes ?? "",
        });
        setSaveState("saved");
      })
      .catch((error: unknown) => {
        setSaveState("error");
        setErrorMessage(error instanceof Error ? error.message : "Unable to save status.");
      });

    await saveQueueRef.current;
  }

  useEffect(() => {
    if (!enabled || !storyId || !autoMarkExported) return;

    const markExported = () => {
      if (autoExportStoryRef.current === storyId) return;
      if (entry.figmaReviewStatus !== "not-started") return;

      const exporter = document.querySelector<HTMLElement>(".sbfx-exporter");
      const summary = exporter?.querySelector<HTMLElement>(".sbfx-exporter__summary");
      if (
        exporter?.dataset.status === "copied" &&
        summary?.textContent?.includes("JSON copied")
      ) {
        autoExportStoryRef.current = storyId;
        void saveReviewStatus({ figmaReviewStatus: "exported" });
      }
    };

    const observer = new MutationObserver(markExported);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    markExported();

    return () => {
      observer.disconnect();
    };
  }, [autoMarkExported, enabled, entry.figmaReviewStatus, storyId]);

  const openableFigmaSourceUrl = getOpenableUrl(entry.figmaNodeUrl);
  const shouldEditFigmaSource = isSourceEditing || !openableFigmaSourceUrl;

  function toggleCollapsed() {
    setIsCollapsed((current) => {
      const next = !current;
      writeCollapsePreference(reviewCollapseStorageKey, next);
      return next;
    });
  }

  function saveFigmaSourceUrl() {
    const figmaNodeUrl = normalizeFigmaSourceUrl(draftDetails.figmaNodeUrl);
    setDraftDetails((current) => ({
      ...current,
      figmaNodeUrl,
    }));
    setIsSourceEditing(!figmaNodeUrl);
    void saveReviewStatus({ figmaNodeUrl });
  }

  const reviewStatusOptions = getReviewStatusOptions(labels);

  return h(
    Fragment,
    null,
    shouldShowPanel && workspaceSlot
      ? createPortal(h(
          "aside",
          {
            "aria-label": "Figma export review",
            className: "sbfx-review",
            "data-collapsed": isCollapsed ? "true" : "false",
            "data-sbfx-capture-ignore": "true",
            "data-save-state": saveState,
            "data-version": getAddonVersion(),
          },
          h(
            "header",
            { className: "sbfx-review__header" },
            h(
              "span",
              { "aria-hidden": "true", className: "sbfx-review__mark" },
              h(EyeIcon, { size: 14 }),
            ),
            h(
              "span",
              { className: "sbfx-review__heading" },
              h(
                "span",
                { className: "sbfx-review__title" },
                labels.title,
              ),
              h(
                "span",
                { className: "sbfx-review__subtitle", title: componentTitle },
                componentTitle,
              ),
            ),
            h(
              "span",
              { className: "sbfx-review__status" },
              h("span", { "aria-hidden": "true", className: "sbfx-review__status-dot" }),
              getStatusText(saveState),
            ),
            h(
              "button",
              {
                "aria-expanded": !isCollapsed,
                "aria-label": isCollapsed
                  ? "Expand export review panel"
                  : "Collapse export review panel",
                className: "sbfx-review__toggle",
                onClick: toggleCollapsed,
                title: isCollapsed
                  ? "Expand export review panel"
                  : "Collapse export review panel",
                type: "button",
              },
              isCollapsed
                ? UnfoldMoreDisclosureIcon()
                : h(CollapseIcon, { "aria-hidden": "true", size: 14 }),
            ),
          ),
          h(
            "div",
            { className: "sbfx-review__body" },
            h(
              "label",
              { className: "sbfx-review__field" },
              h("span", null, labels.review),
              h(
                "select",
                {
                  onChange: (event: DomInputEvent<HTMLSelectElement>) => {
                    void saveReviewStatus({
                      figmaReviewStatus: (event.currentTarget as HTMLSelectElement)
                        .value as FigmaReviewStatus,
                    });
                  },
                  value: entry.figmaReviewStatus,
                },
                ...reviewStatusOptions.map((option) =>
                  h("option", { key: option.value, value: option.value }, option.label),
                ),
              ),
            ),
          ),
          shouldEditFigmaSource
            ? h(
                "label",
                { className: "sbfx-review__field" },
                h("span", null, labels.figmaSource),
                h("input", {
                  onBlur: saveFigmaSourceUrl,
                  onChange: (event: DomInputEvent<HTMLInputElement>) => {
                    const figmaNodeUrl = (event.currentTarget as HTMLInputElement).value;
                    setDraftDetails((current) => ({
                      ...current,
                      figmaNodeUrl,
                    }));
                  },
                  onKeyDown: (event: DomKeyboardEvent<HTMLInputElement>) => {
                    if (event.key === "Enter") {
                      (event.currentTarget as HTMLInputElement).blur();
                    }
                  },
                  placeholder: labels.sourcePlaceholder,
                  type: "url",
                  value: draftDetails.figmaNodeUrl,
                }),
              )
            : h(
                "div",
                { className: "sbfx-review__source" },
                h("span", { className: "sbfx-review__label" }, labels.figmaSource),
                h(
                  "div",
                  { className: "sbfx-review__source-actions" },
                  h(
                    "a",
                    {
                      className: "sbfx-review__button sbfx-review__button--outline",
                      href: openableFigmaSourceUrl,
                      rel: "noreferrer",
                      target: "_blank",
                    },
                    h(LinkIcon, { size: 14 }),
                    labels.openSource,
                  ),
                  h(
                    "button",
                    {
                      "aria-label": labels.editFigmaSource,
                      className: "sbfx-review__icon-button",
                      onClick: () => setIsSourceEditing(true),
                      type: "button",
                    },
                    h(EditIcon, { size: 14 }),
                  ),
                ),
              ),
          showNotes
            ? h(
                "div",
                { className: "sbfx-review__notes" },
                h(
                  "button",
                  {
                    "aria-expanded": entry.notesOpen,
                    className: "sbfx-review__button sbfx-review__button--secondary sbfx-review__notes-toggle",
                    onClick: () => {
                      void saveReviewStatus({ notesOpen: !entry.notesOpen });
                    },
                    type: "button",
                  },
                  h("span", null, labels.notes),
                  h(
                    "span",
                    { className: "sbfx-review__notes-state" },
                    entry.notesOpen ? labels.closeNotes : labels.openNotes,
                  ),
                ),
                entry.notesOpen
                  ? h(
                      "label",
                      { className: "sbfx-review__field" },
                      h("textarea", {
                        onBlur: () => {
                          void saveReviewStatus({ notes: draftDetails.notes });
                        },
                        onChange: (event: DomInputEvent<HTMLTextAreaElement>) => {
                          const notes = (event.currentTarget as HTMLTextAreaElement).value;
                          setDraftDetails((current) => ({
                            ...current,
                            notes,
                          }));
                        },
                        rows: 2,
                        value: draftDetails.notes,
                      }),
                    )
                  : draftDetails.notes
                    ? h("p", { className: "sbfx-review__notes-summary" }, labels.notesSaved)
                    : null,
              )
            : null,
          entry.updatedAt
            ? h(
                "p",
                { className: "sbfx-review__meta" },
                `Updated ${new Date(entry.updatedAt).toLocaleString()}`,
              )
            : null,
          errorMessage
            ? h("p", { className: "sbfx-review__error" }, errorMessage)
            : null,
        ), workspaceSlot)
      : null,
    shouldShowPanel && typeof document !== "undefined"
      ? createPortal(
          h(VisualCommentsSection, {
            componentTitle,
            enabled,
            labels,
            options: visualComments,
            storyId,
            storyName,
            storyTitle,
            storyUrl,
          }),
          document.body,
        )
      : null,
  );
}

// The review half of a story render: synchronizes the review workspace and
// visual comments for one story context. Shared by the legacy decorator and
// the configureFigmaExportReview registration.
function createReviewWorkspaceSync(
  figmaExportOptions?: FigmaExportAddonOptions,
  reviewOptions?: FigmaExportReviewOptions,
) {
  const resolvedOptions = resolveFigmaExportAddonOptions(figmaExportOptions);

  return function syncReviewForContext(context: StorybookContext): void {
    const includedStory = isStoryIncludedForFigmaExport(
      context.title,
      resolvedOptions,
    );
    const componentTitle =
      reviewOptions?.getComponentTitle?.(context, resolvedOptions) ??
      getDefaultFigmaExportComponentTitle(context.title, resolvedOptions);
    const figmaSourceUrl =
      reviewOptions?.getFigmaSourceUrl?.(context, componentTitle) ??
      getDefaultFigmaSourceUrl(context.parameters);
    const enabled =
      reviewOptions?.enabled !== false &&
      includedStory &&
      context.globals?.[resolvedOptions.globalName] === "on";

    syncFigmaReviewWorkspace({
      apiPath: reviewOptions?.apiPath,
      autoMarkExported: reviewOptions?.autoMarkExported,
      componentTitle,
      enabled,
      figmaSourceUrl,
      labels: reviewOptions?.labels,
      showNotes: reviewOptions?.showNotes,
      storyId: context.id ?? "unknown-story",
      storyName: context.name ?? "Story",
      storyTitle: context.title ?? "",
      storyUrl: typeof window === "undefined" ? undefined : window.location.href,
      viewMode: context.viewMode,
      visualComments: reviewOptions?.visualComments ?? resolvedOptions.visualComments,
    });
  };
}

// Lets a parent page (for example a canvas of embedded previews) ask this
// preview to capture its own capture target for an anchored comment.
function registerReviewCaptureHook(
  figmaExportOptions?: FigmaExportAddonOptions,
  reviewOptions?: FigmaExportReviewOptions,
) {
  const visualComments =
    reviewOptions?.visualComments ?? resolveFigmaExportAddonOptions(figmaExportOptions).visualComments;
  registerVisualCommentCaptureHook(visualComments?.captureSelector);
}

export function createFigmaExportReviewDecorator(
  figmaExportOptions?: FigmaExportAddonOptions,
  reviewOptions?: FigmaExportReviewOptions,
) {
  const figmaExportDecorator = createFigmaExportDecorator(figmaExportOptions);
  const syncReviewForContext = createReviewWorkspaceSync(figmaExportOptions, reviewOptions);
  registerReviewCaptureHook(figmaExportOptions, reviewOptions);

  // Generic so the story result type flows through unchanged: renderer
  // decorator typings (React's DecoratorFunction and friends) reject a
  // decorator that returns `unknown`.
  return function figmaExportReviewDecorator<StoryResult>(
    Story: () => StoryResult,
    context: StorybookContext,
  ): StoryResult {
    // The host decorator from the preview entry already synchronized this
    // render through configureFigmaExportReview.
    if (isHostRenderActive()) return Story();
    const storyResult = figmaExportDecorator(Story, context);
    syncReviewForContext(context);
    return storyResult;
  };
}

/**
 * Registers Figma export review for the addon's host decorator, which
 * Storybook applies from the addons list. Takes the same options as
 * createFigmaExportReviewDecorator; call it once from the project's preview
 * file instead of adding that decorator. With the addon listed before the
 * Prototype Inspector preset, review and visual comments then follow every
 * Inspector mode, including UI Flow.
 */
export function configureFigmaExportReview(
  figmaExportOptions?: FigmaExportAddonOptions,
  reviewOptions?: FigmaExportReviewOptions,
): void {
  const syncReviewForContext = createReviewWorkspaceSync(figmaExportOptions, reviewOptions);
  registerReviewCaptureHook(figmaExportOptions, reviewOptions);
  registerFigmaReviewSync({
    sync(context) {
      syncFigmaExportOverlay(context, figmaExportOptions);
      syncReviewForContext(context);
    },
  });
}

let reviewDomRoot: ReturnType<typeof mountDom> | undefined;
let reviewDomHost: HTMLElement | undefined;

function syncFigmaReviewWorkspace(props: FigmaExportReviewProps): void {
  if (typeof document === "undefined") return;
  if (!props.enabled) {
    destroyFigmaReviewWorkspace();
    return;
  }
  if (!reviewDomHost?.isConnected) {
    reviewDomHost = document.createElement("div");
    reviewDomHost.dataset.sbfxReviewHost = "true";
    reviewDomHost.dataset.sbfxCaptureIgnore = "true";
    document.body.append(reviewDomHost);
    reviewDomRoot = mountDom(
      FigmaExportReview as unknown as (
        props: Record<string, unknown>,
      ) => DomChild,
      props as unknown as Record<string, unknown>,
      reviewDomHost,
    );
    return;
  }
  reviewDomRoot?.update(props as unknown as Record<string, unknown>);
}

export function destroyFigmaReviewWorkspace(): void {
  reviewDomRoot?.destroy();
  reviewDomRoot = undefined;
  reviewDomHost = undefined;
}

const hotModule = (
  import.meta as ImportMeta & {
    hot?: { dispose(callback: () => void): void };
  }
).hot;
if (hotModule) {
  hotModule.dispose(destroyFigmaReviewWorkspace);
}
