// Project binding: .storybook/code-layer/code-layer.config.json
// Relative paths resolve against the Storybook project root.
import fs from "node:fs";
import path from "node:path";

import { API_BASE } from "../shared/api-contract.mjs";

export const CONFIG_FILE_NAME = "code-layer.config.json";

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.code = "config-invalid";
  }
}

const DEFAULT_LIMITS = {
  maxOperations: 50,
  maxApplyBodyBytes: 262144,
  maxOtherBodyBytes: 16384,
  maxStringLength: 512,
};

export const LOCALES = ["zh-Hant", "en"];
export const DEFAULT_PAIRING = { containerSuffix: "-container-color", contentSuffix: "-text-color" };

function requireType(value, type, where) {
  const ok = type === "array" ? Array.isArray(value) : typeof value === type && value !== null;
  if (!ok) throw new ConfigError(`${where} must be ${type}`);
  return value;
}

function onlyKeys(object, allowed, where) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) throw new ConfigError(`${where} has unknown key "${key}"`);
  }
}

export function configPathFor(configDir) {
  return path.join(configDir, "code-layer", CONFIG_FILE_NAME);
}

export function loadConfig({ projectRoot, configFile }) {
  const raw = JSON.parse(fs.readFileSync(configFile, "utf8"));
  return resolveConfig(raw, { projectRoot, configFile });
}

