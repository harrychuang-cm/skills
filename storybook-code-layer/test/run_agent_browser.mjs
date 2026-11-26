#!/usr/bin/env node
// Browser checks for the AI dialog (template 1.3.0): the entry points, the
// prompt dialog, approval outside the page, progress across a reload,
// cancellation, the result review and the decision follow-up. Trusted input
// over CDP. The agent is the fake runner (test/fixtures/fake-runner.mjs) and
// approvals come from the test stub (CODE_LAYER_TEST_CONFIRM): no claude or
// codex process is started and nothing is spent.
//
// The script prepares and restores the project itself:
//   CODE_LAYER_TEST_PROJECT=<storybook root> node test/run_agent_browser.mjs --setup
//     turns agent runs on in the binding (its exact bytes are kept aside),
//     writes a runner file for the fake runner and an empty stub file, and
//     prints the variable Storybook has to be started with.
//   CODE_LAYER_TEST_CONFIRM=<stub file> storybook dev …   (one instance, as always)
//   CODE_LAYER_TEST_PROJECT=<storybook root> node test/run_agent_browser.mjs --log <storybook log> [--headed] [--only A3,A7]
//   CODE_LAYER_TEST_PROJECT=<storybook root> node test/run_agent_browser.mjs --teardown
//     puts the binding's bytes back, removes the runner file, the stub and the
//     run folders the checks created; restart Storybook without the variable.
//
// The checks record the project's governed files and its undo stack first.
// They undo only the imports their own requests made, and put back the exact
// bytes of the generated documentation (the post-apply commands rewrite it
// with a new date).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { click, delayMs, evaluate, inPreview, key, launchChrome, openPage, waitFor } from "./cdp.mjs";
import { addon, testProject } from "./helpers.mjs";

const BASE = process.env.STORYBOOK_URL ?? "http://localhost:6006";
const HANKO = "components-marks-badge-seal--hanko";
const ROOT = '[data-component="badge-seal"]';
const args = process.argv.slice(2);
const headed = args.includes("--headed");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const LOG = args.includes("--log") ? args[args.indexOf("--log") + 1] : null;

const PROJECT = testProject();
const BINDING = path.join(PROJECT, ".storybook", "code-layer", "code-layer.config.json");
const LAB_ROOT = path.dirname(PROJECT);
const STATE_DIR = () => path.resolve(PROJECT, JSON.parse(fs.readFileSync(BINDING, "utf8")).stateDir);
const TEST_DIR = () => path.join(STATE_DIR(), "test-agent-browser");
const STUB = () => path.join(TEST_DIR(), "confirm.txt");
const BINDING_BACKUP = () => path.join(TEST_DIR(), "binding.json");
const RUNNERS_BACKUP = () => path.join(TEST_DIR(), "agent-runners.json");
const RUNS_MADE = () => path.join(TEST_DIR(), "runs.json");

const BADGE_CSS_REL = "storybook/src/components/badge-seal/BadgeSeal.css";
const BADGE_CSS = path.join(LAB_ROOT, BADGE_CSS_REL);
const TOKEN_FILES = ["tokens/tokens-comp.css", "storybook/tokens/tokens-comp.css"].map((p) => path.join(LAB_ROOT, p));
const SPEC_FILES = () => fs.readdirSync(path.join(LAB_ROOT, "design-system/components")).filter((name) => name.endsWith(".md")).sort().map((name) => path.join(LAB_ROOT, "design-system/components", name));
const DOC_FILES = ["docs/design-system/index.html", "docs/design-system/review.html"].map((p) => path.join(LAB_ROOT, p));

const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const governedHashes = () => Object.fromEntries([BADGE_CSS, ...TOKEN_FILES, ...SPEC_FILES(), BINDING].map((file) => [path.relative(LAB_ROOT, file), sha(file)]));
const withoutStamp = (html) => html.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<generated>");

// ---- setup and teardown --------------------------------------------------------

async function setup() {
  const { writeRunnerFile, RUNNER_FILE } = await addon("server/agent/runners.mjs");
  const { runnerFileFor } = await import("./agent_helpers.mjs");
  if (fs.existsSync(BINDING_BACKUP())) throw new Error(`${BINDING_BACKUP()} exists: an earlier --setup was not torn down; run --teardown first`);
  fs.mkdirSync(TEST_DIR(), { recursive: true, mode: 0o700 });
  const bytes = fs.readFileSync(BINDING);
  fs.writeFileSync(BINDING_BACKUP(), bytes, { mode: 0o600 });
  const runners = path.join(STATE_DIR(), RUNNER_FILE);
  if (fs.existsSync(runners)) fs.copyFileSync(runners, RUNNERS_BACKUP());
  const binding = JSON.parse(bytes.toString("utf8"));
  binding.agent = { enabled: true, confirm: "native-dialog" };
  fs.writeFileSync(BINDING, `${JSON.stringify(binding, null, 2)}\n`);
  writeRunnerFile(STATE_DIR(), runnerFileFor());
  fs.writeFileSync(STUB(), "", { mode: 0o600 });
  fs.writeFileSync(RUNS_MADE(), "[]\n", { mode: 0o600 });
  process.stdout.write(`Agent runs are on for the checks (binding kept in ${BINDING_BACKUP()}).\nStart Storybook with:\n  CODE_LAYER_TEST_CONFIRM=${STUB()}\n`);
}

async function teardown() {
  const { RUNNER_FILE } = await addon("server/agent/runners.mjs");
  if (!fs.existsSync(BINDING_BACKUP())) {
    process.stdout.write("Nothing to tear down.\n");
    return;
  }
  const original = fs.readFileSync(BINDING_BACKUP());
  fs.writeFileSync(BINDING, original);
  assert.ok(fs.readFileSync(BINDING).equals(original), "the binding has its exact bytes back");
  const runners = path.join(STATE_DIR(), RUNNER_FILE);
  if (fs.existsSync(RUNNERS_BACKUP())) fs.copyFileSync(RUNNERS_BACKUP(), runners);
  else fs.rmSync(runners, { force: true });
  let removed = 0;
  if (fs.existsSync(RUNS_MADE())) {
    for (const runId of JSON.parse(fs.readFileSync(RUNS_MADE(), "utf8"))) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) continue;
      const dir = path.join(STATE_DIR(), "agent", runId);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        removed += 1;
      }
    }
  }
  fs.rmSync(TEST_DIR(), { recursive: true, force: true });
  process.stdout.write(`The binding has its bytes back, the runner file and the stub are gone, ${removed} run folder(s) of the checks removed.\nRestart Storybook without CODE_LAYER_TEST_CONFIRM.\n`);
}

