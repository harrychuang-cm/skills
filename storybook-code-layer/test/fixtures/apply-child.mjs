// Child process used by the crash test: runs one apply with the test pause
// hook enabled, so the parent can kill -9 it between two file writes.
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const addon = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../template/code-layer");
const { loadConfig } = await import(path.join(addon, "server/config.mjs"));
const { loadPostcss } = await import(path.join(addon, "server/css-source.mjs"));
const { createEngine } = await import(path.join(addon, "server/transaction.mjs"));

const [configFile, projectRoot, batchJson] = process.argv.slice(2);
const config = loadConfig({ projectRoot, configFile });
const engine = createEngine({ config, postcss: loadPostcss(process.env.CODE_LAYER_TEST_PROJECT) });
await engine.apply(JSON.parse(batchJson));
process.stdout.write("finished\n");
