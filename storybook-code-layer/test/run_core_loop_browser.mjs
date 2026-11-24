#!/usr/bin/env node
// Scripted browser checks for the Code Layer core loop, driven over CDP with
// trusted input (Input.dispatchMouseEvent / dispatchKeyEvent).
//
//   CODE_LAYER_TEST_PROJECT=<storybook root> node test/run_core_loop_browser.mjs --stage 6 [--headed]
//
// Requires a running Storybook (STORYBOOK_URL, default http://localhost:6006)
// with Code Layer installed. Read-only for stage 6.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";

import { Cdp, click, delayMs, evaluate, inPreview, key, launchChrome, mouse, openPage, waitFor } from "./cdp.mjs";
import { loadPostcss, testProject } from "./helpers.mjs";

const BASE = process.env.STORYBOOK_URL ?? "http://localhost:6006";
const HANKO = "components-marks-badge-seal--hanko";
const args = process.argv.slice(2);
const stages = (args.includes("--stage") ? args[args.indexOf("--stage") + 1] : "6").split(",").map(Number);
const headed = args.includes("--headed");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;

const results = [];

async function check(name, fn) {
  if (only && !only.some((o) => name.includes(o))) return;
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - started, detail });
    process.stdout.write(`✔ ${name}${detail ? ` — ${detail}` : ""}\n`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: error.message });
    process.stdout.write(`✖ ${name}\n    ${error.message.split("\n").join("\n    ")}\n`);
  }
}

async function loadStory(cdp, storyId, { mode = false } = {}) {
  await cdp.send("Page.navigate", { url: `${BASE}/?path=/story/${storyId}${mode ? "&globals=codeLayer:!true" : ""}` });
  await waitFor(
    () => inPreview(cdp, `return !!(w.__CODE_LAYER__ && w.__CODE_LAYER__.index && d.querySelector("#storybook-root [data-component]"))`),
    { timeout: 90000, label: `story ${storyId} ready` },
  );
  await delayMs(300);
}

async function previewRect(cdp, selector) {
  return inPreview(
    cdp,
    `const fr = document.getElementById("storybook-preview-iframe").getBoundingClientRect();
     const el = d.querySelector(${JSON.stringify(selector)}); if (!el) return null;
     const r = el.getBoundingClientRect();
     return { x: fr.left + r.left + r.width / 2, y: fr.top + r.top + r.height / 2, left: fr.left + r.left, top: fr.top + r.top, width: r.width, height: r.height };`,
  );
}

async function toolButton(cdp) {
  return evaluate(
    cdp,
    `(() => { const b = document.querySelector('button[aria-label^="Code Layer"]'); if (!b) return null;
      const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: b.getAttribute("aria-label"), disabled: b.getAttribute("aria-disabled") === "true" || b.disabled, checked: b.getAttribute("aria-checked") }; })()`,
  );
}

async function overlayState(cdp) {
  return inPreview(
    cdp,
    `const host = d.querySelector("[data-code-layer-chrome]"); if (!host) return { mounted: false };
     const s = host.shadowRoot; const get = (c) => s.querySelector(c);
     const box = (c) => { const e = get(c); return { display: e.style.display, transform: e.style.transform, width: e.style.width, height: e.style.height }; };
     return { mounted: host.isConnected, open: host.matches(":popover-open"), display: getComputedStyle(host).display,
       hover: box(".hover"), select: box(".select"), hoverLabel: get(".hover-label").textContent, selectLabel: get(".select-label").textContent };`,
  );
}

async function setMode(cdp, on) {
  const button = await waitFor(() => toolButton(cdp), { label: "Code Layer tool button" });
  const isOn = button.checked === "true";
  if (isOn !== on) await click(cdp, button.x, button.y);
  await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.effective.state === ${JSON.stringify(on ? "active" : "off")}`), {
    label: `mode ${on ? "active" : "off"}`,
  });
}

async function selectBadge(cdp) {
  const rect = await previewRect(cdp, '[data-component="badge-seal"]');
  await click(cdp, rect.x, rect.y);
  return waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.lastTrace`), { label: "trace" });
}