export function resolveConfig(raw, { projectRoot, configFile = null }) {
  requireType(raw, "object", "config");
  onlyKeys(raw, ["schemaVersion", "projectId", "apiPath", "workspaceRoot", "stateDir", "locale", "tokens", "components", "checks", "governance", "postApply", "limits"], "config");
  if (raw.schemaVersion !== 1) throw new ConfigError("config.schemaVersion must be 1");
  requireType(raw.projectId, "string", "config.projectId");
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(raw.projectId)) throw new ConfigError("config.projectId must be kebab-case");
  if ((raw.apiPath ?? API_BASE) !== API_BASE) throw new ConfigError(`config.apiPath must be ${API_BASE}`);
  const abs = (value, where) => path.resolve(projectRoot, requireType(value, "string", where));

  const tokens = requireType(raw.tokens, "object", "config.tokens");
  onlyKeys(tokens, ["prefix", "entry", "tiers", "readonlySources"], "config.tokens");
  requireType(tokens.prefix, "string", "config.tokens.prefix");
  const entry = requireType(tokens.entry, "object", "config.tokens.entry");
  const tiers = requireType(tokens.tiers, "array", "config.tokens.tiers").map((tier, index) => {
    const where = `config.tokens.tiers[${index}]`;
    requireType(tier, "object", where);
    onlyKeys(tier, ["tier", "source", "mirror", "writable"], where);
    if (!["ref", "sys", "comp"].includes(tier.tier)) throw new ConfigError(`${where}.tier must be ref, sys or comp`);
    return {
      tier: tier.tier,
      source: abs(tier.source, `${where}.source`),
      mirror: tier.mirror ? abs(tier.mirror, `${where}.mirror`) : null,
      writable: tier.writable === true,
    };
  });
  // comp and sys may be opened for re-binding; the reference tier holds raw values and is never written.
  if (tiers.some((t) => t.writable && t.tier === "ref")) {
    throw new ConfigError("the ref tier cannot be writable: reference tokens hold raw values");
  }
  if (raw.locale !== undefined && !LOCALES.includes(raw.locale)) {
    throw new ConfigError(`config.locale must be one of ${LOCALES.join(", ")}`);
  }

  const components = requireType(raw.components, "object", "config.components");
  onlyKeys(components, ["roots", "classPrefixes"], "config.components");

  const checks = requireType(raw.checks ?? [], "array", "config.checks").map((check, index) => {
    const where = `config.checks[${index}]`;
    requireType(check, "object", where);
    onlyKeys(check, ["id", "command", "args", "cwd", "appliesTo", "timeoutMs", "sha256"], where);
    requireType(check.id, "string", `${where}.id`);
    requireType(check.command, "string", `${where}.command`);
    requireType(check.args ?? [], "array", `${where}.args`);
    if (check.appliesTo !== "tokens") throw new ConfigError(`${where}.appliesTo must be "tokens"`);
    return {
      id: check.id,
      command: check.command,
      args: (check.args ?? []).map(String),
      cwd: check.cwd ?? "{candidateRoot}",
      appliesTo: check.appliesTo,
      timeoutMs: Number.isInteger(check.timeoutMs) ? check.timeoutMs : 60000,
      sha256: check.sha256 ?? null,
    };
  });

  const governanceRaw = requireType(raw.governance ?? {}, "object", "config.governance");
  onlyKeys(governanceRaw, ["componentSpecsDir", "pairing", "proseScan"], "config.governance");
  const pairingRaw = requireType(governanceRaw.pairing ?? {}, "object", "config.governance.pairing");
  onlyKeys(pairingRaw, ["containerSuffix", "contentSuffix"], "config.governance.pairing");
  const suffix = (value, fallback, where) => {
    if (value === undefined) return fallback;
    requireType(value, "string", where);
    if (!/^-[a-z0-9-]+$/.test(value)) throw new ConfigError(`${where} must start with "-" and use lower-case letters, digits and "-"`);
    return value;
  };
  if (governanceRaw.proseScan !== undefined && typeof governanceRaw.proseScan !== "boolean") {
    throw new ConfigError("config.governance.proseScan must be boolean");
  }
  const governance = {
    componentSpecsDir: governanceRaw.componentSpecsDir === undefined ? null : abs(governanceRaw.componentSpecsDir, "config.governance.componentSpecsDir"),
    pairing: {
      containerSuffix: suffix(pairingRaw.containerSuffix, DEFAULT_PAIRING.containerSuffix, "config.governance.pairing.containerSuffix"),
      contentSuffix: suffix(pairingRaw.contentSuffix, DEFAULT_PAIRING.contentSuffix, "config.governance.pairing.contentSuffix"),
    },
    proseScan: governanceRaw.proseScan ?? true,
  };

  const postApplyIds = new Set();
  const postApply = requireType(raw.postApply ?? [], "array", "config.postApply").map((entry, index) => {
    const where = `config.postApply[${index}]`;
    requireType(entry, "object", where);
    onlyKeys(entry, ["id", "command", "args", "cwd", "timeoutMs", "writes"], where);
    requireType(entry.id, "string", `${where}.id`);
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.id)) throw new ConfigError(`${where}.id must be kebab-case`);
    if (postApplyIds.has(entry.id)) throw new ConfigError(`${where}.id is duplicated`);
    postApplyIds.add(entry.id);
    requireType(entry.command, "string", `${where}.command`);
    requireType(entry.args ?? [], "array", `${where}.args`);
    // Every command says what it writes, so one that would write inside the
    // Storybook root (and reload the page) can be refused at start.
    if (entry.writes === undefined) throw new ConfigError(`${where}.writes is required: list the paths this command writes`);
    requireType(entry.writes, "array", `${where}.writes`);
    if (entry.timeoutMs !== undefined && (!Number.isInteger(entry.timeoutMs) || entry.timeoutMs <= 0)) {
      throw new ConfigError(`${where}.timeoutMs must be a positive integer`);
    }
    return {
      id: entry.id,
      command: entry.command,
      args: (entry.args ?? []).map(String),
      cwd: entry.cwd === undefined ? projectRoot : abs(entry.cwd, `${where}.cwd`),
      timeoutMs: entry.timeoutMs ?? 120000,
      writes: entry.writes.map((p, i) => abs(p, `${where}.writes[${i}]`)),
    };
  });

  return {
    configFile,
    projectRoot,
    projectId: raw.projectId,
    apiPath: API_BASE,
    workspaceRoot: abs(raw.workspaceRoot ?? ".", "config.workspaceRoot"),
    stateDir: abs(requireType(raw.stateDir, "string", "config.stateDir"), "config.stateDir"),
    locale: raw.locale ?? null,
    tokens: {
      prefix: tokens.prefix,
      entry: {
        source: abs(entry.source, "config.tokens.entry.source"),
        mirror: entry.mirror ? abs(entry.mirror, "config.tokens.entry.mirror") : null,
      },
      tiers,
      readonlySources: requireType(tokens.readonlySources ?? [], "array", "config.tokens.readonlySources").map((p, i) =>
        abs(p, `config.tokens.readonlySources[${i}]`),
      ),
    },
    components: {
      roots: requireType(components.roots, "array", "config.components.roots").map((p, i) => abs(p, `config.components.roots[${i}]`)),
      classPrefixes: requireType(components.classPrefixes ?? [], "array", "config.components.classPrefixes"),
    },
    checks,
    governance,
    postApply,
    limits: { ...DEFAULT_LIMITS, ...(raw.limits ?? {}) },
  };
}
