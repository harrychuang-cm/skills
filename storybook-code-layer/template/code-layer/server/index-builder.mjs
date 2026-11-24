// Combined index (tokens + component CSS), its revision, a cheap freshness
// fingerprint for caching, and the JSON shape served by GET /index.
import crypto from "node:crypto";
import fs from "node:fs";

import { buildCssIndex } from "./css-index.mjs";
import { listCssFiles } from "./paths.mjs";
import { buildTokenIndex } from "./token-index.mjs";

function trackedFiles(config) {
  const files = [config.tokens.entry.source, config.tokens.entry.mirror];
  for (const tier of config.tokens.tiers) files.push(tier.source, tier.mirror);
  files.push(...config.tokens.readonlySources);
  for (const root of config.components.roots) files.push(...listCssFiles(root));
  return files.filter(Boolean);
}

/** mtime + size of every tracked file, plus the CSS file list. */
export function indexFingerprint(config) {
  const parts = trackedFiles(config).map((file) => {
    try {
      const stat = fs.statSync(file);
      return `${file}:${stat.mtimeMs}:${stat.size}`;
    } catch {
      return `${file}:missing`;
    }
  });
  return parts.join("\n");
}

export function buildIndex({ config, postcss }) {
  const tokenIndex = buildTokenIndex({ config, postcss });
  const cssIndex = buildCssIndex({ config, postcss, tokens: tokenIndex.tokens });
  for (const file of cssIndex.files) {
    for (const rule of file.rules) {
      for (const decl of rule.declarations) {
        for (const ref of decl.refs) {
          const token = tokenIndex.tokens.get(ref.name);
          if (token) token.usedBy.push({ file: file.file, ordinal: rule.ordinal, selector: rule.selector, property: decl.property, line: decl.line });
        }
      }
    }
  }
  const hash = crypto.createHash("sha256");
  for (const file of tokenIndex.files) hash.update(`${file.id}:${file.diskHash}\n`);
  for (const mirror of tokenIndex.mirrors) hash.update(`${mirror.id}:${mirror.inSync}\n`);
  for (const file of cssIndex.files) hash.update(`${file.file}:${file.diskHash}\n`);
  return {
    revision: `sha256:${hash.digest("hex")}`,
    fingerprint: indexFingerprint(config),
    tokenIndex,
    cssIndex,
  };
}

/** Rebuilds only when a tracked file changed. */
export function createIndexCache({ config, postcss }) {
  let current = null;
  return {
    get() {
      const fingerprint = indexFingerprint(config);
      if (!current || current.fingerprint !== fingerprint) current = buildIndex({ config, postcss });
      return current;
    },
    invalidate() {
      current = null;
    },
  };
}

export function serializeIndex(index, config) {
  const { tokenIndex, cssIndex } = index;
  return {
    schemaVersion: 1,
    projectId: config.projectId,
    revision: index.revision,
    tokens: {
      prefix: config.tokens.prefix,
      entry: tokenIndex.entry,
      files: tokenIndex.files,
      mirrors: tokenIndex.mirrors,
      editing: tokenIndex.tokenEditing,
      items: [...tokenIndex.tokens.values()].map((t) => ({
        name: t.name,
        tier: t.tier,
        source: t.source,
        writable: t.writable,
        file: t.file,
        line: t.line,
        declaredValue: t.declaredValue,
        shape: t.shape,
        alias: t.alias,
        chain: t.chain,
        resolution: t.resolution,
        resolvedValue: t.resolvedValue,
        kind: t.kind,
        category: t.category,
        duplicate: t.duplicate,
        rootless: Boolean(t.rootless),
        shadowedBy: t.shadowedBy,
        variants: t.variants,
        usedBy: t.usedBy,
        aliasedBy: t.aliasedBy,
      })),
    },
    css: {
      files: cssIndex.files.map((f) => ({
        file: f.file,
        workspacePath: f.workspacePath,
        devId: f.devId,
        componentId: f.componentId,
        servedTextHash: f.servedTextHash,
        identityEligible: f.identityEligible,
        reason: f.reason,
        styleRuleCount: f.styleRuleCount,
        rules: f.rules.map((r) => ({
          ordinal: r.ordinal,
          selector: r.selector,
          atRules: r.atRules,
          occurrence: r.occurrence,
          line: r.line,
          nested: r.nested,
          declarations: r.declarations.map((d) => ({
            index: d.index,
            property: d.property,
            value: d.value,
            important: d.important,
            line: d.line,
            shape: d.shape,
            refs: d.refs,
            duplicateInRule: d.duplicateInRule,
            overriddenInRule: d.overriddenInRule,
          })),
        })),
      })),
    },
    components: { classPrefixes: config.components.classPrefixes },
    diagnostics: tokenIndex.diagnostics,
  };
}

export function indexSummary(index) {
  const { tokenIndex, cssIndex } = index;
  const tokens = [...tokenIndex.tokens.values()];
  const tierTokens = tokens.filter((t) => t.source === "tier");
  const rules = cssIndex.files.flatMap((f) => f.rules);
  const decls = rules.flatMap((r) => r.declarations);
  return {
    revision: index.revision,
    tokens: {
      total: tierTokens.length,
      byTier: Object.fromEntries(["ref", "sys", "comp"].map((tier) => [tier, tierTokens.filter((t) => t.tier === tier).length])),
      readonlyNames: tokens.filter((t) => t.source === "readonly").length,
      shadowed: tierTokens.filter((t) => t.shadowedBy.length > 0).length,
      unresolved: tierTokens.filter((t) => t.resolution !== "ok").length,
      editing: tokenIndex.tokenEditing,
      mirrors: tokenIndex.mirrors,
      entry: tokenIndex.entry,
    },
    css: {
      files: cssIndex.files.length,
      rules: rules.length,
      declarations: decls.length,
      refs: decls.reduce((sum, d) => sum + d.refs.length, 0),
      refsByTier: {
        comp: decls.flatMap((d) => d.refs).filter((r) => r.tier === "comp").length,
        sys: decls.flatMap((d) => d.refs).filter((r) => r.tier === "sys").length,
        unknownOrReadonly: decls.flatMap((d) => d.refs).filter((r) => !r.known || r.source === "readonly").length,
      },
      identityIneligible: cssIndex.files.filter((f) => !f.identityEligible).map((f) => ({ file: f.file, reason: f.reason })),
    },
    diagnostics: tokenIndex.diagnostics,
  };
}
