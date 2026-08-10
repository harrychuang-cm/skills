import type { Prisma } from "@prisma/client";
import { attentionReasonFor, nextColumn, type CardColumn, type CardEventName } from "./card-state.ts";

export class IllegalTransitionError extends Error {
  readonly current: CardColumn;
  readonly event: CardEventName;
  constructor(current: CardColumn, event: CardEventName) {
    super(`illegal transition: ${event} from ${current}`);
    this.current = current;
    this.event = event;
  }
}

export type TransitionActor = { type: "system" | "member" | "worker"; id?: string };

/**
 * 在交易內套用卡片事件：驗證封閉轉移表 → 更新欄位與 revision → 寫卡片歷史。
 * 非法轉移丟 IllegalTransitionError，卡片不動。
 */
export async function applyCardEvent(
  tx: Prisma.TransactionClient,
  cardId: string,
  event: CardEventName,
  actor: TransitionActor,
  options: { note?: string; resumePreviousRunId?: string } = {},
) {
  const card = await tx.card.findUniqueOrThrow({ where: { id: cardId } });
  const current = card.column as CardColumn;
  const to = nextColumn(current, event);
  if (to === null) {
    throw new IllegalTransitionError(current, event);
  }

  const attentionReason = attentionReasonFor(event);
  const updated = await tx.card.update({
    where: { id: cardId },
    data: {
      column: to,
      revision: { increment: 1 },
      attentionReason: to === "NEEDS_ATTENTION" ? attentionReason : null,
      // 人工拖回時掛上 resume 指令；卡片被領走時清掉（已交付 worker）
      ...(event === "HUMAN_RERUN"
        ? { resumeNote: options.note ?? null, resumePreviousRunId: options.resumePreviousRunId ?? null }
        : {}),
    },
  });
  await tx.cardEvent.create({
    data: {
      cardId,
      event,
      fromColumn: current,
      toColumn: to,
      actorType: actor.type,
      actorId: actor.id,
      note: options.note,
    },
  });
  return updated;
}
