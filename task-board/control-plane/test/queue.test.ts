// 佇列整合測試：對 dev PostgreSQL 實測 CAS claim、冪等 report、heartbeat。
// 前置：npm run dev-db 必須在跑（README 記載）。
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:54329/taskboard";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { claimCard, heartbeatLease, reportRun, tryClaimCandidate } from "../src/lib/queue.ts";

const db = new PrismaClient();
const identity = { memberId: "", tokenId: "test-token" };
let machineA = "";
let machineB = "";
let cardId = "";

async function resetDb() {
  await db.logChunk.deleteMany();
  await db.run.deleteMany();
  await db.cardEvent.deleteMany();
  await db.lease.deleteMany();
  await db.card.deleteMany();
  await db.taskChainEntry.deleteMany();
  await db.externalRun.deleteMany();
  await db.projectSnapshot.deleteMany();
  await db.project.deleteMany();
  await db.machine.deleteMany();
  await db.workerToken.deleteMany();
  await db.member.deleteMany();
}

before(async () => {
  await resetDb();
  const member = await db.member.create({ data: { email: "queue-test@example.com", name: "測試成員" } });
  identity.memberId = member.id;
  const a = await db.machine.create({
    data: { machineId: "machine-a", memberId: member.id, runners: ["claude"] },
  });
  const b = await db.machine.create({
    data: { machineId: "machine-b", memberId: member.id, runners: ["codex"] },
  });
  machineA = a.machineId;
  machineB = b.machineId;
  const project = await db.project.create({ data: { slug: "proj-test", displayName: "測試專案" } });
  const card = await db.card.create({
    data: { projectId: project.id, taskId: "extract", column: "CLAIMABLE", origin: "MEMBER", autoRun: true, reviewGate: false },
  });
  cardId = card.id;
  // 未放行的卡：autoRun false 且無 approval，不得被領取
  await db.card.create({
    data: { projectId: project.id, taskId: "unapproved-task", column: "CLAIMABLE", origin: "MEMBER", autoRun: false, reviewGate: true },
  });
});

after(async () => {
  await db.$disconnect();
});

let leaseId = "";

test("CAS：同一張卡快照兩方搶佔，恰一成功", async () => {
  // 兩方都拿到同一份卡快照（模擬同時輪詢），依序搶佔——revision CAS 保證恰一成功
  const snapshot = await db.card.findUniqueOrThrow({ where: { id: cardId } });
  const [a, b] = await Promise.all([
    db.machine.findUniqueOrThrow({ where: { machineId: machineA } }),
    db.machine.findUniqueOrThrow({ where: { machineId: machineB } }),
  ]);
  const [first, second] = await Promise.all([
    tryClaimCandidate(db, identity, a, snapshot, "claude"),
    tryClaimCandidate(db, identity, b, snapshot, "codex"),
  ]);
  const leases = [first, second].filter((x) => x !== null);
  assert.equal(leases.length, 1, "恰一方搶到 lease");
  leaseId = leases[0]!.id;

  const card = await db.card.findUniqueOrThrow({ where: { id: cardId } });
  assert.equal(card.column, "RUNNING");
  const activeLeases = await db.lease.findMany({ where: { cardId, active: true }, include: { machine: true } });
  assert.equal(activeLeases.length, 1, "恰一個 active lease");
  const lease = activeLeases[0];
  assert.equal(lease.memberId, identity.memberId, "歸屬：member");
  assert.ok([machineA, machineB].includes(lease.machine.machineId), "歸屬：machine");
  assert.ok(["claude", "codex"].includes(lease.runnerId ?? ""), "歸屬：runner");
});

test("claim API 對已被搶走的卡不重複發放", async () => {
  // 卡已 RUNNING：佇列只剩未放行卡 → empty；恰一 active lease 不變
  const result = await claimCard(db, identity, { machineId: machineB, projects: ["proj-test"], runnerId: "codex" });
  assert.equal(result.status, "empty");
  const activeLeases = await db.lease.findMany({ where: { cardId, active: true } });
  assert.equal(activeLeases.length, 1);
});

test("未放行的卡不被領取：佇列剩它時 claim 回 empty", async () => {
  const result = await claimCard(db, identity, { machineId: machineB, projects: ["proj-test"] });
  assert.equal(result.status, "empty");
});

test("heartbeat 延展 active lease", async () => {
  const before = await db.lease.findUniqueOrThrow({ where: { id: leaseId } });
  const result = await heartbeatLease(db, identity, { leaseId });
  assert.equal(result.status, "ok");
  const after = await db.lease.findUniqueOrThrow({ where: { id: leaseId } });
  assert.ok(after.expiresAt.getTime() >= before.expiresAt.getTime());
});

test("report 冪等：同 runId 終態重送不產生重複轉移", async () => {
  const running = await reportRun(db, identity, { leaseId, runId: "run-001", phase: "running" });
  assert.equal(running.status, "recorded");

  const done = await reportRun(db, identity, { leaseId, runId: "run-001", phase: "completed" });
  assert.equal(done.status, "recorded");
  assert.equal(done.cardColumn, "DONE", "reviewGate=false 直接完成");

  const dup = await reportRun(db, identity, { leaseId, runId: "run-001", phase: "completed" });
  assert.equal(dup.status, "idempotent");

  const runs = await db.run.findMany({ where: { runId: "run-001" } });
  assert.equal(runs.length, 1, "runId 只有一筆 Run");
  const transitions = await db.cardEvent.findMany({ where: { cardId, event: "RUN_COMPLETED" } });
  assert.equal(transitions.length, 1, "完成轉移只發生一次");
  const lease = await db.lease.findUniqueOrThrow({ where: { id: leaseId } });
  assert.equal(lease.active, false, "終態釋放 lease");
});

test("report 後 heartbeat 回 stale", async () => {
  const result = await heartbeatLease(db, identity, { leaseId });
  assert.equal(result.status, "stale");
});
