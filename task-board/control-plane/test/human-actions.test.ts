// 人工介入指令整合測試（前置：npm run dev-db）
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:54329/taskboard";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { IllegalTransitionError } from "../src/lib/card-transitions.ts";
import { setProjectChain } from "../src/lib/cards.ts";
import { approveReview, rerunCard } from "../src/lib/human-actions.ts";
import { claimCard, reportRun } from "../src/lib/queue.ts";

const db = new PrismaClient();
const identity = { memberId: "", tokenId: "human-test-token" };
const SLUG = "proj-human";
let machineId = "chain-human-machine";
let cardId = "";

before(async () => {
  const stale = await db.project.findUnique({ where: { slug: SLUG } });
  if (stale) {
    await db.logChunk.deleteMany({ where: { card: { projectId: stale.id } } });
    await db.run.deleteMany({ where: { card: { projectId: stale.id } } });
    await db.cardEvent.deleteMany({ where: { card: { projectId: stale.id } } });
    await db.lease.deleteMany({ where: { card: { projectId: stale.id } } });
    await db.card.deleteMany({ where: { projectId: stale.id } });
    await db.taskChainEntry.deleteMany({ where: { projectId: stale.id } });
    await db.project.delete({ where: { id: stale.id } });
  }
  const member = await db.member.upsert({
    where: { email: "human-test@example.com" },
    update: {},
    create: { email: "human-test@example.com", name: "介入測試" },
  });
  identity.memberId = member.id;
  await db.machine.upsert({
    where: { machineId },
    update: { memberId: member.id },
    create: { machineId, memberId: member.id, runners: ["claude"] },
  });
  await setProjectChain(db, {
    projectSlug: SLUG,
    entries: [
      { taskId: "extract", requiresReview: true },
      { taskId: "storybook", requiresReview: true },
    ],
  });
  const project = await db.project.findUniqueOrThrow({ where: { slug: SLUG } });
  const card = await db.card.create({
    data: { projectId: project.id, taskId: "extract", column: "CLAIMABLE", origin: "MEMBER", autoRun: true, reviewGate: true },
  });
  cardId = card.id;
});

after(async () => {
  await db.$disconnect();
});

test("rerun：需要處理 → 待領取，帶前次 runId 與調整說明，下次領取交付 resume 指令", async () => {
  // 走到需要處理：claim → verification-failed
  const claim1 = await claimCard(db, identity, { machineId, projects: [SLUG], runnerId: "claude" });
  assert.equal(claim1.status, "claimed");
  if (claim1.status !== "claimed") return;
  await reportRun(db, identity, { leaseId: claim1.card.leaseId, runId: "human-run-001", phase: "verification-failed" });
  let card = await db.card.findUniqueOrThrow({ where: { id: cardId } });
  assert.equal(card.column, "NEEDS_ATTENTION");

  await rerunCard(db, identity.memberId, cardId, "採用 B 案的間距");
  card = await db.card.findUniqueOrThrow({ where: { id: cardId } });
  assert.equal(card.column, "CLAIMABLE");
  assert.equal(card.resumePreviousRunId, "human-run-001");
  assert.equal(card.resumeNote, "採用 B 案的間距");

  const event = await db.cardEvent.findFirstOrThrow({ where: { cardId, event: "HUMAN_RERUN" } });
  assert.equal(event.actorType, "member");
  assert.equal(event.actorId, identity.memberId);
  assert.equal(event.note, "採用 B 案的間距");

  const claim2 = await claimCard(db, identity, { machineId, projects: [SLUG], runnerId: "claude" });
  assert.equal(claim2.status, "claimed");
  if (claim2.status !== "claimed") return;
  assert.deepEqual(claim2.card.resume, { previousRunId: "human-run-001", note: "採用 B 案的間距" });
});

test("非法指令被拒：執行中的卡不能 rerun，卡片不動", async () => {
  await assert.rejects(
    () => rerunCard(db, identity.memberId, cardId),
    (error: unknown) => error instanceof IllegalTransitionError,
  );
  const card = await db.card.findUniqueOrThrow({ where: { id: cardId } });
  assert.equal(card.column, "RUNNING", "卡片不動");
});

test("approve：待確認 → 完成，觸發流水線接棒，記錄批准者", async () => {
  // 完成（有 review gate）→ 待確認
  const lease = await db.lease.findFirstOrThrow({ where: { cardId, active: true } });
  await reportRun(db, identity, { leaseId: lease.id, runId: "human-run-002", phase: "completed", resumedFrom: "human-run-001" });
  let card = await db.card.findUniqueOrThrow({ where: { id: cardId } });
  assert.equal(card.column, "AWAITING_REVIEW");

  await assert.rejects(
    () => approveReview(db, identity.memberId, cardId).then(() => rerunCard(db, identity.memberId, cardId)),
    (error: unknown) => error instanceof IllegalTransitionError,
    "完成後不能再 rerun",
  );

  card = await db.card.findUniqueOrThrow({ where: { id: cardId } });
  assert.equal(card.column, "DONE");
  const event = await db.cardEvent.findFirstOrThrow({ where: { cardId, event: "HUMAN_APPROVE" } });
  assert.equal(event.actorId, identity.memberId);

  const successor = await db.card.findFirst({ where: { project: { slug: SLUG }, taskId: "storybook" } });
  assert.ok(successor, "批准進完成欄同樣觸發接棒");
  assert.equal(successor!.origin, "PIPELINE_CHAIN");
});
