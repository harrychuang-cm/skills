# Runner contract

Represent each headless agent as a shell-free process profile. A profile can call a native CLI or a project-owned SDK wrapper; the orchestrator does not require every provider to expose the same SDK.

## Shape

```json
{
  "id": "codex",
  "label": "Codex",
  "command": "codex",
  "args": ["exec", "-C", "{workspace}", "{prompt}"],
  "timeoutMs": 1800000,
  "preflight": {
    "command": "codex",
    "args": ["login", "status"],
    "timeoutMs": 30000
  },
  "inheritEnv": []
}
```

## Required behavior

- Keep `id` stable, unique, and kebab-case.
- Use `label` only for human display; use `id` for durable attribution.
- Use a non-empty executable in `command` and string arrays in `args`.
- Include exactly one `{prompt}` and exactly one `{workspace}` placeholder across `args`.
- Use a positive `timeoutMs`.
- Keep `preflight` side-effect free. It must verify executable and authentication readiness without starting paid inference.
- List only required environment variable names in `inheritEnv`.

The launcher always sets the child working directory to the resolved project root and replaces placeholders as literal argv values with `shell: false`.

## CLI and SDK wrappers

Prefer a native non-interactive CLI when it already provides login, permissions, structured exit, and subscription access. Use a project-owned SDK wrapper when the workflow needs provider-specific streaming, callbacks, session continuation, or custom tools.

An SDK wrapper still implements the same process contract:

- accept prompt and workspace as argv;
- exit zero only when the agent turn settles successfully;
- write diagnostic output to the current terminal, not the durable summary;
- honor termination signals and the configured timeout;
- keep provider credentials outside the project contract.

## Fallback classification

| Outcome | Fallback | Durable result |
| --- | --- | --- |
| Preflight non-zero, timeout, or spawn error | next runner | `unavailable` |
| Agent non-zero, timeout, or spawn error | next runner | `failed` or `timeout` |
| Agent zero | stop runner fallback | `success` |
| Verification or artifact failure after agent zero | no provider switch | `verification-failed` |
| Every runner unavailable or failed | stop | `exhausted` |

Do not use a generic authenticated worker label to identify the actual provider. Persist and display the selected profile `id` and `label`.

## Environment boundary

The launcher supplies a small OS environment needed to start a process, configured `inheritEnv` names that exist in the parent, and these run metadata variables:

- `AGENT_AUTOMATION_RUN_ID`
- `AGENT_AUTOMATION_TASK_ID`
- `AGENT_AUTOMATION_RUNNER_ID`

Never persist their full environment or provider credential values. Do not include secret values in command arguments because argv can be visible to local process inspection.
