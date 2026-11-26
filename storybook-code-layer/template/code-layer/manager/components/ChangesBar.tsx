import React from "react";

import { t, tMaybe } from "../../shared/i18n";
import { changeEnds, draftRowLabel, groupLabel, prettyToken, scopeLabel, shortToken } from "../../shared/labels";
import { pairingReport, type PairingEntry } from "../../shared/pairing.mjs";
import { isLayoutOp, opFrom, opTo, type Draft, type IndexJson } from "../../shared/protocol";
import { discardAll, removeDraft, setCompare, stageOffer } from "../actions";
import { CloseIcon, WarnIcon } from "../icons";
import { useStore } from "../store";
import { BarActions, Button, ChangeMain, ChangeRow, ChangeScroll, ChangeText, ChangesBox, Chip, Detail, Dot, IconButton, PreviewState, Warn } from "../styles";
import { impactText } from "./RowPopover";

type Props = { index: IndexJson | null; applyEnabled: boolean; applyHint: string; onApply: () => void; applying: boolean; dev: boolean; children?: React.ReactNode };

/** Pairing notes for the staged token changes, computed from the index: the same rule the server applies. */
function pairingFor(drafts: Draft[], index: IndexJson | null): Map<string, PairingEntry> {
  const out = new Map<string, PairingEntry>();
  if (!index?.governance) return out;
  const changes = drafts.flatMap((draft) => (draft.op.type === "rebind-token" ? [{ id: draft.id, token: draft.op.token, tier: draft.op.tier, fromToken: draft.op.fromToken, toToken: draft.op.toToken }] : []));
  if (changes.length === 0) return out;
  const tokens = new Map(index.tokens.items.map((token) => [token.name, token] as const));
  for (const entry of pairingReport({ prefix: index.tokens.prefix, pairing: index.governance.pairing, tokens, changes })) out.set(entry.operation, entry);
  return out;
}

/** A container color changed role and its content color did not follow: one short line, the explanation as its tooltip. */
export function PairingNote({ entry, prefix, onAccept }: { entry: PairingEntry; prefix: string; onAccept?: () => void }) {
  const ratio = entry.contrast.ratio;
  const why = entry.warning
    ? `${t("pairing.follows", { content: shortToken(entry.contentToken, prefix), role: entry.oldRole ?? "" })}${entry.sameResolved === true ? t("pairing.sameColor") : entry.sameResolved === false ? t("pairing.differentColor") : t("pairing.noPartner", { role: entry.newRole ?? "" })}`
    : "";
  const contrast =
    ratio === null
      ? t("pairing.contrastUnknown")
      : entry.previousRatio !== null && entry.previousRatio !== ratio
        ? t("pairing.contrastChange", { before: entry.previousRatio.toFixed(2), after: ratio.toFixed(2) })
        : t("pairing.contrast", { ratio: ratio.toFixed(2) });
  return (
    <Detail data-code-layer-pairing={entry.warning ?? "contrast"} title={[why, contrast].filter(Boolean).join(" ")} style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {entry.warning ? (
        <Warn style={{ display: "inline-flex" }}>
          <WarnIcon />
        </Warn>
      ) : null}
      <span data-code-layer-contrast={ratio ?? ""} style={{ marginRight: "auto" }}>
        {ratio === null ? t("pairing.contrastUnknown") : entry.previousRatio !== null && entry.previousRatio !== ratio ? t("pairing.short", { before: entry.previousRatio.toFixed(2), after: ratio.toFixed(2) }) : t("pairing.shortSame", { ratio: ratio.toFixed(2) })}
      </span>
      {entry.offer && onAccept ? (
        <Button type="button" onClick={onAccept} data-code-layer-action="pair-accept" title={`${t("pairing.acceptTitle")}${t("reference.colon")}${shortToken(entry.offer.toToken, prefix)}`} style={{ height: 20, padding: "0 6px" }}>
          {t("pairing.acceptShort")}
        </Button>
      ) : null}
    </Detail>
  );
}

/**
 * The staged changes, one line each, and the actions on them. Takes no space
 * while there is nothing staged and nothing to report.
 */
