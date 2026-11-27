import React, { useEffect, useMemo, useRef, useState } from "react";

import { t, tCode, tMaybe } from "../../shared/i18n";
import { fieldLabel, prettyToken, rowLabel, scopeLabel, shortToken, sideGlyph } from "../../shared/labels";
import { opTo, type ElementTrace, type IndexJson, type RowScope, type RowTrace } from "../../shared/protocol";
import { cancelScopeConfirm, chooseScope, previewTransient, requestProbe, requestScope, selectDescriptor, stageDraft } from "../actions";
import { candidatesFor, currentScope, draftOfRow, literalCandidates, rowKey, scaleFor } from "../drafts";
import { CheckIcon, CloseIcon, MinusIcon, PlusIcon } from "../icons";
import { store, useStore } from "../store";
import { Button, DevBlock, IconButton, LinkButton, Note, Option, Options, PopHead, PopTitle, Search, Segment, Segmented, StepRow, Swatch, Warn } from "../styles";
import { LayoutOptions } from "./LayoutOptions";

type Props = { trace: ElementTrace; row: RowTrace; index: IndexJson; editable: boolean; dev: boolean; onClose: () => void };

export function writesText(scope: RowScope): string {
  const [file, mirror] = scope.writes.files;
  return mirror ? t("scope.writesMirror", { file, line: scope.writes.line, mirror }) : t("scope.writes", { file, line: scope.writes.line });
}

export function impactText(impact: { declarations: number; components: number }, excludesInline = false): string {
  const base = t("scope.impact", { declarations: impact.declarations, components: impact.components });
  return excludesInline ? `${base}${t("scope.excludesInline")}` : base;
}

/**
 * What opens beside the inspector when a row is activated. An editable row:
 * where the change applies, a stepper along the scale, and the tokens to pick
 * from. A read-only row: why, and where the value comes from.
 */
