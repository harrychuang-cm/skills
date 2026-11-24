// Token index built only from configured sources: the tier files (source of
// truth) and read-only sources such as a Storybook chrome stylesheet.
import fs from "node:fs";
import path from "node:path";

import { classifyValue, normalizeValue } from "../shared/value-refs.mjs";
import { readCssSource } from "./css-source.mjs";
import { relativePosix } from "./paths.mjs";
import { inferKind, tokenCategory } from "./type-infer.mjs";

function importTargets(root, fromFile) {
  const out = [];
  root.walkAtRules("import", (rule) => {
    const match = /^\s*(?:url\(\s*)?["']?([^"')\s]+)["']?\s*\)?/.exec(rule.params);
    if (match) out.push(path.resolve(path.dirname(fromFile), match[1]));
  });
  return out;
}

function atRuleChain(node) {
  const chain = [];
  for (let parent = node.parent; parent && parent.type !== "root"; parent = parent.parent) {
    if (parent.type === "atrule") chain.unshift({ name: parent.name.toLowerCase(), params: normalizeValue(parent.params) });
  }
  return chain;
}

function tierOfName(name, prefix) {
  const match = new RegExp(`^--${prefix}-(ref|sys|comp)-`).exec(name);
  return match ? match[1] : null;
}

function countDiffLines(a, b) {
  const left = a.toString("utf8").split("\n");
  const right = b.toString("utf8").split("\n");
  let count = Math.abs(left.length - right.length);
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) if (left[i] !== right[i]) count += 1;
  return count;
}

