import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import {
  VISUAL_COMMENT_LIMITS,
  clampRatio,
  isFiniteRatio,
  normalizeAuthorName,
  type CreateVisualCommentRequest,
} from "./visualComment";
import {
  renderVisualCommentIndex,
  renderVisualCommentReport,
} from "./visualCommentReport";

type VisualCommentLimits = {
  [Key in keyof typeof VISUAL_COMMENT_LIMITS]: number;
};

export type VisualMeeting = {
  id: string;
  title: string;
  startedAt: string;
  closedAt: string | null;
};

export type VisualCapture = {
  id: string;
  capturedAt: string;
  story: CreateVisualCommentRequest["story"];
  viewport: CreateVisualCommentRequest["viewport"];
  image: {
    path: string;
    mimeType: "image/webp" | "image/png";
    width: number;
    height: number;
    cssWidth: number;
    cssHeight: number;
    sha256: string;
    bytes: number;
  };
};

export type VisualComment = {
  id: string;
  clientRequestId: string;
  captureId: string;
  authorName: string;
  body: string;
  pin: { xRatio: number; yRatio: number };
  createdAt: string;
};

export type VisualMeetingFile = {
  version: 1;
  session: VisualMeeting;
  captures: Record<string, VisualCapture>;
  comments: VisualComment[];
};

export type VisualCommentStoreState = {
  version: 1;
  activeSessionId: string | null;
};

export type VisualCommentStoreOptions = {
  cwd?: string;
  commentsDir?: string;
  reportRenderer?: {
    index(meetings: VisualMeeting[], activeSessionId: string | null): string;
    meeting(meeting: VisualMeetingFile): string;
  };
  limits?: Partial<VisualCommentLimits>;
};

export class VisualCommentStoreError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "VisualCommentStoreError";
  }
}

const emptyState: VisualCommentStoreState = {
  version: 1,
  activeSessionId: null,
};
const sessionIdPattern = /^[a-z0-9-]+$/;

function fail(message: string, code = "INVALID", statusCode = 400): never {
  throw new VisualCommentStoreError(message, code, statusCode);
}

function assertRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertText(value: unknown, name: string, max: number): string {
  if (typeof value !== "string") fail(`${name} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) fail(`${name} is invalid.`);
  return trimmed;
}

function assertFinite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${name} must be finite.`);
  }
  return value;
}

function assertSessionId(value: string): string {
  if (!sessionIdPattern.test(value)) fail("Invalid session ID.");
  return value;
}

function getPngDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return null;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readUInt24LE(bytes: Buffer, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function getWebpDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (
    bytes.length < 30 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: readUInt24LE(bytes, 24) + 1,
      height: readUInt24LE(bytes, 27) + 1,
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const packed = bytes.readUInt32LE(21);
    return {
      width: (packed & 0x3fff) + 1,
      height: ((packed >> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    for (let offset = 20; offset <= bytes.length - 7; offset += 1) {
      if (bytes[offset] === 0x9d && bytes[offset + 1] === 0x01 && bytes[offset + 2] === 0x2a) {
        return {
          width: bytes.readUInt16LE(offset + 3) & 0x3fff,
          height: bytes.readUInt16LE(offset + 5) & 0x3fff,
        };
      }
    }
  }
  return null;
}

function decodeImage(
  dataUrl: unknown,
  declaredMime: unknown,
  suppliedWidth: unknown,
  suppliedHeight: unknown,
  limits: VisualCommentLimits,
) {
  if (typeof dataUrl !== "string" || typeof declaredMime !== "string") {
    fail("Capture image is required.");
  }
  const match = /^data:(image\/(?:webp|png));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match || match[1] !== declaredMime) fail("Invalid image data URL.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > limits.maxImageBytes) {
    fail("Image exceeds size limit.", "LIMIT", 413);
  }
  const dimensions =
    declaredMime === "image/png"
      ? getPngDimensions(bytes)
      : getWebpDimensions(bytes);
  if (!dimensions) fail("Image magic bytes or dimensions do not match MIME.");
  const width = assertFinite(suppliedWidth, "capture.width");
  const height = assertFinite(suppliedHeight, "capture.height");
  if (width !== dimensions.width || height !== dimensions.height) {
    fail("Supplied image dimensions do not match decoded image.");
  }
  if (
    width > limits.maxImageLongestSide ||
    height > limits.maxImageLongestSide ||
    width * height > limits.maxImagePixels
  ) {
    fail("Image dimensions exceed limit.", "LIMIT", 413);
  }
  return {
    bytes,
    width,
    height,
    mimeType: declaredMime as "image/webp" | "image/png",
  };
}

async function atomicWrite(path: string, content: string | Uint8Array) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, content);
    await rename(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

async function readJson<T>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new VisualCommentStoreError(`Missing file ${basename(path)}.`, "NOT_FOUND", 404);
    }
    throw error;
  }
}

