// /agent/* routes. They pass the same request guard as every other route
// (loopback, Host, Origin, Sec-Fetch-Site; POST: JSON and the session header)
// before anything here runs. No response ever contains the request text.
import { ApiError, ID_PATTERN } from "../../shared/api-contract.mjs";
import { createConfirmer } from "./confirm.mjs";
import { createAgentRuns } from "./runs.mjs";

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
  app.routes.set("GET /agent/runs/:id", { handler: ({ params }) => runs.get(runIdParam(params)) });
  app.routes.set("POST /agent/runs/:id/confirm", { handler: ({ body, params }) => runs.confirmCode(runIdParam(params), body) });
  app.routes.set("POST /agent/runs/:id/cancel", {
    handler: ({ body, params }) => {
      if (body && Object.keys(body).length > 0) throw new ApiError("schema-invalid", "body must be empty");
      return runs.cancel(runIdParam(params));
    },
  });
  return runs;
}
