import React from "react";

import { pendingBrief, pendingReason, type PendingEntry } from "../../shared/brief";
import { t, tCode, tMaybe } from "../../shared/i18n";
import { draftRowLabel, shortToken } from "../../shared/labels";
import { buildReference } from "../../shared/reference";
import { resolvePending } from "../actions";
import { reloadPreviewAndVerify, retryVerification, reverseApplied, skipApplied, undoApplied } from "../apply";
import { useStore } from "../store";
import { Button, Detail, Disclosure, DisclosureBody, Headline, ReportBox, ReportLine, StatusIcon, Warn } from "../styles";
import { PairingNote } from "./ChangesBar";

type ErrorDetails = {
  results?: Array<{ id: string; output?: string }>;
  conflicts?: Array<{ file: string; backup: string }>;
  canReverse?: boolean;
  mirrors?: Array<{ mirror: string; diffLines: number | null }>;
};

/** A selector must return the same value for the same state: one shared empty list. */
const NO_PENDING: PendingEntry[] = [];

/**
 * A part of the report that opens on demand. Its content is always in the
 * document (hidden while closed), so what arrives later takes its place
 * without moving anything.
 */
function Part({ id, label, tone, startOpen = false, extra, children }: { id: string; label: string; tone?: "attention"; startOpen?: boolean; extra?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(startOpen);
  return (
    <div data-code-layer-part={id} data-open={open ? "true" : "false"}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Disclosure type="button" tone={tone} aria-expanded={open} onClick={() => setOpen(!open)} data-code-layer-action={`toggle-${id}`}>
          <span aria-hidden="true">{open ? "▾" : "▸"}</span>
          <span>{label}</span>
        </Disclosure>
        {extra}
      </div>
      <DisclosureBody hidden={!open}>{children}</DisclosureBody>
    </div>
  );
}

function PendingPart({ applyId, entries }: { applyId: string; entries: PendingEntry[] }) {
  const selection = useStore((s) => s.selection);
  const [copied, setCopied] = React.useState(false);
  if (entries.length === 0) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pendingBrief(applyId, entries, selection ? buildReference(selection) : null));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div data-code-layer-pending-list={entries.length}>
      <Part
        id="pending"
        tone="attention"
        label={t("pending.title", { count: entries.length })}
        extra={
          <Button type="button" onClick={copy} data-code-layer-action="copy-brief" title={t("pending.copyTitle")} style={{ height: 20, padding: "0 6px", flex: "0 0 auto", minWidth: 64 }}>
            {copied ? t("header.copied") : t("pending.copy")}
          </Button>
        }
      >
        {entries.map((entry) => (
          <Detail key={entry.id} data-code-layer-pending={entry.id} data-kind={entry.kind} data-reason={entry.reason}>
            <span>{`${entry.file}:${entry.line} — ${pendingReason(entry)}`}</span>{" "}
            <Button type="button" onClick={() => void resolvePending([entry.id])} data-code-layer-action="resolve-pending" style={{ height: 20, padding: "0 6px" }}>
              {t("pending.resolve")}
            </Button>
            {entry.excerpt && entry.kind !== "truncated" ? <div style={{ opacity: 0.8 }}>{entry.excerpt}</div> : null}
          </Detail>
        ))}
        <Detail>
          <Button type="button" onClick={() => void resolvePending(entries.map((entry) => entry.id))} data-code-layer-action="resolve-all" style={{ height: 20, padding: "0 6px" }}>
            {t("pending.resolveAll")}
          </Button>
        </Detail>
      </Part>
    </div>
  );
}

