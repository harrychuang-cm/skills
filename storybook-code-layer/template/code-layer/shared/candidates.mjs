// Which tokens can be the target of a re-bind. One definition for the dev
// server (validation) and the manager (token picker).

/**
 * A design token that a re-bind may point at: declared in a tier file of the
 * binding (not merely named like a token, not only in a read-only source),
 * declared once, and resolving to a value.
 */
export function isRebindTarget(token) {
  return Boolean(token) && token.source === "tier" && !token.rootless && !token.duplicate && token.resolution === "ok";
}

/** The re-bind targets among index token items (or server token records). */
export function rebindTargets(tokens) {
  return [...tokens].filter(isRebindTarget);
}
