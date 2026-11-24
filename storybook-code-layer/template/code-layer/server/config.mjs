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
  onlyKeys(raw, ["schemaVersion", "projectId", "apiPath", "workspaceRoot", "stateDir", "tokens", "components", "checks", "limits"], "config");
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
  if (tiers.filter((t) => t.writable).some((t) => t.tier !== "comp")) {
    throw new ConfigError("only the comp tier may be writable");
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

  return {
    configFile,
    projectRoot,
    projectId: raw.projectId,
    apiPath: API_BASE,
    workspaceRoot: abs(raw.workspaceRoot ?? ".", "config.workspaceRoot"),
    stateDir: abs(requireType(raw.stateDir, "string", "config.stateDir"), "config.stateDir"),
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
    limits: { ...DEFAULT_LIMITS, ...(raw.limits ?? {}) },
  };
}
