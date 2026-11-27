// Approval of one AI request through a channel that scripts in the page
// cannot operate.
//
// native-dialog (macOS default): `osascript` shows a dialog whose text it
//   reads from a file in the run's private directory. Neither the request
//   text nor the summary is ever put in a process argument or in AppleScript
//   source. The default button is the denial; no answer within the time limit
//   is a denial. When no dialog can be shown (no graphical session), the run
//   falls back to a terminal code instead of going unconfirmed.
// terminal-code: a six-digit code printed with the same summary in the dev
//   server's terminal. It approves only its own run, works once, and three
//   wrong attempts void it.
// off: only when the binding says so; the status then says runs are unconfirmed.
//
// CODE_LAYER_TEST_CONFIRM=<file> replaces the native dialog for automated
// tests: the file's content (approve | deny | timeout | native-fail) is the
// answer. The server says so loudly in its log when it is set.
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { ApiError } from "../../shared/api-contract.mjs";
import { CONFIRM_TEXT as TEXT, SUMMARY_CONTEXT_LIMIT, SUMMARY_TEXT_LIMIT } from "./messages.confirm.mjs";

const MAX_CODE_ATTEMPTS = 3;


/**
 * The text a person approves: what will run, on what, and what it may change.
 * followUp: { original, question, answer } when the request answers an agent's
 * question. The answer is what is new, so it comes first and gets the full
 * length; the earlier request and the question are shortened context.
 */
export function confirmationSummary({ locale, projectId, element, runner, allowed, text, followUp = null }) {
  const t = TEXT[locale] ?? TEXT["zh-Hant"];
  const clip = (value, limit) => {
    const chars = [...value];
    return chars.length > limit ? `${chars.slice(0, limit).join("")}…\n${t.truncated(chars.length, limit)}` : value;
  };
  // The request text is shown as it was typed; only the labels follow the language.
  const request = followUp
    ? [
        `${t.answer}${t.colon}`,
        clip(followUp.answer, SUMMARY_TEXT_LIMIT),
        "",
        `${t.question}${t.colon}`,
        clip(followUp.question, SUMMARY_CONTEXT_LIMIT),
        "",
        `${t.original}${t.colon}`,
        clip(followUp.original, SUMMARY_CONTEXT_LIMIT),
      ]
    : [`${t.request}${t.colon}`, clip(text, SUMMARY_TEXT_LIMIT)];
  return [
    t.intro,
    "",
    `${t.project}${t.colon}${projectId}`,
    `${t.element}${t.colon}${element}`,
    `${t.runner}${t.colon}${runner}`,
    `${t.allowed}${t.colon}${allowed.join(", ")}`,
    "",
    ...request,
    "",
    t.cost,
  ].join("\n");
}

// The script only reads its arguments: the summary file, the title, the two buttons.
const APPLESCRIPT = [
  "on run argv",
  "set summaryText to read (POSIX file (item 1 of argv)) as «class utf8»",
  "try",
  "set answer to display dialog summaryText with title (item 2 of argv) buttons {item 3 of argv, item 4 of argv} default button 1 cancel button 1 with icon caution giving up after (item 5 of argv as integer)",
  "if gave up of answer then return \"timeout\"",
  "if button returned of answer is (item 4 of argv) then return \"approve\"",
  "return \"deny\"",
  "on error number errorNumber",
  "if errorNumber is -128 then return \"deny\"",
  "error number errorNumber",
  "end try",
  "end run",
];

export function defaultConfirmMode(configured, platform = process.platform) {
  if (configured) return configured;
  return platform === "darwin" ? "native-dialog" : "terminal-code";
}

/**
 * One confirmer per dev server.
 * request({ runId, runDir, requestHash, summary, locale, onModeChange }) returns
 *   { mode, done: Promise<{ decision: "approve" | "deny" | "timeout", via }> }.
 * submitCode(runId, code) settles a terminal-code request.
 * abandon(runId) settles a pending request as denied (cancel, shutdown).
 */
