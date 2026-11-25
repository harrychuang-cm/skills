// Channel helpers for the preview side.
// - code-layer events carry one JSON string with { v, from, seq }.
// - Storybook core events are accepted only when this preview emitted them
//   (nested preview iframes, e.g. Prototype Inspector routes, share the transport).
// - Events whose source origin differs from ours are dropped.
import { addons } from "storybook/preview-api";

import { PROTOCOL_VERSION, decodePayload, encodePayload, type Envelope } from "../shared/protocol";

export type Channel = {
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  last(event: string): unknown[] | undefined;
  sender?: string;
};

type EventThis = { from?: string; source?: string } | undefined;

export function getChannel(): Channel {
  return addons.getChannel() as unknown as Channel;
}

let sequence = 0;

export function emitToManager(channel: Channel, event: string, payload: object): void {
  sequence += 1;
  channel.emit(event, encodePayload({ ...payload, v: PROTOCOL_VERSION, from: "preview", seq: sequence }));
}

export function onManager<T>(channel: Channel, event: string, handler: (payload: Envelope<T>) => void): () => void {
  const listener = function (this: EventThis, raw: unknown) {
    if (this && typeof this.source === "string" && this.source !== location.origin) return;
    const payload = decodePayload<Envelope<T>>(raw);
    if (!payload || payload.v !== PROTOCOL_VERSION || payload.from !== "manager") return;
    handler(payload);
  };
  channel.on(event, listener as (...args: unknown[]) => void);
  return () => channel.off(event, listener as (...args: unknown[]) => void);
}

export function onOwnCore(channel: Channel, event: string, handler: (...args: unknown[]) => void): () => void {
  const listener = function (this: EventThis, ...args: unknown[]) {
    if (this && typeof this.source === "string" && this.source !== location.origin) return;
    if (this && this.from !== undefined && channel.sender !== undefined && this.from !== channel.sender) return;
    handler(...args);
  };
  channel.on(event, listener);
  return () => channel.off(event, listener);
}
