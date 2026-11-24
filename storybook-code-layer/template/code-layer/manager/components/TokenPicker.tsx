import React, { useEffect, useMemo, useRef, useState } from "react";

import type { ElementTrace, IndexJson, RowTrace } from "../../shared/protocol";
import { previewTransient, requestProbe, stageDraft } from "../actions";
import { candidatesFor, shortName } from "../drafts";
import { store, useStore } from "../store";
import { Detail, Option, Options, Picker, Search, Swatch, Warn } from "../styles";

type Props = { trace: ElementTrace; row: RowTrace; index: IndexJson; currentToken: string; onClose: () => void };

export function TokenPicker({ trace, row, index, currentToken, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const tokenValues = useStore((s) => s.tokenValues);
  const probe = useStore((s) => s.probes[`${trace.traceId}:${row.id}`]);
  const input = useRef<HTMLInputElement>(null);
  const hoverTimer = useRef(0);
  const prefix = index.tokens.prefix;

  useEffect(() => {
    requestProbe(trace, row.id);
    input.current?.focus();
    return () => {
      window.clearTimeout(hoverTimer.current);
      previewTransient(null, null, null);
    };
  }, [trace.traceId, row.id]);

  const all = useMemo(() => candidatesFor(row, trace, index), [row, trace, index]);
  const currentValue = tokenValues[currentToken] ?? "";
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((t) => t.name.toLowerCase().includes(q) || (tokenValues[t.name] ?? t.resolvedValue ?? "").toLowerCase().includes(q));
  }, [all, query, tokenValues]);

  const confirmed = probe === "confirmed";
  const choose = (name: string) => {
    if (!confirmed) return;
    stageDraft(trace, row, name);
    onClose();
  };
  const preview = (indexInList: number) => {
    setActive(indexInList);
    window.clearTimeout(hoverTimer.current);
    const name = list[indexInList]?.name ?? null;
    hoverTimer.current = window.setTimeout(() => {
      if (store.get().probes[`${trace.traceId}:${row.id}`] === "confirmed") previewTransient(trace, row, name);
    }, 80);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      preview(Math.min(list.length - 1, active + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      preview(Math.max(0, active - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (list[active]) choose(list[active].name);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <Picker onClick={(event) => event.stopPropagation()} data-code-layer-picker={row.id}>
      <Search
        ref={input}
        value={query}
        placeholder={`搜尋 token（名稱或數值），共 ${all.length} 個`}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        aria-label="搜尋 token"
      />
      {!confirmed && (
        <Detail style={{ margin: "6px 8px" }}>
          {probe === "pending" || probe === undefined ? "確認這條宣告是否驅動此元素…" : <Warn>無法確認這條宣告驅動此元素，暫不提供修改。</Warn>}
        </Detail>
      )}
      <Options role="listbox" aria-label="可改綁的 token">
        {list.map((token, i) => {
          const value = tokenValues[token.name] ?? token.resolvedValue ?? "";
          const isCurrent = token.name === currentToken;
          const sameValue = !isCurrent && value !== "" && value === currentValue;
          return (
            <Option
              key={token.name}
              role="option"
              aria-selected={i === active}
              active={i === active}
              data-token={token.name}
              onMouseEnter={() => preview(i)}
              onClick={() => choose(token.name)}
            >
              {token.kind === "color" ? <Swatch color={value} /> : <span />}
              <span>
                {shortName(token.name, prefix)}
                {isCurrent ? "（目前）" : sameValue ? "（同值）" : ""}
              </span>
              <span style={{ opacity: 0.7 }}>{value}</span>
            </Option>
          );
        })}
        {list.length === 0 && <Detail style={{ margin: 8 }}>沒有符合的 token。</Detail>}
      </Options>
    </Picker>
  );
}
