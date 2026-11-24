import assert from "node:assert/strict";
import http from "node:http";
import { Readable } from "node:stream";
import test from "node:test";

import { addon, loadPostcss, makeWorkspace } from "./helpers.mjs";

const { createApp } = await addon("server/app.mjs");
const { guardRequest, isLoopback, parseHost } = await addon("server/guard.mjs");
const { readJsonBody } = await addon("server/http.mjs");
const { API_BASE, SESSION_HEADER } = await addon("shared/api-contract.mjs");

const postcss = await loadPostcss();
const quietLog = { info() {}, warn() {}, error() {} };

async function startServer(app, { host = "127.0.0.1", presetCors = true } = {}) {
  const server = http.createServer((req, res) => {
    if (presetCors) {
      // Simulate Vite's cors middleware, which runs before plugin middlewares.
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST");
    }
    if (!req.url.startsWith(API_BASE)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    req.url = req.url.slice(API_BASE.length) || "/";
    void app.handle(req, res);
  });
  await new Promise((resolve) => server.listen(0, host, resolve));
  return { server, port: server.address().port };
}

function request({ port, method = "GET", path = "/session", headers = {}, body = null, family = 4, hostHeader }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: family === 6 ? "::1" : "127.0.0.1",
        family,
        port,
        method,
        path: `${API_BASE}${path}`,
        headers: { host: hostHeader ?? `localhost:${port}`, ...headers },
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
    if (body !== null) req.write(body);
    req.end();
  });
}

test("loopback detection", () => {
  for (const ok of ["127.0.0.1", "127.9.8.7", "::1", "::ffff:127.0.0.1"]) assert.ok(isLoopback(ok), ok);
  for (const bad of ["192.168.1.5", "::ffff:192.168.1.5", "10.0.0.1", "fe80::1", "", undefined]) assert.ok(!isLoopback(bad), String(bad));
  assert.deepEqual(parseHost("localhost:6006"), { hostname: "localhost", port: "6006" });
  assert.deepEqual(parseHost("[::1]:6006"), { hostname: "[::1]", port: "6006" });
  assert.equal(parseHost("a b"), null);
});

