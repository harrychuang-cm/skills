export type PairingTokenLike = { alias: string | null; declaredValue: string | null; source: string; rootless?: boolean };
export type PairingChange = { id: string; token: string; tier: string | null; fromToken: string; toToken: string };
export type PairingEntry = {
  operation: string;
  changed: "container" | "content";
  containerToken: string;
  contentToken: string;
  oldRole: string | null;
  newRole: string | null;
  warning: "content-follows-old-role" | null;
  contentFollows: string | null;
  sameResolved: boolean | null;
  offer: { token: string; fromToken: string; toToken: string } | null;
  contrast: { container: string | null; content: string | null; ratio: number | null };
  previousRatio: number | null;
};
export function pairingReport(input: {
  prefix: string;
  pairing: { containerSuffix: string; contentSuffix: string };
  tokens: Map<string, PairingTokenLike>;
  changes: PairingChange[];
}): PairingEntry[];
