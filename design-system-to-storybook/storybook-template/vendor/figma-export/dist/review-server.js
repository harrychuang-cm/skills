// src/review-server.ts
import { mkdir as mkdir2, readFile as readFile2, readdir as readdir2, writeFile as writeFile2 } from "fs/promises";
import { dirname as dirname2, join as join2, resolve as resolve2 } from "path";

// src/visualComment.ts
import { toSvg } from "html-to-image";
var defaultVisualCommentsApiPath = "/__figma_export_review_comments";
var defaultVisualCommentsDir = "design-system/figma-export-review";
var VISUAL_COMMENT_LIMITS = {
  maxRequestBytes: 4 * 1024 * 1024,
  maxImageBytes: 2 * 1024 * 1024,
  maxImageLongestSide: 2048,
  maxImagePixels: 4 * 1024 * 1024,
  maxSessionAssetsBytes: 100 * 1024 * 1024,
  maxTitleLength: 120,
  maxAuthorLength: 80,
  maxBodyLength: 2e3
};
function clampRatio(value) {
  return Math.min(1, Math.max(0, value));
}
function normalizeAuthorName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return name || "Anonymous";
}

// src/visualCommentStore.ts
import { createHash, randomUUID } from "crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile
} from "fs/promises";
import { basename, dirname, join, resolve } from "path";