test("GET routes, guard rules and response headers", async () => {
  const { projectRoot, configFile } = await makeWorkspace();
  const app = await createApp({ projectRoot, configFile, servedRoots: [projectRoot], log: quietLog, postcss });
  assert.deepEqual(app.readOnlyReasons, []);
  const { server, port } = await startServer(app);
  try {
    const session = await request({ port });
    assert.equal(session.status, 200);
    assert.equal(session.json.projectId, "fixture");
    assert.match(session.json.session, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(session.headers["access-control-allow-origin"], undefined, "upstream CORS header removed");
    assert.equal(session.headers["x-content-type-options"], "nosniff");
    assert.equal(session.headers["cross-origin-resource-policy"], "same-origin");
    assert.equal(session.headers["cache-control"], "no-store");

    const sameOrigin = await request({ port, headers: { origin: `http://localhost:${port}`, "sec-fetch-site": "same-origin" } });
    assert.equal(sameOrigin.status, 200);

    const cases = [
      [{ headers: { origin: "http://localhost:3000" } }, 403, "origin"],
      [{ headers: { "sec-fetch-site": "cross-site" } }, 403, "sec-fetch-site"],
      [{ headers: { "sec-fetch-site": "none" } }, 403, "sec-fetch-site"],
      [{ hostHeader: `192.168.204.77:${port}` }, 403, "host"],
      [{ hostHeader: `evil.example:${port}` }, 403, "host"],
      [{ headers: { "x-forwarded-for": "1.2.3.4" } }, 403, "proxied"],
      [{ headers: { via: "1.1 tunnel" } }, 403, "proxied"],
      [{ headers: { forwarded: "for=1.2.3.4" } }, 403, "proxied"],
    ];
    for (const [options, status, reason] of cases) {
      const response = await request({ port, ...options });
      assert.equal(response.status, status, JSON.stringify(options));
      assert.equal(response.json.error.details.reason, reason);
      assert.equal(response.headers["access-control-allow-origin"], undefined);
    }
    assert.equal((await request({ port, method: "PUT" })).status, 405);
    assert.equal((await request({ port, method: "DELETE" })).status, 405);
    assert.equal((await request({ port, path: "/nope" })).status, 404);

    const index = await request({ port, path: "/index" });
    assert.equal(index.status, 200);
    assert.equal(index.json.tokens.items.length, 13);
    assert.equal(index.json.css.files[0].file, "src/components/seal/Seal.css");

    const state = await request({ port, path: "/state" });
    assert.equal(state.json.readOnly.active, false);
    assert.ok(state.json.mirrors.every((m) => m.inSync));
  } finally {
    server.close();
  }
});

test("IPv4 and IPv6 loopback both reach a dual-stack server", async () => {
  const { projectRoot, configFile } = await makeWorkspace();
  const app = await createApp({ projectRoot, configFile, servedRoots: [projectRoot], log: quietLog, postcss });
  const { server, port } = await startServer(app, { host: "::" });
  try {
    assert.equal((await request({ port, family: 4 })).status, 200);
    assert.equal((await request({ port, family: 6, hostHeader: `[::1]:${port}` })).status, 200);
  } finally {
    server.close();
  }
});

function fakeReq({ method = "POST", headers = {}, remote = "127.0.0.1" } = {}) {
  return { method, headers: { host: "localhost:6006", ...headers }, socket: { remoteAddress: remote, encrypted: false } };
}

test("POST guard: origin required, JSON only, session required", () => {
  const session = "s3cret";
  const good = { origin: "http://localhost:6006", "content-type": "application/json; charset=utf-8", [SESSION_HEADER]: session };
  assert.doesNotThrow(() => guardRequest(fakeReq({ headers: good }), { session }));
  const expect = (headers, code, remote) =>
    assert.throws(() => guardRequest(fakeReq({ headers, remote }), { session }), (e) => e.code === code, JSON.stringify(headers));
  expect({ ...good, origin: undefined }, "forbidden");
  expect({ ...good, "content-type": "text/plain" }, "unsupported-media-type");
  expect({ ...good, [SESSION_HEADER]: "wrong" }, "session-required");
  expect({ ...good, [SESSION_HEADER]: undefined }, "session-required");
  expect(good, "forbidden", "192.168.1.5");
});

test("body reader enforces the limit before and while streaming", async () => {
  const make = (text, declared) => {
    const stream = Readable.from([Buffer.from(text)]);
    stream.headers = declared === undefined ? {} : { "content-length": String(declared) };
    return stream;
  };
  assert.deepEqual(await readJsonBody(make('{"a":1}', 7), 100), { a: 1 });
  await assert.rejects(readJsonBody(make("x".repeat(200), 200), 100), (e) => e.code === "body-too-large");
  await assert.rejects(readJsonBody(make("x".repeat(200)), 100), (e) => e.code === "body-too-large");
  await assert.rejects(readJsonBody(make("{nope", 5), 100), (e) => e.code === "schema-invalid");
});

test("read-only when the state directory is inside a served root", async () => {
  const { projectRoot, configFile, ws } = await makeWorkspace();
  const app = await createApp({ projectRoot, configFile, servedRoots: [ws], log: quietLog, postcss });
  assert.deepEqual(app.readOnlyReasons.map((r) => r.code), ["state-dir-served"]);
});

test("read-only when the config is invalid", async () => {
  const { projectRoot, configFile } = await makeWorkspace({ config: { projectId: "Bad Id" } });
  const app = await createApp({ projectRoot, configFile, servedRoots: [projectRoot], log: quietLog, postcss });
  assert.equal(app.readOnlyReasons[0].code, "config-invalid");
});
