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
const ALL_STAGES = [6, 7, 11, 12, 13, 14, 15, 16];
const stageArg = args.includes("--stage") ? args[args.indexOf("--stage") + 1] : "6";
const stages = stageArg === "all" ? ALL_STAGES : stageArg.split(",").map(Number);
const headed = args.includes("--headed");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;

const results = [];

const checkOuter = (name, fn) => check(name, fn);

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
    // With CODE_LAYER_TEST_SHOTS=<directory>, a failed check leaves a picture of the page as it was.
    const directory = process.env.CODE_LAYER_TEST_SHOTS;
    if (directory && activePage) {
      try {
        const shot = await activePage.send("Page.captureScreenshot", { format: "png" });
        const file = path.join(directory, `fail-${name.split(" ")[0]}.png`);
        fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
        process.stdout.write(`    (screenshot: ${file})\n`);
      } catch {
        // the page may be gone
      }
    }
  }
}

/** The page the checks drive (for the failure screenshot). */
let activePage = null;

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

// ---- helpers for the v1 stages (12–15) ------------------------------------------

const STORY = {
  hanko: HANKO,
  roundel: "components-marks-badge-seal--price-roundel",
  scallop: "components-marks-badge-seal--scalloped-stamp",
  highlightTag: "components-marks-badge-seal--highlight-tag",
  ribbonVertical: "components-marks-ribbon-banner--vertical-stack",
  ribbonHorizontal: "components-marks-ribbon-banner--horizontal",
  footnoteColumns: "components-content-footnote-legal-block--columns",
  heroFestival: "components-typographic-hero-title-lockup--festival",
  heroDefault: "components-typographic-hero-title-lockup--default",
  priceHero: "components-typographic-price-lockup--hero",
  plate: "components-marks-corner-brand-plate--plate",
  exampleCard: "components-examples-example-card--default",
};

async function loadActive(cdp, storyId) {
  await cdp.send("Page.navigate", { url: `${BASE}/?path=/story/${storyId}&globals=codeLayer:!true` });
  await waitFor(() => inPreview(cdp, `return !!(w.__CODE_LAYER__ && w.__CODE_LAYER__.index && w.__CODE_LAYER__.effective.state === "active" && d.querySelector("#storybook-root *"))`), { timeout: 90000, label: `story ${storyId} active` });
  // Turning the mode on docks the panel to the right, which narrows the preview and moves centered stories:
  // coordinates are only worth measuring once the frame has stopped changing.
  let last = null;
  let stable = 0;
  await waitFor(async () => {
    const now = await evaluate(cdp, `(() => { const f = document.getElementById("storybook-preview-iframe"); const p = document.querySelector("[data-code-layer-panel]"); if (!f || !p || p.getBoundingClientRect().width === 0) return null; const r = f.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round).join(","); })()`);
    stable = now !== null && now === last ? stable + 1 : 0;
    last = now;
    return stable >= 3 ? true : null;
  }, { timeout: 20000, interval: 120, label: "panel docked and the preview frame settled" });
  await delayMs(150);
}

/** Select an element through the runtime (the tracer is under test here, not the pointer) and return its trace. */
async function traceOf(cdp, selector, { fresh = false } = {}) {
  const trace = await inPreview(
    cdp,
    `const cl = w.__CODE_LAYER__; const el = d.querySelector(${JSON.stringify(selector)}); if (!el) return { missing: true };
     if (${fresh}) cl.context = null;
     const before = cl.lastTrace; cl.select(el, "panel");
     for (let i = 0; i < 100 && (cl.lastTrace === before || cl.selected !== el || !cl.lastTrace); i += 1) await new Promise((r) => setTimeout(r, 30));
     return cl.selected === el ? cl.lastTrace : { missing: true };`,
  );
  assert.ok(trace && !trace.missing, `no trace for ${selector}`);
  return trace;
}

const rowOf = (trace, id) => {
  const row = trace.rows.find((r) => r.id === id);
  assert.ok(row, `row ${id} in [${trace.rows.map((r) => r.id).join(", ")}]`);
  return row;
};

/** Page coordinates of a point inside a preview element (fractions of its box). */
async function previewPoint(cdp, selector, fx = 0.5, fy = 0.5) {
  const point = await inPreview(
    cdp,
    `const el = d.querySelector(${JSON.stringify(selector)}); if (!el) return null; const fr = f.getBoundingClientRect(); const r = el.getBoundingClientRect();
     return { x: fr.left + r.left + r.width * ${fx}, y: fr.top + r.top + r.height * ${fy} };`,
  );
  assert.ok(point, `element ${selector}`);
  return point;
}

async function clickWith(cdp, x, y, { modifiers = 0, count = 1 } = {}) {
  await mouse(cdp, "mouseMoved", x, y, { modifiers });
  for (let i = 1; i <= count; i += 1) {
    await mouse(cdp, "mousePressed", x, y, { clickCount: i, modifiers });
    await mouse(cdp, "mouseReleased", x, y, { clickCount: i, modifiers });
  }
}

/** What is selected in the preview right now. */
function selected(cdp) {
  return inPreview(
    cdp,
    `const el = w.__CODE_LAYER__.selected; if (!el) return null;
     return { tag: el.tagName.toLowerCase(), classes: [...el.classList], component: el.getAttribute("data-component"), display: getComputedStyle(el).display, label: w.__CODE_LAYER__.lastTrace?.label ?? null };`,
  );
}

async function waitSelected(cdp, predicate, label) {
  return waitFor(async () => {
    const now = await selected(cdp);
    return predicate(now) ? now ?? true : null;
  }, { label });
}

/**
 * Rewrite the index on its way to the page (CDP Fetch), to see how the page
 * behaves with a binding this project does not have: an open system tier, a
 * token declared twice, another interface language. Pass null to stop.
 */
async function patchIndex(cdp, patch) {
  cdp.indexPatch = patch;
  await interceptApi(cdp);
}

/**
 * One interception of the dev API (CDP Fetch) for everything the checks fake on its way to the page:
 * the index, and the session (what a page holds that was loaded from a dev server that has since been restarted).
 */
async function interceptApi(cdp) {
  if (cdp.fetchEnabled) return;
  cdp.fetchEnabled = true;
  cdp.sessionPatch ??= null;
  cdp.on("Fetch.requestPaused", async (paused) => {
    try {
      const url = paused.request.url;
      const patch = paused.responseStatusCode === 200 ? (url.includes("/__code-layer/index") ? cdp.indexPatch : url.includes("/__code-layer/session") ? cdp.sessionPatch : null) : null;
      if (!patch) {
        await cdp.send("Fetch.continueRequest", { requestId: paused.requestId });
        return;
      }
      const body = await cdp.send("Fetch.getResponseBody", { requestId: paused.requestId });
      const json = JSON.parse(Buffer.from(body.body, body.base64Encoded ? "base64" : "utf8").toString("utf8"));
      patch(json);
      await cdp.send("Fetch.fulfillRequest", { requestId: paused.requestId, responseCode: 200, responseHeaders: paused.responseHeaders, body: Buffer.from(JSON.stringify(json)).toString("base64") });
    } catch {
      await cdp.send("Fetch.continueRequest", { requestId: paused.requestId }).catch(() => undefined);
    }
  });
  await cdp.send("Fetch.enable", {
    patterns: [
      { urlPattern: "*__code-layer/index*", requestStage: "Response" },
      { urlPattern: "*__code-layer/session*", requestStage: "Response" },
    ],
  });
}

const openSystemTier = (json) => {
  for (const token of json.tokens.items) if (token.tier === "sys" && token.source === "tier") token.writable = true;
};

/** Temporarily change a lab file, run, and put the exact bytes back whatever happens. */
async function withFileEdit(file, edit, run) {
  const original = fs.readFileSync(file);
  fs.writeFileSync(file, edit(original.toString("utf8")));
  try {
    return await run();
  } finally {
    fs.writeFileSync(file, original);
  }
}

/** Wait until the preview's index has caught up with a file the test changed. */
async function waitIndex(cdp, predicate, label) {
  await waitFor(() => inPreview(cdp, `const index = w.__CODE_LAYER__.index; return index ? (${predicate})(index) : false`), { timeout: 20000, label });
  await delayMs(250);
}

const labFile = (relative) => path.join(testProject(), relative);
const traceTimes = [];

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
    assert.equal(fill.readOnly, null, JSON.stringify(fill.readOnly));
    // The lab keeps the system tier closed: a declaration scope and the component token, which is the default.
    assert.deepEqual(fill.scopes.map((s) => [s.id, s.available]), [["declaration", true], ["component-token", true]]);
    assert.equal(fill.defaultScope, "component-token");
    const fillScope = fill.scopes.find((s) => s.id === "component-token");
    assert.deepEqual(fillScope.target, { type: "rebind-token", token: "--md-comp-badge-seal-hanko-container-color", tier: "comp", file: "tokens/tokens-comp.css", line: 54 });
    assert.equal(fillScope.fromToken, "--md-sys-color-primary");
    assert.deepEqual(fill.chain.map((l) => l.name), ["--md-comp-badge-seal-hanko-container-color", "--md-sys-color-primary", "--md-ref-color-red-60"]);
    assert.ok(fill.chain.every((l) => l.status === "ok"), JSON.stringify(fill.chain));
    assert.equal(fill.computedDisplay, "#FE0B05");
    assert.equal(fill.declaration.line, 59);
    assert.deepEqual(fillScope.writes, { files: ["tokens/tokens-comp.css", "storybook/tokens/tokens-comp.css"], line: 54 });
    assert.deepEqual(fillScope.impact, { declarations: 1, components: 1, excludesInlineStyles: false });
    const radius = trace.rows.find((r) => r.id === "radius");
    assert.deepEqual(radius.scopes.map((s) => [s.id, s.available]), [["declaration", true]], "a system token referenced directly: the declaration is the only scope");
    assert.equal(radius.defaultScope, "declaration");
    const radiusTarget = radius.scopes[0].target;
    assert.equal(radius.scopes[0].fromToken, "--md-sys-shape-corner-sm");
    assert.deepEqual([radiusTarget.type, radiusTarget.ordinal, radiusTarget.line, radiusTarget.refIndex, radiusTarget.property], ["rebind-declaration", 7, 60, 0, "border-radius"]);
    assert.equal(radius.computed, "4px");
    assert.deepEqual(radius.chain.map((l) => [l.name, l.value]), [["--md-sys-shape-corner-sm", "4px"], ["--md-ref-radius-4", "4px"]]);
    const readOnly = trace.rows.filter((r) => r.readOnly);
    assert.ok(readOnly.every((r) => r.computed !== ""), "read-only rows have values");
    return `${trace.rows.length} rows in ${trace.durationMs} ms; read-only: ${readOnly.map((r) => `${r.id}(${r.readOnly.reason})`).join(" ")}`;
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

  await check("6.19 suspended states name their reason on the toggle and in the panel; returning selects again", async () => {
    await loadStory(cdp, HANKO, { mode: true });
    await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.effective.state === "active"`), { label: "active" });
    await selectBadge(cdp);
    const updateGlobals = (globals) => evaluate(cdp, `window.__STORYBOOK_ADDONS_CHANNEL__.emit("updateGlobals", { globals: ${JSON.stringify(globals)} }); true`);
    const suspendedAs = async (reason, words, { panel = true } = {}) => {
      await waitFor(() => inPreview(cdp, `const e = w.__CODE_LAYER__.effective; return e.state === "suspended" && e.reason === ${JSON.stringify(reason)}`), { label: `suspended (${reason})` });
      const tool = await waitFor(async () => {
        const button = await toolButton(cdp);
        return button && words.test(button.label) ? button : null;
      }, { label: `toggle names ${reason}` });
      assert.equal(tool.checked, "true", "the toggle stays pressed");
      assert.equal(await evaluate(cdp, `document.querySelector("[data-code-layer-tool]").getAttribute("data-code-layer-tool")`), "suspended");
      if (panel) {
        const text = await waitFor(() => evaluate(cdp, `(document.querySelector("[data-code-layer-panel]") || {}).textContent || null`), { label: "panel" });
        assert.match(text, words);
      }
      const overlay = await overlayState(cdp);
      assert.equal(overlay.mounted, false, `no overlay while suspended: ${JSON.stringify(overlay)}`);
    };
    const activeAgain = async () => {
      await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.effective.state === "active"`), { label: "active again" });
      await waitFor(async () => (await overlayState(cdp)).selectLabel?.startsWith("Badge Seal"), { label: "selection restored" });
    };

    await updateGlobals({ figmaExport: "on" });
    await suspendedAs("figma-export", /Figma export/);
    await updateGlobals({ figmaExport: "off" });
    await activeAgain();

    await updateGlobals({ prototypeMode: "docs" });
    await suspendedAs("prototype-mode", /Prototype Inspector/);
    await updateGlobals({ prototypeMode: "story" });
    await activeAgain();

    // A docs page unmounts the addon panel, so only the toggle can show the reason.
    await cdp.send("Page.navigate", { url: `${BASE}/?path=/docs/${HANKO.replace(/--.*$/, "--docs")}&globals=codeLayer:!true` });
    await waitFor(() => inPreview(cdp, `return !!w.__CODE_LAYER__`), { timeout: 60000, label: "docs page runtime" });
    await suspendedAs("docs", /Docs/, { panel: false });
    await loadStory(cdp, HANKO, { mode: true });
    await activeAgain();
    await setMode(cdp, false);
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
  // The panel is long: bring the element into view before measuring where to click.
  return inManager(cdp, `const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null; return { x: r.left + Math.min(r.width / 2, 120), y: r.top + Math.min(r.height / 2, 12), left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };`);
}

/** Storybook's own addon panel: where it is, whether it shows, which tab is selected, and what the layout stores hold. */
async function addonPanel(cdp) {
  return inManager(cdp, `const panel = document.getElementById("storybook-panel-root"); const frame = document.getElementById("storybook-preview-iframe");
    if (!frame) return null;
    const p = panel ? panel.getBoundingClientRect() : null; const f = frame.getBoundingClientRect();
    const visible = !!p && p.width > 0 && p.height > 0;
    const tabs = panel ? [...panel.querySelectorAll('[role="tab"]')] : [];
    const layout = (storage) => { try { const l = JSON.parse(storage.getItem("@storybook/manager/store") || "{}").layout; return l ? JSON.stringify([l.panelPosition ?? null, l.showPanel ?? null, l.bottomPanelHeight ?? null, l.rightPanelWidth ?? null]) : null; } catch { return "unreadable"; } };
    return { visible, side: !visible ? null : p.left >= f.right - 4 ? "right" : p.top >= f.bottom - 4 ? "bottom" : "other", selected: tabs.find((t) => t.getAttribute("aria-selected") === "true")?.textContent ?? null,
      tabs: tabs.map((t) => t.textContent), local: layout(localStorage), session: layout(sessionStorage) };`);
}

/** The floating inspector: whether it is there, where, and the canvas it floats over. */
async function inspector(cdp) {
  return inManager(cdp, `const el = document.querySelector("[data-code-layer-panel]"); const canvas = document.getElementById("storybook-preview-wrapper").getBoundingClientRect();
    const box = (r) => [r.left, r.top, r.width, r.height].map(Math.round);
    if (!el) return { present: false, canvas: box(canvas) };
    const head = el.querySelector("[data-code-layer-drag]").getBoundingClientRect();
    return { present: true, rect: box(el.getBoundingClientRect()), head: box(head), canvas: box(canvas), collapsed: el.getAttribute("data-collapsed"), dev: el.getAttribute("data-dev"),
      rows: el.querySelectorAll("[data-code-layer-row]").length, guide: !!el.querySelector("[data-code-layer-guide]"), inBody: el.parentElement === document.body, inStory: false };`);
}

const insideCanvas = (state) => state.head[0] >= state.canvas[0] && state.head[1] >= state.canvas[1] && state.head[0] + state.head[2] <= state.canvas[0] + state.canvas[2] && state.head[1] + state.head[3] <= state.canvas[1] + state.canvas[3];

async function previewComputed(cdp) {
  return inPreview(cdp, `const el = d.querySelector('[data-component="badge-seal"]'); const cs = getComputedStyle(el); return { bg: cs.backgroundColor, radius: cs.borderTopLeftRadius };`);
}

async function draftStatuses(cdp) {
  return inManager(cdp, `return [...document.querySelectorAll("[data-code-layer-draft]")].map((e) => ({ id: e.getAttribute("data-code-layer-draft"), status: e.getAttribute("data-status"), to: e.getAttribute("data-to"), text: e.textContent, line: e.firstElementChild?.textContent ?? "", title: e.firstElementChild?.getAttribute("title") ?? "" }));`);
}

async function pickToken(cdp, rowId, search, token) {
  const row = await waitFor(() => managerRect(cdp, `[data-code-layer-row="${rowId}"]`), { label: `row ${rowId}` });
  // A click toggles the row: only click when its picker is not showing yet.
  if (!(await inManager(cdp, `return !!document.querySelector('[data-code-layer-picker="${rowId}"]')`))) await click(cdp, row.x, row.y);
  await waitFor(() => managerRect(cdp, `[data-code-layer-picker="${rowId}"]`), { label: `picker ${rowId}` });
  await waitFor(() => inManager(cdp, `return document.querySelector('[data-code-layer-picker="${rowId}"]')?.getAttribute("data-probe") === "confirmed"`), { label: "probe confirmed" });
  await cdp.send("Input.insertText", { text: search });
  // The list is filtered as the text arrives: measure the option only once the list has settled.
  let last = -1;
  await waitFor(async () => {
    const now = await inManager(cdp, `const p = document.querySelector('[data-code-layer-picker="${rowId}"]'); return p && p.querySelector("input").value === ${JSON.stringify(search)} ? p.querySelectorAll("[data-token]").length : -2`);
    const settled = now >= 0 && now === last;
    last = now;
    return settled ? true : null;
  }, { interval: 120, label: `list filtered by "${search}"` });
  const option = await waitFor(() => managerRect(cdp, `[data-code-layer-picker="${rowId}"] [data-token="${token}"]`), { label: `option ${token}` });
  await mouse(cdp, "mouseMoved", option.x, option.y);
  return option;
}

const allPreviewing = (list, count) => list.length === count && list.every((d) => d.status === "previewing");