// ---- the server ------------------------------------------------------------------

const same = { "Sec-Fetch-Site": "same-origin", Origin: BASE };
let session = null;
async function get(route) {
  return (await fetch(`${BASE}/__code-layer${route}`, { headers: same })).json();
}
async function post(route, body) {
  session ??= (await get("/session")).session;
  const response = await fetch(`${BASE}/__code-layer${route}`, { method: "POST", headers: { ...same, "Content-Type": "application/json", "x-code-layer-session": session }, body: JSON.stringify(body) });
  return { status: response.status, json: await response.json().catch(() => null) };
}
const setStub = (answer) => fs.writeFileSync(STUB(), answer);

/** The project's own applies when the run started: never undone, never counted. */
const protectedApplies = new Set();
/** Imports made by the requests of this run: the only applies the cleanup may undo. */
const ownImports = [];
const runsMade = new Set();
function noteRun(runId) {
  if (!runId || runsMade.has(runId)) return;
  runsMade.add(runId);
  fs.writeFileSync(RUNS_MADE(), `${JSON.stringify([...runsMade], null, 2)}\n`);
}

// ---- checks --------------------------------------------------------------------------

const results = [];
let activePage = null;

async function check(name, fn) {
  if (only && !only.some((o) => name.split(" ")[0] === o)) return;
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    process.stdout.write(`✔ ${name}${detail ? ` — ${detail}` : ""}\n`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: error.message });
    process.stdout.write(`✖ ${name}\n    ${error.message.split("\n").join("\n    ")}\n`);
    const directory = process.env.CODE_LAYER_TEST_SHOTS;
    if (directory && activePage) {
      try {
        const shot = await activePage.send("Page.captureScreenshot", { format: "png" });
        const file = path.join(directory, `agent-fail-${name.split(" ")[0]}.png`);
        fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
        process.stdout.write(`    (screenshot: ${file})\n`);
      } catch {
        // the page may be gone
      }
    }
  }
}

const inManager = (cdp, body) => evaluate(cdp, `(async () => { ${body} })()`);

