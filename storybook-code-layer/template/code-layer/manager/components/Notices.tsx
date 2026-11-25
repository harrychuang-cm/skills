import React from "react";

import { t, tCode } from "../../shared/i18n";
import { cancelMirrorSync, checkMirrorSync, confirmMirrorSync, dismissNotice } from "../actions";
import { useStore } from "../store";
import { Button, Notice, Warn } from "../styles";

function when(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * What a person has to know before editing, and nothing else: read-only
 * mode, a mirror out of step (with the action that fixes it), a selection that
 * went away, drafts that were discarded, specification rows that disagree.
 */
export function Notices({ dev }: { dev: boolean }) {
  const server = useStore((s) => s.server);
  const status = useStore((s) => s.status);
  const notice = useStore((s) => s.notice);
  const lost = useStore((s) => s.lostSelection);
  const reloadRequired = useStore((s) => s.reloadRequired);
  const sync = useStore((s) => s.mirrorSync);
  const drifting = (server?.mirrors ?? []).filter((m) => !m.inSync);
  const drift = server?.governance.drift ?? null;
  const refused = server?.postApply.refused ?? [];
  const busy = sync.phase === "checking" || sync.phase === "syncing";
  return (
    <>
      {reloadRequired ? (
        <Notice tone="info" data-code-layer-notice="reload-required">
          {t("notice.reloadRequired")}
          <div>
            <Button type="button" primary onClick={() => window.location.reload()} data-code-layer-action="reload-page" style={{ height: 20, padding: "0 6px" }}>
              {t("notice.reload")}
            </Button>
          </div>
        </Notice>
      ) : null}
      {status?.serverReadOnly || server?.readOnly.active ? (
        <Notice data-code-layer-notice="read-only">
          {t("notice.readOnly")}
          {(server?.readOnly.reasons ?? []).map((reason) => (
            <div key={reason.code}>{tCode("error", reason.code, "error.unknown")}</div>
          ))}
        </Notice>
      ) : null}
      {notice === "drafts-discarded" ? (
        <Notice tone="info" data-code-layer-notice="drafts-discarded">
          {t("notice.draftsDiscarded")}
          <div>
            <Button type="button" onClick={dismissNotice} data-code-layer-action="dismiss-notice" style={{ height: 20, padding: "0 6px" }}>
              {t("notice.dismiss")}
            </Button>
          </div>
        </Notice>
      ) : null}
      {lost !== null ? (
        <Notice tone="info" data-code-layer-notice="selection-lost">
          {t("notice.selectionLost", { label: lost })}
        </Notice>
      ) : null}
      {drifting.length > 0 ? (
        <Notice data-code-layer-notice="mirror-drift">
          <strong>{t("mirror.title")}</strong>
          {drifting.map((m) => (
            <div key={m.id} data-code-layer-drift={m.mirror} title={t("mirror.file", { mirror: m.mirror, source: m.source, lines: m.diffLines ?? "?", sourceTime: when(m.sourceModified), mirrorTime: when(m.mirrorModified) })}>
              {dev ? t("mirror.file", { mirror: m.mirror, source: m.source, lines: m.diffLines ?? "?", sourceTime: when(m.sourceModified), mirrorTime: when(m.mirrorModified) }) : t("mirror.overwrite", { mirror: m.mirror, source: m.source, lines: m.diffLines ?? "?" })}
            </div>
          ))}
          {sync.phase === "confirm" ? (
            <div data-code-layer-sync-confirm>
              <div>{t("mirror.confirm")}</div>
              {sync.files.map((file) => (
                <div key={file.mirror}>{t("mirror.overwrite", { mirror: file.mirror, source: file.source, lines: file.diffLines })}</div>
              ))}
              <div style={{ display: "flex", gap: 6 }}>
                <Button type="button" primary onClick={() => void confirmMirrorSync()} data-code-layer-action="sync-confirm">
                  {t("mirror.confirmAction")}
                </Button>
                <Button type="button" onClick={cancelMirrorSync} data-code-layer-action="sync-cancel">
                  {t("action.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button type="button" disabled={busy} onClick={() => void checkMirrorSync()} data-code-layer-action="sync-mirror">
                {busy ? t("mirror.working") : t("mirror.action")}
              </Button>
            </div>
          )}
          {sync.error ? (
            <div>
              <Warn>{tCode("error", sync.error.code, "error.unknown")}</Warn>
            </div>
          ) : null}
        </Notice>
      ) : null}
      {/* Rows that disagree with the token file matter to everyone; tokens without a row only to whoever keeps the specification. */}
      {drift && (drift.rows > 0 || (dev && drift.undocumented > 0)) ? (
        <Notice tone="info" data-code-layer-notice="contract-drift">
          {t("drift.summary", { rows: drift.rows, undocumented: drift.undocumented })}
          {drift.items.slice(0, 5).map((item) => (
            <div key={`${item.file}:${item.line}`}>{t("drift.item", { file: item.file, line: item.line, token: item.token, documented: item.documented, actual: item.actual })}</div>
          ))}
        </Notice>
      ) : null}
      {refused.length > 0 ? (
        <Notice tone="info" data-code-layer-notice="post-apply-refused">
          {refused.map((command) => (
            <div key={command.id}>{t("postApply.refused", { id: command.id, writes: command.writes.join(", ") })}</div>
          ))}
        </Notice>
      ) : null}
    </>
  );
}
