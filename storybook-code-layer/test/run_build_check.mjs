#!/usr/bin/env node
// Development-only activation: a static build ships nothing from Code Layer.
//   CODE_LAYER_TEST_PROJECT=<storybook root> node test/run_build_check.mjs [--out <dir outside the project>] [--keep]
// Runs `storybook build` into a directory outside the project, scans every
// emitted file for Code Layer runtime code, its dev API path and its session
// header name, and checks that the state directory and an existing
// storybook-static folder are untouched.
// Stop the dev server first: a build and a dev server of the same project
// share Storybook's and Vite's caches.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { addon, testProject } from "./helpers.mjs";

const { API_BASE, SESSION_HEADER } = await addon("shared/api-contract.mjs");
const { configPathFor, loadConfig } = await addon("server/config.mjs");

const project = testProject();
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const keep = args.includes("--keep");
const results = [];

// Strings that only exist in the addon's own code. The addon *name* may appear
// in Storybook's addon list metadata ("CUSTOM:code-layer"); that is not code.
const MARKERS = [
  API_BASE,
  SESSION_HEADER,
  "code-layer/", // channel event prefix and module paths
  "storybook/code-layer", // addon, tool and panel ids
  "codeLayer", // the global
  "__CODE_LAYER__",
  "data-code-layer",
  "Code Layer",
];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    process.stdout.write(`✔ ${name}${detail ? ` — ${detail}` : ""}\n`);
  } catch (error) {
    results.push({ name, ok: false });
    process.stdout.write(`✖ ${name}\n    ${error.message.split("\n").join("\n    ")}\n`);
  }
}

function listing(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const stat = fs.lstatSync(full);
        out.push(`${path.relative(root, full)}\t${stat.size}\t${stat.mtimeMs}`);
      }
    }
  };
  walk(root);
  return out.sort();
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function hasCommand(name) {
  return (process.env.PATH ?? "").split(path.delimiter).some((dir) => dir && fs.existsSync(path.join(dir, name)));
}

async function main() {
  const config = loadConfig({ projectRoot: project, configFile: configPathFor(path.join(project, ".storybook")) });
  const lockFile = path.join(config.stateDir, "lock.json");
  if (fs.existsSync(lockFile)) {
    let owner = null;
    try {
      owner = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    } catch {
      owner = null;
    }
    if (owner && Number.isInteger(owner.pid) && pidAlive(owner.pid)) {
      process.stderr.write(`A dev server (pid ${owner.pid}) is running for this project. Stop it before the build check.\n`);
      return 2;
    }
  }

  const out = flag("--out") ? path.resolve(flag("--out")) : fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "code-layer-build-"));
  const relative = path.relative(project, out);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    process.stderr.write(`--out must be outside the project (${project}).\n`);
    return 2;
  }
  const staticDir = path.join(project, "storybook-static");
  const before = { state: listing(config.stateDir), static: listing(staticDir) };

  const env = { ...process.env, STORYBOOK_DISABLE_TELEMETRY: "1", CI: "1" };
  // Storybook refuses to start when it cannot name a package manager. A build
  // never runs one, so name npm when none is installed.
  if (!env.npm_config_user_agent && !["npm", "pnpm", "yarn"].some(hasCommand)) {
    env.npm_config_user_agent = `npm/0.0.0 node/${process.version} ${process.platform} ${process.arch}`;
  }
  let build = null;
  await check("the project builds into a directory outside the project", () => {
    build = spawnSync(process.execPath, [path.join(project, "node_modules", ".bin", "storybook"), "build", "-o", out], {
      cwd: project,
      env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(build.status, 0, `storybook build exited with ${build.status}\n${(build.stdout + build.stderr).slice(-2000)}`);
    const count = listing(out).length;
    assert.ok(count > 0, "the build produced no files");
    return `${count} files in ${out}`;
  });

  await check("no emitted file contains Code Layer code, its dev API path or its session header name", () => {
    const hits = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else {
          const text = fs.readFileSync(full).toString("latin1");
          for (const marker of MARKERS) if (text.includes(marker)) hits.push(`${path.relative(out, full)}: ${JSON.stringify(marker)}`);
        }
      }
    };
    assert.ok(build?.status === 0, "the build did not succeed");
    walk(out);
    assert.deepEqual(hits, []);
    return `${MARKERS.length} markers, 0 hits`;
  });

  await check("the state directory and storybook-static are unchanged", () => {
    assert.deepEqual(listing(config.stateDir), before.state, "state directory changed");
    assert.deepEqual(listing(staticDir), before.static, "storybook-static changed");
    return `${before.state.length} state files, ${before.static.length} static files`;
  });

  if (!keep && !flag("--out")) fs.rmSync(out, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok).length;
  process.stdout.write(`\n${results.length - failed}/${results.length} passed\n`);
  return failed === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exit(1);
  },
);
