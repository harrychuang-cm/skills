import React from "react";

import { DRAFT_STATUS_TEXT } from "../../shared/protocol";
import { discardAll, removeDraft, setCompare } from "../actions";
import { shortName } from "../drafts";
import { useStore } from "../store";
import { Change, Chip, Detail, Footer, FooterBar, SmallButton } from "../styles";

type Props = { prefix: string; applyEnabled: boolean; applyHint: string; onApply: () => void; applying: boolean; children?: React.ReactNode };

export function ChangesList({ prefix, applyEnabled, applyHint, onApply, applying, children }: Props) {
  const drafts = useStore((s) => s.drafts);
  const previewState = useStore((s) => s.previewState);
  const compare = useStore((s) => s.compare);
  const holdOn = () => setCompare(true);
  const holdOff = () => setCompare(false);

  return (
    <Footer data-code-layer-changes={drafts.length}>
      {drafts.map((draft) => {
        const status = previewState[draft.id];
        const message = status?.message && status.status !== "paused" ? ` · ${status.message}` : "";
        return (
          <Change key={draft.id} data-code-layer-draft={draft.id}>
            <div>
              <div>
                {`${draft.rowLabel} · ${draft.elementLabel}：${shortName(draft.op.fromToken, prefix)} → `}
                <strong>{shortName(draft.op.toToken, prefix)}</strong>{" "}
                {status ? <Chip tone={status.status}>{DRAFT_STATUS_TEXT[status.status]}</Chip> : null}
              </div>
              <Detail style={{ marginLeft: 0 }}>
                {`寫入 ${draft.writesTo.files[0]}:${draft.writesTo.line}${draft.writesTo.files.length > 1 ? "（＋鏡像）" : " "}· 影響 ${draft.writesTo.impact} 處宣告${message}`}
              </Detail>
            </div>
            <SmallButton type="button" aria-label={`移除 ${draft.rowLabel} 的變更`} onClick={() => removeDraft(draft.id)} disabled={applying}>
              ×
            </SmallButton>
          </Change>
        );
      })}
      {children}
      {/* The action bar stays at the bottom edge so the buttons never move under the pointer. */}
      <FooterBar style={{ marginTop: drafts.length > 0 ? 8 : 0 }}>
        <strong style={{ marginRight: "auto" }}>變更（{drafts.length}）</strong>
        <SmallButton
          type="button"
          disabled={drafts.length === 0}
          aria-pressed={compare}
          data-code-layer-action="compare"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            holdOn();
          }}
          onPointerUp={holdOff}
          onPointerCancel={holdOff}
          onLostPointerCapture={holdOff}
          onBlur={holdOff}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === " " || event.key === "Enter") holdOn();
          }}
          onKeyUp={(event) => {
            if (event.key === " " || event.key === "Enter") holdOff();
          }}
          title="按住時暫時顯示原本的樣子"
        >
          {compare ? "原始樣式" : "按住對照"}
        </SmallButton>
        <SmallButton type="button" disabled={drafts.length === 0 || applying} onClick={discardAll} data-code-layer-action="discard">
          全部捨棄
        </SmallButton>
        <SmallButton
          type="button"
          primary
          disabled={!applyEnabled || drafts.length === 0 || applying}
          title={applyHint}
          onClick={onApply}
          data-code-layer-action="apply"
        >
          {applying ? "套用中…" : "套用"}
        </SmallButton>
      </FooterBar>
    </Footer>
  );
}
