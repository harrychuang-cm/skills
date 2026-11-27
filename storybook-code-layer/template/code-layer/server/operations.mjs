// Operation schema, semantic validation, and resolution to byte edits.
// Every decision uses an index built fresh from disk inside the transaction.
import { ApiError, ID_PATTERN, INTERNAL_OPERATION_TYPES, OPERATION_TYPES, TOKEN_NAME_PATTERN } from "../shared/api-contract.mjs";
import { isRebindTarget } from "../shared/candidates.mjs";
import { inferKind, kindsCompatible } from "../shared/kinds.mjs";
import { KEYWORD_PATTERN, isFlexDisplay, isLayoutKeyword, isLayoutProperty, settersOf } from "../shared/layout.mjs";
import { LITERAL_KINDS, restoreComponent, tokenizeComponent } from "../shared/literals.mjs";
import { kindsOfSlot } from "../shared/property-table.mjs";
import { SUPPORTED_FLOWS, sidesOf } from "../shared/sides.mjs";
import { normalizeValue, replaceComponent, replaceVarName, splitTopLevel } from "../shared/value-refs.mjs";
import { walkStyleRules } from "./css-index.mjs";
import { readCssSource } from "./css-source.mjs";
import { planInsertion } from "./patcher.mjs";

/** A value has far fewer var() references than this; the bound keeps a hostile index out of the scanner. */
const MAX_REF_INDEX = 63;

const LAYOUT_TYPES = ["set-keyword", "add-declaration", "remove-declaration"];
/** A literal component replaced by a token, and (server only) the literal put back. */
const LITERAL_TYPES = ["tokenize-literal", "restore-literal"];
const PROPERTY_PATTERN = /^-{0,2}[a-z][a-z0-9-]*$/;

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

function validateRule(op, where, limits) {
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
  string(op.declaration.property, `${where}.declaration.property`, limits, PROPERTY_PATTERN);
}

function validateReason(op, where, limits) {
  if (op.reason === undefined) return;
  exactKeys(op.reason, [], ["storyId", "element", "cssProperty"], `${where}.reason`);
  for (const key of Object.keys(op.reason)) string(op.reason[key], `${where}.reason.${key}`, limits);
}

/** The layout operations: a keyword replaced, a declaration added, and (server only) a declaration removed again. */
function validateLayoutOperation(op, where, limits) {
  if (op.type === "set-keyword") {
    exactKeys(op, ["id", "type", "file", "rule", "declaration", "component", "fromKeyword", "toKeyword", "before", "after"], ["reason"], where);
    integer(op.component, `${where}.component`);
    if (op.component > MAX_REF_INDEX) fail("schema-invalid", `${where}.component is too large`);
    string(op.fromKeyword, `${where}.fromKeyword`, limits, KEYWORD_PATTERN);
    string(op.toKeyword, `${where}.toKeyword`, limits);
    exactKeys(op.before, ["value"], ["fileHash"], `${where}.before`);
    string(op.before.value, `${where}.before.value`, limits);
    exactKeys(op.after, ["value"], [], `${where}.after`);
    string(op.after.value, `${where}.after.value`, limits);
  } else if (op.type === "add-declaration") {
    exactKeys(op, ["id", "type", "file", "rule", "declaration", "toKeyword", "after"], ["reason"], where);
    string(op.toKeyword, `${where}.toKeyword`, limits);
    exactKeys(op.after, ["value"], [], `${where}.after`);
    string(op.after.value, `${where}.after.value`, limits);
  } else {
    exactKeys(op, ["id", "type", "file", "rule", "declaration", "fromKeyword", "inserted"], [], where);
    string(op.fromKeyword, `${where}.fromKeyword`, limits, KEYWORD_PATTERN);
    string(op.inserted, `${where}.inserted`, limits);
  }
  validateRule(op, where, limits);
  validateReason(op, where, limits);
}

