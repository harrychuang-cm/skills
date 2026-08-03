#!/usr/bin/env node

// Renders the status object produced by build-pipeline-status.mjs into ONE
// self-contained HTML page. The page carries its own CSS inline and references
// no external resource of any kind, so it renders identically over file:// with
// the network switched off.
//
// Two properties are load-bearing here and are enforced in code, not by habit:
//
// 1. Sanitization. Everything drawn on the page passes through an explicit
//    allowlist projection (sanitizeStatus). Only stage identities, titles,
//    project-relative paths, states, reasons, counts, runner id/label, and
//    timestamps survive it. A field an upstream version adds later -- a prompt,
//    captured agent output, an environment value, an access code -- cannot
//    reach the page by accident, because nothing outside the allowlist is read.
//
// 2. Self-containment. assertSelfContained scans the finished markup for any
//    external reference and refuses to write the file if one appears.
//
// The board is a report. It starts nothing, and it never animates: the durable
// run record does not move while an agent works, so a moving indicator here
// would be an invented claim.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA_VERSION = 1;

export class RenderError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function fail(code, message) {
  throw new RenderError(code, message);
}

export function parseArgs(argv) {
  const options = {};
  const allowed = new Set(["--status", "--out"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!allowed.has(token)) fail("unknown-option", `Unknown option: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail("missing-option-value", `Missing value for ${token}`);
    if (token === "--status") options.status = value;
    if (token === "--out") options.out = value;
    index += 1;
  }
  if (!options.status) fail("missing-status", "--status is required");
  if (!options.out) fail("missing-out", "--out is required");
  return options;
}

// Naming is the product here. The board must never call produced files verified,
// and must never soften a stale handoff into a satisfied one, so every label the
// page can print is written down once in these tables.
const STAGE_STATE_LABELS = {
  "not-started": "尚未開始",
  produced: "檔案已產出",
  verified: "已驗證",
};
const UNVERIFIED_LABEL = "尚未驗證";
const EDGE_STATE_LABELS = {
  satisfied: "已銜接",
  blocked: "未銜接",
  stale: "已過期",
};
const RUN_PHASE_LABELS = {
  "possibly-stopped": "可能已停止，請確認",
  running: "執行中",
  "in-progress": "執行中",
  queued: "排隊中",
  completed: "已完成",
  failed: "執行失敗",
  cancelled: "已取消",
  "timed-out": "已逾時",
};
const RUN_OUTCOME_LABELS = {
  succeeded: "成功",
  failed: "失敗",
  unavailable: "無法使用",
  skipped: "略過",
  timeout: "逾時",
  "timed-out": "逾時",
  error: "錯誤",
};
const STAGE_STATE_TONES = {
  "not-started": "idle",
  produced: "warn",
  verified: "ok",
};
const EDGE_STATE_TONES = {
  satisfied: "ok",
  blocked: "stop",
  stale: "warn",
};
const RUN_PHASE_TONES = {
  "possibly-stopped": "stop",
  failed: "stop",
  cancelled: "stop",
  "timed-out": "stop",
  completed: "ok",
  running: "warn",
  "in-progress": "warn",
  queued: "idle",
};

function label(table, value) {
  return table[value] ?? (typeof value === "string" && value ? value : "");
}

function tone(table, value) {
  return table[value] ?? "idle";
}

// ---------------------------------------------------------------------------
// Allowlist projection
// ---------------------------------------------------------------------------

function text(value) {
  return typeof value === "string" ? value : "";
}

function counted(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function optionalCount(value) {
  return Number.isInteger(value) ? value : null;
}

// A path that is not project-relative would publish a filesystem location the
// board has no business disclosing. build-pipeline-status.mjs already rejects
// those, so reaching one here means the status file was hand-edited: refuse
// rather than quietly print it.
function relativePath(value, field) {
  const raw = text(value);
  if (!raw.trim()) fail("invalid-status", `${field} must be a non-empty string`);
  if (path.isAbsolute(raw) || raw.startsWith("~") || /^[A-Za-z]:[\\/]/.test(raw)) {
    fail("absolute-path", `${field} must be project-relative: ${raw}`);
  }
  return raw;
}

function sanitizeRun(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const verification = typeof raw.verification === "object" && raw.verification !== null
    ? raw.verification
    : {};
  return {
    phase: text(raw.phase),
    runId: text(raw.runId),
    startedAt: text(raw.startedAt),
    updatedAt: text(raw.updatedAt),
    finishedAt: text(raw.finishedAt),
    selectedRunner:
      typeof raw.selectedRunner === "object" && raw.selectedRunner !== null
        ? { id: text(raw.selectedRunner.id), label: text(raw.selectedRunner.label) }
        : null,
    fallback: (Array.isArray(raw.fallback) ? raw.fallback : []).map((attempt) => ({
      runnerId: text(attempt?.runnerId),
      outcome: text(attempt?.outcome),
    })),
    verification: {
      configured: counted(verification.configured),
      passed: counted(verification.passed),
      failed: counted(verification.failed),
      notRun: counted(verification.notRun),
    },
  };
}

export function sanitizeStatus(raw) {
  if (typeof raw !== "object" || raw === null) {
    fail("invalid-status", "Status file must contain an object");
  }
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    fail("unsupported-schema-version", `Status schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (!Array.isArray(raw.stages) || !raw.stages.length) {
    fail("invalid-status", "Status must contain a non-empty stages[]");
  }

  // Only the final path segment is carried forward. The absolute project root is
  // deliberately dropped so the page can be handed to anyone without publishing
  // where the project lives on someone's disk.
  const projectName = path.basename(text(raw.projectRoot));

  return {
    projectName,
    generatedAt: text(raw.generatedAt),
    sources: (Array.isArray(raw.sources) ? raw.sources : []).map((source) => ({
      id: text(source?.id),
      title: text(source?.title),
      present: source?.present === true,
    })),
    acceptedSourceKinds: (Array.isArray(raw.acceptedSourceKinds) ? raw.acceptedSourceKinds : [])
      .map((kind) => text(kind))
      .filter(Boolean),
    stages: raw.stages.map((stage, index) => ({
      id: text(stage?.id),
      title: text(stage?.title),
      state: text(stage?.state),
      verified: stage?.verified === true,
      auditConfigured: stage?.auditConfigured === true,
      produced: (Array.isArray(stage?.produced) ? stage.produced : []).map((entry, position) => ({
        path: relativePath(entry?.path, `stages[${index}].produced[${position}].path`),
        modifiedAt: text(entry?.modifiedAt),
      })),
      missing: (Array.isArray(stage?.missing) ? stage.missing : []).map((entry, position) =>
        relativePath(entry, `stages[${index}].missing[${position}]`),
      ),
      pendingDecisions: optionalCount(stage?.pendingDecisions),
      run: sanitizeRun(stage?.run),
    })),
    edges: (Array.isArray(raw.edges) ? raw.edges : []).map((edge, index) => ({
      from: text(edge?.from),
      to: text(edge?.to),
      artifact: relativePath(edge?.artifact, `edges[${index}].artifact`),
      state: text(edge?.state),
      reason: text(edge?.reason),
    })),
    hasRunData: raw.hasRunData === true,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

// Rendered in UTC on purpose: the file is a durable record that may be read on
// another machine, and a locale-dependent string would make two readers of the
// same board disagree about when the evidence was taken.
function formatStamp(value) {
  const raw = text(value);
  if (!raw) return "";
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return raw;
  return `${new Date(parsed).toISOString().replace("T", " ").replace(/\.\d+Z$/, "")} UTC`;
}

function badge(labelText, toneName) {
  if (!labelText) return "";
  return `<span class="badge tone-${escapeAttr(toneName)}">${escapeHtml(labelText)}</span>`;
}

function pathList(items) {
  return `<ul class="paths">${items
    .map((item) => `<li><code>${escapeHtml(item.path)}</code>${
      item.note ? `<span class="path-note">${escapeHtml(item.note)}</span>` : ""
    }</li>`)
    .join("")}</ul>`;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function renderSources(status) {
  const present = status.sources.filter((source) => source.present);
  const absent = status.sources.filter((source) => !source.present);

  if (!present.length) {
    const kinds = status.acceptedSourceKinds.length
      ? status.acceptedSourceKinds
      : status.sources.map((source) => source.title).filter(Boolean);
    return `<section class="section" id="sources">
      <h2>來源</h2>
      <p class="empty">目前還沒有任何來源。這條流程還沒有可以開始的素材。</p>
      <p class="section-lead">可接受的來源類型：</p>
      ${
        kinds.length
          ? `<ul class="chips">${kinds.map((kind) => `<li class="chip">${escapeHtml(kind)}</li>`).join("")}</ul>`
          : `<p class="empty">這份流程定義沒有宣告任何來源類型。</p>`
      }
    </section>`;
  }

  return `<section class="section" id="sources">
    <h2>來源</h2>
    <p class="section-lead">以下來源已經在專案裡找到：</p>
    <ul class="chips">${present
      .map((source) => `<li class="chip chip-ok">${escapeHtml(source.title)}</li>`)
      .join("")}</ul>
    ${
      absent.length
        ? `<p class="section-lead muted">尚未偵測到：</p>
           <ul class="chips">${absent
             .map((source) => `<li class="chip chip-idle">${escapeHtml(source.title)}</li>`)
             .join("")}</ul>`
        : ""
    }
  </section>`;
}

function renderVerification(verification) {
  if (!verification.configured) {
    return `<p class="run-line">驗證：這個階段沒有設定驗證項目。</p>`;
  }
  return `<p class="run-line">驗證：共設定 ${verification.configured} 項，通過 ${verification.passed} 項、失敗 ${verification.failed} 項、未執行 ${verification.notRun} 項。</p>`;
}

function renderRun(run) {
  const phaseLabel = label(RUN_PHASE_LABELS, run.phase);
  const stamps = [
    ["開始", run.startedAt],
    ["最後更新", run.updatedAt],
    ["結束", run.finishedAt],
  ].filter(([, value]) => text(value));

  return `<div class="run">
    <div class="run-head">
      <span class="run-title">執行紀錄</span>
      ${badge(phaseLabel, tone(RUN_PHASE_TONES, run.phase))}
    </div>
    ${run.runId ? `<p class="run-line">執行編號：<code>${escapeHtml(run.runId)}</code></p>` : ""}
    <p class="run-line">執行者：${
      run.selectedRunner
        ? `${escapeHtml(run.selectedRunner.label || run.selectedRunner.id)}${
            run.selectedRunner.id && run.selectedRunner.label
              ? `（<code>${escapeHtml(run.selectedRunner.id)}</code>）`
              : ""
          }`
        : "沒有紀錄"
    }</p>
    ${
      stamps.length
        ? `<ul class="stamps">${stamps
            .map(([name, value]) => `<li><span>${escapeHtml(name)}</span><code>${escapeHtml(formatStamp(value))}</code></li>`)
            .join("")}</ul>`
        : ""
    }
    ${
      run.fallback.length
        ? `<p class="run-line">備援嘗試：</p>
           <ul class="paths">${run.fallback
             .map(
               (attempt) =>
                 `<li><code>${escapeHtml(attempt.runnerId || "未知執行者")}</code><span class="path-note">${escapeHtml(
                   label(RUN_OUTCOME_LABELS, attempt.outcome) || "沒有紀錄",
                 )}</span></li>`,
             )
             .join("")}</ul>`
        : ""
    }
    ${renderVerification(run.verification)}
  </div>`;
}

function renderStage(stage) {
  const stateLabel = label(STAGE_STATE_LABELS, stage.state);
  // A stage with an audit configured that has not passed it must say so out
  // loud. Produced files are not evidence of correctness.
  const showUnverified = stage.state === "produced" && stage.auditConfigured && !stage.verified;

  return `<article class="stage" id="stage-${escapeAttr(stage.id)}">
    <header class="stage-head">
      <div class="stage-title">
        <h3>${escapeHtml(stage.title)}</h3>
        <code class="stage-id">${escapeHtml(stage.id)}</code>
      </div>
      <div class="badges">
        ${badge(stateLabel, tone(STAGE_STATE_TONES, stage.state))}
        ${showUnverified ? badge(UNVERIFIED_LABEL, "warn") : ""}
      </div>
    </header>
    <div class="stage-body">
      <div class="block">
        <span class="label">已產出的檔案</span>
        ${
          stage.produced.length
            ? pathList(
                stage.produced.map((entry) => ({
                  path: entry.path,
                  note: formatStamp(entry.modifiedAt),
                })),
              )
            : `<p class="empty">還沒有任何檔案。</p>`
        }
      </div>
      <div class="block">
        <span class="label">還沒有的檔案</span>
        ${
          stage.missing.length
            ? pathList(stage.missing.map((entry) => ({ path: entry, note: "" })))
            : `<p class="empty">宣告的檔案都在了。</p>`
        }
      </div>
      ${
        stage.pendingDecisions !== null
          ? `<div class="block">
               <span class="label">等待設計決定</span>
               <p class="decisions">${stage.pendingDecisions} 項</p>
             </div>`
          : ""
      }
    </div>
    ${stage.run ? renderRun(stage.run) : ""}
  </article>`;
}

function renderEdges(status, titleById) {
  if (!status.edges.length) {
    return `<section class="section" id="handoffs">
      <h2>階段之間的銜接</h2>
      <p class="empty">這份流程定義沒有宣告任何銜接。</p>
    </section>`;
  }

  return `<section class="section" id="handoffs">
    <h2>階段之間的銜接</h2>
    <ul class="edges">${status.edges
      .map((edge) => {
        const fromTitle = titleById.get(edge.from) || edge.from;
        const toTitle = titleById.get(edge.to) || edge.to;
        return `<li class="edge">
          <div class="edge-head">
            <span class="edge-route">${escapeHtml(fromTitle)} → ${escapeHtml(toTitle)}</span>
            ${badge(label(EDGE_STATE_LABELS, edge.state), tone(EDGE_STATE_TONES, edge.state))}
          </div>
          <code class="edge-artifact">${escapeHtml(edge.artifact)}</code>
          ${edge.reason ? `<p class="edge-reason">${escapeHtml(edge.reason)}</p>` : ""}
        </li>`;
      })
      .join("")}</ul>
  </section>`;
}

// No @keyframes, no transition, no progress bar. The durable record does not
// move while an agent works, so nothing on this page may appear to.
//
// One fixed dark console theme on screen — the board reads as an instrument
// panel, not a document. Print flips to light and drops the sidebar.
function css() {
  return `
    :root {
      color-scheme: dark;
      --bg: #0e1116;
      --rail: #0b0e12;
      --surface: #151a21;
      --surface-subtle: #1b222b;
      --text: #e8ecf1;
      --muted: #8b95a1;
      --border: #2a323d;
      --border-strong: #3b4551;
      --ok: #4ade80;
      --ok-soft: #12291b;
      --warn: #f0b35f;
      --warn-soft: #2d2214;
      --stop: #f47c6a;
      --stop-soft: #2e1a17;
      --idle: #8b95a1;
      --idle-soft: #1d242d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
      line-height: 1.55;
      font-size: 14px;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.92em;
      overflow-wrap: anywhere;
    }
    .app-shell {
      display: grid;
      grid-template-columns: 232px minmax(0, 1fr);
      min-height: 100vh;
    }
    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      overflow: auto;
      background: var(--rail);
      border-right: 1px solid var(--border);
      padding: 18px 14px;
    }
    .brand {
      margin: 0 0 2px;
      font-size: 0.72rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .brand-sub { margin: 0 0 18px; font-weight: 700; font-size: 0.95rem; }
    .side-label {
      margin: 16px 0 6px;
      font-size: 0.7rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .side-nav { display: flex; flex-direction: column; gap: 2px; }
    .side-nav a {
      display: block;
      padding: 6px 10px;
      border-radius: 7px;
      color: var(--text);
      text-decoration: none;
      font-size: 0.9rem;
    }
    .side-nav a:hover { background: var(--surface-subtle); }
    .legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .legend li { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: var(--muted); }
    .dot { width: 9px; height: 9px; border-radius: 999px; flex: none; }
    .dot-ok { background: var(--ok); }
    .dot-warn { background: var(--warn); }
    .dot-stop { background: var(--stop); }
    .dot-idle { background: var(--idle); }
    .workspace { min-width: 0; display: flex; flex-direction: column; }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 3;
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 12px;
      padding: 14px 22px;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .topbar h1 { margin: 0; font-size: 1.05rem; }
    .topbar-meta { color: var(--muted); font-size: 0.85rem; }
    .panels { padding: 18px 22px 56px; display: flex; flex-direction: column; gap: 18px; }
    .panel, .section, .notice {
      margin: 0;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      padding: 16px 18px;
    }
    .section h2, .panel h2 {
      margin: 0 0 10px;
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
    }
    .notice { background: var(--surface-subtle); border-color: var(--border-strong); }
    .notice h2 { margin: 0 0 8px; font-size: 0.95rem; color: var(--text); text-transform: none; letter-spacing: 0; border: 0; padding: 0; }
    .notice p { margin: 0 0 6px; font-size: 0.88rem; color: var(--muted); }
    .notice p:last-child { margin-bottom: 0; }
    .flow-scroll { overflow-x: auto; }
    .flow-canvas { position: relative; }
    .flow-canvas svg { position: absolute; inset: 0; }
    .flow-node {
      position: absolute;
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 10px 12px;
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      background: var(--surface-subtle);
      text-decoration: none;
      color: var(--text);
      overflow: hidden;
    }
    .flow-node:hover { border-color: var(--muted); }
    .flow-node-title { font-weight: 650; font-size: 0.88rem; line-height: 1.3; }
    .flow-node-meta { font-size: 0.78rem; color: var(--muted); }
    .flow-source { background: var(--rail); }
    .flow-col-label {
      position: absolute;
      font-size: 0.7rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .edge-line-satisfied { stroke: var(--ok); }
    .edge-line-blocked { stroke: var(--stop); stroke-dasharray: 6 5; }
    .edge-line-stale { stroke: var(--warn); stroke-dasharray: 6 5; }
    .edge-line-idle { stroke: var(--border-strong); }
    .edge-head-satisfied { fill: var(--ok); }
    .edge-head-blocked { fill: var(--stop); }
    .edge-head-stale { fill: var(--warn); }
    .edge-head-idle { fill: var(--border-strong); }
    .section-lead { margin: 10px 0 8px; color: var(--muted); font-size: 0.88rem; }
    .empty { margin: 8px 0 0; color: var(--muted); font-size: 0.88rem; }
    .chips { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; }
    .chip {
      padding: 3px 11px;
      border-radius: 999px;
      border: 1px solid var(--border-strong);
      background: var(--surface-subtle);
      font-size: 0.85rem;
    }
    .chip-ok { border-color: var(--ok); background: var(--ok-soft); color: var(--ok); }
    .chip-idle { color: var(--muted); }
    .stage {
      margin-top: 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface-subtle);
      overflow: hidden;
    }
    .stage:target { border-color: var(--warn); box-shadow: 0 0 0 1px var(--warn); }
    .stage-head {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
    }
    .stage-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; }
    .stage-title h3 { margin: 0; font-size: 0.98rem; }
    .stage-id { color: var(--muted); }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 0.78rem;
      border: 1px solid currentColor;
    }
    .tone-ok { color: var(--ok); background: var(--ok-soft); }
    .tone-warn { color: var(--warn); background: var(--warn-soft); }
    .tone-stop { color: var(--stop); background: var(--stop-soft); }
    .tone-idle { color: var(--idle); background: var(--idle-soft); }
    .stage-body {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 14px;
      padding: 14px 16px;
    }
    .label {
      display: block;
      font-size: 0.7rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 5px;
    }
    .paths { list-style: none; margin: 0; padding: 0; }
    .paths li {
      padding: 4px 0;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: space-between;
      font-size: 0.85rem;
    }
    .paths li:last-child { border-bottom: none; }
    .path-note { color: var(--muted); font-size: 0.8rem; }
    .decisions { margin: 0; font-size: 1.25rem; }
    .run { padding: 12px 16px; border-top: 1px solid var(--border); background: var(--rail); }
    .run-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 6px; }
    .run-title { font-weight: 600; font-size: 0.9rem; }
    .run-line { margin: 3px 0; font-size: 0.85rem; }
    .stamps { list-style: none; margin: 6px 0; padding: 0; }
    .stamps li { display: flex; flex-wrap: wrap; gap: 10px; font-size: 0.83rem; }
    .stamps span { color: var(--muted); min-width: 5.5em; }
    .edges { list-style: none; margin: 0; padding: 0; }
    .edge {
      margin-top: 10px;
      padding: 12px 16px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface-subtle);
    }
    .edge-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; justify-content: space-between; }
    .edge-route { font-weight: 600; font-size: 0.9rem; }
    .edge-artifact { display: block; margin-top: 5px; color: var(--muted); }
    .edge-reason { margin: 5px 0 0; font-size: 0.85rem; color: var(--muted); }
    footer { color: var(--muted); font-size: 0.82rem; }
    footer p { margin: 0 0 6px; }
    @media (max-width: 900px) {
      .app-shell { display: block; }
      .sidebar { position: relative; height: auto; border-right: 0; border-bottom: 1px solid var(--border); }
    }
    @media print {
      :root {
        color-scheme: light;
        --bg: #ffffff;
        --rail: #f4f5f2;
        --surface: #ffffff;
        --surface-subtle: #f4f5f2;
        --text: #141414;
        --muted: #5d625c;
        --border: #d7dbd3;
        --border-strong: #aeb5aa;
        --ok: #2f5d3a;
        --ok-soft: #e4efe5;
        --warn: #8a4b00;
        --warn-soft: #f7ebda;
        --stop: #9c2f21;
        --stop-soft: #f7e2de;
        --idle: #60645f;
        --idle-soft: #ebedea;
      }
      .sidebar { display: none; }
      .app-shell { display: block; }
      .stage, .edge, .notice, .panel { break-inside: avoid; }
    }
  `;
}

// ---------------------------------------------------------------------------
// Flow canvas
// ---------------------------------------------------------------------------

// Deterministic geometry: every coordinate derives from column/row indices and
// this single set of constants, which also sizes the canvas the SVG overlay
// covers. Nothing is measured from the DOM, so the drawing cannot depend on
// the reading machine.
const FLOW = {
  nodeW: 185,
  nodeH: 86,
  colGap: 64,
  rowGap: 16,
  padX: 18,
  padTop: 36,
  laneStart: 30,
  laneStep: 22,
  padBottom: 26,
};

function flowStageTone(stage) {
  if (stage.run?.phase === "possibly-stopped") return "stop";
  return tone(STAGE_STATE_TONES, stage.state);
}

function flowStageMeta(stage) {
  const lines = [label(STAGE_STATE_LABELS, stage.state)];
  if (stage.state === "produced" && stage.auditConfigured && !stage.verified) lines.push(UNVERIFIED_LABEL);
  if (stage.run?.phase === "possibly-stopped") lines.push(label(RUN_PHASE_LABELS, "possibly-stopped"));
  if (stage.pendingDecisions !== null && stage.pendingDecisions > 0) lines.push(`待決 ${stage.pendingDecisions} 項`);
  return lines;
}

// Arrowheads are explicit polygons. SVG marker references use url(#id) syntax,
// which the frozen self-containment scan rejects as a CSS url() pattern, so
// markers are off the table by construction.
function arrowRight(x, y, cls) {
  return `<polygon class="edge-head-${cls}" points="${x - 8},${y - 4.5} ${x},${y} ${x - 8},${y + 4.5}"/>`;
}

function arrowUpFromBelow(x, y, cls) {
  return `<polygon class="edge-head-${cls}" points="${x - 4.5},${y + 8} ${x},${y} ${x + 4.5},${y + 8}"/>`;
}

export function renderFlow(status) {
  const stageCount = status.stages.length;
  const present = status.sources.filter((source) => source.present);
  const sourceNodes = present.length
    ? present.map((source) => ({ title: source.title, meta: ["已提供"], tone: "ok" }))
    : [{ title: "還沒有任何來源", meta: ["可接受的類型見來源面板"], tone: "idle" }];

  const colX = (col) => FLOW.padX + col * (FLOW.nodeW + FLOW.colGap);
  const stageY = FLOW.padTop;
  const sourceY = (row) => FLOW.padTop + row * (FLOW.nodeH + FLOW.rowGap);

  const stageIndexById = new Map(status.stages.map((stage, index) => [stage.id, index]));
  const skipEdges = status.edges.filter(
    (edge) => (stageIndexById.get(edge.to) ?? 0) - (stageIndexById.get(edge.from) ?? 0) > 1,
  );

  const width = colX(stageCount) + FLOW.nodeW + FLOW.padX;
  const sourceStackHeight = sourceNodes.length * FLOW.nodeH + (sourceNodes.length - 1) * FLOW.rowGap;
  const laneBase = stageY + FLOW.nodeH + FLOW.laneStart;
  const height =
    Math.max(FLOW.padTop + sourceStackHeight, laneBase + skipEdges.length * FLOW.laneStep) + FLOW.padBottom;

  const svgParts = [];
  const nodeParts = [];

  nodeParts.push(
    `<span class="flow-col-label" style="left:${colX(0)}px;top:${FLOW.padTop - 22}px">來源</span>`,
    `<span class="flow-col-label" style="left:${colX(1)}px;top:${FLOW.padTop - 22}px">階段流程</span>`,
  );

  sourceNodes.forEach((node, row) => {
    nodeParts.push(
      `<a class="flow-node flow-source" href="#sources" style="left:${colX(0)}px;top:${sourceY(row)}px;width:${FLOW.nodeW}px;height:${FLOW.nodeH}px">
        <span class="flow-node-title">${escapeHtml(node.title)}</span>
        <span class="flow-node-meta">${node.meta.map(escapeHtml).join("・")}</span>
      </a>`,
    );
    // Cosmetic fan-in from sources to the first stage: idle-toned on purpose —
    // it depicts where material enters and claims no handoff state.
    const fromY = sourceY(row) + FLOW.nodeH / 2;
    const toX = colX(1);
    const toY = stageY + FLOW.nodeH / 2;
    const bendX = colX(0) + FLOW.nodeW + FLOW.colGap / 2;
    svgParts.push(
      `<path class="edge-line-idle" fill="none" stroke-width="1.5" d="M ${colX(0) + FLOW.nodeW} ${fromY} H ${bendX} V ${toY} H ${toX - 9}"/>`,
      arrowRight(toX, toY, "idle"),
    );
  });

  status.stages.forEach((stage, index) => {
    const x = colX(index + 1);
    const stageTone = flowStageTone(stage);
    nodeParts.push(
      `<a class="flow-node flow-stage" id="flow-stage-${escapeAttr(stage.id)}" href="#stage-${escapeAttr(stage.id)}" style="left:${x}px;top:${stageY}px;width:${FLOW.nodeW}px;height:${FLOW.nodeH}px">
        <span class="flow-node-title">${escapeHtml(stage.title)}</span>
        <span class="flow-node-meta"><span class="badge tone-${escapeAttr(stageTone)}">${escapeHtml(
          flowStageMeta(stage)[0],
        )}</span></span>
        ${
          flowStageMeta(stage).length > 1
            ? `<span class="flow-node-meta">${flowStageMeta(stage).slice(1).map(escapeHtml).join("・")}</span>`
            : ""
        }
      </a>`,
    );
  });

  let laneIndex = 0;
  for (const edge of status.edges) {
    const fromCol = (stageIndexById.get(edge.from) ?? 0) + 1;
    const toCol = (stageIndexById.get(edge.to) ?? 0) + 1;
    const cls = ["satisfied", "blocked", "stale"].includes(edge.state) ? edge.state : "idle";
    if (toCol - fromCol === 1) {
      const y = stageY + FLOW.nodeH / 2;
      svgParts.push(
        `<line class="edge-line-${cls}" stroke-width="2" x1="${colX(fromCol) + FLOW.nodeW}" y1="${y}" x2="${colX(toCol) - 9}" y2="${y}"/>`,
        arrowRight(colX(toCol), y, cls),
      );
    } else {
      const laneY = laneBase + laneIndex * FLOW.laneStep;
      laneIndex += 1;
      const fromX = colX(fromCol) + FLOW.nodeW / 2;
      const toX = colX(toCol) + FLOW.nodeW / 2;
      const bottomY = stageY + FLOW.nodeH;
      svgParts.push(
        `<path class="edge-line-${cls}" fill="none" stroke-width="2" d="M ${fromX} ${bottomY} V ${laneY} H ${toX} V ${bottomY + 9}"/>`,
        arrowUpFromBelow(toX, bottomY, cls),
      );
    }
  }

  return `<div class="flow-canvas" style="width:${width}px;height:${height}px">
    <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">${svgParts.join("")}</svg>
    ${nodeParts.join("")}
  </div>`;
}

export function renderBoard(status) {
  const titleById = new Map(status.stages.map((stage) => [stage.id, stage.title]));
  const heading = status.projectName ? `自動化流程看板 · ${status.projectName}` : "自動化流程看板";

  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(heading)}</title>
<style>${css()}</style>
</head>
<body>
<div class="app-shell">
  <aside class="sidebar">
    <p class="brand">Pipeline Board</p>
    <p class="brand-sub">${escapeHtml(status.projectName || "自動化流程看板")}</p>
    <p class="side-label">導覽</p>
    <nav class="side-nav">
      <a href="#flow">流程圖</a>
      <a href="#sources">來源</a>
      ${status.stages
        .map((stage) => `<a href="#stage-${escapeAttr(stage.id)}">${escapeHtml(stage.title)}</a>`)
        .join("")}
      <a href="#handoffs">階段之間的銜接</a>
    </nav>
    <p class="side-label">圖例</p>
    <ul class="legend">
      <li><span class="dot dot-ok"></span>已驗證・已銜接</li>
      <li><span class="dot dot-warn"></span>檔案已產出・已過期</li>
      <li><span class="dot dot-stop"></span>未銜接・可能已停止</li>
      <li><span class="dot dot-idle"></span>尚未開始</li>
    </ul>
  </aside>
  <div class="workspace">
    <header class="topbar">
      <h1>${escapeHtml(heading)}</h1>
      <span class="topbar-meta">快照 ${escapeHtml(formatStamp(status.generatedAt) || "沒有紀錄")}</span>
    </header>
    <main class="panels">
      <section class="panel" id="flow">
        <h2>流程圖</h2>
        <div class="flow-scroll">${renderFlow(status)}</div>
      </section>

      ${renderSources(status)}

      <section class="section" id="stages">
        <h2>階段</h2>
        ${status.stages.map(renderStage).join("")}
      </section>

      ${renderEdges(status, titleById)}

      <section class="notice">
        <h2>這份看板是唯讀的</h2>
        <p>這個頁面只會呈現硬碟上已經存在的證據。它<strong>不會啟動任何自動化</strong>，沒有執行按鈕、沒有排程、也沒有觸發器。</p>
        <p>所有自動化都由人在自己的終端機裡執行。看板不會代替任何人按下開始。</p>
        <p>畫面上的狀態不會自己更新。重新整理這一頁不會取得新資料；要看到新的狀態，需要重新產生 <code>status.json</code> 並重新輸出這個檔案。</p>
      </section>

      <footer>
        <p>${
          status.hasRunData
            ? "執行紀錄來自專案裡既有的執行摘要檔。"
            : "這個專案目前沒有任何執行紀錄，所有階段只依照硬碟上的檔案判讀。"
        }</p>
        <p>這個檔案是自足的：沒有外部樣式、字型、圖片或網路請求，離線用 file:// 開啟結果完全相同。</p>
      </footer>
    </main>
  </div>
</div>
</body>
</html>
`;

  assertSelfContained(html);
  return html;
}

// The no-network promise is only worth as much as its enforcement. Any of these
// patterns in the finished markup would mean the page depends on something it
// does not carry, so the render fails instead of shipping a page that looks
// right on a connected machine and breaks on a plane.
//
// The scan runs over the file's bytes, so escaped text trips it too: a stage
// title of "<script src=x>" is rejected even though escaping made it inert.
// That is deliberate. The guarantee this skill publishes is about what the file
// contains, and a reader auditing the file greps it rather than parsing it.
const EXTERNAL_REFERENCE_PATTERNS = [
  [/https?:\/\//i, "an absolute http(s) URL"],
  [/\bsrc\s*=/i, "a src attribute"],
  [/@import/i, "a CSS @import"],
  [/\bfetch\s*\(/i, "a fetch() call"],
  [/<script/i, "a script element"],
  [/<link/i, "a link element"],
  [/\burl\s*\(/i, "a CSS url() reference"],
  [/<iframe/i, "an iframe"],
];

export function assertSelfContained(html) {
  for (const [pattern, description] of EXTERNAL_REFERENCE_PATTERNS) {
    if (pattern.test(html)) {
      fail("external-reference", `Rendered board contains ${description}; the page must be self-contained`);
    }
  }
  return true;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const statusPath = path.resolve(options.status);
  if (!fs.existsSync(statusPath)) {
    fail("missing-status-file", `Status file not found: ${options.status}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(statusPath, "utf8"));
  } catch (error) {
    fail("invalid-status", `Cannot parse status file: ${error.message}`);
  }
  const status = sanitizeStatus(parsed);
  const html = renderBoard(status);
  const outAbsolute = path.resolve(options.out);
  fs.mkdirSync(path.dirname(outAbsolute), { recursive: true });
  fs.writeFileSync(outAbsolute, html, "utf8");
  process.stdout.write(`${JSON.stringify({ ok: true, out: outAbsolute }, null, 2)}\n`);
}

const invokedDirectly =
  process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((error) => {
    const code = error instanceof RenderError ? error.code : "render-failed";
    process.stderr.write(`${JSON.stringify({ ok: false, code, message: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
