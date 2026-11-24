// The Code Layer dev API as a plain (req, res) handler, independent of Vite so
// it can be tested on a bare node:http server. The Vite plugin mounts it.
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { ApiError, SCHEMA_VERSION } from "../shared/api-contract.mjs";
import { loadConfig } from "./config.mjs";
import { loadPostcss } from "./css-source.mjs";
import { guardRequest } from "./guard.mjs";
import { readJsonBody, sendError, sendJson } from "./http.mjs";
import { createIndexCache, serializeIndex } from "./index-builder.mjs";
import { isInside } from "./paths.mjs";
import { patcherSelfTest } from "./self-test.mjs";

export const ADDON_VERSION = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
).version;

const defaultLog = {
  info: (message) => console.log(`[code-layer] ${message}`),
  warn: (message) => console.warn(`[code-layer] ${message}`),
  error: (message) => console.error(`[code-layer] ${message}`),
};

/**
 * servedRoots: directories the dev server may serve files from. The state
 * directory must be outside all of them.
 * notifyChanged(absPaths): ask the watcher to re-announce written files.
 * extend(app): lets later modules (the transaction) add routes and state.
 */
export async function createApp({ projectRoot, configFile, servedRoots = [projectRoot], log = defaultLog, notifyChanged = () => {}, extend = null, postcss: injectedPostcss = null }) {
  const session = crypto.randomBytes(32).toString("base64url");
  const readOnlyReasons = [];
  let config = null;
  let postcss = injectedPostcss;
  let indexCache = null;

  try {
    config = loadConfig({ projectRoot, configFile });
  } catch (error) {
    readOnlyReasons.push({ code: "config-invalid", message: `${configFile}: ${error.message}` });
  }
  if (config) {
    if (!postcss) {
      try {
        postcss = loadPostcss(projectRoot);
      } catch (error) {
        readOnlyReasons.push({ code: "postcss-unavailable", message: error.message });
      }
    }
    if (servedRoots.some((root) => root && isInside(root, config.stateDir))) {
      readOnlyReasons.push({ code: "state-dir-served", message: `State directory ${config.stateDir} is inside a directory the dev server serves.` });
    }
    if (postcss) {
      const selfTest = patcherSelfTest(postcss);
      if (!selfTest.ok) readOnlyReasons.push({ code: "patcher-self-test-failed", message: selfTest.message });
      indexCache = createIndexCache({ config, postcss });
    }
  }

  const routes = new Map();
  const app = {
    session,
    projectRoot,
    configFile,
    log,
    notifyChanged,
    get config() {
      return config;
    },
    get postcss() {
      return postcss;
    },
    get indexCache() {
      return indexCache;
    },
    readOnlyReasons,
    engine: null,
    /** App-level reasons plus the write engine's (lock, recovery, failed rollback). */
    allReadOnly() {
      return [...readOnlyReasons, ...(app.engine?.readOnly ?? [])];
    },
    routes,
    capabilities: { write: false },
    stateExtras: () => ({}),
    requireIndex() {
      if (!indexCache) throw new ApiError("read-only", "Code Layer is not configured.", { reasons: readOnlyReasons });
      return indexCache.get();
    },
    async handle(req, res) {
      try {
        guardRequest(req, { session });
        const pathname = (req.url ?? "/").split("?")[0] || "/";
        const route = routes.get(`${req.method} ${pathname}`) ?? matchParam(routes, req.method, pathname);
        if (!route) throw new ApiError("not-found", `No route ${req.method} ${pathname}`);
        const limit = route.bodyLimit ?? config?.limits.maxOtherBodyBytes ?? 16384;
        const body = req.method === "POST" ? await readJsonBody(req, limit) : undefined;
        const result = await route.handler({ req, body, params: route.params ?? {} });
        sendJson(res, 200, result);
      } catch (error) {
        if (!(error instanceof ApiError)) log.error(error?.stack ?? String(error));
        sendError(res, error);
      }
    },
  };

  routes.set("GET /session", {
    handler: () => ({
      ok: true,
      schemaVersion: SCHEMA_VERSION,
      projectId: config?.projectId ?? null,
      version: ADDON_VERSION,
      session,
      capabilities: app.capabilities,
      limits: config?.limits ?? null,
      readOnly: app.allReadOnly().length > 0,
    }),
  });
  routes.set("GET /index", {
    handler: () => ({ ok: true, ...serializeIndex(app.requireIndex(), config) }),
  });
  routes.set("GET /state", {
    handler: () => {
      const index = indexCache ? indexCache.get() : null;
      return {
        ok: true,
        readOnly: { active: app.allReadOnly().length > 0, reasons: app.allReadOnly() },
        revision: index?.revision ?? null,
        tokenEditing: index?.tokenIndex.tokenEditing ?? null,
        mirrors: index?.tokenIndex.mirrors ?? [],
        ...app.stateExtras(),
      };
    },
  });

  if (extend) await extend(app);
  return app;
}

function matchParam(routes, method, pathname) {
  for (const [key, route] of routes) {
    const [routeMethod, pattern] = key.split(" ");
    if (routeMethod !== method || !pattern.includes(":")) continue;
    const want = pattern.split("/");
    const got = pathname.split("/");
    if (want.length !== got.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < want.length; i += 1) {
      if (want[i].startsWith(":")) params[want[i].slice(1)] = decodeURIComponent(got[i]);
      else if (want[i] !== got[i]) ok = false;
    }
    if (ok) return { ...route, params };
  }
  return null;
}
