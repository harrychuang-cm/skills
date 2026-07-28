#!/usr/bin/env node

import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { DesignAutomationError } from "./contract.mjs";
import { DesignAutomationHubCore } from "./core.mjs";
import { createDesignAutomationHubServer } from "./server.mjs";

export function parseStandaloneMembers(serialized = process.env.DESIGN_AUTOMATION_MEMBERS_JSON) {
  let values;
  try {
    values = JSON.parse(serialized || "[]");
  } catch {
    throw new DesignAutomationError("invalid-member-configuration", "Member configuration is invalid.", { status: 500 });
  }
  if (!Array.isArray(values) || values.length === 0) {
    throw new DesignAutomationError("invalid-member-configuration", "At least one local member is required.", { status: 500 });
  }
  const seenCodes = new Set();
  return values.map((value) => {
    if (
      !value
      || typeof value.accessCode !== "string"
      || !value.accessCode
      || typeof value.id !== "string"
      || !value.id
      || seenCodes.has(value.accessCode)
    ) throw new DesignAutomationError("invalid-member-configuration", "Local member entry is invalid.", { status: 500 });
    seenCodes.add(value.accessCode);
    return {
      accessCode: value.accessCode,
      id: value.id,
      displayName: typeof value.displayName === "string" && value.displayName ? value.displayName : value.id,
      roles: Array.isArray(value.roles) ? value.roles.filter((role) => typeof role === "string") : ["designer"],
    };
  });
}

export function createStandaloneAuthenticator(members) {
  const byCode = new Map(members.map(({ accessCode, ...member }) => [accessCode, member]));
  return (authorization) => {
    const match = /^Bearer\s+(.+)$/i.exec(authorization || "");
    return match ? byCode.get(match[1]) || null : null;
  };
}

export function startStandalone({ projectRoot = process.cwd(), port = Number(process.env.PORT || 8787) } = {}) {
  const resolvedRoot = fs.realpathSync(projectRoot);
  const core = new DesignAutomationHubCore({ projectRoot: resolvedRoot });
  const members = parseStandaloneMembers();
  const server = createDesignAutomationHubServer({
    core,
    authenticate: createStandaloneAuthenticator(members),
  });
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`Design Automation Hub Coordinator: http://127.0.0.1:${port}\n`);
  });
  return server;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startStandalone();
}
