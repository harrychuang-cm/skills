// Snapshot fidelity: node storybook-product-prototype/scripts/test_flow_snapshot_fidelity.mjs [--url <UI Flow URL>]
//
// --url compares real routes instead: it opens a running Storybook's UI Flow
// (iframe.html with globals=prototypeMode:flow), zooms to 100% and captures
// up to four route frames that are fully on screen.
//
// Serves flow-snapshot.js, the geometry module and fixed test pages from a
// local node:http server (one origin, so the parent page reads each test
// iframe's document), drives the system Chrome over CDP, captures every test
// iframe with captureFrameSnapshot and compares it pixel by pixel with
// Page.captureScreenshot of the same area. Without a system Chrome it prints
// "SKIPPED: no Chrome" and exits 0.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const assetsDir = fileURLToPath(new URL("../assets/prototype-inspector/", import.meta.url));
const FRAME = { height: 812, width: 375 };
// A pixel differs when a channel differs by more than this (WebP quality 0.8
// and anti-aliasing stay under it).
const CHANNEL_TOLERANCE = 40;
// Estimated thresholds (the research prototype measured a 0.01% median and a
// 4.38% maximum).
const MAX_MEDIAN_RATIO = 0.01;
const MAX_RATIO = 0.05;
// Differing pixels allowed inside the region each feature paints, measured
// 2026-10-07 with the feature on and off (on / off): heading text 0-3.0%
// (3.0% when colored by a custom property) / 11.7% without the web font and
// 15.9% without ::before; title 3.0-5.9% / 28.1%
// without the web font; logo 0.3% / 82.4% without the image; actions 7.1% /
// 10.8% without user agent inherited properties; sheet 0.3%.
const REGION_LIMITS = { actions: 0.09, heading: 0.04, logo: 0.05, sheet: 0.02, title: 0.08 };

