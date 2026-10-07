// Embedded preview page for the anchored capture checks in
// test/anchor-fixture-entry.ts: loading the review runtime registers this
// window's capture hook, as a Storybook preview inside a canvas frame would.
import { configureFigmaExportReview } from "../src/review";

configureFigmaExportReview(
  { storyTitlePrefix: false, visualComments: { enabled: true } },
  { visualComments: { enabled: true } },
);

// The fixture records every hook call with its options; `delay` slows the hook
// down and `fail=1` makes it reject.
const params = new URLSearchParams(location.search);
const hookKey = Symbol.for("sbfx.captureHook");
const frameWindow = window as unknown as Record<symbol, unknown> & { __sbfxHookCalls?: unknown[] };
const registeredHook = frameWindow[hookKey] as (options?: unknown) => Promise<unknown>;
frameWindow.__sbfxHookCalls = [];
frameWindow[hookKey] = async (options?: unknown) => {
  frameWindow.__sbfxHookCalls!.push(options ?? null);
  const delay = Number(params.get("delay") ?? 0);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  if (params.get("fail") === "1") throw new Error("Embedded capture failed on purpose.");
  return registeredHook(options);
};
document.documentElement.dataset.fixtureFrameReady = "true";