/** The literal operations: a literal component replaced by a token, and (server only) the literal put back. */
function validateLiteralOperation(op, where, limits) {
  if (op.type === "tokenize-literal") {
    exactKeys(op, ["id", "type", "file", "rule", "declaration", "component", "literal", "toToken", "before", "after"], ["reason"], where);
    string(op.toToken, `${where}.toToken`, limits, TOKEN_NAME_PATTERN);
  } else {
    exactKeys(op, ["id", "type", "file", "rule", "declaration", "component", "fromToken", "literal", "before", "after"], [], where);
    string(op.fromToken, `${where}.fromToken`, limits, TOKEN_NAME_PATTERN);
  }
  integer(op.component, `${where}.component`);
  if (op.component > MAX_REF_INDEX) fail("schema-invalid", `${where}.component is too large`);
  string(op.literal, `${where}.literal`, limits);
  exactKeys(op.before, ["value"], ["fileHash"], `${where}.before`);
  string(op.before.value, `${where}.before.value`, limits);
  exactKeys(op.after, ["value"], [], `${where}.after`);
  string(op.after.value, `${where}.after.value`, limits);
  validateRule(op, where, limits);
  validateReason(op, where, limits);
}

/**
 * Exact-key validation of an apply / validate body. `internal` is set only
 * for a batch the server built itself (a reverse apply): it may carry the
 * operation that removes a declaration.
 */
export function validateBatch(body, limits, { internal = false } = {}) {
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
    if (!OPERATION_TYPES.includes(op.type) && !(internal && INTERNAL_OPERATION_TYPES.includes(op.type))) fail("schema-invalid", `${where}.type is unknown`);
    if (LAYOUT_TYPES.includes(op.type)) {
      string(op.id, `${where}.id`, limits, ID_PATTERN);
      if (ids.has(op.id)) fail("schema-invalid", `${where}.id is duplicated`);
      ids.add(op.id);
      validateLayoutOperation(op, where, limits);
      return;
    }
    if (LITERAL_TYPES.includes(op.type)) {
      string(op.id, `${where}.id`, limits, ID_PATTERN);
      if (ids.has(op.id)) fail("schema-invalid", `${where}.id is duplicated`);
      ids.add(op.id);
      validateLiteralOperation(op, where, limits);
      return;
    }
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
      integer(op.replacements[0].refIndex, `${where}.replacements[0].refIndex`);
      if (op.replacements[0].refIndex > MAX_REF_INDEX) fail("schema-invalid", `${where}.replacements[0].refIndex is too large`);
      if (op.replacements[0].fromToken !== op.fromToken || op.replacements[0].toToken !== op.toToken) {
        fail("schema-invalid", `${where}.replacements must match fromToken/toToken`);
      }
    }
  });
  return body;
}

/** The tier a token of each writable tier may alias. */
const TARGET_TIER = { comp: "sys", sys: "ref" };

