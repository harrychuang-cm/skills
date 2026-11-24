// Manager-side channel helpers (same envelope as the preview side).
import { addons } from "storybook/manager-api";

import { decodePayload, encodePayload, type Envelope } from "../shared/protocol";

let sequence = 0;

export function emitToPreview(event: string, payload: object): void {
  sequence += 1;
  addons.getChannel().emit(event, encodePayload({ ...payload, v: 1, from: "manager", seq: sequence }));
}

export function onPreview<T>(event: string, handler: (payload: Envelope<T>) => void): () => void {
  const channel = addons.getChannel();
  const listener = (raw: unknown) => {
    const payload = decodePayload<Envelope<T>>(raw);
    if (!payload || payload.v !== 1 || payload.from !== "preview") return;
    handler(payload);
  };
  channel.on(event, listener);
  return () => channel.off(event, listener);
}

export function focusPreview(): void {
  const iframe = document.getElementById("storybook-preview-iframe") as HTMLIFrameElement | null;
  iframe?.contentWindow?.focus();
}

export function isManagerFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}
