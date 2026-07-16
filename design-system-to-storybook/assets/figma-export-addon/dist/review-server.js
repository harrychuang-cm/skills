// src/review-server.ts
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
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
    const raw = await readFile(reviewStatusFilePath, "utf8");
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
  await mkdir(dirname(reviewStatusFilePath), { recursive: true });
  await writeFile(reviewStatusFilePath, `${JSON.stringify(file, null, 2)}
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
    files = (await readdir(payloadDir)).filter((file) => file.endsWith(".json"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
  const summaries = [];
  for (const file of files.sort()) {
    const storyId = file.slice(0, -".json".length);
    try {
      const raw = await readFile(join(payloadDir, file), "utf8");
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
    await mkdir(payloadDir, { recursive: true });
    await writeFile(join(payloadDir, `${storyId2}.json`), JSON.stringify(body), "utf8");
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
    const raw = await readFile(join(payloadDir, `${storyId}.json`), "utf8");
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
  const filePath = resolve(
    options.cwd ?? process.cwd(),
    options.filePath ?? "design-system/figma-export-review-status.json"
  );
  const payloadApiPath = options.payloadApiPath ?? defaultFigmaExportPayloadApiPath;
  const payloadDir = resolve(
    options.cwd ?? process.cwd(),
    options.payloadDir ?? defaultFigmaExportPayloadDir
  );
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
    },
    name: options.name ?? "figma-export-review-status-api"
  };
}
export {
  createFigmaExportPayloadStoreHandler,
  createFigmaReviewStatusPlugin,
  defaultFigmaExportPayloadApiPath,
  defaultFigmaExportPayloadDir,
  defaultFigmaReviewStatusApiPath,
  handleFigmaExportPayloadRequest,
  sanitizePayloadStoryId
};
//# sourceMappingURL=review-server.js.map