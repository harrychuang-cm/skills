// /agent/* routes. They pass the same request guard as every other route
// (loopback, Host, Origin, Sec-Fetch-Site; POST: JSON and the session header)
// before anything here runs. No response ever contains the request text.
import { ApiError, ID_PATTERN } from "../../shared/api-contract.mjs";
import { createConfirmer } from "./confirm.mjs";
import { createAgentRuns } from "./runs.mjs";

/** Reasons that mean AI runs are off for this project or machine, not just not ready yet. */
const DISABLED_CODES = new Set(["binding-disabled", "runner-file-missing"]);

function runIdParam(params) {
  if (!ID_PATTERN.test(params.id ?? "")) throw new ApiError("schema-invalid", "invalid run id");
  return params.id;
}

export function registerAgentRoutes(app, engine, { confirmer = null, launchImpl, probeImpl } = {}) {
  const config = app.config;
  const runs = createAgentRuns({
    config,
    engine,
    postcss: app.postcss,
    log: app.log,
    confirmer: confirmer ?? createConfirmer({ mode: config.agent.confirm, log: app.log }),
    indexFor: () => app.indexCache?.get() ?? null,
    ...(launchImpl ? { launchImpl } : {}),
    ...(probeImpl ? { probeImpl } : {}),
  });
  app.agentRuns = runs;
  if (config.agent.enabled) {
    // Check the command line tools now (version and help only), so the first request does not wait.
    void runs.settled().then((status) => {
      if (status.ready) app.log.info(`AI runs ready (${status.runners.map((r) => r.label).join(", ")}; confirmation: ${status.confirm.mode})`);
    });
  }

  // A request body carries the person's text and the object reference.
  const bodyLimit = config.limits.maxAgentReferenceBytes + config.limits.maxAgentTextChars * 4 + 8192;
  app.routes.set("GET /agent/status", { handler: () => runs.status() });
  app.routes.set("POST /agent/runs", { bodyLimit, handler: ({ body }) => runs.submit(body) });
  // While AI runs are off, the routes about one run answer "disabled" with the reasons, like a new request does.
  const refuseWhenDisabled = () => {
    const status = runs.status();
    if (status.reasons.some((r) => DISABLED_CODES.has(r.code))) throw new ApiError("agent-disabled", "AI runs are not enabled", { reasons: status.reasons });
  };
  app.routes.set("GET /agent/runs/:id", {
    handler: ({ params }) => {
      refuseWhenDisabled();
      return runs.get(runIdParam(params));
    },
  });
  app.routes.set("POST /agent/runs/:id/confirm", {
    handler: ({ body, params }) => {
      refuseWhenDisabled();
      return runs.confirmCode(runIdParam(params), body);
    },
  });
  app.routes.set("POST /agent/runs/:id/cancel", {
    handler: ({ body, params }) => {
      if (body && Object.keys(body).length > 0) throw new ApiError("schema-invalid", "body must be empty");
      refuseWhenDisabled();
      return runs.cancel(runIdParam(params));
    },
  });
  return runs;
}

/**
 * The /agent/* routes of a server that cannot write at all (invalid binding,
 * PostCSS unavailable, …): the status says why, and every other route refuses
 * with the same reasons, so the page shows the real cause instead of waiting.
 */
export function registerReadOnlyAgentRoutes(app) {
  const reasons = [
    ...(app.config?.agent?.enabled ? [] : [{ code: "binding-disabled", detail: "agent.enabled is not true in the project binding" }]),
    { code: "read-only", detail: app.readOnlyReasons.map((r) => r.code).join(", ") },
  ];
  const limits = { maxTextChars: app.config?.limits?.maxAgentTextChars ?? 2000, maxReferenceBytes: app.config?.limits?.maxAgentReferenceBytes ?? 16384 };
  app.routes.set("GET /agent/status", {
    handler: () => ({ ok: true, enabled: Boolean(app.config?.agent?.enabled), ready: false, reasons, runners: [], confirm: { mode: null, unconfirmed: false }, activeRunId: null, limits }),
  });
  const refuse = () => {
    throw new ApiError(app.config?.agent?.enabled ? "agent-not-ready" : "agent-disabled", "AI runs are not available: the Code Layer server is read-only", { reasons });
  };
  for (const route of ["POST /agent/runs", "GET /agent/runs/:id", "POST /agent/runs/:id/confirm", "POST /agent/runs/:id/cancel"]) app.routes.set(route, { handler: refuse });
}
