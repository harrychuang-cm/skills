#!/usr/bin/env node

// Evidence written inside the project root must not reload the Story preview.
// Runs a real Storybook dev server whose configuration declares no
// server.watch setting, so only the plugin's own exclusion can prevent it.
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const addonRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(addonRoot, "test", "fixtures", "react");
const dataDir = path.join(fixtureRoot, "evidence-reload-data");
const storybookCli = path.join(
  addonRoot,
  "node_modules",
  "storybook",
  "dist",
  "bin",
  "dispatcher.js",
);
const chrome = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean).find((candidate) => fs.existsSync(candidate));
if (!chrome) throw new Error("No Chrome/Chromium binary found.");

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

assert.doesNotMatch(
  fs.readFileSync(path.join(fixtureRoot, ".storybook", "main.ts"), "utf8"),
  /\bwatch\b/,
  "the fixture project configuration declares no server.watch setting",
);

const port = await new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    const { port: free } = server.address();
    server.close(() => resolve(free));
  });
});
fs.rmSync(dataDir, { recursive: true, force: true });
const storybook = spawn(
  process.execPath,
  [
    storybookCli,
    "dev",
    "--ci",
    "--no-open",
    "--port",
    String(port),
    "--config-dir",
    path.join(fixtureRoot, ".storybook"),
  ],
  {
    cwd: fixtureRoot,
    env: {
      ...process.env,
      SBFX_PARITY_DATA_DIR: dataDir,
      STORYBOOK_DISABLE_TELEMETRY: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverOutput = "";
storybook.stdout.on("data", (chunk) => (serverOutput += chunk));
storybook.stderr.on("data", (chunk) => (serverOutput += chunk));

const profileDir = fs.mkdtempSync(
  path.join(process.env.TMPDIR || "/tmp", "sbfx-evidence-chrome-"),
);
const browser = spawn(
  chrome,
  [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

let socket;
try {
  const wsUrl = await new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(
      () => reject(new Error(`Chrome CDP did not start.\n${stderr}`)),
      15_000,
    );
    browser.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    });
  });
  socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let messageId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++messageId;
      pending.set(id, { resolve, reject });
      socket.send(
        JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }),
      );
    });

  const base = `http://127.0.0.1:${port}`;
  const startedAt = Date.now();
  let ready = false;
  while (Date.now() - startedAt < 120_000 && !ready) {
    if (storybook.exitCode !== null) {
      throw new Error(`Storybook exited before ready:\n${serverOutput}`);
    }
    try {
      ready = (await fetch(`${base}/index.json`)).ok;
    } catch {
      // Server is still starting.
    }
    if (!ready) await sleep(300);
  }
  assert.ok(ready, `Storybook did not become ready:\n${serverOutput}`);

  const { targetId } = await send("Target.createTarget", {
    url: `${base}/iframe.html?id=parity-fixture--default&viewMode=story&globals=figmaExport:on`,
  });
  const { sessionId } = await send("Target.attachToTarget", { flatten: true, targetId });
  await send("Runtime.enable", {}, sessionId);
  const evaluate = async (expression) => {
    const result = await send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      );
    }
    return result.result?.value;
  };
  const pageDeadline = Date.now() + 60_000;
  let pageReady = false;
  while (Date.now() < pageDeadline && !pageReady) {
    try {
      pageReady = await evaluate(
        `Boolean(document.querySelector('[aria-label="Visual comments"]'))`,
      );
    } catch {
      // The execution context is not available until the page settles.
    }
    if (!pageReady) await sleep(200);
  }
  assert.ok(pageReady, "the Story preview rendered the visual comments panel");

  const api = "/__sbfx_fixture_comments";
  const json = (method, body) =>
    `{ method: '${method}', headers: { 'content-type': 'application/json' }, body: JSON.stringify(${JSON.stringify(body)}) }`;
  const commentBody = {
    clientRequestId: "evidence-reload-1",
    authorName: "Probe",
    body: "Evidence reload probe",
    kind: "tracking",
    story: { id: "parity-fixture--default", title: "Parity/Fixture", name: "Default" },
    pin: { xRatio: 0.5, yRatio: 0.5 },
    viewport: { width: 800, height: 600, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    capture: {
      dataUrl: png,
      mimeType: "image/png",
      width: 1,
      height: 1,
      cssWidth: 800,
      cssHeight: 600,
    },
  };
  // Each step runs in the page, then the marker set beforehand must survive.
  const steps = [
    [
      "Start meeting",
      `window.__ids = {}; const r = await fetch('${api}/sessions', ${json("POST", { title: "Evidence reload" })}); window.__ids.meeting = (await r.json()).meeting.session.id; return r.status;`,
      201,
    ],
    [
      "Save comment",
      `const r = await fetch('${api}/sessions/' + window.__ids.meeting + '/comments', ${json("POST", commentBody)}); window.__ids.comment = (await r.json()).comment.id; return r.status;`,
      201,
    ],
    [
      "Edit comment",
      `const r = await fetch('${api}/sessions/' + window.__ids.meeting + '/comments/' + window.__ids.comment, ${json("PATCH", { body: "Edited probe", kind: "visual-fix" })}); return r.status;`,
      200,
    ],
    [
      "Complete comment",
      `const r = await fetch('${api}/sessions/' + window.__ids.meeting + '/comments/' + window.__ids.comment, ${json("PATCH", { resolved: true })}); return r.status;`,
      200,
    ],
    [
      "Save review status",
      `const r = await fetch('/__sbfx_fixture_review', ${json("PUT", { storyId: "parity-fixture--default", entry: { figmaReviewStatus: "approved", notes: "probe" } })}); return r.status;`,
      200,
    ],
    [
      "Delete comment",
      `const r = await fetch('${api}/sessions/' + window.__ids.meeting + '/comments/' + window.__ids.comment, { method: 'DELETE' }); return r.status;`,
      200,
    ],
    [
      "End meeting",
      `const r = await fetch('${api}/sessions/' + window.__ids.meeting + '/close', { method: 'POST' }); return r.status;`,
      200,
    ],
  ];
  await evaluate(`window.__evidenceMarker = 'page-not-reloaded'`);
  const reloadedAfter = [];
  for (const [label, body, expectedStatus] of steps) {
    const status = await evaluate(`(async () => { ${body} })()`);
    assert.equal(status, expectedStatus, `${label} returns HTTP ${expectedStatus}`);
    // A dev-server reload follows the file write within a second.
    await sleep(2_000);
    let marker;
    try {
      marker = await evaluate(`window.__evidenceMarker ?? 'RELOADED'`);
    } catch {
      marker = "RELOADED";
    }
    if (marker !== "page-not-reloaded") {
      reloadedAfter.push(label);
      await sleep(2_000);
      await evaluate(`window.__evidenceMarker = 'page-not-reloaded'`).catch(() => undefined);
      if (label === "Start meeting" || label === "Save comment") {
        // The ids lived on the reloaded page; later steps cannot continue.
        break;
      }
    }
  }
  assert.ok(
    fs.existsSync(path.join(dataDir, "comments", "index.html")),
    "comment evidence was written inside the project root",
  );
  assert.deepEqual(
    reloadedAfter,
    [],
    `evidence writes reloaded the preview after: ${reloadedAfter.join(", ")}`,
  );
  assert.doesNotMatch(
    serverOutput,
    /page reload/i,
    "the dev server announced no page reload",
  );
  console.log(`evidence reload checks passed (${steps.length} requests, 0 reloads)`);
} finally {
  socket?.close();
  browser.kill("SIGTERM");
  storybook.kill("SIGTERM");
  await sleep(1_500);
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(profileDir, { recursive: true, force: true });
}