export function RowPopover({ trace, row, index, editable: modeEditable, dev, onClose }: Props) {
  const prefix = index.tokens.prefix;
  const key = rowKey(trace, row);
  const choice = useStore((s) => s.scopeChoice[key]);
  const scope = currentScope(row, choice);
  const draft = useStore((s) => draftOfRow(row, s.drafts));
  const tokenValues = useStore((s) => s.tokenValues);
  const probe = useStore((s) => (scope ? s.probes[`${trace.traceId}:${row.id}:${scope.id}`] : undefined));
  const confirm = useStore((s) => (s.scopeConfirm?.rowKey === key ? s.scopeConfirm : null));

  const unconfirmed = probe === "unconfirmed";
  const offered = modeEditable && !row.readOnly && scope !== null && scope.available;
  const editable = offered && !unconfirmed;
  const boundToken = draft ? opTo(draft.op) : scope?.fromToken ?? row.tokenName;
  const scale = editable && scope ? scaleFor(row, scope, index, tokenValues) : [];
  const at = scale.findIndex((token) => token.name === boundToken);
  const pending = confirm ? row.scopes.find((s) => s.id === confirm.scope) ?? null : null;
  const inherited = row.inheritedFrom && row.inheritedFrom.kind !== "default" ? row.inheritedFrom : null;
  const inheritedDescriptor = inherited?.descriptor ?? null;
  const glyph = sideGlyph(row);

  useEffect(() => {
    if (editable && scope) requestProbe(trace, row.id, scope.id);
  }, [trace.traceId, row.id, scope?.id, editable]);

  const step = (delta: number) => {
    const next = scale[at + delta];
    if (next && scope && probe === "confirmed") stageDraft(trace, row, scope, next.name);
  };

  return (
    <>
      <PopHead>
        <PopTitle title={rowLabel(row)}>
          {fieldLabel(row, trace.writingMode)}
          {glyph ? ` ${glyph}` : ""}
        </PopTitle>
        <IconButton type="button" onClick={onClose} aria-label={t("pop.close")} title={t("pop.close")} data-code-layer-action="close-popover">
          <CloseIcon />
        </IconButton>
      </PopHead>

      {inherited ? (
        <Note data-code-layer-inherited={inherited.kind}>
          {t(`inherit.${inherited.kind}` as "inherit.same-component", { label: inherited.label ?? "", source: tMaybe(`source.${inherited.source}`) ?? inherited.source ?? "" })}{" "}
          {inheritedDescriptor ? (
            <LinkButton type="button" data-code-layer-action="select-ancestor" onClick={() => selectDescriptor(inheritedDescriptor)}>
              {t("inherit.select")}
            </LinkButton>
          ) : null}
        </Note>
      ) : null}
      {row.readOnly ? <Note data-code-layer-reason>{tCode("readonly", row.readOnly.reason, "readonly.unknown", { detail: row.readOnly.detail })}</Note> : null}
      {offered && unconfirmed ? (
        <Note data-code-layer-reason>
          <Warn>{t("picker.unconfirmed")}</Warn>
        </Note>
      ) : null}
      {row.warnings.length > 0 ? (
        <Note>
          <Warn>{row.warnings.map((warning) => tCode("warning", warning, "warning.unknown")).join(t("list.semicolon"))}</Warn>
        </Note>
      ) : null}

      {!row.readOnly && row.literal && scope ? <Note data-code-layer-impact>{t("reach.impact", { components: scope.impact.components })}</Note> : null}
      {/* A literal has one scope, the declaration: there is nothing to switch between. */}
      {!row.readOnly && row.scopes.length > 0 && !row.layout && !row.literal ? (
        <div data-code-layer-scopes>
          <Segmented role="radiogroup" aria-label={t("reach.title")}>
            {row.scopes.map((option) => {
              const selected = scope?.id === option.id;
              const usable = option.available && modeEditable;
              const why = option.available ? `${t("reach.title")}${t("reference.colon")}${scopeLabel(option.id)}` : tCode("scope.reason", option.reason ?? "unknown", "scope.reason.unknown", { detail: option.detail });
              return (
                <Segment
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={!usable}
                  selected={selected}
                  available={usable}
                  title={why}
                  data-code-layer-scope={option.id}
                  data-available={option.available ? "true" : "false"}
                  data-default={row.defaultScope === option.id ? "true" : "false"}
                  onClick={() => {
                    if (usable && !selected) requestScope(trace, row, option.id);
                  }}
                >
                  {t(`reach.${option.id}` as "reach.declaration")}
                </Segment>
              );
            })}
          </Segmented>
          {scope ? <Note data-code-layer-impact>{t("reach.impact", { components: scope.impact.components })}</Note> : null}
          {row.defaultScope === null ? (
            <Note>
              <Warn>{t("scope.noDefault")}</Warn>
            </Note>
          ) : null}
          {pending ? (
            <Note data-code-layer-scope-confirm>
              <Warn>{t("scope.confirmSystem", { components: pending.impact.components, declarations: pending.impact.declarations })}</Warn>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <Button type="button" primary onClick={() => chooseScope(trace, row, pending.id)} data-code-layer-action="scope-confirm">
                  {t("scope.confirmAction")}
                </Button>
                <Button type="button" onClick={cancelScopeConfirm} data-code-layer-action="scope-cancel">
                  {t("action.cancel")}
                </Button>
              </div>
            </Note>
          ) : null}
        </div>
      ) : null}

      {scale.length >= 2 && at !== -1 ? (
        <StepRow data-code-layer-stepper>
          <IconButton type="button" disabled={at <= 0 || probe !== "confirmed"} onClick={() => step(-1)} aria-label={t("pop.stepDown")} title={t("pop.stepDown")} data-code-layer-action="step-down">
            <MinusIcon />
          </IconButton>
          <span>{`${tokenValues[scale[at].name] ?? scale[at].resolvedValue ?? ""} · ${prettyToken(scale[at].name, prefix, trace.componentId)}`}</span>
          <IconButton type="button" disabled={at >= scale.length - 1 || probe !== "confirmed"} onClick={() => step(1)} aria-label={t("pop.stepUp")} title={t("pop.stepUp")} data-code-layer-action="step-up">
            <PlusIcon />
          </IconButton>
        </StepRow>
      ) : null}

      {editable && scope && row.layout ? <LayoutOptions trace={trace} row={row} scope={scope} onClose={onClose} /> : null}
      {editable && scope && (boundToken || row.literal) && !row.layout ? <TokenList trace={trace} row={row} scope={scope} index={index} currentToken={boundToken ?? ""} onClose={onClose} /> : null}

      {dev ? (
        <DevBlock data-code-layer-dev>
          {row.declaration ? (
            <div data-code-layer-declaration>
              {row.declaration.workspacePath
                ? t("row.declarationAt", { property: row.declaration.property, value: row.declaration.value, file: row.declaration.workspacePath, line: row.declaration.line ?? "?", selector: row.declaration.selector })
                : t("row.declarationLoose", { property: row.declaration.property, value: row.declaration.value, selector: row.declaration.selector })}
            </div>
          ) : null}
          {row.chain.length > 0 ? (
            <div data-code-layer-chain>
              {row.chain.map((link) => (
                <div key={link.name} data-code-layer-link={link.name} data-status={link.status}>
                  {`${shortToken(link.name, prefix)} · ${link.tier ?? t("chain.noTier")}${link.file ? ` · ${link.file}${link.line ? `:${link.line}` : ""}` : ""}${link.value ? ` = ${link.value}` : ""}`}
                  {link.status === "overridden" ? <Warn>{` ${t("chain.overridden", { file: tMaybe(`source.${link.overriddenBy?.file}`) ?? link.overriddenBy?.file ?? "" })}`}</Warn> : null}
                  {link.status === "undefined" ? <Warn>{` ${t("chain.undefined")}`}</Warn> : null}
                  {link.status === "not-a-token" ? <Warn>{` ${t("chain.notAToken")}`}</Warn> : null}
                </div>
              ))}
            </div>
          ) : null}
          {scope && !row.readOnly ? <div data-code-layer-writes>{`${writesText(scope)} · ${impactText(scope.impact, scope.impact.excludesInlineStyles)}`}</div> : null}
        </DevBlock>
      ) : null}
    </>
  );
}

