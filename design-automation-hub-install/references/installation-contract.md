# Design Automation Hub installation contract

## Ownership

- `managed`: versioned Plugin, Coordinator, checker, and companion-skill files. Updates require the current bytes to match the prior receipt unless `--force-managed` is explicitly supplied.
- `merge`: only the declared `figma-cleanup` task and gitignore lines are merged. Unrelated keys and lines remain untouched.
- `generated`: the explicit project profile and installation receipt. Identity is never inferred.
- `manual`: the Figma Desktop manifest import handoff. Filesystem state cannot prove this action complete.

The receipt is `.design-automation/install.json`. It records template version, managed hashes, and normalized merge-fragment hashes without credentials.

## Project profile

`.design-automation/project.json` uses schema version `1`:

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "aurora",
    "displayName": "Project Aurora",
    "figmaFileKeys": ["file-a"]
  },
  "host": {
    "mode": "standalone",
    "adapter": null
  },
  "features": {
    "cleanup": true,
    "review": false,
    "workflowStatus": true
  }
}
```

Credential-like keys and values, duplicate file keys, unsupported schema versions, and path escapes are rejected.

## Host modes

Standalone mode supplies authenticated project context, durable cleanup tasks, workflow status, and generic agent delegation. It does not create an extraction queue and always reports review as unavailable.

Compatible mode requires a project-relative module exporting:

```js
export const designAutomationHubHostAdapter = {
  contractVersion: 1,
  async resolveProject(context) {},
  async resolveMember(context) {},
  review: {
    async listPendingReviews(context) {},
    async submitReviewDecision(context, decision) {},
    async getWorkflowOverview(context) {},
  },
};
```

The `review` group is optional but atomic. A partial group, unsupported version, missing base method, or failed no-write smoke check stops installation before writes.

## Runtime and artifacts

The portable runtime stores task state below `.design-automation/state/` and task-scoped artifacts below `.design-automation/runtime/<automation-task-id>/`. Each invocation has one `input.json` and one `result.json`. Both stay inside the project and task directory after symlink resolution.

The generic project task id is `figma-cleanup`, and it loads `figma-design-automation`. Generic runner selection, fallback, timeout, summary, and verification remain owned by `agent-automation-orchestrate`.

## CLI result

JSON output is a single schema-versioned object containing only stable summaries, issue codes, the absolute manifest path, manual actions, and next actions. It never includes access codes, credential values, raw prompts, expanded runner arguments, model output, or environment values.

Setup-required and failure results always contain a stable issue code. Dry-run and real installation build the same plan; dry-run writes nothing.

## Manual handoff

After an installed-project check passes, import the absolute manifest path in:

**Figma Desktop → Plugins → Development → Import plugin from manifest**

Import is not automated or inferred. The same Plugin identity can connect to multiple explicitly configured project profiles without embedding project names in fixed Plugin copy.

Import is once per manifest identity. A second project profile using the same
`Design Automation Hub` manifest reuses the existing imported Plugin and MUST
NOT require a second project-named import.

## End-to-end first-install contract

Run the first-install journey from a complete `cm-skills` checkout containing
both canonical skills:

1. Resolve an absolute target repository and inspect its applicable
   instructions.
2. Run installer `--dry-run --json` with explicit host mode, project identity,
   and `--skills-source-root <absolute-cm-skills-root>`. The target tree MUST
   remain byte-for-byte unchanged.
3. If the real install reports `needs-agent-automation-bootstrap`, run the
   generic `inspect-project.mjs`, use `agent-automation-orchestrate` bootstrap
   or guide mode to derive the smallest evidence-backed project contract, and
   run `validate-project-config.mjs`. Bootstrap MUST NOT start a paid runner.
4. Repeat dry-run, install, and run the installed-project checker.
5. Start `scripts/design-automation-hub/standalone.mjs` from the target root
   with an untracked `DESIGN_AUTOMATION_MEMBERS_JSON` value. The local access
   code MUST NOT enter tracked files or durable output.
6. `GET http://127.0.0.1:8787/healthz` MUST return status `ok`, schema version
   `1`, and `extractionQueue: false`. Authenticated standalone Plugin context
   at `GET /v1/plugin/context?fileKey=<explicit-file-key>` MUST name the
   explicit project profile, expose cleanup and workflow status, and keep
   review false. Acceptance access codes and file keys MUST NOT be copied into
   tracked files or durable logs.
7. Report the absolute manifest path and the incomplete
   `import-figma-manifest` action. Figma Desktop import remains a separate
   human confirmation.

## Compatible-host acceptance matrix

| Adapter shape | Required behavior |
| --- | --- |
| Base methods plus all three review methods | no-write smoke passes and installed profile exposes `review: true` |
| Base methods with no review object | install/check passes and installed profile exposes `review: false` |
| Any partial review group | preflight fails with `incomplete-review-adapter` and zero target writes |
| Unsupported contract or missing base method | preflight fails before target writes |
| Any filesystem write attempt during smoke | permission sandbox denies it and preflight fails with `host-adapter-smoke-wrote-files` |

Compatible adapter smoke runs in a child process whose working directory is the
target root, with project and installer read access and no filesystem write
grant. A runtime without the Node permission model MUST fail closed with
`host-adapter-sandbox-unavailable`.

## Release gate

Template `1.0.0` is distributable only after:

- `test/fixtures/manual-two-project-acceptance.json` records one manifest import
  and successful context verification for two real project profiles without
  persisting their Figma file keys;
- the same fixed `Design Automation Hub` identity serves both profiles and
  fixed copy contains neither project name;
- standalone cleanup and workflow status are visible and review is hidden;
- project A and project B are tested sequentially on the fixed local port
  `8787`, stopping A before starting B;
- the manifest is rebuilt after the version/evidence update; and
- these checks pass against the final bytes:

```bash
node design-automation-hub-install/scripts/build-template-manifest.mjs
node agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs
node design-automation-hub-install/scripts/check-design-automation-hub-install.mjs --template --json
node design-automation-hub-install/template/skills/figma-design-automation/scripts/check-figma-design-automation.mjs
git diff --check
spectra analyze add-design-automation-hub-installer --json
spectra validate add-design-automation-hub-installer
```

Filesystem two-profile fixtures and host-adapter smoke tests do not replace the
Figma Desktop acceptance. Until the manual record is complete, the template
MUST remain below `1.0.0` and the Spectra task MUST remain unchecked.