async function waitSeen(read, predicate, label, timeout = 15000) {
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

async function managerRect(cdp, selector) {
  return inManager(cdp, `const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: "nearest" }); const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null; return { x: r.left + Math.min(r.width / 2, 120), y: r.top + Math.min(r.height / 2, 12), left: r.left, top: r.top, width: r.width, height: r.height };`);
}

async function clickIn(cdp, selector, label = selector) {
  const rect = await waitFor(() => managerRect(cdp, selector), { label });
  await click(cdp, rect.x, rect.y);
  return rect;
}

async function clickAction(cdp, action) {
  const selector = `[data-code-layer-action="${action}"]`;
  await waitFor(() => inManager(cdp, `const b = document.querySelector(${JSON.stringify(selector)}); return !!b && !b.disabled`), { label: `action ${action} enabled` });
  await clickIn(cdp, selector, `action ${action}`);
}

/** The story with the tool on, once the inspector is docked and the frame has stopped moving. */
async function loadActive(cdp, storyId = HANKO) {
  await cdp.send("Page.navigate", { url: `${BASE}/?path=/story/${storyId}&globals=codeLayer:!true` });
  await afterLoad(cdp);
}

async function afterLoad(cdp) {
  await waitFor(() => inPreview(cdp, `return !!(w.__CODE_LAYER__ && w.__CODE_LAYER__.index && w.__CODE_LAYER__.effective.state === "active" && d.querySelector(${JSON.stringify(ROOT)}))`), { timeout: 90000, label: "story active" });
  let last = null;
  let stable = 0;
  await waitFor(async () => {
    const now = await evaluate(cdp, `(() => { const f = document.getElementById("storybook-preview-iframe"); const p = document.querySelector("[data-code-layer-panel]"); if (!f || !p || p.getBoundingClientRect().width === 0) return null; const r = f.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round).join(","); })()`);
    stable = now !== null && now === last ? stable + 1 : 0;
    last = now;
    return stable >= 3 ? true : null;
  }, { timeout: 20000, interval: 120, label: "inspector docked and the frame settled" });
  await delayMs(150);
}

/** Click the badge on the canvas: the selection is the component's root. */
async function selectRoot(cdp) {
  const point = await inPreview(cdp, `const el = d.querySelector(${JSON.stringify(ROOT)}); const fr = f.getBoundingClientRect(); const r = el.getBoundingClientRect(); return { x: fr.left + r.left + r.width / 2, y: fr.top + r.top + r.height / 2 };`);
  await click(cdp, point.x, point.y);
  return waitFor(() => inPreview(cdp, `const cl = w.__CODE_LAYER__; return cl.selected === d.querySelector(${JSON.stringify(ROOT)}) && cl.lastTrace ? cl.lastTrace : null`), { label: "badge selected" });
}

/** Select through the runtime (when the dialog covers the canvas); returns the new element's trace once it has arrived. */
async function selectBy(cdp, selector) {
  const trace = await inPreview(
    cdp,
    `const cl = w.__CODE_LAYER__; const el = d.querySelector(${JSON.stringify(selector)}); if (!el) return null;
     if (cl.selected === el && cl.lastTrace) return cl.lastTrace;
     const before = cl.lastTrace; cl.select(el, "panel");
     for (let i = 0; i < 150 && (cl.lastTrace === before || cl.selected !== el || !cl.lastTrace); i += 1) await new Promise((r) => setTimeout(r, 30));
     return cl.selected === el && cl.lastTrace !== before ? cl.lastTrace : null;`,
  );
  assert.ok(trace, `no trace for ${selector}`);
  return trace;
}

const labelAgent = (cdp) =>
  inPreview(
    cdp,
    `const s = d.querySelector("[data-code-layer-chrome]")?.shadowRoot; const b = s?.querySelector('.select-label button[data-code-layer-action="agent"]'); if (!b) return null;
     const r = b.getBoundingClientRect(); const fr = f.getBoundingClientRect();
     return { hidden: b.hidden || r.width === 0, text: b.textContent, title: b.title, x: fr.left + r.left + r.width / 2, y: fr.top + r.top + r.height / 2 };`,
  );

const headerAgent = (cdp) =>
  inManager(
    cdp,
    `const b = document.querySelector('[data-code-layer-panel] [data-code-layer-action="agent"]'); if (!b) return null; const r = b.getBoundingClientRect();
     return { ready: b.getAttribute("data-ready"), disabled: b.getAttribute("aria-disabled"), pressed: b.getAttribute("aria-pressed"), title: b.getAttribute("title"), label: b.getAttribute("aria-label"), x: r.left + r.width / 2, y: r.top + r.height / 2 };`,
  );

const dialog = (cdp) =>
  inManager(
    cdp,
    `const pop = document.querySelector('[data-code-layer-popover="agent"]'); const dlg = pop?.querySelector("[data-code-layer-agent-dialog]");
     const panel = document.querySelector("[data-code-layer-panel]");
     const box = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); };
     const q = (sel) => dlg?.querySelector(sel) ?? null;
     const input = q("[data-code-layer-agent-input]"); const submit = q('[data-code-layer-action="agent-submit"]'); const question = q("[data-code-layer-agent-question]");
     return { open: !!dlg && getComputedStyle(pop).opacity === "1", rect: pop ? box(pop) : null, panel: panel ? box(panel) : null,
       rowPopovers: [...document.querySelectorAll("[data-code-layer-popover]")].map((e) => e.getAttribute("data-code-layer-popover")).filter((v) => v !== "agent"),
       state: dlg?.getAttribute("data-state") ?? null, head: dlg?.firstElementChild?.textContent ?? null,
       element: q("[data-code-layer-agent-element]")?.textContent ?? null,
       value: input ? input.value : null, placeholder: input?.placeholder ?? null,
       counter: q("[data-code-layer-agent-counter]")?.textContent ?? null,
       submit: submit ? { disabled: submit.disabled, text: submit.textContent } : null,
       confirm: q("[data-code-layer-agent-confirm]")?.getAttribute("data-code-layer-agent-confirm") ?? null,
       code: !!q("[data-code-layer-agent-code]"),
       runId: q("[data-code-layer-agent-run]")?.getAttribute("data-code-layer-agent-run") ?? null,
       runState: q("[data-code-layer-agent-run]")?.getAttribute("data-state") ?? null,
       stateText: q("[data-code-layer-agent-state]")?.textContent ?? null,
       shownText: q("[data-code-layer-agent-text]")?.textContent ?? null,
       question: question ? { text: question.textContent, elements: question.children.length } : null,
       reference: q("[data-code-layer-agent-reference]")?.textContent ?? null,
       unavailable: q("[data-code-layer-agent-unavailable]")?.textContent ?? null,
       unconfirmed: !!q("[data-code-layer-agent-unconfirmed]"),
       error: q("[data-code-layer-agent-error]")?.getAttribute("data-code-layer-agent-error") ?? null,
       text: dlg?.textContent ?? "" };`,
  );

const report = (cdp) =>
  inManager(
    cdp,
    `const r = document.querySelector("[data-code-layer-agent-report]"); if (!r) return null; const q = (s) => r.querySelector(s);
     const summary = q("[data-code-layer-agent-summary]");
     return { state: r.getAttribute("data-code-layer-agent-report"), runId: r.getAttribute("data-run"), headline: q("[data-code-layer-agent-headline]")?.textContent ?? "",
       elapsed: q("[data-code-layer-agent-elapsed]")?.getAttribute("data-code-layer-agent-elapsed") ?? null,
       text: q("[data-code-layer-agent-report-text]")?.textContent ?? null,
       summary: summary ? { text: summary.textContent, elements: summary.children.length } : null,
       question: q("[data-code-layer-agent-report-question]")?.textContent ?? null,
       files: [...r.querySelectorAll("[data-code-layer-agent-file]")].map((e) => [e.getAttribute("data-code-layer-agent-file"), e.textContent]),
       rows: [...r.querySelectorAll("[data-code-layer-agent-row]")].map((e) => [e.getAttribute("data-code-layer-agent-row"), e.textContent]),
       reasons: [...r.querySelectorAll("[data-code-layer-agent-reason]")].map((e) => [e.getAttribute("data-code-layer-agent-reason"), e.textContent]),
       unchanged: q("[data-code-layer-agent-unchanged]")?.textContent ?? null,
       actions: [...r.querySelectorAll("[data-code-layer-action]")].map((e) => e.getAttribute("data-code-layer-action")),
       all: r.textContent };`,
  );

const waitDialog = (cdp, predicate, label, timeout) => waitSeen(() => dialog(cdp), predicate, `dialog: ${label}`, timeout);
const waitReport = (cdp, predicate, label, timeout) => waitSeen(() => report(cdp), predicate, `report: ${label}`, timeout);

async function openDialog(cdp) {
  const now = await dialog(cdp);
  if (now?.open) return now;
  const button = await waitSeen(() => headerAgent(cdp), (b) => b.ready === "true", "AI control in the inspector header ready");
  await click(cdp, button.x, button.y);
  return waitDialog(cdp, (d) => d.open, "open");
}

async function closeDialog(cdp) {
  if (!(await dialog(cdp))?.open) return;
  const button = await headerAgent(cdp);
  await click(cdp, button.x, button.y);
  await waitDialog(cdp, (d) => !d.open, "closed");
}

/** Which manager element is on top at a page point (the preview frame, when nothing covers it). */
const topAt = (cdp, point) => inManager(cdp, `const e = document.elementFromPoint(${point.x}, ${point.y}); return e ? e.id || e.tagName : null`);

/** Empty the request box the way React sees a person's edit. */
const clearInput = (cdp) =>
  inManager(cdp, `const ta = document.querySelector("[data-code-layer-agent-input]"); if (!ta) return false; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(ta, ""); ta.dispatchEvent(new Event("input", { bubbles: true })); return true`);

async function shiftEnter(cdp) {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8, text: "\r", unmodifiedText: "\r" });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8 });
}