/** What applying (or undoing) did: one line, and the rest on demand. */
export function Report({ prefix }: { prefix: string }) {
  const state = useStore((s) => s.applyState);
  const pendingDocs = useStore((s) => s.server?.pendingDocs ?? NO_PENDING);
  if (state.phase === "idle") return null;
  const busy = state.phase === "arming" || state.phase === "writing" || state.phase === "verifying" || state.phase === "undoing";
  const labels = Object.fromEntries(state.drafts.map((d) => [d.id, `${draftRowLabel(d)} · ${d.elementLabel}${t("reference.colon")}${shortToken(d.op.fromToken, prefix)} → ${shortToken(d.op.toToken, prefix)}`]));
  const outcome = state.result ? t(`report.${state.mode}.${state.result.status}` as "report.apply.verified") : "";
  const headline = state.error
    ? t(state.phase === "done" && state.applyId ? "report.notUndone" : "report.notApplied", { reason: tCode("error", state.error.code, "error.unknown") })
    : busy
      ? state.phase === "verifying"
        ? t(state.mode === "undo" ? "report.undoVerifying" : "report.applyVerifying")
        : state.phase === "undoing"
          ? t("report.undoing")
          : t("report.applying")
      : outcome;
  const details = state.error?.details as ErrorDetails | undefined;
  const entries = state.applyId && !state.undone ? pendingDocs.filter((entry) => entry.applyId === state.applyId) : [];
  const post = state.postApply;
  const items = state.result?.items ?? [];
  const allVerified = items.every((item) => item.status === "verified");
  const tone = state.error ? "error" : busy ? "busy" : state.result?.status ?? "";
  const warnings = state.pairing.filter((entry) => entry.warning);

  return (
    <ReportBox data-code-layer-report={state.result?.status ?? state.phase} data-code-layer-report-mode={state.mode} data-code-layer-error={state.error?.code ?? ""}>
      <ReportLine>
        <StatusIcon tone={tone}>{tone === "verified" ? "✓" : tone === "busy" ? "…" : "!"}</StatusIcon>
        <Headline data-code-layer-headline title={state.applyId ? t("report.record", { id: state.applyId }) : undefined}>
          {headline}
        </Headline>
        {state.applyId && !busy && state.mode === "apply" && !state.undone && !state.skipped ? (
          <Button type="button" onClick={() => void undoApplied()} data-code-layer-action="undo">
            {t("report.undo")}
          </Button>
        ) : null}
      </ReportLine>
      {state.progress ? <Detail>{tMaybe(state.progress) ?? state.progress}</Detail> : null}
      {state.undoMode === "reverse" ? <Detail>{t("report.reversed")}</Detail> : null}
      {details?.results?.map((r) => (
        <Detail key={r.id}>
          <Warn>{`${r.id}${t("reference.colon")}${(r.output ?? "").slice(-400)}`}</Warn>
        </Detail>
      ))}
      {details?.conflicts?.map((c) => (
        <Detail key={c.file}>
          <Warn>{t("report.conflict", { file: c.file, backup: c.backup })}</Warn>
        </Detail>
      ))}
      {details?.mirrors?.map((m) => (
        <Detail key={m.mirror}>
          <Warn>{t("report.mirror", { mirror: m.mirror, lines: m.diffLines ?? "?" })}</Warn>
        </Detail>
      ))}
      {state.skipped ? <Detail>{t("report.skipped")}</Detail> : null}
      {state.applyId && !busy && state.error?.code === "undo-conflict" && !state.skipped ? (
        <ReportLine>
          {details?.canReverse ? (
            <Button type="button" primary onClick={() => void reverseApplied()} data-code-layer-action="reverse" title={t("report.reverseTitle")}>
              {t("report.reverse")}
            </Button>
          ) : null}
          <Button type="button" onClick={() => void skipApplied()} data-code-layer-action="skip">
            {t("report.skip")}
          </Button>
        </ReportLine>
      ) : null}

      {items.length > 0 ? (
        // Opens by itself when a change is not verified: that is what needs attention.
        <Part key={`items-${state.applyId}-${state.mode}-${allVerified}`} id="items" tone={allVerified ? undefined : "attention"} startOpen={!allVerified} label={t("report.items", { count: items.length })}>
          {items.map((item) => (
            <Detail key={item.draftId} data-code-layer-verify-item={item.draftId} data-status={item.status}>
              {`${labels[item.draftId] ?? item.draftId}${t("reference.colon")}${t(`verify.item.${item.status}` as "verify.item.verified")}`}
              {item.expected || item.actual ? t("verify.expected", { expected: item.expected ?? "—", actual: item.actual ?? "—" }) : ""}
              {item.reason ? ` · ${tMaybe(item.reason) ?? item.reason}` : ""}
            </Detail>
          ))}
          {state.applyId && !busy && !state.error ? (
            <Detail>
              <Button type="button" onClick={() => void retryVerification()} data-code-layer-action="reverify" style={{ height: 20, padding: "0 6px", marginRight: 6 }}>
                {t("report.reverify")}
              </Button>
              <Button type="button" onClick={reloadPreviewAndVerify} data-code-layer-action="reload-verify" style={{ height: 20, padding: "0 6px" }}>
                {t("report.reloadVerify")}
              </Button>
            </Detail>
          ) : null}
        </Part>
      ) : null}
      {!state.undone && state.documents.length > 0 ? (
        <div data-code-layer-documents={state.documents.length}>
          <Part id="documents" label={t("documents.title", { count: state.documents.length })}>
            {state.documents.map((doc) => (
              <Detail key={`${doc.file}:${doc.line}`} data-code-layer-document={`${doc.file}:${doc.line}`}>
                {t("documents.row", { file: doc.file, line: doc.line, before: shortToken(doc.before, prefix), after: shortToken(doc.after, prefix) })}
              </Detail>
            ))}
          </Part>
        </div>
      ) : null}
      {!state.undone && state.pairing.length > 0 ? (
        <div data-code-layer-report-pairing={state.pairing.length}>
          <Part id="pairing" tone={warnings.length > 0 ? "attention" : undefined} label={t("report.pairing", { count: state.pairing.length })}>
            {state.pairing.map((entry) => (
              <PairingNote key={entry.operation} entry={entry} prefix={prefix} />
            ))}
          </Part>
        </div>
      ) : null}
      {state.applyId ? <PendingPart applyId={state.applyId} entries={entries} /> : null}
      {post && post.status !== "none" ? (
        <div data-code-layer-post-apply={post.status} data-stale={post.stale ? "true" : "false"}>
          <Part id="post-apply" tone={post.status === "done" && post.stale ? "attention" : undefined} label={post.status === "done" ? (post.stale ? t("postApply.stale") : t("postApply.done")) : t("postApply.running")}>
            {/* One row per command from the start: a result takes the place of its "running" row. */}
            {(post.commands.length > 0 ? post.commands : post.results.map((result) => result.id)).map((id) => {
              const result = post.results.find((r) => r.id === id);
              if (!result) {
                return (
                  <Detail key={id} data-code-layer-post-result={id} data-ok="">
                    {t("postApply.waiting", { id })}
                  </Detail>
                );
              }
              return (
                <Detail key={id} data-code-layer-post-result={id} data-ok={result.ok ? "true" : "false"}>
                  {result.ok ? t("postApply.ok", { id: result.id, ms: result.durationMs }) : <Warn>{t(result.timedOut ? "postApply.timedOut" : "postApply.failed", { id: result.id, code: result.code ?? "—", output: result.output.slice(-300) })}</Warn>}
                </Detail>
              );
            })}
          </Part>
        </div>
      ) : null}
    </ReportBox>
  );
}
