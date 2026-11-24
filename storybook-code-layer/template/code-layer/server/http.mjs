// Response and body helpers. Every response ends here: CORS headers set by
// upstream middleware are removed and hardening headers are added.
import { ApiError } from "../shared/api-contract.mjs";

export function stripCorsHeaders(res) {
  for (const name of res.getHeaderNames()) {
    if (name.startsWith("access-control-")) res.removeHeader(name);
  }
}

export function sendJson(res, status, body) {
  if (res.headersSent) return;
  stripCorsHeaders(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.end(JSON.stringify(body));
}

export function sendError(res, error) {
  const apiError = error instanceof ApiError ? error : new ApiError("internal", error?.message ?? String(error));
  sendJson(res, apiError.status, apiError.toJSON());
}

/** Read a JSON body with a byte limit enforced before and while streaming. */
export function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) {
      reject(new ApiError("body-too-large", `Body exceeds ${limit} bytes.`));
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    let done = false;
    req.on("data", (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        reject(new ApiError("body-too-large", `Body exceeds ${limit} bytes.`));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text === "" ? {} : JSON.parse(text));
      } catch {
        reject(new ApiError("schema-invalid", "Body is not valid JSON."));
      }
    });
    req.on("error", (error) => {
      if (!done) {
        done = true;
        reject(error);
      }
    });
  });
}