/** Type lines into the request box: text arrives as typed text, line breaks as Shift+Enter. */
async function typeLines(cdp, lines) {
  await clickIn(cdp, "[data-code-layer-agent-input]", "request box");
  // The click put the caret where it landed: type at the end, as a person continuing the text would.
  await inManager(cdp, `const ta = document.querySelector("[data-code-layer-agent-input]"); ta.setSelectionRange(ta.value.length, ta.value.length); return true`);
  const already = (await dialog(cdp)).value ?? "";
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) await shiftEnter(cdp);
    await cdp.send("Input.insertText", { text: lines[i] });
  }
  const expected = already + lines.join("\n");
  await waitDialog(cdp, (d) => d.value === expected, "typed text in the box");
}

/** Open the dialog for the badge, type the lines, press Enter; returns the new run's id. */
async function submit(cdp, lines) {
  await openDialog(cdp);
  await clearInput(cdp);
  await typeLines(cdp, lines);
  const before = (await dialog(cdp)).runId;
  await key(cdp, "Enter");
  const seen = await waitDialog(cdp, (d) => d.runId && d.runId !== before, "a new run");
  noteRun(seen.runId);
  return seen.runId;
}

const runView = (runId) => get(`/agent/runs/${runId}`);
async function waitRunState(runId, states, timeout = 60000) {
  return waitSeen(() => runView(runId), (v) => states.includes(v.state), `run ${runId} in ${states.join("/")}`, timeout);
}

const marker = (name) => `MARK-${name}-${crypto.randomBytes(9).toString("base64url").replace(/[^A-Za-z]/g, "q")}`;
const markers = [];
const mark = (name) => {
  const value = marker(name);
  markers.push(value);
  return value;
};

/** Every response of the agent routes, to prove that none carries what was typed. */
function collectAgentResponses(cdp) {
  const bodies = [];
  const pending = new Set();
  cdp.on("Network.responseReceived", ({ requestId, response }) => {
    if (response.url.includes("/__code-layer/agent/")) pending.add(requestId);
  });
  cdp.on("Network.loadingFinished", async ({ requestId }) => {
    if (!pending.delete(requestId)) return;
    try {
      const body = await cdp.send("Network.getResponseBody", { requestId });
      bodies.push(Buffer.from(body.body, body.base64Encoded ? "base64" : "utf8").toString("utf8"));
    } catch {
      // the page went away before the body could be read
    }
  });
  return bodies;
}

/**
 * The code the dev server printed for a run. Storybook wraps long log lines
 * (with a "│" margin), so only short anchors are searched: the run id, then
 * the last characters of the code line, then six digits.
 */
async function codeFromLog(runId, prefix) {
  const anchor = prefix.trim().slice(-3);
  return waitFor(() => {
    const text = fs.readFileSync(LOG, "utf8");
    const at = text.lastIndexOf(runId);
    const start = text.lastIndexOf(`AI request ${runId}`);
    if (start === -1 || at === -1) return null;
    const tail = text.slice(start);
    const found = tail.indexOf(anchor);
    if (found === -1) return null;
    const code = /^[\s│]*(\d{6})/.exec(tail.slice(found + anchor.length));
    return code ? code[1] : null;
  }, { timeout: 15000, label: `approval code of ${runId} in the Storybook log` });
}

const computedRadius = (cdp) => inPreview(cdp, `return getComputedStyle(d.querySelector(${JSON.stringify(ROOT)})).borderTopLeftRadius`);
/** The radius on the page, with what decides it: the served rule and the live previews. */
const pageRadius = (cdp) =>
  inPreview(
    cdp,
    `const l = w.__CODE_LAYER__.live; const css = [...d.querySelectorAll("style")].map((s) => s.textContent).find((t) => t.includes(".md-badge-seal--hanko"));
     return { radius: getComputedStyle(d.querySelector(${JSON.stringify(ROOT)})).borderTopLeftRadius, served: (css?.match(/border-radius: var\\(--md-sys-shape-corner-[a-z]+\\)/g) ?? []).join(" | "),
       drafts: l.drafts.map((x) => x.id), statuses: JSON.stringify([...(l.statuses ?? [])]).slice(0, 300), previews: typeof l.hasPreviews === "function" ? l.hasPreviews() : null };`,
  );

async function dismissReport(cdp) {
  if (await report(cdp)) {
    await clickAction(cdp, "agent-report-dismiss");
    await waitFor(async () => !(await report(cdp)), { label: "report dismissed" });
  }
}

async function waitPostApply() {
  await waitFor(async () => ((await get("/state")).postApply.running ? null : true), { timeout: 90000, label: "post-apply commands finished" });
}

// ---- the stage ----------------------------------------------------------------------

