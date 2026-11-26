import React, { useEffect, useRef, useState } from "react";

import { t, tMaybe } from "../../shared/i18n";
import { opTo, type ElementTrace, type RowScope, type RowTrace } from "../../shared/protocol";
import { previewTransient, removeDraft, stageDraft } from "../actions";
import { draftOfRow } from "../drafts";
import { LayoutIcon, layoutSide } from "../icons";
import { store, useStore } from "../store";
import { LinkButton, Note, Option, Options } from "../styles";

type Flow = { direction: string; writingMode: string; textDirection: string };

/**
 * Words for a layout keyword. Start and end are named by the side they are on
 * for this element (left, top, …), so nobody has to think in main and cross axes.
 */
export function layoutLabel(property: string, keyword: string, flow: Flow): string {
  const side = layoutSide(property, keyword, flow);
  if (side) return t(`layout.side.${side}` as "layout.side.left");
  return tMaybe(`layout.${property}.${keyword}`) ?? tMaybe(`layout.keyword.${keyword}`) ?? keyword;
}

export function flowOf(trace: ElementTrace, row: RowTrace): Flow {
  return { direction: row.layout?.direction ?? "row", writingMode: trace.writingMode, textDirection: trace.direction };
}

type Props = { trace: ElementTrace; row: RowTrace; scope: RowScope; onClose: () => void };

/**
 * The keywords a layout row can be set to. Highlighting previews; choosing
 * stages. Below them: which rule the change is written to.
 */
export function LayoutOptions({ trace, row, scope, onClose }: Props) {
  const layout = row.layout!;
  const draft = useStore((s) => draftOfRow(row, s.drafts));
  const probeKey = `${trace.traceId}:${row.id}:${scope.id}`;
  const probe = useStore((s) => s.probes[probeKey]);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef(0);
  /** The keyword the pointer is over, tracked from mouse moves (see the token list). */
  const hovered = useRef<string | null>(null);
  const flow = flowOf(trace, row);
  // While the direction itself is being chosen, each option is drawn as the direction it gives.
  const flowFor = (keyword: string): Flow => (layout.property === "flex-direction" ? { ...flow, direction: keyword } : flow);

  useEffect(() => {
    box.current?.focus();
    return () => {
      window.clearTimeout(hoverTimer.current);
      previewTransient(null, null, null, null);
    };
  }, [trace.traceId, row.id, scope.id]);

  const confirmed = probe === "confirmed";
  const inEffect = draft ? opTo(draft.op) : layout.declared ?? row.computed;
  const adds = scope.target.type === "add-declaration";
  const selector = scope.target.type === "rebind-token" ? "" : scope.target.selector;

  const choose = (keyword: string) => {
    if (!confirmed) return;
    stageDraft(trace, row, scope, keyword);
    onClose();
  };
  const preview = (position: number) => {
    setActive(position);
    window.clearTimeout(hoverTimer.current);
    const keyword = layout.options[position] ?? null;
    hoverTimer.current = window.setTimeout(() => {
      if (store.get().probes[probeKey] === "confirmed") previewTransient(trace, row, scope, keyword);
    }, 80);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      preview(Math.min(layout.options.length - 1, active + 1));
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      preview(Math.max(0, active - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const pick = layout.options[active];
      if (pick) choose(pick);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      ref={box}
      tabIndex={0}
      data-code-layer-layout-options={row.id}
      data-property={layout.property}
      data-probe={probe ?? "pending"}
      data-adds={adds ? "true" : "false"}
      onKeyDown={onKeyDown}
      style={{ display: "flex", flexDirection: "column", minHeight: 0, outline: "none" }}
    >
      {probe === "pending" || probe === undefined ? <Note data-code-layer-probe-note>{t("picker.probing")}</Note> : null}
      <Options role="listbox" aria-label={t("layout.listLabel")}>
        {layout.options.map((keyword, i) => {
          const isCurrent = keyword === inEffect;
          return (
            <Option
              key={keyword}
              role="option"
              aria-selected={i === active}
              aria-disabled={!confirmed}
              active={i === active}
              disabled={!confirmed}
              title={`${layout.property}: ${keyword}`}
              data-keyword={keyword}
              data-current={isCurrent ? "true" : "false"}
              onMouseMove={() => {
                if (hovered.current === keyword) return;
                hovered.current = keyword;
                preview(i);
              }}
              onMouseLeave={() => {
                if (hovered.current === keyword) hovered.current = null;
              }}
              onClick={() => choose(keyword)}
            >
              <LayoutIcon property={layout.property} keyword={keyword} flow={flowFor(keyword)} size={12} />
              <span>{layoutLabel(layout.property, keyword, flowFor(keyword))}</span>
              <span>{isCurrent ? "✓" : keyword}</span>
            </Option>
          );
        })}
      </Options>
      {layout.declared && !layout.options.includes(layout.declared) ? <Note data-code-layer-layout-unlisted>{t("layout.unlisted", { value: layout.declared })}</Note> : null}
      <Note data-code-layer-layout-where={adds ? "add" : "edit"}>
        {adds ? t("layout.adds", { selector, property: layout.property }) : t("layout.edits", { selector, property: scope.target.type === "set-keyword" ? scope.target.property : layout.property })}{" "}
        {draft && draft.op.type === "add-declaration" ? (
          <LinkButton
            type="button"
            data-code-layer-action="layout-unset"
            onClick={() => {
              removeDraft(draft.id);
              onClose();
            }}
          >
            {t("layout.unstage")}
          </LinkButton>
        ) : null}
      </Note>
    </div>
  );
}
