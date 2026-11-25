// Paired content tokens for a batch being validated or applied. The rule
// itself is shared with the panel (shared/pairing.mjs), which shows the same
// warnings before anything is sent.
import { pairingReport as report } from "../shared/pairing.mjs";

export function pairingReport({ config, index, results }) {
  return report({
    prefix: config.tokens.prefix,
    pairing: config.governance.pairing,
    tokens: index.tokenIndex.tokens,
    changes: results.filter((r) => r.type === "rebind-token").map((r) => ({ id: r.id, token: r.token, tier: r.tier, fromToken: r.fromToken, toToken: r.toToken })),
  });
}