function normalizeRequest(
  requestValue: unknown,
  limits: VisualCommentLimits,
) {
  const request = assertRecord(requestValue, "request");
  const story = assertRecord(request.story, "story");
  const pin = assertRecord(request.pin, "pin");
  const viewport = assertRecord(request.viewport, "viewport");
  const capture = assertRecord(request.capture, "capture");
  const image = decodeImage(
    capture.dataUrl,
    capture.mimeType,
    capture.width,
    capture.height,
    limits,
  );
  if (request.authorName !== undefined && typeof request.authorName !== "string") {
    fail("authorName must be a string.");
  }
  const authorName = normalizeAuthorName(request.authorName);
  if (authorName.length > limits.maxAuthorLength) fail("authorName is invalid.");
  const normalized = {
    clientRequestId: assertText(request.clientRequestId, "clientRequestId", 64),
    authorName,
    body: assertText(request.body, "body", limits.maxBodyLength),
    story: {
      id: assertText(story.id, "story.id", 240),
      title: assertText(story.title, "story.title", 240),
      name: assertText(story.name, "story.name", 240),
      ...(typeof story.url === "string" ? { url: story.url } : {}),
      ...(typeof story.prototypeId === "string" ? { prototypeId: story.prototypeId } : {}),
      ...(typeof story.routeId === "string" ? { routeId: story.routeId } : {}),
      ...(typeof story.stateId === "string" ? { stateId: story.stateId } : {}),
    },
    pin: {
      xRatio: clampRatio(assertFinite(pin.xRatio, "pin.xRatio")),
      yRatio: clampRatio(assertFinite(pin.yRatio, "pin.yRatio")),
    },
    viewport: {
      width: assertFinite(viewport.width, "viewport.width"),
      height: assertFinite(viewport.height, "viewport.height"),
      devicePixelRatio: assertFinite(
        viewport.devicePixelRatio,
        "viewport.devicePixelRatio",
      ),
      scrollX: assertFinite(viewport.scrollX, "viewport.scrollX"),
      scrollY: assertFinite(viewport.scrollY, "viewport.scrollY"),
    },
    capture: {
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      cssWidth: assertFinite(capture.cssWidth, "capture.cssWidth"),
      cssHeight: assertFinite(capture.cssHeight, "capture.cssHeight"),
    },
  } satisfies Omit<CreateVisualCommentRequest, "capture"> & {
    capture: Omit<CreateVisualCommentRequest["capture"], "dataUrl">;
  };
  const imageHash = createHash("sha256").update(image.bytes).digest("hex");
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ ...normalized, imageHash }))
    .digest("hex");
  return { normalized, image, imageHash, requestHash };
}

function hashStoredRequest(
  meeting: VisualMeetingFile,
  comment: VisualComment,
): string | null {
  const capture = meeting.captures[comment.captureId];
  if (!capture) return null;
  return createHash("sha256")
    .update(
      JSON.stringify({
        clientRequestId: comment.clientRequestId,
        authorName: comment.authorName,
        body: comment.body,
        story: capture.story,
        pin: comment.pin,
        viewport: capture.viewport,
        capture: {
          mimeType: capture.image.mimeType,
          width: capture.image.width,
          height: capture.image.height,
          cssWidth: capture.image.cssWidth,
          cssHeight: capture.image.cssHeight,
        },
        imageHash: capture.image.sha256,
      }),
    )
    .digest("hex");
}