async function stage7(cdp) {
  const startHashes = diskHashes();
  let panelBefore = null;
  let moved = null;

  await check("7.1 turning the mode on floats the inspector over the canvas and leaves Storybook's own panel alone", async () => {
    await loadStory(cdp, HANKO);
    await inManager(cdp, `localStorage.removeItem("code-layer/v2/showa-pop-80sjp-storybook/drafts"); localStorage.removeItem("code-layer/v2/showa-pop-80sjp-storybook/inspector"); sessionStorage.clear(); return true`);
    await loadStory(cdp, HANKO);
    await delayMs(500);
    panelBefore = await addonPanel(cdp);
    assert.equal((await inspector(cdp)).present, false, "no inspector while the tool is off");
    await setMode(cdp, true);
    const shown = await waitFor(async () => {
      const state = await inspector(cdp);
      return state.present ? state : null;
    }, { label: "inspector on the canvas" });
    await delayMs(400);
    assert.deepEqual(await addonPanel(cdp), panelBefore, "panel position, visibility, selected tab and stored layout are what they were");
    assert.ok(!panelBefore.tabs.some((tab) => /^(設計|Design)$/.test(tab)), `no Code Layer tab among ${JSON.stringify(panelBefore.tabs)}`);
    // On the canvas, at its top right corner; in the manager document, not in the story.
    assert.ok(insideCanvas(shown), JSON.stringify(shown));
    assert.ok(shown.canvas[0] + shown.canvas[2] - (shown.rect[0] + shown.rect[2]) <= 16 && shown.rect[1] - shown.canvas[1] <= 16, JSON.stringify(shown));
    assert.equal(shown.inBody, true);
    assert.equal(await inPreview(cdp, `return d.querySelectorAll("[data-code-layer-panel]").length`), 0, "nothing of the inspector is in the story document");
    // Nothing selected: three gestures, no rows.
    assert.deepEqual([shown.guide, shown.rows], [true, 0]);
    const guide = await inManager(cdp, `return [...document.querySelector("[data-code-layer-guide]").children].map((e) => e.textContent)`);
    assert.deepEqual(guide, ["點一下", "選取元件", "雙擊", "進入內層", "點數值", "換成另一個 token"]);
    return `inspector at ${shown.rect.slice(0, 2)} over a canvas at ${shown.canvas.slice(0, 2)}; addon panel ${panelBefore.side ?? "hidden"} with "${panelBefore.selected}"`;
  });

  await check("7.2 rows are icon, value and token: no sentences or paths; reasons are tooltips; hidden rows and developer details are on demand", async () => {
    await selectBadge(cdp);
    await waitFor(() => inManager(cdp, `const t = document.querySelector("[data-code-layer-title]"); return !!t && t.textContent === "Badge Seal / hanko"`), { label: "inspector title" });
    const rows = () => inManager(cdp, `return [...document.querySelectorAll("[data-code-layer-row]")].map((e) => ({ id: e.getAttribute("data-code-layer-row"), text: e.textContent, title: e.getAttribute("title"), editable: e.getAttribute("data-editable"), readonly: e.getAttribute("data-readonly"), height: Math.round(e.getBoundingClientRect().height) }))`);
    const shown = await rows();
    // One line each, and nothing to read: no file, no line number, no sentence.
    assert.ok(shown.length >= 8 && shown.every((row) => row.height <= 28), JSON.stringify(shown.map((row) => [row.id, row.height])));
    for (const row of shown) assert.doesNotMatch(row.text, /\.css|\.md|:\d+|寫入|影響|只供檢視|沒有宣告|，|。/, `${row.id}: ${row.text}`);
    assert.equal(shown.find((row) => row.id === "fill").text, "填色color-primary");
    assert.equal(shown.find((row) => row.id === "radius").text, "圓角4pxshape-corner-sm");
    // A read-only row says why as its tooltip.
    const display = shown.find((row) => row.id === "display");
    assert.deepEqual([display.editable, display.readonly, display.text], ["false", "structural", "顯示flex"]);
    assert.match(display.title, /display 只供檢視/);
    // Sections in the order of the tracing table; rows that are not set are hidden behind a count.
    const sections = await inManager(cdp, `return [...document.querySelectorAll("[data-code-layer-section]")].map((e) => [e.getAttribute("data-code-layer-section"), Number(e.getAttribute("data-rows")), Number(e.querySelector('[data-code-layer-action="toggle-more"]')?.getAttribute("data-hidden") ?? 0)])`);
    assert.deepEqual(sections.map(([id]) => id), ["layout", "spacing", "size", "appearance", "fill", "stroke", "typography"]);
    const traced = await inPreview(cdp, `return w.__CODE_LAYER__.lastTrace.rows.length`);
    assert.equal(sections.reduce((sum, [, rows, hidden]) => sum + rows + hidden, 0), traced, "every traced row is either shown or counted as hidden");
    assert.ok(!shown.some((row) => row.id === "margin"), "a margin that is not set is not listed");
    await clickIn(cdp, '[data-code-layer-section="spacing"] [data-code-layer-action="toggle-more"]');
    const margin = await waitFor(async () => (await rows()).find((row) => row.id === "margin") ?? null, { label: "margin row revealed" });
    assert.equal(margin.editable, "false");
    assert.match(margin.text, /^外距0px$/);
    assert.match(margin.title, /沒有宣告/);
    await clickIn(cdp, '[data-code-layer-section="spacing"] [data-code-layer-action="toggle-more"]');
    await waitFor(async () => (!(await rows()).some((row) => row.id === "margin") ? true : null), { label: "hidden again" });

    // The popover of a row: no file, no chain, until developer details are turned on.
    const fillRow = await managerRect(cdp, '[data-code-layer-row="fill"]');
    await click(cdp, fillRow.x, fillRow.y);
    const popover = () => inManager(cdp, `const p = document.querySelector('[data-code-layer-popover="fill"]'); return p ? { text: p.textContent, chain: p.querySelector("[data-code-layer-chain]")?.textContent ?? null, writes: p.querySelector("[data-code-layer-writes]")?.textContent ?? null, side: p.getAttribute("data-side") } : null`);
    const plain = await waitFor(() => popover(), { label: "popover of the fill row" });
    assert.deepEqual([plain.chain, plain.writes], [null, null]);
    assert.doesNotMatch(plain.text, /\.css|tokens\//);
    assert.match(plain.text, /只有這裡這個元件影響 1 個元件/);
    await clickAction(cdp, "toggle-dev");
    const detailed = await waitFor(async () => {
      const now = await popover();
      return now?.chain ? now : null;
    }, { label: "chain shown with developer details" });
    assert.match(detailed.chain, /comp-badge-seal-hanko-container-color · comp · tokens\/tokens-comp\.css:54 = #FE0B05/);
    assert.match(detailed.chain, /sys-color-primary · sys · tokens\/tokens-sys\.css:\d+ = #FE0B05/);
    assert.match(detailed.chain, /ref-color-red-60 · ref · tokens\/tokens-ref\.css:\d+ = #FE0B05/);
    assert.equal(detailed.writes, "寫入 tokens/tokens-comp.css:54（＋鏡像 storybook/tokens/tokens-comp.css） · 影響 1 處宣告、1 個元件");
    assert.match(await inManager(cdp, `return document.querySelector("[data-code-layer-own-rule]").textContent`), /storybook\/src\/components\/badge-seal\/BadgeSeal\.css · \.md-badge-seal--hanko（第 57 行）/);
    // Remembered across a reload; then turned off again.
    await cdp.send("Page.reload");
    await waitFor(async () => ((await inspector(cdp)).dev === "true" ? true : null), { timeout: 60000, label: "developer details still on after a reload" });
    await clickAction(cdp, "toggle-dev");
    await waitFor(async () => ((await inspector(cdp)).dev === "false" ? true : null), { label: "developer details off" });
    assert.equal(await inManager(cdp, `return document.querySelector("[data-code-layer-own-rule]")`), null);
    await waitFor(() => inPreview(cdp, `return !!(w.__CODE_LAYER__ && w.__CODE_LAYER__.effective.state === "active" && w.__CODE_LAYER__.lastTrace)`), { timeout: 60000, label: "selection back after the reload" });
    return `${shown.length} rows shown of ${traced}`;
  });

  await check("7.3 hovering a token previews it live; choosing stages a draft; disk untouched", async () => {
    const option = await pickToken(cdp, "fill", "secondary", "--md-sys-color-secondary");
    await waitFor(async () => ((await previewComputed(cdp)).bg === "rgb(16, 160, 226)" ? true : null), { label: "transient fill preview" });
    await click(cdp, option.x, option.y);
    const statuses = await waitFor(async () => {
      const list = await draftStatuses(cdp);
      return allPreviewing(list, 1) ? list : null;
    }, { label: "one previewing change" });
    assert.equal((await previewComputed(cdp)).bg, "rgb(16, 160, 226)");
    // One line: what, from, to. The row shows the staged token.
    assert.equal(statuses[0].line, "填色color-primary → color-secondary");
    // The content color did not follow the container: one short line with the way to fix it; the explanation is its tooltip.
    const pairing = await inManager(cdp, `const n = document.querySelector("[data-code-layer-draft] [data-code-layer-pairing]"); return n ? { text: n.textContent, title: n.getAttribute("title") } : null`);
    assert.equal(pairing.text, "對比 3.99 → 2.94一起改內容色");
    assert.match(pairing.title, /內容色 comp-badge-seal-hanko-text-color 仍跟著舊角色 primary/);
    assert.equal(await inManager(cdp, `return document.querySelector('[data-code-layer-row="fill"]').textContent`), "填色color-secondary");
    assert.equal(await inManager(cdp, `return document.querySelector('[data-code-layer-popover="fill"]')`), null, "choosing closes the popover");
    assert.deepEqual(diskHashes(), startHashes, "no file written");
    return statuses[0].text;
  });

  await check("7.4 the radius row stages a declaration re-bind (8px)", async () => {
    const option = await pickToken(cdp, "radius", "corner-md", "--md-sys-shape-corner-md");
    await click(cdp, option.x, option.y);
    await waitFor(async () => ((await previewComputed(cdp)).radius === "8px" ? true : null), { label: "radius preview" });
    const list = await waitFor(async () => {
      const l = await draftStatuses(cdp);
      return allPreviewing(l, 2) ? l : null;
    }, { label: "two previewing changes" });
    // Where each change is written and what it affects is the tooltip of its line, not text on it.
    assert.ok(list.every((d) => !/\.css|寫入|影響/.test(d.text)), JSON.stringify(list.map((d) => d.text)));
    assert.ok(list.some((d) => d.title.includes("這條宣告 · 寫入 storybook/src/components/badge-seal/BadgeSeal.css:60 · 影響 1 處宣告、1 個元件")), JSON.stringify(list));
    assert.ok(list.some((d) => d.title.includes("元件 token · 寫入 tokens/tokens-comp.css:54（＋鏡像） · 影響 1 處宣告、1 個元件")), JSON.stringify(list));
    assert.equal(await inManager(cdp, `return document.querySelector('[data-code-layer-action="apply"]').closest("[data-code-layer-changes]").getAttribute("data-code-layer-changes")`), "2");
    // The buttons are whole and inside the inspector even when the canvas is short.
    const bar = await inManager(cdp, `const root = document.querySelector("[data-code-layer-panel]").getBoundingClientRect(); return ["compare", "discard", "apply"].map((action) => { const r = document.querySelector('[data-code-layer-action="' + action + '"]').getBoundingClientRect(); return r.height >= 20 && r.top >= root.top && r.bottom <= root.bottom && r.right <= root.right; })`);
    assert.deepEqual(bar, [true, true, true]);
    // Staged is not written: the bar says so in one line, and the action says where it writes.
    const said = await inManager(cdp, `const line = document.querySelector("[data-code-layer-preview-state]"); return [line.textContent, line.getAttribute("title"), document.querySelector('[data-code-layer-action="apply"]').textContent]`);
    assert.deepEqual([said[0], said[2]], ["預覽中 · 2 項變更尚未寫入檔案", "套用到檔案"]);
    assert.match(said[1], /只改了這個瀏覽器裡的畫面，檔案還沒動。按「套用到檔案」/);
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
    assert.ok(allPreviewing(await draftStatuses(cdp), 2));
    assert.deepEqual(diskHashes(), startHashes);
  });

  await check("7.7 an outside edit of the same declaration shows a conflict, and recovers when undone", async () => {
    const original = fs.readFileSync(BADGE_CSS());
    const edited = original.toString("utf8").replace("border-radius: var(--md-sys-shape-corner-sm);", "border-radius: var(--md-sys-shape-corner-full);");
    assert.notEqual(edited, original.toString("utf8"));
    fs.writeFileSync(BADGE_CSS(), edited);
    try {
      const list = await waitFor(async () => {
        const now = await draftStatuses(cdp);
        return now.some((d) => d.status === "conflict") ? now : null;
      }, { timeout: 10000, label: "conflict" });
      // The state that needs attention is said in words on the line and marked on the row.
      assert.ok(list.find((d) => d.status === "conflict").text.includes("來源已變更"));
      await waitFor(() => inManager(cdp, `return document.querySelector('[data-code-layer-row="radius"]').getAttribute("data-status") === "conflict"`), { label: "row marked" });
    } finally {
      fs.writeFileSync(BADGE_CSS(), original);
    }
    await waitFor(async () => (allPreviewing(await draftStatuses(cdp), 2) ? true : null), { timeout: 10000, label: "previewing again" });
  });

  await check("7.8 the inspector goes where it is dragged, stays inside the canvas, collapses, and is there again after a reload", async () => {
    const before = await inspector(cdp);
    // Drag the header to the left and down.
    const grab = { x: before.head[0] + 60, y: before.head[1] + before.head[3] / 2 };
    await mouse(cdp, "mouseMoved", grab.x, grab.y);
    await mouse(cdp, "mousePressed", grab.x, grab.y);
    for (const step of [0.25, 0.5, 0.75, 1]) await mouse(cdp, "mouseMoved", grab.x - 300 * step, grab.y + 90 * step, { button: "left", buttons: 1 });
    await mouse(cdp, "mouseReleased", grab.x - 300, grab.y + 90);
    moved = await waitFor(async () => {
      const now = await inspector(cdp);
      return now.rect[0] !== before.rect[0] ? now : null;
    }, { label: "inspector moved" });
    assert.deepEqual([moved.rect[0] - before.rect[0], moved.rect[1] - before.rect[1]], [-300, 90]);
    assert.equal(moved.rows > 0, true, "dragging the header did not collapse or close anything");
    // The popover opens on the side that has room: left of the inspector here.
    const fillRow = await managerRect(cdp, '[data-code-layer-row="fill"]');
    await click(cdp, fillRow.x, fillRow.y);
    const sideAndBox = () => inManager(cdp, `const p = document.querySelector('[data-code-layer-popover="fill"]'); if (!p) return null; const r = p.getBoundingClientRect(); return { side: p.getAttribute("data-side"), box: [r.left, r.top, r.width, r.height].map(Math.round) }`);
    const left = await waitFor(() => sideAndBox(), { label: "popover" });
    assert.equal(left.side, "left");
    assert.ok(left.box[0] + left.box[2] <= moved.rect[0], `popover ${left.box} is beside the inspector ${moved.rect}`);
    await key(cdp, "Escape");
    await waitFor(async () => ((await sideAndBox()) === null ? true : null), { label: "popover closed" });

    // Collapsed to its header and back.
    await clickAction(cdp, "collapse");
    const collapsed = await waitFor(async () => {
      const now = await inspector(cdp);
      return now.collapsed === "true" ? now : null;
    }, { label: "collapsed" });
    assert.ok(collapsed.rows === 0 && collapsed.rect[3] <= 40, JSON.stringify(collapsed));
    assert.equal((await draftStatuses(cdp)).length, 0, "the changes are folded away with it");
    assert.equal((await previewComputed(cdp)).bg, "rgb(16, 160, 226)", "previews stay");
    await cdp.send("Page.reload");
    const reloaded = await waitFor(async () => {
      const now = await inspector(cdp).catch(() => null);
      return now?.present ? now : null;
    }, { timeout: 60000, label: "inspector after the reload" });
    assert.deepEqual([reloaded.rect.slice(0, 2), reloaded.collapsed], [moved.rect.slice(0, 2), "true"], "same place, still collapsed");
    await clickAction(cdp, "collapse");
    await waitFor(async () => ((await inspector(cdp)).collapsed === "false" ? true : null), { label: "expanded" });

    // A smaller window: the header is brought back inside the canvas.
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 760, height: 520, deviceScaleFactor: 1, mobile: false });
    try {
      const small = await waitFor(async () => {
        const now = await inspector(cdp);
        return now.present && insideCanvas(now) ? now : null;
      }, { label: "header inside the smaller canvas" });
      assert.ok(small.canvas[2] < before.canvas[2]);
    } finally {
      await cdp.send("Emulation.clearDeviceMetricsOverride");
    }
    await waitFor(async () => {
      const now = await inspector(cdp);
      return now.rect[0] === moved.rect[0] && now.rect[1] === moved.rect[1] ? true : null;
    }, { label: "back where it was put once there is room again" });
    return `moved by -300, +90 to ${moved.rect.slice(0, 2)}`;
  });

  await check("7.9 reload keeps the mode, the drafts, the previews and the selection", async () => {
    await cdp.send("Page.reload");
    await waitFor(() => inPreview(cdp, `return !!(w.__CODE_LAYER__ && w.__CODE_LAYER__.effective.state === "active")`), { timeout: 60000, label: "active after reload" });
    await waitFor(async () => ((await draftStatuses(cdp)).length === 2 ? true : null), { label: "drafts restored" });
    await waitFor(async () => {
      const c = await previewComputed(cdp);
      return c.bg === "rgb(16, 160, 226)" && c.radius === "8px" ? true : null;
    }, { label: "previews restored" });
    await waitFor(() => inManager(cdp, `return document.querySelector("[data-code-layer-title]")?.textContent === "Badge Seal / hanko"`), { label: "selection restored" });
  });

  await check("7.10 going to another story and back keeps the previews", async () => {
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
    assert.deepEqual((await inspector(cdp)).rect.slice(0, 2), moved.rect.slice(0, 2), "the inspector stays where it is across stories");
  });

  await check("7.11 a second tab without the global has no inspector and the same Storybook panel", async () => {
    const page = await openPage(cdp.chrome.port, `${BASE}/?path=/story/${HANKO}`);
    try {
      await waitFor(() => evaluate(page, `!!document.getElementById("storybook-preview-iframe") && !!document.getElementById("storybook-preview-wrapper")`), { timeout: 30000, label: "second tab" });
      await delayMs(1500);
      const there = await inspector(page);
      const panel = await addonPanel(page);
      assert.equal(there.present, false);
      assert.deepEqual([panel.side, panel.selected, panel.tabs], [panelBefore.side, panelBefore.selected, panelBefore.tabs]);
      return `panel ${panel.side ?? "hidden"}`;
    } finally {
      await cdp.chrome.closeTarget(page);
    }
  });

  await check("7.12 turning the mode off removes the previews and the inspector; on again it is where it was; then discard everything", async () => {
    await setMode(cdp, false);
    await waitFor(async () => ((await previewComputed(cdp)).bg === "rgb(254, 11, 5)" ? true : null), { label: "previews removed" });
    await waitFor(async () => (!(await inspector(cdp)).present ? true : null), { label: "inspector removed" });
    assert.deepEqual(await addonPanel(cdp), panelBefore, "Storybook's panel was never touched");
    await setMode(cdp, true);
    const again = await waitFor(async () => {
      const now = await inspector(cdp);
      return now.present ? now : null;
    }, { label: "inspector again" });
    assert.deepEqual(again.rect.slice(0, 2), moved.rect.slice(0, 2));
    await clickAction(cdp, "discard");
    await waitFor(async () => ((await draftStatuses(cdp)).length === 0 ? true : null), { label: "no drafts" });
    await waitFor(async () => {
      const c = await previewComputed(cdp);
      return c.bg === "rgb(254, 11, 5)" && c.radius === "4px" ? true : null;
    }, { label: "original look" });
    assert.equal(await inManager(cdp, `return document.querySelector("[data-code-layer-changes]")`), null, "with nothing staged the changes area takes no space");
    // Leave the inspector at its default place for whoever comes next.
    await inManager(cdp, `localStorage.removeItem("code-layer/v2/showa-pop-80sjp-storybook/inspector"); return true`);
    await setMode(cdp, false);
    assert.deepEqual(diskHashes(), startHashes, "files equal stage start");
  });

  await check("7.13 until it is dragged the inspector keeps to the side that covers no component; once placed it stays put", async () => {
    const overlap = (state, box) => Math.max(0, Math.min(state.rect[0] + state.rect[2], box[0] + box[2]) - Math.max(state.rect[0], box[0])) * Math.max(0, Math.min(state.rect[1] + state.rect[3], box[1] + box[3]) - Math.max(state.rect[1], box[1]));
    const componentBox = (selector) => inPreview(cdp, `const fr = f.getBoundingClientRect(); const r = d.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [fr.left + r.left, fr.top + r.top, r.width, r.height].map(Math.round)`);
    const placed = () => inManager(cdp, `return document.querySelector("[data-code-layer-panel]").getAttribute("data-placed")`);
    // A story whose component sits at the right edge: the inspector goes left.
    await loadActive(cdp, STORY.ribbonVertical);
    const ribbon = await componentBox('[data-component="ribbon-banner"]');
    const left = await waitFor(async () => {
      const now = await inspector(cdp);
      return now.present && overlap(now, ribbon) === 0 ? now : null;
    }, { label: "inspector clear of the component" });
    assert.ok(ribbon[0] + ribbon[2] > left.canvas[0] + left.canvas[2] - 280, `the ribbon is where the inspector would be by default: ${ribbon}`);
    assert.ok(left.rect[0] - left.canvas[0] <= 16, JSON.stringify(left));
    assert.equal(await placed(), "false");
    // So the component can be clicked without moving anything first.
    const strip = await previewPoint(cdp, '[data-component="ribbon-banner"] .md-ribbon-banner__strip:nth-child(2)');
    await click(cdp, strip.x, strip.y);
    await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.selected?.getAttribute("data-component") === "ribbon-banner"`), { label: "ribbon selected with a click" });
    // A centered story: back at the right.
    await loadActive(cdp, STORY.hanko);
    const right = await waitFor(async () => {
      const now = await inspector(cdp);
      return now.present && now.canvas[0] + now.canvas[2] - (now.rect[0] + now.rect[2]) <= 16 ? now : null;
    }, { label: "inspector at the right for a centered story" });
    assert.equal(overlap(right, await componentBox('[data-component="badge-seal"]')), 0);
    // Dragged by the person: from now on it is where they put it, whatever is underneath.
    const grab = { x: right.head[0] + 60, y: right.head[1] + right.head[3] / 2 };
    await mouse(cdp, "mouseMoved", grab.x, grab.y);
    await mouse(cdp, "mousePressed", grab.x, grab.y);
    await mouse(cdp, "mouseMoved", grab.x - 4, grab.y + 30, { button: "left", buttons: 1 });
    await mouse(cdp, "mouseMoved", grab.x - 8, grab.y + 60, { button: "left", buttons: 1 });
    await mouse(cdp, "mouseReleased", grab.x - 8, grab.y + 60);
    await waitFor(async () => ((await placed()) === "true" ? true : null), { label: "placed by the person" });
    const put = await inspector(cdp);
    await loadActive(cdp, STORY.ribbonVertical);
    const stays = await waitFor(async () => {
      const now = await inspector(cdp);
      return now.present ? now : null;
    }, { label: "inspector on the ribbon story" });
    await delayMs(600);
    assert.deepEqual((await inspector(cdp)).rect.slice(0, 2), put.rect.slice(0, 2), "a placed inspector does not move by itself");
    assert.ok(overlap(stays, ribbon) > 0, "(it covers the component here: that is the person's choice)");
    await inManager(cdp, `localStorage.removeItem("code-layer/v2/showa-pop-80sjp-storybook/inspector"); return true`);
    await setMode(cdp, false);
    return `left at x=${left.rect[0]} for the ribbon, right at x=${right.rect[0]} for the hanko`;
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

/** A control inside a part of the report that is closed is revealed first: its content is in the document, hidden. */
async function reveal(cdp, selector) {
  const part = await inManager(cdp, `const el = document.querySelector(${JSON.stringify(selector)}); const closed = el ? el.closest('[data-code-layer-part][data-open="false"] > div[hidden]') : null; return closed ? closed.parentElement.getAttribute("data-code-layer-part") : null`);
  if (!part) return;
  const rect = await managerRect(cdp, `[data-code-layer-part="${part}"] [data-code-layer-action="toggle-${part}"]`);
  await click(cdp, rect.x, rect.y);
  await waitFor(() => inManager(cdp, `return document.querySelector('[data-code-layer-part="${part}"]').getAttribute("data-open") === "true"`), { label: `part ${part} open` });
}

async function clickAction(cdp, action) {
  const selector = `[data-code-layer-action="${action}"]`;
  await waitFor(() => inManager(cdp, `return !!document.querySelector(${JSON.stringify(selector)})`), { label: `action ${action}` });
  await reveal(cdp, selector);
  const rect = await waitFor(() => managerRect(cdp, selector), { label: `action ${action}` });
  const enabled = await inManager(cdp, `return !document.querySelector(${JSON.stringify(selector)}).disabled`);
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
      return list.length === 2 && list.every((d) => d.status === "previewing") ? list : null;
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
    assert.equal((await draftStatuses(cdp)).length, 0, "after the reload the applied changes are not staged again");
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
    // After a refusal the panel knows about the drift; it clears once the files agree again.
    await waitFor(() => inManager(cdp, `return !document.querySelector('[data-code-layer-notice="mirror-drift"]')`), { timeout: 15000, label: "drift notice gone" });
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
        return list.some((d) => d.status === "conflict") ? list : null;
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

  await check("11.8d a page whose session went stale (the dev server was restarted) renews it by itself: apply and undo work without a reload", async () => {
    await interceptApi(cdp);
    // What a page holds that was loaded before the dev server was restarted: a session the server no longer knows.
    const gone = (json) => {
      json.session = "session-of-a-dev-server-that-is-gone";
    };
    const refusals = cdp.sessionRefusals;
    const stackBefore = (await rawServerState()).undoStack.length;
    cdp.sessionPatch = gone;
    try {
      await stageBoth(cdp);
    } finally {
      cdp.sessionPatch = null;
    }
    // The write is refused for its session; the page takes the server's session and sends it once more.
    await clickAction(cdp, "apply");
    const report = await waitReport(cdp, "apply", ["verified", "mismatch", "timeout", "written-not-observable"]);
    assert.equal(report.status, "verified", report.text);
    assert.equal(cdp.sessionRefusals - refusals, 1, "one request went out with the stale session and was refused; nothing after it");
    assertWritten();
    assert.equal((await rawServerState()).undoStack.length, stackBefore + 1, "applied once, not twice");
    assert.equal(await inManager(cdp, `return document.querySelector('[data-code-layer-notice="reload-required"]')`), null, "the same build: nothing to tell the person");

    // Restarted again, this time with other inspector code than the page runs. The page notices by itself
    // (the server says which start it is), renews before anything is refused, and says a reload is needed.
    cdp.sessionPatch = (json) => {
      gone(json);
      json.instance = "start-of-a-dev-server-that-is-gone";
    };
    try {
      await cdp.send("Page.reload");
      await waitReport(cdp, "apply", ["verified"], 60000);
      await waitFor(() => inPreview(cdp, `return !!(w.__CODE_LAYER__ && w.__CODE_LAYER__.effective.state === "active")`), { timeout: 60000, label: "active after the reload" });
      cdp.sessionPatch = (json) => {
        json.build = "another-build-of-the-inspector";
      };
      const notice = await waitFor(() => inManager(cdp, `return document.querySelector('[data-code-layer-notice="reload-required"]')?.textContent ?? null`), { timeout: 15000, label: "the page says a reload is needed for the new code" });
      assert.match(notice, /重新整理頁面/);
      assert.equal(await inManager(cdp, `return !!document.querySelector('[data-code-layer-action="reload-page"]')`), true);
      await undoAndCheck(cdp, startHashes);
      assert.equal(cdp.sessionRefusals - refusals, 1, "the undo was not refused: the session had been renewed already");
      assert.equal((await rawServerState()).undoStack.length, stackBefore);
    } finally {
      cdp.sessionPatch = null;
    }
    return "apply: refused once, renewed, sent again; undo: renewed before it was sent";
  });

  await check("11.9 copy object reference: the format matches and every path, selector and token exists", async () => {
    await loadStory(cdp, HANKO, { mode: true });
    await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.effective.state === "active"`), { label: "active" });
    await selectBadge(cdp);
    const label = await waitFor(() => inPreview(cdp, `const s = d.querySelector("[data-code-layer-chrome]").shadowRoot.querySelector(".select-label button"); if (!s) return null; const r = s.getBoundingClientRect(); const fr = f.getBoundingClientRect(); return r.width ? { x: fr.left + r.left + r.width / 2, y: fr.top + r.top + r.height / 2 } : null;`), { label: "copy button" });
    await click(cdp, label.x, label.y);
    const text = await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.lastCopied`), { label: "copied text" });
    const lines = text.split("\n");
    assert.equal(lines[0], "[Code Layer 物件參照 v2]");
    assert.match(text, /Story：components-marks-badge-seal--hanko（Components\/Marks\/Badge Seal › Hanko）/);
    assert.match(text, /元件：badge-seal · variant：hanko · 元素：Badge Seal \/ hanko/);
    const css = /CSS：(\S+) · (\S+)（規則 #7，第 57 行）/.exec(text);
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

// ---- stage 12: style tracing (rows, inheritance, scopes, probes) -----------------

const ROOT = '[data-component="badge-seal"]';
const MOD = process.platform === "darwin" ? 4 : 2; // Meta on macOS, Control elsewhere

async function stage12(cdp) {
  const { GROUPS } = await import("../template/code-layer/shared/properties.ts");
  const startHashes = diskHashes();

  await check("12.1 every component root is traced with all rows of the table, in the table's order", async () => {
    const roots = [
      [STORY.hanko, ROOT],
      [STORY.plate, '[data-component="corner-brand-plate"]'],
      [STORY.footnoteColumns, '[data-component="footnote-legal-block"]'],
      [STORY.heroDefault, '[data-component="hero-title-lockup"]'],
      [STORY.priceHero, '[data-component="price-lockup"]'],
      [STORY.ribbonVertical, '[data-component="ribbon-banner"]'],
      [STORY.exampleCard, ".md-example-card"],
    ];
    const sections = ["layout", "spacing", "size", "appearance", "fill", "stroke", "typography"];
    for (const [story, selector] of roots) {
      await loadActive(cdp, story);
      const trace = await traceOf(cdp, selector);
      const groups = trace.rows.map((r) => r.group);
      assert.deepEqual(groups.filter((g, i) => g !== groups[i - 1]), GROUPS.map((g) => g.id), `${story}: every group, once, in order`);
      const rowSections = trace.rows.map((r) => r.section);
      assert.deepEqual(rowSections.filter((x, i) => x !== rowSections[i - 1]), sections, `${story}: sections in order`);
      assert.ok(trace.rows.every((r) => r.computed !== "" && r.sides.length > 0), `${story}: every row has a computed value`);
      assert.ok(trace.rows.filter((r) => r.group === "display").every((r) => r.scopes.length === 0 && r.layout === null), `${story}: display is never editable`);
      // Direction, alignment, distribution and wrapping: one target on a flex container, none anywhere else.
      const flex = /^(inline-)?flex$/.test(rowOf(trace, "display").computed);
      for (const row of trace.rows.filter((r) => ["direction", "alignItems", "justifyContent", "wrap"].includes(r.group))) {
        assert.ok(flex ? row.layout !== null && (row.readOnly ? row.scopes.length === 0 : row.scopes.length === 1) : row.layout === null && row.scopes.length === 0, `${story}: layout row ${row.id} on display ${rowOf(trace, "display").computed}: ${JSON.stringify([row.layout, row.readOnly, row.scopes.length])}`);
      }
      traceTimes.push(trace.durationMs);
    }
    return `${roots.length} roots; trace ${Math.min(...traceTimes)}–${Math.max(...traceTimes)} ms`;
  });

  await check("12.2 one padding declaration is one row, block and inline declarations are two; sides follow the writing mode", async () => {
    await loadActive(cdp, STORY.hanko);
    const padding = rowOf(await traceOf(cdp, ROOT), "padding");
    assert.deepEqual([padding.sides.length, padding.declaration.property, padding.declaration.component], [4, "padding", 0], "padding: var(--x) is one row for the four sides");

    await loadActive(cdp, STORY.ribbonVertical);
    const strip = await traceOf(cdp, ".md-ribbon-banner__strip");
    assert.equal(strip.writingMode, "vertical-rl");
    const vertical = strip.rows.filter((r) => r.group === "padding");
    assert.deepEqual(
      vertical.map((r) => [r.id, r.declaration.property, r.declaration.line, r.sides.map((side) => side.physical)]),
      [
        // In a vertical-rl strip the block axis is horizontal: left and right padding come from padding-block.
        ["padding/block-start+block-end", "padding-block", 34, ["right", "left"]],
        ["padding/inline-end+inline-start", "padding-inline", 35, ["bottom", "top"]],
      ],
    );
    assert.equal(vertical[0].declaration.ordinal, vertical[1].declaration.ordinal, "both come from the same rule");
    assert.equal(vertical[0].declaration.selector, ".md-ribbon-banner--vertical .md-ribbon-banner__strip");
    assert.deepEqual(vertical.map((r) => r.computed), ["12px", "8px"]);

    await loadActive(cdp, STORY.ribbonHorizontal);
    const flat = await traceOf(cdp, ".md-ribbon-banner__strip");
    assert.deepEqual(flat.rows.filter((r) => r.group === "padding").map((r) => [r.declaration.property, r.sides.map((side) => side.physical)]), [["padding-block", ["top", "bottom"]], ["padding-inline", ["right", "left"]]]);
    return vertical.map((r) => `${r.sides.map((side) => side.physical).join("+")} ← ${r.declaration.property}`).join("; ");
  });

  await check("12.3 read-only rows give the reason of the specification table and still show the computed value", async () => {
    await loadActive(cdp, STORY.hanko);
    // Inline style.
    await inPreview(cdp, `const el = d.querySelector(${JSON.stringify(ROOT)}); w.__clHadStyle = el.hasAttribute("style"); el.style.backgroundColor = "rgb(1, 2, 3)"; return true`);
    let fill = rowOf(await traceOf(cdp, ROOT), "fill");
    assert.deepEqual([fill.source, fill.readOnly?.reason, fill.computed, fill.scopes.length], ["inline-style", "inline-style", "rgb(1, 2, 3)", 0]);
    await inPreview(cdp, `const el = d.querySelector(${JSON.stringify(ROOT)}); el.style.backgroundColor = ""; if (!w.__clHadStyle) el.removeAttribute("style"); return true`);
    fill = rowOf(await traceOf(cdp, ROOT), "fill");
    assert.equal(fill.readOnly, null, "editable again once the style attribute is gone");

    // A stylesheet that is not indexed.
    await inPreview(cdp, `const style = d.createElement("style"); style.id = "cl-test-unindexed"; style.textContent = ".md-badge-seal.md-badge-seal--hanko { opacity: 0.9 }"; d.head.appendChild(style); return true`);
    let opacity = rowOf(await traceOf(cdp, ROOT, { fresh: true }), "opacity");
    assert.deepEqual([opacity.source, opacity.readOnly?.reason, opacity.computed], ["declaration", "unknown-source", "0.9"]);
    await inPreview(cdp, `d.getElementById("cl-test-unindexed").remove(); return true`);

    // A running animation on the property.
    await inPreview(cdp, `w.__clAnimation = d.querySelector(${JSON.stringify(ROOT)}).animate([{ opacity: 0.2 }, { opacity: 0.9 }], { duration: 600000 }); return true`);
    opacity = rowOf(await traceOf(cdp, ROOT, { fresh: true }), "opacity");
    assert.equal(opacity.readOnly?.reason, "animated");
    assert.ok(opacity.computed !== "", "an animated row still shows a value");
    await inPreview(cdp, `w.__clAnimation.cancel(); return true`);

    // An important declaration and a rule inside a cascade layer (the stylesheet is edited and put back).
    const edit = (text) => {
      const edited = text.replace(/(\.md-badge-seal--hanko \{[^}]*border-radius: var\(--md-sys-shape-corner-sm\))/, "$1 !important");
      assert.notEqual(edited, text, "the hanko radius declaration was found");
      return `${edited}\n@layer code-layer-test {\n  .md-badge-seal--hanko {\n    letter-spacing: var(--md-sys-typescale-label-tracking);\n  }\n}\n`;
    };
    const layered = `(index) => index.css.files.some((f) => f.rules.some((r) => r.atRules.some((a) => a.name === "layer")))`;
    await withFileEdit(BADGE_CSS(), edit, async () => {
      await waitIndex(cdp, layered, "the index sees the edited stylesheet");
      const edited = await traceOf(cdp, ROOT, { fresh: true });
      assert.deepEqual([rowOf(edited, "radius").readOnly?.reason, rowOf(edited, "radius").computed], ["important", "4px"]);
      assert.equal(rowOf(edited, "letterSpacing").readOnly?.reason, "uncertain-condition");
    });
    await waitIndex(cdp, `(index) => !(${layered})(index)`, "the index is back to the original stylesheet");
    assert.equal(rowOf(await traceOf(cdp, ROOT, { fresh: true }), "radius").readOnly, null);

    // A presentation attribute on an SVG shape.
    await loadActive(cdp, STORY.scallop);
    const path = await traceOf(cdp, ".md-badge-seal__scallop path");
    const svgFill = rowOf(path, "fill");
    assert.deepEqual([svgFill.cssProperty, svgFill.source, svgFill.readOnly?.reason, svgFill.computed], ["fill", "presentation-attribute", "presentation-attribute", "none"]);
    assert.equal(rowOf(path, "stroke").readOnly, null, "the stroke of the same path comes from a stylesheet and can be re-bound");

    // Literals, keywords and expressions.
    await loadActive(cdp, STORY.hanko);
    const content = await traceOf(cdp, ".md-badge-seal__content");
    assert.deepEqual([rowOf(content, "maxInlineSize").readOnly?.reason, rowOf(content, "maxInlineSize").declaration.value], ["raw-value", "70%"]);
    await loadActive(cdp, STORY.highlightTag);
    const expression = rowOf(await traceOf(cdp, ROOT), "minBlockSize");
    assert.equal(expression.readOnly?.reason, "expression");
    assert.equal(expression.chain[0]?.name, "--md-comp-badge-seal-min-size", "an expression still shows the chain of its reference");

    // Identity: every component stylesheet on the page is the indexed file.
    const identities = await inPreview(
      cdp,
      `const files = w.__CODE_LAYER__.index.css.files.map((f) => f.file);
       for (const file of files) { await w.Function("p", "return import(p)")("/" + file); }
       await new Promise((r) => setTimeout(r, 300));
       w.__CODE_LAYER__.context = null;
       const ctx = await w.__CODE_LAYER__.ensureContext();
       return [...ctx.identities.values()].map((i) => [i.file.file, i.ok, i.reason]);`,
    );
    assert.equal(identities.length, 7, JSON.stringify(identities));
    assert.ok(identities.every(([, ok]) => ok), JSON.stringify(identities));
    assert.deepEqual(diskHashes(), startHashes, "the edited stylesheet is back to its bytes");
  });

  await check("12.4 inherited values are traced to the declaring ancestor and classified", async () => {
    // Same component: the content inherits its font from the badge root and can be edited there.
    await loadActive(cdp, STORY.hanko);
    const content = await traceOf(cdp, ".md-badge-seal__content");
    const font = rowOf(content, "fontFamily");
    assert.deepEqual([font.inheritedFrom?.kind, font.inheritedFrom?.label, font.readOnly], ["same-component", "Badge Seal / hanko", null]);
    assert.deepEqual([font.declaration.selector, font.declaration.line, font.defaultScope], [".md-badge-seal", 11, "component-token"]);
    assert.ok(font.scopes.every((scope) => scope.available));
    assert.equal(font.cssProperty, "font-family", "the witness stays the selected element");

    // An enclosing, different component: read-only, with the element to go to.
    await loadActive(cdp, STORY.roundel);
    const figureSelector = '[data-component="badge-seal"] .md-price-lockup__figure';
    const figure = await traceOf(cdp, figureSelector);
    const color = rowOf(figure, "color");
    assert.deepEqual([color.inheritedFrom?.kind, color.readOnly?.reason, color.inheritedFrom?.label], ["other-component", "inherited-other-component", "Badge Seal / price-roundel"]);
    assert.deepEqual([color.inheritedFrom.descriptor.anchor.component, color.inheritedFrom.descriptor.path.length], ["badge-seal", 0], "the declaring element can be selected");
    assert.equal(color.declaration.workspacePath, "storybook/src/components/badge-seal/BadgeSeal.css");
    assert.equal(rowOf(figure, "fontFamily").inheritedFrom?.kind, "same-component", "the font of the same element comes from its own component");

    // currentcolor follows the text color of the enclosing component.
    await inPreview(cdp, `const el = d.querySelector(${JSON.stringify(figureSelector)}); w.__clHadStyle = el.hasAttribute("style"); el.style.color = "currentcolor"; return true`);
    const current = rowOf(await traceOf(cdp, figureSelector), "color");
    assert.deepEqual([current.inheritedFrom?.kind, current.readOnly?.reason, current.tokenName], ["other-component", "inherited-other-component", color.tokenName]);
    await inPreview(cdp, `const el = d.querySelector(${JSON.stringify(figureSelector)}); el.style.color = ""; if (!w.__clHadStyle) el.removeAttribute("style"); return true`);

    // Outside the components: a stylesheet that is not a component's.
    await loadActive(cdp, STORY.exampleCard);
    const title = rowOf(await traceOf(cdp, ".md-example-card__title"), "fontFamily");
    assert.deepEqual([title.inheritedFrom?.kind, title.readOnly?.reason, title.scopes.length], ["outside", "inherited-outside", 0]);
    assert.ok(title.inheritedFrom.label, "the source is named");

    // A conditional group: another rule provides the size when the media query matches.
    await loadActive(cdp, STORY.heroFestival);
    const wide = rowOf(await traceOf(cdp, ".md-hero-title-lockup__glyph"), "fontSize");
    assert.deepEqual([wide.inheritedFrom?.kind, wide.declaration.line, wide.tokenName], ["same-component", 27, "--md-comp-hero-title-lockup-headline-text-size"]);
    await evaluate(cdp, `document.getElementById("storybook-preview-iframe").style.width = "400px"; true`);
    try {
      await waitFor(() => inPreview(cdp, `return w.matchMedia("(max-width: 480px)").matches`), { label: "media query matches" });
      const narrow = rowOf(await traceOf(cdp, ".md-hero-title-lockup__glyph", { fresh: true }), "fontSize");
      assert.deepEqual([narrow.inheritedFrom?.kind, narrow.declaration.line, narrow.tokenName], ["same-component", 40, "--md-sys-typescale-display-sm-size"]);
      assert.notEqual(narrow.declaration.ordinal, wide.declaration.ordinal, "a different rule");
      assert.notEqual(narrow.computed, wide.computed);
    } finally {
      await evaluate(cdp, `document.getElementById("storybook-preview-iframe").style.width = ""; true`);
    }
    return `content ← ${font.inheritedFrom.label}; figure ← ${color.inheritedFrom.label}; card title ← ${title.inheritedFrom.label}`;
  });

  await check("12.5 scopes: declaration, component token and system token, with where each writes and what it affects", async () => {
    // The lab keeps the system tier closed: two scopes (see 6.5). Open it on the way to the page.
    await patchIndex(cdp, openSystemTier);
    try {
      await loadActive(cdp, STORY.hanko);
      const fill = rowOf(await traceOf(cdp, ROOT), "fill");
      assert.deepEqual(fill.scopes.map((scope) => [scope.id, scope.available]), [["declaration", true], ["component-token", true], ["system-token", true]]);
      assert.equal(fill.defaultScope, "component-token");
      const [declaration, component, system] = fill.scopes;
      assert.deepEqual([declaration.writes, declaration.impact], [{ files: ["storybook/src/components/badge-seal/BadgeSeal.css"], line: 59 }, { declarations: 1, components: 1, excludesInlineStyles: false }]);
      assert.deepEqual([component.writes, component.impact], [{ files: ["tokens/tokens-comp.css", "storybook/tokens/tokens-comp.css"], line: 54 }, { declarations: 1, components: 1, excludesInlineStyles: false }]);
      // The system scope counts every declaration that reaches the role, directly or through a component token.
      const index = await inPreview(cdp, `const i = w.__CODE_LAYER__.index; return { tokens: i.tokens.items.map((t) => ({ name: t.name, line: t.line, alias: t.alias, usedBy: t.usedBy.map((u) => u.file), aliasedBy: t.aliasedBy })), files: i.css.files.map((f) => [f.file, f.componentId]) }`);
      const token = (name) => index.tokens.find((t) => t.name === name);
      const primary = token("--md-sys-color-primary");
      const usages = [...primary.usedBy, ...primary.aliasedBy.flatMap((name) => token(name).usedBy)];
      const componentOf = Object.fromEntries(index.files);
      assert.deepEqual(system.target, { type: "rebind-token", token: "--md-sys-color-primary", tier: "sys", file: "tokens/tokens-sys.css", line: primary.line });
      assert.deepEqual([system.fromToken, system.targetTier], ["--md-ref-color-red-60", "ref"]);
      assert.deepEqual(system.writes, { files: ["tokens/tokens-sys.css", "storybook/tokens/tokens-sys.css"], line: primary.line });
      assert.deepEqual(system.impact, { declarations: usages.length, components: new Set(usages.map((file) => componentOf[file])).size, excludesInlineStyles: true });
      assert.ok(system.impact.components >= 2 && system.impact.declarations > component.impact.declarations, JSON.stringify(system.impact));

      // A system token overridden by the Storybook chrome stylesheet in the dark theme: flagged, and not editable at that scope.
      await loadActive(cdp, STORY.footnoteColumns);
      const group = ".md-footnote-legal-block__group + .md-footnote-legal-block__group";
      await inPreview(cdp, `d.documentElement.setAttribute("data-storybook-template-theme", "dark"); return true`);
      try {
        const border = rowOf(await traceOf(cdp, group, { fresh: true }), "borderColor/block-start");
        const outline = border.chain.find((link) => link.name === "--md-sys-color-outline");
        assert.deepEqual([outline.status, outline.overriddenBy.file], ["overridden", "storybook/src/styles/storybook.css"]);
        assert.ok(border.warnings.includes("overridden-in-theme"));
        const sys = border.scopes.find((scope) => scope.id === "system-token");
        assert.deepEqual([sys.available, sys.reason, sys.detail], [false, "token-shadowed", "storybook/src/styles/storybook.css"]);
        assert.deepEqual([border.defaultScope, border.scopes.find((scope) => scope.id === "component-token").available], ["component-token", true]);
      } finally {
        await inPreview(cdp, `d.documentElement.removeAttribute("data-storybook-template-theme"); w.__CODE_LAYER__.context = null; return true`);
      }

      // A component token declared twice: its scope is listed as unavailable and nothing takes its place as the default.
      await patchIndex(cdp, (json) => {
        openSystemTier(json);
        json.tokens.items.find((t) => t.name === "--md-comp-badge-seal-hanko-container-color").duplicate = true;
      });
      await loadActive(cdp, STORY.hanko);
      const broken = rowOf(await traceOf(cdp, ROOT), "fill");
      const brokenScope = broken.scopes.find((scope) => scope.id === "component-token");
      assert.deepEqual([brokenScope.available, brokenScope.reason, broken.defaultScope], [false, "duplicate-token", null]);
      assert.equal(broken.scopes.find((scope) => scope.id === "declaration").available, true, "the declaration scope is still offered, but not chosen silently");
      return `system scope affects ${system.impact.declarations} declarations in ${system.impact.components} components`;
    } finally {
      await patchIndex(cdp, null);
    }
  });

  await check("12.6 a probe confirms every kind of target, also under a transition; an overridden target is not confirmed", async () => {
    const probes = (rows) => inPreview(cdp, `const out = []; for (const [row, scope] of ${JSON.stringify(rows)}) out.push(await w.__CODE_LAYER__.probe(row, scope)); return out`);
    const withTransition = async (selector, run) => {
      await inPreview(cdp, `const sheet = new w.CSSStyleSheet(); sheet.replaceSync(${JSON.stringify(`${selector}, ${selector} * { transition: all 1s }`)}); d.adoptedStyleSheets = [...d.adoptedStyleSheets, sheet]; w.__clTransition = sheet; w.__clAnimationsBefore = d.getAnimations().length; return true`);
      try {
        await run();
        await inPreview(cdp, `await new Promise((r) => w.requestAnimationFrame(() => w.requestAnimationFrame(r))); return true`);
        assert.equal(await inPreview(cdp, `return d.getAnimations().length - w.__clAnimationsBefore`), 0, "no transition or animation was started");
      } finally {
        await inPreview(cdp, `d.adoptedStyleSheets = d.adoptedStyleSheets.filter((s) => s !== w.__clTransition); return true`);
      }
    };
    const ruleText = (file, selector) => inPreview(cdp, `const s = [...d.querySelectorAll("style[data-vite-dev-id]")].find((e) => e.dataset.viteDevId.endsWith(${JSON.stringify(file)})); return [...s.sheet.cssRules].find((r) => r.selectorText === ${JSON.stringify(selector)}).style.cssText`);

    await loadActive(cdp, STORY.hanko);
    await traceOf(cdp, ROOT);
    const hankoBefore = await ruleText("/BadgeSeal.css", ".md-badge-seal--hanko");
    await withTransition(".md-badge-seal", async () => {
      // A color through a component token and through its declaration, a radius, a padding, a minimum size.
      assert.deepEqual(await probes([["fill", "component-token"], ["fill", "declaration"], ["radius", "declaration"], ["padding", "component-token"], ["minInlineSize", "component-token"]]), ["confirmed", "confirmed", "confirmed", "confirmed", "confirmed"]);
      // Inherited rows: the ancestor's declaration is probed, the selected element is the witness.
      await traceOf(cdp, ".md-badge-seal__content");
      assert.deepEqual(await probes([["fontFamily", "component-token"], ["fontSize", "component-token"], ["color", "declaration"]]), ["confirmed", "confirmed", "confirmed"]);
    });
    assert.equal(await ruleText("/BadgeSeal.css", ".md-badge-seal--hanko"), hankoBefore, "the rule text is what it was");
    assert.equal((await previewComputed(cdp)).bg, "rgb(254, 11, 5)");

    // References at position 0 and 1 of one declaration.
    await loadActive(cdp, STORY.footnoteColumns);
    const group = ".md-footnote-legal-block__group + .md-footnote-legal-block__group";
    const groupRule = ".md-footnote-legal-block--rules .md-footnote-legal-block__group + .md-footnote-legal-block__group";
    await traceOf(cdp, group);
    const borderBefore = await ruleText("/FootnoteLegalBlock.css", groupRule);
    await withTransition(".md-footnote-legal-block", async () => {
      assert.deepEqual(await probes([["borderWidth/block-start", "declaration"], ["borderColor/block-start", "declaration"], ["borderColor/block-start", "component-token"]]), ["confirmed", "confirmed", "confirmed"]);
    });
    assert.equal(await ruleText("/FootnoteLegalBlock.css", groupRule), borderBefore);

    // SVG stroke.
    await loadActive(cdp, STORY.scallop);
    await traceOf(cdp, ".md-badge-seal__scallop path");
    assert.deepEqual(await probes([["stroke", "component-token"], ["strokeWidth", "declaration"]]), ["confirmed", "confirmed"]);

    // A rule the tracer cannot see wins over the traced declaration: the probe does not confirm it.
    await loadActive(cdp, STORY.hanko);
    await traceOf(cdp, ROOT);
    await inPreview(cdp, `const sheet = new w.CSSStyleSheet(); sheet.replaceSync(".md-badge-seal.md-badge-seal--hanko { background: rgb(9, 9, 9) !important }"); d.adoptedStyleSheets = [...d.adoptedStyleSheets, sheet]; w.__clOverride = sheet; return true`);
    try {
      assert.deepEqual(await probes([["fill", "component-token"], ["fill", "declaration"]]), ["unconfirmed", "unconfirmed"]);
    } finally {
      await inPreview(cdp, `d.adoptedStyleSheets = d.adoptedStyleSheets.filter((s) => s !== w.__clOverride); return true`);
    }
    assert.deepEqual(await probes([["fill", "component-token"]]), ["confirmed"]);
    assert.deepEqual(diskHashes(), startHashes);
  });
}

// ---- stage 13: capability check, navigation, deep select, selection memory ---------

const RIBBON = '[data-component="ribbon-banner"]';
const STRIP = (n) => `${RIBBON} .md-ribbon-banner__strip:nth-child(${n})`;
const SHIFT = 8;
const GUARD_TYPES = ["pointerdown", "click", "mousemove", "keydown"];
const COUNTERS = `w.__clSeen = { click: 0, keydown: 0 }; d.addEventListener("click", () => { w.__clSeen.click += 1; }); d.addEventListener("keydown", () => { w.__clSeen.keydown += 1; }); return true`;

/** The selection as these checks need it: which element, and where among its siblings. */
function picked(cdp) {
  return inPreview(
    cdp,
    `const cl = w.__CODE_LAYER__; const el = cl.selected; if (!el || !cl.lastTrace) return null;
     return { tag: el.tagName.toLowerCase(), cls: [...el.classList].join(" "), component: el.getAttribute("data-component"), at: [...el.parentElement.children].indexOf(el),
       display: getComputedStyle(el).display, label: cl.lastTrace.label, traceId: cl.lastTrace.traceId, connected: el.isConnected };`,
  );
}

function waitPicked(cdp, predicate, label) {
  return waitFor(async () => {
    const now = await picked(cdp);
    return now && predicate(now) ? now : null;
  }, { label });
}

/** Capture-phase listeners on the preview window, by event type (what the guards attach). */
async function captureListeners(cdp) {
  const { frameTree } = await cdp.send("Page.getFrameTree");
  const frame = (frameTree.childFrames ?? []).find((child) => child.frame.url.includes("iframe.html"));
  assert.ok(frame, "the preview frame");
  const contextId = cdp.contexts.get(frame.frame.id);
  assert.ok(contextId, "the preview frame's execution context");
  const { result } = await cdp.send("Runtime.evaluate", { expression: "window", contextId });
  const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
  return listeners.filter((listener) => listener.useCapture).map((listener) => listener.type);
}

/**
 * Each story's last selection is remembered for the tab and restored when the story opens again.
 * A check about what a first click selects has to start without one.
 */
const forgetSelections = (cdp) => evaluate(cdp, `(() => { try { sessionStorage.removeItem("code-layer/v2/selection"); } catch {} return true; })()`);

const managerChannel = (cdp, event, payload) => evaluate(cdp, `window.__STORYBOOK_ADDONS_CHANNEL__.emit(${JSON.stringify(event)}, ${JSON.stringify(payload)}); true`);

async function stage13(cdp) {
  const startHashes = diskHashes();

  await check("13.1 a browser without a required feature keeps the tool suspended and attaches nothing", async () => {
    // Positive control: with the feature present the tool is active, holds its guards, and the story sees no input.
    await loadActive(cdp, STORY.hanko);
    await inPreview(cdp, COUNTERS);
    const point = await previewPoint(cdp, ROOT);
    await click(cdp, point.x, point.y);
    await waitPicked(cdp, (s) => s.component === "badge-seal", "badge selected");
    await key(cdp, "a");
    await delayMs(150);
    assert.deepEqual(await inPreview(cdp, `return w.__clSeen`), { click: 0, keydown: 0 }, "active: the story sees neither the click nor the key");
    const activeListeners = await captureListeners(cdp);
    assert.ok(GUARD_TYPES.every((type) => activeListeners.includes(type)), `guards attached while active: ${activeListeners.join(" ")}`);
    assert.equal((await overlayState(cdp)).mounted, true);

    const { identifier } = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      // The preview frame starts as about:blank and keeps its window when it navigates: decide by frame, not by URL.
      source: `if (window.top !== window) { delete Document.prototype.adoptedStyleSheets; }`,
    });
    let reason = "";
    try {
      await cdp.send("Page.navigate", { url: `${BASE}/?path=/story/${STORY.hanko}&globals=codeLayer:!true` });
      await waitFor(() => inPreview(cdp, `return !!(w.__CODE_LAYER__ && w.__CODE_LAYER__.index && w.__CODE_LAYER__.effective.state !== "off" && d.querySelector("#storybook-root [data-component]"))`), { timeout: 90000, label: "story with the feature removed" });
      await delayMs(400);
      assert.equal(await inPreview(cdp, `return "adoptedStyleSheets" in d`), false, "the feature is gone in the preview");
      assert.deepEqual(await inPreview(cdp, `return w.__CODE_LAYER__.effective`), { state: "suspended", reason: "unsupported-browser", detail: "adopted-stylesheets" });
      assert.equal(await inPreview(cdp, `return d.querySelectorAll("[data-code-layer-chrome], [data-code-layer-ui]").length`), 0, "no shield, no outline");
      const listeners = await captureListeners(cdp);
      assert.deepEqual(listeners.filter((type) => GUARD_TYPES.includes(type)), [], "no guard listener on the page");
      // The story is fully live: it receives the click and the key.
      await inPreview(cdp, COUNTERS);
      const again = await previewPoint(cdp, ROOT);
      await click(cdp, again.x, again.y);
      await key(cdp, "a");
      await delayMs(150);
      assert.deepEqual(await inPreview(cdp, `return [w.__clSeen, w.__CODE_LAYER__.selected === null]`), [{ click: 1, keydown: 1 }, true]);
      // The reason is readable on the toggle and in the panel, and names the feature.
      const tool = await waitFor(() => evaluate(cdp, `(() => { const b = document.querySelector("[data-code-layer-tool]"); return b && b.getAttribute("data-code-layer-tool") === "suspended" ? { reason: b.getAttribute("data-code-layer-reason"), label: b.getAttribute("aria-label") } : null; })()`), { label: "toggle shows the suspension" });
      assert.equal(tool.reason, "unsupported-browser");
      assert.match(tool.label, /adopted stylesheets/i);
      const panel = await waitFor(() => evaluate(cdp, `(() => { const m = document.querySelector('[data-code-layer-suspended="unsupported-browser"]'); return m ? m.textContent : null; })()`), { label: "panel shows the suspension" });
      assert.match(panel, /adopted stylesheets/i);
      reason = panel;
    } finally {
      await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    }

    // With the feature back the tool runs again; switched off, it holds no listener either.
    await loadActive(cdp, STORY.hanko);
    assert.ok((await captureListeners(cdp)).includes("click"));
    await setMode(cdp, false);
    await delayMs(200);
    assert.deepEqual((await captureListeners(cdp)).filter((type) => GUARD_TYPES.includes(type)), [], "off: no guard listener");
    assert.equal(await inPreview(cdp, `return d.querySelectorAll("[data-code-layer-chrome]").length`), 0);
    return reason;
  });

  await check("13.2 click, double-click, Enter, Tab and Shift+Enter move through the levels; the story is never touched", async () => {
    await forgetSelections(cdp);
    await loadActive(cdp, STORY.ribbonVertical);
    await inPreview(cdp, COUNTERS);
    const before = await inPreview(cdp, `return d.getElementById("storybook-root").innerHTML`);
    const p1 = await previewPoint(cdp, STRIP(1));
    const p2 = await previewPoint(cdp, STRIP(2));
    const p3 = await previewPoint(cdp, STRIP(3));
    const isStrip = (at) => (s) => s.cls === "md-ribbon-banner__strip" && s.at === at;
    const isRoot = (s) => s.component === "ribbon-banner";
    const unchangedAfter = async (press, label) => {
      const was = await picked(cdp);
      await press();
      await delayMs(250);
      assert.deepEqual(await picked(cdp), was, label);
    };

    // First click: the outermost component root, wherever inside it the click lands.
    await clickWith(cdp, p2.x, p2.y);
    const root = await waitPicked(cdp, isRoot, "component root after the first click");
    // Hover shows what a click would select: still the root.
    await mouse(cdp, "mouseMoved", p3.x, p3.y);
    await waitFor(async () => ((await overlayState(cdp)).hoverLabel === root.label ? true : null), { label: "hover outlines the root" });

    // Double-click: one level down, the child under the pointer.
    await clickWith(cdp, p2.x, p2.y, { count: 2 });
    const strip = await waitPicked(cdp, isStrip(1), "second strip after a double-click");
    assert.equal(strip.label, "Ribbon Banner › strip");
    // A click on a sibling stays at the navigated level.
    await mouse(cdp, "mouseMoved", p3.x, p3.y);
    await waitFor(async () => ((await overlayState(cdp)).hoverLabel === strip.label ? true : null), { label: "hover outlines the sibling strip" });
    await clickWith(cdp, p3.x, p3.y);
    await waitPicked(cdp, isStrip(2), "third strip after a click");
    await clickWith(cdp, p1.x, p1.y);
    await waitPicked(cdp, isStrip(0), "first strip after a click");
    // A strip has no child element: Enter and a double-click leave the selection alone.
    await unchangedAfter(() => key(cdp, "Enter"), "Enter on a leaf");
    await unchangedAfter(() => clickWith(cdp, p1.x, p1.y, { count: 2 }), "double-click on a leaf");

    // The specification's keyboard walk: root, Enter, Tab, Tab, Tab, Shift+Enter.
    await key(cdp, "Enter", { modifiers: SHIFT });
    await waitPicked(cdp, isRoot, "Shift+Enter: back to the root");
    const walk = [];
    for (const [name, modifiers, expected] of [["Enter", 0, isStrip(0)], ["Tab", 0, isStrip(1)], ["Tab", 0, isStrip(2)], ["Tab", 0, isStrip(0)], ["Tab", SHIFT, isStrip(2)], ["Enter", SHIFT, isRoot]]) {
      await key(cdp, name, { modifiers });
      const now = await waitPicked(cdp, expected, `${modifiers ? "Shift+" : ""}${name} (walk so far: ${walk.join(" → ")})`);
      walk.push(now.component ? "root" : `strip ${now.at + 1}`);
    }
    assert.deepEqual(walk, ["strip 1", "strip 2", "strip 3", "strip 1", "strip 3", "root"]);

    // Upwards from the root: only elements that generate a box; the display: contents wrapper is never selected.
    const chain = await inPreview(cdp, `const out = []; const root = d.getElementById("storybook-root"); for (let el = d.querySelector(${JSON.stringify(RIBBON)}).parentElement; el && el !== root; el = el.parentElement) out.push({ cls: [...el.classList].join(" "), display: getComputedStyle(el).display }); return out`);
    assert.ok(chain.some((el) => el.cls.includes("sbfx-story-scope") && el.display === "contents"), `the lab wraps stories in a box-less element: ${JSON.stringify(chain)}`);
    const boxed = chain.filter((el) => el.display !== "contents");
    const up = [];
    for (let i = 0; i < boxed.length; i += 1) {
      const was = await picked(cdp);
      await key(cdp, "Enter", { modifiers: SHIFT });
      const now = await waitPicked(cdp, (s) => s.traceId !== was.traceId, `parent ${i + 1}`);
      assert.notEqual(now.display, "contents");
      assert.ok(!now.cls.includes("sbfx-"), `selected ${now.cls}`);
      up.push(now.cls || now.tag);
    }
    await unchangedAfter(() => key(cdp, "Enter", { modifiers: SHIFT }), "Shift+Enter with no selectable parent");
    await unchangedAfter(() => key(cdp, "Tab"), "Tab with no sibling");
    // The wrapper is not listed as a parent or a child either.
    const relatives = await inManager(cdp, `return [...document.querySelectorAll("[data-code-layer-crumb], [data-code-layer-child]")].map((e) => e.textContent)`);
    assert.ok(relatives.length > 0 && relatives.every((text) => !text.includes("sbfx")), JSON.stringify(relatives));
    // Back down with Enter: the wrapper's only child is the component root.
    for (let i = 0; i < boxed.length; i += 1) await key(cdp, "Enter");
    await waitPicked(cdp, isRoot, "Enter from the top reaches the root again");

    // Escape clears; a click on empty space clears too.
    await key(cdp, "Escape");
    await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.selected === null`), { label: "Escape clears" });
    await clickWith(cdp, p2.x, p2.y);
    await waitPicked(cdp, isRoot, "selected again");
    const empty = await inPreview(cdp, `const fr = f.getBoundingClientRect(); return { x: fr.left + fr.width - 12, y: fr.top + fr.height - 12 }`);
    await clickWith(cdp, empty.x, empty.y);
    await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.selected === null`), { label: "a click on empty space clears" });

    assert.equal(await inPreview(cdp, `return d.getElementById("storybook-root").innerHTML`), before, "the story markup is what it was");
    assert.deepEqual(await inPreview(cdp, `return w.__clSeen`), { click: 0, keydown: 0 }, "the story received no click and no key");
    return `${walk.join(" → ")}; above the root: ${up.join(" → ") || "(nothing)"}`;
  });

  await check("13.3 the primary modifier selects the deepest element, also one without pointer events", async () => {
    await forgetSelections(cdp);
    await loadActive(cdp, STORY.scallop);
    const pathSelector = ".md-badge-seal__scallop path";
    // A point on the painted stroke of the decoration.
    const spot = await inPreview(
      cdp,
      `const path = d.querySelector(${JSON.stringify(pathSelector)}); const fr = f.getBoundingClientRect(); const m = path.getScreenCTM(); const total = path.getTotalLength();
       for (const fraction of [0.13, 0.31, 0.47, 0.62, 0.8, 0.05]) {
         const p = path.getPointAtLength(total * fraction); const x = m.a * p.x + m.c * p.y + m.e; const y = m.b * p.x + m.d * p.y + m.f;
         const plain = d.elementsFromPoint(x, y)[0];
         if (plain && plain !== path) return { x: fr.left + x, y: fr.top + y, pointerEvents: getComputedStyle(path).pointerEvents, plain: plain.tagName.toLowerCase() };
       }
       return null;`,
    );
    assert.ok(spot, "a point on the stroke");
    assert.equal(spot.pointerEvents, "none", "the decoration receives no pointer events");
    const sheetsBefore = await inPreview(cdp, `return d.adoptedStyleSheets.length`);

    // A plain click there: the component root.
    await clickWith(cdp, spot.x, spot.y);
    await waitPicked(cdp, (s) => s.component === "badge-seal", "plain click selects the component root");
    // With the modifier: the path itself.
    await clickWith(cdp, spot.x, spot.y, { modifiers: MOD });
    const deep = await waitPicked(cdp, (s) => s.tag === "path", "the SVG path is selected");
    assert.equal(deep.label, "Badge Seal › path");
    assert.equal(await inPreview(cdp, `return d.adoptedStyleSheets.length`), sheetsBefore, "the temporary sheet is gone");
    assert.equal(await inPreview(cdp, `return getComputedStyle(d.querySelector(${JSON.stringify(pathSelector)})).pointerEvents`), "none");
    // A plain click at the same place afterwards stays at the navigated level or returns to the root, never the path.
    await key(cdp, "Escape");
    await clickWith(cdp, spot.x, spot.y);
    await waitPicked(cdp, (s) => s.component === "badge-seal", "plain click again selects the component root");

    // Regardless of the current level: from nothing selected straight to a nested element.
    await loadActive(cdp, STORY.priceHero);
    const number = await previewPoint(cdp, ".md-price-lockup__number");
    await clickWith(cdp, number.x, number.y, { modifiers: MOD });
    const nested = await waitPicked(cdp, (s) => s.cls === "md-price-lockup__number", "deep select reaches the number in one click");
    // A double-click without the modifier also reaches an element without pointer events, one level at a time.
    await loadActive(cdp, STORY.scallop);
    await clickWith(cdp, spot.x, spot.y);
    await waitPicked(cdp, (s) => s.component === "badge-seal", "root first");
    const levels = [];
    for (let i = 0; i < 5 && levels.at(-1) !== "path"; i += 1) {
      await clickWith(cdp, spot.x, spot.y, { count: 2 });
      await delayMs(500);
      levels.push((await picked(cdp))?.tag ?? "(nothing)");
    }
    assert.equal(levels.at(-1), "path", `double-clicks went ${levels.join(" → ")}`);
    assert.equal(new Set(levels).size, levels.length, `each double-click goes one level further: ${levels.join(" → ")}`);
    return `plain click → root; ${process.platform === "darwin" ? "Cmd" : "Ctrl"}+click → ${deep.label}, ${nested.label}; double-clicks: ${levels.join(" → ")}`;
  });

  await check("13.4 a deep selection survives a hot update, a reload and a story switch; a removed element is reported lost", async () => {
    const unit = ".md-price-lockup__unit";
    await forgetSelections(cdp);
    const isUnit = (s) => s.cls === "md-price-lockup__unit" && s.connected;
    await loadActive(cdp, STORY.priceHero);
    const point = await previewPoint(cdp, unit);
    await clickWith(cdp, point.x, point.y, { modifiers: MOD });
    const first = await waitPicked(cdp, isUnit, "the unit, two levels below the component root");
    const descriptor = await inPreview(cdp, `return w.__CODE_LAYER__.selectedDescriptor`);
    assert.deepEqual([descriptor.anchor.component, descriptor.path.map((step) => step.key)], ["price-lockup", ["md-price-lockup__figure", "md-price-lockup__unit"]]);

    // A hot update of its stylesheet (the same bytes written again).
    const css = labFile("src/components/price-lockup/PriceLockup.css");
    fs.writeFileSync(css, fs.readFileSync(css));
    const afterHmr = await waitPicked(cdp, (s) => isUnit(s) && s.traceId !== first.traceId, "still selected after the hot update, traced again");
    assert.equal((await overlayState(cdp)).select.display, "block", "the outline is drawn");

    // A reload of the tab.
    await cdp.send("Page.reload");
    await waitFor(() => inPreview(cdp, `return !!(w.__CODE_LAYER__ && w.__CODE_LAYER__.effective.state === "active")`), { timeout: 60000, label: "active after the reload" });
    await waitPicked(cdp, isUnit, "restored after the reload");
    assert.equal((await overlayState(cdp)).select.display, "block");

    // Another story of the same component, and back: each story keeps its own last selection.
    const go = async (storyId) => {
      const item = await waitFor(() => managerRect(cdp, `#${storyId}`), { label: `sidebar item ${storyId}` });
      await click(cdp, item.x, item.y);
      await waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.storyId === ${JSON.stringify(storyId)} && w.__CODE_LAYER__.effective.state === "active"`), { label: storyId });
    };
    const inline = "components-typographic-price-lockup--inline";
    await go(inline);
    await delayMs(600);
    assert.equal(await inPreview(cdp, `return w.__CODE_LAYER__.selected`), null, "switching stories clears the selection");
    const label = await previewPoint(cdp, ".md-price-lockup__number");
    await clickWith(cdp, label.x, label.y, { modifiers: MOD });
    await waitPicked(cdp, (s) => s.cls === "md-price-lockup__number", "another element in the other story");
    await go(STORY.priceHero);
    await waitPicked(cdp, isUnit, "back on the first story: its last selection");
    await go(inline);
    await waitPicked(cdp, (s) => s.cls === "md-price-lockup__number", "and the other story's own selection");
    await go(STORY.priceHero);
    await waitPicked(cdp, isUnit, "the unit again");

    // An args change that keeps the element keeps the selection; one that removes it loses it.
    await managerChannel(cdp, "updateStoryArgs", { storyId: STORY.priceHero, updatedArgs: { amount: 123456 } });
    await waitFor(() => inPreview(cdp, `return d.querySelector(".md-price-lockup__number").textContent === "123,456"`), { label: "re-rendered with the new amount" });
    await waitPicked(cdp, isUnit, "still the unit after a re-render");
    await managerChannel(cdp, "updateStoryArgs", { storyId: STORY.priceHero, updatedArgs: { currency: "yen-prefix" } });
    await waitFor(() => inPreview(cdp, `return !d.querySelector(${JSON.stringify(unit)}) && w.__CODE_LAYER__.selected === null && w.__CODE_LAYER__.selectedDescriptor === null`), { label: "the selection is cleared when its element is gone" });
    const notice = await waitFor(() => evaluate(cdp, `(() => { const n = document.querySelector('[data-code-layer-notice="selection-lost"]'); return n ? n.textContent : null; })()`), { label: "the panel says the selection was lost" });
    assert.match(notice, /Price Lockup › unit/);
    assert.equal((await overlayState(cdp)).select.display, "none", "no outline is left behind");
    // A new selection takes the notice away.
    const number = await previewPoint(cdp, ".md-price-lockup__number");
    await clickWith(cdp, number.x, number.y);
    await waitPicked(cdp, (s) => s.component === "price-lockup", "a new selection");
    await waitFor(() => evaluate(cdp, `!document.querySelector('[data-code-layer-notice="selection-lost"]')`), { label: "the notice is gone" });
    await managerChannel(cdp, "resetStoryArgs", { storyId: STORY.priceHero });
    await waitFor(() => inPreview(cdp, `return !!d.querySelector(${JSON.stringify(unit)})`), { label: "args reset" });
    assert.deepEqual(diskHashes(), startHashes);
    return `${afterHmr.label}: ${notice}`;
  });
}

// ---- stage 14: the panel -----------------------------------------------------------

const CJK = /[　-〿㐀-鿿＀-￯]/;
const PROJECT = "showa-pop-80sjp-storybook";
const SECONDARY = "--md-sys-color-secondary";
const BLUE = "rgb(16, 160, 226)";
const RED = "rgb(254, 11, 5)";
const rowSelector = (rowId) => `[data-code-layer-row=${JSON.stringify(rowId)}]`;
/** The popover that opens beside the inspector for a row. */
const popSelector = (rowId) => `[data-code-layer-popover=${JSON.stringify(rowId)}]`;
const panelText = (cdp) => inManager(cdp, `return document.querySelector("[data-code-layer-panel]").textContent`);

/** A row of the inspector and, when it is open, its popover. */
function rowState(cdp, rowId) {
  return inManager(
    cdp,
    `const r = document.querySelector(${JSON.stringify(rowSelector(rowId))}); if (!r) return null;
     const pop = document.querySelector(${JSON.stringify(popSelector(rowId))});
     return { editable: r.getAttribute("data-editable"), readonly: r.getAttribute("data-readonly"), scope: r.getAttribute("data-scope"), probe: r.getAttribute("data-probe"), steps: Number(r.getAttribute("data-steps")),
       stepToken: r.getAttribute("data-step-token"), token: r.getAttribute("data-token"), inherited: r.getAttribute("data-inherited"), open: !!pop,
       picker: pop?.querySelector("[data-code-layer-picker]")?.getAttribute("data-probe") ?? null, focused: document.activeElement === r, reason: pop?.querySelector("[data-code-layer-reason]")?.textContent ?? null,
       title: r.getAttribute("title") ?? "", text: r.textContent, popText: pop?.textContent ?? "" };`,
  );
}

/** waitFor, but a timeout says what was last seen. */
async function waitSeen(read, predicate, label) {
  let seen;
  try {
    return await waitFor(async () => {
      seen = await read();
      return seen && predicate(seen) ? seen : null;
    }, { label });
  } catch (error) {
    throw new Error(`${error.message}\n last seen: ${JSON.stringify(seen)?.slice(0, 1200)}`);
  }
}

function waitRow(cdp, rowId, predicate, label) {
  return waitSeen(() => rowState(cdp, rowId), predicate, `row ${rowId}: ${label}`);
}

async function clickIn(cdp, selector, label = selector) {
  await waitFor(() => inManager(cdp, `return !!document.querySelector(${JSON.stringify(selector)})`), { label });
  await reveal(cdp, selector);
  const rect = await waitFor(() => managerRect(cdp, selector), { label });
  await click(cdp, rect.x, rect.y);
  return rect;
}

async function openRow(cdp, rowId) {
  const state = await waitFor(() => rowState(cdp, rowId), { label: `row ${rowId}` });
  if (!state.open) await clickIn(cdp, rowSelector(rowId));
  return waitRow(cdp, rowId, (now) => now.open, "open");
}

const pickerOptions = (cdp, rowId) =>
  inManager(cdp, `return [...document.querySelectorAll(${JSON.stringify(`[data-code-layer-picker=${JSON.stringify(rowId)}] [data-token]`)})].map((e) => ({ token: e.getAttribute("data-token"), tier: e.getAttribute("data-tier"), disabled: e.getAttribute("aria-disabled"), text: e.textContent }))`);

const waitTitle = (cdp, title) => waitFor(() => inManager(cdp, `const t = document.querySelector("[data-code-layer-title]"); return !!t && t.textContent === ${JSON.stringify(title)}`), { label: `panel title ${title}` });

const drafts = (cdp) => inManager(cdp, `return [...document.querySelectorAll("[data-code-layer-draft]")].map((e) => ({ id: e.getAttribute("data-code-layer-draft"), scope: e.getAttribute("data-scope"), status: e.getAttribute("data-status"), to: e.getAttribute("data-to"), text: e.textContent, title: e.firstElementChild?.getAttribute("title") ?? "" }))`);

function waitDrafts(cdp, predicate, label) {
  return waitSeen(() => drafts(cdp), predicate, label);
}

function header(cdp) {
  return inManager(
    cdp,
    `const h = document.querySelector("[data-code-layer-header]"); if (!h) return null;
     return { title: document.querySelector("[data-code-layer-title]").textContent, meta: h.querySelector("[data-code-layer-meta]").textContent,
       crumbs: [...h.querySelectorAll("[data-code-layer-crumb]")].map((e) => ({ text: e.textContent, root: e.getAttribute("data-component-root"), current: e.getAttribute("aria-current") })),
       children: [...h.querySelectorAll("[data-code-layer-child]")].map((e) => e.textContent), rule: h.querySelector("[data-code-layer-own-rule]")?.textContent ?? null };`,
  );
}

/** Developer details (file locations, token chains) on or off. */
async function setDev(cdp, on) {
  const now = await inManager(cdp, `return document.querySelector("[data-code-layer-panel]").getAttribute("data-dev") === "true"`);
  if (now !== on) await clickAction(cdp, "toggle-dev");
  await waitFor(() => inManager(cdp, `return document.querySelector("[data-code-layer-panel]").getAttribute("data-dev") === ${JSON.stringify(String(on))}`), { label: `developer details ${on ? "on" : "off"}` });
}

function highlightState(cdp) {
  return inPreview(
    cdp,
    `const s = d.querySelector("[data-code-layer-chrome]")?.shadowRoot; if (!s) return null; const box = s.querySelector(".highlight"); const r = box.getBoundingClientRect();
     return { shown: getComputedStyle(box).display !== "none" && r.width > 0, label: s.querySelector(".highlight-label").textContent, rect: [r.left, r.top, r.width, r.height].map(Math.round) };`,
  );
}

const elementRect = (cdp, selector) => inPreview(cdp, `const r = d.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round)`);
const computedOf = (cdp, selector, properties) => inPreview(cdp, `const cs = getComputedStyle(d.querySelector(${JSON.stringify(selector)})); return ${JSON.stringify(properties)}.map((p) => cs.getPropertyValue(p))`);
const near = (a, b) => a.every((value, i) => Math.abs(value - b[i]) <= 1);

async function clickBadge(cdp) {
  const point = await previewPoint(cdp, ROOT);
  await click(cdp, point.x, point.y);
  await waitPicked(cdp, (s) => s.component === "badge-seal", "badge selected");
}

/** Select a child of the current selection through the panel's children list. */
async function selectChild(cdp, label) {
  const at = await waitFor(async () => {
    const h = await header(cdp);
    const index = h ? h.children.indexOf(label) : -1;
    return index === -1 ? null : { index };
  }, { label: `child ${label} listed` });
  await clickIn(cdp, `[data-code-layer-child="${at.index}"]`);
  await waitTitle(cdp, label);
}

async function copyFromOutline(cdp) {
  await inPreview(cdp, `w.__CODE_LAYER__.lastCopied = null; return true`);
  const button = await waitFor(() => inPreview(cdp, `const s = d.querySelector("[data-code-layer-chrome]").shadowRoot.querySelector(".select-label button"); if (!s) return null; const r = s.getBoundingClientRect(); const fr = f.getBoundingClientRect(); return r.width ? { x: fr.left + r.left + r.width / 2, y: fr.top + r.top + r.height / 2 } : null;`), { label: "copy button on the outline" });
  await click(cdp, button.x, button.y);
  return waitFor(() => inPreview(cdp, `return w.__CODE_LAYER__.lastCopied`), { label: "copied text" });
}

/** What a reference line points at, whatever the language of its labels. */
const skeleton = (text) => text.split("\n").map((line) => (line.match(/--[a-z0-9-]+|[\w./-]+\.css:\d+|#\d+|\d+(?:\.\d+)?(?:px|%|em|rem)?/g) ?? []).join(" "));

async function clearDrafts(cdp) {
  await loadStory(cdp, HANKO);
  await inManager(cdp, `localStorage.removeItem("code-layer/v2/${PROJECT}/drafts"); localStorage.removeItem("code-layer/v1/${PROJECT}/drafts"); sessionStorage.clear(); return true`);
}

async function stage14(cdp) {
  const startHashes = diskHashes();
  const FOOTNOTE_CSS = labFile("src/components/footnote-legal-block/FootnoteLegalBlock.css");
  const footnoteHash = sha(FOOTNOTE_CSS);
  let englishReference = null;

  await check("14.1 with locale en in the binding, the panel, the outline labels and the reference are in English", async () => {
    await clearDrafts(cdp);
    await patchIndex(cdp, (json) => {
      json.locale = "en";
    });
    try {
      await loadActive(cdp, STORY.hanko);
      assert.equal(await inPreview(cdp, `return w.__CODE_LAYER__.index.locale`), "en");
      await clickBadge(cdp);
      await waitTitle(cdp, "Badge Seal / hanko");
      let panel = await panelText(cdp);
      assert.doesNotMatch(panel, CJK, panel.slice(0, 400));
      assert.match(panel, /Layout.*Spacing.*Size.*Appearance.*Fill.*Stroke.*Typography/s);
      assert.match(panel, /Padding12px/);
      assert.match(panel, /Radius4px/);
      const chrome = await inManager(cdp, `return { tool: document.querySelector("[data-code-layer-tool]").getAttribute("aria-label"), tips: [...document.querySelectorAll("[data-code-layer-panel] [title]")].map((e) => e.getAttribute("title")) }`);
      assert.match(chrome.tool, /^Code Layer: on/);
      // Tooltips are interface text too.
      assert.ok(chrome.tips.length > 10 && chrome.tips.every((tip) => !CJK.test(tip)), JSON.stringify(chrome.tips.filter((tip) => CJK.test(tip))));
      assert.ok(chrome.tips.some((tip) => /display is shown for reference only/.test(tip)), "read-only rows say why in their tooltip");
      const overlay = await overlayState(cdp);
      assert.match(overlay.selectLabel, /Copy reference/);
      assert.doesNotMatch(overlay.selectLabel, CJK);
      // An open row with its chain, scopes and picker; then a staged change.
      const option = await pickToken(cdp, "fill", "secondary", SECONDARY);
      panel = await panelText(cdp);
      assert.doesNotMatch(panel, CJK, panel.slice(0, 600));
      await click(cdp, option.x, option.y);
      const staged = await waitDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "one previewing change");
      assert.match(staged[0].text, /^Fillcolor-primary → color-secondary/);
      assert.match(staged[0].title, /This component/);
      assert.match(staged[0].title, /Component token · Writes tokens\/tokens-comp\.css:54/);
      assert.doesNotMatch(await panelText(cdp), CJK);
      englishReference = await copyFromOutline(cdp);
      assert.equal(englishReference.split("\n")[0], "[Code Layer object reference v2]");
      assert.doesNotMatch(englishReference, CJK);
      await clickAction(cdp, "discard");
      await waitDrafts(cdp, (list) => list.length === 0, "discarded");
    } finally {
      await patchIndex(cdp, null);
    }
    return `${englishReference.split("\n").length} reference lines`;
  });

  await check("14.2 the header names the selection; breadcrumb and children navigate and highlight", async () => {
    await forgetSelections(cdp);
    await loadActive(cdp, STORY.ribbonVertical);
    const p2 = await previewPoint(cdp, STRIP(2));
    await clickWith(cdp, p2.x, p2.y);
    await waitPicked(cdp, (s) => s.component === "ribbon-banner", "root");
    await clickWith(cdp, p2.x, p2.y, { count: 2 });
    await waitPicked(cdp, (s) => s.cls === "md-ribbon-banner__strip" && s.at === 1, "second strip");
    await waitTitle(cdp, "Ribbon Banner › strip");
    // The stylesheet rule and the element path are developer details.
    assert.equal((await header(cdp)).rule, null, "no file path in the header by default");
    await setDev(cdp, true);
    const h = await waitFor(async () => {
      const now = await header(cdp);
      return now && now.crumbs.length > 0 && now.rule ? now : null;
    }, { label: "breadcrumb" });
    const facts = await inPreview(cdp, `const cl = w.__CODE_LAYER__; const el = cl.selected; return { size: el.offsetWidth + " × " + el.offsetHeight, rule: cl.lastTrace.ownRule, variant: el.parentElement.getAttribute("data-variant") }`);
    assert.ok(h.meta.includes("ribbon-banner") && h.meta.includes(facts.variant) && h.meta.includes(facts.size), h.meta);
    // The breadcrumb: the story's wrapper, the component root (marked as a boundary), the selection. No box-less wrapper.
    assert.equal(h.crumbs.length, 3, JSON.stringify(h.crumbs));
    assert.deepEqual(h.crumbs.map((c) => c.root), ["false", "true", "false"]);
    assert.deepEqual([h.crumbs[1].text, h.crumbs[2].text, h.crumbs[2].current], [`◆ Ribbon Banner / ${facts.variant}`, "Ribbon Banner › strip", "true"]);
    assert.deepEqual(h.children, [], "a strip has no child element");
    // The rule that styles the element, where it is on disk.
    assert.ok(h.rule.includes(facts.rule.workspacePath) && h.rule.includes(facts.rule.selector) && h.rule.includes(String(facts.rule.line)), h.rule);
    const ruleLine = fs.readFileSync(path.join(LAB_ROOT(), facts.rule.workspacePath), "utf8").split("\n")[facts.rule.line - 1];
    assert.ok(ruleLine.includes(facts.rule.selector.split("\n")[0].split(",")[0].trim()), `${facts.rule.workspacePath}:${facts.rule.line} is "${ruleLine}"`);

    // Pointing at an ancestor outlines it in the preview; leaving removes the outline.
    const crumb = await managerRect(cdp, '[data-code-layer-crumb="1"]');
    await mouse(cdp, "mouseMoved", crumb.x, crumb.y);
    const lit = await waitFor(async () => {
      const now = await highlightState(cdp);
      return now?.shown ? now : null;
    }, { label: "ancestor outlined" });
    assert.equal(lit.label, `Ribbon Banner / ${facts.variant}`);
    assert.ok(near(lit.rect, await elementRect(cdp, RIBBON)), `${lit.rect} vs the root`);
    const title = await managerRect(cdp, "[data-code-layer-title]");
    await mouse(cdp, "mouseMoved", title.x, title.y);
    await waitFor(async () => ((await highlightState(cdp)).shown ? null : true), { label: "outline removed" });

    // Clicking it selects it; the rows are those of the new selection.
    await click(cdp, crumb.x, crumb.y);
    await waitPicked(cdp, (s) => s.component === "ribbon-banner", "the root through the breadcrumb");
    await waitTitle(cdp, `Ribbon Banner / ${facts.variant}`);
    const rows = await inManager(cdp, `return [...document.querySelectorAll("[data-code-layer-row]")].map((e) => e.getAttribute("data-code-layer-row"))`);
    // The rows of the new selection: those that are set (a declaration, or a value inherited from an element).
    assert.deepEqual(rows, await inPreview(cdp, `return w.__CODE_LAYER__.lastTrace.rows.filter((r) => r.source !== "none" || r.layout !== null || (r.inheritedFrom && r.inheritedFrom.kind !== "default")).map((r) => r.id)`));
    assert.ok(rows.length >= 4, rows.join(", "));
    assert.equal(await inManager(cdp, `return document.querySelector("[data-code-layer-own-rule]").textContent.includes(".md-ribbon-banner__strip")`), false, "the header shows the root's own rule now");

    // Children: what can be selected one level down in the preview.
    const listed = await waitFor(async () => {
      const now = await header(cdp);
      return now.children.length > 0 ? now.children : null;
    }, { label: "children listed" });
    const inPage = await inPreview(cdp, `return [...d.querySelector(${JSON.stringify(RIBBON)}).children].filter((el) => !["none", "contents"].includes(getComputedStyle(el).display)).length`);
    assert.deepEqual(listed, Array(inPage).fill("Ribbon Banner › strip"));
    assert.equal(inPage, 3);
    const child = await managerRect(cdp, '[data-code-layer-child="2"]');
    await mouse(cdp, "mouseMoved", child.x, child.y);
    const litChild = await waitFor(async () => {
      const now = await highlightState(cdp);
      return now?.shown ? now : null;
    }, { label: "child outlined" });
    assert.ok(near(litChild.rect, await elementRect(cdp, STRIP(3))), `${litChild.rect} vs the third strip`);
    await click(cdp, child.x, child.y);
    await waitPicked(cdp, (s) => s.cls === "md-ribbon-banner__strip" && s.at === 2, "third strip through the children list");
    assert.equal((await highlightState(cdp)).shown, false, "no outline is left after the click");
    await setDev(cdp, false);
    return `${h.crumbs.map((c) => c.text).join(" › ")} · ${h.meta}`;
  });

  await check("14.3 rows of every section; literal, inherited and unconfirmed rows; the picker lists compatible tokens and previews", async () => {
    await clearDrafts(cdp);
    await loadActive(cdp, STORY.hanko);
    await clickBadge(cdp);
    await waitTitle(cdp, "Badge Seal / hanko");
    assert.deepEqual(await inManager(cdp, `return [...document.querySelectorAll("[data-code-layer-section]")].map((e) => e.getAttribute("data-code-layer-section"))`), ["layout", "spacing", "size", "appearance", "fill", "stroke", "typography"]);

    // A literal value: no picker, and the row says no token is bound.
    await selectChild(cdp, "Badge Seal › content");
    const literal = await openRow(cdp, "maxInlineSize");
    assert.deepEqual([literal.editable, literal.readonly, literal.picker, literal.reason], ["false", "raw-value", null, "寫死的數值，沒有綁定 token"]);
    // max-inline-size is the width in horizontal writing and the height in vertical writing (the trial ground's hanko content is set tategaki).
    const contentVertical = await inPreview(cdp, `return getComputedStyle(d.querySelector(".md-badge-seal--hanko .md-badge-seal__content")).writingMode.startsWith("vertical")`);
    assert.equal(literal.text, contentVertical ? "最大高70%" : "最大寬70%");
    assert.match(literal.title, /寫死的數值，沒有綁定 token/);
    await key(cdp, "Escape");
    await waitRow(cdp, "maxInlineSize", (now) => !now.open, "closed");
    // An inherited value: the source is named, the row can be edited, and the source can be selected.
    const font = await waitRow(cdp, "fontFamily", (now) => now.inherited === "same-component", "inherited");
    assert.equal(font.editable, "true");
    assert.match(font.title, /繼承自 Badge Seal \/ hanko/);
    assert.doesNotMatch(font.text, /繼承/, "the row itself stays a value and a token");
    const fontOpen = await openRow(cdp, "fontFamily");
    assert.match(fontOpen.popText, /繼承自「Badge Seal \/ hanko」/);
    await clickIn(cdp, `${popSelector("fontFamily")} [data-code-layer-action="select-ancestor"]`);
    await waitPicked(cdp, (s) => s.component === "badge-seal", "the declaring ancestor");
    await waitTitle(cdp, "Badge Seal / hanko");

    // The picker at the component-token scope: system tokens of a compatible type, nothing else.
    await openRow(cdp, "fill");
    await waitRow(cdp, "fill", (now) => now.picker === "confirmed", "probe confirmed");
    const known = await inPreview(cdp, `return Object.fromEntries(w.__CODE_LAYER__.index.tokens.items.map((t) => [t.name, { tier: t.tier, kind: t.kind, target: t.source === "tier" && !t.rootless && !t.duplicate && t.resolution === "ok" }]))`);
    const fillOptions = await pickerOptions(cdp, "fill");
    assert.ok(fillOptions.length > 5, `${fillOptions.length} options`);
    assert.ok(fillOptions.every((o) => o.tier === "sys" && known[o.token].tier === "sys" && known[o.token].kind === "color" && known[o.token].target), JSON.stringify(fillOptions.filter((o) => known[o.token].kind !== "color")));
    const sysColors = Object.entries(known).filter(([, t]) => t.tier === "sys" && t.kind === "color" && t.target).map(([name]) => name);
    assert.deepEqual(fillOptions.map((o) => o.token).sort(), sysColors.sort(), "every system color, and only those");

    // Highlighting previews; Escape closes without staging and hands the keyboard back to the row.
    const tertiary = fillOptions.find((o) => o.token !== SECONDARY && !o.text.includes("#FE0B05") && /#[0-9A-F]{6}/i.test(o.text));
    const hover = await managerRect(cdp, `[data-code-layer-picker="fill"] [data-token="${tertiary.token}"]`);
    await mouse(cdp, "mouseMoved", hover.x, hover.y);
    await waitFor(async () => ((await previewComputed(cdp)).bg !== RED ? true : null), { label: "transient preview" });
    await key(cdp, "Escape");
    const closed = await waitRow(cdp, "fill", (now) => !now.open, "closed by Escape");
    assert.equal(closed.focused, true, "the row has the keyboard again");
    await waitFor(async () => ((await previewComputed(cdp)).bg === RED ? true : null), { label: "back to the source look" });
    assert.equal((await drafts(cdp)).length, 0);

    // With a change staged, Escape returns to the staged look and leaves the list alone.
    const option = await pickToken(cdp, "fill", "secondary", SECONDARY);
    await click(cdp, option.x, option.y);
    const staged = await waitDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "staged");
    await openRow(cdp, "fill");
    await waitRow(cdp, "fill", (now) => now.picker === "confirmed", "picker again");
    const other = await managerRect(cdp, `[data-code-layer-picker="fill"] [data-token="${tertiary.token}"]`);
    await mouse(cdp, "mouseMoved", other.x, other.y);
    await waitFor(async () => (![RED, BLUE].includes((await previewComputed(cdp)).bg) ? true : null), { label: "transient preview over a staged change" });
    await key(cdp, "Escape");
    await waitFor(async () => ((await previewComputed(cdp)).bg === BLUE ? true : null), { label: "back to the staged look" });
    assert.deepEqual((await drafts(cdp)).map((d) => [d.id, d.text]), staged.map((d) => [d.id, d.text]));

    // The declaration scope of the radius row: system tokens and this component's own tokens, of a dimension type.
    await openRow(cdp, "radius");
    await waitRow(cdp, "radius", (now) => now.picker === "confirmed", "radius picker");
    const radiusOptions = await pickerOptions(cdp, "radius");
    assert.ok(radiusOptions.length > 2 && radiusOptions.every((o) => known[o.token].kind !== "color" && (o.tier === "sys" || o.token.startsWith("--md-comp-badge-seal-"))), JSON.stringify(radiusOptions.map((o) => o.token)));
    await key(cdp, "Escape");
    await clickAction(cdp, "discard");
    await waitDrafts(cdp, (list) => list.length === 0, "discarded");

    // A value inherited from an enclosing component: read-only, with the way to its source.
    await loadActive(cdp, STORY.roundel);
    const number = await previewPoint(cdp, `${ROOT} .md-price-lockup__number`);
    await clickWith(cdp, number.x, number.y, { modifiers: MOD });
    await waitPicked(cdp, (s) => s.cls === "md-price-lockup__number", "the number inside the badge");
    await key(cdp, "Enter", { modifiers: SHIFT });
    await waitPicked(cdp, (s) => s.cls === "md-price-lockup__figure", "its figure");
    const color = await waitRow(cdp, "color", (now) => now.inherited === "other-component", "inherited from the badge");
    assert.deepEqual([color.editable, color.readonly], ["false", "inherited-other-component"]);
    const colorOpen = await openRow(cdp, "color");
    assert.match(colorOpen.popText, /繼承自外層元件的「Badge Seal \/ price-roundel」/);
    assert.equal(colorOpen.picker, null, "a read-only row has no picker");
    await clickIn(cdp, `${popSelector("color")} [data-code-layer-action="select-ancestor"]`);
    await waitPicked(cdp, (s) => s.component === "badge-seal", "the badge root");

    // A target the probe cannot confirm: the row is not offered for editing.
    await loadActive(cdp, STORY.hanko);
    await inPreview(cdp, `const sheet = new w.CSSStyleSheet(); sheet.replaceSync(".md-badge-seal.md-badge-seal--hanko { background: rgb(9, 9, 9) !important }"); d.adoptedStyleSheets = [...d.adoptedStyleSheets, sheet]; w.__clOverride = sheet; return true`);
    await clickBadge(cdp);
    await waitTitle(cdp, "Badge Seal / hanko");
    await openRow(cdp, "fill");
    const refused = await waitRow(cdp, "fill", (now) => now.probe === "unconfirmed", "probe not confirmed");
    assert.deepEqual([refused.editable, refused.picker, refused.reason], ["false", null, "無法確認這條宣告驅動此元素，暫不提供修改。"]);
    assert.equal((await drafts(cdp)).length, 0);
    assert.deepEqual(diskHashes(), startHashes);
    return `${fillOptions.length} system colors for the fill; ${radiusOptions.length} tokens for the radius declaration`;
  });

  await check("14.4 the same change can be moved to another scope; the system scope asks first", async () => {
    await clearDrafts(cdp);
    await loadActive(cdp, STORY.hanko);
    await clickBadge(cdp);
    // Staged at the component token, then moved to the declaration.
    let option = await pickToken(cdp, "fill", "secondary", SECONDARY);
    await click(cdp, option.x, option.y);
    const atToken = await waitDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "staged at the component token");
    assert.deepEqual([atToken[0].id, atToken[0].scope], ["token:--md-comp-badge-seal-hanko-container-color", "component-token"]);
    assert.match(atToken[0].title, /tokens\/tokens-comp\.css:54/);
    const scopes = await openRow(cdp, "fill");
    // Scopes are named by their reach, with what the current one affects.
    assert.match(scopes.popText, /只有這裡這個元件影響 1 個元件/);
    await clickIn(cdp, `${popSelector("fill")} [data-code-layer-scope="declaration"]`);
    const atDeclaration = await waitDrafts(cdp, (list) => list.length === 1 && list[0].scope === "declaration" && list[0].status === "previewing", "moved to the declaration");
    assert.equal(atDeclaration[0].id, "decl:src/components/badge-seal/BadgeSeal.css#7#background#0");
    assert.match(atDeclaration[0].title, /只有這裡[\s\S]*storybook\/src\/components\/badge-seal\/BadgeSeal\.css:59/);
    assert.doesNotMatch(atDeclaration[0].title, /tokens-comp\.css/);
    assert.equal((await rowState(cdp, "fill")).scope, "declaration");
    assert.equal((await previewComputed(cdp)).bg, BLUE, "the same result at the other scope");
    assert.equal(await inPreview(cdp, `return getComputedStyle(d.documentElement).getPropertyValue("--md-comp-badge-seal-hanko-container-color").trim()`), "#FE0B05", "the component token is no longer previewed");
    await clickAction(cdp, "discard");
    await waitDrafts(cdp, (list) => list.length === 0, "discarded");

    // With the system tier writable in the binding (this project keeps it closed; opened for the page here).
    await patchIndex(cdp, openSystemTier);
    try {
      await loadActive(cdp, STORY.hanko);
      await clickBadge(cdp);
      await openRow(cdp, "fill");
      const impact = await inPreview(cdp, `return w.__CODE_LAYER__.lastTrace.rows.find((r) => r.id === "fill").scopes.find((s) => s.id === "system-token").impact`);
      const system = `${popSelector("fill")} [data-code-layer-scope="system-token"]`;
      assert.match((await rowState(cdp, "fill")).popText, /只有這裡這個元件整個系統/);
      await clickIn(cdp, system);
      const confirm = await waitFor(() => inManager(cdp, `return document.querySelector("[data-code-layer-scope-confirm]")?.textContent ?? null`), { label: "confirmation" });
      assert.ok(confirm.includes(`${impact.components} 個元件`) && confirm.includes(`${impact.declarations} 處宣告`), confirm);
      assert.equal((await rowState(cdp, "fill")).scope, "component-token", "not chosen before the answer");
      await clickAction(cdp, "scope-cancel");
      await waitFor(() => inManager(cdp, `return !document.querySelector("[data-code-layer-scope-confirm]")`), { label: "confirmation closed" });
      assert.deepEqual([(await rowState(cdp, "fill")).scope, (await drafts(cdp)).length], ["component-token", 0], "cancelled: nothing chosen, nothing staged");

      // Stage at the component token, then accept the system scope: the change moves to the system token.
      option = await pickToken(cdp, "fill", "secondary", SECONDARY);
      await click(cdp, option.x, option.y);
      await waitDrafts(cdp, (list) => list.length === 1 && list[0].scope === "component-token", "staged at the component token");
      await openRow(cdp, "fill");
      await clickIn(cdp, system);
      await clickAction(cdp, "scope-confirm");
      const atSystem = await waitDrafts(cdp, (list) => list.length === 1 && list[0].scope === "system-token" && list[0].status === "previewing", "moved to the system token");
      const alias = await inPreview(cdp, `return w.__CODE_LAYER__.index.tokens.items.find((t) => t.name === ${JSON.stringify(SECONDARY)}).alias`);
      assert.equal(atSystem[0].id, "token:--md-sys-color-primary");
      assert.ok(atSystem[0].to === alias && /整個系統[\s\S]*tokens\/tokens-sys\.css:\d+/.test(atSystem[0].title), JSON.stringify(atSystem[0]));
      assert.equal((await previewComputed(cdp)).bg, BLUE);
      // At that scope the picker offers reference tokens.
      await openRow(cdp, "fill");
      await waitRow(cdp, "fill", (now) => now.scope === "system-token" && now.picker === "confirmed", "picker at the system scope");
      const options = await pickerOptions(cdp, "fill");
      assert.ok(options.length > 5 && options.every((o) => o.tier === "ref"), JSON.stringify(options.slice(0, 5)));
      await key(cdp, "Escape");
      await clickAction(cdp, "discard");
      await waitDrafts(cdp, (list) => list.length === 0, "discarded");
      assert.deepEqual(diskHashes(), startHashes);
      return `system scope: ${confirm}`;
    } finally {
      await patchIndex(cdp, null);
    }
  });

  await check("14.5 arrow keys and a drag on the label step along the scale; colors have no scale", async () => {
    await clearDrafts(cdp);
    await loadActive(cdp, STORY.hanko);
    await clickBadge(cdp);
    // The scale of the corner radius, from the page: the system corner tokens in px, in value order.
    const scale = await inPreview(
      cdp,
      `const live = getComputedStyle(d.documentElement);
       return w.__CODE_LAYER__.index.tokens.items.filter((t) => t.name.startsWith("--md-sys-shape-corner-") && t.source === "tier")
         .map((t) => ({ name: t.name, value: live.getPropertyValue(t.name).trim() })).filter((t) => /^[0-9.]+(px)?$/.test(t.value))
         .sort((a, b) => parseFloat(a.value) - parseFloat(b.value) || a.name.localeCompare(b.name));`,
    );
    const at = scale.findIndex((t) => t.name === "--md-sys-shape-corner-sm");
    assert.ok(at !== -1 && scale.length >= at + 3, JSON.stringify(scale));
    const [one, two] = [scale[at + 1], scale[at + 2]];
    const radius = async () => (await previewComputed(cdp)).radius;

    // Open the row once (the probe runs), close the picker: the row has the keyboard.
    await openRow(cdp, "radius");
    await waitRow(cdp, "radius", (now) => now.picker === "confirmed", "probe confirmed");
    await key(cdp, "Escape");
    const ready = await waitRow(cdp, "radius", (now) => !now.open && now.focused, "focused");
    assert.equal(ready.steps, scale.length, `the row's scale: ${JSON.stringify(scale.map((t) => t.name))}`);

    // One step up, then Escape: the page is back and nothing is staged.
    await key(cdp, "ArrowUp");
    await waitRow(cdp, "radius", (now) => now.stepToken === one.name, "one step up");
    await waitFor(async () => ((await radius()) === one.value ? true : null), { label: `previewing ${one.value}` });
    await key(cdp, "Escape");
    await waitRow(cdp, "radius", (now) => now.stepToken === "", "cancelled");
    await waitFor(async () => ((await radius()) === "4px" ? true : null), { label: "back to 4px" });
    assert.equal((await drafts(cdp)).length, 0);

    // Two steps up, Enter: each step is previewed, the last one is staged.
    await key(cdp, "ArrowUp");
    await waitFor(async () => ((await radius()) === one.value ? true : null), { label: `previewing ${one.value}` });
    await key(cdp, "ArrowUp");
    await waitRow(cdp, "radius", (now) => now.stepToken === two.name, "two steps up");
    await waitFor(async () => ((await radius()) === two.value ? true : null), { label: `previewing ${two.value}` });
    assert.equal((await drafts(cdp)).length, 0, "previewing is not staging");
    await key(cdp, "Enter");
    const byKeys = await waitDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "staged with Enter");
    assert.equal(byKeys[0].to, two.name);
    assert.deepEqual([(await rowState(cdp, "radius")).token, await radius()], [two.name, two.value]);
    await clickAction(cdp, "discard");
    await waitDrafts(cdp, (list) => list.length === 0, "discarded");
    await waitFor(async () => ((await radius()) === "4px" ? true : null), { label: "back to 4px" });

    // The same by dragging the label across two steps.
    const label = await managerRect(cdp, `${rowSelector("radius")} [data-code-layer-row-label]`);
    const x = label.left + 6;
    const y = label.top + label.height / 2;
    await mouse(cdp, "mouseMoved", x, y);
    await mouse(cdp, "mousePressed", x, y);
    await mouse(cdp, "mouseMoved", x + 30, y, { button: "left", buttons: 1 });
    await waitFor(async () => ((await radius()) === one.value ? true : null), { label: `dragged one step: ${one.value}` });
    await mouse(cdp, "mouseMoved", x + 54, y, { button: "left", buttons: 1 });
    await waitRow(cdp, "radius", (now) => now.stepToken === two.name, "dragged two steps");
    await waitFor(async () => ((await radius()) === two.value ? true : null), { label: `dragged two steps: ${two.value}` });
    await mouse(cdp, "mouseReleased", x + 54, y);
    const byDrag = await waitDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "staged by the drag");
    assert.deepEqual([byDrag[0].id, byDrag[0].to], [byKeys[0].id, two.name]);
    await delayMs(200);
    assert.equal((await rowState(cdp, "radius")).open, false, "the drag did not open the row");
    await clickAction(cdp, "discard");
    await waitDrafts(cdp, (list) => list.length === 0, "discarded");

    // The same scale from the popover: one control down, one up; each use stages.
    await openRow(cdp, "radius");
    await waitRow(cdp, "radius", (now) => now.picker === "confirmed", "probe confirmed");
    const stepper = () => inManager(cdp, `const s = document.querySelector('[data-code-layer-popover="radius"] [data-code-layer-stepper]'); return s ? { text: s.textContent, down: s.querySelector('[data-code-layer-action="step-down"]').disabled, up: s.querySelector('[data-code-layer-action="step-up"]').disabled } : null`);
    assert.deepEqual(await stepper(), { text: `4px · shape-corner-sm`, down: false, up: false });
    await clickAction(cdp, "step-up");
    const stepped = await waitDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "one step up staged");
    assert.equal(stepped[0].to, one.name);
    await waitFor(async () => ((await radius()) === one.value ? true : null), { label: `stepped to ${one.value}` });
    assert.equal((await stepper()).text, `${one.value} · ${one.name.replace("--md-sys-", "")}`);
    await clickAction(cdp, "step-down");
    await waitDrafts(cdp, (list) => list.length === 0, "stepping back to the bound token leaves nothing staged");
    await waitFor(async () => ((await radius()) === "4px" ? true : null), { label: "back to 4px" });
    await key(cdp, "Escape");

    // A color row offers no stepping.
    await openRow(cdp, "fill");
    await waitRow(cdp, "fill", (now) => now.picker === "confirmed", "fill probe");
    await key(cdp, "Escape");
    const fill = await waitRow(cdp, "fill", (now) => !now.open && now.focused, "fill focused");
    assert.equal(fill.steps, 0);
    await key(cdp, "ArrowUp");
    await delayMs(250);
    assert.deepEqual([(await rowState(cdp, "fill")).stepToken, (await previewComputed(cdp)).bg, (await drafts(cdp)).length], ["", RED, 0]);
    assert.deepEqual(diskHashes(), startHashes);
    return `${scale[at].value} → ${one.value} → ${two.value} on a scale of ${scale.length}`;
  });

  await check("14.6 staged changes: the second reference of a declaration, two changes on one declaration, conflict, compare, old drafts", async () => {
    await clearDrafts(cdp);
    await loadActive(cdp, STORY.footnoteColumns);
    const GROUP = ".md-footnote-legal-block__group + .md-footnote-legal-block__group";
    const read = () => computedOf(cdp, GROUP, ["border-block-start-color", "border-block-start-width", "border-block-start-style"]);
    const rootPoint = await previewPoint(cdp, '[data-component="footnote-legal-block"]', 0.5, 0.1);
    await clickWith(cdp, rootPoint.x, rootPoint.y);
    await waitPicked(cdp, (s) => s.component === "footnote-legal-block", "the block");
    await clickIn(cdp, '[data-code-layer-child="1"]');
    await waitPicked(cdp, (s) => s.cls.includes("md-footnote-legal-block__group") && s.at === 1, "the second group");
    const [colorBefore, widthBefore] = await read();

    // The color is the second var() of `border-block-start: var(width) solid var(color)`.
    const COLOR = "borderColor/block-start";
    const WIDTH = "borderWidth/block-start";
    await openRow(cdp, COLOR);
    await clickIn(cdp, `${popSelector(COLOR)} [data-code-layer-scope="declaration"]`);
    await waitRow(cdp, COLOR, (now) => now.scope === "declaration", "declaration scope");
    let option = await pickToken(cdp, COLOR, "color-primary", "--md-sys-color-primary");
    await click(cdp, option.x, option.y);
    const first = await waitDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "the color staged");
    assert.match(first[0].id, /^decl:src\/components\/footnote-legal-block\/FootnoteLegalBlock\.css#\d+#border-block-start#1$/);
    await waitFor(async () => ((await read())[0] === RED ? true : null), { label: "the color previews" });
    assert.equal((await read())[1], widthBefore, "the first reference is untouched");

    // A second change on the same declaration: its first var().
    await openRow(cdp, WIDTH);
    await clickIn(cdp, `${popSelector(WIDTH)} [data-code-layer-scope="declaration"]`);
    await waitRow(cdp, WIDTH, (now) => now.scope === "declaration" && now.picker === "confirmed", "width picker at the declaration");
    const widths = await pickerOptions(cdp, WIDTH);
    const live = await inPreview(cdp, `const cs = getComputedStyle(d.documentElement); return Object.fromEntries(${JSON.stringify(widths.map((o) => o.token))}.map((name) => [name, cs.getPropertyValue(name).trim()]))`);
    const wider = widths.find((o) => /^[\d.]+px$/.test(live[o.token]) && live[o.token] !== widthBefore && parseFloat(live[o.token]) > 0);
    assert.ok(wider, `a width token with another value among ${JSON.stringify(live)}`);
    await clickIn(cdp, `[data-code-layer-picker=${JSON.stringify(WIDTH)}] [data-token="${wider.token}"]`);
    const both = await waitDrafts(cdp, (list) => list.length === 2 && list.every((d) => d.status === "previewing"), "both staged");
    assert.deepEqual(both.map((d) => d.id.split("#").pop()).sort(), ["0", "1"]);
    assert.equal(new Set(both.map((d) => d.id.split("#").slice(0, 3).join("#"))).size, 1, "one declaration");
    await waitFor(async () => {
      const now = await read();
      return now[0] === RED && now[1] === live[wider.token] ? true : null;
    }, { label: "both previews on one declaration" });

    // Re-saving the stylesheet unchanged keeps the previews.
    await inPreview(cdp, `const s = [...d.querySelectorAll("style[data-vite-dev-id]")].find((e) => e.dataset.viteDevId.endsWith("/FootnoteLegalBlock.css")); w.__oldSheet = s.sheet; return true`);
    fs.writeFileSync(FOOTNOTE_CSS, fs.readFileSync(FOOTNOTE_CSS));
    await waitFor(() => inPreview(cdp, `const s = [...d.querySelectorAll("style[data-vite-dev-id]")].find((e) => e.dataset.viteDevId.endsWith("/FootnoteLegalBlock.css")); return s.sheet !== w.__oldSheet`), { timeout: 8000, label: "sheet replaced by Vite" });
    await waitFor(async () => {
      const now = await read();
      return now[0] === RED && now[1] === live[wider.token] ? true : null;
    }, { label: "previews re-applied" });

    // Hold to compare: the original look while held, and the button does not move.
    const compare = await managerRect(cdp, '[data-code-layer-action="compare"]');
    await mouse(cdp, "mouseMoved", compare.x, compare.y);
    await mouse(cdp, "mousePressed", compare.x, compare.y);
    await waitFor(async () => ((await read())[0] === colorBefore ? true : null), { label: "original while held" });
    const held = await managerRect(cdp, '[data-code-layer-action="compare"]');
    await mouse(cdp, "mouseReleased", compare.x, compare.y);
    await waitFor(async () => ((await read())[0] === RED ? true : null), { label: "preview after release" });
    const released = await managerRect(cdp, '[data-code-layer-action="compare"]');
    for (const rect of [held, released]) assert.deepEqual([rect.left, rect.top, rect.width, rect.height].map(Math.round), [compare.left, compare.top, compare.width, compare.height].map(Math.round), "the button stays where it is");

    // The declaration is changed outside: both changes conflict and their previews are taken away.
    await withFileEdit(
      FOOTNOTE_CSS,
      (text) => {
        const edited = text.replace(/(border-block-start: var\([^)]+\)) solid/, "$1 dashed");
        assert.notEqual(edited, text);
        return edited;
      },
      async () => {
        await waitDrafts(cdp, (list) => list.length === 2 && list.every((d) => d.status === "conflict"), "both in conflict");
        await waitFor(async () => {
          const now = await read();
          return now[0] === colorBefore && now[1] === widthBefore && now[2] === "dashed" ? true : null;
        }, { label: "the page shows the source, without previews" });
      },
    );
    await waitDrafts(cdp, (list) => list.length === 2 && list.every((d) => d.status === "previewing"), "previewing again once the source is back");
    assert.equal(sha(FOOTNOTE_CSS), footnoteHash);
    await clickAction(cdp, "discard");
    await waitDrafts(cdp, (list) => list.length === 0, "discarded");

    // Changes staged by the previous format are discarded, once, with a notice.
    await inManager(cdp, `localStorage.setItem("code-layer/v1/${PROJECT}/drafts", JSON.stringify({ schema: 1, drafts: [{ id: "token:--md-comp-badge-seal-hanko-container-color", verdict: "rebind-token" }] })); return true`);
    await loadActive(cdp, STORY.hanko);
    const notice = await waitFor(() => inManager(cdp, `return document.querySelector('[data-code-layer-notice="drafts-discarded"]')?.textContent ?? null`), { label: "notice about the old drafts" });
    assert.match(notice, /舊版格式/);
    assert.deepEqual([(await drafts(cdp)).length, await inManager(cdp, `return localStorage.getItem("code-layer/v1/${PROJECT}/drafts")`)], [0, null]);
    await clickAction(cdp, "dismiss-notice");
    await waitFor(() => inManager(cdp, `return !document.querySelector('[data-code-layer-notice="drafts-discarded"]')`), { label: "dismissed" });
    await loadActive(cdp, STORY.hanko);
    await delayMs(600);
    assert.equal(await inManager(cdp, `return !!document.querySelector('[data-code-layer-notice="drafts-discarded"]')`), false, "said once");
    assert.deepEqual(diskHashes(), startHashes);
    return `second reference → ${RED}; first reference ${widthBefore} → ${live[wider.token]} (${wider.token.replace("--md-", "")})`;
  });

  await check("14.7 the object reference lists every traced row; every path, selector and token exists; English has the same structure", async () => {
    await clearDrafts(cdp);
    await loadActive(cdp, STORY.hanko);
    await clickBadge(cdp);
    await waitTitle(cdp, "Badge Seal / hanko");
    const rootReference = await copyFromOutline(cdp);
    assert.equal(rootReference.split("\n")[0], "[Code Layer 物件參照 v2]");
    assert.ok(englishReference, "the English reference of the same element (14.1)");
    assert.deepEqual(skeleton(rootReference), skeleton(englishReference), "same lines, same files, selectors, tokens and values; only the labels differ");
    assert.notEqual(rootReference, englishReference);

    // A nested element with inherited rows, copied from the panel header.
    await selectChild(cdp, "Badge Seal › content");
    await cdp.send("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"], origin: BASE }).catch(() => undefined);
    await clickAction(cdp, "copy-reference");
    const fromPanel = await waitFor(() => inManager(cdp, `try { const text = await navigator.clipboard.readText(); return text.startsWith("[Code Layer") && text.includes("content") ? text : null; } catch (error) { return null; }`), { label: "clipboard text from the panel button" });
    const fromOutline = await copyFromOutline(cdp);
    assert.equal(fromPanel, fromOutline, "the panel and the outline copy the same text");
    const text = fromPanel;
    const lines = text.split("\n");
    assert.equal(lines[0], "[Code Layer 物件參照 v2]");
    assert.match(text, /元件：badge-seal · variant：hanko · 元素：Badge Seal › content/);
    // One line per traced row, with inheritance and scopes.
    const traced = await inPreview(cdp, `return w.__CODE_LAYER__.lastTrace.rows.filter((r) => r.source !== "none" || r.layout !== null || (r.inheritedFrom && r.inheritedFrom.kind !== "default")).length`);
    const rowLines = lines.filter((l) => /：.* = /.test(l) && !l.startsWith("CSS："));
    assert.equal(rowLines.length, traced, rowLines.join("\n"));
    assert.ok(rowLines.some((l) => l.includes("繼承自 Badge Seal / hanko") && l.includes("可修改範圍：") && l.includes("［預設］")), text);
    assert.ok(rowLines.some((l) => l.includes("唯讀：寫死的數值，沒有綁定 token")), text);
    // Every rule line points at a selector that is in that file, on that line.
    const rules = [...text.matchAll(/^CSS：(\S+) · (.+)（規則 #(\d+)，第 (\d+) 行）$/gm)];
    assert.ok(rules.length >= 2, text);
    for (const [, file, selector, , lineNumber] of rules) {
      const source = fs.readFileSync(path.join(LAB_ROOT(), file), "utf8").split("\n");
      assert.ok(source[Number(lineNumber) - 1].includes(selector.split(",")[0].trim()), `${file}:${lineNumber} is "${source[Number(lineNumber) - 1]}", expected ${selector}`);
    }
    // Every file:line exists, and names what the line says.
    let places = 0;
    for (const match of text.matchAll(/（([\w./-]+):(\d+)）/g)) {
      const [whole, file, lineNumber] = match;
      const absolute = path.join(LAB_ROOT(), file);
      assert.ok(fs.existsSync(absolute), `${file} exists`);
      const source = fs.readFileSync(absolute, "utf8").split("\n");
      assert.ok(source.length >= Number(lineNumber), whole);
      // A token or a property right before the place: that line declares it.
      const named = /(--md-[a-z0-9-]+)$|：([a-z-]+)$/.exec(text.slice(0, match.index));
      const name = named?.[1] ?? named?.[2];
      if (name) assert.ok(source[Number(lineNumber) - 1].includes(name), `${file}:${lineNumber} is "${source[Number(lineNumber) - 1].trim()}", expected ${name}`);
      places += 1;
    }
    assert.ok(places > 10, `${places} places`);
    // Every token is declared where tokens are declared.
    const declaredIn = ["tokens/tokens-ref.css", "tokens/tokens-sys.css", "tokens/tokens-comp.css", "storybook/src/styles/storybook.css"].map((f) => fs.readFileSync(path.join(LAB_ROOT(), f), "utf8"));
    const tokens = new Set(text.match(/--md-[a-z0-9-]+/g));
    for (const token of tokens) assert.ok(declaredIn.some((source) => source.includes(`${token}:`)), `${token} is declared`);
    assert.deepEqual(diskHashes(), startHashes);
    return `${lines.length} lines, ${rules.length} rules, ${places} places, ${tokens.size} tokens`;
  });

  await check("14.8 files equal the stage start; mode off", async () => {
    await clearDrafts(cdp);
    assert.deepEqual(diskHashes(), startHashes);
    assert.equal(sha(FOOTNOTE_CSS), footnoteHash);
  });
}

