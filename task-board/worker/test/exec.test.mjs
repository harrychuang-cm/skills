// 包裹 run-task 執行測試：stub 版 run-task 產生 verification-failed summary，
// 確認回報以 summary 為準、心跳照間隔發出、log 遮罩後上傳。
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { executeClaimedCard } from "../lib/exec.mjs";

const STUB_RUN_TASK = `
// stub run-task：寫一份 verification-failed 的 run summary 後結束（exit 0 模擬 agent 成功但驗證失敗的情境不影響本測試——結果權威是 summary）
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const projectRoot = get("--project-root");
const taskId = get("--task");
const resume = get("--resume");
const stateDir = path.join(projectRoot, ".agent-automation", "runs");
mkdirSync(stateDir, { recursive: true });
const now = new Date().toISOString();
writeFileSync(path.join(stateDir, "stub-run-1.json"), JSON.stringify({
  schemaVersion: 1, runId: "stub-run-1", taskId, phase: "verification-failed",
  selectedRunner: { id: "claude", label: "Claude" },
  verification: [{ index: 0, passed: false }],
  resumedFrom: resume ?? null,
  startedAt: now, updatedAt: now, finishedAt: now,
}));
console.log("stub agent output with secret: " + process.env.EXEC_TEST_SECRET);
// 撐過至少兩個心跳間隔
await new Promise((resolve) => setTimeout(resolve, 150));
process.exit(1);
`;

test("結果權威取 run summary；心跳發出；log 遮罩後上傳", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "worker-exec-"));
  const stubPath = path.join(base, "run-task-stub.mjs");
  await writeFile(stubPath, STUB_RUN_TASK);

  const projectRoot = path.join(base, "proj-alpha");
  await mkdir(path.join(projectRoot, ".agent-automation"), { recursive: true });
  await writeFile(
    path.join(projectRoot, ".agent-automation", "config.json"),
    JSON.stringify({
      schemaVersion: 1,
      stateDir: ".agent-automation/runs",
      runners: [],
      tasks: { extract: { instruction: "x", verification: [{}, {}, {}], requiredArtifacts: [] } },
    }),
  );

  process.env.EXEC_TEST_SECRET = "topsecret-env-value-42";

  const reports = [];
  const heartbeats = [];
  const logChunks = [];
  const api = {
    report: async (payload) => {
      reports.push(payload);
      return { status: 200, data: {} };
    },
    heartbeat: async (payload) => {
      heartbeats.push(payload);
      return { status: 200, data: {} };
    },
    logs: async (payload) => {
      logChunks.push(payload);
      return { status: 200, data: {} };
    },
  };

  const result = await executeClaimedCard({
    config: {
      runTaskScript: stubPath,
      heartbeatIntervalMs: 40,
      workerStateDir: path.join(base, ".worker-state"),
    },
    api,
    card: {
      cardId: "card-1",
      leaseId: "lease-1",
      projectSlug: "proj-alpha",
      taskId: "extract",
      note: null,
      resume: { previousRunId: "prev-run-9", note: "採用 B 案" },
    },
    projects: [{ slug: "proj-alpha", root: projectRoot }],
  });

  // 結果權威：summary 的 verification-failed（即使子程序 exit 1）
  assert.equal(result.phase, "verification-failed");
  assert.equal(result.runId, "stub-run-1");

  const terminal = reports.find((r) => r.phase === "verification-failed");
  assert.ok(terminal, "回報終態");
  assert.equal(terminal.runId, "stub-run-1");
  assert.equal(terminal.runnerId, "claude");
  assert.equal(terminal.resumedFrom, "prev-run-9", "resume 指令帶前次 runId");
  assert.deepEqual(terminal.verification, { configured: 3, passed: 0, failed: 1, notRun: 2 }, "分母取 config 的驗證項目數");

  assert.ok(heartbeats.length >= 2, `執行期間心跳照間隔發出（實得 ${heartbeats.length} 次）`);

  const allLogs = logChunks.map((c) => c.chunk).join("");
  assert.ok(allLogs.includes("stub agent output"), "輸出有上傳");
  assert.ok(!allLogs.includes("topsecret-env-value-42"), "環境變數值不出現在上傳內容");
  assert.ok(allLogs.includes("[redacted]"), "遮罩標記存在");
});
