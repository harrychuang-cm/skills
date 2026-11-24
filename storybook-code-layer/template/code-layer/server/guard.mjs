// Request guard for the Code Layer dev API. Order matters: nothing about the
// request body is read until every header check has passed.
import crypto from "node:crypto";
import net from "node:net";

import { ApiError, SESSION_HEADER } from "../shared/api-contract.mjs";

const loopback = new net.BlockList();
loopback.addSubnet("127.0.0.0", 8, "ipv4");
loopback.addAddress("::1", "ipv6");

const ALLOWED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const PROXY_HEADERS = new Set(["forwarded", "via", "cf-connecting-ip", "x-real-ip", "true-client-ip"]);

export function isLoopback(address) {
  if (typeof address !== "string" || address === "") return false;
  if (address.toLowerCase().startsWith("::ffff:")) {
    const v4 = address.slice(7);
    if (net.isIPv4(v4)) return loopback.check(v4, "ipv4");
  }
  if (net.isIPv4(address)) return loopback.check(address, "ipv4");
  if (net.isIPv6(address)) return loopback.check(address, "ipv6");
  return false;
}

export function parseHost(value) {
  if (typeof value !== "string") return null;
  const match = /^(\[[0-9a-fA-F:.]+\]|[^:[\]\s]+)(?::(\d{1,5}))?$/.exec(value.trim());
  return match ? { hostname: match[1].toLowerCase(), port: match[2] ?? null } : null;
}

export function mediaType(value) {
  return typeof value === "string" ? value.split(";")[0].trim().toLowerCase() : "";
}

export function sameSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Throws ApiError when the request must be refused.
 * Checks, in order: loopback peer, no proxy headers, exact Host, Origin and
 * Sec-Fetch-Site (all methods), method, then for POST: Origin present,
 * JSON content type, session header.
 */
export function guardRequest(req, { session }) {
  if (!isLoopback(req.socket?.remoteAddress)) {
    throw new ApiError("forbidden", "Code Layer only answers requests from this machine.", { reason: "not-loopback" });
  }
  for (const name of Object.keys(req.headers)) {
    if (PROXY_HEADERS.has(name) || name.startsWith("x-forwarded-")) {
      throw new ApiError("forbidden", "Requests through proxies or tunnels are refused.", { reason: "proxied", header: name });
    }
  }
  const host = parseHost(req.headers.host);
  if (!host || !ALLOWED_HOSTNAMES.has(host.hostname)) {
    throw new ApiError("forbidden", "Open Storybook as localhost to use Code Layer.", { reason: "host" });
  }
  const scheme = req.socket?.encrypted ? "https" : "http";
  const expectedOrigin = `${scheme}://${req.headers.host.trim().toLowerCase()}`;
  const origin = req.headers.origin;
  if (origin !== undefined && origin.toLowerCase() !== expectedOrigin) {
    throw new ApiError("forbidden", "Cross-origin requests are refused.", { reason: "origin" });
  }
  const site = req.headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin") {
    throw new ApiError("forbidden", "Only same-origin requests are accepted.", { reason: "sec-fetch-site" });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    throw new ApiError("method-not-allowed", `${req.method} is not allowed.`);
  }
  if (req.method === "POST") {
    if (origin === undefined) {
      throw new ApiError("forbidden", "POST requests must carry an Origin header.", { reason: "origin-missing" });
    }
    if (mediaType(req.headers["content-type"]) !== "application/json") {
      throw new ApiError("unsupported-media-type", "POST bodies must be application/json.");
    }
    if (!sameSecret(req.headers[SESSION_HEADER], session)) {
      throw new ApiError("session-required", "Missing or wrong session. Reload the Storybook tab.");
    }
  }
}
