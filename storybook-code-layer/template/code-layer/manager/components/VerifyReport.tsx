import React from "react";

import { reloadPreviewAndVerify, retryVerification, skipApplied, undoApplied } from "../apply";
import { shortName } from "../drafts";
import { useStore } from "../store";
import { Chip, Detail, FooterBar, SmallButton, Warn } from "../styles";

const APPLY_TEXT: Record<string, string> = {
  "verified": "已寫入並驗證",
  "written-not-observable": "已寫入，此頁看不到效果",
  "mismatch": "已寫入，但畫面與預覽不符",
  "timeout": "已寫入，但頁面樣式沒有在時限內更新",
};
const UNDO_TEXT: Record<string, string> = {
  "verified": "已還原並驗證",
  "written-not-observable": "已還原，此頁看不到效果",
  "mismatch": "已還原，但畫面與原本不符",
  "timeout": "已還原，但頁面樣式沒有在時限內更新",
};
const ITEM_TEXT: Record<string, string> = {
  "verified": "已驗證",
  "written-not-observable": "此頁看不到效果",
  "mismatch": "不符",
  "timeout": "逾時",
};
const ERROR_TEXT: Record<string, string> = {
  "check-failed": "檢查沒有通過，沒有寫入任何檔案。",
  "mirror-drift": "真相檔與鏡像不一致，所有套用都已停用（請先執行 sync-mirror）。",
  "stale-before": "原始碼在預覽之後被改過，沒有寫入。請重新選擇 token。",
  "undo-conflict": "套用之後檔案又被改過，無法自動還原。可以略過這一筆（備份會保留）。",
  "checks-baseline-failing": "專案在未修改的狀態下就沒有通過檢查，token 類的套用已停用。",
  "checks-unavailable": "檢查腳本不存在或已變更，token 類的套用已停用。",
  "read-only": "Code Layer 伺服器目前是唯讀模式。",
};

export function VerifyReport({ prefix }: { prefix: string }) {
  const state = useStore((s) => s.applyState);
  const undoStack = useStore((s) => s.status?.storyId);
  void undoStack;
  if (state.phase === "idle") return null;
  const busy = state.phase === "arming" || state.phase === "writing" || state.phase === "verifying" || state.phase === "undoing";
  const labels = Object.fromEntries(state.drafts.map((d) => [d.id, `${d.rowLabel} · ${d.elementLabel}：${shortName(d.op.fromToken, prefix)} → ${shortName(d.op.toToken, prefix)}`]));
  const headline = state.error
    ? `沒有${state.phase === "done" && state.applyId ? "還原" : "套用"}：${ERROR_TEXT[state.error.code] ?? state.error.message}`
    : busy
      ? state.phase === "verifying"
        ? state.mode === "undo"
          ? "已還原，驗證中…"
          : "已寫入，驗證中…"
        : state.phase === "undoing"
          ? "還原中…"
          : "套用中…"
      : state.result
        ? (state.mode === "undo" ? UNDO_TEXT : APPLY_TEXT)[state.result.status] ?? state.result.status
        : "";
  const details = state.error?.details as { results?: Array<{ id: string; output?: string }>; conflicts?: Array<{ file: string; backup: string }> } | undefined;
  return (
    <div data-code-layer-report={state.result?.status ?? state.phase} data-code-layer-report-mode={state.mode} style={{ marginTop: 8 }}>
      <div>
        <strong>{headline}</strong>{" "}
        {state.result && !busy ? <Chip tone={state.result.status === "written-not-observable" ? "paused" : state.result.status}>{state.mode === "undo" ? "還原" : "套用"}</Chip> : null}
      </div>
      {state.progress ? <Detail style={{ marginLeft: 0 }}>{state.progress}</Detail> : null}
      {state.applyId ? <Detail style={{ marginLeft: 0 }}>{`紀錄：${state.applyId}`}</Detail> : null}
      {state.result?.items.map((item) => (
        <Detail key={item.draftId} style={{ marginLeft: 0 }} data-code-layer-verify-item={item.draftId} data-status={item.status}>
          {`${labels[item.draftId] ?? item.draftId}：${ITEM_TEXT[item.status] ?? item.status}`}
          {item.expected || item.actual ? `（預期 ${item.expected ?? "—"}，實際 ${item.actual ?? "—"}）` : ""}
          {item.reason ? ` · ${item.reason}` : ""}
        </Detail>
      ))}
      {details?.results?.map((r) => (
        <Detail key={r.id} style={{ marginLeft: 0 }}>
          <Warn>{`${r.id}：${(r.output ?? "").slice(-400)}`}</Warn>
        </Detail>
      ))}
      {details?.conflicts?.map((c) => (
        <Detail key={c.file} style={{ marginLeft: 0 }}>
          <Warn>{`${c.file}（備份：${c.backup}）`}</Warn>
        </Detail>
      ))}
      {state.skipped ? <Detail style={{ marginLeft: 0 }}>已略過這一筆的還原，備份保留。</Detail> : null}
      {state.applyId && !busy ? (
        <FooterBar style={{ marginTop: 6 }}>
          {state.mode === "apply" && !state.undone && !state.skipped ? (
            <SmallButton type="button" onClick={() => void undoApplied()} data-code-layer-action="undo">
              還原這次套用
            </SmallButton>
          ) : null}
          {state.error?.code === "undo-conflict" && !state.skipped ? (
            <SmallButton type="button" onClick={() => void skipApplied()} data-code-layer-action="skip">
              略過這一筆
            </SmallButton>
          ) : null}
          {!state.error ? (
            <>
              <SmallButton type="button" onClick={() => void retryVerification()} data-code-layer-action="reverify">
                重新驗證
              </SmallButton>
              <SmallButton type="button" onClick={reloadPreviewAndVerify} data-code-layer-action="reload-verify">
                重新整理預覽並驗證
              </SmallButton>
            </>
          ) : null}
        </FooterBar>
      ) : null}
    </div>
  );
}
