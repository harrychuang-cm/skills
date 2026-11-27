import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { FIXTURE_FILES, addon, loadPostcss, makeWorkspace } from "./helpers.mjs";

const { createApp } = await addon("server/app.mjs");
const { extendWithWrites } = await addon("server/write-routes.mjs");
const { API_BASE, SESSION_HEADER } = await addon("shared/api-contract.mjs");
const postcss = await loadPostcss();
const quiet = { info() {}, warn() {}, error() {} };
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

async function start(options = {}) {
  const made = await makeWorkspace(options);
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

test("the session route says which server instance answers and which manager build it serves; the state route names the same instance", async () => {
  const first = await start();
  const second = await start();
  try {
    const a = (await call(first.port, { method: "GET", path: "/session" })).json;
    const b = (await call(second.port, { method: "GET", path: "/session" })).json;
    assert.match(a.instance, /^[A-Za-z0-9_-]{6,}$/);
    assert.match(a.build, /^[0-9a-f]{16}$/);
    // A restarted server is another instance with another session; the same code is the same build.
    assert.notEqual(a.instance, b.instance);
    assert.notEqual(a.session, b.session);
    assert.equal(a.build, b.build);
    assert.equal((await call(first.port, { method: "GET", path: "/state" })).json.instance, a.instance);
    assert.ok(!JSON.stringify((await call(first.port, { method: "GET", path: "/state" })).json).includes(a.session), "the state route never carries the session");
    // A write with the other server's session is refused before anything is read, with the code the page reacts to.
    const refused = await call(first.port, { method: "POST", path: "/validate", session: b.session, body: {} });
    assert.deepEqual([refused.status, refused.json.error.code], [401, "session-required"]);
  } finally {
    first.server.close();
    second.server.close();
  }
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

test("POST /undo/reverse: guarded like every write route; reverses the latest apply after a conflicting edit", async () => {
  const ctx = await start();
  const css = path.join(ctx.ws, "sb/src/components/seal/Seal.css");
  const original = fs.readFileSync(css, "utf8");
  try {
    const token = (await call(ctx.port, { method: "GET", path: "/session" })).json.session;
    const applied = await call(ctx.port, { path: "/apply", body: declBatch("b-rev"), session: token });
    assert.equal(applied.status, 200, JSON.stringify(applied.json));
    fs.writeFileSync(css, fs.readFileSync(css, "utf8").replace("/* seal — 昭和 */", "/* seal — edited */"));
    const afterEdit = sha(css);

    const conflict = await call(ctx.port, { path: "/undo", body: { applyId: applied.json.applyId }, session: token });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.json.error.code, "undo-conflict");
    assert.equal(conflict.json.error.details.canReverse, true);

    for (const [request, status] of [
      [{ path: "/undo/reverse", body: { applyId: applied.json.applyId } }, 401],
      [{ path: "/undo/reverse", body: { applyId: applied.json.applyId }, session: token, headers: { origin: "http://localhost:3000" } }, 403],
      [{ path: "/undo/reverse", body: { applyId: applied.json.applyId }, session: token, headers: { "content-type": "text/plain" } }, 415],
      [{ path: "/undo/reverse", body: { applyId: "../x" }, session: token }, 400],
      [{ path: "/undo/reverse", body: { applyId: applied.json.applyId, force: true }, session: token }, 400],
      [{ path: "/undo/reverse", body: { applyId: "20260101-000000-apply-abcdef" }, session: token }, 409],
      [{ method: "GET", path: "/undo/reverse" }, 404],
    ]) {
      const response = await call(ctx.port, request);
      assert.equal(response.status, status, `${request.path} ${JSON.stringify(request.headers ?? {})} -> ${JSON.stringify(response.json)}`);
    }
    assert.equal(sha(css), afterEdit, "refused requests wrote nothing");

    const reversed = await call(ctx.port, { path: "/undo/reverse", body: { applyId: applied.json.applyId }, session: token });
    assert.equal(reversed.status, 200, JSON.stringify(reversed.json));
    assert.equal(reversed.json.mode, "reverse");
    assert.equal(reversed.json.undone, applied.json.applyId);
    assert.equal(fs.readFileSync(css, "utf8"), original.replace("/* seal — 昭和 */", "/* seal — edited */"));
    assert.equal(reversed.headers["access-control-allow-origin"], undefined);
    const state = await call(ctx.port, { method: "GET", path: "/state" });
    assert.deepEqual(state.json.undoStack, []);
  } finally {
    ctx.server.close();
  }
});

test("POST /sync-mirror: a dry run lists what would be overwritten; the real one copies the source of truth, backs up the mirror and journals it", async () => {
  // The mirror of the component tier is one line behind its source of truth.
  const staleMirror = FIXTURE_FILES["tokens/tokens-comp.css"].replace("--t-comp-seal-shape: var(--t-sys-shape-corner-sm);", "--t-comp-seal-shape: var(--t-sys-shape-corner-md);");
  const ctx = await start({ files: { "sb/tokens/tokens-comp.css": staleMirror } });
  const truth = path.join(ctx.ws, "tokens/tokens-comp.css");
  const mirror = path.join(ctx.ws, "sb/tokens/tokens-comp.css");
  const journalFile = path.join(ctx.config.stateDir, "journal.jsonl");
  const journal = () => (fs.existsSync(journalFile) ? fs.readFileSync(journalFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  try {
    const token = (await call(ctx.port, { method: "GET", path: "/session" })).json.session;
    const drifting = (await call(ctx.port, { method: "GET", path: "/state" })).json.mirrors.filter((m) => !m.inSync);
    assert.equal(drifting.length, 1);
    assert.deepEqual([drifting[0].id, drifting[0].source, drifting[0].mirror, drifting[0].diffLines], ["tokens:comp", "tokens/tokens-comp.css", "sb/tokens/tokens-comp.css", 1]);
    assert.match(drifting[0].sourceModified, /^\d{4}-\d\d-\d\dT/);
    assert.match(drifting[0].mirrorModified, /^\d{4}-\d\d-\d\dT/);

    const refused = await call(ctx.port, { path: "/apply", body: declBatch("b-drift"), session: token });
    assert.equal(refused.status, 409);
    assert.equal(refused.json.error.code, "mirror-drift");
    assert.deepEqual(Object.keys(refused.json.error.details.mirrors[0]).sort(), ["diffLines", "id", "inSync", "mirror", "mirrorModified", "source", "sourceModified"]);

    const mirrorBefore = sha(mirror);
    for (const [request, status] of [
      [{ path: "/sync-mirror", body: { dryRun: true } }, 401],
      [{ path: "/sync-mirror", body: {}, session: token }, 400],
      [{ path: "/sync-mirror", body: { dryRun: "yes" }, session: token }, 400],
      [{ path: "/sync-mirror", body: { dryRun: false, reverse: true }, session: token }, 400],
      [{ path: "/sync-mirror", body: { dryRun: false }, session: token, headers: { origin: "http://localhost:3000" } }, 403],
    ]) {
      const response = await call(ctx.port, request);
      assert.equal(response.status, status, `${JSON.stringify(request.body)} -> ${JSON.stringify(response.json)}`);
    }

    const dry = await call(ctx.port, { path: "/sync-mirror", body: { dryRun: true }, session: token });
    assert.equal(dry.status, 200, JSON.stringify(dry.json));
    assert.equal(dry.json.dryRun, true);
    assert.deepEqual(dry.json.changed, ["sb/tokens/tokens-comp.css"]);
    assert.deepEqual(dry.json.files.map((f) => [f.mirror, f.source, f.diffLines]), [["sb/tokens/tokens-comp.css", "tokens/tokens-comp.css", 1]]);
    assert.equal(sha(mirror), mirrorBefore, "a dry run writes nothing");
    assert.deepEqual(journal(), [], "and journals nothing");

    const synced = await call(ctx.port, { path: "/sync-mirror", body: { dryRun: false }, session: token });
    assert.equal(synced.status, 200, JSON.stringify(synced.json));
    assert.deepEqual(synced.json.changed, ["sb/tokens/tokens-comp.css"]);
    assert.ok(fs.readFileSync(mirror).equals(fs.readFileSync(truth)), "the mirror equals the source of truth");
    assert.equal(fs.readFileSync(truth, "utf8"), FIXTURE_FILES["tokens/tokens-comp.css"], "the source of truth is never written");
    const records = journal();
    assert.deepEqual(records.map((r) => [r.type, r.applyId]), [["pending", synced.json.applyId], ["committed", synced.json.applyId]]);
    assert.equal(records[0].kind, "sync-mirror");
    assert.equal(fs.readFileSync(path.join(ctx.config.stateDir, records[0].files[0].backup), "utf8"), staleMirror, "the previous mirror content is in a backup");
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(ctx.notified.includes(mirror), "the watcher is told about the rewritten mirror");

    const state = (await call(ctx.port, { method: "GET", path: "/state" })).json;
    assert.ok(state.mirrors.every((m) => m.inSync));
    assert.deepEqual(state.undoStack, [], "a synchronisation is not an apply to undo");
    const accepted = await call(ctx.port, { path: "/apply", body: declBatch("b-after-sync"), session: token });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.json));
    const again = await call(ctx.port, { path: "/sync-mirror", body: { dryRun: false }, session: token });
    assert.deepEqual([again.status, again.json.changed], [200, []]);
  } finally {
    ctx.server.close();
  }
});

test("POST /pending-docs/resolve: guarded; the state route lists pending entries until they are marked done", async () => {
  const ctx = await start({ fixture: "v1", config: { governance: { componentSpecsDir: "../design-system/components" } } });
  try {
    const token = (await call(ctx.port, { method: "GET", path: "/session" })).json.session;
    const body = {
      schemaVersion: 1,
      batchId: "b-pending",
      indexRevision: "sha256:x",
      operations: [{ id: "op-1", type: "rebind-token", token: "--fx-comp-seal-container-color", fromToken: "--fx-sys-color-primary", toToken: "--fx-sys-color-secondary", before: { value: "var(--fx-sys-color-primary)" }, after: { value: "var(--fx-sys-color-secondary)" } }],
    };
    const applied = await call(ctx.port, { path: "/apply", body, session: token });
    assert.equal(applied.status, 200, JSON.stringify(applied.json));
    assert.deepEqual(applied.json.documents.map((d) => d.file), ["design-system/components/seal.md"]);
    const listed = (await call(ctx.port, { method: "GET", path: "/state" })).json;
    assert.deepEqual(listed.pendingDocs.map((e) => e.id), applied.json.pending.map((e) => e.id));
    assert.equal(listed.governance.drift.rows, 1);
    assert.ok(!JSON.stringify(listed.pendingDocs).includes(ctx.ws), "entries carry workspace-relative paths only");

    const ids = applied.json.pending.map((e) => e.id);
    for (const [request, status] of [
      [{ path: "/pending-docs/resolve", body: { ids: [ids[0]] } }, 401],
      [{ path: "/pending-docs/resolve", body: {}, session: token }, 400],
      [{ path: "/pending-docs/resolve", body: { ids: [] }, session: token }, 400],
      [{ path: "/pending-docs/resolve", body: { ids: ["../x"] }, session: token }, 400],
      [{ path: "/pending-docs/resolve", body: { ids: [ids[0]], all: true }, session: token }, 400],
      [{ path: "/pending-docs/resolve", body: { ids: [ids[0]] }, session: token, headers: { origin: "http://localhost:3000" } }, 403],
    ]) {
      const response = await call(ctx.port, request);
      assert.equal(response.status, status, `${JSON.stringify(request.body)} -> ${JSON.stringify(response.json)}`);
    }
    const resolved = await call(ctx.port, { path: "/pending-docs/resolve", body: { ids: [ids[0]] }, session: token });
    assert.equal(resolved.status, 200, JSON.stringify(resolved.json));
    assert.deepEqual(resolved.json.resolved, [ids[0]]);
    assert.deepEqual(resolved.json.pendingDocs.map((e) => e.id), ids.slice(1));
    const after = (await call(ctx.port, { method: "GET", path: "/state" })).json;
    assert.deepEqual(after.pendingDocs.map((e) => e.id), ids.slice(1));

    const undone = await call(ctx.port, { path: "/undo", body: { applyId: applied.json.applyId }, session: token });
    assert.equal(undone.status, 200);
    assert.deepEqual((await call(ctx.port, { method: "GET", path: "/state" })).json.pendingDocs, []);
  } finally {
    ctx.server.close();
  }
});

test("GET /applies/:id reports a transaction, including its post-apply round once it has finished", async () => {
  const ctx = await start({
    fixture: "v1",
    files: { "gen/touch.mjs": 'import fs from "node:fs";\nfs.appendFileSync(process.argv[2], "x");\n', "derived/.keep": "" },
    config: (ws) => ({ postApply: [{ id: "touch", command: "node", args: [path.join(ws, "gen/touch.mjs"), path.join(ws, "derived/out.txt")], cwd: "..", writes: ["../derived"] }] }),
  });
  try {
    const token = (await call(ctx.port, { method: "GET", path: "/session" })).json.session;
    const body = {
      schemaVersion: 1,
      batchId: "b-report",
      indexRevision: "sha256:x",
      operations: [{ id: "op-1", type: "rebind-token", token: "--fx-comp-seal-shape", fromToken: "--fx-sys-shape-corner-sm", toToken: "--fx-sys-shape-corner-md", before: { value: "var(--fx-sys-shape-corner-sm)" }, after: { value: "var(--fx-sys-shape-corner-md)" } }],
    };
    const applied = await call(ctx.port, { path: "/apply", body, session: token });
    assert.equal(applied.status, 200, JSON.stringify(applied.json));
    assert.equal(applied.json.postApply.status, "queued");
    await ctx.app.engine.postApply.idle();
    const report = await call(ctx.port, { method: "GET", path: `/applies/${applied.json.applyId}` });
    assert.equal(report.status, 200, JSON.stringify(report.json));
    assert.deepEqual([report.json.applyId, report.json.kind, report.json.postApply.status, report.json.postApply.stale], [applied.json.applyId, "apply", "done", false]);
    assert.deepEqual(report.json.postApply.results.map((r) => [r.id, r.ok]), [["touch", true]]);
    assert.deepEqual(report.json.files, [{ file: "tokens/tokens-comp.css", role: "token-source" }, { file: "sb/tokens/tokens-comp.css", role: "token-mirror" }]);
    assert.ok(!JSON.stringify(report.json).includes(ctx.ws), "no absolute path in the report");
    assert.equal(fs.readFileSync(path.join(ctx.ws, "derived/out.txt"), "utf8"), "x");
    assert.equal((await call(ctx.port, { method: "GET", path: "/applies/20260101-000000-apply-ffffff" })).status, 404);
    assert.equal((await call(ctx.port, { method: "GET", path: "/applies/..%2Fx" })).status, 400);
    assert.equal((await call(ctx.port, { method: "GET", path: `/applies/${applied.json.applyId}`, headers: { origin: "http://localhost:3000" } })).status, 403);
    assert.deepEqual((await call(ctx.port, { method: "GET", path: "/state" })).json.postApply.commands, ["touch"]);
  } finally {
    ctx.server.close();
  }
});

test("write routes refuse the operation that restores a literal: only a reverse apply builds it", async () => {
  const ctx = await start();
  const css = path.join(ctx.ws, "sb/src/components/seal/Seal.css");
  const before = sha(css);
  try {
    const token = (await call(ctx.port, { method: "GET", path: "/session" })).json.session;
    const operations = [{ id: "op-1", type: "restore-literal", file: "src/components/seal/Seal.css", rule: { ordinal: 0, selector: ".fx-seal", atRules: [], occurrence: 0 }, declaration: { property: "background" }, component: 0, fromToken: "--fx-comp-seal-container-color", literal: "red", before: { value: "var(--fx-comp-seal-container-color)" }, after: { value: "red" } }];
    for (const route of ["/validate", "/apply"]) {
      const response = await call(ctx.port, { path: route, body: { schemaVersion: 1, batchId: `restore-${route.slice(1)}`, indexRevision: "sha256:test", operations }, session: token });
      assert.deepEqual([response.status, response.json.error?.code], [400, "schema-invalid"], route);
    }
    assert.equal(sha(css), before);
  } finally {
    await new Promise((resolve) => ctx.server.close(resolve));
  }
});