// ---- stage 15: apply report with governance ------------------------------------------

const SPEC_FILES = () => fs.readdirSync(path.join(LAB_ROOT(), "design-system/components")).filter((name) => name.endsWith(".md")).sort().map((name) => path.join(LAB_ROOT(), "design-system/components", name));
const DOC_FILES = () => ["docs/design-system/index.html", "docs/design-system/review.html"].map((p) => path.join(LAB_ROOT(), p));
const FOOTNOTE = () => labFile("src/components/footnote-legal-block/FootnoteLegalBlock.css");
const BADGE_SPEC = () => path.join(LAB_ROOT(), "design-system/components/badge-seal.md");
/** Everything an apply may write: token files and mirrors, component stylesheets, specification files. */
const governedHashes = () => Object.fromEntries([BADGE_CSS(), FOOTNOTE(), ...TOKEN_FILES(), ...SPEC_FILES()].map((file) => [path.relative(LAB_ROOT(), file), sha(file)]));
const withoutStamp = (html) => html.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<generated>");
/** On the undo stack when the run started: the project's own applies. The checks never undo them and do not count them. */
const protectedApplies = new Set();
/** Applied by the pages of this run: the only applies the cleanup may undo. */
const ownApplies = new Set();
const rawServerState = async () => (await fetch(`${BASE}/__code-layer/state`)).json();
/** The state as far as this run is concerned: without the applies that were there before it, and what is pending for them. */
const serverState = async () => {
  const state = await rawServerState();
  return {
    ...state,
    undoStack: state.undoStack.filter((entry) => !protectedApplies.has(entry.applyId)),
    pendingDocs: state.pendingDocs.filter((entry) => !protectedApplies.has(entry.applyId)),
  };
};