type ListProps = { trace: ElementTrace; row: RowTrace; scope: RowScope; index: IndexJson; currentToken: string; onClose: () => void };

/** Tokens the row can be re-bound to at its current scope. Highlighting previews; choosing stages. */
function TokenList({ trace, row, scope, index, currentToken, onClose }: ListProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const tokenValues = useStore((s) => s.tokenValues);
  const probeKey = `${trace.traceId}:${row.id}:${scope.id}`;
  const probe = useStore((s) => s.probes[probeKey]);
  const input = useRef<HTMLInputElement>(null);
  const hoverTimer = useRef(0);
  /** The token the pointer is over. Tracked from mouse moves: React fires no mouseenter on an
   *  option when the option that was under the pointer before has just been filtered away. */
  const hovered = useRef<string | null>(null);
  const prefix = index.tokens.prefix;

  const options = useRef<HTMLDivElement>(null);
  useEffect(() => {
    input.current?.focus();
    // Start where the person is: the token bound now, in the middle of the list.
    const current = options.current?.querySelector<HTMLElement>('[data-current="true"]');
    if (current && options.current) options.current.scrollTop = Math.max(0, current.offsetTop - options.current.offsetTop - options.current.clientHeight / 2 + current.offsetHeight / 2);
    return () => {
      window.clearTimeout(hoverTimer.current);
      previewTransient(null, null, null, null);
    };
  }, [trace.traceId, row.id, scope.id]);

  const all = useMemo(() => candidatesFor(row, scope, index, tokenValues), [row, scope, index, tokenValues]);
  // A literal row: which of the three groups each candidate is in, and whether its value equals the literal.
  const marks = useMemo(() => new Map(literalCandidates(row, scope, index, tokenValues).map((entry) => [entry.token.name, entry] as const)), [row, scope, index, tokenValues]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((token) => token.name.toLowerCase().includes(q) || (tokenValues[token.name] ?? token.resolvedValue ?? "").toLowerCase().includes(q));
  }, [all, query, tokenValues]);

  const confirmed = probe === "confirmed";
  const choose = (name: string) => {
    if (!confirmed) return;
    stageDraft(trace, row, scope, name);
    onClose();
  };
  const preview = (indexInList: number) => {
    setActive(indexInList);
    window.clearTimeout(hoverTimer.current);
    const name = list[indexInList]?.name ?? null;
    hoverTimer.current = window.setTimeout(() => {
      if (store.get().probes[probeKey] === "confirmed") previewTransient(trace, row, scope, name);
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
      const pick = list[active] ?? (list.length === 1 ? list[0] : null);
      if (pick) choose(pick.name);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div data-code-layer-picker={row.id} data-scope={scope.id} data-probe={probe ?? "pending"} style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      {row.literal ? <Note data-code-layer-literal={row.literal.text}>{t("picker.literalHead", { value: row.literal.text })}</Note> : null}
      <Search
        ref={input}
        value={query}
        placeholder={t("picker.search", { count: all.length })}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(-1);
          hovered.current = null;
        }}
        onKeyDown={onKeyDown}
        aria-label={t("picker.searchLabel")}
      />
      {probe === "pending" || probe === undefined ? <Note data-code-layer-probe-note>{t("picker.probing")}</Note> : null}
      <Options ref={options} role="listbox" aria-label={t("picker.listLabel")}>
        {list.map((token, i) => {
          const value = tokenValues[token.name] ?? token.resolvedValue ?? "";
          const isCurrent = token.name === currentToken;
          const mark = marks.get(token.name);
          const previous = i > 0 ? marks.get(list[i - 1].name) : undefined;
          const heading = mark && mark.group !== previous?.group ? (
            <Note key={`group-${mark.group}`} role="presentation" data-code-layer-candidate-group={mark.group}>
              {t(`picker.group${mark.group}` as "picker.group1")}
            </Note>
          ) : null;
          return [
            heading,
            <Option
              key={token.name}
              role="option"
              aria-selected={i === active}
              aria-disabled={!confirmed}
              active={i === active}
              disabled={!confirmed}
              title={token.name}
              data-token={token.name}
              data-tier={token.tier ?? ""}
              data-current={isCurrent ? "true" : "false"}
              data-group={mark?.group ?? ""}
              data-same={mark?.same ? "true" : "false"}
              onMouseMove={() => {
                if (hovered.current === token.name) return;
                hovered.current = token.name;
                preview(i);
              }}
              onMouseLeave={() => {
                if (hovered.current === token.name) hovered.current = null;
              }}
              onClick={() => choose(token.name)}
            >
              {token.kind === "color" ? <Swatch color={value} /> : isCurrent ? <CheckIcon /> : <span />}
              <span>{prettyToken(token.name, prefix, trace.componentId)}</span>
              <span>{token.kind === "color" && isCurrent ? "✓" : mark?.same ? `${value} · ${t("picker.sameValue")}` : value}</span>
            </Option>,
          ];
        })}
        {list.length === 0 ? <Note>{t("picker.empty")}</Note> : null}
      </Options>
    </div>
  );
}
