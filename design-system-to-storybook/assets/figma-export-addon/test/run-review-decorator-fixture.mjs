// Browser verification for the self-registered review decorator: bundles
// src/preview.ts and test/review-decorator-fixture-entry.ts separately (as
// Storybook loads the preview entry from the addons list and the project
// imports the review entry), serves a generated page in headless Chromium and
// asserts the figma-export-workflow "Self-registered review decorator"
// scenarios.
// Run from the addon root: node test/run-review-decorator-fixture.mjs
import assert from "node:assert";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const addonRoot = path.dirname(testDir);
const previewBundle = path.join(testDir, ".review-decorator-preview.bundle.js");
const reviewBundle = path.join(testDir, ".review-decorator-review.bundle.js");

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      "No Chromium binary found. Set CHROME_PATH to a Chrome/Chromium executable.",
    );
  }
  return found;
}

function buildBundles() {
  const esbuild = path.join(addonRoot, "node_modules", ".bin", "esbuild");
  execFileSync(
    esbuild,
    [
      path.join(addonRoot, "src", "preview.ts"),
      "--bundle",
      "--format=iife",
      "--global-name=SbfxPreviewEntry",
      `--outfile=${previewBundle}`,
    ],
    { stdio: "inherit" },
  );
  execFileSync(
    esbuild,
    [
      path.join(testDir, "review-decorator-fixture-entry.ts"),
      "--bundle",
      "--format=iife",
      `--outfile=${reviewBundle}`,
    ],
    { stdio: "inherit" },
  );
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="/.review-decorator-preview.bundle.css" />
<link rel="stylesheet" href="/.review-decorator-review.bundle.css" />
</head>
<body>
<div id="storybook-root"><p>Story canvas</p></div>
<pre id="fixture-result" hidden></pre>
<script src="/.review-decorator-preview.bundle.js"></script>
<script src="/.review-decorator-review.bundle.js"></script>
</body>
</html>`;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/" || url.pathname === "/index.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(page);
        return;
      }
      const filePath = path.join(testDir, path.basename(url.pathname));
      if (!filePath.startsWith(testDir) || !existsSync(filePath)) {
        response.writeHead(404).end("not found");
        return;
      }
      response.writeHead(200, {
        "content-type": contentTypes[path.extname(filePath)] ?? "application/octet-stream",
      });
      response.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function runChrome(chromeBinary, url) {
  return new Promise((resolve, reject) => {
    execFile(
      chromeBinary,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        "--window-size=1200,900",
        "--virtual-time-budget=30000",
        "--dump-dom",
        url,
      ],
      { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 },
      (error, stdout) => {
        if (error && !stdout) reject(error);
        else resolve(stdout);
      },
    );
  });
}

function extractResult(dom) {
  const match = dom.match(/<pre id="fixture-result"[^>]*>([A-Za-z0-9+/=]*)<\/pre>/);
  if (!match?.[1]) return undefined;
  return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
}

async function main() {
  buildBundles();
  const chromeBinary = findChromeBinary();
  const server = await startServer();
  const { port } = server.address();
  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = extractResult(await runChrome(chromeBinary, `http://127.0.0.1:${port}/`));
      if (!result) {
        if (attempt < 3) console.warn(`review-decorator-fixture attempt ${attempt}: no result, retrying...`);
        continue;
      }
      if (result.error) throw new Error(`review-decorator-fixture failed:\n${result.error}`);
      const failed = result.results.filter((entry) => !entry.passed);
      assert.strictEqual(
        failed.length,
        0,
        `review-decorator-fixture assertions failed: ${failed
          .map((entry) => `${entry.name}${entry.details ? ` (${entry.details})` : ""}`)
          .join("; ")}`,
      );
      console.log(`review-decorator-fixture: ${result.results.length} assertions passed`);
      return;
    }
    throw new Error("review-decorator-fixture: fixture did not finish");
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
