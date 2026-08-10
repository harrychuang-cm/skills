"use client";
// 五欄看板：卡片移動由系統事件驅動（SSE 推播 → 重抓），
// 人的介入只在收件匣兩欄（3.3 接上拖曳指令）。
import { useCallback, useEffect, useState } from "react";
import type { BoardCard, BoardState } from "@/lib/board";

const COLUMNS: Array<{ key: string; title: string; tone: string; inbox?: boolean }> = [
  { key: "CLAIMABLE", title: "待領取", tone: "idle" },
  { key: "RUNNING", title: "執行中", tone: "link" },
  { key: "NEEDS_ATTENTION", title: "需要處理", tone: "stop", inbox: true },
  { key: "AWAITING_REVIEW", title: "待確認", tone: "warn", inbox: true },
  { key: "DONE", title: "完成", tone: "ok" },
];

const REASON_LABELS: Record<string, string> = {
  "possibly-stopped": "可能已停止（心跳中斷）",
  "verification-failed": "完成檢查沒通過",
  exhausted: "所有 AI 工具都失敗",
};

export default function Board({ initial }: { initial: BoardState }) {
  const [state, setState] = useState(initial);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/board");
    if (res.ok) setState(await res.json());
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.addEventListener("refresh", refresh);
    return () => source.close();
  }, [refresh]);

  const approve = useCallback(
    async (cardId: string) => {
      await fetch(`/api/cards/${cardId}/approve`, { method: "POST" });
      await refresh();
    },
    [refresh],
  );

  // 拖曳=指令：不是改狀態。合法目的地由這張表決定，伺服器端的封閉轉移表再守一次。
  const command = useCallback(
    async (cardId: string, cmd: "rerun" | "approve", askNote: boolean) => {
      const note = askNote ? (window.prompt("要附上什麼調整說明？（可留空）") ?? undefined) : undefined;
      const res = await fetch(`/api/cards/${cardId}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, note: note || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(`指令被拒：${data.error ?? res.status}`);
      }
      await refresh();
    },
    [refresh],
  );

  const dropCommandFor = (fromColumn: string, toColumn: string): "rerun" | "approve" | null => {
    if ((fromColumn === "NEEDS_ATTENTION" || fromColumn === "AWAITING_REVIEW") && (toColumn === "CLAIMABLE" || toColumn === "RUNNING")) {
      return "rerun";
    }
    if (fromColumn === "AWAITING_REVIEW" && toColumn === "DONE") {
      return "approve";
    }
    return null;
  };

  return (
    <div className="board">
      {COLUMNS.map((column) => {
        const cards = state.cards.filter((card) => card.column === column.key);
        return (
          <section
            key={column.key}
            className={`column tone-${column.tone}${column.inbox ? " inbox" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const cardId = e.dataTransfer.getData("text/card-id");
              const fromColumn = e.dataTransfer.getData("text/card-column");
              if (!cardId || !fromColumn) return;
              const cmd = dropCommandFor(fromColumn, column.key);
              if (!cmd) {
                window.alert("這個方向的拖曳不是合法指令：卡片欄位由系統事件決定");
                return;
              }
              void command(cardId, cmd, cmd === "rerun");
            }}
          >
            <header className="column-head">
              <span className="dot" />
              <h2>{column.title}</h2>
              <span className="count">{cards.length}</span>
              {column.inbox && <span className="inbox-tag">等你處理</span>}
            </header>
            <div className="cards">
              {cards.map((card) => (
                <Card key={card.id} card={card} onApprove={approve} onCommand={command} />
              ))}
              {cards.length === 0 && <p className="empty">目前沒有卡片</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Card({
  card,
  onApprove,
  onCommand,
}: {
  card: BoardCard;
  onApprove: (id: string) => void;
  onCommand: (id: string, cmd: "rerun" | "approve", askNote: boolean) => void;
}) {
  const draggable = card.column === "NEEDS_ATTENTION" || card.column === "AWAITING_REVIEW";
  return (
    <article
      className="card"
      data-card-id={card.id}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/card-id", card.id);
        e.dataTransfer.setData("text/card-column", card.column);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="card-project">{card.projectName}</div>
      <a className="card-title" href={`/cards/${card.id}`}>
        {card.taskId}
      </a>
      <div className="card-badges">
        <span className="badge">{card.origin === "PIPELINE_CHAIN" ? "接棒" : "手動"}</span>
        {card.reviewGate && <span className="badge">需 review</span>}
        {!card.approved && card.column === "CLAIMABLE" && <span className="badge badge-warn">待放行</span>}
      </div>
      {card.stage && (
        <div className="card-stage" title={`流水線第 ${card.stage.index}/${card.stage.total} 階段`}>
          {Array.from({ length: card.stage.total }, (_, i) => (
            <span key={i} className={`stage-dot${i < card.stage!.index ? " on" : ""}`} />
          ))}
          <span className="stage-label">
            階段 {card.stage.index}/{card.stage.total}
          </span>
        </div>
      )}
      {card.attribution && (
        <div className="card-attribution">
          {card.attribution.member} · {card.attribution.machine}
          {card.attribution.runner ? ` · ${card.attribution.runner}` : ""}
        </div>
      )}
      {card.attentionReason && (
        <div className="card-reason">{REASON_LABELS[card.attentionReason] ?? card.attentionReason}</div>
      )}
      {card.note && <p className="card-note">{card.note}</p>}
      {!card.approved && card.column === "CLAIMABLE" && (
        <button className="btn" onClick={() => onApprove(card.id)}>
          放行執行
        </button>
      )}
      {(card.column === "NEEDS_ATTENTION" || card.column === "AWAITING_REVIEW") && (
        <div className="card-actions">
          <button className="btn" onClick={() => onCommand(card.id, "rerun", true)}>
            附說明重跑
          </button>
          {card.column === "AWAITING_REVIEW" && (
            <button className="btn btn-ok" onClick={() => onCommand(card.id, "approve", false)}>
              批准完成
            </button>
          )}
        </div>
      )}
    </article>
  );
}
