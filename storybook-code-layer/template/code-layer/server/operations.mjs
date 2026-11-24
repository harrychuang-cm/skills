// Operation schema, semantic validation, and resolution to byte edits.
// Every decision uses an index built fresh from disk inside the transaction.
import { ApiError, ID_PATTERN, OPERATION_TYPES, TOKEN_NAME_PATTERN } from "../shared/api-contract.mjs";
import { kindsCompatible } from "../shared/kinds.mjs";
import { normalizeValue, replaceVarName } from "../shared/value-refs.mjs";
import { walkStyleRules } from "./css-index.mjs";
import { readCssSource } from "./css-source.mjs";

function fail(code, message, details) {
  throw new ApiError(code, message, details);
}

function exactKeys(object, required, optional, where) {
  if (!object || typeof object !== "object" || Array.isArray(object)) fail("schema-invalid", `${where} must be an object`);
  for (const key of Object.keys(object)) {
    if (!required.includes(key) && !optional.includes(key)) fail("schema-invalid", `${where} has unknown key "${key}"`);
  }
  for (const key of required) if (!(key in object)) fail("schema-invalid", `${where}.${key} is required`);
}

function string(value, where, limits, pattern = null) {
  if (typeof value !== "string" || value.length === 0) fail("schema-invalid", `${where} must be a non-empty string`);
  if (value.length > limits.maxStringLength) fail("schema-invalid", `${where} is too long`);
  if (pattern && !pattern.test(value)) fail("schema-invalid", `${where} is malformed`);
  return value;
}

function integer(value, where) {
  if (!Number.isInteger(value) || value < 0) fail("schema-invalid", `${where} must be a non-negative integer`);
  return value;
}

/** Exact-key validation of an apply / validate body. */
export function validateBatch(body, limits) {
  exactKeys(body, ["schemaVersion", "batchId", "indexRevision", "operations"], ["dryRun", "client"], "body");
  if (body.schemaVersion !== 1) fail("schema-invalid", "schemaVersion must be 1");
  string(body.batchId, "batchId", limits, ID_PATTERN);
  string(body.indexRevision, "indexRevision", limits);
  if (body.dryRun !== undefined && typeof body.dryRun !== "boolean") fail("schema-invalid", "dryRun must be boolean");
  if (body.client !== undefined) {
    exactKeys(body.client, [], ["storyId"], "client");
    if (body.client.storyId !== undefined) string(body.client.storyId, "client.storyId", limits);
  }
  if (!Array.isArray(body.operations) || body.operations.length === 0) fail("schema-invalid", "operations must be a non-empty array");
  if (body.operations.length > limits.maxOperations) fail("schema-invalid", `at most ${limits.maxOperations} operations`);
  const ids = new Set();
  body.operations.forEach((op, i) => {
    const where = `operations[${i}]`;
    if (!op || typeof op !== "object") fail("schema-invalid", `${where} must be an object`);
    if (!OPERATION_TYPES.includes(op.type)) fail("schema-invalid", `${where}.type is unknown`);
    const common = ["id", "type", "fromToken", "toToken", "before", "after"];
    if (op.type === "rebind-token") exactKeys(op, [...common, "token"], ["reason"], where);
    else exactKeys(op, [...common, "file", "rule", "declaration", "replacements"], ["reason"], where);
    string(op.id, `${where}.id`, limits, ID_PATTERN);
    if (ids.has(op.id)) fail("schema-invalid", `${where}.id is duplicated`);
    ids.add(op.id);
    string(op.fromToken, `${where}.fromToken`, limits, TOKEN_NAME_PATTERN);
    string(op.toToken, `${where}.toToken`, limits, TOKEN_NAME_PATTERN);
    exactKeys(op.before, ["value"], ["fileHash"], `${where}.before`);
    string(op.before.value, `${where}.before.value`, limits);
    exactKeys(op.after, ["value"], [], `${where}.after`);
    string(op.after.value, `${where}.after.value`, limits);
    if (op.reason !== undefined) {
      exactKeys(op.reason, [], ["storyId", "element", "cssProperty"], `${where}.reason`);
      for (const key of Object.keys(op.reason)) string(op.reason[key], `${where}.reason.${key}`, limits);
    }
    if (op.type === "rebind-token") {
      string(op.token, `${where}.token`, limits, TOKEN_NAME_PATTERN);
    } else {
      string(op.file, `${where}.file`, limits, /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.css$/);
      if (op.file.split("/").some((part) => part === ".." || part === ".")) fail("schema-invalid", `${where}.file is malformed`);
      exactKeys(op.rule, ["ordinal", "selector", "atRules", "occurrence"], [], `${where}.rule`);
      integer(op.rule.ordinal, `${where}.rule.ordinal`);
      integer(op.rule.occurrence, `${where}.rule.occurrence`);
      string(op.rule.selector, `${where}.rule.selector`, limits);
      if (!Array.isArray(op.rule.atRules) || op.rule.atRules.length > 8) fail("schema-invalid", `${where}.rule.atRules must be an array`);
      op.rule.atRules.forEach((at, j) => {
        exactKeys(at, ["name", "params"], [], `${where}.rule.atRules[${j}]`);
        string(at.name, `${where}.rule.atRules[${j}].name`, limits);
        if (typeof at.params !== "string") fail("schema-invalid", `${where}.rule.atRules[${j}].params must be a string`);
      });
      exactKeys(op.declaration, ["property"], [], `${where}.declaration`);
      string(op.declaration.property, `${where}.declaration.property`, limits, /^-{0,2}[a-z][a-z0-9-]*$/);
      if (!Array.isArray(op.replacements) || op.replacements.length !== 1) {
        fail("unsupported-value-shape", `${where}: exactly one replacement is supported`);
      }
      exactKeys(op.replacements[0], ["refIndex", "fromToken", "toToken"], [], `${where}.replacements[0]`);
      if (op.replacements[0].refIndex !== 0) fail("unsupported-value-shape", `${where}: only the first var() can be re-bound`);
      if (op.replacements[0].fromToken !== op.fromToken || op.replacements[0].toToken !== op.toToken) {
        fail("schema-invalid", `${where}.replacements must match fromToken/toToken`);
      }
    }
  });
  return body;
}

