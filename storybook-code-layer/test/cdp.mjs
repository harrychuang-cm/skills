// Minimal Chrome DevTools Protocol driver (Node 24 global WebSocket, no deps).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launchChrome({ port = 9333, headless = true, width = 1440, height = 900 } = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-layer-chrome-"));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-features=Translate,OptimizationHints",
    `--window-size=${width},${height}`,
    ...(headless ? ["--headless=new"] : []),
    "about:blank",
  ];
  const child = spawn(CHROME, args, { stdio: "ignore" });
  let version = null;
  for (let i = 0; i < 100 && !version; i += 1) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    } catch {
      await delay(100);
    }
  }
  if (!version) throw new Error("Chrome did not start");
  return {
    port,
    child,
    userDataDir,
    async close() {
      child.kill("SIGTERM");
      await delay(300);
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

export class Cdp {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  static async connect(url) {
    const cdp = new Cdp(url);
    await new Promise((resolve, reject) => {
      cdp.ws = new WebSocket(url);
      cdp.ws.addEventListener("open", resolve, { once: true });
      cdp.ws.addEventListener("error", reject, { once: true });
      cdp.ws.addEventListener("message", (event) => cdp.onMessage(JSON.parse(event.data)));
    });
    return cdp;
  }

  onMessage(message) {
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} ${message.error.data ?? ""}`));
      else resolve(message.result);
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }

  close() {
    this.ws.close();
  }
}

export async function openPage(port, url) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
  cdp.targetId = target.id;
  const contexts = new Map();
  cdp.on("Runtime.executionContextCreated", ({ context }) => {
    if (context.auxData?.isDefault) contexts.set(context.auxData.frameId, context.id);
  });
  cdp.on("Runtime.executionContextsCleared", () => contexts.clear());
  cdp.contexts = contexts;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  return cdp;
}

export async function evaluate(cdp, expression, { contextId } = {}) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
    ...(contextId ? { contextId } : {}),
  });
  if (result.exceptionDetails) {
    throw new Error(`evaluate failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
  }
  return result.result.value;
}

/** Run a function body inside the Storybook preview iframe (same origin), with `w` and `d` bound. */
export function inPreview(cdp, body) {
  return evaluate(
    cdp,
    `(async () => { const f = document.getElementById("storybook-preview-iframe"); const w = f.contentWindow; const d = w.document; ${body} })()`,
  );
}

export async function waitFor(check, { timeout = 10000, interval = 100, label = "condition" } = {}) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await delay(interval);
  }
  throw new Error(`Timed out waiting for ${label} (last: ${JSON.stringify(last)})`);
}

export async function mouse(cdp, type, x, y, extra = {}) {
  await cdp.send("Input.dispatchMouseEvent", { type, x, y, button: extra.button ?? (type === "mouseMoved" ? "none" : "left"), clickCount: extra.clickCount ?? (type === "mouseMoved" ? 0 : 1), ...extra });
}

export async function click(cdp, x, y) {
  await mouse(cdp, "mouseMoved", x, y);
  await mouse(cdp, "mousePressed", x, y);
  await mouse(cdp, "mouseReleased", x, y);
}

const KEY_CODES = { Escape: 27, Enter: 13, Tab: 9, " ": 32, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };

export async function key(cdp, keyName, { modifiers = 0, code } = {}) {
  const upper = keyName.length === 1 ? keyName.toUpperCase() : keyName;
  const vk = KEY_CODES[keyName] ?? upper.charCodeAt(0);
  const resolvedCode = code ?? (keyName.length === 1 ? (/[0-9]/.test(keyName) ? `Digit${keyName}` : keyName === " " ? "Space" : `Key${upper}`) : keyName);
  const text = keyName.length === 1 && !(modifiers & 3) ? keyName : undefined;
  await cdp.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key: keyName, code: resolvedCode, windowsVirtualKeyCode: vk, modifiers, ...(text ? { text } : {}) });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: keyName, code: resolvedCode, windowsVirtualKeyCode: vk, modifiers });
}

export const delayMs = delay;