async function stage6(cdp, chrome) {
  let rootBefore = null;

  await check("6.1 story loads with the runtime and index", async () => {
    await loadStory(cdp, HANKO);
    rootBefore = await inPreview(cdp, `return d.getElementById("storybook-root").innerHTML`);
    const state = await inPreview(cdp, `return { state: w.__CODE_LAYER__.effective.state, revision: w.__CODE_LAYER__.index.revision }`);
    assert.equal(state.state, "off");
    return `index ${state.revision.slice(0, 15)}…`;
  });

  await check("6.2 toolbar switch turns the mode on; global in the URL; overlay in the top layer", async () => {
    await setMode(cdp, true);
    const url = await evaluate(cdp, "location.href");
    assert.match(url, /globals=[^&]*codeLayer:!true/);
    const overlay = await overlayState(cdp);
    assert.ok(overlay.mounted && overlay.open, JSON.stringify(overlay));
    return url.split("?")[1];
  });

  await check("6.3 story DOM unchanged by enabling the mode", async () => {
    await delayMs(400);
    const rootAfter = await inPreview(cdp, `return d.getElementById("storybook-root").innerHTML`);
    assert.equal(rootAfter, rootBefore);
  });

  await check("6.4 hover outlines the component under the pointer", async () => {
    const rect = await previewRect(cdp, '[data-component="badge-seal"]');
    await mouse(cdp, "mouseMoved", rect.x, rect.y);
    const overlay = await waitFor(async () => {
      const o = await overlayState(cdp);
      return o.hover.display === "block" ? o : null;
    }, { label: "hover box" });
    assert.equal(overlay.hoverLabel, "Badge Seal / hanko");
    return overlay.hoverLabel;
  });

  await check("6.5 click selects the outermost component and traces it", async () => {
    const trace = await selectBadge(cdp);
    assert.equal(trace.label, "Badge Seal / hanko");
    assert.equal(trace.componentId, "badge-seal");
    const fill = trace.rows.find((r) => r.id === "fill");
    assert.equal(fill.verdict.kind, "rebind-token", JSON.stringify(fill.verdict));
    assert.equal(fill.verdict.token, "--md-comp-badge-seal-hanko-container-color");
    assert.equal(fill.verdict.fromToken, "--md-sys-color-primary");
    assert.deepEqual(fill.chain.map((l) => l.name), ["--md-comp-badge-seal-hanko-container-color", "--md-sys-color-primary", "--md-ref-color-red-60"]);
    assert.ok(fill.chain.every((l) => l.status === "ok"), JSON.stringify(fill.chain));
    assert.equal(fill.computedDisplay, "#FE0B05");
    assert.equal(fill.declaration.line, 59);
    assert.deepEqual(fill.writesTo, { files: ["tokens/tokens-comp.css", "storybook/tokens/tokens-comp.css"], line: 54, impact: 1 });
    const radius = trace.rows.find((r) => r.id === "radius");
    assert.equal(radius.verdict.kind, "rebind-declaration", JSON.stringify(radius.verdict));
    assert.equal(radius.verdict.fromToken, "--md-sys-shape-corner-sm");
    assert.equal(radius.verdict.ordinal, 7);
    assert.equal(radius.verdict.line, 60);
    assert.equal(radius.computed, "4px");
    assert.deepEqual(radius.chain.map((l) => [l.name, l.value]), [["--md-sys-shape-corner-sm", "4px"], ["--md-ref-radius-4", "4px"]]);
    const readOnly = trace.rows.filter((r) => !r.editableInProof);
    assert.ok(readOnly.every((r) => r.computed !== ""), "read-only rows have values");
    return readOnly.map((r) => `${r.id}=${r.computedDisplay}(${r.verdict.kind === "read-only" ? r.verdict.reason : r.verdict.kind})`).join(" ");
  });

  await check("6.6 the outline of the tilted hanko carries the same rotation", async () => {
    const overlay = await overlayState(cdp);
    const transform = await inPreview(cdp, `return getComputedStyle(d.querySelector('[data-component="badge-seal"]')).transform`);
    const [a, b, c, dd] = transform.slice(7, -1).split(",").map(Number);
    assert.ok(overlay.select.transform.includes(`matrix(${a}, ${b}, ${c}, ${dd}, 0, 0)`), `${overlay.select.transform} vs ${transform}`);
    return overlay.select.transform;
  });

  await check("6.7 Esc clears the selection", async () => {
    await key(cdp, "Escape");
    await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.lastTrace === null`), { label: "selection cleared" });
  });

  await check("6.8 keys: story and single-key shortcuts blocked, Alt chords pass", async () => {
    await selectBadge(cdp);
    const focusBefore = await evaluate(cdp, `document.activeElement && document.activeElement.id`);
    await key(cdp, "1");
    await delayMs(200);
    const focusAfter1 = await evaluate(cdp, `document.activeElement && document.activeElement.id`);
    assert.equal(focusAfter1, focusBefore, "1 must not move manager focus");
    const measureBefore = await inPreview(cdp, `return Boolean(w.__CODE_LAYER__.globals.measureEnabled)`);
    await key(cdp, "m");
    await delayMs(300);
    const measureAfter = await inPreview(cdp, `return Boolean(w.__CODE_LAYER__.globals.measureEnabled)`);
    assert.equal(measureAfter, measureBefore, "M must not toggle measure");
    const navVisible = () => evaluate(cdp, `(() => { const el = document.getElementById("storybook-explorer-tree") || document.querySelector("nav"); return !!(el && el.getBoundingClientRect().width > 0); })()`);
    const before = await navVisible();
    await key(cdp, "s", { modifiers: 1 });
    const toggled = await waitFor(async () => ((await navVisible()) !== before ? true : null), { timeout: 3000, label: "Alt+S toggles the sidebar" });
    await key(cdp, "s", { modifiers: 1 });
    await waitFor(async () => ((await navVisible()) === before ? true : null), { timeout: 3000, label: "sidebar restored" });
    return `focus stays on ${focusBefore}; alt+S toggled=${toggled}`;
  });

  await check("6.9 probe confirms both editable rows, also with an injected transition", async () => {
    const plain = await inPreview(cdp, `return [await w.__CODE_LAYER__.probe("fill"), await w.__CODE_LAYER__.probe("radius")]`);
    assert.deepEqual(plain, ["confirmed", "confirmed"]);
    const withTransition = await inPreview(
      cdp,
      `const sheet = new w.CSSStyleSheet(); sheet.replaceSync(".md-badge-seal { transition: all 1s }");
       d.adoptedStyleSheets = [...d.adoptedStyleSheets, sheet];
       const el = d.querySelector('[data-component="badge-seal"]');
       const before = d.getAnimations().length;
       const results = [await w.__CODE_LAYER__.probe("fill"), await w.__CODE_LAYER__.probe("radius")];
       await new Promise((r) => w.requestAnimationFrame(() => w.requestAnimationFrame(r)));
       const after = d.getAnimations().length;
       d.adoptedStyleSheets = d.adoptedStyleSheets.filter((s) => s !== sheet);
       return { results, before, after, bg: getComputedStyle(el).backgroundColor };`,
    );
    assert.deepEqual(withTransition.results, ["confirmed", "confirmed"]);
    assert.equal(withTransition.after, withTransition.before, "no transition was started");
    assert.equal(withTransition.bg, "rgb(254, 11, 5)");
    const rule = await inPreview(cdp, `const s = [...d.querySelectorAll("style[data-vite-dev-id]")].find((e) => e.dataset.viteDevId.endsWith("/BadgeSeal.css")); return [...s.sheet.cssRules].find((r) => r.selectorText === ".md-badge-seal--hanko").style.cssText`);
    assert.match(rule, /border-radius: var\(--md-sys-shape-corner-sm\)/);
    return `animations ${withTransition.before}→${withTransition.after}`;
  });

  await check("6.10 every component stylesheet passes the identity check", async () => {
    const result = await inPreview(
      cdp,
      `const files = w.__CODE_LAYER__.index.css.files.map((f) => f.file);
       for (const file of files) { await w.Function("p", "return import(p)")("/" + file); }
       await new Promise((r) => setTimeout(r, 300));
       w.__CODE_LAYER__.context = null;
       const ctx = await w.__CODE_LAYER__.ensureContext();
       return [...ctx.identities.values()].map((i) => [i.file.file, i.ok, i.reason]);`,
    );
    assert.equal(result.length, 7, JSON.stringify(result));
    assert.ok(result.every(([, ok]) => ok), JSON.stringify(result));
    return `${result.length} files ok`;
  });

  await check("6.11 browser rule numbering equals the server walk on the ordinal fixture", async () => {
    const css = [
      ".a { color: red }",
      "@keyframes spin { from { opacity: 0 } to { opacity: 1 } }",
      "@font-face { font-family: X; src: local(X) }",
      ".b { color: red }",
      "@media (max-width: 1px) { .c { color: red } }",
      "@supports (display: grid) { .d { color: red } @media print { .e { color: red } } }",
      ".f { color: red; & .g { color: blue } .h { color: green } }",
      "@layer base { .i { color: red } }",
      ".j { color: red }",
    ].join("\n");
    const postcss = await loadPostcss();
    const { walkStyleRules } = await import("../template/code-layer/server/css-index.mjs");
    const server = [];
    walkStyleRules(postcss.parse(css), (rule) => server.push(rule.selector));
    const browser = await inPreview(cdp, `const s = new w.CSSStyleSheet(); s.replaceSync(${JSON.stringify(css)}); return w.__CODE_LAYER__.debug.flattenStyleRules(s.cssRules).map((f) => f.rule.selectorText);`);
    assert.equal(browser.length, server.length, `${JSON.stringify(browser)} vs ${JSON.stringify(server)}`);
    return `${browser.length} rules in the same order`;
  });

  await check("6.12 dark theme: a shadowed sys token is marked with its source", async () => {
    const chain = await inPreview(
      cdp,
      `const html = d.documentElement; const previous = html.getAttribute("data-storybook-template-theme");
       html.setAttribute("data-storybook-template-theme", "dark");
       w.__CODE_LAYER__.context = null; const ctx = await w.__CODE_LAYER__.ensureContext();
       const chain = ctx.resolver.chain("--md-sys-color-surface");
       if (previous === null) html.removeAttribute("data-storybook-template-theme"); else html.setAttribute("data-storybook-template-theme", previous);
       w.__CODE_LAYER__.context = null;
       return chain;`,
    );
    assert.equal(chain[0].status, "overridden", JSON.stringify(chain[0]));
    assert.equal(chain[0].overriddenBy.file, "storybook/src/styles/storybook.css");
    assert.equal(chain[0].overriddenBy.line, 82);
    return `${chain[0].name} ← ${chain[0].overriddenBy.file}:${chain[0].overriddenBy.line}`;
  });

  await check("6.13 inert body freezes the overlay; preparing hides it", async () => {
    await key(cdp, "Escape");
    const inert = await inPreview(cdp, `d.body.inert = true; return true`);
    const rect = await previewRect(cdp, '[data-component="badge-seal"]');
    await click(cdp, rect.x, rect.y);
    await delayMs(300);
    const selected = await inPreview(cdp, `const t = w.__CODE_LAYER__.lastTrace; d.body.inert = false; return t`);
    assert.equal(selected, null, "no selection while inert");
    const display = await inPreview(
      cdp,
      `const b = d.body; const hadMain = b.classList.contains("sb-show-main");
       b.classList.add("sb-show-preparing-story"); b.classList.remove("sb-show-main");
       const host = d.querySelector("[data-code-layer-chrome]"); const shown = getComputedStyle(host).display;
       b.classList.remove("sb-show-preparing-story"); if (hadMain) b.classList.add("sb-show-main");
       return shown;`,
    );
    assert.equal(display, "none");
    return `inert=${inert} preparing display=${display}`;
  });

  await check("6.14 the outline follows page scroll", async () => {
    await inPreview(cdp, `const s = d.createElement("div"); s.id = "code-layer-test-spacer"; s.style.height = "3000px"; d.body.appendChild(s); return true`);
    await selectBadge(cdp);
    await delayMs(100);
    const y = (o) => Number(/translate\([^,]+,\s*([-\d.]+)px\)/.exec(o.select.transform)?.[1]);
    const before = y(await overlayState(cdp));
    const rect = await previewRect(cdp, '[data-component="badge-seal"]');
    await mouse(cdp, "mouseWheel", rect.x, rect.y, { deltaX: 0, deltaY: 200 });
    const after = await waitFor(async () => {
      const value = y(await overlayState(cdp));
      return value !== before ? value : null;
    }, { timeout: 3000, label: "outline moved" });
    await inPreview(cdp, `w.scrollTo(0, 0); d.getElementById("code-layer-test-spacer").remove(); return true`);
    return `y ${before} → ${after}`;
  });

  await check("6.15 clicking a link in a story selects it and does not navigate", async () => {
    await loadStory(cdp, "components-marks-corner-brand-plate--as-home-link", { mode: true });
    await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.effective.state === "active"`), { label: "active after navigation" });
    const href = await inPreview(cdp, `return w.location.href`);
    const rect = await previewRect(cdp, '[data-component="corner-brand-plate"]');
    await click(cdp, rect.x, rect.y);
    const trace = await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.lastTrace`), { label: "trace" });
    await delayMs(300);
    assert.equal(await inPreview(cdp, `return w.location.href`), href);
    return trace.label;
  });

  await check("6.16 dormant when iframe.html is opened directly", async () => {
    const page = await openPage(chrome.port, `${BASE}/iframe.html?id=${HANKO}&viewMode=story&globals=codeLayer:!true`);
    try {
      await waitFor(() => evaluate(page, `!!document.querySelector("#storybook-root [data-component]")`), { timeout: 30000, label: "iframe story" });
      await delayMs(300);
      assert.equal(await evaluate(page, `typeof window.__CODE_LAYER__`), "undefined");
      assert.equal(await evaluate(page, `!!document.querySelector("[data-code-layer-chrome]")`), false);
    } finally {
      await chrome.closeTarget(page);
    }
  });

  await check("6.17 dormant inside a page on another origin; manager tool disabled when framed", async () => {
    const server = http.createServer((req, res) => {
      res.setHeader("Content-Type", "text/html");
      const src = req.url.startsWith("/manager")
        ? `${BASE}/?path=/story/${HANKO}`
        : `${BASE}/iframe.html?id=${HANKO}&viewMode=story&globals=codeLayer:!true`;
      res.end(`<!doctype html><iframe id="f" src="${src}" style="width:1200px;height:800px"></iframe>`);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const pages = [];
    try {
      const preview = await openPage(chrome.port, `http://127.0.0.1:${port}/preview`);
      pages.push(preview);
      const frameValue = async (page, expression) => {
        const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json();
        const parent = targets.find((t) => t.id === page.targetId);
        const frame = targets.find((t) => t.type === "iframe" && t.url.startsWith(BASE) && (!t.parentId || t.parentId === parent?.id));
        if (!frame) return null;
        const session = await Cdp.connect(frame.webSocketDebuggerUrl);
        try {
          return await evaluate(session, expression);
        } finally {
          session.close();
        }
      };
      await waitFor(() => frameValue(preview, `!!document.querySelector("#storybook-root [data-component]")`), { timeout: 30000, label: "framed story" });
      await delayMs(300);
      assert.equal(await frameValue(preview, `typeof window.__CODE_LAYER__`), "undefined");
      const manager = await openPage(chrome.port, `http://127.0.0.1:${port}/manager`);
      pages.push(manager);
      const tool = await waitFor(() => frameValue(manager, `(() => { const b = document.querySelector('button[aria-label^="Code Layer"]'); return b ? { label: b.getAttribute("aria-label"), disabled: b.getAttribute("aria-disabled") } : null; })()`), { timeout: 60000, label: "framed manager tool" });
      assert.equal(tool.disabled, "true", JSON.stringify(tool));
      assert.match(tool.label, /已停用/);
    } finally {
      for (const page of pages) await chrome.closeTarget(page);
      server.close();
    }
  });

  await check("6.18 switching the mode off removes the overlay", async () => {
    await loadStory(cdp, HANKO);
    await setMode(cdp, false);
    const overlay = await overlayState(cdp);
    assert.equal(overlay.mounted, false, JSON.stringify(overlay));
  });
}

