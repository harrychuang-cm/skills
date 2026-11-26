import React, { useState } from "react";

import { t, tCode } from "../../shared/i18n";
import { rowLabel } from "../../shared/labels";
import { buildReference } from "../../shared/reference";
import { cancelAgentRun, changedRows, dismissAgentRun, openAgentDialog, revertAgentImport } from "../agent";
import { CloseIcon } from "../icons";
import { useStore } from "../store";
import { Button, Detail, Headline, IconButton, Plain, ReportBox, ReportLine, StatusIcon, Warn } from "../styles";
import { agentReasonText, useElapsedSeconds } from "./AgentDialog";
import { Part } from "./Report";

const TONE: Record<string, string> = { imported: "verified", "needs-decision": "busy", rejected: "error", failed: "error", denied: "error", cancelled: "error", interrupted: "error" };

/**
 * The outcome of an AI run, at the bottom of the inspector: either an
 * undoable import (what changed, the agent's own words, undo) or "the project
 * was not changed" with every reason. Agent text is shown as plain text only.
 */
export function AgentRunReport() {
  const agent = useStore((s) => s.agent);
  const selection = useStore((s) => s.selection);
  const [copied, setCopied] = useState(false);
  const run = agent.run;
  const elapsed = useElapsedSeconds(run);
  if (!run) return null;
  const tone = run.final ? TONE[run.state] ?? "error" : "busy";
  const rows = run.state === "imported" && !agent.undone ? changedRows(selection, agent.before) : [];
  const unchanged = run.final && run.state !== "imported";
  const copyReference = async () => {
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(buildReference(selection));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <ReportBox data-code-layer-agent-report={run.state} data-run={run.runId}>
      <ReportLine>
        <StatusIcon tone={tone}>{tone === "verified" ? "✓" : tone === "busy" ? "…" : "!"}</StatusIcon>
        <Headline data-code-layer-agent-headline title={run.applyId ? t("report.record", { id: run.applyId }) : run.runId}>
          {agent.undone ? t("agent.report.reverted") : t(`agent.state.${run.state}` as "agent.state.running")}
        </Headline>
        {!run.final && run.state !== "checking" ? (
          <Button type="button" onClick={() => void cancelAgentRun()} data-code-layer-action="agent-report-cancel">
            {t("agent.cancel")}
          </Button>
        ) : null}
        {run.state === "imported" && !agent.undone ? (
          <Button type="button" disabled={agent.busy} onClick={() => void revertAgentImport()} data-code-layer-action="agent-revert">
            {t("agent.report.revert")}
          </Button>
        ) : null}
        {run.state === "needs-decision" ? (
          <Button type="button" primary onClick={openAgentDialog} data-code-layer-action="agent-answer">
            {t("agent.report.answer")}
          </Button>
        ) : null}
        {run.final ? (
          <IconButton type="button" onClick={dismissAgentRun} aria-label={t("agent.dismiss")} title={t("agent.dismiss")} data-code-layer-action="agent-report-dismiss" style={{ width: 20, height: 20 }}>
            <CloseIcon />
          </IconButton>
        ) : null}
      </ReportLine>
      <Detail data-code-layer-agent-progress>
        {`${run.element.label} · ${run.runner}`}
        {elapsed !== null ? <span data-code-layer-agent-elapsed={elapsed}>{` · ${t("agent.elapsed", { seconds: elapsed })}`}</span> : null}
      </Detail>
      {/* While it runs, what was asked: the server never sends the text back, this tab kept it. */}
      {!run.final && agent.text ? (
        <>
          <Detail>{t("agent.yourRequest")}</Detail>
          <Plain data-code-layer-agent-report-text>{agent.text}</Plain>
        </>
      ) : null}

      {run.result?.summary ? (
        <>
          <Detail>{t("agent.report.summary")}</Detail>
          <Plain data-code-layer-agent-summary>{run.result.summary}</Plain>
        </>
      ) : null}
      {run.state === "needs-decision" && run.result?.question ? <Plain data-code-layer-agent-report-question>{run.result.question}</Plain> : null}

      {run.state === "imported" && run.changes?.length ? (
        <Part id="agent-files" startOpen label={t("agent.report.files", { count: run.changes.length })}>
          {run.changes.map((change) => (
            <Detail key={change.file} data-code-layer-agent-file={change.file}>
              {t("agent.report.file", { file: change.file, added: change.added, removed: change.removed })}
            </Detail>
          ))}
        </Part>
      ) : null}
      {run.checks && run.checks.length > 0 ? (
        <Part id="agent-checks" label={t("agent.report.checks", { count: run.checks.length })}>
          {run.checks.map((check) => (
            <Detail key={check.id}>{t(check.ok ? "agent.report.checkOk" : "agent.report.checkFailed", { id: check.id })}</Detail>
          ))}
        </Part>
      ) : null}
      {rows.length > 0 ? (
        <Part id="agent-rows" startOpen label={t("agent.report.rows", { count: rows.length })}>
          {rows.map((row) => {
            const traced = selection?.rows.find((r) => r.id === row.id);
            return (
              <Detail key={row.id} data-code-layer-agent-row={row.id}>
                {t("agent.report.row", { row: traced ? rowLabel(traced) : row.id, from: row.from, to: row.to })}
              </Detail>
            );
          })}
        </Part>
      ) : null}

      {run.reasons?.length && run.state !== "imported" ? (
        <div data-code-layer-agent-reasons={run.reasons.length}>
          {run.reasons.map((reason, i) => (
            <Detail key={i} data-code-layer-agent-reason={reason.code}>
              <Warn>{agentReasonText(reason)}</Warn>
            </Detail>
          ))}
        </div>
      ) : null}
      {unchanged ? (
        <ReportLine>
          <Detail style={{ marginRight: "auto" }} data-code-layer-agent-unchanged>
            {t("agent.report.unchanged")}
          </Detail>
          {run.state === "rejected" || run.state === "failed" ? (
            <Button type="button" disabled={!selection} onClick={() => void copyReference()} data-code-layer-action="agent-copy-reference" style={{ height: 20, padding: "0 6px" }}>
              {copied ? t("header.copied") : t("agent.report.copyReference")}
            </Button>
          ) : null}
        </ReportLine>
      ) : null}
      {agent.error && run.final ? (
        <Detail>
          <Warn>{tCode("error", agent.error.code, "error.unknown", { code: agent.error.code })}</Warn>
        </Detail>
      ) : null}
    </ReportBox>
  );
}
