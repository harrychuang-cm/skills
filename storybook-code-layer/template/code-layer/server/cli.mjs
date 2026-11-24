#!/usr/bin/env node
// Code Layer CLI. Works without Storybook running.
//   node cli.mjs index        --project <storybook root> [--config <file>] [--json] [--full]
//   node cli.mjs status       --project <storybook root>
//   node cli.mjs sync-mirror  --project <storybook root> (--dry-run | --apply)
//   node cli.mjs undo         --project <storybook root> --apply-id <id>
//   node cli.mjs recover      --project <storybook root>
// Write commands take the same lock as the dev server: while Storybook runs,
// use the panel (or stop Storybook first).
import path from "node:path";
import process from "node:process";

import { configPathFor, loadConfig } from "./config.mjs";
import { loadPostcss } from "./css-source.mjs";
import { buildIndex, indexSummary, serializeIndex } from "./index-builder.mjs";
import { Journal } from "./journal.mjs";

function readFlag(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

const print = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

async function engineFor(config, postcss) {
  const { createEngine } = await import("./transaction.mjs");
  const log = { info: (m) => process.stderr.write(`${m}\n`), warn: (m) => process.stderr.write(`${m}\n`), error: (m) => process.stderr.write(`${m}\n`) };
  return createEngine({ config, postcss, log });
}

export async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  const project = path.resolve(readFlag(args, "--project", process.cwd()));
  const configFile = path.resolve(readFlag(args, "--config", configPathFor(path.join(project, ".storybook"))));
  const config = loadConfig({ projectRoot: project, configFile });
  const postcss = loadPostcss(project);

  switch (command) {
    case "index": {
      const index = buildIndex({ config, postcss });
      const output = args.includes("--full") ? serializeIndex(index, config) : indexSummary(index);
      process.stdout.write(`${JSON.stringify(output, null, args.includes("--json") ? 2 : 0)}\n`);
      return 0;
    }
    case "status": {
      const summary = indexSummary(buildIndex({ config, postcss }));
      const journal = new Journal(config.stateDir);
      print({
        tokens: summary.tokens.byTier,
        mirrors: summary.tokens.mirrors,
        editing: summary.tokens.editing,
        undoStack: journal.undoStack(),
        unfinished: journal.unfinished().map((t) => t.applyId),
      });
      return 0;
    }
    case "sync-mirror": {
      if (!args.includes("--dry-run") && !args.includes("--apply")) {
        process.stderr.write("sync-mirror needs --dry-run or --apply\n");
        return 2;
      }
      const engine = await engineFor(config, postcss);
      print(await engine.syncMirror({ dryRun: !args.includes("--apply") }));
      return 0;
    }
    case "undo": {
      const engine = await engineFor(config, postcss);
      print(await engine.undo({ applyId: readFlag(args, "--apply-id") }));
      return 0;
    }
    case "recover": {
      const engine = await engineFor(config, postcss);
      print(engine.state());
      return engine.state().readOnlyReasons.length ? 1 : 0;
    }
    default:
      process.stderr.write("usage: cli.mjs <index|status|sync-mirror|undo|recover> --project <storybook root> [...]\n");
      return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`${error.code ?? "error"}: ${error.message}\n`);
      if (error.details) process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
      process.exit(1);
    },
  );
}