// ---- stage 7: panel, docking, picker, live preview --------------------------

const LAB_ROOT = () => path.dirname(testProject());
const BADGE_CSS = () => path.join(testProject(), "src/components/badge-seal/BadgeSeal.css");
const TOKEN_FILES = () => ["tokens/tokens-comp.css", "storybook/tokens/tokens-comp.css"].map((p) => path.join(LAB_ROOT(), p));

function sha(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function diskHashes() {
  return Object.fromEntries([BADGE_CSS(), ...TOKEN_FILES()].map((f) => [path.relative(LAB_ROOT(), f), sha(f)]));
}

function inManager(cdp, body) {
  return evaluate(cdp, `(async () => { ${body} })()`);
}

async function managerRect(cdp, selector) {
  return inManager(cdp, `const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null; return { x: r.left + Math.min(r.width / 2, 120), y: r.top + Math.min(r.height / 2, 12), left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };`);
}

async function panelDock(cdp) {
  return inManager(cdp, `const panel = document.getElementById("storybook-panel-root"); const frame = document.getElementById("storybook-preview-iframe");
    if (!panel || !frame) return { visible: false };
    const ours = document.querySelector("[data-code-layer-panel]"); const selected = !!ours && ours.getBoundingClientRect().width > 0;
    const p = panel.getBoundingClientRect(); const f = frame.getBoundingClientRect();
    const visible = p.width > 0 && p.height > 0;
    let stored = null; try { stored = JSON.parse(localStorage.getItem("@storybook/manager/store") || "{}").layout?.panelPosition ?? null; } catch {}
    return { visible, selected, side: !visible ? null : p.left >= f.right - 4 ? "right" : p.top >= f.bottom - 4 ? "bottom" : "other", stored };`);
}

async function previewComputed(cdp) {
  return inPreview(cdp, `const el = d.querySelector('[data-component="badge-seal"]'); const cs = getComputedStyle(el); return { bg: cs.backgroundColor, radius: cs.borderTopLeftRadius };`);
}

async function draftStatuses(cdp) {
  return inManager(cdp, `return [...document.querySelectorAll("[data-code-layer-draft]")].map((e) => ({ id: e.getAttribute("data-code-layer-draft"), text: e.textContent }));`);
}

async function pickToken(cdp, rowId, search, token) {
  const row = await waitFor(() => managerRect(cdp, `[data-code-layer-row="${rowId}"]`), { label: `row ${rowId}` });
  await click(cdp, row.x, row.y);
  await waitFor(() => managerRect(cdp, `[data-code-layer-picker="${rowId}"]`), { label: `picker ${rowId}` });
  await waitFor(() => inManager(cdp, `return !document.querySelector('[data-code-layer-picker="${rowId}"]').textContent.includes("確認這條宣告")`), { label: "probe confirmed" });
  await cdp.send("Input.insertText", { text: search });
  const option = await waitFor(() => managerRect(cdp, `[data-code-layer-picker="${rowId}"] [data-token="${token}"]`), { label: `option ${token}` });
  await mouse(cdp, "mouseMoved", option.x, option.y);
  return option;
}

async function stage7(cdp) {
  const startHashes = diskHashes();
  let originalSide = null;

  await check("7.1 turning the mode on docks the panel right and selects 設計; localStorage keeps the old position", async () => {
    await loadStory(cdp, HANKO);
    await inManager(cdp, `localStorage.removeItem("code-layer/v1/showa-pop-80sjp-storybook/drafts"); sessionStorage.clear(); return true`);
    await loadStory(cdp, HANKO);
    await delayMs(500);
    originalSide = (await panelDock(cdp)).side ?? "bottom";
    await setMode(cdp, true);
    const dockState = await waitFor(async () => {
      const d = await panelDock(cdp);
      return d.visible && d.side === "right" && d.selected ? d : null;
    }, { label: "panel docked right with 設計 selected" });
    assert.notEqual(dockState.stored, "right", "localStorage must not keep right");
    return `before=${originalSide} now=${dockState.side} stored=${dockState.stored}`;
  });

  await check("7.2 selecting the hanko shows its rows in the panel", async () => {
    await selectBadge(cdp);
    const panel = await waitFor(() => inManager(cdp, `const t = document.querySelector("[data-code-layer-title]"); return t && t.textContent === "Badge Seal / hanko" ? document.querySelector("[data-code-layer-panel]").textContent : null`), { label: "panel title" });
    assert.match(panel, /#FE0B05/);
    assert.match(panel, /comp-badge-seal-hanko-container-color/);
    assert.match(panel, /寫入 tokens\/tokens-comp\.css:54（＋鏡像 storybook\/tokens\/tokens-comp\.css）· 影響 1 處宣告/);
    assert.match(panel, /寫入 storybook\/src\/components\/badge-seal\/BadgeSeal\.css:60 · 影響 1 處宣告/);
    assert.match(panel, /尚不可編輯/);
  });

  await check("7.3 hovering a token previews it live; choosing stages a draft; disk untouched", async () => {
    const option = await pickToken(cdp, "fill", "secondary", "--md-sys-color-secondary");
    await waitFor(async () => ((await previewComputed(cdp)).bg === "rgb(16, 160, 226)" ? true : null), { label: "transient fill preview" });
    await click(cdp, option.x, option.y);
    await waitFor(async () => ((await draftStatuses(cdp)).length === 1 ? true : null), { label: "one draft" });
    const statuses = await waitFor(async () => {
      const list = await draftStatuses(cdp);
      return list[0]?.text.includes("預覽中") ? list : null;
    }, { label: "previewing chip" });
    assert.equal((await previewComputed(cdp)).bg, "rgb(16, 160, 226)");
    assert.deepEqual(diskHashes(), startHashes, "no file written");
    return statuses[0].text;
  });

  await check("7.4 the radius row stages a declaration re-bind (8px)", async () => {
    const option = await pickToken(cdp, "radius", "corner-md", "--md-sys-shape-corner-md");
    await click(cdp, option.x, option.y);
    await waitFor(async () => ((await previewComputed(cdp)).radius === "8px" ? true : null), { label: "radius preview" });
    const list = await waitFor(async () => {
      const l = await draftStatuses(cdp);
      return l.length === 2 && l.every((d) => d.text.includes("預覽中")) ? l : null;
    }, { label: "two previewing drafts" });
    assert.ok(list.some((d) => d.text.includes("寫入 storybook/src/components/badge-seal/BadgeSeal.css:60 · 影響 1 處宣告") && d.text.includes("影響 1 處宣告")), JSON.stringify(list));
    assert.ok(list.some((d) => d.text.includes("寫入 tokens/tokens-comp.css:54（＋鏡像）· 影響 1 處宣告")), JSON.stringify(list));
    assert.deepEqual(diskHashes(), startHashes, "no file written");
  });

  await check("7.5 hold to compare shows the original, release restores the preview", async () => {
    const button = await managerRect(cdp, '[data-code-layer-action="compare"]');
    await mouse(cdp, "mouseMoved", button.x, button.y);
    await mouse(cdp, "mousePressed", button.x, button.y);
    await waitFor(async () => {
      const c = await previewComputed(cdp);
      return c.bg === "rgb(254, 11, 5)" && c.radius === "4px" ? true : null;
    }, { label: "original while held" });
    await mouse(cdp, "mouseReleased", button.x, button.y);
    await waitFor(async () => {
      const c = await previewComputed(cdp);
      return c.bg === "rgb(16, 160, 226)" && c.radius === "8px" ? true : null;
    }, { label: "preview after release" });
  });

  await check("7.6 an unrelated hot update (BadgeSeal.css re-saved unchanged) keeps the previews", async () => {
    await inPreview(cdp, `const s = [...d.querySelectorAll("style[data-vite-dev-id]")].find((e) => e.dataset.viteDevId.endsWith("/BadgeSeal.css")); w.__oldSheet = s.sheet; return true`);
    fs.writeFileSync(BADGE_CSS(), fs.readFileSync(BADGE_CSS()));
    await waitFor(() => inPreview(cdp, `const s = [...d.querySelectorAll("style[data-vite-dev-id]")].find((e) => e.dataset.viteDevId.endsWith("/BadgeSeal.css")); return s.sheet !== w.__oldSheet`), { timeout: 8000, label: "sheet replaced by Vite" });
    await waitFor(async () => ((await previewComputed(cdp)).radius === "8px" ? true : null), { label: "preview re-applied" });
    const list = await draftStatuses(cdp);
    assert.ok(list.every((d) => d.text.includes("預覽中")), JSON.stringify(list));
    assert.deepEqual(diskHashes(), startHashes);
  });

  await check("7.7 an outside edit of the same declaration shows a conflict, and recovers when undone", async () => {
    const original = fs.readFileSync(BADGE_CSS());
    const edited = original.toString("utf8").replace("border-radius: var(--md-sys-shape-corner-sm);", "border-radius: var(--md-sys-shape-corner-full);");
    assert.notEqual(edited, original.toString("utf8"));
    fs.writeFileSync(BADGE_CSS(), edited);
    try {
      await waitFor(async () => {
        const list = await draftStatuses(cdp);
        return list.some((d) => d.text.includes("來源已變更")) ? list : null;
      }, { timeout: 10000, label: "conflict chip" });
    } finally {
      fs.writeFileSync(BADGE_CSS(), original);
    }
    await waitFor(async () => {
      const list = await draftStatuses(cdp);
      return list.length === 2 && list.every((d) => d.text.includes("預覽中")) ? list : null;
    }, { timeout: 10000, label: "previewing again" });
    assert.deepEqual(diskHashes(), startHashes);
  });

  await check("7.8 reload keeps the mode, the drafts, the previews and the selection", async () => {
    await cdp.send("Page.reload");
    await waitFor(() => inPreview(cdp, `return !!(w.__CODE_LAYER__ && w.__CODE_LAYER__.effective.state === "active")`), { timeout: 60000, label: "active after reload" });
    await waitFor(async () => ((await draftStatuses(cdp)).length === 2 ? true : null), { label: "drafts restored" });
    await waitFor(async () => {
      const c = await previewComputed(cdp);
      return c.bg === "rgb(16, 160, 226)" && c.radius === "8px" ? true : null;
    }, { label: "previews restored" });
    await waitFor(() => inManager(cdp, `return document.querySelector("[data-code-layer-title]")?.textContent === "Badge Seal / hanko"`), { label: "selection restored" });
    const dockState = await panelDock(cdp);
    assert.equal(dockState.side, "right");
  });

  await check("7.9 going to another story and back keeps the previews", async () => {
    const item = await waitFor(() => managerRect(cdp, "#components-marks-badge-seal--price-roundel"), { label: "sidebar item" });
    await click(cdp, item.x, item.y);
    await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.storyId === "components-marks-badge-seal--price-roundel"`), { label: "price roundel" });
    const back = await managerRect(cdp, `#${HANKO}`);
    await click(cdp, back.x, back.y);
    await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.storyId === ${JSON.stringify(HANKO)} && !!d.querySelector('[data-component="badge-seal"]')`), { label: "back to hanko" });
    await waitFor(async () => {
      const c = await previewComputed(cdp);
      return c.bg === "rgb(16, 160, 226)" && c.radius === "8px" ? true : null;
    }, { label: "previews kept" });
  });

  await check("7.10 a second tab without the global opens with the original panel position", async () => {
    const page = await openPage(cdp.chrome.port, `${BASE}/?path=/story/${HANKO}`);
    try {
      await waitFor(() => evaluate(page, `!!document.getElementById("storybook-preview-iframe")`), { timeout: 30000, label: "second tab" });
      const side = await waitFor(async () => {
        const d = await panelDock(page);
        return d.side ?? (d.visible === false ? "hidden" : null);
      }, { timeout: 30000, label: "second tab layout" });
      assert.notEqual(side, "right");
      return side;
    } finally {
      await cdp.chrome.closeTarget(page);
    }
  });

  await check("7.11 turning the mode off removes previews and restores the layout; reload keeps it", async () => {
    await setMode(cdp, false);
    await waitFor(async () => ((await previewComputed(cdp)).bg === "rgb(254, 11, 5)" ? true : null), { label: "previews removed" });
    await waitFor(async () => ((await panelDock(cdp)).side !== "right" ? true : null), { label: "layout restored" });
    await cdp.send("Page.reload");
    await waitFor(() => inPreview(cdp, `return !!(w.__CODE_LAYER__ && d.querySelector('[data-component="badge-seal"]'))`), { timeout: 60000, label: "reloaded" });
    await delayMs(500);
    const d = await panelDock(cdp);
    assert.notEqual(d.side, "right");
    return `side after reload=${d.side ?? "hidden"} (started as ${originalSide})`;
  });

  await check("7.12 on, off, on, reload: still docked right; then discard everything", async () => {
    await setMode(cdp, true);
    await setMode(cdp, false);
    await setMode(cdp, true);
    await cdp.send("Page.reload");
    await waitFor(() => inPreview(cdp, `return !!(w.__CODE_LAYER__ && w.__CODE_LAYER__.effective.state === "active")`), { timeout: 60000, label: "active after reload" });
    await waitFor(async () => ((await panelDock(cdp)).side === "right" ? true : null), { label: "docked after reload" });
    const discard = await waitFor(() => managerRect(cdp, '[data-code-layer-action="discard"]'), { label: "discard button" });
    await click(cdp, discard.x, discard.y);
    await waitFor(async () => ((await draftStatuses(cdp)).length === 0 ? true : null), { label: "no drafts" });
    await waitFor(async () => {
      const c = await previewComputed(cdp);
      return c.bg === "rgb(254, 11, 5)" && c.radius === "4px" ? true : null;
    }, { label: "original look" });
    await setMode(cdp, false);
    assert.deepEqual(diskHashes(), startHashes, "files equal stage start");
  });
}

// ---- stage 11: apply, verify, undo -------------------------------------------

const TRUTH = () => path.join(LAB_ROOT(), "tokens/tokens-comp.css");
const MIRROR = () => path.join(testProject(), "tokens/tokens-comp.css");
const NEW_TOKEN_LINE = "  --md-comp-badge-seal-hanko-container-color: var(--md-sys-color-secondary);";
const NEW_RADIUS_LINE = "  border-radius: var(--md-sys-shape-corner-md);";

function line(file, number) {
  return fs.readFileSync(file, "utf8").split("\n")[number - 1];
}

async function clickAction(cdp, action) {
  const rect = await waitFor(() => managerRect(cdp, `[data-code-layer-action="${action}"]`), { label: `action ${action}` });
  const enabled = await inManager(cdp, `return !document.querySelector('[data-code-layer-action="${action}"]').disabled`);
  assert.ok(enabled, `${action} is disabled`);
  await click(cdp, rect.x, rect.y);
}

async function reportState(cdp) {
  return inManager(cdp, `const r = document.querySelector("[data-code-layer-report]"); if (!r) return null;
    return { status: r.getAttribute("data-code-layer-report"), mode: r.getAttribute("data-code-layer-report-mode"), text: r.textContent,
      items: [...r.querySelectorAll("[data-code-layer-verify-item]")].map((e) => e.getAttribute("data-status")) };`);
}

async function waitReport(cdp, mode, statuses, timeout = 30000) {
  return waitFor(async () => {
    const r = await reportState(cdp);
    return r && r.mode === mode && statuses.includes(r.status) ? r : null;
  }, { timeout, label: `${mode} report in ${statuses.join("/")}` });
}

async function stageBoth(cdp) {
  await loadStory(cdp, HANKO, { mode: true });
  await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.effective.state === "active"`), { label: "active" });
  await selectBadge(cdp);
  const fill = await pickToken(cdp, "fill", "secondary", "--md-sys-color-secondary");
  await click(cdp, fill.x, fill.y);
  const radius = await pickToken(cdp, "radius", "corner-md", "--md-sys-shape-corner-md");
  await click(cdp, radius.x, radius.y);
  let seen = null;
  try {
    await waitFor(async () => {
      const list = await draftStatuses(cdp);
      seen = list;
      return list.length === 2 && list.every((d) => d.text.includes("預覽中")) ? list : null;
    }, { label: "two previewing drafts" });
  } catch (error) {
    const extra = await inManager(cdp, `return { report: document.querySelector("[data-code-layer-report]")?.textContent ?? null, pending: sessionStorage.getItem("code-layer/v1/pending-verification"), last: sessionStorage.getItem("code-layer/v1/last-apply")?.slice(0, 300) }`).catch((e) => e.message);
    const preview = await inPreview(cdp, `const l = w.__CODE_LAYER__.live; return { previews: l.hasPreviews(), localSettled: [...(l.localSettled ?? [])], settled: [...(l.settled ?? [])], drafts: l.drafts.map((x) => x.id), dirty: l.dirty, lastError: l.lastError, statuses: [...l.statuses] }`).catch((e) => e.message);
    throw new Error(`${error.message}\n drafts=${JSON.stringify(seen)}\n manager=${JSON.stringify(extra)}\n preview=${JSON.stringify(preview)}`);
  }
}

function assertWritten() {
  assert.equal(line(TRUTH(), 54), NEW_TOKEN_LINE);
  assert.ok(fs.readFileSync(TRUTH()).equals(fs.readFileSync(MIRROR())), "mirror equals source of truth");
  assert.equal(line(BADGE_CSS(), 60), NEW_RADIUS_LINE);
}

async function assertNewLook(cdp) {
  await waitFor(async () => {
    const c = await previewComputed(cdp);
    return c.bg === "rgb(16, 160, 226)" && c.radius === "8px" ? true : null;
  }, { label: "new look from source" });
  assert.equal(await inPreview(cdp, `return w.__CODE_LAYER__.live.hasPreviews()`), false, "no preview left");
}

async function undoAndCheck(cdp, startHashes) {
  await clickAction(cdp, "undo");
  const report = await waitReport(cdp, "undo", ["verified"]);
  assert.deepEqual(diskHashes(), startHashes, "undo restored the exact bytes");
  const c = await previewComputed(cdp);
  assert.deepEqual(c, { bg: "rgb(254, 11, 5)", radius: "4px" });
  assert.equal(await inPreview(cdp, `return w.__CODE_LAYER__.live.hasPreviews()`), false, "undo did not bring previews back");
  return report;
}

async function stage11(cdp) {
  const startHashes = diskHashes();
  await cdp.send("Network.setBlockedURLs", { urls: [] });

  await check("11.1 apply writes both changes and the report says 已寫入並驗證", async () => {
    await stageBoth(cdp);
    await clickAction(cdp, "apply");
    const report = await waitReport(cdp, "apply", ["verified", "mismatch", "timeout", "written-not-observable"]);
    assert.equal(report.status, "verified", report.text);
    assert.deepEqual(report.items, ["verified", "verified"]);
    assertWritten();
    await assertNewLook(cdp);
    assert.equal((await draftStatuses(cdp)).length, 0, "applied drafts left the list");
    const state = await (await fetch(`${BASE}/__code-layer/state`)).json();
    assert.equal(state.undoStack.at(-1).verification?.status, "verified");
    return report.text.slice(0, 80);
  });

  await check("11.2 undo restores the exact bytes and the original look, without previews", async () => {
    const report = await undoAndCheck(cdp, startHashes);
    return report.text.slice(0, 40);
  });

  await check("11.3 with an injected transition, apply and undo still verify", async () => {
    await stageBoth(cdp);
    await inPreview(cdp, `const s = new w.CSSStyleSheet(); s.replaceSync(".md-badge-seal { transition: all 1s }"); d.adoptedStyleSheets = [...d.adoptedStyleSheets, s]; w.__codeLayerTransition = s; return true`);
    try {
      await clickAction(cdp, "apply");
      const applied = await waitReport(cdp, "apply", ["verified", "mismatch", "timeout", "written-not-observable"]);
      assert.equal(applied.status, "verified", applied.text);
      await undoAndCheck(cdp, startHashes);
    } finally {
      await inPreview(cdp, `d.adoptedStyleSheets = d.adoptedStyleSheets.filter((s) => s !== w.__codeLayerTransition); return true`);
    }
  });

  await check("11.4 reloading the preview during verification still ends 已驗證", async () => {
    await stageBoth(cdp);
    await cdp.send("Network.setBlockedURLs", { urls: ["*BadgeSeal.css*", "*tokens/tokens.css*"] });
    await clickAction(cdp, "apply");
    await waitFor(async () => {
      const r = await reportState(cdp);
      return r && r.status === "verifying" ? r : null;
    }, { label: "verifying" });
    await cdp.send("Network.setBlockedURLs", { urls: [] });
    await inPreview(cdp, `w.location.reload(); return true`);
    const report = await waitReport(cdp, "apply", ["verified", "mismatch", "timeout", "written-not-observable"], 40000);
    assert.equal(report.status, "verified", report.text);
    assertWritten();
    await waitFor(() => inPreview(cdp, `return !!(w.__CODE_LAYER__ && d.querySelector('[data-component="badge-seal"]'))`), { label: "preview back" });
    await undoAndCheck(cdp, startHashes);
  });

  await check("11.5 a full tab reload during verification still ends 已驗證", async () => {
    await stageBoth(cdp);
    await cdp.send("Network.setBlockedURLs", { urls: ["*BadgeSeal.css*", "*tokens/tokens.css*"] });
    await clickAction(cdp, "apply");
    await waitFor(async () => {
      const r = await reportState(cdp);
      return r && r.status === "verifying" ? r : null;
    }, { label: "verifying" });
    await cdp.send("Network.setBlockedURLs", { urls: [] });
    await cdp.send("Page.reload");
    const report = await waitReport(cdp, "apply", ["verified", "mismatch", "timeout", "written-not-observable"], 60000);
    assert.equal(report.status, "verified", report.text);
    assertWritten();
    await waitFor(() => inPreview(cdp, `return !!(w.__CODE_LAYER__ && w.__CODE_LAYER__.effective.state === "active" && d.querySelector('[data-component="badge-seal"]'))`), { label: "preview back" });
    await undoAndCheck(cdp, startHashes);
  });

  await check("11.6 negative control: a blocked stylesheet update ends 逾時, never 已驗證; reload-verify recovers", async () => {
    await stageBoth(cdp);
    await cdp.send("Network.setBlockedURLs", { urls: ["*BadgeSeal.css*", "*tokens/tokens.css*"] });
    let timedOut;
    try {
      await clickAction(cdp, "apply");
      timedOut = await waitReport(cdp, "apply", ["verified", "mismatch", "timeout", "written-not-observable"], 40000);
    } finally {
      await cdp.send("Network.setBlockedURLs", { urls: [] });
    }
    assert.equal(timedOut.status, "timeout", timedOut.text);
    assertWritten();
    await clickAction(cdp, "reload-verify");
    const recovered = await waitReport(cdp, "apply", ["verified"], 40000);
    await waitFor(() => inPreview(cdp, `return !!(w.__CODE_LAYER__ && d.querySelector('[data-component="badge-seal"]'))`), { label: "preview back" });
    await undoAndCheck(cdp, startHashes);
    return `${timedOut.status} → ${recovered.status}`;
  });

  await check("11.7 applied from another story: 已寫入，此頁看不到效果; back on Hanko re-verify says 已驗證", async () => {
    await stageBoth(cdp);
    const item = await waitFor(() => managerRect(cdp, "#components-marks-badge-seal--price-roundel"), { label: "sidebar item" });
    await click(cdp, item.x, item.y);
    await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.storyId === "components-marks-badge-seal--price-roundel"`), { label: "price roundel" });
    await cdp.send("Page.reload");
    await waitFor(() => inPreview(cdp, `return !!(w.__CODE_LAYER__ && w.__CODE_LAYER__.effective.state === "active" && w.__CODE_LAYER__.storyId === "components-marks-badge-seal--price-roundel")`), { timeout: 60000, label: "price roundel after reload" });
    await waitFor(async () => ((await draftStatuses(cdp)).length === 2 ? true : null), { label: "drafts after reload" });
    await clickAction(cdp, "apply");
    const elsewhere = await waitReport(cdp, "apply", ["verified", "mismatch", "timeout", "written-not-observable"]);
    assert.equal(elsewhere.status, "written-not-observable", elsewhere.text);
    assertWritten();
    const back = await managerRect(cdp, `#${HANKO}`);
    await click(cdp, back.x, back.y);
    await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.storyId === ${JSON.stringify(HANKO)} && !!d.querySelector('[data-component="badge-seal"]')`), { label: "back on hanko" });
    await clickAction(cdp, "reverify");
    const verified = await waitReport(cdp, "apply", ["verified"], 30000);
    await undoAndCheck(cdp, startHashes);
    return `${elsewhere.status} → ${verified.status}`;
  });

  await check("11.8 a refused apply (mirror drift) shows the failure, keeps the drafts, writes nothing", async () => {
    await stageBoth(cdp);
    const truth = fs.readFileSync(TRUTH());
    fs.writeFileSync(TRUTH(), `${truth.toString("utf8")}/* drift */\n`);
    let report;
    try {
      await clickAction(cdp, "apply");
      report = await waitFor(async () => {
        const r = await reportState(cdp);
        return r && r.text.includes("沒有套用") ? r : null;
      }, { label: "failure report" });
    } finally {
      fs.writeFileSync(TRUTH(), truth);
    }
    assert.match(report.text, /真相檔與鏡像不一致/);
    assert.equal((await draftStatuses(cdp)).length, 2, "drafts kept");
    await waitFor(async () => {
      const c = await previewComputed(cdp);
      return c.bg === "rgb(16, 160, 226)" && c.radius === "8px" ? true : null;
    }, { label: "previews back after the refusal" });
    assert.deepEqual(diskHashes(), startHashes);
    await clickAction(cdp, "discard");
    await waitFor(async () => ((await draftStatuses(cdp)).length === 0 ? true : null), { label: "discarded" });
    return report.text.slice(0, 60);
  });

  async function refusedThenDiscard(report, expected) {
    assert.match(report.text, expected);
    assert.equal((await draftStatuses(cdp)).length, 2, "drafts kept");
    await clickAction(cdp, "discard");
    await waitFor(async () => ((await draftStatuses(cdp)).length === 0 ? true : null), { label: "discarded" });
    await waitFor(async () => {
      const c = await previewComputed(cdp);
      return c.bg === "rgb(254, 11, 5)" && c.radius === "4px" ? true : null;
    }, { timeout: 15000, label: "original look after discard" });
    assert.deepEqual(diskHashes(), startHashes);
  }

  async function failureReport() {
    return waitFor(async () => {
      const r = await reportState(cdp);
      return r && r.text.includes("沒有套用") ? r : null;
    }, { label: "failure report" });
  }

  await check("11.8b component CSS changed outside (page not updated yet): the panel refuses before sending anything", async () => {
    await stageBoth(cdp);
    const original = fs.readFileSync(BADGE_CSS());
    const tokenHashesBefore = TOKEN_FILES().map(sha);
    const journalBefore = (await (await fetch(`${BASE}/__code-layer/state`)).json()).undoStack.length;
    await cdp.send("Network.setBlockedURLs", { urls: ["*BadgeSeal.css*"] });
    let report;
    try {
      fs.writeFileSync(BADGE_CSS(), original.toString("utf8").replace("var(--md-sys-shape-corner-sm);", "var(--md-sys-shape-corner-lg);"));
      await waitFor(async () => {
        const list = await draftStatuses(cdp);
        return list.some((d) => d.text.includes("來源已變更")) ? list : null;
      }, { label: "radius draft marked as conflict" });
      await clickAction(cdp, "apply");
      report = await failureReport();
      assert.deepEqual(TOKEN_FILES().map(sha), tokenHashesBefore, "token files untouched");
      assert.ok(fs.readFileSync(BADGE_CSS(), "utf8").includes("corner-lg"), "external edit kept");
      assert.equal((await (await fetch(`${BASE}/__code-layer/state`)).json()).undoStack.length, journalBefore, "no apply recorded");
    } finally {
      fs.writeFileSync(BADGE_CSS(), original);
      await cdp.send("Network.setBlockedURLs", { urls: [] });
    }
    await refusedThenDiscard(report, /有變更與目前的原始碼不一致/);
    return report.text.slice(0, 40);
  });

  await check("11.8c token changed outside (page not updated yet): the server refuses with stale-before, all-or-nothing", async () => {
    await stageBoth(cdp);
    const truth = fs.readFileSync(TRUTH());
    const mirror = fs.readFileSync(MIRROR());
    const badgeBefore = sha(BADGE_CSS());
    const edited = truth.toString("utf8").replace(
      "--md-comp-badge-seal-hanko-container-color: var(--md-sys-color-primary);",
      "--md-comp-badge-seal-hanko-container-color: var(--md-sys-color-tertiary);",
    );
    await cdp.send("Network.setBlockedURLs", { urls: ["*tokens.css*", "*tokens-comp.css*"] });
    let report;
    try {
      fs.writeFileSync(TRUTH(), edited);
      fs.writeFileSync(MIRROR(), edited);
      await delayMs(500);
      await clickAction(cdp, "apply");
      report = await failureReport();
      assert.equal(sha(BADGE_CSS()), badgeBefore, "component CSS untouched (all-or-nothing)");
      assert.equal(fs.readFileSync(TRUTH(), "utf8"), edited, "external edit kept in the source of truth");
      assert.equal(fs.readFileSync(MIRROR(), "utf8"), edited, "external edit kept in the mirror");
    } finally {
      fs.writeFileSync(TRUTH(), truth);
      fs.writeFileSync(MIRROR(), mirror);
      await cdp.send("Network.setBlockedURLs", { urls: [] });
    }
    await refusedThenDiscard(report, /原始碼在預覽之後被改過/);
    return report.text.slice(0, 40);
  });

  await check("11.9 copy object reference: the format matches and every path, selector and token exists", async () => {
    await loadStory(cdp, HANKO, { mode: true });
    await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.effective.state === "active"`), { label: "active" });
    await selectBadge(cdp);
    const label = await waitFor(() => inPreview(cdp, `const s = d.querySelector("[data-code-layer-chrome]").shadowRoot.querySelector(".select-label button"); if (!s) return null; const r = s.getBoundingClientRect(); const fr = f.getBoundingClientRect(); return r.width ? { x: fr.left + r.left + r.width / 2, y: fr.top + r.top + r.height / 2 } : null;`), { label: "copy button" });
    await click(cdp, label.x, label.y);
    const text = await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.lastCopied`), { label: "copied text" });
    const lines = text.split("\n");
    assert.equal(lines[0], "[Code Layer 物件參照 v1]");
    assert.match(text, /Story：components-marks-badge-seal--hanko（Components\/Marks\/Badge Seal › Hanko）/);
    assert.match(text, /元件：badge-seal · variant：hanko · 元素：Badge Seal \/ hanko/);
    const css = /CSS：(\S+) · (\S+)（規則 #7）/.exec(text);
    assert.ok(css, text);
    assert.ok(fs.existsSync(path.join(LAB_ROOT(), css[1])), css[1]);
    assert.ok(fs.readFileSync(path.join(LAB_ROOT(), css[1]), "utf8").includes(`${css[2]} {`), css[2]);
    for (const match of text.matchAll(/（([\w./-]+):(\d+)）/g)) {
      const file = path.join(LAB_ROOT(), match[1]);
      assert.ok(fs.existsSync(file), match[1]);
      assert.ok(fs.readFileSync(file, "utf8").split("\n").length >= Number(match[2]), `${match[1]}:${match[2]}`);
    }
    for (const token of new Set(text.match(/--md-[a-z0-9-]+/g))) {
      const where = ["tokens/tokens-ref.css", "tokens/tokens-sys.css", "tokens/tokens-comp.css"].some((f) => fs.readFileSync(path.join(LAB_ROOT(), f), "utf8").includes(`${token}:`));
      assert.ok(where, `${token} is declared in a token file`);
    }
    return `${lines.length} lines`;
  });

  await check("11.10 files equal the stage start; mode off", async () => {
    await setMode(cdp, false);
    assert.deepEqual(diskHashes(), startHashes);
  });
}

async function main() {
  const chrome = await launchChrome({ headless: !headed });
  chrome.closeTarget = async (page) => {
    page.close();
    await fetch(`http://127.0.0.1:${chrome.port}/json/close/${page.targetId}`).catch(() => undefined);
  };
  const cdp = await openPage(chrome.port, "about:blank");
  cdp.chrome = chrome;
  try {
    if (stages.includes(6)) await stage6(cdp, chrome);
    if (stages.includes(7)) await stage7(cdp, chrome);
    if (stages.includes(11)) await stage11(cdp, chrome);
  } finally {
    cdp.close();
    await chrome.close();
  }
  const failed = results.filter((r) => !r.ok);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});