export function createConfirmer({
  mode: configured = null,
  platform = process.platform,
  log = { info() {}, warn() {} },
  spawnImpl = spawn,
  testFile = process.env.CODE_LAYER_TEST_CONFIRM ?? null,
  dialogSeconds = 60,
  codeTtlMs = 180000,
} = {}) {
  const mode = defaultConfirmMode(configured, platform);
  const pending = new Map();
  if (testFile) log.warn(`test confirmation stub is active (CODE_LAYER_TEST_CONFIRM=${testFile}); native dialogs are replaced by that file`);

  function settle(runId, decision, via) {
    const entry = pending.get(runId);
    if (!entry) return;
    pending.delete(runId);
    clearTimeout(entry.timer);
    clearInterval(entry.poll);
    try {
      entry.child?.kill("SIGKILL");
    } catch {
      // gone
    }
    entry.resolve({ decision, via });
  }

  function startCode(runId, entry, summary, locale) {
    const t = TEXT[locale] ?? TEXT["zh-Hant"];
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    entry.code = code;
    entry.attempts = 0;
    entry.mode = "terminal-code";
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => settle(runId, "timeout", "terminal-code"), codeTtlMs);
    entry.timer.unref?.();
    // The terminal is outside the page: only someone at this machine reads it.
    log.warn(`AI request ${runId} is waiting for approval.\n${summary}\n\n${t.code(code)}`);
    entry.onModeChange?.("terminal-code");
  }

  function startDialog(runId, entry, summary, locale, runDir) {
    const t = TEXT[locale] ?? TEXT["zh-Hant"];
    if (testFile) {
      // Automated tests: the answer is the content of a file.
      entry.poll = setInterval(() => {
        let answer = "";
        try {
          answer = fs.readFileSync(testFile, "utf8").trim();
        } catch {
          answer = "";
        }
        if (answer === "approve" || answer === "deny" || answer === "timeout") settle(runId, answer, "test-stub");
        else if (answer === "native-fail") {
          clearInterval(entry.poll);
          startCode(runId, entry, summary, locale);
        }
      }, 100);
      entry.timer = setTimeout(() => settle(runId, "timeout", "test-stub"), dialogSeconds * 1000);
      return;
    }
    const file = path.join(runDir, "confirm.txt");
    fs.writeFileSync(file, `${summary}\n`, { mode: 0o600 });
    const args = APPLESCRIPT.flatMap((line) => ["-e", line]).concat([file, t.title, t.deny, t.allow, String(dialogSeconds)]);
    let output = "";
    let child;
    try {
      child = spawnImpl("/usr/bin/osascript", args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    } catch (error) {
      log.warn(`native confirmation dialog could not start (${error.message}); a terminal code is used instead`);
      startCode(runId, entry, summary, locale);
      return;
    }
    entry.child = child;
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    child.on("error", () => undefined);
    child.on("close", (code) => {
      if (!pending.has(runId) || entry.mode !== "native-dialog") return;
      const answer = output.trim().split("\n").pop()?.trim();
      if (code === 0 && (answer === "approve" || answer === "deny" || answer === "timeout")) {
        settle(runId, answer, "native-dialog");
        return;
      }
      // No graphical session, or the dialog was refused: never fall back to "no confirmation".
      log.warn(`native confirmation dialog could not be shown (${output.trim().slice(0, 200) || `exit ${code}`}); a terminal code is used instead`);
      startCode(runId, entry, summary, locale);
    });
    // osascript gives up by itself; this is a backstop.
    entry.timer = setTimeout(() => settle(runId, "timeout", "native-dialog"), (dialogSeconds + 15) * 1000);
  }

  return {
    mode,
    unconfirmed: mode === "off",
    request({ runId, runDir, requestHash, summary, locale = "zh-Hant", onModeChange = null }) {
      if (mode === "off") return { mode, done: Promise.resolve({ decision: "approve", via: "off" }) };
      let resolve;
      const done = new Promise((r) => {
        resolve = r;
      });
      const entry = { resolve, requestHash, mode, onModeChange, timer: null, poll: null, child: null, code: null, attempts: 0 };
      pending.set(runId, entry);
      if (mode === "terminal-code") startCode(runId, entry, summary, locale);
      else startDialog(runId, entry, summary, locale, runDir);
      return { mode: entry.mode, done };
    },
    modeOf(runId) {
      return pending.get(runId)?.mode ?? null;
    },
    submitCode(runId, code) {
      const entry = pending.get(runId);
      if (!entry || entry.mode !== "terminal-code" || entry.code === null) {
        throw new ApiError("agent-code-invalid", "this run is not waiting for a code");
      }
      const given = Buffer.from(String(code ?? ""));
      const expected = Buffer.from(entry.code);
      const ok = given.length === expected.length && crypto.timingSafeEqual(given, expected);
      if (ok) {
        settle(runId, "approve", "terminal-code");
        return { ok: true };
      }
      entry.attempts += 1;
      if (entry.attempts >= MAX_CODE_ATTEMPTS) {
        settle(runId, "deny", "terminal-code");
        throw new ApiError("agent-code-invalid", "wrong code; the request was denied after three attempts", { remaining: 0 });
      }
      throw new ApiError("agent-code-invalid", "wrong code", { remaining: MAX_CODE_ATTEMPTS - entry.attempts });
    },
    abandon(runId) {
      settle(runId, "deny", "abandoned");
    },
    abandonAll() {
      for (const runId of [...pending.keys()]) settle(runId, "deny", "abandoned");
    },
  };
}
