// Write endpoints, added to the app by the preset when this file exists.
// Every POST has already passed the guard (loopback, Host, Origin,
// Sec-Fetch-Site, JSON content type, session header) before reaching here.
import { ApiError, ID_PATTERN } from "../shared/api-contract.mjs";
import { registerAgentRoutes } from "./agent/routes.mjs";
import { createEngine } from "./transaction.mjs";

function applyIdBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("schema-invalid", "body must be an object");
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "applyId" || typeof body.applyId !== "string" || !ID_PATTERN.test(body.applyId)) {
    throw new ApiError("schema-invalid", "body must be { applyId }");
  }
  return body;
}

/** agentOptions: test doubles for the AI routes (confirmer, launchImpl, probeImpl). */
export async function extendWithWrites(app, agentOptions = {}) {
  if (!app.config || !app.postcss || app.readOnlyReasons.length > 0) return;
  const engine = createEngine({ config: app.config, postcss: app.postcss, log: app.log, notifyChanged: app.notifyChanged });
  app.engine = engine;
  app.capabilities.write = engine.readOnly.length === 0;
  app.stateExtras = (index) => engine.state(index);
  const drift = engine.state().governance.drift;
  if (drift && (drift.rows > 0 || drift.undocumented > 0)) {
    app.log.warn(`component specifications: ${drift.rows} row(s) disagree with the token files, ${drift.undocumented} component token(s) have no row`);
  }
  if (engine.readOnly.length > 0) {
    app.log.warn(`writes disabled: ${engine.readOnly.map((r) => r.code).join(", ")}`);
  } else {
    // Run the baseline checks early so the first token apply is fast and /state can show them.
    engine.ensureBaseline().catch((error) => app.log.warn(`baseline checks could not run: ${error.message}`));
  }

  const applyLimit = app.config.limits.maxApplyBodyBytes;
  app.routes.set("POST /validate", {
    bodyLimit: applyLimit,
    handler: ({ body }) => engine.apply(body, { dryRun: true }),
  });
  app.routes.set("POST /apply", {
    bodyLimit: applyLimit,
    handler: ({ body }) => {
      if (body?.dryRun === true) throw new ApiError("schema-invalid", "use /validate for a dry run");
      return engine.apply(body);
    },
  });
  app.routes.set("POST /undo", { handler: ({ body }) => engine.undo(applyIdBody(body)) });
  app.routes.set("POST /undo/skip", { handler: ({ body }) => engine.skip(applyIdBody(body)) });
  app.routes.set("POST /undo/reverse", { handler: ({ body }) => engine.reverse(applyIdBody(body)) });
  // Source of truth over mirror, never the reverse; only on an explicit request.
  app.routes.set("POST /sync-mirror", {
    handler: ({ body }) => {
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("schema-invalid", "body must be an object");
      const keys = Object.keys(body);
      if (keys.length !== 1 || keys[0] !== "dryRun" || typeof body.dryRun !== "boolean") throw new ApiError("schema-invalid", "body must be { dryRun: boolean }");
      return engine.syncMirror({ dryRun: body.dryRun });
    },
  });
  app.routes.set("POST /pending-docs/resolve", {
    handler: ({ body }) => {
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("schema-invalid", "body must be an object");
      const keys = Object.keys(body);
      const ids = body.ids;
      if (keys.length !== 1 || keys[0] !== "ids" || !Array.isArray(ids) || ids.length === 0 || ids.length > 200 || !ids.every((id) => typeof id === "string" && ID_PATTERN.test(id))) {
        throw new ApiError("schema-invalid", "body must be { ids: [1 to 200 entry ids] }");
      }
      return engine.resolvePending(ids);
    },
  });
  app.routes.set("GET /applies/:id", {
    handler: ({ params }) => {
      if (!ID_PATTERN.test(params.id)) throw new ApiError("schema-invalid", "invalid apply id");
      return engine.applyReport(params.id);
    },
  });
  app.routes.set("POST /applies/:id/verification", {
    handler: ({ body, params }) => {
      if (!ID_PATTERN.test(params.id)) throw new ApiError("schema-invalid", "invalid apply id");
      return engine.recordVerification(params.id, body);
    },
  });
  // AI runs: answer "disabled" with the reason unless the binding and this machine both enable them.
  registerAgentRoutes(app, engine, agentOptions);
}
