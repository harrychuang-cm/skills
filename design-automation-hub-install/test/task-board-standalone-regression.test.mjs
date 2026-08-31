// standalone 回歸：未綁定的 Coordinator 行為必須與派工模式引入前完全相同。
// 兩種設定都真的把伺服器跑起來，用 HTTP 對照健康檢查與 Plugin context。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { computeCleanupSnapshotHash } from "../template/scripts/design-automation-hub/contract.mjs";
import { startStandalone } from "../template/scripts/design-automation-hub/standalone.mjs";

const ACCESS_CODE = "local-acceptance-code";
const FILE_KEY = "fixture-file-key";
const MEMBERS = JSON.stringify([{ accessCode: ACCESS_CODE, id: "member-1", displayName: "設計師 A", roles: ["designer"] }]);

const SCOPE = { nodeId: "1:2", type: "SECTION", name: "Cards" };
const SNAPSHOT = {
  schemaVersion: 1,
  scope: SCOPE,
  nodes: [
    {
      id: "1:2",
      type: "SECTION",
      name: "Cards",
      parentId: null,
      index: 0,
      visible: true,
      locked: false,
      childIds: [],
      absoluteBounds: { x: 0, y: 0, width: 100, height: 80 },
    },
  ],
};

const servers = [];
after(() => {
  for (const server of servers) server.close();
});

function makeProject({ binding } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "hub-regression-"));
  const root = path.join(base, "app-alpha");
  fs.mkdirSync(path.join(root, ".design-automation"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".design-automation", "project.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      project: { id: "aurora", displayName: "Project Aurora", figmaFileKeys: [FILE_KEY] },
      host: { mode: "standalone", adapter: null },
      features: { cleanup: true, review: false, workflowStatus: true },
    })}\n`,
  );
  if (binding) {
    fs.writeFileSync(path.join(root, ".design-automation", "task-board.json"), `${JSON.stringify(binding)}\n`, {
      mode: 0o600,
    });
  }
  return root;
}

async function startOn(root) {
  const previousMembers = process.env.DESIGN_AUTOMATION_MEMBERS_JSON;
  process.env.DESIGN_AUTOMATION_MEMBERS_JSON = MEMBERS;
  const server = startStandalone({ projectRoot: root, port: 0 });
  servers.push(server);
  if (previousMembers === undefined) delete process.env.DESIGN_AUTOMATION_MEMBERS_JSON;
  else process.env.DESIGN_AUTOMATION_MEMBERS_JSON = previousMembers;
  await new Promise((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

test("未綁定：健康檢查回報 extractionQueue false 且 dispatch false", async () => {
  const origin = await startOn(makeProject());
  const health = await (await fetch(`${origin}/healthz`)).json();
  assert.deepEqual(health, { status: "ok", schemaVersion: 1, extractionQueue: false, dispatch: false });
});

test("已綁定：健康檢查的 extractionQueue 仍是 false，只有 dispatch 變 true", async () => {
  const root = makeProject({
    binding: { schemaVersion: 1, controlPlaneUrl: "https://board.example.com", token: "wtk_test" },
  });
  const origin = await startOn(root);
  const health = await (await fetch(`${origin}/healthz`)).json();
  assert.deepEqual(health, { status: "ok", schemaVersion: 1, extractionQueue: false, dispatch: true });
});

test("已綁定：standalone 的 review 仍為 false，cleanup 與 workflowStatus 仍為 true", async () => {
  const root = makeProject({
    binding: { schemaVersion: 1, controlPlaneUrl: "https://board.example.com", token: "wtk_test" },
  });
  const origin = await startOn(root);
  const context = await (
    await fetch(`${origin}/v1/plugin/context?fileKey=${FILE_KEY}`, {
      headers: { Authorization: `Bearer ${ACCESS_CODE}` },
    })
  ).json();
  assert.equal(context.project.displayName, "Project Aurora");
  assert.deepEqual(context.features, { cleanup: true, review: false, workflowStatus: true });
});

test("派工模式沒有新增任何端點：萃取相關路徑一律 404", async () => {
  const root = makeProject({
    binding: { schemaVersion: 1, controlPlaneUrl: "https://board.example.com", token: "wtk_test" },
  });
  const origin = await startOn(root);
  for (const pathName of ["/v1/extraction/queue", "/v1/automation/scan", "/v1/dispatch"]) {
    const res = await fetch(`${origin}${pathName}`, { headers: { Authorization: `Bearer ${ACCESS_CODE}` } });
    assert.equal(res.status, 404, `${pathName} 不該存在`);
  }
});

test("未綁定：建立任務仍在本機分析（沒有派工，任務直接離開 queued）", async () => {
  const origin = await startOn(makeProject());
  const created = await (
    await fetch(`${origin}/v1/automation/tasks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_CODE}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        taskType: "figma-cleanup",
        fileKey: FILE_KEY,
        scope: SCOPE,
        snapshot: SNAPSHOT,
        inputSnapshotHash: computeCleanupSnapshotHash(SNAPSHOT, SCOPE),
        idempotencyKey: "regression-1",
      }),
    })
  ).json();
  assert.equal(created.created, true);
  assert.equal(created.task.status, "queued");

  // 本機分析會實際嘗試呼叫 agent-automation-orchestrate；這個 fixture 沒裝，
  // 因此任務會落到 blocked。重點是它「離開了 queued」——沒有停在等待 worker 的狀態。
  const deadline = Date.now() + 5000;
  let detail;
  while (Date.now() < deadline) {
    detail = await (
      await fetch(`${origin}/v1/automation/tasks/${created.task.id}`, {
        headers: { Authorization: `Bearer ${ACCESS_CODE}` },
      })
    ).json();
    if (detail.status !== "queued") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.notEqual(detail.status, "queued", "未綁定時必須立刻本機分析，不得停在 queued");
  assert.equal(detail.dispatch, undefined, "未綁定的任務不得帶派工資訊");
});