async function stage(cdp, chrome) {
  const start = governedHashes();
  const { CONFIRM_TEXT } = await addon("server/agent/messages.confirm.mjs");
  const codePrefix = CONFIRM_TEXT["zh-Hant"].code("");
  const bodies = collectAgentResponses(cdp);
  await cdp.send("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"], origin: BASE }).catch(() => undefined);

  await check("A1 when ready, the selection label and the inspector header offer AI; the label's control opens the dialog beside the inspector, and the dialog takes the place of an open row popover", async () => {
    setStub("");
    await loadActive(cdp);
    const trace = await selectRoot(cdp);
    const label = await waitSeen(() => labelAgent(cdp), (b) => !b.hidden, "AI control on the selection label");
    assert.deepEqual([label.text, label.title], ["AI", "請 AI 修改這個元素"]);
    const head = await waitSeen(() => headerAgent(cdp), (b) => b.ready === "true", "header control ready");
    assert.deepEqual([head.disabled, head.pressed, head.title], ["false", "false", "請 AI 修改選取的元素"]);
    assert.equal(await topAt(cdp, label), "storybook-preview-iframe", "nothing of the manager covers the label's control");
    await click(cdp, label.x, label.y);
    const open = await waitDialog(cdp, (d) => d.open, "open from the label");
    assert.equal(open.element, `對象：${trace.label}`);
    const beside = open.rect[0] + open.rect[2] <= open.panel[0] + 1 || open.rect[0] >= open.panel[0] + open.panel[2] - 1;
    assert.ok(beside, `the dialog ${open.rect} is beside the inspector ${open.panel}`);
    assert.match(open.text, /由 Fake runner 執行/);
    assert.match(open.text, /費用算在你自己的帳號/);
    assert.equal(open.unconfirmed, false, "approval is required: no 'unconfirmed' notice");
    assert.equal((await headerAgent(cdp)).pressed, "true");
    await clickAction(cdp, "agent-reference");
    const withReference = await waitDialog(cdp, (d) => d.reference !== null, "object reference shown");
    assert.match(withReference.reference, /^\[Code Layer 物件參照 v\d+\]/);
    assert.match(withReference.reference, /badge-seal/);

    // A row's popover open, then the header control: the dialog takes its place.
    await closeDialog(cdp);
    await clickIn(cdp, '[data-code-layer-row="fill"]', "fill row");
    await waitFor(() => inManager(cdp, `return !!document.querySelector('[data-code-layer-popover="fill"]')`), { label: "fill popover open" });
    const header = await headerAgent(cdp);
    await click(cdp, header.x, header.y);
    const replaced = await waitDialog(cdp, (d) => d.open, "open from the header over a row popover");
    assert.deepEqual(replaced.rowPopovers, [], "the row popover was replaced");
    return `dialog at ${open.rect}, inspector at ${open.panel}`;
  });

  await check("A2 the header control opens and closes the same dialog", async () => {
    await openDialog(cdp);
    const head = await headerAgent(cdp);
    await click(cdp, head.x, head.y);
    await waitDialog(cdp, (d) => !d.open, "closed from the header");
    assert.equal((await headerAgent(cdp)).pressed, "false");
    await click(cdp, head.x, head.y);
    await waitDialog(cdp, (d) => d.open, "open again from the header");
  });

  await check("A3 typing: Shift+Enter breaks the line, M reaches neither Storybook nor the story, Escape keeps the text, and the text is kept per element", async () => {
    const trace = await selectBy(cdp, ROOT);
    await openDialog(cdp);
    await clearInput(cdp);
    await typeLines(cdp, ["first line", "second line"]);
    const measureBefore = await inPreview(cdp, `w.__agentKeys = 0; if (!w.__agentKeysWatched) { w.__agentKeysWatched = true; d.addEventListener("keydown", () => { w.__agentKeys += 1; }, true); } return Boolean(w.__CODE_LAYER__.globals.measureEnabled)`);
    await key(cdp, "M");
    await key(cdp, "m");
    await waitDialog(cdp, (d) => d.value === "first line\nsecond lineMm", "M typed into the box");
    await delayMs(200);
    assert.equal(await inPreview(cdp, `return Boolean(w.__CODE_LAYER__.globals.measureEnabled)`), measureBefore, "M did not toggle measure");
    assert.equal(await inPreview(cdp, `return w.__agentKeys`), 0, "the story received no key");
    assert.equal((await dialog(cdp)).counter, `${"first line\nsecond lineMm".length} / 2000`);
    await key(cdp, "Escape");
    await waitDialog(cdp, (d) => !d.open, "closed with Escape");
    const reopened = await openDialog(cdp);
    assert.equal(reopened.value, "first line\nsecond lineMm", "the text survived closing");
    // The dialog follows the selection; each element has its own text.
    const child = await selectBy(cdp, `${ROOT} > *`);
    const other = await waitDialog(cdp, (d) => d.open && d.element === `對象：${child.label}`, "following the new selection");
    assert.equal(other.value, "", "another element starts empty");
    await typeLines(cdp, ["for the child"]);
    await selectBy(cdp, ROOT);
    const back = await waitDialog(cdp, (d) => d.element === `對象：${trace.label}`, "back on the badge");
    assert.equal(back.value, "first line\nsecond lineMm");
    await selectBy(cdp, `${ROOT} > *`);
    await waitDialog(cdp, (d) => d.value === "for the child", "the child's text");
    await clearInput(cdp);
    await selectBy(cdp, ROOT);
    await clearInput(cdp);
  });

  await check("A4 an empty or blank request cannot be sent", async () => {
    await selectBy(cdp, ROOT);
    await openDialog(cdp);
    await clearInput(cdp);
    assert.equal((await dialog(cdp)).submit.disabled, true);
    await typeLines(cdp, ["   "]);
    assert.equal((await dialog(cdp)).submit.disabled, true);
    await key(cdp, "Enter");
    await delayMs(500);
    const status = await get("/agent/status");
    assert.equal(status.activeRunId, null, "nothing was submitted");
    assert.equal((await dialog(cdp)).runId, null);
    await clearInput(cdp);
  });

  await check("A5 when runs are not ready the label has no AI control and the header control is disabled with the reason as its tooltip", async () => {
    const { RUNNER_FILE } = await addon("server/agent/runners.mjs");
    const runners = path.join(STATE_DIR(), RUNNER_FILE);
    const aside = path.join(TEST_DIR(), "agent-runners.aside.json");
    fs.renameSync(runners, aside);
    try {
      const head = await waitSeen(() => headerAgent(cdp), (b) => b.ready === "false", "header control not ready", 15000);
      assert.equal(head.disabled, "true");
      assert.equal(head.title, "AI 修改目前不能用：還沒有設定要用哪個 AI 命令列工具。");
      await waitSeen(() => labelAgent(cdp), (b) => b.hidden, "no AI control on the label");
      const shown = await waitDialog(cdp, (d) => d.unavailable !== null, "the dialog says why");
      assert.equal(shown.submit.disabled, true);
    } finally {
      fs.renameSync(aside, runners);
    }
    await waitSeen(() => headerAgent(cdp), (b) => b.ready === "true", "ready again", 15000);
    await waitSeen(() => labelAgent(cdp), (b) => !b.hidden, "the label's AI control is back");
  });

  await check("A6 in an English interface the entry points and the dialog are in English", async () => {
    const previous = process.env.CODE_LAYER_TEST_LANG;
    process.env.CODE_LAYER_TEST_LANG = "en";
    const english = await launchChrome({ port: chrome.port + 1, headless: !headed });
    try {
      const page = await openPage(english.port, "about:blank");
      try {
        await loadActive(page);
        await selectRoot(page);
        const label = await waitSeen(() => labelAgent(page), (b) => !b.hidden, "AI control on the label");
        assert.equal(label.title, "Ask AI to change this element");
        const head = await waitSeen(() => headerAgent(page), (b) => b.ready === "true", "header control ready");
        assert.equal(head.title, "Ask AI to change the selected element");
        await click(page, head.x, head.y);
        const open = await waitDialog(page, (d) => d.open, "open");
        assert.match(open.head, /^Ask AI/);
        assert.equal(open.submit.text, "Send");
        assert.match(open.text, /Runs with Fake runner/);
        assert.match(open.text, /billed to your own account/);
        assert.equal(open.placeholder.startsWith("What should change?"), true);
        assert.ok(!/[　-鿿]/.test(open.text), `no Chinese text in the English dialog: ${open.text}`);
      } finally {
        page.close();
      }
    } finally {
      await english.close();
      if (previous === undefined) delete process.env.CODE_LAYER_TEST_LANG;
      else process.env.CODE_LAYER_TEST_LANG = previous;
    }
  });

  await check("A7 a request waits for approval outside the page; a denial is shown as such, the text is still there to send again, and nothing was copied or run", async () => {
    setStub("");
    await selectBy(cdp, ROOT);
    const text = mark("deny");
    const runId = await submit(cdp, [text, "please make the corners rounder"]);
    const waiting = await waitDialog(cdp, (d) => d.runState === "awaiting-confirmation", "awaiting approval");
    assert.equal(waiting.confirm, "native");
    assert.equal(waiting.code, false, "no code field when a dialog asks");
    assert.match(waiting.text, /按「允許」/);
    assert.equal(waiting.shownText, `${text}\nplease make the corners rounder`);
    assert.equal((await get("/agent/status")).activeRunId, runId);
    setStub("deny");
    await waitRunState(runId, ["denied"], 10000);
    const denied = await waitDialog(cdp, (d) => d.runState === "denied", "denied");
    assert.equal(denied.stateText, "沒有得到確認");
    assert.equal(denied.value, `${text}\nplease make the corners rounder`, "the request is still in the box");
    assert.equal(denied.submit.disabled, false, "it can be sent again");
    const shown = await waitReport(cdp, (r) => r.state === "denied", "denied");
    assert.deepEqual(shown.reasons.map(([code]) => code), ["confirmation-denied"]);
    assert.equal(shown.unchanged, "專案沒有任何改變。");
    assert.ok(!fs.existsSync(path.join(STATE_DIR(), "agent", runId, "work")), "no work copy was made");
    setStub("");
    await dismissReport(cdp);
    await clearInput(cdp);
  });

  await check("A8 without a dialog the code mode asks for the terminal's code; progress (state, time, text, cancel) survives a reload; apply is off while it runs; cancel leaves the project as it was", async () => {
    const hashes = governedHashes();
    await selectBy(cdp, ROOT);
    // A staged change, to see the apply button turned off while the agent works.
    await closeDialog(cdp);
    await clickIn(cdp, '[data-code-layer-row="radius"]', "radius row");
    await waitFor(() => managerRect(cdp, '[data-code-layer-picker="radius"]'), { label: "radius picker" });
    await waitFor(() => inManager(cdp, `return document.querySelector('[data-code-layer-picker="radius"]')?.getAttribute("data-probe") === "confirmed"`), { label: "probe confirmed" });
    await cdp.send("Input.insertText", { text: "corner-md" });
    await delayMs(400);
    await clickIn(cdp, '[data-code-layer-picker="radius"] [data-token="--md-sys-shape-corner-md"]', "corner-md option");
    await waitFor(() => inManager(cdp, `return document.querySelectorAll("[data-code-layer-draft]").length === 1`), { label: "one staged change" });
    await key(cdp, "Escape");
    const applyBefore = await inManager(cdp, `const b = document.querySelector('[data-code-layer-action="apply"]'); return { disabled: b.disabled, title: b.title }`);
    assert.equal(applyBefore.disabled, false, "apply is available before the run");

    setStub("native-fail");
    const text = mark("code");
    const runId = await submit(cdp, [text, "@hang"]);
    const asked = await waitDialog(cdp, (d) => d.confirm === "code", "asking for the code");
    assert.equal(asked.code, true);
    assert.match(asked.text, /確認視窗無法顯示，改用確認碼/);
    setStub("");
    const code = await codeFromLog(runId, codePrefix);
    const wrong = String((Number(code) + 1) % 1000000).padStart(6, "0");
    await clickIn(cdp, "[data-code-layer-agent-code]", "code field");
    await cdp.send("Input.insertText", { text: wrong });
    await clickAction(cdp, "agent-code");
    await waitDialog(cdp, (d) => /還可以試 2 次/.test(d.text), "a wrong code is refused");
    await inManager(cdp, `const i = document.querySelector("[data-code-layer-agent-code]"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true })); return true`);
    await clickIn(cdp, "[data-code-layer-agent-code]", "code field");
    await cdp.send("Input.insertText", { text: code });
    await clickAction(cdp, "agent-code");
    await waitRunState(runId, ["running"], 30000);
    const applyDuring = await waitSeen(() => inManager(cdp, `const b = document.querySelector('[data-code-layer-action="apply"]'); return b ? { disabled: b.disabled, title: b.title } : null`), (b) => b.disabled, "apply turned off");
    assert.equal(applyDuring.title, "AI 正在修改專案；結束之前不能套用、還原、略過或同步鏡像。");

    await cdp.send("Page.reload");
    await afterLoad(cdp);
    const after = await waitReport(cdp, (r) => r.state === "running" && r.elapsed !== null, "running after the reload", 30000);
    assert.equal(after.text, `${text}\n@hang`, "the page kept the request text");
    assert.ok(after.actions.includes("agent-report-cancel"), "cancel is offered");
    assert.match(after.all, /Fake runner/);
    const later = await waitReport(cdp, (r) => Number(r.elapsed) > Number(after.elapsed), "the elapsed time moves", 5000);
    await clickAction(cdp, "agent-report-cancel");
    await waitRunState(runId, ["cancelled"], 20000);
    const cancelled = await waitReport(cdp, (r) => r.state === "cancelled", "cancelled");
    assert.equal(cancelled.unchanged, "專案沒有任何改變。");
    assert.ok(!fs.existsSync(path.join(STATE_DIR(), "agent", runId, "work")), "the work copy is gone");
    assert.deepEqual(governedHashes(), hashes, "the project is as it was");
    await dismissReport(cdp);
    await clickAction(cdp, "discard");
    await waitFor(() => inManager(cdp, `return document.querySelectorAll("[data-code-layer-draft]").length === 0`), { label: "staged change discarded" });
    // The page drops it too, although it was restored by the reload while the agent worked.
    await waitSeen(() => pageRadius(cdp), (seen) => seen.drafts.length === 0 && seen.previews === false && seen.radius === "4px", "the discarded change is gone from the page");
    return `elapsed ${after.elapsed} s → ${later.elapsed} s`;
  });

  await check("A9 an imported result shows the agent's words as text, the changed file and lines, the rows that changed; undo puts every byte and the page back", async () => {
    setStub("approve");
    const before = fs.readFileSync(BADGE_CSS);
    // A preview discarded just before is removed a moment later: measure the page without any.
    const startSeen = await waitSeen(() => pageRadius(cdp), (seen) => seen.previews === false && /corner-sm/.test(seen.served), "the page without previews");
    const radiusBefore = startSeen.radius;
    await selectBy(cdp, ROOT);
    const text = mark("import");
    const runId = await submit(cdp, [
      `${text} make the corners one step rounder`,
      `@edit ${BADGE_CSS_REL} "border-radius: var(--md-sys-shape-corner-sm);" "border-radius: var(--md-sys-shape-corner-md);"`,
      '@result done "Rounder corners <b>now</b>"',
    ]);
    const view = await waitRunState(runId, ["imported", "rejected", "failed"], 90000);
    assert.equal(view.state, "imported", JSON.stringify(view.reasons));
    ownImports.push(view.applyId);
    const shown = await waitReport(cdp, (r) => r.state === "imported" && r.rows.length > 0, "imported with changed rows", 30000);
    assert.deepEqual(shown.summary, { text: "Rounder corners <b>now</b>", elements: 0 }, "the agent's words are text, not markup");
    assert.deepEqual(shown.files.map(([file]) => file), [BADGE_CSS_REL]);
    assert.match(shown.files[0][1], /\+1 −1/);
    assert.ok(shown.rows.some(([, line]) => /4px → 8px/.test(line)), JSON.stringify(shown.rows));
    assert.ok(shown.actions.includes("agent-revert"));
    assert.equal(await inManager(cdp, `return !!document.querySelector('[data-code-layer-action="reverse"]')`), false, "no reverse apply for an import");
    const lines = (buffer) => buffer.toString("utf8").split("\n");
    const now = lines(fs.readFileSync(BADGE_CSS));
    const changed = lines(before).flatMap((line, i) => (line === now[i] ? [] : [i + 1]));
    assert.equal(changed.length, 1, `one line changed: ${changed}`);
    await waitFor(async () => (await computedRadius(cdp)) === "8px", { label: "the page shows the new radius" });
    const importedSeen = await pageRadius(cdp);
    const top = (await get("/state")).undoStack.at(-1);
    assert.deepEqual([top.applyId, top.kind], [view.applyId, "agent-import"]);

    await waitPostApply();
    await clickAction(cdp, "agent-revert");
    await waitReport(cdp, (r) => r.headline === "已還原 AI 的修改", "reverted");
    assert.ok(fs.readFileSync(BADGE_CSS).equals(before), "every byte is back");
    const revertedSeen = await waitSeen(() => pageRadius(cdp), (seen) => /corner-sm/.test(seen.served) && !/corner-md/.test(seen.served) && seen.radius === radiusBefore, `the page serves and shows the old rule (${JSON.stringify(startSeen)}; after the import ${JSON.stringify(importedSeen)})`);
    ownImports.pop();
    await waitPostApply();
    await dismissReport(cdp);
    const after = await dialog(cdp);
    assert.equal(after.value ?? "", "", "a request that was carried out leaves an empty box");
    return [startSeen, importedSeen, revertedSeen].map((seen) => `${seen.radius} [${seen.served}; previews ${seen.previews}]`).join(" → ");
  });

  await check("A10 a rejected result names the created file, says the project did not change and offers the object reference", async () => {
    setStub("approve");
    await selectBy(cdp, ROOT);
    const text = mark("reject");
    const extra = "storybook/src/components/badge-seal/Extra.css";
    const runId = await submit(cdp, [text, `@create ${extra} ".x{}"`]);
    await waitRunState(runId, ["rejected", "failed", "imported"], 90000);
    const shown = await waitReport(cdp, (r) => r.state === "rejected", "rejected");
    assert.deepEqual(shown.reasons.map(([code]) => code), ["file-created"]);
    assert.match(shown.reasons[0][1], /Extra\.css/);
    assert.equal(shown.unchanged, "專案沒有任何改變。");
    assert.ok(!fs.existsSync(path.join(LAB_ROOT, extra)), "the file is not in the project");
    await clickAction(cdp, "agent-copy-reference");
    await waitFor(() => inManager(cdp, `return document.querySelector('[data-code-layer-action="agent-copy-reference"]').textContent === "已複製"`), { label: "reference copied" });
    const still = await openDialog(cdp);
    assert.equal(still.value, `${text}\n@create ${extra} ".x{}"`, "the request is still in the box");
    await dismissReport(cdp);
    await clearInput(cdp);
  });

  await check("A11 a question is shown as text; the answer starts a new run that waits for approval and carries the request, the question and the answer; the gate still refuses a new token", async () => {
    setStub("approve");
    await selectBy(cdp, ROOT);
    const text = mark("ask");
    const first = await submit(cdp, [text, '@result needs-decision "Need a new token" "May I add <i>--md-comp-x</i>?"']);
    await waitRunState(first, ["needs-decision"], 90000);
    const asking = await waitDialog(cdp, (d) => d.open && d.question !== null, "the question");
    assert.deepEqual(asking.question, { text: "May I add <i>--md-comp-x</i>?", elements: 0 });
    assert.match(asking.head, /^回答 AI 的問題/);
    assert.equal(asking.value, "", "an empty box for the answer");
    assert.equal(asking.submit.text, "送出回答");
    const shown = await waitReport(cdp, (r) => r.state === "needs-decision", "needs a decision");
    assert.equal(shown.question, "May I add <i>--md-comp-x</i>?");
    assert.ok(shown.actions.includes("agent-answer"));

    setStub("");
    const answer = mark("answer");
    await typeLines(cdp, [`${answer} yes, add it`, '@append tokens/tokens-comp.css "\\n:root { --md-comp-test-agent-x: 1px; }\\n"']);
    await key(cdp, "Enter");
    const followUp = await waitSeen(() => get("/agent/status"), (s) => s.activeRunId && s.activeRunId !== first, "a new run");
    const second = followUp.activeRunId;
    noteRun(second);
    await waitRunState(second, ["awaiting-confirmation"], 10000);
    const composed = fs.readFileSync(path.join(STATE_DIR(), "agent", second, "request.txt"), "utf8");
    const at = [text, "May I add <i>--md-comp-x</i>?", answer].map((part) => composed.indexOf(part));
    assert.ok(at.every((i) => i >= 0) && at[0] < at[1] && at[1] < at[2], `request, question and answer in order: ${at}`);
    setStub("approve");
    const view = await waitRunState(second, ["rejected", "failed", "imported"], 90000);
    assert.equal(view.state, "rejected");
    assert.deepEqual(view.reasons.map((r) => [r.code, r.path]), [["token-set-changed", "tokens/tokens-comp.css"]]);
    await waitReport(cdp, (r) => r.state === "rejected" && r.runId === second, "the follow-up rejected");
    await dismissReport(cdp);
    await clearInput(cdp);
  });

  await check("A12 what was typed appears in no agent response, no journal record and no run state, and request.txt is private", async () => {
    await delayMs(1500);
    assert.ok(bodies.length > 10, `agent responses seen: ${bodies.length}`);
    for (const value of markers) {
      assert.ok(!bodies.some((body) => body.includes(value)), `a response carried ${value}`);
      assert.ok(!fs.readFileSync(path.join(STATE_DIR(), "journal.jsonl"), "utf8").includes(value), `the journal carries ${value}`);
    }
    for (const runId of runsMade) {
      const dir = path.join(STATE_DIR(), "agent", runId);
      if (!fs.existsSync(dir)) continue;
      const state = fs.readFileSync(path.join(dir, "state.json"), "utf8");
      for (const value of markers) assert.ok(!state.includes(value), `state.json of ${runId} carries ${value}`);
      assert.equal(fs.statSync(path.join(dir, "request.txt")).mode & 0o777, 0o600);
      assert.ok(!fs.existsSync(path.join(dir, "work")), `the work copy of ${runId} is gone`);
    }
    return `${bodies.length} responses, ${runsMade.size} runs`;
  });

  await check("A13 the stage left the project as it found it", async () => {
    await waitPostApply();
    assert.deepEqual(governedHashes(), start);
    const state = await get("/state");
    assert.deepEqual(state.undoStack.map((e) => e.applyId).filter((id) => !protectedApplies.has(id)), []);
    assert.deepEqual(state.pendingDocs.filter((e) => !protectedApplies.has(e.applyId)), [], "no pending documentation entries of the checks");
    assert.equal((await get("/agent/status")).activeRunId, null);
    return `${Object.keys(start).length} governed files unchanged`;
  });
}

