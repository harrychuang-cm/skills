// Code Layer manager entry. Bundled by Storybook's manager builder (esbuild,
// classic JSX, React 18): every JSX file imports React. Guarded so a second
// evaluation of the entry registers nothing twice.
import React from "react";
import { addons, types } from "storybook/manager-api";

import {
  ADDON_ID,
  EVENTS,
  INSPECTOR_ID,
  TOOL_ID,
  type ChildrenPayload,
  type LayoutPayload,
  type PreviewStatePayload,
  type SelectionPayload,
  type StatusPayload,
} from "./shared/protocol";
import { hydrate, refreshServer, syncPreview } from "./manager/actions";
import { agentSelectionArrived, announceAgentReadiness, openAgentDialog, resumeAgentRun } from "./manager/agent";
import { restoreLastApply, resumePending } from "./manager/apply";
import { fetchIndex, fetchSession, fetchState } from "./manager/api";
import { emitToPreview, onPreview } from "./manager/channel";
import { CanvasInspector } from "./manager/Inspector";
import { recallSelection, rememberSelection } from "./manager/persist";
import { store } from "./manager/store";
import { Tool } from "./manager/Tool";

const FLAG = "__CODE_LAYER_MANAGER__";
const scope = globalThis as unknown as Record<string, boolean | undefined>;

async function boot(): Promise<void> {
  const session = await fetchSession();
  store.set({ session, booted: true });
  await fetchIndex();
  void fetchState();
  if (session?.projectId) hydrate(session.projectId);
  restoreLastApply();
  void resumeAgentRun();
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
      announceAgentReadiness();
    });
    onPreview<{ applyId: string; message: string }>(EVENTS.verifyProgress, (payload) => {
      const apply = store.get().applyState;
      if (apply.phase === "verifying") store.set({ applyState: { ...apply, progress: payload.message } });
    });
    onPreview<StatusPayload>(EVENTS.status, (payload) => {
      const previous = store.get().status;
      store.set({ status: payload });
      // The source changed (an apply, an external edit, a mirror out of step): refresh what the server knows.
      if (payload.indexRevision && payload.indexRevision !== store.get().index?.revision) void refreshServer();
      const becameActive = payload.effective.state === "active" && previous?.effective.state !== "active";
      const storyChanged = payload.storyId !== (previous?.storyId ?? null);
      if (payload.effective.state === "active" && (becameActive || storyChanged)) {
        syncPreview();
        restoreSelectionFor(payload.storyId);
      }
    });
    onPreview<SelectionPayload>(EVENTS.selection, (payload) => {
      const storyId = payload.trace?.storyId ?? store.get().status?.storyId ?? null;
      const previous = store.get().selection;
      store.set({
        selection: payload.trace,
        // The element left the page: say so instead of silently emptying the panel.
        lostSelection: payload.reason === "lost" ? previous?.label ?? "" : null,
        ...(payload.trace ? {} : { openRow: null, relatives: null }),
      });
      if (storyId && payload.reason !== "story-change" && payload.reason !== "lost") {
        rememberSelection(storyId, payload.trace?.descriptor ?? null);
      }
      agentSelectionArrived(payload.trace);
    });
    onPreview<{ revision: string; values: Record<string, string> }>(EVENTS.tokenValues, (payload) =>
      store.set({ tokenValues: payload.values }),
    );
    onPreview<LayoutPayload>(EVENTS.layout, (payload) => store.set({ layout: { obstacles: payload.obstacles, viewport: payload.viewport } }));
    onPreview<ChildrenPayload>(EVENTS.children, (payload) => store.set({ relatives: payload.traceId ? payload : null }));
    onPreview<PreviewStatePayload>(EVENTS.previewState, (payload) => {
      store.set({ previewState: Object.fromEntries(payload.items.map((item) => [item.id, { status: item.status, message: item.message, params: item.params }])) });
    });
    onPreview<{ rowId: string; scope: string; traceId: string; result: string }>(EVENTS.probeResult, (payload) => {
      store.set({ probes: { ...store.get().probes, [`${payload.traceId}:${payload.rowId}:${payload.scope}`]: payload.result } });
    });
    onPreview<{ action: string; text?: string }>(EVENTS.request, (payload) => {
      if (payload.action === "copy" && payload.text) void navigator.clipboard.writeText(payload.text).catch(() => undefined);
      // The selection label's AI control: it carries no text, it only opens the inspector's dialog.
      else if (payload.action === "agent") openAgentDialog();
    });

    addons.add(TOOL_ID, {
      type: types.TOOL,
      title: "Code Layer",
      match: ({ viewMode }) => viewMode === "story" || viewMode === "docs",
      render: () => <Tool />,
    });
    void boot();
  });
  // The inspector floats over the canvas: a canvas wrapper mounts it, and no addon panel is registered.
  // Added here, while the entry is evaluated, and not in the register callback: Storybook's canvas keeps
  // the list of wrappers it saw on its first render, which happens before register callbacks have run.
  addons.add(INSPECTOR_ID, {
    type: types.PREVIEW,
    render: CanvasInspector,
  });
}
