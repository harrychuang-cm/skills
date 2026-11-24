// Docking the addon panel to the right while Code Layer is on, and putting
// the user's layout back afterwards.
//
// Storybook persists panel position in localStorage (shared by every
// Storybook on this origin) and visibility / selected panel in
// sessionStorage, and on reload the session copy wins. So: dock, then write
// the previous position back into localStorage right away. Only this tab's
// session remembers "right"; a closed tab or another Storybook is unaffected.
import { PANEL_ID } from "../shared/protocol";

const SNAPSHOT_KEY = "code-layer/v1/layout-snapshot";
const MANAGER_STORE_KEY = "@storybook/manager/store";

type Position = "bottom" | "right";
type Snapshot = { position: Position; shown: boolean; selected: string | null };

export type LayoutApi = {
  togglePanelPosition(position?: Position): unknown;
  togglePanel(toggled?: boolean): unknown;
  setSelectedPanel(panelName: string): unknown;
  getIsPanelShown(): boolean;
  getSelectedPanel(): string | undefined;
};

function readSnapshot(): Snapshot | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot: Snapshot | null): void {
  try {
    if (snapshot) sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    else sessionStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // ignore
  }
}

/** Put the persisted (cross-tab) panel position back to `position`; returns whether it stuck. */
function healLocalPosition(position: Position): boolean {
  try {
    const raw = localStorage.getItem(MANAGER_STORE_KEY);
    if (!raw) return true;
    const data = JSON.parse(raw) as { layout?: { panelPosition?: Position } };
    if (data.layout && data.layout.panelPosition !== position) {
      data.layout.panelPosition = position;
      localStorage.setItem(MANAGER_STORE_KEY, JSON.stringify(data));
    }
    const check = JSON.parse(localStorage.getItem(MANAGER_STORE_KEY) ?? "{}") as { layout?: { panelPosition?: Position } };
    return !check.layout || check.layout.panelPosition === position;
  } catch {
    return false;
  }
}

export function canDock(viewMode: string | undefined): boolean {
  return window.innerWidth >= 600 && viewMode === "story";
}

export async function dock(api: LayoutApi, currentPosition: Position, viewMode: string | undefined): Promise<void> {
  if (!canDock(viewMode)) return;
  let snapshot = readSnapshot();
  if (!snapshot) {
    snapshot = { position: currentPosition, shown: api.getIsPanelShown(), selected: api.getSelectedPanel() ?? null };
    writeSnapshot(snapshot);
  }
  await api.togglePanelPosition("right");
  await api.togglePanel(true);
  await api.setSelectedPanel(PANEL_ID);
  healLocalPosition(snapshot.position);
}

export async function undock(api: LayoutApi, currentPosition: Position): Promise<void> {
  const snapshot = readSnapshot();
  if (!snapshot) return;
  writeSnapshot(null);
  if (currentPosition === "right" && snapshot.position !== "right") await api.togglePanelPosition(snapshot.position);
  if (api.getSelectedPanel() === PANEL_ID && snapshot.selected && snapshot.selected !== PANEL_ID) await api.setSelectedPanel(snapshot.selected);
  // togglePanel always writes the whole current layout to this tab's session
  // storage, which would otherwise still say "right" after a reload.
  await api.togglePanel(snapshot.shown ? api.getIsPanelShown() : false);
}
