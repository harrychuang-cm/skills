// Browser verification for host-declared comment views, anchors and
// availability: bundles test/anchor-fixture-entry.ts, serves a generated page
// and drives it in headless Chrome over CDP (real time, so animation frames,
// captures and pointer events behave as in Storybook).
// Run from the addon root: node test/run-anchor-fixture.mjs
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const addonRoot = path.dirname(testDir);
const bundlePath = path.join(testDir, ".anchor-fixture.bundle.js");
const bundleCssPath = path.join(testDir, ".anchor-fixture.bundle.css");
const frameBundlePath = path.join(testDir, ".anchor-frame.bundle.js");
const frameBundleCssPath = path.join(testDir, ".anchor-frame.bundle.css");
const chrome = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean).find(existsSync);
if (!chrome) throw new Error("No Chrome/Chromium binary found.");

execFileSync(
  path.join(addonRoot, "node_modules/.bin/esbuild"),
  [
    path.join(testDir, "anchor-fixture-entry.ts"),
    "--bundle",
    "--format=iife",
    "--loader:.css=css",
    `--outfile=${bundlePath}`,
  ],
  { stdio: "inherit" },
);
execFileSync(
  path.join(addonRoot, "node_modules/.bin/esbuild"),
  [
    path.join(testDir, "anchor-fixture-frame-entry.ts"),
    "--bundle",
    "--format=iife",
    "--loader:.css=css",
    `--outfile=${frameBundlePath}`,
  ],
  { stdio: "inherit" },
);

const page = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="/.anchor-fixture.bundle.css" />
    <style>
      body { margin: 0; font-family: sans-serif; }
      #storybook-root { position: relative; }
      #fixture-result { display: none; }
    </style>
  </head>
  <body>
    <main id="storybook-root"></main>
    <pre id="fixture-result"></pre>
    <script>
      addEventListener("error", (event) => {
        document.querySelector("#fixture-result").textContent = btoa(JSON.stringify({ error: String(event.error?.stack || event.message), results: [] }));
      });
      addEventListener("unhandledrejection", (event) => {
        document.querySelector("#fixture-result").textContent = btoa(JSON.stringify({ error: String(event.reason?.stack || event.reason), results: [] }));
      });
    </script>
    <script src="/.anchor-fixture.bundle.js"></script>
  </body>
</html>`;

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/" || url.pathname === "/anchor-fixture.html") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(page);
    return;
  }
  if (url.pathname === "/frame.html") {
    // A same-origin preview page for anchored capture checks.
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(readFileSync(path.join(testDir, "anchor-fixture-frame.html")));
    return;
  }
  const filePath = path.join(testDir, path.basename(url.pathname));
  if (!existsSync(filePath)) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, {
    "content-type": filePath.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8",
  });
  response.end(readFileSync(filePath));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const fixtureUrl = `http://127.0.0.1:${server.address().port}/anchor-fixture.html`;
const profileDir = await mkdtemp(path.join(tmpdir(), "sbfx-anchor-chrome-"));
const browser = spawn(
  chrome,
  [
    "--headless=new",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

function browserWebSocketUrl() {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`Chrome CDP did not start.\n${stderr}`)), 15_000);
    browser.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    browser.once("exit", (code) => reject(new Error(`Chrome exited before CDP was ready (${code}).\n${stderr}`)));
  });
}

class CdpClient {
  id = 0;
  pending = new Map();

  constructor(socket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

let socket;
try {
  socket = new WebSocket(await browserWebSocketUrl());
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const cdp = new CdpClient(socket);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { flatten: true, targetId });
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { deviceScaleFactor: 1, height: 900, mobile: false, width: 1280 },
    sessionId,
  );
  await cdp.send("Page.navigate", { url: fixtureUrl }, sessionId);

  const deadline = Date.now() + 120_000;
  let encoded = "";
  let stage = "not-loaded";
  while (Date.now() < deadline) {
    const evaluation = await cdp.send(
      "Runtime.evaluate",
      {
        expression: `(() => { const node = document.querySelector('#fixture-result'); return { text: node?.textContent || '', stage: node?.dataset.stage || 'missing' }; })()`,
        returnByValue: true,
      },
      sessionId,
    );
    encoded = evaluation.result?.value?.text ?? "";
    stage = evaluation.result?.value?.stage ?? stage;
    if (encoded) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(encoded, `anchor fixture did not finish (stage: ${stage})`);
  const result = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  const failed = result.results.filter((entry) => !entry.passed);
  if (result.error) {
    throw new Error(
      `${result.error}\nfixture stage: ${stage}\nfailed so far: ${failed.map((entry) => `${entry.name}: ${entry.detail ?? "failed"}`).join("; ")}`,
    );
  }
  assert.equal(
    failed.length,
    0,
    failed.map((entry) => `${entry.name}: ${entry.detail ?? "failed"}`).join("; "),
  );
  for (const entry of result.results.filter((item) => item.name.startsWith("measure:"))) {
    console.log(`${entry.name} ${entry.detail ?? ""}`);
  }
  console.log(`anchor-fixture: ${result.results.length} assertions passed`);
  await cdp.send("Target.closeTarget", { targetId });
} finally {
  socket?.close();
  const browserExited = new Promise((resolve) => browser.once("exit", resolve));
  browser.kill("SIGTERM");
  await Promise.race([browserExited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  await new Promise((resolve) => server.close(resolve));
  // Chrome can still be writing its profile right after exit.
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  await unlink(bundlePath).catch(() => undefined);
  await unlink(bundleCssPath).catch(() => undefined);
  await unlink(frameBundlePath).catch(() => undefined);
  await unlink(frameBundleCssPath).catch(() => undefined);
}
