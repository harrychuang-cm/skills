import React, { useEffect, useRef, useState } from "react";

import { t, tCode, tMaybe } from "../../shared/i18n";
import type { ElementTrace } from "../../shared/protocol";
import { buildReference } from "../../shared/reference";
import { agentElementKey, cancelAgentRun, closeAgentDialog, confirmAgentCode, dismissAgentRun, setAgentDraft, submitAgentRequest } from "../agent";
import { CloseIcon } from "../icons";
import { useStore, type AgentRunView } from "../store";
import { Button, IconButton, LinkButton, Note, Plain, PopHead, PopTitle, Pre, Search, TextArea, Warn } from "../styles";

const seconds = (ms: number) => Math.max(0, Math.round(ms / 1000));

/** Seconds since the run started, ticking until it ends; null before it started. */
export function useElapsedSeconds(run: AgentRunView | null): number | null {
  const [now, setNow] = useState(Date.now());
  const final = run?.final ?? true;
  useEffect(() => {
    if (final) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [final]);
  if (!run?.startedAt) return null;
  return seconds((run.finishedAt ? Date.parse(run.finishedAt) : now) - Date.parse(run.startedAt));
}

type Reason = { code: string; detail?: string | null; runner?: string; path?: string | null };

/**
 * One reason in words: the AI catalog first, then the refusal codes an import
 * shares with applies (error.*), then "another reason (code)".
 */
export function agentReasonText(reason: Reason): string {
  const params = { code: reason.code, detail: reason.detail ?? "", runner: reason.runner ?? "", path: reason.path ?? "" };
  return tMaybe(`agent.reason.${reason.code}`, params) ?? tCode("error", reason.code, "agent.reason.unknown", params);
}

/** The reason a request cannot be sent now, in words, or null. */
export function agentUnavailable(status: { ready: boolean; reasons: Reason[] } | null): string | null {
  if (!status) return t("agent.reason.checking");
  if (status.ready) return null;
  const reason = status.reasons[0];
  return reason ? agentReasonText(reason) : t("agent.reason.unknown", { code: "" });
}

type Props = { trace: ElementTrace; onClose: () => void };

/**
 * Ask an AI agent to change the selected element. Beside the inspector, where
 * a row's popover opens. The text typed is kept per element; Enter sends,
 * Shift+Enter breaks the line, Escape closes and keeps the text.
 */
export function AgentDialog({ trace, onClose }: Props) {
  const agent = useStore((s) => s.agent);
  const key = agentElementKey(trace);
  const text = agent.drafts[key] ?? "";
  const [showReference, setShowReference] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const status = agent.status;
  const run = agent.run;
  const active = Boolean(run && !run.final);
  const asking = run?.state === "needs-decision";
  const max = status?.limits.maxTextChars ?? 2000;
  const unavailable = agentUnavailable(status);

  useEffect(() => {
    input.current?.focus();
  }, [key, asking]);

  const send = () => {
    const value = text.trim();
    if (!value || active || unavailable || agent.busy) return;
    void submitAgentRequest(value, asking && run ? run.runId : null);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div data-code-layer-agent-dialog data-state={run?.state ?? "idle"} data-ready={status?.ready ? "true" : "false"} style={{ display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
      <PopHead>
        <PopTitle>{asking ? t("agent.answerTitle") : t("agent.dialogTitle")}</PopTitle>
        <IconButton type="button" onClick={onClose} aria-label={t("pop.close")} title={t("pop.close")} data-code-layer-action="close-agent">
          <CloseIcon />
        </IconButton>
      </PopHead>
      <Note data-code-layer-agent-element>{t("agent.element", { label: trace.label })}</Note>

      {run ? <RunState run={run} text={agent.text} codeError={agent.codeError} /> : null}

      {!active ? (
        <>
          {asking && run?.result?.question ? (
            <>
              <Note>{t("agent.question")}</Note>
              <Plain data-code-layer-agent-question>{run.result.question}</Plain>
            </>
          ) : null}
          <TextArea
            ref={input}
            value={text}
            maxLength={max}
            placeholder={asking ? t("agent.answerPlaceholder") : t("agent.placeholder")}
            aria-label={asking ? t("agent.answerPlaceholder") : t("agent.dialogTitle")}
            data-code-layer-agent-input
            onChange={(event) => setAgentDraft(key, event.target.value)}
            onKeyDown={onKeyDown}
          />
          <Note style={{ display: "flex", gap: 8 }}>
            <span style={{ marginRight: "auto" }}>{t("agent.submitHint")}</span>
            <span data-code-layer-agent-counter>{t("agent.counter", { count: [...text].length, max })}</span>
          </Note>
          <Note>
            <LinkButton type="button" aria-expanded={showReference} onClick={() => setShowReference(!showReference)} data-code-layer-action="agent-reference">
              {showReference ? "▾ " : "▸ "}
              {t("agent.reference")}
            </LinkButton>
          </Note>
          {showReference ? <Pre data-code-layer-agent-reference>{buildReference(trace)}</Pre> : null}
          {status?.runners.length ? <Note>{t("agent.runner", { runner: status.runners.map((r) => r.label).join(" → ") })}</Note> : null}
          <Note>{t("agent.cost")}</Note>
          {status?.confirm.unconfirmed ? (
            <Note data-code-layer-agent-unconfirmed>
              <Warn>{t("agent.unconfirmed")}</Warn>
            </Note>
          ) : null}
          {unavailable ? (
            <Note data-code-layer-agent-unavailable>
              <Warn>{unavailable}</Warn>
            </Note>
          ) : null}
          {agent.error ? (
            <Note data-code-layer-agent-error={agent.error.code}>
              <Warn>{tCode("error", agent.error.code, "error.unknown", { code: agent.error.code })}</Warn>
            </Note>
          ) : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, padding: "0 10px 10px" }}>
            {asking ? (
              <Button type="button" onClick={dismissAgentRun} data-code-layer-action="agent-dismiss">
                {t("agent.dismiss")}
              </Button>
            ) : null}
            <Button type="button" primary disabled={!text.trim() || Boolean(unavailable) || agent.busy} onClick={send} data-code-layer-action="agent-submit" title={unavailable ?? t("agent.submitHint")}>
              {asking ? t("agent.answerSubmit") : t("agent.submit")}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Where a run is: waiting for approval (and how to give it), working, or done. */
function RunState({ run, text, codeError }: { run: AgentRunView; text: string | null; codeError: { code: string; remaining: number | null } | null }) {
  const [code, setCode] = useState("");
  const elapsed = useElapsedSeconds(run);
  const waiting = run.state === "awaiting-confirmation";
  const codeMode = run.confirm.mode === "terminal-code";
  return (
    <div data-code-layer-agent-run={run.runId} data-state={run.state}>
      {text && !run.final ? (
        <>
          <Note>{t("agent.yourRequest")}</Note>
          <Plain data-code-layer-agent-text>{text}</Plain>
        </>
      ) : null}
      <Note style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ marginRight: "auto" }} data-code-layer-agent-state>
          {t(`agent.state.${run.state}` as "agent.state.running")}
          {/* From approval until the end, the dialog names the tool that works, like the report area. */}
          {!run.final && run.state !== "awaiting-confirmation" && run.runner ? ` · ${run.runner}` : ""}
          {elapsed !== null ? ` · ${t("agent.elapsed", { seconds: elapsed })}` : ""}
        </strong>
        {!run.final && run.state !== "checking" ? (
          <Button type="button" onClick={() => void cancelAgentRun()} data-code-layer-action="agent-cancel" style={{ height: 20, padding: "0 6px" }}>
            {t("agent.cancel")}
          </Button>
        ) : null}
      </Note>
      {waiting && !codeMode ? <Note data-code-layer-agent-confirm="native">{t("agent.confirmNative")}</Note> : null}
      {waiting && codeMode ? (
        <>
          {run.confirm.fallback ? <Note>{t("agent.confirmFallback")}</Note> : null}
          <Note data-code-layer-agent-confirm="code">{t("agent.confirmCode")}</Note>
          <div style={{ display: "flex", gap: 6, padding: "0 10px 8px" }}>
            <Search
              value={code}
              inputMode="numeric"
              maxLength={6}
              aria-label={t("agent.codeLabel")}
              placeholder={t("agent.codeLabel")}
              data-code-layer-agent-code
              style={{ margin: 0, width: 110 }}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter" && code.length === 6) void confirmAgentCode(code);
              }}
            />
            <Button type="button" primary disabled={code.length !== 6} onClick={() => void confirmAgentCode(code)} data-code-layer-action="agent-code">
              {t("agent.codeSubmit")}
            </Button>
          </div>
          {codeError ? (
            <Note>
              <Warn>{codeError.remaining ? t("agent.codeWrong", { remaining: codeError.remaining }) : t("agent.codeVoid")}</Warn>
            </Note>
          ) : null}
        </>
      ) : null}
      {run.final && run.state !== "needs-decision" ? <Note>{t("agent.seeReport")}</Note> : null}
    </div>
  );
}