/** Note every apply a page of this run makes, from the response the page received. */
function trackApplies(cdp) {
  const applying = new Set();
  // Requests the server refused for the session they carried (401).
  cdp.sessionRefusals = 0;
  cdp.on("Network.responseReceived", ({ requestId, response }) => {
    if (response.status === 401 && response.url.includes("/__code-layer/")) cdp.sessionRefusals += 1;
    if (/\/__code-layer\/apply(\?|$)/.test(response.url) && response.status === 200) applying.add(requestId);
  });
  cdp.on("Network.loadingFinished", async ({ requestId }) => {
    if (!applying.delete(requestId)) return;
    try {
      const body = await cdp.send("Network.getResponseBody", { requestId });
      const json = JSON.parse(Buffer.from(body.body, body.base64Encoded ? "base64" : "utf8").toString("utf8"));
      if (typeof json.applyId === "string") ownApplies.add(json.applyId);
    } catch {
      // The page went away before the body could be read: the apply stays unknown and is left alone.
    }
  });
}
const changedLines = (before, after) => {
  const a = before.split("\n");
  const b = after.split("\n");
  assert.equal(a.length, b.length, "same number of lines");
  return a.flatMap((text, i) => (text === b[i] ? [] : [i + 1]));
};

async function waitPostApply() {
  await waitFor(async () => {
    const state = await serverState();
    return state.postApply.running ? null : true;
  }, { timeout: 60000, label: "post-apply commands finished" });
}