export function createVisualCommentStore(options: VisualCommentStoreOptions = {}) {
  const limits = { ...VISUAL_COMMENT_LIMITS, ...options.limits };
  const root = resolve(
    options.cwd ?? process.cwd(),
    options.commentsDir ?? "design-system/figma-export-review",
  );
  const statePath = join(root, "state.json");
  const reportRenderer = options.reportRenderer ?? {
    index: renderVisualCommentIndex,
    meeting: renderVisualCommentReport,
  };
  let queue = Promise.resolve();

  const mutate = <T>(operation: () => Promise<T>) => {
    const next = queue.then(operation, operation);
    queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const readState = async (): Promise<VisualCommentStoreState> => {
    try {
      const state = await readJson<VisualCommentStoreState>(statePath);
      return state.version === 1 ? state : { ...emptyState };
    } catch (error) {
      if (error instanceof VisualCommentStoreError && error.statusCode === 404) {
        return { ...emptyState };
      }
      throw error;
    }
  };
  const writeState = (state: VisualCommentStoreState) =>
    atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const sessionDir = (id: string) => join(root, "sessions", assertSessionId(id));
  const readMeeting = (id: string) =>
    readJson<VisualMeetingFile>(join(sessionDir(id), "meeting.json"));
  const writeMeeting = (meeting: VisualMeetingFile) =>
    atomicWrite(
      join(sessionDir(meeting.session.id), "meeting.json"),
      `${JSON.stringify(meeting, null, 2)}\n`,
    );

  const listMeetings = async (): Promise<VisualMeeting[]> => {
    let entries: string[] = [];
    try {
      entries = await readdir(join(root, "sessions"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const meetings = await Promise.all(
      entries
        .filter((entry) => sessionIdPattern.test(entry))
        .map(async (id) => {
          try {
            return (await readMeeting(id)).session;
          } catch {
            return null;
          }
        }),
    );
    return meetings
      .filter((meeting): meeting is VisualMeeting => Boolean(meeting))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  };

  const rebuildReports = async (meeting?: VisualMeetingFile) => {
    await mkdir(join(root, "sessions"), { recursive: true });
    if (meeting) {
      await atomicWrite(
        join(sessionDir(meeting.session.id), "index.html"),
        reportRenderer.meeting(meeting),
      );
    }
    const [state, meetings] = await Promise.all([readState(), listMeetings()]);
    await atomicWrite(
      join(root, "index.html"),
      reportRenderer.index(meetings, state.activeSessionId),
    );
  };

  const sessionAssetBytes = async (id: string) => {
    const assetsDir = join(sessionDir(id), "assets");
    let files: string[] = [];
    try {
      files = await readdir(assetsDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
      throw error;
    }
    const sizes = await Promise.all(
      files.map(async (file) => (await stat(join(assetsDir, file))).size),
    );
    return sizes.reduce((sum, size) => sum + size, 0);
  };

  const withReportStatus = async <T>(value: T, meeting?: VisualMeetingFile) => {
    try {
      await rebuildReports(meeting);
      return { ...value, reportStale: false };
    } catch {
      return { ...value, reportStale: true };
    }
  };

  return {
    root,
    getState: readState,
    listMeetings,
    getOverview: async (storyId?: string) => {
      const [state, recentSessions] = await Promise.all([
        readState(),
        listMeetings(),
      ]);
      const activeMeeting = state.activeSessionId
        ? await readMeeting(state.activeSessionId).catch(() => null)
        : null;
      const comments = activeMeeting
        ? activeMeeting.comments.filter((comment) => {
            const capture = activeMeeting.captures[comment.captureId];
            return !storyId || capture?.story.id === storyId;
          })
        : [];
      return {
        version: 1 as const,
        activeSession: activeMeeting?.session ?? null,
        recentSessions: recentSessions.slice(0, 20),
        comments,
      };
    },
    getMeeting: readMeeting,
    startMeeting: (title: string) =>
      mutate(async () => {
        const state = await readState();
        if (state.activeSessionId) {
          const activeMeeting = await readMeeting(state.activeSessionId).catch(() => null);
          const error = new VisualCommentStoreError(
            "A meeting is already active.",
            "ACTIVE",
            409,
          );
          Object.assign(error, { activeMeeting: activeMeeting?.session ?? null });
          throw error;
        }
        const now = new Date().toISOString();
        const meeting: VisualMeetingFile = {
          version: 1,
          session: {
            id: `${now.slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8)}`,
            title: assertText(title, "title", limits.maxTitleLength),
            startedAt: now,
            closedAt: null,
          },
          captures: {},
          comments: [],
        };
        await mkdir(join(sessionDir(meeting.session.id), "assets"), {
          recursive: true,
        });
        await writeMeeting(meeting);
        await writeState({ version: 1, activeSessionId: meeting.session.id });
        return withReportStatus({ meeting }, meeting);
      }),
    closeMeeting: (id: string) =>
      mutate(async () => {
        const meeting = await readMeeting(id);
        if (!meeting.session.closedAt) {
          meeting.session.closedAt = new Date().toISOString();
          await writeMeeting(meeting);
        }
        const state = await readState();
        if (state.activeSessionId === id) {
          await writeState({ version: 1, activeSessionId: null });
        }
        return withReportStatus({ meeting }, meeting);
      }),
    createComment: (id: string, requestValue: unknown) =>
      mutate(async () => {
        const meeting = await readMeeting(id);
        if (meeting.session.closedAt) {
          fail("Meeting is closed.", "CLOSED", 409);
        }
        const { normalized, image, imageHash, requestHash } = normalizeRequest(
          requestValue,
          limits,
        );
        const existing = meeting.comments.find(
          (comment) => comment.clientRequestId === normalized.clientRequestId,
        );
        if (existing) {
          if (hashStoredRequest(meeting, existing) !== requestHash) {
            fail("Request ID conflict.", "CONFLICT", 409);
          }
          return withReportStatus(
            { comment: existing, meeting, replay: true },
            meeting,
          );
        }

        const extension = image.mimeType === "image/png" ? "png" : "webp";
        const relativeAssetPath = `assets/${imageHash}.${extension}`;
        const assetPath = join(sessionDir(id), relativeAssetPath);
        let assetExists = true;
        try {
          await stat(assetPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") assetExists = false;
          else throw error;
        }
        if (!assetExists) {
          const usedBytes = await sessionAssetBytes(id);
          if (
            usedBytes + image.bytes.length >
            limits.maxSessionAssetsBytes
          ) {
            fail("Session asset budget exceeded.", "LIMIT", 413);
          }
        }

        await mkdir(dirname(assetPath), { recursive: true });
        if (!assetExists) {
          try {
            await writeFile(assetPath, image.bytes, { flag: "wx" });
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          }
        }
        const now = new Date().toISOString();
        const captureId = randomUUID();
        const comment: VisualComment = {
          id: randomUUID(),
          clientRequestId: normalized.clientRequestId,
          captureId,
          authorName: normalized.authorName,
          body: normalized.body,
          pin: normalized.pin,
          createdAt: now,
        };
        meeting.captures[captureId] = {
          id: captureId,
          capturedAt: now,
          story: normalized.story,
          viewport: normalized.viewport,
          image: {
            path: relativeAssetPath,
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,
            cssWidth: normalized.capture.cssWidth,
            cssHeight: normalized.capture.cssHeight,
            sha256: imageHash,
            bytes: image.bytes.length,
          },
        };
        meeting.comments.push(comment);
        await writeMeeting(meeting);
        return withReportStatus(
          { comment, meeting, replay: false },
          meeting,
        );
      }),
  };
}
