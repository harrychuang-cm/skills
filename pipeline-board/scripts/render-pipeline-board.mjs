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
function css() {
  return `
    :root {
      color-scheme: light dark;
      --bg: #f5f6f3;
      --surface: #ffffff;
      --surface-subtle: #f0f2ee;
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
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #14161a;
        --surface: #1c1f24;
        --surface-subtle: #23272d;
        --text: #eceef0;
        --muted: #a3a9b0;
        --border: #333941;
        --border-strong: #4a525b;
        --ok: #9fd4ac;
        --ok-soft: #22312a;
        --warn: #e8bb84;
        --warn-soft: #322a20;
        --stop: #eda49a;
        --stop-soft: #342422;
        --idle: #a3a9b0;
        --idle-soft: #262a30;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
      line-height: 1.6;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.9em;
      overflow-wrap: anywhere;
    }
    .page {
      width: min(1040px, 100%);
      margin: 0 auto;
      padding: 32px 20px 64px;
    }
    .hero {
      padding: 28px 26px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--surface);
    }
    .eyebrow {
      margin: 0 0 6px;
      font-size: 0.8rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .hero h1 { margin: 0 0 10px; font-size: 1.75rem; }
    .hero-meta { margin: 0; color: var(--muted); font-size: 0.92rem; }
    .notice {
      margin: 20px 0 0;
      padding: 20px 22px;
      border: 1px solid var(--border-strong);
      border-radius: 14px;
      background: var(--surface-subtle);
    }
    .notice h2 { margin: 0 0 8px; font-size: 1.05rem; }
    .notice p { margin: 0 0 8px; }
    .notice p:last-child { margin-bottom: 0; }
    .section { margin-top: 34px; }
    .section h2 {
      margin: 0 0 10px;
      font-size: 1.2rem;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }
    .section-lead { margin: 12px 0 8px; color: var(--muted); font-size: 0.92rem; }
    .section-lead.muted { color: var(--muted); }
    .empty {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 0.92rem;
    }
    .chips { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; }
    .chip {
      padding: 4px 12px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface);
      font-size: 0.9rem;
    }
    .chip-ok { border-color: var(--ok); background: var(--ok-soft); color: var(--ok); }
    .chip-idle { color: var(--muted); background: var(--idle-soft); }
    .stage {
      margin-top: 16px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--surface);
      overflow: hidden;
    }
    .stage-head {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      padding: 18px 22px;
      border-bottom: 1px solid var(--border);
      background: var(--surface-subtle);
    }
    .stage-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; }
    .stage-title h3 { margin: 0; font-size: 1.1rem; }
    .stage-id { color: var(--muted); }
    .badges { display: flex; flex-wrap: wrap; gap: 8px; }
    .badge {
      display: inline-block;
      padding: 3px 12px;
      border-radius: 999px;
      font-size: 0.85rem;
      border: 1px solid currentColor;
    }
    .tone-ok { color: var(--ok); background: var(--ok-soft); }
    .tone-warn { color: var(--warn); background: var(--warn-soft); }
    .tone-stop { color: var(--stop); background: var(--stop-soft); }
    .tone-idle { color: var(--idle); background: var(--idle-soft); }
    .stage-body {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 18px;
      padding: 20px 22px;
    }
    .label {
      display: block;
      font-size: 0.78rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .paths { list-style: none; margin: 0; padding: 0; }
    .paths li {
      padding: 5px 0;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: space-between;
    }
    .paths li:last-child { border-bottom: none; }
    .path-note { color: var(--muted); font-size: 0.84rem; }
    .decisions { margin: 0; font-size: 1.3rem; }
    .run {
      padding: 18px 22px;
      border-top: 1px solid var(--border);
      background: var(--surface-subtle);
    }
    .run-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 8px; }
    .run-title { font-weight: 600; }
    .run-line { margin: 4px 0; font-size: 0.92rem; }
    .stamps { list-style: none; margin: 8px 0; padding: 0; }
    .stamps li { display: flex; flex-wrap: wrap; gap: 10px; font-size: 0.9rem; }
    .stamps span { color: var(--muted); min-width: 5.5em; }
    .edges { list-style: none; margin: 0; padding: 0; }
    .edge {
      margin-top: 12px;
      padding: 16px 20px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
    }
    .edge-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; justify-content: space-between; }
    .edge-route { font-weight: 600; }
    .edge-artifact { display: block; margin-top: 6px; color: var(--muted); }
    .edge-reason { margin: 6px 0 0; font-size: 0.92rem; }
    footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.88rem;
    }
    footer p { margin: 0 0 6px; }
    @media print {
      body { background: #ffffff; }
      .stage, .edge, .hero, .notice { break-inside: avoid; }
    }
  `;
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
<main class="page">
  <header class="hero">
    <p class="eyebrow">Pipeline Board</p>
    <h1>${escapeHtml(heading)}</h1>
    <p class="hero-meta">產生時間：${escapeHtml(formatStamp(status.generatedAt) || "沒有紀錄")}</p>
  </header>

  <section class="notice">
    <h2>這份看板是唯讀的</h2>
    <p>這個頁面只會呈現硬碟上已經存在的證據。它<strong>不會啟動任何自動化</strong>，沒有執行按鈕、沒有排程、也沒有觸發器。</p>
    <p>所有自動化都由人在自己的終端機裡執行。看板不會代替任何人按下開始。</p>
    <p>畫面上的狀態不會自己更新。重新整理這一頁不會取得新資料；要看到新的狀態，需要重新產生 <code>status.json</code> 並重新輸出這個檔案。</p>
  </section>

  ${renderSources(status)}

  <section class="section" id="stages">
    <h2>階段</h2>
    ${status.stages.map(renderStage).join("")}
  </section>

  ${renderEdges(status, titleById)}

  <footer>
    <p>${
      status.hasRunData
        ? "執行紀錄來自專案裡既有的執行摘要檔。"
        : "這個專案目前沒有任何執行紀錄，所有階段只依照硬碟上的檔案判讀。"
    }</p>
    <p>這個檔案是自足的：沒有外部樣式、字型、圖片或網路請求，離線用 file:// 開啟結果完全相同。</p>
  </footer>
</main>
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