function reportDetails(cdp) {
  return inManager(
    cdp,
    `const r = document.querySelector("[data-code-layer-report]"); if (!r) return null;
     const own = r.cloneNode(true); for (const excerpt of own.querySelectorAll("[data-code-layer-pending] > div")) excerpt.remove();
     return { status: r.getAttribute("data-code-layer-report"), mode: r.getAttribute("data-code-layer-report-mode"), error: r.getAttribute("data-code-layer-error"), headline: r.querySelector("[data-code-layer-headline]")?.textContent ?? "", text: r.textContent,
       /* the report's own words: excerpts quoted from project files are left out */ own: own.textContent,
       items: [...r.querySelectorAll("[data-code-layer-verify-item]")].map((e) => e.getAttribute("data-status")),
       documents: [...r.querySelectorAll("[data-code-layer-document]")].map((e) => ({ at: e.getAttribute("data-code-layer-document"), text: e.textContent })),
       pairing: [...r.querySelectorAll("[data-code-layer-pairing]")].map((e) => ({ warning: e.getAttribute("data-code-layer-pairing"), contrast: e.querySelector("[data-code-layer-contrast]")?.getAttribute("data-code-layer-contrast") ?? null, text: e.textContent })),
       pending: [...r.querySelectorAll("[data-code-layer-pending]")].map((e) => ({ id: e.getAttribute("data-code-layer-pending"), kind: e.getAttribute("data-kind"), reason: e.getAttribute("data-reason"), text: e.textContent })),
       post: r.querySelector("[data-code-layer-post-apply]") ? { status: r.querySelector("[data-code-layer-post-apply]").getAttribute("data-code-layer-post-apply"), stale: r.querySelector("[data-code-layer-post-apply]").getAttribute("data-stale"),
         results: [...r.querySelectorAll("[data-code-layer-post-result]")].map((e) => [e.getAttribute("data-code-layer-post-result"), e.getAttribute("data-ok")]) } : null,
       actions: [...r.querySelectorAll("[data-code-layer-action]")].map((e) => e.getAttribute("data-code-layer-action")) };`,
  );
}

