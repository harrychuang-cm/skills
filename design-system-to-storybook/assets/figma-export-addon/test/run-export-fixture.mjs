// Browser verification for the exporter: bundles domExport, renders
// test/export-fixture.html in headless Chromium, and asserts the exported
// payload against the figma-export-capture spec scenarios.
// Run from the addon root: node test/run-export-fixture.mjs
import assert from "node:assert";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const addonRoot = path.dirname(testDir);
const bundlePath = path.join(testDir, ".export-fixture.bundle.js");
const payloadPath = path.join(testDir, ".last-fixture-payload.json");

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

function buildBundle() {
  const esbuild = path.join(addonRoot, "node_modules", ".bin", "esbuild");
  execFileSync(
    esbuild,
    [
      path.join(testDir, "export-fixture-entry.ts"),
      "--bundle",
      "--format=iife",
      "--global-name=FigmaExportFixture",
      `--outfile=${bundlePath}`,
    ],
    { stdio: "inherit" },
  );
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const urlPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const filePath = path.join(testDir, path.normalize(urlPath).replace(/^\/+/, ""));
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
        "--virtual-time-budget=20000",
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

function extractBase64(dom, elementId) {
  const match = dom.match(
    new RegExp(`<pre id="${elementId}"[^>]*>([A-Za-z0-9+/=]*)</pre>`),
  );
  return match?.[1] ? Buffer.from(match[1], "base64").toString("utf8") : undefined;
}

function findCase(root, name) {
  const node = root.children.find((child) => child.name === name);
  assert.ok(node, `fixture case "${name}" was exported`);
  return node;
}

function pngSize(base64) {
  const bytes = Buffer.from(base64, "base64");
  return { height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) };
}