export function buildTokenIndex({ config, postcss }) {
  const prefix = config.tokens.prefix;
  const relW = (abs) => relativePosix(config.workspaceRoot, abs);
  const problems = [];
  const diagnostics = [];
  const tokens = new Map();
  const files = [];
  const { entry, tiers } = config.tokens;

  // Entry: @import order decides which :root block of the served sheet is which tier.
  const blocks = [];
  const entrySource = readCssSource(entry.source);
  files.push({ id: "tokens:entry", role: "entry", source: relW(entry.source), mirror: entry.mirror ? relW(entry.mirror) : null, diskHash: entrySource.diskHash });
  if (!entrySource.ok) {
    problems.push(`${relW(entry.source)}: ${entrySource.reason}`);
  } else {
    const entryRoot = postcss.parse(entrySource.text);
    const imports = importTargets(entryRoot, entry.source);
    const extra = entryRoot.nodes.filter((n) => n.type !== "comment" && !(n.type === "atrule" && n.name === "import"));
    if (extra.length > 0) problems.push(`${relW(entry.source)} contains rules besides @import`);
    imports.forEach((target, index) => {
      const tier = tiers.find((t) => t.source === target);
      if (!tier) problems.push(`${relW(entry.source)} imports an unconfigured file ${relW(target)}`);
      else blocks.push({ tier: tier.tier, rootRuleIndex: index });
    });
    for (const tier of tiers) {
      if (!imports.includes(tier.source)) problems.push(`${relW(entry.source)} does not import ${relW(tier.source)}`);
    }
  }

  // Tier files: exactly one top-level :root each; each token declared once.
  for (const tier of tiers) {
    const source = readCssSource(tier.source);
    const fileId = `tokens:${tier.tier}`;
    const info = {
      id: fileId,
      role: "tier",
      tier: tier.tier,
      source: relW(tier.source),
      mirror: tier.mirror ? relW(tier.mirror) : null,
      writable: tier.writable,
      diskHash: source.diskHash,
      singleRoot: false,
      tokenCount: 0,
    };
    files.push(info);
    if (!source.ok) {
      problems.push(`${info.source}: ${source.reason}`);
      continue;
    }
    const root = postcss.parse(source.text);
    const topRules = root.nodes.filter((n) => n.type === "rule");
    const topAtRules = root.nodes.filter((n) => n.type === "atrule");
    info.singleRoot = topRules.length === 1 && topRules[0].selector.trim() === ":root" && topAtRules.length === 0;
    if (!info.singleRoot) problems.push(`${info.source} must contain exactly one top-level :root rule`);
    root.walkDecls((decl) => {
      if (!decl.prop.startsWith("--")) return;
      const parent = decl.parent;
      const inRoot = parent.type === "rule" && parent.parent?.type === "root" && parent.selector.trim() === ":root";
      const rawValue = decl.raws.value?.raw ?? decl.value;
      const existing = tokens.get(decl.prop);
      if (existing) {
        existing.duplicate = true;
        diagnostics.push({ code: "duplicate-token-declaration", token: decl.prop, file: info.source, line: decl.source.start.line });
        return;
      }
      const shape = classifyValue(rawValue);
      info.tokenCount += 1;
      tokens.set(decl.prop, {
        name: decl.prop,
        tier: tier.tier,
        source: "tier",
        writable: tier.writable,
        fileId,
        file: info.source,
        line: decl.source.start.line,
        rawValue,
        declaredValue: normalizeValue(rawValue),
        shape: shape.kind,
        alias: shape.kind === "single-var" ? shape.name : null,
        important: decl.important === true,
        inRoot,
        tierNameOk: tierOfName(decl.prop, prefix) === tier.tier,
        duplicate: false,
        shadowedBy: [],
        variants: [],
        usedBy: [],
        aliasedBy: [],
      });
    });
  }

  // Read-only sources: may extend the chain and shadow tier tokens, never written.
  for (const abs of config.tokens.readonlySources) {
    const source = readCssSource(abs);
    files.push({ id: `readonly:${relW(abs)}`, role: "readonly", source: relW(abs), mirror: null, diskHash: source.diskHash });
    if (!source.ok) {
      diagnostics.push({ code: "readonly-source-unreadable", file: relW(abs), reason: source.reason });
      continue;
    }
    const root = postcss.parse(source.text);
    root.walkDecls((decl) => {
      if (!decl.prop.startsWith(`--${prefix}-`)) return;
      const parent = decl.parent;
      const selector = parent.type === "rule" ? normalizeValue(parent.selector) : null;
      const atRules = atRuleChain(decl);
      const rawValue = decl.raws.value?.raw ?? decl.value;
      const where = { file: relW(abs), line: decl.source.start.line, selector, atRules, declaredValue: normalizeValue(rawValue) };
      const isRoot = selector === ":root" && atRules.length === 0;
      const existing = tokens.get(decl.prop);
      if (existing?.source === "tier") {
        existing.shadowedBy.push(where);
        return;
      }
      if (existing) {
        if (isRoot && existing.rootless) {
          Object.assign(existing, { rootless: false, file: where.file, line: where.line, rawValue, declaredValue: where.declaredValue });
          const shape = classifyValue(rawValue);
          existing.shape = shape.kind;
          existing.alias = shape.kind === "single-var" ? shape.name : null;
        } else if (isRoot) existing.duplicate = true;
        else existing.variants.push(where);
        return;
      }
      const shape = classifyValue(rawValue);
      tokens.set(decl.prop, {
        name: decl.prop,
        tier: tierOfName(decl.prop, prefix),
        source: "readonly",
        writable: false,
        fileId: `readonly:${relW(abs)}`,
        file: where.file,
        line: where.line,
        rawValue: isRoot ? rawValue : null,
        declaredValue: isRoot ? where.declaredValue : null,
        shape: isRoot ? shape.kind : "raw",
        alias: isRoot && shape.kind === "single-var" ? shape.name : null,
        important: decl.important === true,
        inRoot: isRoot,
        rootless: !isRoot,
        tierNameOk: true,
        duplicate: false,
        shadowedBy: [],
        variants: isRoot ? [] : [where],
        usedBy: [],
        aliasedBy: [],
      });
    });
  }

  // Alias chains, resolved values and kinds.
  for (const token of tokens.values()) {
    const chain = [];
    const seen = new Set([token.name]);
    let current = token;
    let resolution = "ok";
    while (current?.alias) {
      chain.push(current.alias);
      if (seen.has(current.alias)) {
        resolution = "cycle";
        break;
      }
      seen.add(current.alias);
      const next = tokens.get(current.alias);
      if (!next || next.rootless) {
        resolution = "undefined";
        current = null;
        break;
      }
      current = next;
    }
    token.chain = chain;
    token.resolution = resolution;
    token.resolvedValue = resolution === "ok" && current ? current.declaredValue : null;
    token.kind = inferKind(token.resolvedValue);
    token.category = tokenCategory(token.name, prefix);
  }
  for (const token of tokens.values()) {
    if (token.alias && tokens.has(token.alias)) tokens.get(token.alias).aliasedBy.push(token.name);
  }

  // Source of truth versus mirror, for every configured pair.
  const mirrors = [];
  for (const pair of [{ id: "tokens:entry", ...entry }, ...tiers.map((t) => ({ id: `tokens:${t.tier}`, source: t.source, mirror: t.mirror }))]) {
    if (!pair.mirror) continue;
    const a = fs.readFileSync(pair.source);
    const b = fs.existsSync(pair.mirror) ? fs.readFileSync(pair.mirror) : null;
    mirrors.push({
      id: pair.id,
      source: relW(pair.source),
      mirror: relW(pair.mirror),
      inSync: b !== null && a.equals(b),
      diffLines: b === null ? null : countDiffLines(a, b),
    });
  }

  const loadedEntry = entry.mirror ?? entry.source;
  return {
    tokens,
    files,
    mirrors,
    entry: {
      source: relW(entry.source),
      mirror: entry.mirror ? relW(entry.mirror) : null,
      devId: fs.existsSync(loadedEntry) ? fs.realpathSync(loadedEntry) : null,
      blocks,
    },
    tokenEditing: { ok: problems.length === 0, problems },
    diagnostics,
  };
}
