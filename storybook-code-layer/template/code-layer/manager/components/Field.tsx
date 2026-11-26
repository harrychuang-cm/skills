import React, { useRef, useState } from "react";

import { t, tCode, tMaybe } from "../../shared/i18n";
import { fieldLabel, physicalSize, prettyToken, rowLabel, sideGlyph } from "../../shared/labels";
import { GROUP_BY_ID } from "../../shared/properties";
import { opFrom, opTo, type ElementTrace, type IndexJson, type RowTrace } from "../../shared/protocol";
import { previewTransient, requestProbe, stageDraft } from "../actions";
import { currentScope, draftOfRow, rowKey, scaleFor } from "../drafts";
import { InheritIcon, LayoutIcon, LockIcon, PROPERTY_ICONS, WarnIcon } from "../icons";
import { store, useStore } from "../store";
import { Row, RowIcon, RowLabel, RowState, RowValue, Swatch, TokenPill, ValueText } from "../styles";
import { flowOf, layoutLabel } from "./LayoutOptions";

/** Pixels of horizontal drag per step on the scale. */
const DRAG_STEP = 24;

type Props = { trace: ElementTrace; row: RowTrace; index: IndexJson; editable: boolean };

/**
 * Does a row have anything of its own to show (a declaration, an attribute, or
 * a value inherited from an element)? The layout rows of a flex container
 * always do: they are how its children are arranged, declared or not.
 */
export function hasSource(row: RowTrace): boolean {
  return row.source !== "none" || row.layout !== null || (row.inheritedFrom !== null && row.inheritedFrom.kind !== "default");
}

/**
 * One property: icon, short label, value, token. Everything that needs words —
 * why it cannot be edited, where it is inherited from — is the tooltip here
 * and the popover that opens on click.
 */
