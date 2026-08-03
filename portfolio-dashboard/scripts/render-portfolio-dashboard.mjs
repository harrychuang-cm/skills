#!/usr/bin/env node

// Renders the portfolio status object into ONE self-contained overview HTML:
// one card per tracked project. The same two properties that hold for the
// per-project board hold here, enforced in code:
//
// 1. Sanitization. Everything drawn passes through an allowlist projection.
//    Only project identity, display name, board file name, error code and
//    reason, current stage, the build-derived attention item, run phase and
//    runner identity, and timestamps survive. The embedded per-project status
//    carries more (paths, counts, absolute roots inside portfolioPath) — none
//    of it is read beyond the allowlist, so nothing else can leak into markup.
//
// 2. Self-containment. The finished markup is scanned for external references
//    and the file is refused if any appears. Card links are relative file
//    names inside the output directory, written by the same aggregation run.
//
// The attention item is displayed exactly as the build derived it. This
// renderer never recomputes or reorders that priority; doing so would let two
// surfaces disagree about why a project is stuck.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA_VERSION = 1;
const DEFAULT_OUT_NAME = "portfolio-dashboard.html";
const BOARD_FILE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.html$/;

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
  return options;
}

const ATTENTION_LABELS = {
  "needs-confirmation": "需要人工確認",
  "blocked-edge": "卡在未銜接的交接",
  "stale-edge": "有一段交接已過期",
  "pending-decisions": "等待設計決定",
  "healthy-verified": "流程健康・全部已驗證",
  "healthy-unverified": "流程健康・尚未全部驗證",
};
const ATTENTION_TONES = {
  "needs-confirmation": "stop",
  "blocked-edge": "stop",
  "stale-edge": "warn",
  "pending-decisions": "warn",
  "healthy-verified": "ok",
  "healthy-unverified": "idle",
};
const STAGE_STATE_LABELS = {
  "not-started": "尚未開始",
  produced: "檔案已產出",
  verified: "已驗證",
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

function label(table, value) {
  return table[value] ?? (typeof value === "string" && value ? value : "");
}

// ---------------------------------------------------------------------------
// Allowlist projection
// ---------------------------------------------------------------------------

function text(value) {
  return typeof value === "string" ? value : "";
}

function sanitizeAttention(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  return {
    priority: Number.isInteger(raw.priority) ? raw.priority : 4,
    kind: text(raw.kind),
    reason: text(raw.reason),
    stageTitle: text(raw.stageTitle),
    fromTitle: text(raw.fromTitle),
    toTitle: text(raw.toTitle),
    artifact: text(raw.artifact),
    count: Number.isInteger(raw.count) ? raw.count : null,
  };
}

function sanitizeRunLines(rawStatus) {
  if (typeof rawStatus !== "object" || rawStatus === null) return [];
  const stages = Array.isArray(rawStatus.stages) ? rawStatus.stages : [];
  const lines = [];
  for (const stage of stages) {
    if (typeof stage?.run !== "object" || stage.run === null) continue;
    lines.push({
      stageTitle: text(stage.title),
      phase: text(stage.run.phase),
      runnerLabel: text(stage.run.selectedRunner?.label) || text(stage.run.selectedRunner?.id),
    });
  }
  return lines;
}

export function sanitizeStatus(raw) {
  if (typeof raw !== "object" || raw === null) {
    fail("invalid-status", "Status file must contain an object");
  }
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    fail("unsupported-schema-version", `Portfolio status schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (!Array.isArray(raw.projects) || !raw.projects.length) {
    fail("invalid-status", "Portfolio status must contain a non-empty projects[]");
  }

  // Only the definition file's name survives; its absolute location is dropped
  // for the same reason the per-project board drops the project root.
  const portfolioName = path.basename(text(raw.portfolioPath));

  return {
    portfolioName,
    generatedAt: text(raw.generatedAt),
    projects: raw.projects.map((project, index) => {
      const id = text(project?.id);
      const name = text(project?.name);
      if (project?.ok === true) {
        const boardFile = text(project.boardFile);
        // The link target is written by the same run and named by the strict
        // kebab-case id. Anything else means the status file was hand-edited;
        // refuse rather than emit a link to an unknown location.
        if (!BOARD_FILE_PATTERN.test(boardFile)) {
          fail("invalid-board-file", `projects[${index}].boardFile is not a same-directory board name: ${boardFile}`);
        }
        return {
          ok: true,
          id,
          name,
          boardFile,
          currentStage:
            typeof project.currentStage === "object" && project.currentStage !== null
              ? { title: text(project.currentStage.title), state: text(project.currentStage.state) }
              : null,
          attention: sanitizeAttention(project.attention),
          runLines: sanitizeRunLines(project.status),
        };
      }
      return {
        ok: false,
        id,
        name,
        error: {
          code: text(project?.error?.code),
          reason: text(project?.error?.reason),
        },
      };
    }),
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

function attentionDetail(attention) {
  if (!attention) return "";
  if (attention.kind === "needs-confirmation" && attention.stageTitle) {
    return `<p class="attention-line">階段「${escapeHtml(attention.stageTitle)}」的執行紀錄已超過逾時上限。</p>`;
  }
  if ((attention.kind === "blocked-edge" || attention.kind === "stale-edge") && attention.fromTitle) {
    return `<p class="attention-line">${escapeHtml(attention.fromTitle)} → ${escapeHtml(attention.toTitle)}：<code>${escapeHtml(
      attention.artifact,
    )}</code></p>`;
  }
  if (attention.kind === "pending-decisions" && attention.count !== null) {
    return `<p class="attention-line attention-count">${attention.count} 項</p>`;
  }
  return "";
}

function projectTone(project) {
  if (!project.ok) return "stop";
  return project.attention ? (ATTENTION_TONES[project.attention.kind] ?? "idle") : "idle";
}

function renderCard(project) {
  if (!project.ok) {
    return `<article class="card card-error" id="card-${escapeAttr(project.id)}">
      <header class="card-head">
        <h3>${escapeHtml(project.name || project.id)}</h3>
        ${badge("無法讀取", "stop")}
      </header>
      <p class="error-code"><code>${escapeHtml(project.error.code)}</code></p>
      <p class="attention-line">${escapeHtml(project.error.reason)}</p>
    </article>`;
  }

  const attention = project.attention;
  const tone = attention ? (ATTENTION_TONES[attention.kind] ?? "idle") : "idle";
  return `<article class="card" id="card-${escapeAttr(project.id)}">
    <header class="card-head">
      <h3>${escapeHtml(project.name)}</h3>
      ${badge(label(ATTENTION_LABELS, attention?.kind), tone)}
    </header>
    <p class="stage-line">目前階段：${
      project.currentStage
        ? `${escapeHtml(project.currentStage.title)}（${escapeHtml(
            label(STAGE_STATE_LABELS, project.currentStage.state),
          )}）`
        : "全部階段都已驗證"
    }</p>
    ${attention?.reason ? `<p class="attention-line">${escapeHtml(attention.reason)}</p>` : ""}
    ${attentionDetail(attention)}
    ${
      project.runLines.length
        ? `<ul class="runs">${project.runLines
            .map(
              (line) =>
                `<li>${escapeHtml(line.stageTitle)}：${escapeHtml(label(RUN_PHASE_LABELS, line.phase))}${
                  line.runnerLabel ? `（${escapeHtml(line.runnerLabel)}）` : ""
                }</li>`,
            )
            .join("")}</ul>`
        : `<p class="runs-empty">這個專案沒有任何執行紀錄。</p>`
    }
    <p class="card-link"><a href="${escapeAttr(project.boardFile)}">打開這個專案的流程板</a></p>
  </article>`;
}

// No @keyframes, no transition, no progress bar: the page is a snapshot and
// must never look like it is moving.
//
// One fixed dark console theme on screen; print flips to light and drops the
// sidebar. Same token set as the per-project board so the two surfaces read
// as one product.
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
    a { color: var(--ok); }
    .app-shell {
      display: grid;
      grid-template-columns: 248px minmax(0, 1fr);
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
    .project-list { display: flex; flex-direction: column; gap: 2px; }
    .project-list a {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 7px;
      color: var(--text);
      text-decoration: none;
      font-size: 0.9rem;
    }
    .project-list a:hover { background: var(--surface-subtle); }
    .dot { width: 9px; height: 9px; border-radius: 999px; flex: none; }
    .dot-ok { background: var(--ok); }
    .dot-warn { background: var(--warn); }
    .dot-stop { background: var(--stop); }
    .dot-idle { background: var(--idle); }
    .legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .legend li { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: var(--muted); }
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
    .notice {
      border: 1px solid var(--border-strong);
      border-radius: 12px;
      background: var(--surface-subtle);
      padding: 16px 18px;
    }
    .notice h2 { margin: 0 0 8px; font-size: 0.95rem; }
    .notice p { margin: 0 0 6px; font-size: 0.88rem; color: var(--muted); }
    .notice p:last-child { margin-bottom: 0; }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 14px;
    }
    .card {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .card:target { border-color: var(--warn); box-shadow: 0 0 0 1px var(--warn); }
    .card-error { border-color: var(--stop); }
    .card-head {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }
    .card-head h3 { margin: 0; font-size: 1rem; }
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
    .stage-line { margin: 0; font-size: 0.9rem; }
    .attention-line { margin: 0; font-size: 0.86rem; color: var(--muted); }
    .attention-count { font-size: 1.3rem; color: var(--text); }
    .error-code { margin: 0; }
    .runs { list-style: none; margin: 0; padding: 0; font-size: 0.85rem; color: var(--muted); }
    .runs li { padding: 2px 0; }
    .runs-empty { margin: 0; font-size: 0.85rem; color: var(--muted); }
    .card-link { margin: 4px 0 0; font-size: 0.9rem; }
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
      .card, .notice { break-inside: avoid; }
    }
  `;
}

export function renderDashboard(status) {
  const okCount = status.projects.filter((project) => project.ok).length;
  const errorCount = status.projects.length - okCount;
  const heading = status.portfolioName
    ? `自動化儀表板 · ${status.portfolioName}`
    : "自動化儀表板";

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
    <p class="brand">Portfolio Dashboard</p>
    <p class="brand-sub">${escapeHtml(status.portfolioName || "自動化儀表板")}</p>
    <p class="side-label">專案</p>
    <nav class="project-list">
      ${status.projects
        .map(
          (project) =>
            `<a href="#card-${escapeAttr(project.id)}"><span class="dot dot-${escapeAttr(
              projectTone(project),
            )}"></span>${escapeHtml(project.name || project.id)}</a>`,
        )
        .join("")}
    </nav>
    <p class="side-label">圖例</p>
    <ul class="legend">
      <li><span class="dot dot-ok"></span>流程健康</li>
      <li><span class="dot dot-warn"></span>等待設計決定・已過期</li>
      <li><span class="dot dot-stop"></span>需要確認・卡住・無法讀取</li>
      <li><span class="dot dot-idle"></span>尚未全部驗證</li>
    </ul>
  </aside>
  <div class="workspace">
    <header class="topbar">
      <h1>${escapeHtml(heading)}</h1>
      <span class="topbar-meta">快照 ${escapeHtml(formatStamp(status.generatedAt) || "沒有紀錄")} · ${okCount} 個專案可讀${
        errorCount ? `、${errorCount} 個專案無法讀取` : ""
      }</span>
    </header>
    <main class="panels">
      <section class="cards">
        ${status.projects.map(renderCard).join("")}
      </section>

      <section class="notice">
        <h2>這是一張靜態快照</h2>
        <p>這個頁面彙整每個專案流程板當時的狀態。它<strong>不會啟動任何自動化</strong>，沒有執行按鈕、沒有排程、也不會自己更新。</p>
        <p>要看到新的狀態，請重新執行 <code>build-portfolio-status.mjs</code> 與 <code>render-portfolio-dashboard.mjs</code> 兩支指令。</p>
        <p>每張卡片的連結都指向同一次彙整產生的專案流程板，整個資料夾可以直接分享。</p>
      </section>

      <footer>
        <p>卡片上的注意事項由彙整階段依固定優先序推導：可能已停止的執行 → 第一條未銜接或已過期的交接 → 等待中的設計決定 → 流程健康。</p>
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

// Same enforcement stance as the per-project board: the scan runs over the
// file's bytes, escaped or not, because the promise is about what the file
// contains. Relative <a href> card links carry no scheme and pass; anything
// that could reach the network does not.
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
      fail("external-reference", `Rendered dashboard contains ${description}; the page must be self-contained`);
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
  const html = renderDashboard(status);
  const outAbsolute = path.resolve(options.out ?? path.join(path.dirname(statusPath), DEFAULT_OUT_NAME));
  fs.mkdirSync(path.dirname(outAbsolute), { recursive: true });
  fs.writeFileSync(outAbsolute, html, "utf8");
  process.stdout.write(`${JSON.stringify({ ok: true, out: outAbsolute }, null, 2)}\n`);
}

function isInvokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isInvokedDirectly()) {
  main().catch((error) => {
    const code = error instanceof RenderError ? error.code : "render-failed";
    process.stderr.write(`${JSON.stringify({ ok: false, code, message: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
