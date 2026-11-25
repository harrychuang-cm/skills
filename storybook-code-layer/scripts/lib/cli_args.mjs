// Command-line contract of the installer scripts: every flag is known, every
// combination is checked, before any work is done.

const INSTALLER_VALUE_FLAGS = { "--project-root": "projectRoot", "--project": "projectRoot", "--config": "config" };
const INSTALLER_BOOLEAN_FLAGS = {
  "--check": "check",
  "--update": "update",
  "--uninstall": "uninstall",
  "--dry-run": "dryRun",
  "--force-managed": "forceManaged",
  "--json": "json",
  "--help": "help",
};

export const INSTALLER_USAGE =
  "usage: install_code_layer.mjs --project-root <storybook root> [--config <binding.json>] [--check | --update | --uninstall] [--dry-run] [--force-managed] [--json]";

function usage(message, flag = null) {
  return { ok: false, error: { code: "usage", message, flag } };
}

function scan(argv, valueFlags, booleanFlags) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (Object.hasOwn(valueFlags, arg)) {
      const key = valueFlags[arg];
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) return usage(`${arg} needs a value`, arg);
      if (options[key] !== undefined) return usage(`${arg} is given more than once`, arg);
      options[key] = value;
      i += 1;
    } else if (Object.hasOwn(booleanFlags, arg)) {
      options[booleanFlags[arg]] = true;
    } else {
      return usage(`unknown flag ${arg}`, arg);
    }
  }
  return { ok: true, options };
}

/**
 * Parse the arguments of install_code_layer.mjs.
 * Returns { ok: true, options: { projectRoot, config, mode, dryRun, forceManaged, json, help } }
 * or { ok: false, error: { code: "usage", message, flag } }.
 */
export function parseInstallerArgs(argv) {
  const scanned = scan(argv, INSTALLER_VALUE_FLAGS, INSTALLER_BOOLEAN_FLAGS);
  if (!scanned.ok) return scanned;
  const o = scanned.options;
  if (o.help) return { ok: true, options: { help: true } };
  const modes = ["check", "update", "uninstall"].filter((mode) => o[mode]);
  if (modes.length > 1) return usage(`--${modes[0]} and --${modes[1]} cannot be combined`, `--${modes[1]}`);
  const mode = modes[0] ?? "install";
  if (!o.projectRoot) return usage("--project-root <storybook root> is required", "--project-root");
  if (o.dryRun && mode === "check") return usage("--check writes nothing; --dry-run does not apply to it", "--dry-run");
  if (o.forceManaged && mode !== "update" && mode !== "uninstall") return usage("--force-managed is accepted only with --update or --uninstall", "--force-managed");
  if (o.config && mode !== "install") return usage(`--config is accepted only when installing; --${mode} never writes the project binding`, "--config");
  return {
    ok: true,
    options: { help: false, projectRoot: o.projectRoot, config: o.config ?? null, mode, dryRun: Boolean(o.dryRun), forceManaged: Boolean(o.forceManaged), json: Boolean(o.json) },
  };
}

export const DERIVE_USAGE = "usage: derive_binding.mjs --project-root <storybook root> [--json] [--write <confirmed-binding.json>]";

/** Parse the arguments of derive_binding.mjs. */
export function parseDeriveArgs(argv) {
  const scanned = scan(argv, { "--project-root": "projectRoot", "--project": "projectRoot", "--write": "write" }, { "--json": "json", "--help": "help" });
  if (!scanned.ok) return scanned;
  const o = scanned.options;
  if (o.help) return { ok: true, options: { help: true } };
  if (!o.projectRoot) return usage("--project-root <storybook root> is required", "--project-root");
  return { ok: true, options: { help: false, projectRoot: o.projectRoot, write: o.write ?? null, json: Boolean(o.json) } };
}