function designToken(index, name, where) {
  const token = index.tokenIndex.tokens.get(name);
  if (!token || token.source !== "tier" || token.rootless) fail("not-a-design-token", `${where}: ${name} is not a design token`, { token: name });
  if (token.duplicate) fail("duplicate-token-declaration", `${where}: ${name} is declared more than once`, { token: name });
  if (token.resolution !== "ok") fail("not-a-design-token", `${where}: ${name} does not resolve`, { token: name });
  if (!isRebindTarget(token)) fail("not-a-design-token", `${where}: ${name} cannot be a re-bind target`, { token: name });
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
export function resolveOperations(batch, { config, postcss, index, internal = false }) {
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

  /** The indexed rule and its PostCSS node for a declaration operation. */
  const locateRule = (op, where) => {
    const file = index.cssIndex.files.find((f) => f.file === op.file);
    if (!file) fail("locator-mismatch", `${where}: ${op.file} is not an indexed component stylesheet`);
    const rule = file.rules[op.rule.ordinal];
    if (
      !rule ||
      rule.selector !== op.rule.selector ||
      JSON.stringify(rule.atRules) !== JSON.stringify(op.rule.atRules) ||
      rule.occurrence !== op.rule.occurrence
    ) {
      fail("locator-mismatch", `${where}: rule #${op.rule.ordinal} is not ${op.rule.selector}`, { actual: rule?.selector ?? null });
    }
    const entry = sourceFor(file.devId, "component-css");
    let ruleNode = null;
    let ordinal = 0;
    walkStyleRules(entry.root, (node) => {
      if (ordinal === op.rule.ordinal) ruleNode = node;
      ordinal += 1;
    });
    if (!ruleNode) fail("locator-mismatch", `${where}: the rule moved`);
    return { file, rule, entry, ruleNode, locator: { ordinal: rule.ordinal, selector: rule.selector, atRules: rule.atRules, occurrence: rule.occurrence } };
  };

  /** The components of a declaration as sidesOf reads them: a reference carries the kind of the token it names, as in the preview. */
  const sideComponents = (decl) =>
    decl.components.map((c) => {
      if (c.refIndex === null || c.refIndex === undefined) return { text: c.text };
      const ref = decl.refs.find((r) => r.refIndex === c.refIndex);
      return { text: c.text, kind: ref && c.shape === "single-var" ? index.tokenIndex.tokens.get(ref.name)?.kind ?? "unknown" : "unknown" };
    });

  /** Every slot a component of a declaration sets under the supported writing modes; null when that cannot be told. */
  const slotSetOf = (decl, component) => {
    const parts = sideComponents(decl);
    const slots = new Set();
    for (const { writingMode, direction } of SUPPORTED_FLOWS) {
      const result = sidesOf(decl.property, parts, writingMode, direction);
      if (!result.ok) return null;
      for (const entry of result.slots) if (entry.component === component) slots.add(entry.slot);
    }
    return slots;
  };

  /** Which layout slot a component of a declaration sets, the same under every writing mode; null when it sets none or several. */
  const layoutSlotOf = (decl, component) => {
    const slots = slotSetOf(decl, component);
    return slots && slots.size === 1 ? [...slots][0] : null;
  };

  const resolveLayout = (op, where) => {
    const property = op.declaration.property;
    const { file, rule, entry, ruleNode, locator } = locateRule(op, where);
    const base = { id: op.id, type: op.type, file: file.devId, mirror: null, cssFile: file.file, rule: locator, property };

    if (op.type === "set-keyword") {
      const matching = rule.declarations.filter((d) => d.property === property);
      const decl = matching[matching.length - 1];
      if (!decl) fail("locator-mismatch", `${where}: ${property} is not declared in ${rule.selector}`);
      if (decl.duplicateInRule) fail("unsupported-value-shape", `${where}: ${property} is declared more than once in its rule`);
      if (decl.important) fail("unsupported-value-shape", `${where}: !important declarations are not supported`);
      const component = decl.components[op.component];
      const slot = component ? layoutSlotOf(decl, op.component) : null;
      if (!slot || !isLayoutProperty(slot)) fail("unsupported-value-shape", `${where}: ${property} is not a layout property that can be set by keyword`);
      if (component.shape !== "keyword" || !KEYWORD_PATTERN.test(component.text)) {
        fail("unsupported-value-shape", `${where}: component ${op.component} of ${property} is not a single keyword`, { shape: component.shape });
      }
      if (component.overridden || decl.overriddenInRule) fail("unsupported-value-shape", `${where}: the declaration is overridden inside its rule`);
      const before = normalizeValue(op.before.value);
      if (decl.value !== before || component.text !== op.fromKeyword) fail("stale-before", `${where}: the declaration is now ${decl.value}`, { actual: decl.value });
      if (op.fromKeyword === op.toKeyword) fail("no-op", `${where}: nothing to change`);
      // A reverse apply may put back a keyword that is not offered (the file held it before); a request may not.
      if (internal ? !KEYWORD_PATTERN.test(op.toKeyword) : !isLayoutKeyword(slot, op.toKeyword)) {
        fail("keyword-not-allowed", `${where}: ${op.toKeyword} is not a keyword ${slot} can be set to`, { property: slot });
      }
      const expectedAfter = replaceComponent(before, op.component, op.fromKeyword, op.toKeyword);
      if (normalizeValue(op.after.value) !== expectedAfter) fail("after-value-mismatch", `${where}: after.value should be ${expectedAfter}`);
      const key = `component:${file.file}#${rule.ordinal}#${decl.index}#${op.component}`;
      if (targets.has(key)) fail("duplicate-target", `${where}: the component is targeted twice`);
      targets.add(key);
      const declNode = (ruleNode.nodes ?? []).filter((n) => n.type === "decl")[decl.index];
      if (!declNode || declNode.prop !== property) fail("locator-mismatch", `${where}: the declaration moved`);
      entry.edits.push({ kind: "component", decl: declNode, component: op.component, fromText: op.fromKeyword, toText: op.toKeyword, opId: op.id });
      results.push({ ...base, line: declNode.source.start.line, before, after: expectedAfter, slot, component: op.component, fromKeyword: op.fromKeyword, toKeyword: op.toKeyword });
      return;
    }

    if (!isLayoutProperty(property)) fail("unsupported-value-shape", `${where}: ${property} is not a layout property`);
    const declared = rule.declarations.filter((d) => d.property === property);

    if (op.type === "remove-declaration") {
      // The inverse of an add: the declaration must still be exactly what was written.
      const decl = declared.length === 1 ? declared[0] : null;
      if (!decl || decl.value !== op.fromKeyword || decl.important) {
        fail("stale-before", `${where}: ${property} of ${rule.selector} no longer holds what the apply added`, { actual: decl?.value ?? null });
      }
      const declNode = (ruleNode.nodes ?? []).filter((n) => n.type === "decl")[decl.index];
      if (!declNode || declNode.prop !== property) fail("locator-mismatch", `${where}: the declaration moved`);
      const key = `add:${file.file}#${rule.ordinal}#${property}`;
      if (targets.has(key)) fail("duplicate-target", `${where}: the declaration is targeted twice`);
      targets.add(key);
      entry.edits.push({ kind: "remove", decl: declNode, inserted: op.inserted, opId: op.id });
      results.push({ ...base, line: declNode.source.start.line, before: op.fromKeyword, after: null, slot: property, fromKeyword: op.fromKeyword, toKeyword: null });
      return;
    }

    if (!isLayoutKeyword(property, op.toKeyword)) fail("keyword-not-allowed", `${where}: ${op.toKeyword} is not a keyword ${property} can be set to`, { property });
    if (normalizeValue(op.after.value) !== op.toKeyword) fail("after-value-mismatch", `${where}: after.value should be ${op.toKeyword}`);
    // Only into the rule that makes the element a flex container, and only when nothing there sets the property yet.
    const display = rule.declarations.filter((d) => d.property === "display").at(-1);
    if (!display || display.important || !isFlexDisplay(display.value)) {
      fail("rule-not-eligible", `${where}: ${rule.selector} does not declare a flex display`, { reason: "not-flex", display: display?.value ?? null });
    }
    const setter = rule.declarations.find((d) => settersOf(property).includes(d.property));
    if (setter) fail("rule-not-eligible", `${where}: ${rule.selector} already sets ${property} (${setter.property})`, { reason: "already-declared", declaration: setter.property });
    if (!rule.append?.ok) fail("rule-not-eligible", `${where}: a declaration cannot be added to ${rule.selector} safely`, { reason: rule.append?.reason ?? "unknown" });
    const key = `add:${file.file}#${rule.ordinal}#${property}`;
    if (targets.has(key)) fail("duplicate-target", `${where}: ${property} is added twice`);
    targets.add(key);
    let plan;
    try {
      plan = planInsertion(entry.source.text, ruleNode, property, op.toKeyword);
    } catch (error) {
      fail("rule-not-eligible", `${where}: ${error.message}`, { reason: "format" });
    }
    entry.edits.push({ kind: "insert", rule: ruleNode, property, value: op.toKeyword, opId: op.id });
    // The line the new declaration lands on: the one after the rule's last node.
    const line = entry.source.text.slice(0, plan.at).split("\n").length + (plan.text.includes("\n") ? 1 : 0);
    results.push({ ...base, line, before: null, after: op.toKeyword, slot: property, fromKeyword: null, toKeyword: op.toKeyword, inserted: plan.text });
  };

  /** Every slot a component of a declaration sets under any supported writing mode; null when that cannot be told. */
  const slotsOfComponent = (decl, component) => {
    const slots = slotSetOf(decl, component);
    return slots && slots.size > 0 ? [...slots] : null;
  };

  /** A literal written back by a reverse apply must still be one plain component: no reference, no structure. */
  const singleLiteral = (text) => {
    const parts = splitTopLevel(text);
    return parts.length === 1 && !parts[0].separator && parts[0].text === text && !/var\(|[;{}!]|\/\*/i.test(text);
  };

  const resolveLiteral = (op, where) => {
    const property = op.declaration.property;
    const { file, rule, entry, ruleNode, locator } = locateRule(op, where);
    const base = { id: op.id, type: op.type, file: file.devId, mirror: null, cssFile: file.file, rule: locator, property };
    const matching = rule.declarations.filter((d) => d.property === property);
    const decl = matching[matching.length - 1];
    if (!decl) fail("locator-mismatch", `${where}: ${property} is not declared in ${rule.selector}`);
    if (decl.duplicateInRule) fail("unsupported-value-shape", `${where}: ${property} is declared more than once in its rule`);
    if (decl.important) fail("unsupported-value-shape", `${where}: !important declarations are not supported`);
    // A value that is one reference (after a tokenization of a lone literal) is a shape a restore can work on.
    if (!["raw", "var-list", "single-var"].includes(decl.shape) || decl.components.some((c) => c.shape === "separator")) {
      fail("unsupported-value-shape", `${where}: ${property} has a value with a top-level comma, slash or expression`, { shape: decl.shape });
    }
    const component = decl.components[op.component];
    if (!component) fail("unsupported-value-shape", `${where}: ${property} has no component ${op.component}`);
    if (component.overridden || decl.overriddenInRule) fail("unsupported-value-shape", `${where}: the declaration is overridden inside its rule`);
    const before = normalizeValue(op.before.value);
    const declNode = (ruleNode.nodes ?? []).filter((n) => n.type === "decl")[decl.index];
    if (!declNode || declNode.prop !== property) fail("locator-mismatch", `${where}: the declaration moved`);
    const key = `component:${file.file}#${rule.ordinal}#${decl.index}#${op.component}`;

    if (op.type === "restore-literal") {
      // The inverse of a tokenization: the component must still be exactly the reference it wrote.
      if (component.shape !== "single-var" || component.text !== `var(${op.fromToken})` || decl.value !== before) {
        fail("stale-before", `${where}: component ${op.component} of ${property} no longer holds var(${op.fromToken})`, { actual: decl.value });
      }
      if (!singleLiteral(op.literal)) fail("unsupported-value-shape", `${where}: the recorded literal is not a single plain component`);
      const expectedAfter = restoreComponent(before, op.component, op.fromToken, op.literal);
      if (normalizeValue(op.after.value) !== expectedAfter) fail("after-value-mismatch", `${where}: after.value should be ${expectedAfter}`);
      if (targets.has(key)) fail("duplicate-target", `${where}: the component is targeted twice`);
      targets.add(key);
      entry.edits.push({ kind: "restore", decl: declNode, component: op.component, fromText: `var(${op.fromToken})`, toText: op.literal, opId: op.id });
      results.push({ ...base, line: declNode.source.start.line, before, after: expectedAfter, component: op.component, literal: op.literal, fromToken: op.fromToken, toToken: null });
      return;
    }

    if (component.shape !== "raw") fail("unsupported-value-shape", `${where}: component ${op.component} of ${property} holds a reference`, { shape: component.shape });
    const literalKind = inferKind(component.text);
    if (literalKind === "keyword" || !LITERAL_KINDS.has(literalKind)) {
      fail("unsupported-value-shape", `${where}: component ${op.component} of ${property} is not a literal that can take a token (${literalKind})`, { kind: literalKind });
    }
    if (decl.value !== before || component.text !== op.literal) fail("stale-before", `${where}: the declaration is now ${decl.value}`, { actual: decl.value });
    const to = designToken(index, op.toToken, where);
    if (to.tier === "ref") fail("tier-rule", `${where}: component CSS must not reference ref tokens`);
    if (to.tier === "comp" && !to.name.startsWith(`--${prefix}-comp-${file.componentId}-`)) fail("foreign-comp-token", `${where}: ${to.name} belongs to another component`);
    // A literal has no old token to compare kinds with: every side or sub-property it sets must accept the token's kind.
    const slots = slotsOfComponent(decl, op.component);
    if (!slots) fail("unsupported-value-shape", `${where}: which sides component ${op.component} of ${property} sets cannot be told`);
    for (const slot of slots) {
      const kinds = kindsOfSlot(slot);
      if (kinds === null) fail("unsupported-value-shape", `${where}: ${slot} is not a property of the inspector's table`, { slot });
      if (!kinds.includes(to.kind)) fail("type-mismatch", `${where}: ${to.name} (${to.kind}) cannot set ${slot}`, { slot, kind: to.kind, accepted: kinds });
    }
    const expectedAfter = tokenizeComponent(before, op.component, op.literal, to.name);
    if (normalizeValue(op.after.value) !== expectedAfter) fail("after-value-mismatch", `${where}: after.value should be ${expectedAfter}`);
    if (targets.has(key)) fail("duplicate-target", `${where}: the component is targeted twice`);
    targets.add(key);
    entry.edits.push({ kind: "tokenize", decl: declNode, component: op.component, fromText: op.literal, toText: `var(${to.name})`, opId: op.id });
    results.push({ ...base, line: declNode.source.start.line, before, after: expectedAfter, component: op.component, literal: op.literal, fromToken: null, toToken: to.name, slots });
  };

  for (const op of batch.operations) {
    const where = `operation ${op.id}`;
    if (LAYOUT_TYPES.includes(op.type)) {
      resolveLayout(op, where);
      continue;
    }
    if (LITERAL_TYPES.includes(op.type)) {
      resolveLiteral(op, where);
      continue;
    }
    if (op.fromToken === op.toToken) fail("no-op", `${where}: nothing to change`);
    const to = designToken(index, op.toToken, where);
    const fromToken = tokens.get(op.fromToken);
    const fromKind = fromToken?.kind ?? "unknown";
    if (!kindsCompatible(to.kind, fromKind)) {
      fail("type-mismatch", `${where}: ${op.toToken} (${to.kind}) cannot replace ${op.fromToken} (${fromKind})`);
    }
    const refIndex = op.type === "rebind-declaration" ? op.replacements[0].refIndex : 0;
    const before = normalizeValue(op.before.value);
    let expectedAfter;
    try {
      expectedAfter = replaceVarName(before, refIndex, op.fromToken, op.toToken);
    } catch {
      fail("schema-invalid", `${where}: reference ${refIndex} of before.value is not ${op.fromToken}`);
    }
    if (normalizeValue(op.after.value) !== expectedAfter) {
      fail("after-value-mismatch", `${where}: after.value should be ${expectedAfter}`);
    }

    if (op.type === "rebind-token") {
      if (!index.tokenIndex.tokenEditing.ok) fail("read-only", `${where}: token files cannot be edited`, { problems: index.tokenIndex.tokenEditing.problems });
      const token = tokens.get(op.token);
      if (!token || token.source !== "tier") fail("not-a-design-token", `${where}: ${op.token} is not a design token`);
      // comp aliases sys; sys aliases ref when the binding opens the system tier. ref holds raw values.
      const targetTier = TARGET_TIER[token.tier];
      if (!targetTier || !token.writable) fail("tier-not-writable", `${where}: the ${token.tier} tier is not writable in this project`, { tier: token.tier });
      if (token.duplicate) fail("duplicate-token-declaration", `${where}: ${op.token} is declared more than once`);
      if (token.shape !== "single-var" || !token.alias || !token.inRoot) fail("unsupported-value-shape", `${where}: ${op.token} is not a single var() alias`);
      if (to.tier !== targetTier) fail("tier-rule", `${where}: a ${token.tier} token must point to a ${targetTier} token`, { tier: token.tier, targetTier });
      if (token.alias !== op.fromToken || token.declaredValue !== before) {
        fail("stale-before", `${where}: ${op.token} is now ${token.declaredValue}`, { actual: token.declaredValue });
      }
      const key = `token:${op.token}`;
      if (targets.has(key)) fail("duplicate-target", `${where}: ${op.token} is targeted twice`);
      targets.add(key);
      const tier = config.tokens.tiers.find((t) => t.tier === token.tier);
      const entry = sourceFor(tier.source, "token-source");
      const decls = findTokenDecl(entry.root, op.token);
      if (decls.length !== 1) fail("locator-mismatch", `${where}: ${op.token} is not declared exactly once in the source file`);
      entry.edits.push({ decl: decls[0], refIndex: 0, fromName: op.fromToken, toName: to.name, opId: op.id });
      results.push({
        id: op.id,
        type: op.type,
        file: tier.source,
        mirror: tier.mirror,
        line: decls[0].source.start.line,
        before,
        after: expectedAfter,
        token: op.token,
        tier: token.tier,
        fromToken: op.fromToken,
        toToken: to.name,
      });
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
    if (decl.duplicateInRule) fail("unsupported-value-shape", `${where}: ${op.declaration.property} is declared more than once in its rule`);
    if (decl.important) fail("unsupported-value-shape", `${where}: !important declarations are not supported`);
    // Only a reference that is a whole component of a single var() or of a var() list can be re-bound.
    const component = decl.shape === "single-var" || decl.shape === "var-list" ? decl.components.find((c) => c.refIndex === refIndex && c.shape === "single-var") : null;
    const ref = decl.refs.find((r) => r.refIndex === refIndex);
    if (!component || !ref) fail("unsupported-value-shape", `${where}: reference ${refIndex} of ${op.declaration.property} cannot be re-bound (${decl.shape})`, { shape: decl.shape });
    if (component.overridden || decl.overriddenInRule) fail("unsupported-value-shape", `${where}: the declaration is overridden inside its rule`);
    if (decl.value !== before || ref.name !== op.fromToken) {
      fail("stale-before", `${where}: the declaration is now ${decl.value}`, { actual: decl.value });
    }
    if (to.tier === "comp" && !to.name.startsWith(`--${prefix}-comp-${file.componentId}-`)) {
      fail("foreign-comp-token", `${where}: ${to.name} belongs to another component`);
    }
    if (to.tier === "ref") fail("tier-rule", `${where}: component CSS must not reference ref tokens`);
    const key = `decl:${file.file}#${rule.ordinal}#${decl.index}#${refIndex}`;
    if (targets.has(key)) fail("duplicate-target", `${where}: the reference is targeted twice`);
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
    entry.edits.push({ decl: declNode, refIndex, fromName: op.fromToken, toName: to.name, opId: op.id });
    results.push({
      id: op.id,
      type: op.type,
      file: absPath,
      mirror: null,
      line: declNode.source.start.line,
      before,
      after: expectedAfter,
      cssFile: file.file,
      rule: { ordinal: rule.ordinal, selector: rule.selector, atRules: rule.atRules, occurrence: rule.occurrence },
      property: decl.property,
      refIndex,
      // The position of the reference among the top-level components: unlike refIndex, it does not move
      // when a tokenization in the same batch adds a reference earlier in the value.
      component: decl.components.indexOf(component),
      fromToken: op.fromToken,
      toToken: to.name,
    });
  }
  return { files, results };
}