const waitReportDetails = (cdp, predicate, label, timeout = 40000) =>
  waitSeenFor(() => reportDetails(cdp), predicate, label, timeout);

async function waitSeenFor(read, predicate, label, timeout) {
  let seen;
  try {
    return await waitFor(async () => {
      seen = await read();
      return seen && predicate(seen) ? seen : null;
    }, { label, timeout });
  } catch (error) {
    throw new Error(`${error.message}\n last seen: ${JSON.stringify(seen)?.slice(0, 1500)}`);
  }
}

/**
 * Safety net: a check that fails between an apply and its undo must not leave
 * the project changed. Undo what this run applied and is still on the stack,
 * through the API (whole files, or a reverse apply when a file was edited since).
 * An apply that was on the stack before the run, or that someone else made
 * meanwhile, is not this run's to undo: it stops there and says so.
 */
async function undoLeftovers() {
  const same = { "Sec-Fetch-Site": "same-origin", Origin: BASE };
  const session = await (await fetch(`${BASE}/__code-layer/session`, { headers: same })).json();
  const post = (route, body) => fetch(`${BASE}/__code-layer${route}`, { method: "POST", headers: { ...same, "Content-Type": "application/json", "x-code-layer-session": session.session }, body: JSON.stringify(body) });
  const undone = [];
  for (let i = 0; i < 5; i += 1) {
    const state = await (await fetch(`${BASE}/__code-layer/state`, { headers: same })).json();
    const top = state.undoStack.at(-1);
    if (!top || protectedApplies.has(top.applyId)) break;
    if (!ownApplies.has(top.applyId)) {
      undone.push(`${top.applyId}: not applied by this run, left alone`);
      break;
    }
    let response = await post("/undo", { applyId: top.applyId });
    if (!response.ok) response = await post("/undo/reverse", { applyId: top.applyId });
    undone.push(`${top.applyId}:${response.status}`);
    if (!response.ok) break;
  }
  return undone;
}