// src/visualCommentReport.ts
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char
  );
}
var csp = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
function safeHttpUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
function renderVisualCommentReport(meeting) {
  const captures = Object.values(meeting.captures).sort(
    (a, b) => a.capturedAt.localeCompare(b.capturedAt)
  );
  const sections = captures.map((capture) => {
    const comments = meeting.comments.filter((comment) => comment.captureId === capture.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const pins = comments.map(
      (comment, index) => `<span class="pin" style="left:${comment.pin.xRatio * 100}%;top:${comment.pin.yRatio * 100}%">${index + 1}</span>`
    ).join("");
    const cards = comments.map(
      (comment, index) => `<article><strong>${index + 1}. ${escapeHtml(comment.authorName)}</strong><time>${escapeHtml(comment.createdAt)}</time><p>${escapeHtml(comment.body)}</p></article>`
    ).join("");
    const storyUrl = safeHttpUrl(capture.story.url);
    const heading = storyUrl ? `<a href="${escapeHtml(storyUrl)}">${escapeHtml(capture.story.title)} / ${escapeHtml(capture.story.name)}</a>` : `${escapeHtml(capture.story.title)} / ${escapeHtml(capture.story.name)}`;
    const metadata = [capture.story.routeId, capture.story.stateId].filter(Boolean).map(escapeHtml).join(" \xB7 ");
    return `<section><h2>${heading}</h2>${metadata ? `<p class="metadata">${metadata}</p>` : ""}<div class="snapshot" style="aspect-ratio:${capture.image.width}/${capture.image.height}"><img src="${escapeHtml(capture.image.path)}" alt="Captured ${escapeHtml(capture.story.name)}">${pins}</div><div class="comments">${cards}</div></section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(meeting.session.title)}</title><style>body{font:16px system-ui;margin:2rem;color:#222}a{color:inherit}.metadata{color:#666}.snapshot{position:relative;max-width:960px}.snapshot img{display:block;width:100%;height:100%;object-fit:contain}.pin{position:absolute;transform:translate(-50%,-50%);background:#d33;color:#fff;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px}.comments{display:grid;gap:.5rem;max-width:960px}article{border:1px solid #ddd;padding:.75rem}time{float:right;color:#666}p{white-space:pre-wrap}</style></head><body><h1>${escapeHtml(meeting.session.title)}</h1><p>${escapeHtml(meeting.session.startedAt)}${meeting.session.closedAt ? ` \u2013 ${escapeHtml(meeting.session.closedAt)}` : " (active)"}</p>${sections || "<p>No comments yet.</p>"}</body></html>`;
}
function renderVisualCommentIndex(meetings, activeSessionId) {
  const links = [...meetings].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(
    (meeting) => `<li><a href="sessions/${encodeURIComponent(meeting.id)}/index.html">${escapeHtml(meeting.title)}</a> <small>${escapeHtml(meeting.startedAt)}</small>${meeting.id === activeSessionId ? " (active)" : ""}</li>`
  ).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Visual review meetings</title></head><body><h1>Visual review meetings</h1><ul>${links}</ul></body></html>`;
}

// src/visualCommentStore.ts
var VisualCommentStoreError = class extends Error {
  constructor(message, code, statusCode) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = "VisualCommentStoreError";
  }
  code;
  statusCode;
};
var emptyState = {
  version: 1,
  activeSessionId: null
};
var sessionIdPattern = /^[a-z0-9-]+$/;
function fail(message, code = "INVALID", statusCode = 400) {
  throw new VisualCommentStoreError(message, code, statusCode);
}
function assertRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${name} must be an object.`);
  }
  return value;
}
function assertText(value, name, max) {
  if (typeof value !== "string") fail(`${name} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) fail(`${name} is invalid.`);
  return trimmed;
}
function assertFinite(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${name} must be finite.`);
  }
  return value;
}
function assertSessionId(value) {
  if (!sessionIdPattern.test(value)) fail("Invalid session ID.");
  return value;
}
function getPngDimensions(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return null;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
function readUInt24LE(bytes, offset) {
  return bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
}
function getWebpDimensions(bytes) {
  if (bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: readUInt24LE(bytes, 24) + 1,
      height: readUInt24LE(bytes, 27) + 1
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 47) {
    const packed = bytes.readUInt32LE(21);
    return {
      width: (packed & 16383) + 1,
      height: (packed >> 14 & 16383) + 1
    };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    for (let offset = 20; offset <= bytes.length - 7; offset += 1) {
      if (bytes[offset] === 157 && bytes[offset + 1] === 1 && bytes[offset + 2] === 42) {
        return {
          width: bytes.readUInt16LE(offset + 3) & 16383,
          height: bytes.readUInt16LE(offset + 5) & 16383
        };
      }
    }
  }
  return null;
}
function decodeImage(dataUrl, declaredMime, suppliedWidth, suppliedHeight, limits) {
  if (typeof dataUrl !== "string" || typeof declaredMime !== "string") {
    fail("Capture image is required.");
  }
  const match = /^data:(image\/(?:webp|png));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match || match[1] !== declaredMime) fail("Invalid image data URL.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > limits.maxImageBytes) {
    fail("Image exceeds size limit.", "LIMIT", 413);
  }
  const dimensions = declaredMime === "image/png" ? getPngDimensions(bytes) : getWebpDimensions(bytes);
  if (!dimensions) fail("Image magic bytes or dimensions do not match MIME.");
  const width = assertFinite(suppliedWidth, "capture.width");
  const height = assertFinite(suppliedHeight, "capture.height");
  if (width !== dimensions.width || height !== dimensions.height) {
    fail("Supplied image dimensions do not match decoded image.");
  }
  if (width > limits.maxImageLongestSide || height > limits.maxImageLongestSide || width * height > limits.maxImagePixels) {
    fail("Image dimensions exceed limit.", "LIMIT", 413);
  }
  return {
    bytes,
    width,
    height,
    mimeType: declaredMime
  };
}
async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, content);
    await rename(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => void 0);
    throw error;
  }
}
async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new VisualCommentStoreError(`Missing file ${basename(path)}.`, "NOT_FOUND", 404);
    }
    throw error;
  }
}
function normalizeRequest(requestValue, limits) {
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
    limits
  );
  if (request.authorName !== void 0 && typeof request.authorName !== "string") {
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
      ...typeof story.url === "string" ? { url: story.url } : {},
      ...typeof story.prototypeId === "string" ? { prototypeId: story.prototypeId } : {},
      ...typeof story.routeId === "string" ? { routeId: story.routeId } : {},
      ...typeof story.stateId === "string" ? { stateId: story.stateId } : {}
    },
    pin: {
      xRatio: clampRatio(assertFinite(pin.xRatio, "pin.xRatio")),
      yRatio: clampRatio(assertFinite(pin.yRatio, "pin.yRatio"))
    },
    viewport: {
      width: assertFinite(viewport.width, "viewport.width"),
      height: assertFinite(viewport.height, "viewport.height"),
      devicePixelRatio: assertFinite(
        viewport.devicePixelRatio,
        "viewport.devicePixelRatio"
      ),
      scrollX: assertFinite(viewport.scrollX, "viewport.scrollX"),
      scrollY: assertFinite(viewport.scrollY, "viewport.scrollY")
    },
    capture: {
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      cssWidth: assertFinite(capture.cssWidth, "capture.cssWidth"),
      cssHeight: assertFinite(capture.cssHeight, "capture.cssHeight")
    }
  };
  const imageHash = createHash("sha256").update(image.bytes).digest("hex");
  const requestHash = createHash("sha256").update(JSON.stringify({ ...normalized, imageHash })).digest("hex");
  return { normalized, image, imageHash, requestHash };
}
function hashStoredRequest(meeting, comment) {
  const capture = meeting.captures[comment.captureId];
  if (!capture) return null;
  return createHash("sha256").update(
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
        cssHeight: capture.image.cssHeight
      },
      imageHash: capture.image.sha256
    })
  ).digest("hex");
}
function createVisualCommentStore(options = {}) {
  const limits = { ...VISUAL_COMMENT_LIMITS, ...options.limits };
  const root = resolve(
    options.cwd ?? process.cwd(),
    options.commentsDir ?? "design-system/figma-export-review"
  );
  const statePath = join(root, "state.json");
  const reportRenderer = options.reportRenderer ?? {
    index: renderVisualCommentIndex,
    meeting: renderVisualCommentReport
  };
  let queue = Promise.resolve();
  const mutate = (operation) => {
    const next = queue.then(operation, operation);
    queue = next.then(
      () => void 0,
      () => void 0
    );
    return next;
  };
  const readState = async () => {
    try {
      const state = await readJson(statePath);
      return state.version === 1 ? state : { ...emptyState };
    } catch (error) {
      if (error instanceof VisualCommentStoreError && error.statusCode === 404) {
        return { ...emptyState };
      }
      throw error;
    }
  };
  const writeState = (state) => atomicWrite(statePath, `${JSON.stringify(state, null, 2)}
`);
  const sessionDir = (id) => join(root, "sessions", assertSessionId(id));
  const readMeeting = (id) => readJson(join(sessionDir(id), "meeting.json"));
  const writeMeeting = (meeting) => atomicWrite(
    join(sessionDir(meeting.session.id), "meeting.json"),
    `${JSON.stringify(meeting, null, 2)}
`
  );
  const listMeetings = async () => {
    let entries = [];
    try {
      entries = await readdir(join(root, "sessions"));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const meetings = await Promise.all(
      entries.filter((entry) => sessionIdPattern.test(entry)).map(async (id) => {
        try {
          return (await readMeeting(id)).session;
        } catch {
          return null;
        }
      })
    );
    return meetings.filter((meeting) => Boolean(meeting)).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  };
  const rebuildReports = async (meeting) => {
    await mkdir(join(root, "sessions"), { recursive: true });
    if (meeting) {
      await atomicWrite(
        join(sessionDir(meeting.session.id), "index.html"),
        reportRenderer.meeting(meeting)
      );
    }
    const [state, meetings] = await Promise.all([readState(), listMeetings()]);
    await atomicWrite(
      join(root, "index.html"),
      reportRenderer.index(meetings, state.activeSessionId)
    );
  };
  const sessionAssetBytes = async (id) => {
    const assetsDir = join(sessionDir(id), "assets");
    let files = [];
    try {
      files = await readdir(assetsDir);
    } catch (error) {
      if (error.code === "ENOENT") return 0;
      throw error;
    }
    const sizes = await Promise.all(
      files.map(async (file) => (await stat(join(assetsDir, file))).size)
    );
    return sizes.reduce((sum, size) => sum + size, 0);
  };
  const withReportStatus = async (value, meeting) => {
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
    getOverview: async (storyId) => {
      const [state, recentSessions] = await Promise.all([
        readState(),
        listMeetings()
      ]);
      const activeMeeting = state.activeSessionId ? await readMeeting(state.activeSessionId).catch(() => null) : null;
      const comments = activeMeeting ? activeMeeting.comments.filter((comment) => {
        const capture = activeMeeting.captures[comment.captureId];
        return !storyId || capture?.story.id === storyId;
      }) : [];
      return {
        version: 1,
        activeSession: activeMeeting?.session ?? null,
        recentSessions: recentSessions.slice(0, 20),
        comments
      };
    },
    getMeeting: readMeeting,
    startMeeting: (title) => mutate(async () => {
      const state = await readState();
      if (state.activeSessionId) {
        const activeMeeting = await readMeeting(state.activeSessionId).catch(() => null);
        const error = new VisualCommentStoreError(
          "A meeting is already active.",
          "ACTIVE",
          409
        );
        Object.assign(error, { activeMeeting: activeMeeting?.session ?? null });
        throw error;
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const meeting = {
        version: 1,
        session: {
          id: `${now.slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8)}`,
          title: assertText(title, "title", limits.maxTitleLength),
          startedAt: now,
          closedAt: null
        },
        captures: {},
        comments: []
      };
      await mkdir(join(sessionDir(meeting.session.id), "assets"), {
        recursive: true
      });
      await writeMeeting(meeting);
      await writeState({ version: 1, activeSessionId: meeting.session.id });
      return withReportStatus({ meeting }, meeting);
    }),
    closeMeeting: (id) => mutate(async () => {
      const meeting = await readMeeting(id);
      if (!meeting.session.closedAt) {
        meeting.session.closedAt = (/* @__PURE__ */ new Date()).toISOString();
        await writeMeeting(meeting);
      }
      const state = await readState();
      if (state.activeSessionId === id) {
        await writeState({ version: 1, activeSessionId: null });
      }
      return withReportStatus({ meeting }, meeting);
    }),
    createComment: (id, requestValue) => mutate(async () => {
      const meeting = await readMeeting(id);
      if (meeting.session.closedAt) {
        fail("Meeting is closed.", "CLOSED", 409);
      }
      const { normalized, image, imageHash, requestHash } = normalizeRequest(
        requestValue,
        limits
      );
      const existing = meeting.comments.find(
        (comment2) => comment2.clientRequestId === normalized.clientRequestId
      );
      if (existing) {
        if (hashStoredRequest(meeting, existing) !== requestHash) {
          fail("Request ID conflict.", "CONFLICT", 409);
        }
        return withReportStatus(
          { comment: existing, meeting, replay: true },
          meeting
        );
      }
      const extension = image.mimeType === "image/png" ? "png" : "webp";
      const relativeAssetPath = `assets/${imageHash}.${extension}`;
      const assetPath = join(sessionDir(id), relativeAssetPath);
      let assetExists = true;
      try {
        await stat(assetPath);
      } catch (error) {
        if (error.code === "ENOENT") assetExists = false;
        else throw error;
      }
      if (!assetExists) {
        const usedBytes = await sessionAssetBytes(id);
        if (usedBytes + image.bytes.length > limits.maxSessionAssetsBytes) {
          fail("Session asset budget exceeded.", "LIMIT", 413);
        }
      }
      await mkdir(dirname(assetPath), { recursive: true });
      if (!assetExists) {
        try {
          await writeFile(assetPath, image.bytes, { flag: "wx" });
        } catch (error) {
          if (error.code !== "EEXIST") throw error;
        }
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const captureId = randomUUID();
      const comment = {
        id: randomUUID(),
        clientRequestId: normalized.clientRequestId,
        captureId,
        authorName: normalized.authorName,
        body: normalized.body,
        pin: normalized.pin,
        createdAt: now
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
          bytes: image.bytes.length
        }
      };
      meeting.comments.push(comment);
      await writeMeeting(meeting);
      return withReportStatus(
        { comment, meeting, replay: false },
        meeting
      );
    })
  };
}

// src/review-server.ts
var defaultFigmaReviewStatusApiPath = "/__figma_export_review_status";
var defaultFigmaExportPayloadApiPath = "/__figma-export/payloads";
var defaultFigmaExportPayloadDir = "design-system/figma-export-payloads";
var reviewStatusValues = /* @__PURE__ */ new Set([
  "not-started",
  "exported",
  "imported",
  "needs-fix",
  "approved"
]);
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNodeError(error) {
  return error instanceof Error && "code" in error;
}
function isFigmaReviewStatus(value) {
  return typeof value === "string" && reviewStatusValues.has(value);
}
function normalizeReviewEntry(value) {
  const source = isRecord(value) ? value : {};
  const reviewStatus = source.figmaReviewStatus;
  const notes = typeof source.notes === "string" ? source.notes : void 0;
  return {
    componentTitle: typeof source.componentTitle === "string" ? source.componentTitle : void 0,
    figmaNodeUrl: typeof source.figmaNodeUrl === "string" ? source.figmaNodeUrl : void 0,
    figmaReviewStatus: isFigmaReviewStatus(reviewStatus) ? reviewStatus : "not-started",
    name: typeof source.name === "string" ? source.name : void 0,
    notes,
    notesOpen: typeof source.notesOpen === "boolean" ? source.notesOpen : Boolean(notes),
    storyTitle: typeof source.storyTitle === "string" ? source.storyTitle : void 0,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : void 0
  };
}
async function readReviewStatusFile(reviewStatusFilePath) {
  try {
    const raw = await readFile2(reviewStatusFilePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.stories)) {
      return { stories: {}, version: 1 };
    }
    const stories = {};
    for (const [storyId, entry] of Object.entries(parsed.stories)) {
      stories[storyId] = normalizeReviewEntry(entry);
    }
    return { stories, version: 1 };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { stories: {}, version: 1 };
    }
    throw error;
  }
}
async function writeReviewStatusFile(reviewStatusFilePath, file) {
  await mkdir2(dirname2(reviewStatusFilePath), { recursive: true });
  await writeFile2(reviewStatusFilePath, `${JSON.stringify(file, null, 2)}
`, "utf8");
}
async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8").trim();
  return body ? JSON.parse(body) : {};
}
function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}
async function handleReviewStatusRequest({
  filePath,
  request,
  response
}) {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://storybook.local");
  if (method === "GET") {
    const file2 = await readReviewStatusFile(filePath);
    const storyId = url.searchParams.get("storyId");
    sendJson(response, 200, {
      entry: storyId ? file2.stories[storyId] ?? null : null,
      file: file2
    });
    return;
  }
  if (method !== "PUT" && method !== "PATCH" && method !== "POST") {
    sendJson(response, 405, { error: `Unsupported method ${method}.` });
    return;
  }
  const body = await readRequestBody(request);
  if (!isRecord(body) || typeof body.storyId !== "string") {
    sendJson(response, 400, { error: "storyId is required." });
    return;
  }
  const file = await readReviewStatusFile(filePath);
  const previous = file.stories[body.storyId];
  const entry = normalizeReviewEntry({
    ...previous,
    ...isRecord(body.entry) ? body.entry : {},
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  file.stories[body.storyId] = entry;
  await writeReviewStatusFile(filePath, file);
  sendJson(response, 200, { entry, file });
}
var RequestBodyError = class extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
  statusCode;
};
async function readRequestBodyLimited(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > VISUAL_COMMENT_LIMITS.maxRequestBytes) {
      throw new RequestBodyError("Request body exceeds 4 MiB.", 413);
    }
    chunks.push(buffer);
  }
  const value = Buffer.concat(chunks).toString("utf8").trim();
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    throw new RequestBodyError("Body must be valid JSON.", 400);
  }
}
function visualCommentSegments(basePath, requestUrl) {
  const url = new URL(requestUrl ?? "/", "http://storybook.local");
  const pathname = url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) : url.pathname;
  return {
    segments: pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        throw new RequestBodyError("Invalid URL path encoding.", 400);
      }
    }),
    url
  };
}
function sendVisualCommentError(response, error) {
  const storeError = error instanceof Error && "statusCode" in error && typeof error.statusCode === "number" && "code" in error && typeof error.code === "string";
  const statusCode = error instanceof RequestBodyError || storeError ? error.statusCode : 500;
  sendJson(response, statusCode, {
    error: error instanceof Error ? error.message : "Unknown visual comments error.",
    ...storeError ? {
      code: error.code,
      ..."activeMeeting" in error ? { activeMeeting: error.activeMeeting } : {}
    } : {}
  });
}
async function serveVisualCommentReport(response, store, segments) {
  let filePath = null;
  let contentType = "text/html; charset=utf-8";
  if (segments.length === 1 || segments.length === 2 && segments[1] === "index.html") {
    filePath = join2(store.root, "index.html");
  } else if (segments.length === 4 && segments[1] === "sessions" && /^[a-z0-9-]+$/.test(segments[2]) && segments[3] === "index.html") {
    filePath = join2(store.root, "sessions", segments[2], "index.html");
  } else if (segments.length === 5 && segments[1] === "sessions" && /^[a-z0-9-]+$/.test(segments[2]) && segments[3] === "assets" && /^[a-f0-9]{64}\.(?:png|webp)$/.test(segments[4])) {
    filePath = join2(store.root, "sessions", segments[2], "assets", segments[4]);
    contentType = segments[4].endsWith(".png") ? "image/png" : "image/webp";
  }
  if (!filePath) {
    sendJson(response, 404, { error: "Unknown report route." });
    return;
  }
  try {
    const content = await readFile2(filePath);
    response.statusCode = 200;
    response.setHeader("Content-Type", contentType);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.end(content);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      sendJson(response, 404, { error: "Report not found." });
      return;
    }
    throw error;
  }
}
async function handleVisualCommentsRequest({
  basePath,
  request,
  response,
  store
}) {
  try {
    const { segments, url } = visualCommentSegments(basePath, request.url);
    const method = request.method ?? "GET";
    if (method === "GET" && segments[0] === "reports") {
      await serveVisualCommentReport(response, store, segments);
      return;
    }
    if (method === "GET" && segments.length === 0) {
      const overview = await store.getOverview(url.searchParams.get("storyId") ?? void 0);
      sendJson(response, 200, {
        ...overview,
        reportUrl: `${basePath}/reports`,
        activeReportUrl: overview.activeSession ? `${basePath}/reports/sessions/${encodeURIComponent(overview.activeSession.id)}/index.html` : null
      });
      return;
    }
    if (method === "POST" && segments[0] === "sessions" && segments.length === 1) {
      const requestBody = await readRequestBodyLimited(request);
      sendJson(
        response,
        201,
        await store.startMeeting(isRecord(requestBody) ? requestBody.title : "")
      );
      return;
    }
    if (segments[0] !== "sessions" || !segments[1]) {
      sendJson(response, 404, { error: "Unknown visual comments route." });
      return;
    }
    const sessionId = segments[1];
    if (method === "GET" && segments.length === 2) {
      sendJson(response, 200, await store.getMeeting(sessionId));
      return;
    }
    if (method === "POST" && segments[2] === "close" && segments.length === 3) {
      sendJson(response, 200, await store.closeMeeting(sessionId));
      return;
    }
    if (method === "POST" && segments[2] === "comments" && segments.length === 3) {
      const result = await store.createComment(sessionId, await readRequestBodyLimited(request));
      sendJson(response, result.replay ? 200 : 201, result);
      return;
    }
    sendJson(response, 405, { error: `Unsupported visual comments method ${method}.` });
  } catch (error) {
    sendVisualCommentError(response, error);
  }
}
function createVisualCommentsHandler(options) {
  const basePath = options.basePath ?? defaultVisualCommentsApiPath;
  return (request, response) => {
    void handleVisualCommentsRequest({
      basePath,
      request,
      response,
      store: options.store
    });
  };
}
function sanitizePayloadStoryId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "");
}
function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "content-type");
}
function toPayloadSummary(storyId, payload) {
  const source = isRecord(payload) ? payload : {};
  return {
    componentTitle: typeof source.componentTitle === "string" ? source.componentTitle : "",
    generatedAt: typeof source.generatedAt === "string" ? source.generatedAt : "",
    storyId,
    storyName: typeof source.storyName === "string" ? source.storyName : ""
  };
}
async function listStoredPayloads(payloadDir) {
  let files = [];
  try {
    files = (await readdir2(payloadDir)).filter((file) => file.endsWith(".json"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
  const summaries = [];
  for (const file of files.sort()) {
    const storyId = file.slice(0, -".json".length);
    try {
      const raw = await readFile2(join2(payloadDir, file), "utf8");
      summaries.push(toPayloadSummary(storyId, JSON.parse(raw)));
    } catch {
    }
  }
  return summaries;
}
async function handleFigmaExportPayloadRequest({
  payloadDir,
  request,
  response
}) {
  setCorsHeaders(response);
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://storybook.local");
  const pathStoryId = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ""));
  if (method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }
  if (method === "POST") {
    let body;
    try {
      body = await readRequestBody(request);
    } catch {
      sendJson(response, 400, { error: "Body must be valid JSON." });
      return;
    }
    if (!isRecord(body) || typeof body.storyId !== "string" || !isRecord(body.root)) {
      sendJson(response, 400, {
        error: "Body must be a Figma export payload with storyId and root."
      });
      return;
    }
    const storyId2 = sanitizePayloadStoryId(body.storyId);
    if (!storyId2) {
      sendJson(response, 400, { error: "storyId sanitized to an empty value." });
      return;
    }
    await mkdir2(payloadDir, { recursive: true });
    await writeFile2(join2(payloadDir, `${storyId2}.json`), JSON.stringify(body), "utf8");
    sendJson(response, 201, { stored: true, storyId: storyId2 });
    return;
  }
  if (method !== "GET") {
    sendJson(response, 405, { error: `Unsupported method ${method}.` });
    return;
  }
  if (!pathStoryId) {
    sendJson(response, 200, await listStoredPayloads(payloadDir));
    return;
  }
  const storyId = sanitizePayloadStoryId(pathStoryId);
  if (!storyId) {
    sendJson(response, 400, { error: "storyId sanitized to an empty value." });
    return;
  }
  try {
    const raw = await readFile2(join2(payloadDir, `${storyId}.json`), "utf8");
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(raw);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      sendJson(response, 404, { error: `No stored payload for ${storyId}.` });
      return;
    }
    throw error;
  }
}
function createFigmaExportPayloadStoreHandler(options) {
  return (request, response) => {
    void handleFigmaExportPayloadRequest({
      payloadDir: options.payloadDir,
      request,
      response
    }).catch((error) => {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unknown payload store error."
      });
    });
  };
}
function createFigmaReviewStatusPlugin(options = {}) {
  const apiPath = options.apiPath ?? defaultFigmaReviewStatusApiPath;
  const filePath = resolve2(
    options.cwd ?? process.cwd(),
    options.filePath ?? "design-system/figma-export-review-status.json"
  );
  const payloadApiPath = options.payloadApiPath ?? defaultFigmaExportPayloadApiPath;
  const payloadDir = resolve2(
    options.cwd ?? process.cwd(),
    options.payloadDir ?? defaultFigmaExportPayloadDir
  );
  const commentsApiPath = options.commentsApiPath ?? defaultVisualCommentsApiPath;
  const commentsStore = createVisualCommentStore({
    cwd: options.cwd,
    commentsDir: options.commentsDir ?? defaultVisualCommentsDir
  });
  return {
    configureServer(server) {
      server.middlewares.use(apiPath, (request, response) => {
        void handleReviewStatusRequest({
          filePath,
          request,
          response
        }).catch((error) => {
          sendJson(response, 500, {
            error: error instanceof Error ? error.message : "Unknown review status error."
          });
        });
      });
      server.middlewares.use(
        payloadApiPath,
        createFigmaExportPayloadStoreHandler({ payloadDir })
      );
      if (options.commentsEnabled !== false) {
        server.middlewares.use(
          commentsApiPath,
          createVisualCommentsHandler({ basePath: commentsApiPath, store: commentsStore })
        );
      }
    },
    name: options.name ?? "figma-export-review-status-api"
  };
}
export {
  createFigmaExportPayloadStoreHandler,
  createFigmaReviewStatusPlugin,
  createVisualCommentsHandler,
  defaultFigmaExportPayloadApiPath,
  defaultFigmaExportPayloadDir,
  defaultFigmaReviewStatusApiPath,
  handleFigmaExportPayloadRequest,
  handleVisualCommentsRequest,
  sanitizePayloadStoryId
};
//# sourceMappingURL=review-server.js.map