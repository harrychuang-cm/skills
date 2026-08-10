// 人工介入指令：拖曳（或按鈕）不是改狀態，而是下指令——
// rerun：附調整說明重跑（帶前次 runId 作 resume 指令）；approve：批准待確認的卡結案。
import type { PrismaClient } from "@prisma/client";
import { applyCardEvent } from "./card-transitions.ts";
import { maybeCreateSuccessorCard } from "./chain.ts";

/** 重跑：卡回到待領取，掛上 resume 指令（前次 runId + 調整說明）。 */
export async function rerunCard(db: PrismaClient, memberId: string, cardId: string, note?: string) {
  return db.$transaction(async (tx) => {
    const latestRun = await tx.run.findFirst({ where: { cardId }, orderBy: { startedAt: "desc" } });
    // 收件匣的卡不應還有 active lease（終態或逾時都已釋放），防禦性再釋放一次
    await tx.lease.updateMany({ where: { cardId, active: true }, data: { active: false, releasedAt: new Date() } });
    return applyCardEvent(
      tx,
      cardId,
      "HUMAN_RERUN",
      { type: "member", id: memberId },
      { note, resumePreviousRunId: latestRun?.runId },
    );
  });
}

/** 批准：待確認 → 完成；進入完成欄同樣觸發流水線接棒。 */
export async function approveReview(db: PrismaClient, memberId: string, cardId: string, note?: string) {
  return db.$transaction(async (tx) => {
    const updated = await applyCardEvent(tx, cardId, "HUMAN_APPROVE", { type: "member", id: memberId }, { note });
    await maybeCreateSuccessorCard(tx, cardId);
    return updated;
  });
}