const routePage = (extraHead = "", extraBody = "") => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html { background: rgb(246 247 249); }
  body { margin: 0; font: 15px/1.5 -apple-system, "Helvetica Neue", Arial, sans-serif; color: rgb(30 33 40); }
  header { display: flex; align-items: center; justify-content: space-between; height: 56px; padding: 0 16px; background: rgb(32 96 224); color: white; }
  header h1 { margin: 0; font-size: 18px; font-weight: 700; }
  .badge { padding: 2px 8px; border-radius: 999px; background: rgb(255 255 255 / 0.2); font-size: 12px; }
  main { padding: 16px; display: grid; gap: 12px; }
  .card { padding: 14px 16px; border: 1px solid rgb(220 224 232); border-radius: 12px; background: white; box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
  .card h2 { margin: 0 0 6px; font-size: 16px; }
  .card p { margin: 0; color: rgb(90 96 110); }
  .row { display: flex; gap: 8px; }
  .row span { flex: 1; height: 40px; border-radius: 8px; background: linear-gradient(90deg, rgb(255 180 60), rgb(255 120 80)); }
  ul { margin: 0; padding-left: 20px; }
  footer { position: absolute; left: 0; right: 0; bottom: 0; height: 64px; display: flex; align-items: center; justify-content: center; border-top: 1px solid rgb(220 224 232); background: white; }
  footer a { color: rgb(32 96 224); text-decoration: underline; }
</style>${extraHead}</head>
<body data-route="review">
  <header><h1 data-fidelity-roi="title">Review request</h1><span class="badge">Draft</span></header>
  <main>
    <section class="card"><h2 data-fidelity-roi="heading">Scope and readiness</h2><p>Capture product problem, target user, and core workflow before UI implementation starts.</p></section>
    <section class="card"><h2>Checklist</h2><ul><li>Attach fixture data</li><li>Confirm metadata</li><li>Share with reviewers</li></ul></section>
    <div class="row"><span></span><span></span><span></span></div>
    <section class="card"><h2>Owner</h2><p>Design Systems · 2026-07-15</p></section>
  </main>
  ${extraBody}
  <footer><a href="#">Request approval</a></footer>
</body></html>`;

const customPropertyCount = 9577;
const customProperties = Array.from(
  { length: customPropertyCount },
  (_, index) => `--token-${index}: rgb(${index % 256} ${(index * 7) % 256} ${(index * 13) % 256});`,
).join("");

// A system font served from this origin stands in for a project web font.
const FONT_FILE = ["/System/Library/Fonts/Supplemental/Georgia.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"].find((file) =>
  existsSync(file),
);
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="rgb(32 96 224)"/><circle cx="32" cy="32" r="14" fill="white"/></svg>`;

const PAGES = {
  "pure-dom": routePage(),
  "custom-properties": routePage(
    `<style>:root { ${customProperties} } .card h2 { color: var(--token-200); }</style>`,
  ),
  // A bottom sheet appended to body, as portals are.
  portal: routePage(
    `<style>.sheet { position: fixed; left: 0; right: 0; bottom: 0; height: 320px; padding: 20px; box-sizing: border-box; border-radius: 16px 16px 0 0; background: rgb(255 248 230); box-shadow: 0 -4px 16px rgb(0 0 0 / 0.18); } .sheet h2 { margin: 0 0 8px; }</style>`,
    `<div class="sheet" role="dialog" data-fidelity-roi="sheet"><h2>Bottom sheet</h2><p>Rendered through a portal at the end of body.</p></div>`,
  ),
  ...(FONT_FILE
    ? {
        // A woff fallback after the first source and a subset the page never
        // uses: neither may reach the snapshot.
        "web-font": routePage(
          `<style>@font-face { font-family: "Fixture Serif"; src: url("/fonts/fixture.ttf") format("truetype"), url("/fonts/fixture-fallback.woff") format("woff"); } @font-face { font-family: "Fixture Serif"; src: url("/fonts/fixture-cyrillic.ttf") format("truetype"); unicode-range: U+0400-04FF; } body, header h1 { font-family: "Fixture Serif", serif; }</style>`,
        ),
      }
    : {}),
  // Icons colored only by style sheet rules, and button text alignment.
  "svg-and-buttons": routePage(
    `<style>.icon path { fill: rgb(220 40 90); } .icon circle { stroke: rgb(20 160 120); stroke-width: 3px; fill: none; } .actions { display: flex; gap: 8px; padding: 0 16px; text-align: left; } .actions button { width: 150px; height: 44px; border: 1px solid rgb(32 96 224); border-radius: 10px; background: white; color: rgb(32 96 224); font: inherit; }</style>`,
    `<div class="actions" data-fidelity-roi="actions"><svg class="icon" width="40" height="40" viewBox="0 0 40 40"><path d="M4 20 L20 4 L36 20 L20 36 Z"/><circle cx="20" cy="20" r="8"/></svg><button type="button">Request approval</button><button type="button">Edit</button></div>`,
  ),
  // Generated content and a same-origin image.
  "pseudo-and-image": routePage(
    `<style>.card h2::before { content: "● "; color: rgb(20 160 120); } .card h2::after { content: " →"; color: rgb(120 120 130); } .logo { display: block; margin: 0 16px; width: 64px; height: 64px; }</style>`,
    `<img class="logo" alt="" src="/images/logo.svg" data-fidelity-roi="logo">`,
  ),
};

// Decodes two images over the same backdrop and counts differing pixels.
const compareSource = `async function compareImages(snapshotUrl, referenceUrl, width, height, regions = {}) {
  const decode = async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "rgb(136 136 136)";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
  };
  const [a, b] = await Promise.all([decode(snapshotUrl), decode(referenceUrl)]);
  const differs = (index) =>
    Math.max(Math.abs(a[index] - b[index]), Math.abs(a[index + 1] - b[index + 1]), Math.abs(a[index + 2] - b[index + 2])) > ${CHANNEL_TOLERANCE};
  let differing = 0;
  for (let index = 0; index < a.length; index += 4) {
    if (differs(index)) differing += 1;
  }
  const regionRatios = {};
  for (const [name, rect] of Object.entries(regions)) {
    let count = 0;
    let total = 0;
    for (let y = Math.max(0, Math.floor(rect.y)); y < Math.min(height, Math.ceil(rect.y + rect.height)); y += 1) {
      for (let x = Math.max(0, Math.floor(rect.x)); x < Math.min(width, Math.ceil(rect.x + rect.width)); x += 1) {
        total += 1;
        if (differs((y * width + x) * 4)) count += 1;
      }
    }
    regionRatios[name] = total ? count / total : 0;
  }
  return { differing, ratio: differing / (a.length / 4), regions: regionRatios, total: a.length / 4 };
}`;

const parentPage = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { margin: 0; background: rgb(136 136 136); }
  iframe { position: absolute; left: 24px; top: 24px; border: 0; display: block; }
</style></head><body><script type="module">
import { captureFrameSnapshot, serializeFrameDocument } from "/assets/flow-snapshot.js";

const frames = new Map();
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const toDataUrl = (blob) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
${compareSource}

window.__fidelity = {
  async load(name, width, height) {
    frames.get(name)?.remove();
    const iframe = document.createElement("iframe");
    iframe.width = String(width);
    iframe.height = String(height);
    iframe.src = "/pages/" + name + ".html";
    document.body.append(iframe);
    await new Promise((resolve) => iframe.addEventListener("load", resolve, { once: true }));
    await iframe.contentDocument.fonts.ready;
    await nextFrame();
    await nextFrame();
    frames.set(name, iframe);
    const rect = iframe.getBoundingClientRect();
    return { height: rect.height, width: rect.width, x: rect.left, y: rect.top };
  },
  async capture(name, width, height) {
    const iframe = frames.get(name);
    const started = performance.now();
    const result = await captureFrameSnapshot(iframe, { devicePixelRatio: 1.25, previewHeight: height, previewWidth: width });
    const elapsedMs = performance.now() - started;
    const serialized = await serializeFrameDocument(iframe, { previewHeight: height, previewWidth: width });
    const regions = Object.fromEntries(
      [...iframe.contentDocument.querySelectorAll("[data-fidelity-roi]")].map((element) => {
        const rect = element.getBoundingClientRect();
        return [element.getAttribute("data-fidelity-roi"), { height: rect.height, width: rect.width, x: rect.left, y: rect.top }];
      }),
    );
    return {
      regions,
      buttonStyle: new DOMParser()
        .parseFromString(serialized.markup, "application/xhtml+xml")
        .querySelector("button")
        ?.getAttribute("style") ?? null,
      dataUrl: result.blob ? await toDataUrl(result.blob) : null,
      elapsedMs,
      embeddedFonts: serialized.markup.split('url("data:font/').length - 1,
      unusedFontSources: ["fixture-fallback", "fixture-cyrillic", "u+400"].some((text) => serialized.markup.toLowerCase().includes(text)),
      height: result.height,
      markupHasCustomProperty: /--token-/.test(serialized.markup),
      markupLength: serialized.markup.length,
      ok: result.ok,
      reason: result.reason ?? null,
      type: result.blob?.type ?? null,
      width: result.width,
    };
  },
  // A page that draws nothing: the capture fails as blank before encoding.
  async blank(width, height) {
    const iframe = document.createElement("iframe");
    iframe.width = String(width);
    iframe.height = String(height);
    iframe.srcdoc = '<!doctype html><html style="background: transparent"><body style="margin: 0; background: transparent"><div style="height: 40px"></div></body></html>';
    document.body.append(iframe);
    await new Promise((resolve) => iframe.addEventListener("load", resolve, { once: true }));
    await nextFrame();
    const original = HTMLCanvasElement.prototype.toBlob;
    let encodes = 0;
    HTMLCanvasElement.prototype.toBlob = function (...args) {
      encodes += 1;
      return original.apply(this, args);
    };
    try {
      const result = await captureFrameSnapshot(iframe, { devicePixelRatio: 1.25, previewHeight: height, previewWidth: width });
      return { encodes, hasBlob: Boolean(result.blob), ok: result.ok, reason: result.reason ?? null };
    } finally {
      HTMLCanvasElement.prototype.toBlob = original;
      iframe.remove();
    }
  },
  async hiddenRenderer(name, width, height) {
    const iframe = frames.get(name);
    iframe.style.display = "none";
    const result = await captureFrameSnapshot(iframe, { devicePixelRatio: 1.25, previewHeight: height, previewWidth: width });
    iframe.style.display = "";
    return { ok: result.ok, reason: result.reason ?? null };
  },
  async unchanged(name, width, height) {
    const iframe = frames.get(name);
    const first = await captureFrameSnapshot(iframe, { devicePixelRatio: 1.25, previewHeight: height, previewWidth: width });
    const original = HTMLCanvasElement.prototype.toBlob;
    let encodes = 0;
    HTMLCanvasElement.prototype.toBlob = function (...args) {
      encodes += 1;
      return original.apply(this, args);
    };
    try {
      const second = await captureFrameSnapshot(iframe, {
        devicePixelRatio: 1.25,
        previewHeight: height,
        previewWidth: width,
        previousMarkupHash: first.markupHash,
      });
      return { encodes, firstOk: first.ok, hashMatches: second.markupHash === first.markupHash, unchanged: second.unchanged === true };
    } finally {
      HTMLCanvasElement.prototype.toBlob = original;
    }
  },
  compare: compareImages,
};
window.__fidelityReady = true;
</script></body></html>`;

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function startServer() {
  const server = http.createServer((request, response) => {
    const { pathname } = new URL(request.url, "http://127.0.0.1");
    const send = (type, body) => {
      response.writeHead(200, { "content-type": type });
      response.end(body);
    };

    if (pathname === "/parent.html") return send("text/html; charset=utf-8", parentPage);
    if (pathname === "/fonts/fixture.ttf" && FONT_FILE) return send("font/ttf", readFileSync(FONT_FILE));
    // Served too, so a snapshot that embedded them would carry their data.
    if ((pathname === "/fonts/fixture-fallback.woff" || pathname === "/fonts/fixture-cyrillic.ttf") && FONT_FILE) return send("font/ttf", readFileSync(FONT_FILE));
    if (pathname === "/images/logo.svg") return send("image/svg+xml", LOGO_SVG);
    if (pathname.startsWith("/assets/") && pathname.endsWith(".js")) {
      const file = path.join(assetsDir, path.basename(pathname));
      // --url pages import the module from this origin.
      response.setHeader("access-control-allow-origin", "*");
      if (existsSync(file)) return send("text/javascript; charset=utf-8", readFileSync(file));
    }
    const page = /^\/pages\/([\w-]+)\.html$/.exec(pathname)?.[1];
    if (page && PAGES[page]) return send("text/html; charset=utf-8", PAGES[page]);
    response.writeHead(404);
    response.end("not found");
  });

  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function connect(chrome, profile) {
  const browser = spawn(
    chrome,
    ["--headless=new", "--hide-scrollbars", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const wsUrl = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Chrome did not start.")), 30_000);
    browser.stderr.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const messageId = ++id;
      pending.set(messageId, (message) => (message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result)));
      socket.send(JSON.stringify({ id: messageId, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  return { browser, send, socket };
}

// Real routes: zoom the running UI Flow to 100% and compare fully visible frames.
async function runUrlMode({ evaluate, origin, page, url, check, ratios }) {
  await page("Page.navigate", { url });
  let ready = false;
  for (let attempt = 0; attempt < 240 && !ready; attempt += 1) {
    ready = await evaluate(
      `Boolean(document.querySelector(".prototype-inspector--flow .prototype-inspector__flow-frame"))`,
    ).catch(() => false);
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) {
    check(false, "the UI Flow renders", url);
    return;
  }
  await evaluate(`(async () => {
    window.__fidelitySnapshot = await import(${JSON.stringify(`${origin}/assets/flow-snapshot.js`)});
    ${compareSource}
    window.__fidelityCompare = compareImages;
    document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code: "Digit0", key: ")", shiftKey: true }));
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 6_000));
  // A camera on a half pixel resamples the screenshot of every frame; pan
  // the fractional part away so frames sit on whole pixels.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const aligned = await evaluate(`(() => {
      const preview = document.querySelector(".prototype-inspector__flow-frame-preview");
      const viewport = document.querySelector(".prototype-inspector__flow-viewport");
      if (!preview || !viewport) return true;
      const rect = preview.getBoundingClientRect();
      const dx = rect.left - Math.round(rect.left);
      const dy = rect.top - Math.round(rect.top);
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return true;
      viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: innerWidth / 2, clientY: innerHeight / 2, deltaMode: 0, deltaX: dx, deltaY: dy }));
      return false;
    })()`);
    if (aligned) break;
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  const frames = await evaluate(`(() => {
    const ready = (iframe) => {
      try {
        const doc = iframe.contentDocument;
        return Boolean(doc?.querySelector("[data-prototype-route-preview], #storybook-root > *"));
      } catch {
        return false;
      }
    };
    return [...document.querySelectorAll(".prototype-inspector__flow-frame-preview iframe")]
      .map((iframe, index) => ({ index, rect: iframe.getBoundingClientRect().toJSON(), ready: ready(iframe) }))
      .filter(({ rect, ready }) => ready && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight && rect.width > 40)
      .slice(0, 4);
  })()`);
  check(frames.length > 0, "finds fully visible route frames at 100%", String(frames.length));
  for (const frame of frames) {
    const captured = await evaluate(`(async () => {
      const iframe = document.querySelectorAll(".prototype-inspector__flow-frame-preview iframe")[${frame.index}];
      const result = await window.__fidelitySnapshot.captureFrameSnapshot(iframe, {
        devicePixelRatio: 1.25,
        previewHeight: iframe.clientHeight,
        previewWidth: iframe.clientWidth,
      });
      const dataUrl = result.blob ? await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(result.blob);
      }) : null;
      return { dataUrl, height: result.height, ok: result.ok, reason: result.reason ?? null, route: iframe.closest("[data-frame-id]")?.getAttribute("data-frame-id"), width: result.width };
    })()`);
    const label = `route ${captured.route ?? frame.index}`;
    check(captured.ok, `${label}: captures a snapshot`, captured.reason ?? `at ${frame.rect.x},${frame.rect.y}`);
    if (!captured.ok) continue;
    const { x, y, width, height } = frame.rect;
    const shot = await page("Page.captureScreenshot", { clip: { height, scale: 1, width, x, y }, format: "png" });
    const comparison = await evaluate(
      `window.__fidelityCompare(${JSON.stringify(captured.dataUrl)}, ${JSON.stringify(`data:image/png;base64,${shot.data}`)}, ${captured.width}, ${captured.height})`,
    );
    ratios.push(comparison.ratio);
    check(comparison.ratio <= MAX_RATIO, `${label}: differs from the screenshot in at most ${MAX_RATIO * 100}% of pixels`, `${(comparison.ratio * 100).toFixed(3)}%`);
    // FIDELITY_DUMP=<route> keeps that route's snapshot and screenshot.
    if (process.env.FIDELITY_DUMP && process.env.FIDELITY_DUMP === captured.route) {
      const base = path.join(os.tmpdir(), `flow-snapshot-fidelity-${captured.route}`);
      writeFileSync(`${base}-snapshot.webp`, Buffer.from(captured.dataUrl.split(",")[1], "base64"));
      writeFileSync(`${base}-screenshot.png`, Buffer.from(shot.data, "base64"));
      console.log(`  wrote ${base}-*`);
    }
  }
}

// Switches one hidden iframe between two routes in place, the way the UI
// Flow's snapshot renderer does (history.replaceState and a FORCE_REMOUNT
// channel message, waiting for loading then completed, and for finished
// before the next switch), and checks that every capture holds its target
// route (data-route on [data-prototype-root]).
async function runRendererSwitches({ check, evaluate, origin }) {
  const result = await evaluate(`(async () => {
    const snapshot = await import(${JSON.stringify(`${origin}/assets/flow-snapshot.js`)});
    const storyId = new URLSearchParams(location.search).get("id");
    const routeIds = [...document.querySelectorAll(".prototype-inspector__flow-frame[data-frame-id]")].map((frame) => frame.getAttribute("data-frame-id"));
    if (routeIds.length < 2) return { error: "fewer than two routes" };
    const source = (routeId) => location.pathname + "?" + new URLSearchParams({ globals: "prototypeMode:story", id: storyId, prototypeFlowPreview: "true", prototypeRoute: routeId, viewMode: "story" });
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:absolute;left:0;top:0;width:375px;height:812px;opacity:0;pointer-events:none;border:0";
    let phases = [];
    let waiters = [];
    addEventListener("message", (event) => {
      if (event.source !== frame.contentWindow || typeof event.data !== "string" || !event.data.includes("storyRenderPhaseChanged")) return;
      try {
        const phase = JSON.parse(event.data).event?.args?.[0]?.newPhase;
        phases.push(phase);
        waiters = waiters.filter((waiter) => (waiter.phase === phase ? (waiter.resolve(true), false) : true));
      } catch {}
    });
    const waitFor = (phase, ms) => phases.includes(phase) ? Promise.resolve(true) : new Promise((resolve) => {
      const waiter = { phase, resolve };
      setTimeout(() => { waiters = waiters.filter((entry) => entry !== waiter); resolve(false); }, ms);
      waiters.push(waiter);
    });
    frame.src = source(routeIds[0]);
    document.body.append(frame);
    await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
    await waitFor("finished", 10000);
    const captures = [];
    const order = [routeIds[1], routeIds[0], routeIds[1], routeIds[0], routeIds[1], routeIds[0]];
    for (const routeId of order) {
      if (phases.at(-1) !== "finished") await waitFor("finished", 2000);
      phases = [];
      frame.contentWindow.history.replaceState(frame.contentWindow.history.state, "", source(routeId));
      const completed = waitFor("completed", 6000);
      frame.contentWindow.postMessage(JSON.stringify({ event: { args: [{ storyId }], from: "prototype-inspector", type: "forceRemount" }, key: "storybook-channel" }), location.origin);
      const ok = (await completed) && phases.includes("loading");
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const serialized = await snapshot.serializeFrameDocument(frame, { previewHeight: 812, previewWidth: 375 });
      const shot = await snapshot.captureFrameSnapshot(frame, { devicePixelRatio: 1, previewHeight: 812, previewWidth: 375 });
      const routeAttribute = serialized.markup.match(/data-route="([^"]*)"/)?.[1] ?? null;
      captures.push({ ok, routeAttribute, routeId, snapshotOk: shot.ok });
      await waitFor("finished", 2000);
    }
    frame.remove();
    return { captures, routeIds: routeIds.slice(0, 2) };
  })()`);
  if (result.error) {
    check(false, "renderer switches", result.error);
    return;
  }
  for (const [index, capture] of result.captures.entries()) {
    check(
      capture.ok && capture.snapshotOk && capture.routeAttribute === capture.routeId,
      `renderer switch ${index + 1}: the capture holds route ${capture.routeId}`,
      JSON.stringify(capture),
    );
  }
}

// Opens the UI Flow again with an empty snapshot store and every canvas
// encode held for ENCODE_HOLD_MS, then pans the camera while the renderer's
// first capture is encoding (past its last abort check): the late result is
// dropped (no pi:flow:snapshot during the pan), the abort does not reload the
// renderer, and the route is captured again once the camera settles.
const ENCODE_HOLD_MS = 1_500;
async function runRendererAbort({ check, evaluate, page, url }) {
  await page("Page.enable");
  await page("Storage.clearDataForOrigin", { origin: new URL(url).origin, storageTypes: "indexeddb" });
  const { identifier } = await page("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      window.__encodesPending = 0;
      HTMLCanvasElement.prototype.toBlob = function (callback, ...rest) {
        window.__encodesPending += 1;
        return toBlob.call(this, (blob) => setTimeout(() => {
          window.__encodesPending -= 1;
          callback(blob);
        }, ${ENCODE_HOLD_MS}), ...rest);
      };
    })()`,
  });
  try {
    await page("Page.navigate", { url });
    const result = await evaluate(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const count = (name) => performance.getEntriesByName(name).length;
      let started = performance.now();
      while (!window.__encodesPending && performance.now() - started < 60000) await wait(10);
      if (!window.__encodesPending) return { error: "no capture reached encoding" };
      const before = count("pi:flow:snapshot");
      const viewport = document.querySelector(".prototype-inspector__flow-viewport");
      started = performance.now();
      while (performance.now() - started < ${ENCODE_HOLD_MS} + 700) {
        viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: innerWidth / 2, clientY: innerHeight / 2, deltaMode: 0, deltaX: 2, deltaY: 1 }));
        await wait(16);
      }
      const duringPan = count("pi:flow:snapshot") - before;
      started = performance.now();
      while (count("pi:flow:snapshot") === before + duringPan && performance.now() - started < 20000) await wait(50);
      return {
        afterPan: count("pi:flow:snapshot") - before - duringPan,
        duringPan,
        resets: performance.getEntriesByName("pi:flow:renderer-reset").map((mark) => mark.detail?.reason),
      };
    })()`);
    check(
      !result.error && result.duringPan === 0 && result.afterPan > 0 && result.resets.every((reason) => reason === "initial"),
      "renderer abort: a capture still encoding when the camera moves is dropped, not counted as failed, and captured again after the pan",
      JSON.stringify(result),
    );
  } finally {
    await page("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  }
}

async function main() {
  const urlIndex = process.argv.indexOf("--url");
  const targetUrl = urlIndex > -1 ? process.argv[urlIndex + 1] : null;
  const chrome = findChrome();

  if (!chrome) {
    console.log("SKIPPED: no Chrome");
    return;
  }

  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = await mkdtemp(path.join(os.tmpdir(), "flow-snapshot-fidelity-"));
  const { browser, send, socket } = await connect(chrome, profile);
  const failures = [];
  const ratios = [];

  try {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { flatten: true, targetId });
    const page = (method, params) => send(method, params, sessionId);
    const evaluate = async (expression) => {
      const result = await page("Runtime.evaluate", { awaitPromise: true, expression, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };

    await page("Emulation.setDeviceMetricsOverride", { deviceScaleFactor: 1, height: 1000, mobile: false, width: 900 });
    await page("Page.navigate", { url: `${origin}/parent.html` });
    for (let attempt = 0; attempt < 100 && !(await evaluate("Boolean(window.__fidelityReady)").catch(() => false)); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const pageNames = targetUrl ? [] : Object.keys(PAGES);
    if (targetUrl) {
      const check = (passed, label, detail) => {
        console.log(`${passed ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
        if (!passed) failures.push(label);
      };
      // Tall enough that phone frames fit whole at 100% around the flow's center.
      await page("Emulation.setDeviceMetricsOverride", { deviceScaleFactor: 1, height: 1400, mobile: false, width: 1600 });
      await runUrlMode({ check, evaluate, origin, page, ratios, url: targetUrl });
      await runRendererSwitches({ check, evaluate, origin });
      await runRendererAbort({ check, evaluate, page, url: targetUrl });
    }

    for (const name of pageNames) {
      const clip = await evaluate(`window.__fidelity.load(${JSON.stringify(name)}, ${FRAME.width}, ${FRAME.height})`);
      const captured = await evaluate(`window.__fidelity.capture(${JSON.stringify(name)}, ${FRAME.width}, ${FRAME.height})`);
      const shot = await page("Page.captureScreenshot", { clip: { ...clip, scale: 1 }, format: "png" });
      const check = (passed, label, detail) => {
        console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${label}${detail ? ` — ${detail}` : ""}`);
        if (!passed) failures.push(`${name}: ${label}`);
      };

      check(captured.ok && captured.dataUrl, "captures a snapshot", JSON.stringify({ reason: captured.reason, type: captured.type }));
      if (!captured.ok) continue;
      // A tainted canvas cannot be encoded; a blob proves the data: URL path.
      check(captured.type === "image/webp" || captured.type === "image/png", "encodes the canvas (not tainted)", captured.type);
      check(captured.width === FRAME.width && captured.height === FRAME.height, "draws 1:1 at device pixel ratio 1.25", `${captured.width}x${captured.height}`);
      const comparison = await evaluate(
        `window.__fidelity.compare(${JSON.stringify(captured.dataUrl)}, ${JSON.stringify(`data:image/png;base64,${shot.data}`)}, ${FRAME.width}, ${FRAME.height}, ${JSON.stringify(captured.regions)})`,
      );
      ratios.push(comparison.ratio);
      for (const [region, ratio] of Object.entries(comparison.regions)) {
        const limit = REGION_LIMITS[region];
        check(ratio <= limit, `region ${region} differs in at most ${limit * 100}% of its pixels`, `${(ratio * 100).toFixed(2)}%`);
      }
      // FIDELITY_DUMP=<page> keeps that page's snapshot and screenshot.
      if (process.env.FIDELITY_DUMP === name) {
        const base = path.join(os.tmpdir(), `flow-snapshot-fidelity-${name}`);
        writeFileSync(`${base}-snapshot.${captured.type === "image/png" ? "png" : "webp"}`, Buffer.from(captured.dataUrl.split(",")[1], "base64"));
        writeFileSync(`${base}-screenshot.png`, Buffer.from(shot.data, "base64"));
        console.log(`  wrote ${base}-*`);
      }
      if (name === "svg-and-buttons") {
        // Chrome's button font shorthand resets line-height: the clone must carry the author's.
        check(/(^|;)line-height:22\.5px(;|$)/.test(captured.buttonStyle ?? ""), "buttons keep the inherited line-height the user agent would reset", captured.buttonStyle ?? "(no button)");
      }
      check(comparison.ratio <= MAX_RATIO, `differs from the screenshot in at most ${MAX_RATIO * 100}% of pixels`, `${(comparison.ratio * 100).toFixed(3)}% (${comparison.differing}/${comparison.total}), ${Math.round(captured.elapsedMs)} ms`);
      if (name === "custom-properties") {
        check(!captured.markupHasCustomProperty, "serializes no custom property declarations", `${captured.markupLength} characters`);
      }
      if (name === "web-font") {
        check(
          captured.embeddedFonts === 1 && !captured.unusedFontSources,
          "embeds only the loaded face's first source (no woff fallback, no unused subset)",
          JSON.stringify({ embeddedFonts: captured.embeddedFonts, unusedFontSources: captured.unusedFontSources }),
        );
      }
      if (name === "pure-dom") {
        const hidden = await evaluate(`window.__fidelity.hiddenRenderer("pure-dom", ${FRAME.width}, ${FRAME.height})`);
        check(!hidden.ok && hidden.reason === "not-ready", "refuses a frame laid out with display: none", JSON.stringify(hidden));
        const blank = await evaluate(`window.__fidelity.blank(${FRAME.width}, ${FRAME.height})`);
        check(
          !blank.ok && blank.reason === "blank" && !blank.hasBlob && blank.encodes === 0,
          "fails a page that draws nothing as blank, without encoding (the frame keeps its skeleton)",
          JSON.stringify(blank),
        );
        const unchanged = await evaluate(`window.__fidelity.unchanged("pure-dom", ${FRAME.width}, ${FRAME.height})`);
        check(
          unchanged.firstOk && unchanged.unchanged && unchanged.hashMatches && unchanged.encodes === 0,
          "returns unchanged for the previous markup hash without encoding",
          JSON.stringify(unchanged),
        );
      }
    }
    if (!FONT_FILE) console.log("NOTE web-font: no local font file to serve, case skipped");

    const sorted = [...ratios].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 1;
    const summary = `median ${(median * 100).toFixed(3)}%, max ${((sorted.at(-1) ?? 1) * 100).toFixed(3)}%`;
    if (median > MAX_MEDIAN_RATIO) failures.push(`median ratio ${summary}`);
    console.log(`${failures.length ? "FAIL" : "PASS"} snapshot fidelity: ${summary}`);
  } finally {
    socket.close();
    browser.kill();
    server.close();
    await rm(profile, { force: true, recursive: true }).catch(() => {});
  }

  if (failures.length) {
    process.exitCode = 1;
  }
}

await main();
