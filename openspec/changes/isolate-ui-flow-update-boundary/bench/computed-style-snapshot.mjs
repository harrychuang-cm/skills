// Records computed styles of every prototype-inspector element in the UI Flow
// (isolate-ui-flow-update-boundary task 1.2, before and after the CSS split)
// on a Storybook started from create_flow_bench_fixture.mjs:
//   node computed-style-snapshot.mjs --base http://localhost:6170 --out before.json
// Compare two outputs with compare-styles.mjs.
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, index, all) => (arg.startsWith("--") ? [...pairs, [arg.slice(2), all[index + 1]]] : pairs), []),
);
const BASE = args.base ?? "http://localhost:6170";
const OUT = args.out ?? "computed-styles.json";
const STORIES = ["pages-prototypes-bench-growth-fund--default", "pages-prototypes-example-prototype--default"];
const WIDTHS = [1600, 1000, 640];
const PROPS = [
  "display", "position", "color", "background-color", "font-size", "font-weight", "padding", "border", "box-shadow",
  "z-index", "transform", "inline-size", "block-size",
  // extra coverage
  "fill", "stroke", "stroke-width", "opacity", "border-radius", "outline", "gap", "visibility", "pointer-events",
  "cursor", "animation-name", "overflow", "text-align", "line-height", "font-family", "inset", "margin", "flex-direction",
  "grid-template-columns", "align-items", "justify-content", "white-space", "text-overflow",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((c) => existsSync(c));

function browserWebSocketUrl(browser) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`Chrome CDP did not start.\n${stderr}`)), 20_000);
    browser.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
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
      const { method, reject, resolve, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`CDP ${method}: ${message.error.message}`));
      else resolve(message.result);
    });
  }
  send(method, params = {}, sessionId, timeoutMs = 120_000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { method, reject, resolve, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

async function openPage(cdp, width) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { flatten: true, targetId });
  const page = {
    targetId,
    send: (method, params = {}) => cdp.send(method, params, sessionId),
    async evaluate(expression) {
      const response = await page.send("Runtime.evaluate", { awaitPromise: true, expression, returnByValue: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? "evaluate failed");
      return response.result?.value;
    },
  };
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  // The narrowest width also exercises the reduced-motion rule.
  if (width === 640) await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  return page;
}

async function waitFor(page, expression, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await page.evaluate(expression).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${expression}`);
}

async function openFlow(page, url) {
  await page.send("Page.navigate", { url });
  await waitFor(page, `Boolean(document.querySelector(".prototype-inspector--flow:not([data-snapshot-preload]) .prototype-inspector__flow-frame"))`);
  for (let waited = 0, idle = 0; waited < 60_000 && idle < 1_500; waited += 250) {
    const queue = await page.evaluate(`document.querySelector(".prototype-inspector--flow")?.getAttribute("data-snapshot-queue")`);
    idle = queue === "idle" ? idle + 250 : 0;
    await sleep(250);
  }
  await sleep(800);
}

const SNAPSHOT = `(() => {
  const props = ${JSON.stringify(PROPS)};
  const out = {};
  const counts = {};
  for (const element of document.querySelectorAll("[class*='prototype-inspector']")) {
    const tokens = String(element.getAttribute("class")).split(/\\s+/).filter((t) => t.startsWith("prototype-inspector"));
    const key = tokens.join(".");
    counts[key] = (counts[key] ?? 0) + 1;
    if (counts[key] > 3) continue;
    const style = getComputedStyle(element);
    const record = {};
    for (const prop of props) record[prop] = style.getPropertyValue(prop);
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(element, pseudo);
      if (ps.content && ps.content !== "none" && ps.content !== "normal") {
        for (const prop of props) record[pseudo + " " + prop] = ps.getPropertyValue(prop);
      }
    }
    out[key + "#" + counts[key]] = record;
  }
  return out;
})()`;

const mouse = (page, type, x, y, extra = {}) => page.send("Input.dispatchMouseEvent", { button: "left", clickCount: 1, type, x, y, ...extra });
const firstFramePoint = (page) =>
  page.evaluate(`(() => {
    for (const frame of document.querySelectorAll(".prototype-inspector__flow-world .prototype-inspector__flow-frame[data-frame-id]")) {
      const target = frame.querySelector(".prototype-inspector__flow-frame-preview") ?? frame;
      const box = target.getBoundingClientRect();
      for (let fy = 0.3; fy < 0.95; fy += 0.1) for (let fx = 0.3; fx < 0.85; fx += 0.15) {
        const x = box.left + box.width * fx, y = box.top + box.height * fy;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        const hit = document.elementFromPoint(x, y)?.closest("[data-frame-id]");
        if (hit === frame) return { x, y, id: frame.getAttribute("data-frame-id") };
      }
    }
    return null;
  })()`);

async function main() {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "flow-style-snapshot-"));
  const browser = spawn(chrome, ["--headless=new", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profileDir}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const result = {};
  let socket;
  try {
    socket = new WebSocket(await browserWebSocketUrl(browser));
    await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
    const cdp = new CdpClient(socket);
    for (const story of STORIES) {
      for (const width of WIDTHS) {
        const page = await openPage(cdp, width);
        const url = `${BASE}/iframe.html?id=${story}&viewMode=story&globals=prototypeMode:flow`;
        await openFlow(page, url);
        await page.evaluate(`Object.keys(localStorage).filter((k) => k.startsWith("prototype-inspector:flow-")).forEach((k) => localStorage.removeItem(k)); sessionStorage.clear();`);
        await openFlow(page, url);
        const prefix = `${story.replace("pages-prototypes-", "")}@${width}`;
        result[`${prefix}/default`] = await page.evaluate(SNAPSHOT);

        await page.evaluate(`document.querySelector(".prototype-inspector__flow-scale").click()`);
        await sleep(300);
        result[`${prefix}/zoom-menu`] = await page.evaluate(SNAPSHOT);
        await page.evaluate(`document.querySelector(".prototype-inspector__flow-scale").click()`);
        await sleep(300);

        const point = await firstFramePoint(page);
        if (!point) throw new Error(`${prefix}: no frame on screen`);
        await mouse(page, "mouseMoved", point.x, point.y);
        await mouse(page, "mousePressed", point.x, point.y);
        await mouse(page, "mouseReleased", point.x, point.y);
        await sleep(400);
        result[`${prefix}/selected`] = await page.evaluate(SNAPSHOT);

        await sleep(700);
        await mouse(page, "mousePressed", point.x, point.y, { clickCount: 1 });
        await mouse(page, "mouseReleased", point.x, point.y, { clickCount: 1 });
        await mouse(page, "mousePressed", point.x, point.y, { clickCount: 2 });
        await mouse(page, "mouseReleased", point.x, point.y, { clickCount: 2 });
        await waitFor(page, `Boolean(document.querySelector('.prototype-inspector__flow-frame[data-interacting="true"]'))`, 15_000);
        await sleep(1_500);
        result[`${prefix}/interacting`] = await page.evaluate(SNAPSHOT);
        console.log(prefix, Object.keys(result[`${prefix}/default`]).length, "elements; interacting frame", point.id);
        await cdp.send("Target.closeTarget", { targetId: page.targetId }).catch(() => undefined);
      }
    }
  } finally {
    socket?.close();
    browser.kill("SIGTERM");
    await sleep(1_000);
    await rm(profileDir, { force: true, recursive: true, maxRetries: 5, retryDelay: 200 });
  }
  writeFileSync(OUT, JSON.stringify(result, null, 1));
  console.log("wrote", OUT, Object.keys(result).length, "states");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