export function ChangesBar({ index, applyEnabled, applyHint, onApply, applying, dev, children }: Props) {
  const drafts = useStore((s) => s.drafts);
  const previewState = useStore((s) => s.previewState);
  const compare = useStore((s) => s.compare);
  const reporting = useStore((s) => s.applyState.phase !== "idle");
  const agentRun = useStore((s) => s.agent.run !== null);
  const prefix = index?.tokens.prefix ?? "";
  const pairing = pairingFor(drafts, index);
  const holdOn = () => setCompare(true);
  const holdOff = () => setCompare(false);
  if (drafts.length === 0 && !reporting && !agentRun) return null;

  return (
    <ChangesBox data-code-layer-changes={drafts.length} onClick={(event) => event.stopPropagation()}>
      <ChangeScroll>
        {drafts.map((draft) => {
        const status = previewState[draft.id];
        const message = status?.message && status.status !== "paused" ? tMaybe(status.message, status.params) ?? status.message : "";
        const pair = pairing.get(draft.id);
        const writes = draft.writesTo.files.length > 1 ? t("scope.writesMirrorShort", { file: draft.writesTo.files[0], line: draft.writesTo.line }) : t("scope.writes", { file: draft.writesTo.files[0], line: draft.writesTo.line });
        const where = `${scopeLabel(draft.scope)} · ${writes} · ${impactText({ declarations: draft.writesTo.declarations, components: draft.writesTo.components })}`;
        const details = [`${draftRowLabel(draft)} · ${draft.elementLabel}`, t(`reach.${draft.scope}` as "reach.declaration"), draft.inheritedFrom ? t("changes.inherited", { label: draft.inheritedFrom }) : "", message].filter(Boolean).join(" · ");
        const label = tMaybe(`field.${draft.group}`) ?? groupLabel(draft.group);
        const ends = changeEnds(draft.op, prefix);
        // Layout keywords are shown as written; token names lose the prefix and the component.
        const shown = isLayoutOp(draft.op) ? ends : { from: prettyToken(draft.op.fromToken, prefix), to: prettyToken(draft.op.toToken, prefix) };
        return (
          <ChangeRow key={draft.id} data-code-layer-draft={draft.id} data-scope={draft.scope} data-status={status?.status ?? ""} data-to={opTo(draft.op)} data-from={opFrom(draft.op)} data-type={draft.op.type}>
            <ChangeMain title={`${details}\n${ends.from} → ${ends.to}\n${where}`}>
              <Dot tone={status?.status ?? ""} />
              <ChangeText>
                <i>{label}</i>
                <s>{shown.from}</s>
                {" → "}
                <b>{shown.to}</b>
                {status && status.status !== "previewing" ? <Chip tone={status.status}>{t(`draft.status.${status.status}` as "draft.status.previewing")}</Chip> : null}
              </ChangeText>
              <IconButton type="button" aria-label={t("changes.remove", { row: draftRowLabel(draft) })} title={t("changes.remove", { row: draftRowLabel(draft) })} onClick={() => removeDraft(draft.id)} disabled={applying} data-code-layer-action="remove-draft" style={{ width: 20, height: 20 }}>
                <CloseIcon />
              </IconButton>
            </ChangeMain>
            {dev ? <Detail data-code-layer-draft-where>{`${details} · ${where}`}</Detail> : null}
            {pair ? <PairingNote entry={pair} prefix={prefix} onAccept={pair.offer ? () => stageOffer(draft, pair.offer!) : undefined} /> : null}
          </ChangeRow>
        );
        })}
        {children}
      </ChangeScroll>
      {drafts.length > 0 ? (
        // The action bar is the last thing in the box, so its buttons never move under the pointer.
        <>
        <PreviewState data-code-layer-preview-state title={t("changes.previewTitle")}>
          <Dot tone="previewing" />
          <span>{t("changes.previewOnly", { count: drafts.length })}</span>
        </PreviewState>
        <BarActions>
          <Button
            type="button"
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
            title={t("changes.compareTitle")}
            style={{ minWidth: 48 }}
          >
            {t("changes.compare")}
          </Button>
          <Button type="button" disabled={applying} onClick={discardAll} data-code-layer-action="discard">
            {t("changes.discard")}
          </Button>
          <Button type="button" primary disabled={!applyEnabled || applying} title={applyHint} onClick={onApply} data-code-layer-action="apply">
            {applying ? t("changes.applying") : t("changes.apply")}
          </Button>
        </BarActions>
        </>
      ) : null}
    </ChangesBox>
  );
}