async function stage15(cdp) {
  const start = governedHashes();
  const docsBefore = DOC_FILES().map((file) => fs.readFileSync(file));
  const specBefore = fs.readFileSync(BADGE_SPEC(), "utf8");
  const tokensBefore = fs.readFileSync(TRUTH(), "utf8");
  const footnoteBefore = fs.readFileSync(FOOTNOTE(), "utf8");
  const GROUP = ".md-footnote-legal-block__group + .md-footnote-legal-block__group";
  const CONTENT = ".md-badge-seal__content";
  await cdp.send("Network.setBlockedURLs", { urls: [] });
  await cdp.send("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"], origin: BASE }).catch(() => undefined);
  const clipboard = (prefix) => waitFor(() => inManager(cdp, `try { const text = await navigator.clipboard.readText(); return text.startsWith(${JSON.stringify(prefix)}) ? text : null; } catch (error) { return null; }`), { label: `clipboard text starting with ${prefix}` });
  const undoVerified = async () => {
    await clickAction(cdp, "undo");
    const report = await waitReportDetails(cdp, (r) => r.mode === "undo" && r.status === "verified", "undo verified");
    assert.deepEqual(governedHashes(), start, "undo restored every file to its bytes");
    return report;
  };

  const check = async (name, fn) =>
    checkOuter(name, async () => {
      try {
        return await fn();
      } finally {
        const leftovers = await undoLeftovers().catch((error) => [`cleanup failed: ${error.message}`]);
        if (leftovers.length > 0) process.stdout.write(`    (cleanup: undone through the API after the check: ${leftovers.join(", ")})\n`);
      }
    });

  await check("15.0 the binding has governance and post-apply commands; nothing is pending", async () => {
    const state = await serverState();
    assert.equal(state.governance.componentSpecsDir, "design-system/components");
    assert.deepEqual([state.postApply.commands, state.postApply.refused], [["docs-html", "review-html"], []]);
    assert.deepEqual([state.undoStack.length, state.pendingDocs.length, state.readOnly.active, state.mirrors.every((m) => m.inSync)], [0, 0, false, true]);
    return `${Object.keys(start).length} governed files`;
  });

  await check("15.1 fill and inherited font size: written, specification rows rewritten, verified; pairing offers the second change; undo is exact", async () => {
    await clearDrafts(cdp);
    await loadActive(cdp, STORY.hanko);
    await clickBadge(cdp);
    let option = await pickToken(cdp, "fill", "secondary", SECONDARY);
    await click(cdp, option.x, option.y);
    await waitDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "fill staged");

    // The container color changed role: its content color still follows the old one.
    const note = await waitFor(() => inManager(cdp, `const n = document.querySelector("[data-code-layer-draft] [data-code-layer-pairing]"); return n ? { warning: n.getAttribute("data-code-layer-pairing"), text: n.textContent, why: n.getAttribute("title"), contrast: n.querySelector("[data-code-layer-contrast]").getAttribute("data-code-layer-contrast") } : null`), { label: "pairing note" });
    assert.notEqual(note.warning, "contrast", "a warning, not only a contrast figure");
    assert.equal(note.text, "對比 3.99 → 2.94一起改內容色", "one short line");
    assert.match(note.why, /內容色 comp-badge-seal-hanko-text-color 仍跟著舊角色/);
    assert.ok(Number(note.contrast) >= 1, `contrast ${note.contrast}`);
    await clickAction(cdp, "pair-accept");
    const paired = await waitDrafts(cdp, (list) => list.length === 2, "the offered change is staged");
    const content = paired.find((d) => d.id === "token:--md-comp-badge-seal-hanko-text-color");
    assert.ok(content && content.to === "--md-sys-color-on-secondary" && content.text.startsWith("文字色color-on-primary → color-on-secondary"), JSON.stringify(paired));
    assert.equal(await inManager(cdp, `return [...document.querySelectorAll("[data-code-layer-draft] [data-code-layer-pairing]")].filter((n) => n.getAttribute("data-code-layer-pairing") !== "contrast").length`), 0, "with both staged there is no warning left");
    // Both on- colors are the same white here: that change would not be observable. Take it out again.
    await clickIn(cdp, `[data-code-layer-draft="${content.id}"] [data-code-layer-action="remove-draft"]`);
    await waitDrafts(cdp, (list) => list.length === 1, "back to one change");

    // The font size of the content is inherited from the badge root: staged from the child, written at the root's token.
    await selectChild(cdp, "Badge Seal › content");
    option = await pickToken(cdp, "fontSize", "title-size", "--md-sys-typescale-title-size");
    await click(cdp, option.x, option.y);
    const staged = await waitDrafts(cdp, (list) => list.length === 2 && list.every((d) => d.status === "previewing"), "fill and font size staged");
    const size = staged.find((d) => d.id === "token:--md-comp-badge-seal-text-size");
    assert.ok(size && size.title.includes("改在「Badge Seal / hanko」的宣告上（繼承來源）"), JSON.stringify(staged));
    assert.deepEqual(await computedOf(cdp, CONTENT, ["font-size"]), ["20px"]);
    assert.deepEqual(governedHashes(), start, "staging writes nothing");

    const applyStarted = Date.now();
    await clickAction(cdp, "apply");
    const report = await waitReportDetails(cdp, (r) => r.mode === "apply" && ["verified", "mismatch", "timeout", "written-not-observable"].includes(r.status), "apply report");
    const applyMs = Date.now() - applyStarted;
    assert.equal(report.status, "verified", report.text);
    assert.deepEqual(report.items, ["verified", "verified"]);
    assert.equal(report.headline, "已寫入並驗證");
    if (process.env.CODE_LAYER_TEST_SHOTS) {
      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(process.env.CODE_LAYER_TEST_SHOTS, "shot-report.png"), Buffer.from(shot.data, "base64"));
    }
    // The action bar and the outcome line are whole, inside the inspector, whatever the canvas height.
    const whole = await inManager(cdp, `const root = document.querySelector("[data-code-layer-panel]").getBoundingClientRect(); return ["undo"].map((action) => { const r = document.querySelector('[data-code-layer-action="' + action + '"]').getBoundingClientRect(); return r.height > 0 && r.top >= root.top && r.bottom <= root.bottom; })`);
    assert.deepEqual(whole, [true]);
    // Source of truth and mirror: two lines, the same bytes in both.
    const tokensAfter = fs.readFileSync(TRUTH(), "utf8");
    assert.deepEqual(changedLines(tokensBefore, tokensAfter), [54, 68]);
    assert.equal(line(TRUTH(), 54), NEW_TOKEN_LINE);
    assert.equal(line(TRUTH(), 68), "  --md-comp-badge-seal-text-size: var(--md-sys-typescale-title-size);");
    assert.ok(fs.readFileSync(TRUTH()).equals(fs.readFileSync(MIRROR())), "mirror equals source of truth");
    // The Token Contract rows of the specification, in the same transaction.
    const specAfter = fs.readFileSync(BADGE_SPEC(), "utf8");
    assert.deepEqual(changedLines(specBefore, specAfter), [54, 68]);
    assert.equal(line(BADGE_SPEC(), 54), "| --md-comp-badge-seal-hanko-container-color | --md-sys-color-secondary | container fill | hanko |");
    assert.equal(line(BADGE_SPEC(), 68), "| --md-comp-badge-seal-text-size | --md-sys-typescale-title-size | content size | all |");
    assert.deepEqual(report.documents.map((d) => d.at), ["design-system/components/badge-seal.md:54", "design-system/components/badge-seal.md:68"]);
    assert.ok(report.documents[0].text.includes("sys-color-primary → sys-color-secondary"), report.documents[0].text);
    // The pairing warning of what was applied, with the contrast of the result.
    assert.ok(report.pairing.some((p) => p.warning !== "contrast" && Number(p.contrast) >= 1), JSON.stringify(report.pairing));
    // The page shows the source now, without previews.
    assert.equal(await inPreview(cdp, `return w.__CODE_LAYER__.live.hasPreviews()`), false);
    assert.deepEqual([(await previewComputed(cdp)).bg, ...(await computedOf(cdp, CONTENT, ["font-size"]))], [BLUE, "20px"]);
    // The commands of the binding ran; the derived documents carry the new binding.
    const post = await waitReportDetails(cdp, (r) => r.post?.status === "done", "post-apply commands reported", 90000);
    assert.deepEqual([post.post.stale, post.post.results], ["false", [["docs-html", "true"], ["review-html", "true"]]]);
    assert.notEqual(withoutStamp(fs.readFileSync(DOC_FILES()[0], "utf8")), withoutStamp(docsBefore[0].toString("utf8")), "the generated documentation changed with the tokens");
    const state = await serverState();
    assert.equal(state.undoStack.at(-1).verification?.status, "verified");
    assert.equal(state.governance.drift.rows, 0, "no drift between the contract rows and the token file");
    // Prose and comments that still name the old role are listed for a person or an AI to finish, with file and line.
    assert.ok(post.pending.length > 0 && post.pending.every((p) => /^[\w./-]+:\d+ — /.test(p.text)), JSON.stringify(post.pending));
    for (const pending of post.pending) {
      const [, file, lineNumber] = /^([\w./-]+):(\d+) — /.exec(pending.text);
      assert.ok(fs.readFileSync(path.join(LAB_ROOT(), file), "utf8").split("\n").length >= Number(lineNumber), `${file}:${lineNumber} exists`);
    }
    assert.deepEqual(state.pendingDocs.map((p) => p.id).sort(), post.pending.map((p) => p.id).sort());

    const undone = await undoVerified();
    assert.equal(undone.headline, "已還原並驗證");
    assert.deepEqual((await serverState()).pendingDocs, [], "what was pending for an undone apply is dropped");
    assert.deepEqual([(await previewComputed(cdp)).bg, ...(await computedOf(cdp, CONTENT, ["font-size"]))], [RED, "13px"]);
    await waitPostApply();
    return `${report.documents.map((d) => d.text).join("; ")} · ${post.post.results.map(([id]) => id).join(", ")} · click on Apply to the verified report: ${applyMs} ms`;
  });

  await check("15.2 the second reference of a declaration: written and verified; the undocumented declaration is listed as pending, briefed and marked done", async () => {
    await clearDrafts(cdp);
    await loadActive(cdp, STORY.footnoteColumns);
    const read = () => computedOf(cdp, GROUP, ["border-block-start-color", "border-block-start-width"]);
    const [, widthBefore] = await read();
    const rootPoint = await previewPoint(cdp, '[data-component="footnote-legal-block"]', 0.5, 0.1);
    await clickWith(cdp, rootPoint.x, rootPoint.y);
    await waitPicked(cdp, (s) => s.component === "footnote-legal-block", "the block");
    await clickIn(cdp, '[data-code-layer-child="1"]');
    await waitPicked(cdp, (s) => s.cls.includes("md-footnote-legal-block__group") && s.at === 1, "the second group");
    const COLOR = "borderColor/block-start";
    await openRow(cdp, COLOR);
    await clickIn(cdp, `${popSelector(COLOR)} [data-code-layer-scope="declaration"]`);
    await waitRow(cdp, COLOR, (now) => now.scope === "declaration", "declaration scope");
    const option = await pickToken(cdp, COLOR, "color-primary", "--md-sys-color-primary");
    await click(cdp, option.x, option.y);
    await waitDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "staged");
    await clickAction(cdp, "apply");
    const report = await waitReportDetails(cdp, (r) => r.mode === "apply" && ["verified", "mismatch", "timeout", "written-not-observable"].includes(r.status), "apply report");
    assert.equal(report.status, "verified", report.text);
    assert.deepEqual(report.items, ["verified"]);
    // Only the token name of the second var() changed.
    const after = fs.readFileSync(FOOTNOTE(), "utf8");
    assert.equal(after, footnoteBefore.replace("var(--md-comp-footnote-legal-block-rule-color);", "var(--md-sys-color-primary);"));
    assert.deepEqual(await read(), [RED, widthBefore]);
    assert.deepEqual(report.documents, [], "no table documents a stylesheet declaration");

    // Pending: the declaration no table documents, with file, line and reason.
    const listed = await waitReportDetails(cdp, (r) => r.pending.length > 0, "pending documents listed");
    const entry = listed.pending.find((p) => p.kind === "declaration");
    assert.ok(entry && entry.reason === "declaration-not-documented" && /storybook\/src\/components\/footnote-legal-block\/FootnoteLegalBlock\.css:2[34] — 元件樣式表的宣告沒有任何表格記載/.test(entry.text), JSON.stringify(listed.pending));
    const state = await serverState();
    const applyId = state.undoStack.at(-1).applyId;
    assert.deepEqual(state.pendingDocs.map((p) => p.id).sort(), listed.pending.map((p) => p.id).sort(), "the panel lists what the server recorded");
    // The brief for an AI assistant.
    await clickAction(cdp, "copy-brief");
    const brief = await clipboard("[Code Layer 文件待同步");
    assert.equal(brief.split("\n")[0], `[Code Layer 文件待同步：${applyId}]`);
    assert.ok(brief.includes("--md-comp-footnote-legal-block-rule-color") && brief.includes("--md-sys-color-primary") && brief.includes("FootnoteLegalBlock.css:2"), brief);
    assert.ok(brief.includes("[Code Layer 物件參照 v2]"), "with the reference of the selection");
    // The parts of the report hold their place: when the results of the post-apply commands arrive, no control moves.
    const place = () => inManager(cdp, `return ["undo", "copy-brief", "toggle-pending"].map((action) => { const r = document.querySelector('[data-code-layer-report] [data-code-layer-action="' + action + '"]').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })`);
    const placeBefore = await place();
    assert.ok(placeBefore.every((box) => box[2] > 0), JSON.stringify(placeBefore));
    const settled = await waitReportDetails(cdp, (r) => r.post?.status === "done", "post-apply commands reported", 90000);
    assert.deepEqual(settled.post.results, [["docs-html", "true"], ["review-html", "true"]]);
    assert.deepEqual(await place(), placeBefore, "no control moved when the command results arrived");
    // One line says what happened; the rest opens on demand.
    const parts = await inManager(cdp, `return [...document.querySelectorAll("[data-code-layer-report] [data-code-layer-part]")].map((e) => [e.getAttribute("data-code-layer-part"), e.getAttribute("data-open"), e.querySelector("[data-code-layer-action]").textContent])`);
    assert.deepEqual(parts, [["items", "false", "▸逐項結果（1）"], ["pending", "false", "▸文件待同步（1）"], ["post-apply", "false", "▸衍生文件已重新產生"]]);
    // Marked done one by one.
    for (const pending of listed.pending) {
      const selector = `[data-code-layer-pending="${pending.id}"] [data-code-layer-action="resolve-pending"]`;
      const rect = await clickIn(cdp, selector);
      const under = await inManager(cdp, `const e = document.elementFromPoint(${rect.x}, ${rect.y}); const b = document.querySelector(${JSON.stringify(selector)}); const r = b ? b.getBoundingClientRect() : null; return { hit: e ? e.tagName + ":" + (e.getAttribute("data-code-layer-action") ?? e.textContent.slice(0, 20)) : null, clicked: [${rect.x}, ${rect.y}].map(Math.round), buttonNow: r ? [r.left, r.top, r.width, r.height].map(Math.round) : null }`);
      await waitReportDetails(cdp, (r) => !r.pending.some((p) => p.id === pending.id), `pending ${pending.id} marked done (click: ${JSON.stringify(under)})`);
    }
    assert.deepEqual((await serverState()).pendingDocs, []);

    await undoVerified();
    assert.equal(fs.readFileSync(FOOTNOTE(), "utf8"), footnoteBefore);
    await waitPostApply();
    return `${listed.pending.length} pending: ${entry.text.slice(0, 90)}`;
  });

  await check("15.3 a mirror changed outside: shown before anything is sent, Apply is off, synchronising puts it back", async () => {
    await clearDrafts(cdp);
    await loadActive(cdp, STORY.hanko);
    await clickBadge(cdp);
    const option = await pickToken(cdp, "fill", "secondary", SECONDARY);
    await click(cdp, option.x, option.y);
    await waitDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "staged");
    const applyDisabled = () => inManager(cdp, `return document.querySelector('[data-code-layer-action="apply"]').disabled`);
    assert.equal(await applyDisabled(), false);
    const mirrorBytes = fs.readFileSync(MIRROR());
    try {
      fs.writeFileSync(MIRROR(), `${mirrorBytes.toString("utf8")}\n/* edited in the mirror only */\n`);
      const notice = await waitFor(() => inManager(cdp, `return document.querySelector('[data-code-layer-notice="mirror-drift"]')?.textContent ?? null`), { timeout: 15000, label: "mirror drift notice" });
      assert.ok(notice.includes("真相檔與鏡像不一致，套用已停用。") && notice.includes("storybook/tokens/tokens-comp.css"), notice);
      await waitFor(async () => ((await applyDisabled()) ? true : null), { label: "Apply disabled" });
      assert.equal(await inManager(cdp, `return document.querySelector('[data-code-layer-action="apply"]').title`), "真相檔與鏡像不一致，請先同步鏡像");
      // Synchronising asks first, saying what will be overwritten.
      await clickAction(cdp, "sync-mirror");
      const confirm = await waitFor(() => inManager(cdp, `return document.querySelector("[data-code-layer-sync-confirm]")?.textContent ?? null`), { label: "what will be overwritten" });
      assert.ok(confirm.includes("storybook/tokens/tokens-comp.css") && confirm.includes("tokens/tokens-comp.css"), confirm);
      assert.ok(!fs.readFileSync(MIRROR()).equals(mirrorBytes), "nothing written before the confirmation");
      await clickAction(cdp, "sync-confirm");
      await waitFor(() => inManager(cdp, `return !document.querySelector('[data-code-layer-notice="mirror-drift"]')`), { timeout: 15000, label: "notice gone" });
      assert.ok(fs.readFileSync(MIRROR()).equals(fs.readFileSync(TRUTH())) && fs.readFileSync(MIRROR()).equals(mirrorBytes), "the mirror equals the source of truth again");
      await waitFor(async () => ((await applyDisabled()) ? null : true), { label: "Apply enabled again" });
    } finally {
      if (!fs.readFileSync(MIRROR()).equals(mirrorBytes)) fs.writeFileSync(MIRROR(), mirrorBytes);
    }
    const state = await serverState();
    assert.deepEqual([state.undoStack.length, state.mirrors.every((m) => m.inSync)], [0, true], "a synchronisation is not an apply to undo");
    await clickAction(cdp, "discard");
    await waitDrafts(cdp, (list) => list.length === 0, "discarded");
    await waitPostApply();
    assert.deepEqual(governedHashes(), start);
  });

  await check("15.4 a file changed after the apply: undo refuses whole-file restore and offers skip and reverse; reverse keeps the outside edit", async () => {
    await clearDrafts(cdp);
    await loadActive(cdp, STORY.hanko);
    await clickBadge(cdp);
    const option = await pickToken(cdp, "fill", "secondary", SECONDARY);
    await click(cdp, option.x, option.y);
    await waitDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "staged");
    await clickAction(cdp, "apply");
    const applied = await waitReportDetails(cdp, (r) => r.mode === "apply" && ["verified", "mismatch", "timeout", "written-not-observable"].includes(r.status), "apply report");
    assert.equal(applied.status, "verified", applied.text);
    await waitPostApply();
    // Someone edits another line of the token file (and its mirror) afterwards.
    const OUTSIDE = "\n/* edited outside after the apply */\n";
    const appliedTruth = fs.readFileSync(TRUTH(), "utf8");
    try {
      fs.writeFileSync(TRUTH(), appliedTruth + OUTSIDE);
      fs.writeFileSync(MIRROR(), appliedTruth + OUTSIDE);
      await waitFor(async () => ((await serverState()).mirrors.every((m) => m.inSync) ? true : null), { label: "mirror in step" });
      await delayMs(800);
      await clickAction(cdp, "undo");
      const refused = await waitReportDetails(cdp, (r) => r.error === "undo-conflict", "undo refused");
      assert.match(refused.headline, /^沒有還原：套用之後檔案又被改過，無法整檔還原/);
      assert.ok(refused.actions.includes("reverse") && refused.actions.includes("skip"), JSON.stringify(refused.actions));
      assert.ok(refused.text.includes("tokens/tokens-comp.css"), refused.text);
      assert.equal(fs.readFileSync(TRUTH(), "utf8"), appliedTruth + OUTSIDE, "the refusal wrote nothing");
      assert.equal((await serverState()).undoStack.length, 1);

      await clickAction(cdp, "reverse");
      const reversed = await waitReportDetails(cdp, (r) => r.mode === "undo" && r.status === "verified" && r.error === "", "reverse apply verified");
      assert.match(reversed.text, /以反向套用還原：只把這次改的引用改回去，其他修改保留。/);
      assert.equal(fs.readFileSync(TRUTH(), "utf8"), tokensBefore + OUTSIDE, "only this apply's reference went back; the outside edit is kept");
      assert.ok(fs.readFileSync(TRUTH()).equals(fs.readFileSync(MIRROR())));
      assert.equal(fs.readFileSync(BADGE_SPEC(), "utf8"), specBefore, "the specification row went back too");
      assert.equal((await previewComputed(cdp)).bg, RED);
      assert.equal((await serverState()).undoStack.length, 0);
      await waitPostApply();
    } finally {
      // Take the outside edit away again: the files are the stage-start bytes.
      for (const file of [TRUTH(), MIRROR()]) {
        const text = fs.readFileSync(file, "utf8");
        if (text.endsWith(OUTSIDE)) fs.writeFileSync(file, text.slice(0, -OUTSIDE.length));
      }
    }
    await waitFor(async () => ((await serverState()).mirrors.every((m) => m.inSync) ? true : null), { label: "mirror in step" });
    assert.deepEqual(governedHashes(), start);
  });

  await check("15.5 with locale en the apply and undo reports are in English", async () => {
    await clearDrafts(cdp);
    await patchIndex(cdp, (json) => {
      json.locale = "en";
    });
    try {
      await loadActive(cdp, STORY.hanko);
      await clickBadge(cdp);
      const option = await pickToken(cdp, "fill", "secondary", SECONDARY);
      await click(cdp, option.x, option.y);
      await waitDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "staged");
      await clickAction(cdp, "apply");
      const report = await waitReportDetails(cdp, (r) => r.mode === "apply" && ["verified", "mismatch", "timeout", "written-not-observable"].includes(r.status), "apply report");
      assert.equal(report.status, "verified", report.text);
      assert.equal(report.headline, "Written and verified");
      const done = await waitReportDetails(cdp, (r) => r.post?.status === "done", "post-apply reported", 90000);
      assert.doesNotMatch(done.own, CJK, done.own);
      assert.match(done.own, /Documents pending sync \(\d+\)/);
      assert.match(done.own, /Derived artifacts regenerated/);
      assert.equal(done.documents.length, 1);
      const undone = await undoVerified();
      assert.equal(undone.headline, "Undone and verified");
      assert.doesNotMatch(undone.own, CJK, undone.own);
      await waitPostApply();
      return `${report.headline} / ${undone.headline}`;
    } finally {
      await patchIndex(cdp, null);
    }
  });

  await check("15.6 every governed file is byte-identical to the stage start; generated documents differ only in their timestamp", async () => {
    await clearDrafts(cdp);
    await waitPostApply();
    const state = await serverState();
    const sameDocument = DOC_FILES().map((file, i) => withoutStamp(fs.readFileSync(file, "utf8")) === withoutStamp(docsBefore[i].toString("utf8")));
    // Generated files: put the exact bytes back so the project is as it was found.
    DOC_FILES().forEach((file, i) => fs.writeFileSync(file, docsBefore[i]));
    assert.deepEqual(sameDocument, [true, true], "the generated documents differ from the start only in their timestamp");
    assert.deepEqual(governedHashes(), start);
    assert.deepEqual([state.undoStack.length, state.pendingDocs.length, state.readOnly.active], [0, 0, false]);
    return `${Object.keys(start).length} files; ${DOC_FILES().length} generated documents restored to their bytes`;
  });
}

// ---- stage 16: layout rows (direction, wrapping, alignment, distribution) -------------------

const SEAL_CONTENT = ".md-badge-seal__content";
const LAYOUT_ROWS = ["direction", "alignItems", "justifyContent", "wrap"];
const optionsSelector = (rowId) => `[data-code-layer-layout-options=${JSON.stringify(rowId)}]`;

/** A layout row of the inspector as the person sees it. */
function layoutRow(cdp, rowId) {
  return inManager(
    cdp,
    `const r = document.querySelector(${JSON.stringify(rowSelector(rowId))}); if (!r) return null;
     return { editable: r.getAttribute("data-editable"), readonly: r.getAttribute("data-readonly"), keyword: r.getAttribute("data-layout"), isDefault: r.getAttribute("data-layout-default"), token: r.getAttribute("data-token"),
       steps: Number(r.getAttribute("data-steps")), status: r.getAttribute("data-status"), title: r.getAttribute("title") ?? "", text: r.textContent, icon: r.querySelector("[data-code-layer-layout-icon]")?.getAttribute("data-code-layer-layout-icon") ?? null,
       pill: !!r.querySelector("[data-code-layer-layout-value]") };`,
  );
}

/** The options popover of an open layout row. */
function layoutOptionsState(cdp, rowId) {
  return inManager(
    cdp,
    `const box = document.querySelector(${JSON.stringify(optionsSelector(rowId))}); if (!box) return null;
     const pop = document.querySelector(${JSON.stringify(popSelector(rowId))});
     return { probe: box.getAttribute("data-probe"), adds: box.getAttribute("data-adds"), property: box.getAttribute("data-property"), where: box.querySelector("[data-code-layer-layout-where]")?.textContent ?? "",
       unlisted: box.querySelector("[data-code-layer-layout-unlisted]")?.textContent ?? null, unset: !!box.querySelector('[data-code-layer-action="layout-unset"]'),
       options: [...box.querySelectorAll("[data-keyword]")].map((e) => ({ keyword: e.getAttribute("data-keyword"), current: e.getAttribute("data-current"), disabled: e.getAttribute("aria-disabled"), active: e.getAttribute("aria-selected"), text: e.textContent })),
       scopes: !!pop?.querySelector("[data-code-layer-scopes]"), stepper: !!pop?.querySelector("[data-code-layer-stepper]"), picker: !!pop?.querySelector("[data-code-layer-picker]"), text: pop?.textContent ?? "" };`,
  );
}

async function openLayoutRow(cdp, rowId) {
  if (!(await layoutOptionsState(cdp, rowId))) await clickIn(cdp, rowSelector(rowId));
  return waitSeen(() => layoutOptionsState(cdp, rowId), (state) => state.probe === "confirmed", `options of ${rowId} confirmed`);
}

const layoutDrafts = (cdp) =>
  inManager(cdp, `return [...document.querySelectorAll("[data-code-layer-draft]")].map((e) => ({ id: e.getAttribute("data-code-layer-draft"), type: e.getAttribute("data-type"), from: e.getAttribute("data-from"), to: e.getAttribute("data-to"), status: e.getAttribute("data-status"), text: e.firstElementChild?.textContent ?? "" }))`);
const waitLayoutDrafts = (cdp, predicate, label) => waitSeen(() => layoutDrafts(cdp), predicate, label);
const optionAt = (rowId, keyword) => `${optionsSelector(rowId)} [data-keyword="${keyword}"]`;
const sealRuleText = (cdp, selector) =>
  inPreview(cdp, `const s = [...d.querySelectorAll("style[data-vite-dev-id]")].find((e) => e.dataset.viteDevId.endsWith("/BadgeSeal.css")); return [...s.sheet.cssRules].find((r) => r.selectorText === ${JSON.stringify(selector)}).cssText`);
const waitComputed = (cdp, selector, property, value) =>
  waitSeen(async () => (await computedOf(cdp, selector, [property]))[0], (now) => now === value, `${property} of ${selector} is ${value}`);

