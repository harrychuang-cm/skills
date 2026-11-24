// Code Layer local preset. Every field returns its input unchanged outside
// `storybook dev`, so `storybook build` ships nothing from this addon.
// Only entry files that exist are listed (the addon is built up in stages).
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function isDev(options) {
  return options?.configType === "DEVELOPMENT" && !process.env.VITEST && process.env.CODE_LAYER_DISABLE !== "1";
}

function existing(file) {
  const full = path.join(here, file);
  return fs.existsSync(full) ? [full] : [];
}

export const managerEntries = (entries = [], options) =>
  isDev(options) ? [...entries, ...existing("manager.tsx")] : entries;

export const previewAnnotations = (entries = [], options) =>
  isDev(options) ? [...entries, ...existing("annotations.ts")] : entries;

export const viteFinal = async (config, options) => {
  if (!isDev(options)) return config;
  const { createCodeLayerPlugin } = await import("./server/plugin.mjs");
  const writeRoutes = existing("server/write-routes.mjs");
  const { extendWithWrites } = writeRoutes.length > 0 ? await import("./server/write-routes.mjs") : { extendWithWrites: null };
  return {
    ...config,
    plugins: [...(config.plugins ?? []), createCodeLayerPlugin({ configDir: options.configDir, extend: extendWithWrites })],
  };
};