function designToken(index, name, where) {
  const token = index.tokenIndex.tokens.get(name);
  if (!token || token.source !== "tier" || token.rootless) fail("not-a-design-token", `${where}: ${name} is not a design token`, { token: name });
  if (token.duplicate) fail("duplicate-token-declaration", `${where}: ${name} is declared more than once`, { token: name });
  if (token.resolution !== "ok") fail("not-a-design-token", `${where}: ${name} does not resolve`, { token: name });
  return token;
}

function findTokenDecl(root, name) {
  const matches = [];
  root.walkDecls(name, (decl) => {
    const parent = decl.parent;
    if (parent.type === "rule" && parent.parent?.type === "root" && parent.selector.trim() === ":root") matches.push(decl);
  });
  return matches;
}

/**
 * Resolve validated operations against a fresh index.
 * Returns { files: Map<absPath, { role, source, root, edits[] }>, results: [...] }.
 */
export function resolveOperations(batch, { config, postcss, index }) {
  const tokens = index.tokenIndex.tokens;
  const prefix = config.tokens.prefix;
  const files = new Map();
  const targets = new Set();
  const results = [];
  const sourceFor = (absPath, role) => {
    if (!files.has(absPath)) {
      const source = readCssSource(absPath);
      if (!source.ok) fail("unsupported-value-shape", `${absPath} cannot be patched safely (${source.reason})`);
      files.set(absPath, { role, source, root: postcss.parse(source.text, { from: absPath }), edits: [] });
    }
    return files.get(absPath);
  };

  for (const op of batch.operations) {
    const where = `operation ${op.id}`;
    if (op.fromToken === op.toToken) fail("no-op", `${where}: nothing to change`);
    const to = designToken(index, op.toToken, where);
    const fromToken = tokens.get(op.fromToken);
    const fromKind = fromToken?.kind ?? "unknown";
    if (!kindsCompatible(to.kind, fromKind)) {
      fail("type-mismatch", `${where}: ${op.toToken} (${to.kind}) cannot replace ${op.fromToken} (${fromKind})`);
    }
    const before = normalizeValue(op.before.value);
    let expectedAfter;
    try {
      expectedAfter = replaceVarName(before, 0, op.fromToken, op.toToken);
    } catch {
      fail("schema-invalid", `${where}: before.value does not reference ${op.fromToken}`);
    }
    if (normalizeValue(op.after.value) !== expectedAfter) {
      fail("after-value-mismatch", `${where}: after.value should be ${expectedAfter}`);
    }

    if (op.type === "rebind-token") {
      if (!index.tokenIndex.tokenEditing.ok) fail("read-only", `${where}: token files cannot be edited`, { problems: index.tokenIndex.tokenEditing.problems });
      const token = tokens.get(op.token);
      if (!token || token.source !== "tier") fail("not-a-design-token", `${where}: ${op.token} is not a design token`);
      if (token.tier !== "comp" || !token.writable) fail("tier-not-writable", `${where}: only comp tokens can be re-bound`);
      if (token.duplicate) fail("duplicate-token-declaration", `${where}: ${op.token} is declared more than once`);
      if (token.shape !== "single-var" || !token.alias || !token.inRoot) fail("unsupported-value-shape", `${where}: ${op.token} is not a single var() alias`);
      if (to.tier !== "sys") fail("tier-rule", `${where}: a comp token must point to a sys token`);
      if (token.alias !== op.fromToken || token.declaredValue !== before) {
        fail("stale-before", `${where}: ${op.token} is now ${token.declaredValue}`, { actual: token.declaredValue });
      }
      const key = `token:${op.token}`;
      if (targets.has(key)) fail("duplicate-target", `${where}: ${op.token} is targeted twice`);
      targets.add(key);
      const tier = config.tokens.tiers.find((t) => t.tier === "comp");
      const entry = sourceFor(tier.source, "token-source");
      const decls = findTokenDecl(entry.root, op.token);
      if (decls.length !== 1) fail("locator-mismatch", `${where}: ${op.token} is not declared exactly once in the source file`);
      entry.edits.push({ decl: decls[0], refIndex: 0, fromName: op.fromToken, toName: to.name, opId: op.id });
      results.push({ id: op.id, type: op.type, file: tier.source, mirror: tier.mirror, line: decls[0].source.start.line, before, after: expectedAfter, token: op.token });
      continue;
    }

    const file = index.cssIndex.files.find((f) => f.file === op.file);
    if (!file) fail("locator-mismatch", `${where}: ${op.file} is not an indexed component stylesheet`);
    const absPath = file.devId;
    const rule = file.rules[op.rule.ordinal];
    if (
      !rule ||
      rule.selector !== op.rule.selector ||
      JSON.stringify(rule.atRules) !== JSON.stringify(op.rule.atRules) ||
      rule.occurrence !== op.rule.occurrence
    ) {
      fail("locator-mismatch", `${where}: rule #${op.rule.ordinal} is not ${op.rule.selector}`, { actual: rule?.selector ?? null });
    }
    const matching = rule.declarations.filter((d) => d.property === op.declaration.property);
    const decl = matching[matching.length - 1];
    if (!decl) fail("locator-mismatch", `${where}: ${op.declaration.property} is not declared in ${rule.selector}`);
    if (decl.duplicateInRule || decl.overriddenInRule) fail("unsupported-value-shape", `${where}: the declaration is overridden inside its rule`);
    if (decl.important) fail("unsupported-value-shape", `${where}: !important declarations are not supported`);
    if (decl.shape !== "single-var" || decl.refs.length !== 1) fail("unsupported-value-shape", `${where}: the value is not a single var()`);
    if (decl.value !== before || decl.refs[0].name !== op.fromToken) {
      fail("stale-before", `${where}: the declaration is now ${decl.value}`, { actual: decl.value });
    }
    if (to.tier === "comp" && !to.name.startsWith(`--${prefix}-comp-${file.componentId}-`)) {
      fail("foreign-comp-token", `${where}: ${to.name} belongs to another component`);
    }
    if (to.tier === "ref") fail("tier-rule", `${where}: component CSS must not reference ref tokens`);
    const key = `decl:${file.file}#${rule.ordinal}#${decl.index}`;
    if (targets.has(key)) fail("duplicate-target", `${where}: the declaration is targeted twice`);
    targets.add(key);
    const entry = sourceFor(absPath, "component-css");
    let ruleNode = null;
    let ordinal = 0;
    walkStyleRules(entry.root, (node) => {
      if (ordinal === op.rule.ordinal) ruleNode = node;
      ordinal += 1;
    });
    const declNode = (ruleNode?.nodes ?? []).filter((n) => n.type === "decl")[decl.index];
    if (!declNode || declNode.prop !== op.declaration.property) fail("locator-mismatch", `${where}: the declaration moved`);
    entry.edits.push({ decl: declNode, refIndex: 0, fromName: op.fromToken, toName: to.name, opId: op.id });
    results.push({ id: op.id, type: op.type, file: absPath, mirror: null, line: declNode.source.start.line, before, after: expectedAfter, cssFile: file.file });
  }
  return { files, results };
}