async function stage16(cdp) {
  const start = governedHashes();
  const sealBefore = fs.readFileSync(BADGE_CSS(), "utf8");
  await cdp.send("Network.setBlockedURLs", { urls: [] });
  await cdp.send("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"], origin: BASE }).catch(() => undefined);
  const check = async (name, fn) =>
    checkOuter(name, async () => {
      try {
        return await fn();
      } finally {
        const leftovers = await undoLeftovers().catch((error) => [`cleanup failed: ${error.message}`]);
        if (leftovers.length > 0) process.stdout.write(`    (cleanup: undone through the API after the check: ${leftovers.join(", ")})\n`);
      }
    });

  await check("16.1 a flex container lists its four layout rows, declared or not, each with one target; display stays view-only", async () => {
    await clearDrafts(cdp);
    await loadActive(cdp, STORY.hanko);
    const trace = await traceOf(cdp, ROOT);
    const display = rowOf(trace, "display");
    assert.deepEqual([display.readOnly?.reason, display.scopes.length, display.layout], ["structural", 0, null]);
    const facts = (id) => {
      const row = rowOf(trace, id);
      const target = row.scopes[0]?.target ?? {};
      return [row.readOnly, row.scopes.length, row.defaultScope, target.type, target.selector, target.property, target.component ?? null, target.line, row.layout?.declared ?? null, row.layout?.options.length];
    };
    // align-items and justify-content are declared in .md-badge-seal (lines 6 and 7); direction and wrapping are not.
    assert.deepEqual(facts("alignItems"), [null, 1, "declaration", "set-keyword", ".md-badge-seal", "align-items", 0, 6, "center", 5]);
    assert.deepEqual(facts("justifyContent"), [null, 1, "declaration", "set-keyword", ".md-badge-seal", "justify-content", 0, 7, "center", 6]);
    assert.deepEqual(facts("direction"), [null, 1, "declaration", "add-declaration", ".md-badge-seal", "flex-direction", null, 3, null, 4]);
    assert.deepEqual(facts("wrap"), [null, 1, "declaration", "add-declaration", ".md-badge-seal", "flex-wrap", null, 3, null, 2]);
    assert.deepEqual(rowOf(trace, "wrap").layout.options, ["nowrap", "wrap"]);
    assert.ok(LAYOUT_ROWS.every((id) => rowOf(trace, id).scopes[0].writes.files[0] === "storybook/src/components/badge-seal/BadgeSeal.css"));

    // In the inspector, with the default settings: all five rows are listed; the undeclared ones are marked as defaults.
    const shown = {};
    for (const id of ["display", ...LAYOUT_ROWS]) shown[id] = await waitFor(() => layoutRow(cdp, id), { label: `row ${id} listed without revealing anything` });
    assert.deepEqual([shown.display.editable, shown.display.readonly, shown.display.pill], ["false", "structural", false]);
    assert.match(shown.display.title, /display 只供檢視/);
    assert.deepEqual(LAYOUT_ROWS.map((id) => [id, shown[id].editable, shown[id].keyword, shown[id].isDefault, shown[id].token, shown[id].pill, shown[id].steps]), [
      ["direction", "true", "row", "true", "", true, 0],
      ["alignItems", "true", "center", "false", "", true, 0],
      ["justifyContent", "true", "center", "false", "", true, 0],
      ["wrap", "true", "nowrap", "true", "", true, 0],
    ]);
    assert.deepEqual(LAYOUT_ROWS.map((id) => shown[id].text), ["方向橫向", "對齊置中", "分布置中", "換行不換行"]);
    assert.match(shown.direction.title, /預設值，尚未宣告/);

    // An element that is not a flex container has no layout row to edit (the seal has none; a headline does).
    await loadActive(cdp, STORY.heroDefault);
    const plain = await inPreview(
      cdp,
      `const cl = w.__CODE_LAYER__; const el = [...d.querySelectorAll("#storybook-root [data-component] *")].find((e) => !/flex/.test(getComputedStyle(e).display)); if (!el) return { missing: true };
       const before = cl.lastTrace; cl.select(el, "panel");
       for (let i = 0; i < 100 && (cl.lastTrace === before || cl.selected !== el); i += 1) await new Promise((r) => setTimeout(r, 30));
       return { display: getComputedStyle(el).display, rows: cl.lastTrace.rows.filter((r) => ${JSON.stringify(LAYOUT_ROWS)}.includes(r.group)).map((r) => [r.group, r.layout, r.scopes.length, r.readOnly?.reason ?? null]) };`,
    );
    assert.ok(!plain.missing, "the story has an element that is not a flex container");
    assert.ok(plain.rows.length === 4 && plain.rows.every(([, layout, scopes, reason]) => layout === null && scopes === 0 && ["no-declaration", "not-flex-container"].includes(reason)), JSON.stringify(plain));
    return `non-flex element: display ${plain.display}`;
  });

  await check("16.2 shorthands and unlisted keywords: flex-flow splits into two targets, place-items is read-only, `start` can be replaced", async () => {
    await loadActive(cdp, STORY.hanko);
    const from = "  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  max-inline-size: 70%;";
    assert.equal(sealBefore.split(from).length, 2, "the content rule is where the check expects it");
    await withFileEdit(
      BADGE_CSS(),
      (text) => text.replace(from, "  flex-flow: column wrap;\n  place-items: center;\n  justify-content: start;\n  max-inline-size: 70%;"),
      async () => {
        await waitIndex(cdp, `(index) => index.css.files.some((f) => f.file.endsWith("BadgeSeal.css") && f.rules.some((r) => r.declarations.some((d) => d.property === "flex-flow")))`, "the index has the edited rule");
        const trace = await traceOf(cdp, SEAL_CONTENT, { fresh: true });
        const target = (id) => {
          const row = rowOf(trace, id);
          return [row.readOnly?.reason ?? null, row.scopes[0]?.target.type ?? null, row.scopes[0]?.target.property ?? null, row.scopes[0]?.target.component ?? null, row.layout?.declared ?? null];
        };
        assert.deepEqual(target("direction"), [null, "set-keyword", "flex-flow", 0, "column"]);
        assert.deepEqual(target("wrap"), [null, "set-keyword", "flex-flow", 1, "wrap"]);
        assert.deepEqual(target("alignItems"), ["unsupported-shorthand", null, null, null, null]);
        assert.deepEqual(target("justifyContent"), [null, "set-keyword", "justify-content", 0, "start"]);
        assert.ok(!rowOf(trace, "justifyContent").layout.options.includes("start"));
        // The popover says the source holds a value that is not offered, and offers the six that are.
        const options = await openLayoutRow(cdp, "justifyContent");
        assert.match(options.unlisted ?? "", /目前寫的是 start，不在選項裡/);
        assert.deepEqual([options.options.length, options.options.filter((o) => o.current === "true").length], [6, 0]);
        const locked = await layoutRow(cdp, "alignItems");
        assert.deepEqual([locked.editable, locked.readonly], ["false", "unsupported-shorthand"]);
        await key(cdp, "Escape");
      },
    );
    await waitIndex(cdp, `(index) => index.css.files.some((f) => f.file.endsWith("BadgeSeal.css") && f.rules.some((r) => r.declarations.some((d) => d.property === "flex-direction" && d.value === "column")))`, "the index is back");
    assert.equal(fs.readFileSync(BADGE_CSS(), "utf8"), sealBefore, "the stylesheet is back to its bytes");
  });

  await check("16.3 options of a declared row: highlight previews, Escape leaves nothing, a choice stages, the original value un-stages, the keyboard works", async () => {
    await clearDrafts(cdp);
    await loadActive(cdp, STORY.hanko);
    await traceOf(cdp, SEAL_CONTENT, { fresh: true });
    const animations = await inPreview(cdp, `return d.getAnimations().length`);
    const ruleBefore = await sealRuleText(cdp, SEAL_CONTENT);
    const diskBefore = sha(BADGE_CSS());
    const opened = await openLayoutRow(cdp, "direction");
    assert.deepEqual(opened.options.map((o) => [o.keyword, o.current, o.disabled]), [["row", "false", "false"], ["column", "true", "false"], ["row-reverse", "false", "false"], ["column-reverse", "false", "false"]]);
    assert.deepEqual(opened.options.map((o) => o.text), ["橫向row", "直向✓", "橫向（反向）row-reverse", "直向（反向）column-reverse"]);
    assert.deepEqual([opened.adds, opened.property, opened.scopes, opened.stepper, opened.picker, opened.unset], ["false", "flex-direction", false, false, false, false]);
    assert.match(opened.where, /會改 \.md-badge-seal__content 的 flex-direction。/);
    // The probe left the rule as it was and started nothing.
    assert.equal(await sealRuleText(cdp, SEAL_CONTENT), ruleBefore);
    assert.equal(await inPreview(cdp, `return d.getAnimations().length`), animations);

    // Highlight: the page shows it, nothing is staged, nothing is written.
    const row = await managerRect(cdp, optionAt("direction", "row"));
    await mouse(cdp, "mouseMoved", row.x, row.y);
    await waitComputed(cdp, SEAL_CONTENT, "flex-direction", "row");
    assert.deepEqual([(await layoutDrafts(cdp)).length, sha(BADGE_CSS())], [0, diskBefore]);
    await key(cdp, "Escape");
    await waitFor(async () => !(await layoutOptionsState(cdp, "direction")), { label: "popover closed" });
    await waitComputed(cdp, SEAL_CONTENT, "flex-direction", "column");
    assert.equal((await layoutDrafts(cdp)).length, 0, "nothing was added to the changes list");

    // Choice: one staged change, the row shows it, the popover closes.
    await openLayoutRow(cdp, "direction");
    await clickIn(cdp, optionAt("direction", "row"));
    const staged = await waitLayoutDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "one change staged");
    assert.deepEqual([staged[0].type, staged[0].from, staged[0].to, staged[0].text.replace(/\s+/g, "")], ["set-keyword", "column", "row", "方向column→row"]);
    assert.equal(await layoutOptionsState(cdp, "direction"), null, "choosing closed the popover");
    const stagedRow = await layoutRow(cdp, "direction");
    assert.deepEqual([stagedRow.keyword, stagedRow.icon, stagedRow.text, stagedRow.isDefault], ["row", "row", "方向橫向", "false"]);
    assert.match(stagedRow.title, /原本：column/);
    await waitComputed(cdp, SEAL_CONTENT, "flex-direction", "row");
    assert.equal(sha(BADGE_CSS()), diskBefore, "staging wrote nothing");

    // Choosing what the source holds is not a change.
    const again = await openLayoutRow(cdp, "direction");
    assert.deepEqual(again.options.filter((o) => o.current === "true").map((o) => o.keyword), ["row"], "the staged keyword is the one in effect");
    await clickIn(cdp, optionAt("direction", "column"));
    await waitLayoutDrafts(cdp, (list) => list.length === 0, "the change is gone");
    await waitComputed(cdp, SEAL_CONTENT, "flex-direction", "column");

    // Keyboard: the arrows walk the list and preview, Enter stages.
    await openLayoutRow(cdp, "direction");
    for (let i = 0; i < 3; i += 1) await key(cdp, "ArrowDown");
    await waitSeen(() => layoutOptionsState(cdp, "direction"), (state) => state.options[2].active === "true", "the third option is highlighted");
    await waitComputed(cdp, SEAL_CONTENT, "flex-direction", "row-reverse");
    await key(cdp, "Enter");
    const byKeyboard = await waitLayoutDrafts(cdp, (list) => list.length === 1, "staged with the keyboard");
    assert.deepEqual([byKeyboard[0].from, byKeyboard[0].to], ["column", "row-reverse"]);
    await clickAction(cdp, "remove-draft");
    await waitLayoutDrafts(cdp, (list) => list.length === 0, "removed");
    await waitComputed(cdp, SEAL_CONTENT, "flex-direction", "column");
  });

  await check("16.4 a row nothing declares: the popover says which rule gets a new line; the staged addition can be discarded there", async () => {
    await clearDrafts(cdp);
    await loadActive(cdp, STORY.hanko);
    await traceOf(cdp, ROOT, { fresh: true });
    const animations = await inPreview(cdp, `return d.getAnimations().length`);
    const ruleBefore = await sealRuleText(cdp, ".md-badge-seal");
    const diskBefore = sha(BADGE_CSS());
    const opened = await openLayoutRow(cdp, "wrap");
    assert.deepEqual(opened.options.map((o) => [o.keyword, o.current]), [["nowrap", "true"], ["wrap", "false"]]);
    assert.deepEqual([opened.adds, opened.scopes, opened.stepper, opened.unset], ["true", false, false, false]);
    assert.match(opened.where, /\.md-badge-seal 還沒有設定 flex-wrap，會在這條規則新增一行。/);
    assert.equal(await sealRuleText(cdp, ".md-badge-seal"), ruleBefore, "the probe added the property and took it away again");
    assert.equal(await inPreview(cdp, `return d.getAnimations().length`), animations);

    await clickIn(cdp, optionAt("wrap", "wrap"));
    const staged = await waitLayoutDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "the addition is staged");
    assert.deepEqual([staged[0].type, staged[0].from, staged[0].to, staged[0].text.replace(/\s+/g, "")], ["add-declaration", "", "wrap", "換行未設定→wrap"]);
    await waitComputed(cdp, ROOT, "flex-wrap", "wrap");
    const stagedRow = await layoutRow(cdp, "wrap");
    assert.deepEqual([stagedRow.keyword, stagedRow.text, stagedRow.isDefault], ["wrap", "換行換行", "false"]);
    assert.match(stagedRow.title, /原本：未設定/);
    assert.equal(sha(BADGE_CSS()), diskBefore);

    // Open again: the staged keyword is marked, and the addition can be dropped from here.
    const reopened = await openLayoutRow(cdp, "wrap");
    assert.deepEqual([reopened.options.filter((o) => o.current === "true").map((o) => o.keyword), reopened.unset], [["wrap"], true]);
    await clickIn(cdp, '[data-code-layer-action="layout-unset"]');
    await waitLayoutDrafts(cdp, (list) => list.length === 0, "discarded");
    await waitComputed(cdp, ROOT, "flex-wrap", "nowrap");
    assert.equal(await sealRuleText(cdp, ".md-badge-seal"), ruleBefore, "no preview left on the rule");
  });

  await check("16.5 a keyword, an added line and a token re-bind in one apply: staged is not written, survives a reload, is verified, and undo is exact", async () => {
    await clearDrafts(cdp);
    await loadActive(cdp, STORY.hanko);
    await clickBadge(cdp);
    await openLayoutRow(cdp, "justifyContent");
    await clickIn(cdp, optionAt("justifyContent", "space-between"));
    await waitLayoutDrafts(cdp, (list) => list.length === 1, "distribution staged");
    await openLayoutRow(cdp, "wrap");
    await clickIn(cdp, optionAt("wrap", "wrap"));
    await waitLayoutDrafts(cdp, (list) => list.length === 2, "wrapping staged");
    const option = await pickToken(cdp, "radius", "corner-md", "--md-sys-shape-corner-md");
    await click(cdp, option.x, option.y);
    const staged = await waitLayoutDrafts(cdp, (list) => list.length === 3 && list.every((d) => d.status === "previewing"), "three changes previewing");
    assert.deepEqual(staged.map((d) => [d.type, d.from, d.to]), [["set-keyword", "center", "space-between"], ["add-declaration", "", "wrap"], ["rebind-declaration", "--md-sys-shape-corner-sm", "--md-sys-shape-corner-md"]]);
    assert.deepEqual(staged.slice(0, 2).map((d) => d.text.replace(/\s+/g, "")), ["分布center→space-between", "換行未設定→wrap"]);
    assert.deepEqual(governedHashes(), start, "three staged changes, no file changed");
    assert.deepEqual(await computedOf(cdp, ROOT, ["justify-content", "flex-wrap", "border-top-left-radius"]), ["space-between", "wrap", "8px"]);

    // A reload keeps the staged changes and their previews.
    await loadActive(cdp, STORY.hanko);
    await waitLayoutDrafts(cdp, (list) => list.length === 3 && list.every((d) => d.status === "previewing"), "three changes after the reload");
    assert.deepEqual(await computedOf(cdp, ROOT, ["justify-content", "flex-wrap", "border-top-left-radius"]), ["space-between", "wrap", "8px"]);
    assert.deepEqual(governedHashes(), start);

    await clickBadge(cdp);
    await clickAction(cdp, "apply");
    const report = await waitReport(cdp, "apply", ["verified"], 40000);
    assert.deepEqual(report.items, ["verified", "verified", "verified"]);
    const written = fs.readFileSync(BADGE_CSS(), "utf8");
    assert.equal(
      written,
      sealBefore
        .replace("  justify-content: center;\n  min-inline-size", "  justify-content: space-between;\n  min-inline-size")
        .replace("  text-align: center;\n}", "  text-align: center;\n  flex-wrap: wrap;\n}")
        .replace("  background: var(--md-comp-badge-seal-hanko-container-color);\n  border-radius: var(--md-sys-shape-corner-sm);", "  background: var(--md-comp-badge-seal-hanko-container-color);\n  border-radius: var(--md-sys-shape-corner-md);"),
      "exactly the keyword, the new line at the end of the rule, and the token name",
    );
    assert.deepEqual([line(BADGE_CSS(), 7), line(BADGE_CSS(), 15), line(BADGE_CSS(), 16)], ["  justify-content: space-between;", "  flex-wrap: wrap;", "}"]);
    assert.deepEqual(await computedOf(cdp, ROOT, ["justify-content", "flex-wrap", "border-top-left-radius"]), ["space-between", "wrap", "8px"]);
    assert.equal(await inPreview(cdp, `return w.__CODE_LAYER__.live.hasPreviews()`), false, "the values come from the files now");
    assert.equal((await layoutDrafts(cdp)).length, 0, "applied changes left the list");
    // Each layout change left one entry for a person to look at, with its keywords.
    const state = await serverState();
    const layoutEntries = state.pendingDocs.filter((e) => e.newValue).map((e) => [e.kind, e.reason, e.property, e.oldValue, e.newValue, e.line]);
    assert.deepEqual(layoutEntries, [["declaration", "declaration-not-documented", "justify-content", "center", "space-between", 7], ["declaration", "declaration-not-documented", "flex-wrap", null, "wrap", 15]]);
    // The rows now read from the source: declared, not defaults.
    await waitSeen(() => layoutRow(cdp, "wrap"), (row) => row.keyword === "wrap" && row.isDefault === "false", "the wrapping row is declared now");
    await waitPostApply();

    await clickAction(cdp, "undo");
    await waitReport(cdp, "undo", ["verified"], 40000);
    await waitPostApply();
    assert.equal(fs.readFileSync(BADGE_CSS(), "utf8"), sealBefore, "undo restored the stylesheet to its bytes");
    assert.deepEqual(await computedOf(cdp, ROOT, ["justify-content", "flex-wrap", "border-top-left-radius"]), ["center", "nowrap", "4px"]);
    assert.equal(await inPreview(cdp, `return w.__CODE_LAYER__.live.hasPreviews()`), false, "undo did not bring previews back");
    assert.equal((await serverState()).pendingDocs.length, 0, "undo cleared what the apply left pending");
  });

  await check("16.6 a staged keyword: compare shows the original while held; it survives a hot update of an unchanged file and turns into a conflict when the source changes under it", async () => {
    await clearDrafts(cdp);
    await loadActive(cdp, STORY.hanko);
    await traceOf(cdp, SEAL_CONTENT, { fresh: true });
    await openLayoutRow(cdp, "direction");
    await clickIn(cdp, optionAt("direction", "row"));
    await waitLayoutDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "staged");
    // Holding "compare" shows the page without the staged keyword; releasing puts it back.
    const compare = await managerRect(cdp, '[data-code-layer-action="compare"]');
    await mouse(cdp, "mouseMoved", compare.x, compare.y);
    await mouse(cdp, "mousePressed", compare.x, compare.y);
    await waitComputed(cdp, SEAL_CONTENT, "flex-direction", "column");
    await mouse(cdp, "mouseReleased", compare.x, compare.y);
    await waitComputed(cdp, SEAL_CONTENT, "flex-direction", "row");
    // The same bytes written again: the page takes the hot update and the preview is put back.
    fs.writeFileSync(BADGE_CSS(), fs.readFileSync(BADGE_CSS()));
    await delayMs(900);
    await waitLayoutDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "still previewing after the hot update");
    await waitComputed(cdp, SEAL_CONTENT, "flex-direction", "row");
    // Someone changes the keyword in the source: the staged change no longer applies to what is there.
    await withFileEdit(
      BADGE_CSS(),
      (text) => text.replace("  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  max-inline-size: 70%;", "  flex-direction: column-reverse;\n  align-items: center;\n  justify-content: center;\n  max-inline-size: 70%;"),
      async () => {
        const conflict = await waitLayoutDrafts(cdp, (list) => list.length === 1 && list[0].status === "conflict", "conflict");
        assert.match(conflict[0].text, /來源已變更/);
        await waitComputed(cdp, SEAL_CONTENT, "flex-direction", "column-reverse");
      },
    );
    await waitLayoutDrafts(cdp, (list) => list.length === 1 && list[0].status === "previewing", "previewing again once the source is back");
    await clickAction(cdp, "remove-draft");
    await waitLayoutDrafts(cdp, (list) => list.length === 0, "removed");
    assert.equal(fs.readFileSync(BADGE_CSS(), "utf8"), sealBefore);
  });

  await check("16.7 with locale en the layout rows, options and notes are in English", async () => {
    await clearDrafts(cdp);
    await patchIndex(cdp, (json) => {
      json.locale = "en";
    });
    try {
      await loadActive(cdp, STORY.hanko);
      await traceOf(cdp, ROOT, { fresh: true });
      const rows = {};
      for (const id of LAYOUT_ROWS) rows[id] = await waitFor(() => layoutRow(cdp, id), { label: `row ${id}` });
      assert.deepEqual(LAYOUT_ROWS.map((id) => rows[id].text), ["DirectionHorizontal", "AlignCenter", "JustifyCenter", "WrapNo wrap"]);
      const direction = await openLayoutRow(cdp, "direction");
      assert.deepEqual(direction.options.map((o) => o.text), ["Horizontal✓", "Verticalcolumn", "Horizontal, reversedrow-reverse", "Vertical, reversedcolumn-reverse"]);
      assert.match(direction.where, /\.md-badge-seal does not set flex-direction yet; a line is added to that rule\./);
      assert.doesNotMatch(direction.text, /[㐀-鿿]/, "no Chinese text in the popover");
      await key(cdp, "Escape");
      // Start and end are named by the side they are on: this container runs left to right.
      const justify = await openLayoutRow(cdp, "justifyContent");
      assert.deepEqual(justify.options.map((o) => o.text), ["Leftflex-start", "Center✓", "Rightflex-end", "Space betweenspace-between", "Space aroundspace-around", "Space evenlyspace-evenly"]);
      await key(cdp, "Escape");
      const align = await openLayoutRow(cdp, "alignItems");
      assert.deepEqual(align.options.map((o) => o.text), ["Topflex-start", "Center✓", "Bottomflex-end", "Stretchstretch", "Text baselinebaseline"]);
      await key(cdp, "Escape");
    } finally {
      await patchIndex(cdp, null);
    }
  });

  await check("16.8 the object reference names the layout rows, their options and where a change goes; a column container names its sides the other way round", async () => {
    await clearDrafts(cdp);
    await loadActive(cdp, STORY.hanko);
    await clickBadge(cdp);
    const text = await copyFromOutline(cdp);
    const lineOf = (label) => text.split("\n").find((l) => l.startsWith(label)) ?? "";
    assert.match(lineOf("排列方向"), /flex-direction = row · 尚未宣告；可設為 row \| column \| row-reverse \| column-reverse 之一（會在 \.md-badge-seal 新增一行，storybook\/src\/components\/badge-seal\/BadgeSeal\.css:3）/);
    assert.match(lineOf("交叉軸對齊"), /align-items（storybook\/src\/components\/badge-seal\/BadgeSeal\.css:6） = center · 可改成 flex-start \| center \| flex-end \| stretch \| baseline 之一（改 \.md-badge-seal 的這個宣告，storybook\/src\/components\/badge-seal\/BadgeSeal\.css:6）/);
    assert.match(lineOf("顯示方式"), /唯讀：display 只供檢視/);
    // The content box stacks its children (a column): in horizontal writing distribution runs top to bottom and alignment left to right;
    // in vertical-rl writing (the trial ground's hanko content) the block axis runs right to left and the inline axis top to bottom.
    await traceOf(cdp, SEAL_CONTENT, { fresh: true });
    const contentWriting = await inPreview(cdp, `return getComputedStyle(d.querySelector(".md-badge-seal--hanko .md-badge-seal__content")).writingMode`);
    const sides = contentWriting === "vertical-rl" ? { main: ["靠右", "靠左"], cross: ["靠上", "靠下"] } : { main: ["靠上", "靠下"], cross: ["靠左", "靠右"] };
    const justify = await openLayoutRow(cdp, "justifyContent");
    assert.deepEqual(justify.options.slice(0, 3).map((o) => o.text), [`${sides.main[0]}flex-start`, "置中✓", `${sides.main[1]}flex-end`]);
    await key(cdp, "Escape");
    const align = await openLayoutRow(cdp, "alignItems");
    assert.deepEqual(align.options.slice(0, 3).map((o) => o.text), [`${sides.cross[0]}flex-start`, "置中✓", `${sides.cross[1]}flex-end`]);
    await key(cdp, "Escape");
  });

  await check("16.9 the stage left the project as it found it", async () => {
    assert.deepEqual(governedHashes(), start);
    const state = await serverState();
    assert.deepEqual([state.undoStack.length, state.pendingDocs.length], [0, 0]);
    return `${Object.keys(start).length} governed files unchanged`;
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
  activePage = cdp;
  trackApplies(cdp);
  // What the project already has applied is the project's: it stays, whatever the checks do.
  for (const entry of (await rawServerState()).undoStack) protectedApplies.add(entry.applyId);
  if (protectedApplies.size > 0) process.stdout.write(`(the project has ${protectedApplies.size} apply(ies) of its own on the undo stack: ${[...protectedApplies].join(", ")}; left as they are)\n`);
  // Documents the binding's post-apply commands regenerate after every apply and undo.
  const generated = DOC_FILES().filter((file) => fs.existsSync(file)).map((file) => ({ file, bytes: fs.readFileSync(file) }));
  try {
    if (stages.includes(6)) await stage6(cdp, chrome);
    if (stages.includes(7)) await stage7(cdp, chrome);
    if (stages.includes(11)) await stage11(cdp, chrome);
    if (stages.includes(12)) await stage12(cdp, chrome);
    if (stages.includes(13)) await stage13(cdp, chrome);
    if (stages.includes(14)) await stage14(cdp, chrome);
    if (stages.includes(15)) await stage15(cdp, chrome);
    if (stages.includes(16)) await stage16(cdp, chrome);
  } finally {
    cdp.close();
    await chrome.close();
    // Whatever happened: no test apply stays on the project.
    const leftovers = await undoLeftovers().catch((error) => [`cleanup failed: ${error.message}`]);
    if (leftovers.length > 0) process.stdout.write(`(cleanup: undone through the API at the end of the run: ${leftovers.join(", ")})\n`);
    // Regenerated documents differ from the start only in their timestamp: put the exact bytes back.
    await waitPostApply().catch(() => undefined);
    for (const { file, bytes } of generated) {
      const now = fs.readFileSync(file);
      if (now.equals(bytes)) continue;
      if (withoutStamp(now.toString("utf8")) === withoutStamp(bytes.toString("utf8"))) fs.writeFileSync(file, bytes);
      else process.stdout.write(`(warning: ${path.relative(LAB_ROOT(), file)} differs from the start of the run in more than its timestamp; left as it is)\n`);
    }
  }
  const failed = results.filter((r) => !r.ok);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});