async function cleanup() {
  const status = await get("/agent/status").catch(() => null);
  if (status?.activeRunId) {
    await post(`/agent/runs/${status.activeRunId}/cancel`, {});
    await waitFor(async () => ((await get("/agent/status")).activeRunId ? null : true), { timeout: 20000, label: "no active run" }).catch(() => undefined);
  }
  const undone = [];
  for (const applyId of [...ownImports].reverse()) {
    const top = (await get("/state")).undoStack.at(-1);
    if (!top || top.applyId !== applyId || protectedApplies.has(applyId)) break;
    const response = await post("/undo", { applyId });
    undone.push(`${applyId}:${response.status}`);
  }
  if (undone.length) process.stdout.write(`(cleanup: undone through the API: ${undone.join(", ")})\n`);
  setStub("");
}

async function main() {
  if (args.includes("--setup")) return setup();
  if (args.includes("--teardown")) return teardown();
  assert.ok(LOG && fs.existsSync(LOG), "--log <the Storybook log> is required (the approval code is read from it)");
  assert.ok(fs.existsSync(STUB()), "run --setup first and start Storybook with CODE_LAYER_TEST_CONFIRM");
  assert.match(fs.readFileSync(LOG, "utf8"), /test confirmation stub is active/, "Storybook was not started with CODE_LAYER_TEST_CONFIRM");
  const status = await get("/agent/status");
  assert.ok(status.ready, `agent runs are not ready: ${JSON.stringify(status.reasons)}`);
  assert.deepEqual([status.runners.map((r) => r.label), status.confirm.mode], [["Fake runner"], "native-dialog"]);
  for (const entry of (await get("/state")).undoStack) protectedApplies.add(entry.applyId);
  if (protectedApplies.size > 0) process.stdout.write(`(the project has ${protectedApplies.size} apply(ies) of its own on the undo stack; left as they are)\n`);
  for (const runId of JSON.parse(fs.readFileSync(RUNS_MADE(), "utf8"))) runsMade.add(runId);
  const generated = DOC_FILES.filter((file) => fs.existsSync(file)).map((file) => ({ file, bytes: fs.readFileSync(file) }));
  const chrome = await launchChrome({ headless: !headed });
  const cdp = await openPage(chrome.port, "about:blank");
  activePage = cdp;
  try {
    await stage(cdp, chrome);
  } finally {
    cdp.close();
    await chrome.close();
    await cleanup().catch((error) => process.stdout.write(`(cleanup failed: ${error.message})\n`));
    await waitPostApply().catch(() => undefined);
    for (const { file, bytes } of generated) {
      const now = fs.readFileSync(file);
      if (now.equals(bytes)) continue;
      if (withoutStamp(now.toString("utf8")) === withoutStamp(bytes.toString("utf8"))) fs.writeFileSync(file, bytes);
      else process.stdout.write(`(warning: ${path.relative(LAB_ROOT, file)} differs from the start of the run in more than its date; left as it is)\n`);
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
