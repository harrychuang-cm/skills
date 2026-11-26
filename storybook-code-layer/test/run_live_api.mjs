#!/usr/bin/env node
// Stage 10: drive the write API of a running Storybook with plain HTTP.
//   CODE_LAYER_TEST_PROJECT=<storybook root> node test/run_live_api.mjs [--log <storybook log>]
// Writes the two demo changes to the real files, checks them, and undoes
// them; every refusal case must leave the files untouched.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";

import { testProject } from "./helpers.mjs";

const PORT = Number(process.env.STORYBOOK_PORT ?? 6006);
const API = "/__code-layer";
const project = testProject();
const lab = path.dirname(project);
const args = process.argv.slice(2);
const logFile = args.includes("--log") ? args[args.indexOf("--log") + 1] : null;
const files = {
  truth: path.join(lab, "tokens/tokens-comp.css"),
  mirror: path.join(project, "tokens/tokens-comp.css"),
  css: path.join(project, "src/components/badge-seal/BadgeSeal.css"),
};
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const hashes = () => Object.fromEntries(Object.entries(files).map(([k, f]) => [k, sha(f)]));
const results = [];

function request({ method = "GET", route, body, headers = {}, raw = null, host = `localhost:${PORT}`, family = 4 }) {
  return new Promise((resolve, reject) => {
    const payload = raw ?? (body === undefined ? null : Buffer.from(JSON.stringify(body)));
    const req = http.request(
      { host: family === 6 ? "::1" : "127.0.0.1", family, port: PORT, method, path: `${API}${route}`, headers: { host, ...(payload ? { "content-length": String(payload.length) } : {}), ...headers } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text.slice(0, 200) };
          }
          resolve({ status: res.statusCode, headers: res.headers, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const post = (route, body, session, extra = {}) =>
  request({ method: "POST", route, body, headers: { origin: `http://localhost:${PORT}`, "content-type": "application/json", "sec-fetch-site": "same-origin", ...(session ? { "x-code-layer-session": session } : {}), ...extra } });

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    process.stdout.write(`✔ ${name}${detail ? ` — ${detail}` : ""}\n`);
  } catch (error) {
    results.push({ name, ok: false });
    process.stdout.write(`✖ ${name}\n    ${error.message.split("\n").join("\n    ")}\n`);
  }
}

function buildBatch(index, batchId, overrides = {}) {
  const token = index.tokens.items.find((t) => t.name === "--md-comp-badge-seal-hanko-container-color");
  const file = index.css.files.find((f) => f.file === "src/components/badge-seal/BadgeSeal.css");
  const rule = file.rules[7];
  const decl = rule.declarations.find((d) => d.property === "border-radius");
  return {
    schemaVersion: 1,
    batchId,
    indexRevision: index.revision,
    operations: [
      {
        id: "fill",
        type: "rebind-token",
        token: token.name,
        fromToken: token.alias,
        toToken: "--md-sys-color-secondary",
        before: { value: token.declaredValue },
        after: { value: "var(--md-sys-color-secondary)" },
        reason: { storyId: "components-marks-badge-seal--hanko", element: "Badge Seal / hanko", cssProperty: "background-color" },
      },
      {
        id: "radius",
        type: "rebind-declaration",
        file: file.file,
        rule: { ordinal: rule.ordinal, selector: rule.selector, atRules: rule.atRules, occurrence: rule.occurrence },
        declaration: { property: "border-radius" },
        replacements: [{ refIndex: 0, fromToken: overrides.radiusFrom ?? decl.refs[0].name, toToken: "--md-sys-shape-corner-md" }],
        fromToken: overrides.radiusFrom ?? decl.refs[0].name,
        toToken: "--md-sys-shape-corner-md",
        before: { value: overrides.radiusBefore ?? decl.value },
        after: { value: "var(--md-sys-shape-corner-md)" },
      },
    ],
  };
}

function diffLines(a, b) {
  const left = a.split("\n");
  const right = b.split("\n");
  const out = [];
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) if (left[i] !== right[i]) out.push({ line: i + 1, before: left[i], after: right[i] });
  return out;
}

const withoutStamp = (html) => html.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<generated>");

async function main() {
  // With a component specification directory in the binding, a token re-bind also rewrites the Token Contract row.
  const governed = (await request({ route: "/state" })).json.governance?.componentSpecsDir ?? null;
  const specFile = governed ? path.join(lab, governed, "badge-seal.md") : null;
  if (specFile && fs.existsSync(specFile)) files.spec = specFile;
  // Documents the binding's post-apply commands regenerate (timestamped): put back at the end.
  const generated = ["docs/design-system/index.html", "docs/design-system/review.html"].map((relative) => path.join(lab, relative)).filter((file) => fs.existsSync(file)).map((file) => ({ file, bytes: fs.readFileSync(file) }));
  const start = hashes();
  const originals = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, fs.readFileSync(f, "utf8")]));
  const logStart = logFile ? fs.statSync(logFile).size : 0;
  const session = (await request({ route: "/session" })).json;
  const index = (await request({ route: "/index" })).json;
  // What the project already has applied stays where it is: the run only compares against it.
  const stackBefore = (await request({ route: "/state" })).json.undoStack.map((entry) => entry.applyId);

  await check("10.1 session reports writes enabled; baseline checks pass", async () => {
    assert.equal(session.capabilities.write, true);
    const state = (await request({ route: "/state" })).json;
    assert.equal(state.baseline?.ok, true, JSON.stringify(state.baseline));
    return state.baseline.results.map((r) => `${r.id}=${r.ok}`).join(" ");
  });

  await check("10.2 validate (dry run) plans one edit per file and writes nothing", async () => {
    const plan = await post("/validate", buildBatch(index, "live-dry"), session.session);
    assert.equal(plan.status, 200, JSON.stringify(plan.json));
    assert.deepEqual(plan.json.files.map((f) => [f.file, f.role, f.edits.map((e) => e.line)]), [
      ["tokens/tokens-comp.css", "token-source", [54]],
      ...(files.spec ? [[`${governed}/badge-seal.md`, "spec", [54]]] : []),
      ["storybook/tokens/tokens-comp.css", "token-mirror", [54]],
      ["storybook/src/components/badge-seal/BadgeSeal.css", "component-css", [60]],
    ]);
    assert.deepEqual(hashes(), start);
  });

  const refusals = [
    ["wrong Origin", () => post("/apply", buildBatch(index, "r1"), session.session, { origin: "http://localhost:3000" }), 403],
    ["LAN Host", () => request({ method: "POST", route: "/apply", body: buildBatch(index, "r2"), host: `192.168.204.77:${PORT}`, headers: { origin: `http://192.168.204.77:${PORT}`, "content-type": "application/json", "x-code-layer-session": session.session } }), 403],
    ["no session", () => post("/apply", buildBatch(index, "r3"), null), 401],
    ["text/plain", () => post("/apply", buildBatch(index, "r4"), session.session, { "content-type": "text/plain" }), 415],
    ["300 KB body", () => request({ method: "POST", route: "/apply", raw: Buffer.alloc(300 * 1024, 32), headers: { origin: `http://localhost:${PORT}`, "content-type": "application/json", "x-code-layer-session": session.session } }), 413],
    ["stale before", () => post("/apply", buildBatch(index, "r6", { radiusFrom: "--md-sys-shape-corner-full", radiusBefore: "var(--md-sys-shape-corner-full)" }), session.session), 409],
    ["before not referencing fromToken", () => post("/apply", buildBatch(index, "r8", { radiusBefore: "var(--md-sys-shape-corner-full)" }), session.session), 400],
    ["X-Forwarded-For", () => post("/apply", buildBatch(index, "r7"), session.session, { "x-forwarded-for": "203.0.113.9" }), 403],
  ];
  await check("10.3 refusals are rejected before anything is written", async () => {
    const seen = [];
    for (const [name, send, status] of refusals) {
      const response = await send();
      assert.equal(response.status, status, `${name}: ${JSON.stringify(response.json)}`);
      seen.push(`${name}=${response.status}`);
    }
    assert.deepEqual(hashes(), start);
    return seen.join(" ");
  });

  await check("10.4 CORS preflight is answered upstream (expected); other origins cannot read /session", async () => {
    const preflight = await request({ method: "OPTIONS", route: "/apply", headers: { origin: "http://localhost:3000", "access-control-request-method": "POST", "access-control-request-headers": "content-type,x-code-layer-session" } });
    const cross = await request({ route: "/session", headers: { origin: "http://localhost:3000" } });
    assert.equal(cross.status, 403);
    assert.equal(cross.headers["access-control-allow-origin"], undefined);
    return `OPTIONS → ${preflight.status} (Vite cors, recorded); cross-origin GET /session → ${cross.status}`;
  });

  await check("10.5 loopback over IPv4 and IPv6", async () => {
    const v4 = await request({ route: "/session" });
    const v6 = await request({ route: "/session", family: 6, host: `[::1]:${PORT}` });
    assert.equal(v4.status, 200);
    assert.equal(v6.status, 200);
  });

  let applyId = null;
  await check("10.6 apply writes the source of truth, the mirror and the component CSS, one line each", async () => {
    const applied = await post("/apply", buildBatch(index, "live-apply"), session.session);
    assert.equal(applied.status, 200, JSON.stringify(applied.json));
    applyId = applied.json.applyId;
    assert.ok(fs.readFileSync(files.truth).equals(fs.readFileSync(files.mirror)), "mirror equals source of truth");
    const truthDiff = diffLines(originals.truth, fs.readFileSync(files.truth, "utf8"));
    const cssDiff = diffLines(originals.css, fs.readFileSync(files.css, "utf8"));
    assert.deepEqual(truthDiff.map((d) => d.line), [54]);
    assert.deepEqual(cssDiff.map((d) => d.line), [60]);
    assert.equal(truthDiff[0].after, "  --md-comp-badge-seal-hanko-container-color: var(--md-sys-color-secondary);");
    assert.equal(cssDiff[0].after, "  border-radius: var(--md-sys-shape-corner-md);");
    return `${applyId}; ${truthDiff[0].after.trim()} | ${cssDiff[0].after.trim()}`;
  });

  await check("10.7 the dev server hot-updated the stylesheets without a full reload", async () => {
    if (!logFile) return "skipped (no --log)";
    await new Promise((r) => setTimeout(r, 1500));
    const text = fs.readFileSync(logFile).subarray(logStart).toString("utf8").replace(/\x1b\[[0-9;]*m/g, "");
    assert.ok(!/page reload/i.test(text), "a full page reload was logged");
    assert.match(text, /\[code-layer\] applied/);
    return "no full reload logged";
  });

  await check("10.8 undo restores the exact bytes of every written file", async () => {
    const undone = await post("/undo", { applyId }, session.session);
    assert.equal(undone.status, 200, JSON.stringify(undone.json));
    assert.deepEqual(hashes(), start);
    const state = (await request({ route: "/state" })).json;
    assert.deepEqual(state.undoStack.map((entry) => entry.applyId), stackBefore, "the undo stack is what it was before the run");
  });

  // ---- layout: a keyword replaced and a declaration added, through the same routes ----
  const layoutBatch = (batchId, { keyword = "space-between", wrap = "wrap" } = {}) => {
    const file = index.css.files.find((f) => f.file === "src/components/badge-seal/BadgeSeal.css");
    const rule = file.rules[0];
    const locator = { ordinal: rule.ordinal, selector: rule.selector, atRules: rule.atRules, occurrence: rule.occurrence };
    const justify = rule.declarations.find((d) => d.property === "justify-content");
    return {
      schemaVersion: 1,
      batchId,
      indexRevision: index.revision,
      operations: [
        { id: "justify", type: "set-keyword", file: file.file, rule: locator, declaration: { property: "justify-content" }, component: 0, fromKeyword: justify.value, toKeyword: keyword, before: { value: justify.value }, after: { value: keyword } },
        { id: "wrap", type: "add-declaration", file: file.file, rule: locator, declaration: { property: "flex-wrap" }, toKeyword: wrap, after: { value: wrap } },
      ],
    };
  };

  await check("10.9 layout operations: validate plans a replaced keyword and an inserted line and writes nothing; refusals write nothing", async () => {
    const plan = await post("/validate", layoutBatch("live-layout-dry"), session.session);
    assert.equal(plan.status, 200, JSON.stringify(plan.json));
    assert.deepEqual(plan.json.results.map((r) => [r.type, r.slot, r.fromKeyword, r.toKeyword]), [["set-keyword", "justify-content", "center", "space-between"], ["add-declaration", "flex-wrap", null, "wrap"]]);
    assert.deepEqual(plan.json.files.map((file) => [file.role, file.edits.length]), [["component-css", 2]]);
    const refusals = [
      ["a keyword outside the list", layoutBatch("live-layout-r1", { keyword: "start" }), 422, "keyword-not-allowed"],
      ["a second keyword", layoutBatch("live-layout-r2", { keyword: "safe center" }), 422, "keyword-not-allowed"],
      ["wrap-reverse", layoutBatch("live-layout-r3", { wrap: "wrap-reverse" }), 422, "keyword-not-allowed"],
    ];
    for (const [label, body, status, code] of refusals) {
      const response = await post("/apply", body, session.session);
      assert.deepEqual([response.status, response.json.error?.code], [status, code], label);
    }
    // A rule that does not declare flex cannot take a layout declaration; the internal removal cannot be sent at all.
    const file = index.css.files.find((f) => f.file === "src/components/badge-seal/BadgeSeal.css");
    const plain = file.rules.find((rule) => !rule.declarations.some((d) => d.property === "display"));
    const locator = { ordinal: plain.ordinal, selector: plain.selector, atRules: plain.atRules, occurrence: plain.occurrence };
    const notFlex = await post("/apply", { schemaVersion: 1, batchId: "live-layout-r4", indexRevision: index.revision, operations: [{ id: "x", type: "add-declaration", file: file.file, rule: locator, declaration: { property: "flex-wrap" }, toKeyword: "wrap", after: { value: "wrap" } }] }, session.session);
    assert.deepEqual([notFlex.status, notFlex.json.error?.code], [422, "rule-not-eligible"]);
    const removal = await post("/apply", { schemaVersion: 1, batchId: "live-layout-r5", indexRevision: index.revision, operations: [{ id: "x", type: "remove-declaration", file: file.file, rule: locator, declaration: { property: "color" }, fromKeyword: "red", inserted: "\n  color: red;" }] }, session.session);
    assert.deepEqual([removal.status, removal.json.error?.code], [400, "schema-invalid"]);
    assert.deepEqual(hashes(), start, "nothing was written");
    return `${refusals.length + 2} refusals; rule without display: ${plain.selector}`;
  });

  await check("10.10 layout operations: apply writes one stylesheet, undo restores its exact bytes", async () => {
    const applied = await post("/apply", layoutBatch("live-layout-apply"), session.session);
    assert.equal(applied.status, 200, JSON.stringify(applied.json));
    const now = fs.readFileSync(files.css, "utf8");
    assert.equal(now, originals.css.replace("  justify-content: center;\n  min-inline-size", "  justify-content: space-between;\n  min-inline-size").replace("  text-align: center;\n}", "  text-align: center;\n  flex-wrap: wrap;\n}"));
    assert.deepEqual(Object.entries(hashes()).filter(([key, value]) => value !== start[key]).map(([key]) => key), ["css"], "only the component stylesheet changed");
    assert.deepEqual(applied.json.pending.map((e) => [e.kind, e.property, e.oldValue, e.newValue]), [["declaration", "justify-content", "center", "space-between"], ["declaration", "flex-wrap", null, "wrap"]]);
    const undone = await post("/undo", { applyId: applied.json.applyId }, session.session);
    assert.equal(undone.status, 200, JSON.stringify(undone.json));
    assert.deepEqual(hashes(), start);
    const state = (await request({ route: "/state" })).json;
    assert.deepEqual(state.undoStack.map((entry) => entry.applyId), stackBefore, "the undo stack is what it was before the run");
    return applied.json.applyId;
  });

  const failed = results.filter((r) => !r.ok);
  if (JSON.stringify(hashes()) !== JSON.stringify(start)) {
    process.stdout.write("!! files differ from the start of this run; restoring from the in-memory originals\n");
    for (const [key, file] of Object.entries(files)) fs.writeFileSync(file, originals[key]);
  }
  // Regenerated documents differ from the start only in their timestamp: put the exact bytes back.
  for (let i = 0; i < 120 && (await request({ route: "/state" })).json.postApply?.running; i += 1) await new Promise((resolve) => setTimeout(resolve, 250));
  for (const { file, bytes } of generated) {
    const now = fs.readFileSync(file);
    if (now.equals(bytes)) continue;
    if (withoutStamp(now.toString("utf8")) === withoutStamp(bytes.toString("utf8"))) fs.writeFileSync(file, bytes);
    else process.stdout.write(`!! ${path.relative(lab, file)} differs from the start of this run in more than its timestamp; left as it is\n`);
  }
  process.stdout.write(`\n${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});
