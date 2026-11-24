// Vite plugin that mounts the Code Layer dev API. Dev server only: `apply:
// "serve"`, no build hooks, and configureServer re-checks the command.
import fs from "node:fs";
import path from "node:path";

import { API_BASE } from "../shared/api-contract.mjs";
import { createApp } from "./app.mjs";
import { configPathFor } from "./config.mjs";

export function createCodeLayerPlugin({ configDir, extend = null }) {
  const projectRoot = path.dirname(configDir);
  return {
    name: "storybook-code-layer",
    apply: "serve",
    async configureServer(server) {
      if (server.config.command !== "serve") return;
      const logger = server.config.logger;
      const log = {
        info: (message) => logger.info(`[code-layer] ${message}`, { timestamp: true }),
        warn: (message) => logger.warn(`[code-layer] ${message}`, { timestamp: true }),
        error: (message) => logger.error(`[code-layer] ${message}`, { timestamp: true }),
      };
      const realRoot = (dir) => {
        try {
          return fs.realpathSync(dir);
        } catch {
          return dir;
        }
      };
      const servedRoots = [server.config.root, ...(server.config.server?.fs?.allow ?? [])].filter(Boolean).map(realRoot);
      const app = await createApp({
        projectRoot,
        configFile: configPathFor(configDir),
        servedRoots,
        log,
        notifyChanged: (files) => {
          for (const file of files) server.watcher.emit("change", file);
        },
        extend,
      });
      server.middlewares.use(API_BASE, (req, res) => {
        void app.handle(req, res);
      });
      if (app.readOnlyReasons.length > 0) {
        log.warn(`read-only: ${app.readOnlyReasons.map((r) => `${r.code} (${r.message})`).join("; ")}`);
      } else {
        log.info(`ready at ${API_BASE} (writes ${app.capabilities.write ? "enabled" : "disabled"})`);
      }
    },
  };
}