export function Field({ trace, row, index, editable: modeEditable }: Props) {
  const prefix = index.tokens.prefix;
  const key = rowKey(trace, row);
  const choice = useStore((s) => s.scopeChoice[key]);
  const scope = currentScope(row, choice);
  const draft = useStore((s) => draftOfRow(row, s.drafts));
  const status = useStore((s) => (draft ? s.previewState[draft.id] : undefined));
  const tokenValues = useStore((s) => s.tokenValues);
  const open = useStore((s) => s.openRow === key);
  const probe = useStore((s) => (scope ? s.probes[`${trace.traceId}:${row.id}:${scope.id}`] : undefined));
  const [step, setStep] = useState<string | null>(null);
  const drag = useRef<{ startX: number; base: number; moved: boolean } | null>(null);
  /** The click that follows a drag must not open the row. */
  const justDragged = useRef(false);

  const group = GROUP_BY_ID[row.group];
  // A target the probe could not confirm is not offered for editing at this scope.
  const unconfirmed = probe === "unconfirmed";
  const offered = modeEditable && !row.readOnly && scope !== null && scope.available;
  const editable = offered && !unconfirmed;
  const boundToken = draft ? opTo(draft.op) : scope?.fromToken ?? row.tokenName;
  const shownToken = step ?? boundToken;
  // A layout row shows a keyword: the staged one, the declared one, or the computed default.
  const layoutKeyword = row.layout ? (draft ? opTo(draft.op) : row.layout.declared ?? row.computed) : null;
  const layoutDefault = Boolean(row.layout) && !draft && !row.layout?.declared;
  const liveValue = step ? tokenValues[step] ?? "" : draft ? tokenValues[opTo(draft.op)] ?? "" : row.computedDisplay;
  const value = liveValue || row.computedDisplay;
  const isColor = Boolean(group?.kinds.includes("color"));
  const scale = editable && scope ? scaleFor(row, scope, index, tokenValues) : [];
  const canStep = scale.length >= 2;

  const toggle = () => store.set({ openRow: open ? null : key });
  const ensureProbe = () => {
    if (editable && scope) requestProbe(trace, row.id, scope.id);
  };
  const confirmed = () => (scope ? store.get().probes[`${trace.traceId}:${row.id}:${scope.id}`] === "confirmed" : false);
  const baseIndex = () => scale.findIndex((token) => token.name === (step ?? boundToken));
  const moveTo = (position: number) => {
    if (!scope || !canStep || !confirmed()) return;
    const clamped = Math.max(0, Math.min(scale.length - 1, position));
    const name = scale[clamped].name;
    setStep(name);
    previewTransient(trace, row, scope, name);
  };
  const commit = () => {
    if (step && scope) stageDraft(trace, row, scope, step);
    setStep(null);
  };
  const cancel = () => {
    setStep(null);
    previewTransient(null, null, null, null);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (!canStep) return;
      event.preventDefault();
      const at = baseIndex();
      if (at !== -1) moveTo(at + (event.key === "ArrowUp" ? 1 : -1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (step) commit();
      else toggle();
    } else if (event.key === "Escape" && step) {
      event.preventDefault();
      cancel();
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      toggle();
    }
  };

  const onLabelDown = (event: React.PointerEvent) => {
    if (!canStep) return;
    ensureProbe();
    const at = baseIndex();
    if (at === -1) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { startX: event.clientX, base: at, moved: false };
  };
  const onLabelMove = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const steps = Math.trunc((event.clientX - state.startX) / DRAG_STEP);
    if (steps !== 0) state.moved = true;
    if (state.moved) moveTo(state.base + steps);
  };
  const onLabelUp = () => {
    const state = drag.current;
    drag.current = null;
    if (state?.moved) {
      justDragged.current = true;
      commit();
    }
  };
  const onLabelClick = (event: React.MouseEvent) => {
    if (!justDragged.current) return;
    justDragged.current = false;
    event.stopPropagation();
  };

  const inherited = row.inheritedFrom && row.inheritedFrom.kind !== "default" ? row.inheritedFrom : null;
  const conflict = status?.status === "conflict";
  const reason = row.readOnly
    ? tCode("readonly", row.readOnly.reason, "readonly.unknown", { detail: row.readOnly.detail })
    : offered && unconfirmed
      ? t("picker.unconfirmed")
      : conflict
        ? tMaybe(status?.message ?? "", status?.params) ?? t("draft.status.conflict")
        : draft
          ? row.layout
            ? t("row.originalValue", { value: opFrom(draft.op) || t("layout.unset") })
            : t("row.original", { token: prettyToken(opFrom(draft.op), prefix, trace.componentId) })
          : layoutDefault
            ? t("layout.default")
            : inherited
              ? t("pop.inherited", { label: inherited.label ?? "" })
              : canStep
                ? t("row.dragHint")
                : "";
  const size = physicalSize(row.group, trace.writingMode);
  const glyph = sideGlyph(row);
  const pill = shownToken && !row.layout ? prettyToken(shownToken, prefix, trace.componentId) : null;

  return (
    <Row
      editable={editable}
      open={open}
      role="button"
      tabIndex={0}
      title={reason ? `${rowLabel(row)} — ${reason}` : rowLabel(row)}
      data-code-layer-row={row.id}
      data-group={row.group}
      data-section={row.section}
      data-editable={editable ? "true" : "false"}
      data-readonly={row.readOnly?.reason ?? ""}
      data-scope={scope?.id ?? ""}
      data-probe={probe ?? ""}
      data-steps={canStep ? scale.length : 0}
      data-step-token={step ?? ""}
      data-token={row.layout ? "" : boundToken ?? ""}
      data-layout={layoutKeyword ?? ""}
      data-layout-default={layoutDefault ? "true" : "false"}
      data-inherited={row.inheritedFrom?.kind ?? ""}
      data-open={open ? "true" : "false"}
      data-status={status?.status ?? ""}
      onClick={toggle}
      onFocus={ensureProbe}
      onKeyDown={onKeyDown}
    >
      <RowIcon>{PROPERTY_ICONS[size ? (size.toLowerCase().includes("width") ? "width" : "height") : row.group] ?? null}</RowIcon>
      <RowLabel stepper={canStep} data-code-layer-row-label onPointerDown={onLabelDown} onPointerMove={onLabelMove} onPointerUp={onLabelUp} onPointerCancel={onLabelUp} onClick={onLabelClick}>
        {fieldLabel(row, trace.writingMode)}
        {glyph ? ` ${glyph}` : ""}
      </RowLabel>
      <RowValue>
        {row.layout && layoutKeyword ? (
          <TokenPill tone={draft ? "staged" : editable ? "token" : "muted"} title={`${row.layout.property}: ${layoutKeyword}${layoutDefault ? ` (${t("layout.default")})` : ""}`} data-code-layer-layout-value={layoutKeyword} style={layoutDefault ? { opacity: 0.62 } : undefined}>
            <LayoutIcon property={row.layout.property} keyword={layoutKeyword} flow={row.layout.property === "flex-direction" ? { ...flowOf(trace, row), direction: layoutKeyword } : flowOf(trace, row)} size={12} />
            <span>{layoutLabel(row.layout.property, layoutKeyword, row.layout.property === "flex-direction" ? { ...flowOf(trace, row), direction: layoutKeyword } : flowOf(trace, row))}</span>
          </TokenPill>
        ) : pill ? (
          <>
            {isColor ? null : <ValueText data-code-layer-value>{value}</ValueText>}
            <TokenPill tone={draft || step ? "staged" : editable ? "token" : "muted"} title={`${shownToken}${value ? ` = ${value}` : ""}`}>
              {isColor && value ? <Swatch color={value} /> : null}
              <span>{pill}</span>
            </TokenPill>
          </>
        ) : (
          <>
            {isColor && value ? <Swatch color={value} /> : null}
            <ValueText data-code-layer-value>{value}</ValueText>
          </>
        )}
      </RowValue>
      {conflict ? (
        <RowState tone="warn">
          <WarnIcon />
        </RowState>
      ) : !editable ? (
        <RowState>
          <LockIcon />
        </RowState>
      ) : inherited ? (
        <RowState>
          <InheritIcon />
        </RowState>
      ) : (
        <span />
      )}
    </Row>
  );
}
