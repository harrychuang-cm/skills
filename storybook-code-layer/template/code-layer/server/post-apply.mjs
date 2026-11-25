// Post-apply commands: the project's own generators of derived artifacts
// (documentation pages, review pages), run after a write has committed.
//
// They never decide whether a write happens and never roll one back: a failing
// generator only means the derived artifacts are out of date, and the report
// says so. Commands run like the blocking checks do — no shell, the dev
// server's own Node in place of `node`, an environment allow-list, and a time
// limit that ends the whole process group.
import { runCheck } from "./checks.mjs";
import { isInside, relativePosix } from "./paths.mjs";

const OUTPUT_TAIL = 1024;

export function createPostApply({ config, journal, log = { info() {}, warn() {} } }) {
  const relW = (abs) => relativePosix(config.workspaceRoot, abs);
  const commands = [];
  const refused = [];
  for (const entry of config.postApply) {
    // Writing inside the Storybook root makes Vite reload the page mid-verification.
    const inside = entry.writes.filter((target) => isInside(config.projectRoot, target));
    if (inside.length > 0) {
      refused.push({ id: entry.id, reason: "writes-inside-storybook-root", writes: inside.map(relW) });
      log.warn(`post-apply command "${entry.id}" is not run: it writes inside the Storybook project root (${inside.map(relW).join(", ")})`);
    } else {
      commands.push(entry);
    }
  }

  /** applyId -> { status: "queued" | "running" | "done", results, stale, finishedAt } */
  const rounds = new Map();
  const waiting = new Set();
  let running = null;
  let last = null;

  async function runRound(applyIds) {
    for (const id of applyIds) rounds.set(id, { status: "running", results: [], stale: false, finishedAt: null });
    const results = [];
    for (const command of commands) {
      const result = await runCheck({ id: command.id, command: command.command, args: command.args, cwd: command.cwd, timeoutMs: command.timeoutMs }, { candidateRoot: config.workspaceRoot });
      results.push({ id: result.id, ok: result.ok, code: result.code, signal: result.signal ?? null, timedOut: Boolean(result.timedOut), durationMs: result.durationMs, output: result.output.slice(-OUTPUT_TAIL) });
    }
    const finishedAt = new Date().toISOString();
    const stale = results.some((r) => !r.ok);
    for (const id of applyIds) {
      rounds.set(id, { status: "done", results, stale, finishedAt });
      journal.append({ type: "post-apply", applyId: id, results, stale });
    }
    last = { applyIds, results, stale, finishedAt };
    if (stale) log.warn(`post-apply: ${results.filter((r) => !r.ok).map((r) => r.id).join(", ")} failed; derived artifacts are out of date`);
  }

  function pump() {
    if (running || waiting.size === 0) return;
    const applyIds = [...waiting];
    waiting.clear();
    running = runRound(applyIds)
      .catch((error) => log.warn(`post-apply round failed: ${error.message}`))
      .finally(() => {
        running = null;
        // Commits that arrived while this round ran get one more round.
        pump();
      });
  }

  return {
    commands: commands.map((c) => c.id),
    refused,
    /** Queue one round for a committed transaction. Returns what the response should say. */
    schedule(applyId) {
      if (commands.length === 0) return { status: "none", commands: [], refused };
      rounds.set(applyId, { status: "queued", results: [], stale: false, finishedAt: null });
      waiting.add(applyId);
      // Start after the caller has returned its response.
      setImmediate(pump);
      return { status: "queued", commands: commands.map((c) => c.id), refused };
    },
    /** The round of one transaction: from memory while this process ran it, else from the journal. */
    report(applyId, journaled = null) {
      const round = rounds.get(applyId);
      if (round) return { ...round, commands: commands.map((c) => c.id) };
      if (journaled) return { status: "done", results: journaled.results, stale: Boolean(journaled.stale), finishedAt: journaled.at ?? null, commands: journaled.results.map((r) => r.id) };
      return { status: "none", results: [], stale: false, finishedAt: null, commands: [] };
    },
    state() {
      return { commands: commands.map((c) => c.id), refused, running: running !== null || waiting.size > 0, last };
    },
    /** Resolves when no round is running or queued. */
    async idle() {
      while (running || waiting.size > 0) {
        if (running) await running;
        else await new Promise((resolve) => setImmediate(resolve));
      }
    },
  };
}