function approx(actual, expected, tolerance, label) {
  assert.ok(
    typeof actual === "number" && Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} +/- ${tolerance}, got ${actual}`,
  );
}

const NEW_STYLE_KEYS = [
  "counterAxisSpacing",
  "effects",
  "fontStyle",
  "imageScaleMode",
  "layoutWrap",
  "letterSpacing",
  "radiusCorners",
  "textDecoration",
];

function assertPayload(payload) {
  const root = payload.root;
  assert.strictEqual(payload.version, 2, "payload version is 2");

  // Modern CSS color normalization
  const oklch = findCase(root, "case-oklch");
  assert.match(
    String(oklch.styles.backgroundColor),
    /^(#[0-9a-f]{6}|rgba?\()/i,
    "oklch background normalized to hex/rgb",
  );
  assert.ok(
    !String(oklch.styles.backgroundColor).includes("oklch"),
    "oklch keyword absent from payload",
  );

  // Shadow capture as effects
  const shadow = findCase(root, "case-shadow");
  assert.strictEqual(shadow.styles.effects?.length, 1, "one drop shadow");
  const dropShadow = shadow.styles.effects[0];
  assert.strictEqual(dropShadow.type, "DROP_SHADOW", "drop shadow type");
  approx(dropShadow.offsetX, 0, 0.01, "shadow offsetX");
  approx(dropShadow.offsetY, 4, 0.01, "shadow offsetY");
  approx(dropShadow.blur, 12, 0.01, "shadow blur");
  approx(dropShadow.spread, 0, 0.01, "shadow spread");
  const inset = findCase(root, "case-inset-shadow");
  assert.strictEqual(inset.styles.effects?.[0]?.type, "INNER_SHADOW", "inset shadow type");

  // Per-corner radius capture
  const corners = findCase(root, "case-corners");
  assert.deepStrictEqual(
    corners.styles.radiusCorners,
    { bottomLeft: 0, bottomRight: 0, topLeft: 8, topRight: 8 },
    "asymmetric corners exported per corner",
  );
  assert.strictEqual(corners.styles.radius, undefined, "no uniform radius with corners");

  // Measured auto-layout spacing
  const marginRow = findCase(root, "case-margin-row");
  assert.strictEqual(marginRow.layoutStrategy, "autoLayout", "margin row stays auto layout");
  approx(marginRow.styles.gap, 12, 0.5, "margin-derived gap");
  const unevenRow = findCase(root, "case-uneven-row");
  assert.strictEqual(unevenRow.layoutStrategy, "absolute", "uneven spacing falls back to absolute");
  const reverse = findCase(root, "case-reverse");
  assert.deepStrictEqual(
    reverse.children.map((child) => child.name),
    ["item-c", "item-b", "item-a"],
    "row-reverse children in visual order",
  );
  approx(reverse.styles.gap, 10, 0.5, "reverse row measured gap");

  // Flex wrap capture
  const wrap = findCase(root, "case-wrap");
  assert.strictEqual(wrap.styles.layoutWrap, "WRAP", "wrap exported");
  approx(wrap.styles.gap, 8, 0.5, "wrap in-line gap");
  approx(wrap.styles.counterAxisSpacing, 12, 0.5, "wrap line spacing");

  // Raster image capture
  const raster = findCase(root, "case-raster");
  assert.strictEqual(raster.kind, "image", "raster node kind");
  assert.ok(raster.imageBase64 && raster.imageBase64.length > 0, "raster base64 present");
  assert.strictEqual(raster.imageMimeType, "image/png", "raster mime type");
  assert.strictEqual(raster.styles.imageScaleMode, "FILL", "object-fit cover maps to FILL");
  const rasterBig = findCase(root, "case-raster-big");
  assert.ok(rasterBig.imageBase64, "big raster captured");
  const bigSize = pngSize(rasterBig.imageBase64);
  assert.strictEqual(bigSize.width, 2048, "big raster downscaled to 2048");
  approx(rasterBig.styles.width, 300, 1, "big raster keeps on-screen width");

  // Text style capture
  const uppercase = findCase(root, "case-uppercase");
  assert.strictEqual(uppercase.text, "SUBMIT ORDER", "uppercase baked into string");
  const multiline = findCase(root, "case-multiline");
  assert.ok(multiline.text?.includes("\n"), "line break preserved");
  const letterSpacing = findCase(root, "case-letterspacing");
  approx(letterSpacing.styles.letterSpacing, 0.5, 0.01, "letter spacing");
  assert.strictEqual(letterSpacing.styles.textDecoration, "UNDERLINE", "underline decoration");
  const italic = findCase(root, "case-italic");
  assert.strictEqual(italic.styles.fontStyle, "italic", "italic font style");
  const fontStack = findCase(root, "case-font-stack");
  assert.strictEqual(
    fontStack.bindings.fontFamily,
    "--fx-comp-caption-font-family",
    "font stack binds through the component token",
  );
  const fontStackRefToken = payload.tokens.find(
    (token) => token.cssName === "--fx-ref-typeface-grotesque",
  );
  assert.ok(fontStackRefToken, "font stack ref token exported");
  assert.strictEqual(
    fontStackRefToken.rawValue,
    '"Helvetica Neue", Helvetica, "Arial Narrow", Arial, sans-serif',
    "font stack raw value preserves the CSS fallback list",
  );
  assert.strictEqual(
    fontStackRefToken.value,
    "Helvetica Neue",
    "font stack variable value is one unquoted Figma family",
  );
  for (const cssName of [
    "--fx-ref-typeface-grotesque",
    "--fx-sys-typescale-label-family",
    "--fx-comp-caption-font-family",
  ]) {
    const token = payload.tokens.find((candidate) => candidate.cssName === cssName);
    assert.deepStrictEqual(token?.scopes, ["FONT_FAMILY"], `${cssName} uses FONT_FAMILY scope`);
  }
  const textShadow = findCase(root, "case-text-shadow");
  assert.strictEqual(
    textShadow.styles.effects?.[0]?.type,
    "DROP_SHADOW",
    "text shadow exported as effect",
  );

  // Token binding correctness
  const mediaToken = findCase(root, "case-media-token");
  assert.strictEqual(
    mediaToken.bindings.backgroundColor,
    undefined,
    "non-matching media query token not bound",
  );
  const specificity = findCase(root, "case-specificity");
  assert.strictEqual(
    specificity.bindings.backgroundColor,
    "--fx-comp-card-color-bg",
    "higher-specificity token wins",
  );

  // Modern color token values
  const accentToken = payload.tokens.find(
    (token) => token.cssName === "--fx-ref-color-teal",
  );
  assert.ok(accentToken, "hsl ref token exported");
  assert.strictEqual(accentToken.type, "COLOR", "hsl token type is COLOR");
  approx(accentToken.value?.r, 0.2, 0.01, "hsl token r");
  approx(accentToken.value?.g, 0.4, 0.01, "hsl token g");
  approx(accentToken.value?.b, 0.6, 0.01, "hsl token b");

  // Shadow DOM traversal capture
  const shadowHost = findCase(root, "case-shadow-dom");
  const shadowInner = shadowHost.children.find((child) => child.name === "shadow-inner");
  assert.ok(shadowInner, "open shadow root content exported as host child");
  approx(shadowInner.styles.width, 120, 1, "shadow inner width");
  approx(shadowInner.styles.height, 40, 1, "shadow inner height");
  assert.match(
    String(shadowInner.styles.backgroundColor),
    /^(#3366ff|rgb\(51, 102, 255\))$/i,
    "shadow inner background resolves the token value",
  );
  assert.strictEqual(
    shadowInner.bindings.backgroundColor,
    "--fx-sys-color-primary",
    "adopted stylesheet token binds inside shadow",
  );

  // Payload compatibility: plain nodes carry no new fields
  const plain = findCase(root, "case-plain");
  for (const key of NEW_STYLE_KEYS) {
    assert.ok(!(key in plain.styles), `plain node has no ${key}`);
  }
  assert.ok(!("imageBase64" in plain), "plain node has no imageBase64");
  assert.ok(!("imageMimeType" in plain), "plain node has no imageMimeType");
}

async function main() {
  buildBundle();
  const chromeBinary = findChromeBinary();
  const server = await startServer();
  const { port } = server.address();

  try {
    const url = `http://127.0.0.1:${port}/export-fixture.html`;
    let payloadText;
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const dom = await runChrome(chromeBinary, url);
      const errorText = extractBase64(dom, "payload-error");
      if (errorText) throw new Error(`fixture export failed:\n${errorText}`);

      payloadText = extractBase64(dom, "payload-output");
      if (payloadText) break;
      if (attempt < attempts) {
        console.warn(`attempt ${attempt}: export did not finish, retrying...`);
      }
    }
    if (!payloadText) {
      throw new Error("fixture payload not found in dumped DOM (export did not finish)");
    }

    const payload = JSON.parse(payloadText);
    assertPayload(payload);
    writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
    console.log(`run-export-fixture: all assertions passed (payload: ${payloadPath})`);
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
