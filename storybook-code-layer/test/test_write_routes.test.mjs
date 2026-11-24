import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { addon, loadPostcss, makeWorkspace } from "./helpers.mjs";

const { createApp } = await addon("server/app.mjs");
const { extendWithWrites } = await addon("server/write-routes.mjs");
const { API_BASE, SESSION_HEADER } = await addon("shared/api-contract.mjs");
const postcss = await loadPostcss();
const quiet = { info() {}, warn() {}, error() {} };
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

async function start() {
  const made = await makeWorkspace();
  const notified = [];
  const app = await createApp({
    projectRoot: made.projectRoot,
    configFile: made.configFile,
    servedRoots: [made.projectRoot],
    log: quiet,
    postcss,
    notifyChanged: (files) => notified.push(...files),
    extend: extendWithWrites,
  });
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    req.url = req.url.slice(API_BASE.length) || "/";
    void app.handle(req, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { ...made, app, server, port: server.address().port, notified };
}

function call(port, { method = "POST", path: route, body, headers = {}, raw = null, session }) {
  return new Promise((resolve, reject) => {
    const payload = raw ?? (body === undefined ? null : Buffer.from(JSON.stringify(body)));
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: `${API_BASE}${route}`,
        headers: {
          host: `localhost:${port}`,
          ...(method === "POST" ? { origin: `http://localhost:${port}`, "content-type": "application/json", "sec-fetch-site": "same-origin" } : {}),
          ...(session ? { [SESSION_HEADER]: session } : {}),
          ...(payload ? { "content-length": String(payload.length) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode, headers: res.headers, json: text ? JSON.parse(text) : null });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const declBatch = (batchId = "b-1") => ({
  schemaVersion: 1,
  batchId,
  indexRevision: "sha256:x",
  operations: [
    {
      id: "op-1",
      type: "rebind-declaration",
      file: "src/components/seal/Seal.css",
      rule: { ordinal: 0, selector: ".t-seal", atRules: [], occurrence: 0 },
      declaration: { property: "border-radius" },
      replacements: [{ refIndex: 0, fromToken: "--t-sys-shape-corner-sm", toToken: "--t-sys-shape-corner-md" }],
      fromToken: "--t-sys-shape-corner-sm",
      toToken: "--t-sys-shape-corner-md",
      before: { value: "var(--t-sys-shape-corner-sm)" },
      after: { value: "var(--t-sys-shape-corner-md)" },
    },
  ],
});

test("write routes: validate, apply, verification, undo through the guard", async () => {
  const ctx = await start();
  const css = path.join(ctx.ws, "sb/src/components/seal/Seal.css");
  const before = sha(css);
  try {
    const session = await call(ctx.port, { method: "GET", path: "/session" });
    assert.equal(session.json.capabilities.write, true);
    const token = session.json.session;

    const dry = await call(ctx.port, { path: "/validate", body: declBatch("b-dry"), session: token });
    assert.equal(dry.status, 200, JSON.stringify(dry.json));
    assert.equal(dry.json.dryRun, true);
    assert.equal(sha(css), before);

    const applied = await call(ctx.port, { path: "/apply", body: declBatch(), session: token });
    assert.equal(applied.status, 200, JSON.stringify(applied.json));
    assert.ok(fs.readFileSync(css, "utf8").includes("var(--t-sys-shape-corner-md)"));
    assert.equal(applied.headers["access-control-allow-origin"], undefined);

    const verified = await call(ctx.port, { path: `/applies/${applied.json.applyId}/verification`, body: { status: "verified", items: [{ id: "op-1", status: "verified" }] }, session: token });
    assert.equal(verified.status, 200);
    const badVerification = await call(ctx.port, { path: `/applies/${applied.json.applyId}/verification`, body: { status: "great" }, session: token });
    assert.equal(badVerification.status, 400);

    const state = await call(ctx.port, { method: "GET", path: "/state" });
    assert.equal(state.json.undoStack[0].applyId, applied.json.applyId);
    assert.equal(state.json.undoStack[0].verification.status, "verified");

    const undone = await call(ctx.port, { path: "/undo", body: { applyId: applied.json.applyId }, session: token });
    assert.equal(undone.status, 200, JSON.stringify(undone.json));
    assert.equal(sha(css), before);
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(ctx.notified.includes(css), "re-announced the component stylesheet");
  } finally {
    ctx.server.close();
  }
});

test("write routes refuse bad requests before reading or writing anything", async () => {
  const ctx = await start();
  const css = path.join(ctx.ws, "sb/src/components/seal/Seal.css");
  const before = sha(css);
  try {
    const token = (await call(ctx.port, { method: "GET", path: "/session" })).json.session;
    const cases = [
      [{ path: "/apply", body: declBatch() }, 401],
      [{ path: "/apply", body: declBatch(), session: "wrong" }, 401],
      [{ path: "/apply", body: declBatch(), session: token, headers: { "content-type": "text/plain" } }, 415],
      [{ path: "/apply", body: declBatch(), session: token, headers: { origin: "http://localhost:3000" } }, 403],
      [{ path: "/apply", body: declBatch(), session: token, headers: { "sec-fetch-site": "same-site" } }, 403],
      [{ path: "/apply", body: declBatch(), session: token, headers: { "x-forwarded-for": "10.0.0.1" } }, 403],
      [{ path: "/apply", body: declBatch(), session: token, headers: { host: `192.168.1.5:${ctx.port}` } }, 403],
      [{ path: "/apply", raw: Buffer.alloc(300 * 1024, 32), session: token }, 413],
      [{ path: "/apply", body: { ...declBatch(), dryRun: true }, session: token }, 400],
      [{ path: "/undo", body: { applyId: "../../x" }, session: token }, 400],
      [{ path: "/undo", body: { applyId: "nothing-here" }, session: token }, 409],
      [{ path: "/undo/skip", body: {}, session: token }, 400],
    ];
    for (const [request, status] of cases) {
      const response = await call(ctx.port, request);
      assert.equal(response.status, status, `${JSON.stringify(request.headers ?? {})} ${request.path} -> ${JSON.stringify(response.json)}`);
    }
    const noOrigin = await new Promise((resolve) => {
      const req = http.request({ host: "127.0.0.1", port: ctx.port, method: "POST", path: `${API_BASE}/apply`, headers: { host: `localhost:${ctx.port}`, "content-type": "application/json", [SESSION_HEADER]: token } }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      req.end(JSON.stringify(declBatch()));
    });
    assert.equal(noOrigin, 403, "POST without Origin");
    assert.equal(sha(css), before, "nothing written");
  } finally {
    ctx.server.close();
  }
});
