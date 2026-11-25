// Paired content tokens (pure; shared by the dev server and the panel).
//
// A container color and the color of what sits on it are separate component
// tokens (`…-container-color` and `…-text-color`). When only the container is
// re-bound to another role, the content token may still follow the old role's
// `on-` color. The naming rule finds that; the contrast ratio, computed from
// the resolved token values, shows what a naming rule cannot (two roles whose
// `on-` colors are both white, but only one of which is readable).
//
// Nothing here blocks a batch: these are warnings for a person.
import { contrastRatio, sameColor } from "./contrast.mjs";

const round = (ratio) => (ratio === null ? null : Math.round(ratio * 100) / 100);

/**
 * prefix:  token prefix of the project (`md`)
 * pairing: { containerSuffix, contentSuffix }
 * tokens:  Map of name -> { alias, declaredValue, source, rootless }
 * changes: re-bound tokens of the batch: [{ id, token, tier, fromToken, toToken }]
 * Returns one entry per re-bound container (or lone content) token that has a
 * sibling: { operation, changed, containerToken, contentToken, oldRole,
 * newRole, warning, contentFollows, sameResolved, offer, contrast,
 * previousRatio }.
 */
export function pairingReport({ prefix, pairing, tokens, changes }) {
  const { containerSuffix, contentSuffix } = pairing;
  const rebound = new Map(changes.map((change) => [change.token, change]));
  const isToken = (name) => {
    const token = tokens.get(name);
    return Boolean(token) && token.source === "tier" && !token.rootless;
  };
  // Aliases and values as they will be once this batch is written.
  const aliasAfter = (name) => rebound.get(name)?.toToken ?? tokens.get(name)?.alias ?? null;
  const aliasBefore = (name) => tokens.get(name)?.alias ?? null;
  const resolve = (name, alias = aliasAfter) => {
    const seen = new Set();
    let current = name;
    while (current && !seen.has(current)) {
      seen.add(current);
      const next = alias(current);
      if (!next) return tokens.get(current)?.declaredValue ?? null;
      current = next;
    }
    return null;
  };
  const colorRole = (name) => (name.startsWith(`--${prefix}-sys-color-`) ? name.slice(`--${prefix}-sys-color-`.length) : null);
  const onPartner = (role) => {
    const name = role ? `--${prefix}-sys-color-on-${role}` : null;
    return name && isToken(name) ? name : null;
  };
  const contrast = (containerToken, contentToken) => {
    const container = resolve(containerToken);
    const content = resolve(contentToken);
    return { container, content, ratio: round(contrastRatio(content, container)) };
  };

  const report = [];
  for (const change of changes) {
    if (change.tier !== "comp") continue;
    if (change.token.endsWith(containerSuffix)) {
      const contentToken = change.token.slice(0, -containerSuffix.length) + contentSuffix;
      if (!isToken(contentToken)) continue;
      const oldRole = colorRole(change.fromToken);
      const newRole = colorRole(change.toToken);
      const onOld = onPartner(oldRole);
      const onNew = onPartner(newRole);
      const follows = onOld !== null && aliasAfter(contentToken) === onOld;
      report.push({
        operation: change.id,
        changed: "container",
        containerToken: change.token,
        contentToken,
        oldRole,
        newRole,
        warning: follows ? "content-follows-old-role" : null,
        contentFollows: follows ? onOld : null,
        sameResolved: follows && onNew ? sameColor(resolve(onOld), resolve(onNew)) : null,
        offer: follows && onNew ? { token: contentToken, fromToken: onOld, toToken: onNew } : null,
        contrast: contrast(change.token, contentToken),
        previousRatio: round(contrastRatio(resolve(contentToken, aliasBefore), resolve(change.token, aliasBefore))),
      });
    } else if (change.token.endsWith(contentSuffix)) {
      const containerToken = change.token.slice(0, -contentSuffix.length) + containerSuffix;
      // A container re-bound in the same batch already reports this pair.
      if (!isToken(containerToken) || rebound.has(containerToken)) continue;
      report.push({
        operation: change.id,
        changed: "content",
        containerToken,
        contentToken: change.token,
        oldRole: colorRole(change.fromToken),
        newRole: colorRole(change.toToken),
        warning: null,
        contentFollows: null,
        sameResolved: null,
        offer: null,
        contrast: contrast(containerToken, change.token),
        previousRatio: round(contrastRatio(resolve(change.token, aliasBefore), resolve(containerToken, aliasBefore))),
      });
    }
  }
  return report;
}
