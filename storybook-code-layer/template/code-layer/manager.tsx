// Code Layer manager entry. Bundled by Storybook's manager builder (esbuild,
// classic JSX, React 18): every JSX file imports React. Guarded so a second
// evaluation of the entry registers nothing twice.
import React from "react";
import { addons, types } from "storybook/manager-api";

import {
  ADDON_ID,
  EVENTS,
  PANEL_ID,
  TOOL_ID,
  type PreviewStatePayload,
  type SelectionPayload,
  type StatusPayload,
} from "./shared/protocol";
import { hydrate, syncPreview } from "./manager/actions";
import { restoreLastApply, resumePending } from "./manager/apply";
import { fetchIndex, fetchSession } from "./manager/api";
import { emitToPreview, onPreview } from "./manager/channel";
import { PanelHost } from "./manager/PanelHost";
import { recallSelection, rememberSelection } from "./manager/persist";
import { store } from "./manager/store";
import { Tool } from "./manager/Tool";

const FLAG = "__CODE_LAYER_MANAGER__";
const scope = globalThis as unknown as Record<string, boolean | undefined>;

async function boot(): Promise<void> {
  const session = await fetchSession();
  store.set({ session });
  await fetchIndex();
  if (session?.projectId) hydrate(session.projectId);
  restoreLastApply();
}

function restoreSelectionFor(storyId: string | null): void {
  if (!storyId || store.get().selection) return;
  const descriptor = recallSelection(storyId);
  if (descriptor) emitToPreview(EVENTS.select, { descriptor });
}

if (!scope[FLAG]) {
  scope[FLAG] = true;
  addons.register(ADDON_ID, () => {
    onPreview(EVENTS.ready, () => {
      syncPreview();
      resumePending();
    });
    onPreview<{ applyId: string; message: string }>(EVENTS.verifyProgress, (payload) => {
      const apply = store.get().applyState;
      if (apply.phase === "verifying") store.set({ applyState: { ...apply, progress: payload.message } });
    });
    onPreview<StatusPayload>(EVENTS.status, (payload) => {
      const previous = store.get().status;
      store.set({ status: payload });
      if (payload.indexRevision && payload.indexRevision !== store.get().index?.revision) void fetchIndex();
      const becameActive = payload.effective.state === "active" && previous?.effective.state !== "active";
      const storyChanged = payload.storyId !== (previous?.storyId ?? null);
      if (payload.effective.state === "active" && (becameActive || storyChanged)) {
        syncPreview();
        restoreSelectionFor(payload.storyId);
      }
    });
    onPreview<SelectionPayload>(EVENTS.selection, (payload) => {
      const storyId = payload.trace?.storyId ?? store.get().status?.storyId ?? null;
      store.set({ selection: payload.trace, pickerRow: payload.trace ? store.get().pickerRow : null });
      if (storyId && payload.reason !== "story-change" && payload.reason !== "lost") {
        rememberSelection(storyId, payload.trace?.descriptor ?? null);
      }
    });
    onPreview<{ revision: string; values: Record<string, string> }>(EVENTS.tokenValues, (payload) =>
      store.set({ tokenValues: payload.values }),
    );
    onPreview<PreviewStatePayload>(EVENTS.previewState, (payload) => {
      store.set({ previewState: Object.fromEntries(payload.items.map((item) => [item.id, { status: item.status, message: item.message }])) });
    });
    onPreview<{ rowId: string; traceId: string; result: string }>(EVENTS.probeResult, (payload) => {
      store.set({ probes: { ...store.get().probes, [`${payload.traceId}:${payload.rowId}`]: payload.result } });
    });
    onPreview<{ action: string; text?: string }>(EVENTS.request, (payload) => {
      if (payload.action === "copy" && payload.text) void navigator.clipboard.writeText(payload.text).catch(() => undefined);
    });

    addons.add(TOOL_ID, {
      type: types.TOOL,
      title: "Code Layer",
      match: ({ viewMode }) => viewMode === "story" || viewMode === "docs",
      render: () => <Tool />,
    });
    addons.add(PANEL_ID, {
      type: types.PANEL,
      title: "設計",
      render: () => <PanelHost />,
    });
    void boot();
  });
}
