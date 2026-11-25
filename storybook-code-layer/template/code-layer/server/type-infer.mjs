// Kept for server imports; the logic lives in shared/kinds.mjs so the manager
// (token picker) and the server apply the same "same type" rule.
export { inferKind, isKeywordValue, kindsCompatible, parseScalar, sameScale, tokenCategory } from "../shared/kinds.mjs";
