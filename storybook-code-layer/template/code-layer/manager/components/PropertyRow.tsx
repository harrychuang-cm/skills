import React from "react";

import { READ_ONLY_TEXT } from "../../shared/properties";
import { DRAFT_STATUS_TEXT, type Draft, type ElementTrace, type IndexJson, type RowTrace } from "../../shared/protocol";
import { rowDraftId, shortName } from "../drafts";
import { store, useStore } from "../store";
import { Chip, Detail, Pill, RowBox, RowLabel, RowMain, Swatch, Value, Warn } from "../styles";
import { TokenPicker } from "./TokenPicker";

const WARNING_TEXT: Record<string, string> = {
  "undefined-token": "引用的名稱沒有定義",
  "not-a-design-token": "引用的是 Storybook 外框樣式的變數，不是 design token",
  "references-ref": "直接引用 ref token",
  "overridden-in-theme": "鏈上有 token 在目前主題下被覆寫",
};

type Props = { trace: ElementTrace; row: RowTrace; index: IndexJson; editable: boolean };

export function PropertyRow({ trace, row, index, editable: modeEditable }: Props) {
  const prefix = index.tokens.prefix;
  const draftKey = rowDraftId(row);
  const draft: Draft | undefined = useStore((s) => s.drafts.find((d) => d.id === draftKey));
  const status = useStore((s) => (draftKey ? s.previewState[draftKey] : undefined));
  const tokenValues = useStore((s) => s.tokenValues);
  const open = useStore((s) => s.pickerRow === row.id);
  const editable = modeEditable && row.editableInProof && (row.verdict.kind === "rebind-token" || row.verdict.kind === "rebind-declaration");
  const sourceToken = row.verdict.kind === "rebind-token" ? row.verdict.fromToken : row.tokenName;
  const shownToken = draft ? draft.op.toToken : sourceToken;
  const liveValue = draft ? tokenValues[draft.op.toToken] ?? "" : row.computedDisplay;
  const isColor = row.id === "fill" || row.id === "color";
  const toggle = () => {
    if (!editable) return;
    store.set({ pickerRow: open ? null : row.id });
  };

  const chain = row.chain.map((link) => shortName(link.name, prefix)).join(" → ");
  const lastValue = row.chain[row.chain.length - 1]?.value;
  const readOnlyReason = !row.editableInProof
    ? READ_ONLY_TEXT["not-in-proof"]
    : row.verdict.kind === "read-only"
      ? READ_ONLY_TEXT[row.verdict.reason] ?? row.verdict.reason
      : null;

  return (
    <RowBox editable={editable} open={open} data-code-layer-row={row.id} onClick={toggle}>
      <RowMain>
        <RowLabel>{row.label}</RowLabel>
        <Value>
          {isColor && liveValue ? <Swatch color={liveValue} /> : null}
          <span>{draft ? liveValue || row.computedDisplay : row.computedDisplay}</span>
          {shownToken ? (
            <Pill tone={draft ? "staged" : "token"} title={shownToken}>
              {shortName(shownToken, prefix)}
            </Pill>
          ) : null}
        </Value>
        {status ? <Chip tone={status.status}>{DRAFT_STATUS_TEXT[status.status]}</Chip> : editable ? <Pill tone="muted">換 token</Pill> : <span />}
      </RowMain>
      {draft ? <Detail>原本：{shortName(draft.op.fromToken, prefix)}</Detail> : null}
      {chain ? (
        <Detail>
          {chain}
          {lastValue ? ` = ${lastValue}` : ""}
          {row.chain.some((l) => l.status === "overridden") ? (
            <Warn>（{row.chain.find((l) => l.status === "overridden")?.overriddenBy?.file} 覆寫）</Warn>
          ) : null}
        </Detail>
      ) : null}
      {row.writesTo && row.editableInProof ? (
        <Detail>
          {`寫入 ${row.writesTo.files[0]}:${row.writesTo.line}${
            row.writesTo.files.length > 1 ? `（＋鏡像 ${row.writesTo.files.slice(1).join("、")}）` : " "
          }· 影響 ${row.writesTo.impact} 處宣告`}
        </Detail>
      ) : null}
      {row.verdict.kind === "rebind-declaration" && row.verdict.warnings.length > 0 ? (
        <Detail>
          <Warn>{row.verdict.warnings.map((w) => WARNING_TEXT[w] ?? w).join("；")}</Warn>
        </Detail>
      ) : null}
      {readOnlyReason ? <Detail>{readOnlyReason}</Detail> : null}
      {status?.message ? <Detail>{status.message}</Detail> : null}
      {open && editable && shownToken ? (
        <TokenPicker trace={trace} row={row} index={index} currentToken={shownToken} onClose={() => store.set({ pickerRow: null })} />
      ) : null}
    </RowBox>
  );
}
