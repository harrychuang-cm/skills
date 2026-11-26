// The scope gate: an AI run's working copy is accepted only when every
// difference is a modification of an existing file in the allowed set. Each
// case runs the real orchestrator with the fake runner; a rejected run writes
// nothing to the project.
import assert from "node:assert/strict";
import test from "node:test";

import { SEAL_CSS, SEAL_SPEC, SEAL_TSX, MIRROR_COMP, TOKENS_COMP, agentWorkspace, requestBody, treeHashes, waitFinal } from "./agent_helpers.mjs";
import { addon } from "./helpers.mjs";

const { globToRegExp } = await addon("server/agent/scope-gate.mjs");

async function run(w, lines) {
  const before = treeHashes(w.ws);
  const { runId } = w.runs.submit(requestBody(lines.join("\n")));
  const view = await waitFinal(w.runs, runId);
  return { view, before, after: treeHashes(w.ws) };
}

test("gate outcomes: the seven rows of the specification", async () => {
  const w = await agentWorkspace();
  const cases = [
    {
      name: "a declaration changed in a component stylesheet",
      lines: [`@edit ${SEAL_CSS} "border-radius: var(--fx-comp-seal-shape);" "border-radius: var(--fx-sys-shape-corner-md);"`],
      expect: { state: "imported" },
    },
    {
      name: "a component source file and its specification both modified",
      lines: [`@edit ${SEAL_TSX} "/** default: the primary square. */" "/** default: the primary square (the most common seal). */"`, `@edit ${SEAL_SPEC} "The default seal is a primary square with a white label." "The default seal is a primary square with a white label, the most common seal."`],
      expect: { state: "imported" },
    },
    { name: "package.json modified", lines: [`@edit sb/package.json "\\"version\\": \\"0.0.0\\"" "\\"version\\": \\"0.0.1\\""`], expect: { state: "rejected", reasons: [["outside-allowed-set", "sb/package.json"]] } },
    { name: "a new stylesheet created under a component root", lines: [`@create sb/src/components/seal/Extra.css ".fx-extra { color: red; }"`], expect: { state: "rejected", reasons: [["file-created", "sb/src/components/seal/Extra.css"]] } },
    {
      name: "a token declaration added to a token file",
      lines: [`@edit ${TOKENS_COMP} "  --fx-comp-seal-container-color: var(--fx-sys-color-primary);" "  --fx-comp-seal-container-color: var(--fx-sys-color-primary);\\n  --fx-comp-seal-new-color: var(--fx-sys-color-primary);"`],
      expect: { state: "rejected", reasons: [["token-set-changed", TOKENS_COMP]] },
    },
    {
      name: "a token mirror edited",
      lines: [`@edit ${MIRROR_COMP} "var(--fx-sys-color-primary);   /* voice */" "var(--fx-sys-color-secondary);   /* voice */"`],
      expect: { state: "rejected", reasons: [["mirror-edited", MIRROR_COMP]] },
    },
    { name: "a component stylesheet left with an unclosed block", lines: [`@append ${SEAL_CSS} ".fx-broken { color: red;"`], expect: { state: "rejected", reasons: [["css-parse-error", SEAL_CSS]] } },
  ];
  for (const c of cases) {
    const { view, before, after } = await run(w, c.lines);
    assert.equal(view.state, c.expect.state, `${c.name}: ${JSON.stringify(view.reasons)}`);
    if (c.expect.reasons) {
      assert.deepEqual(view.reasons.map((r) => [r.code, r.path]), c.expect.reasons, c.name);
      assert.deepEqual(after, before, `${c.name}: a rejected run writes nothing`);
    } else {
      assert.notDeepEqual(after, before, c.name);
      await w.engine.undo({ applyId: view.applyId });
      assert.deepEqual(treeHashes(w.ws), before, `${c.name}: undone exactly`);
    }
  }
});

test("several violations are all listed; a deleted file is one", async () => {
  const w = await agentWorkspace();
  const { view, before, after } = await run(w, [`@delete ${SEAL_TSX}`, `@edit sb/package.json "fixture-v1-storybook" "renamed"`, `@create notes.txt "hello"`]);
  assert.equal(view.state, "rejected");
  assert.deepEqual(view.reasons.map((r) => [r.code, r.path]).sort(), [["file-created", "notes.txt"], ["file-deleted", SEAL_TSX], ["outside-allowed-set", "sb/package.json"]]);
  assert.deepEqual(after, before);
});

test("an allow-list in the binding narrows the set: a component source change is then refused", async () => {
  const w = await agentWorkspace({ agent: { allowedGlobs: ["sb/src/components/**/*.css", "tokens/*.css"] } });
  const refused = await run(w, [`@edit ${SEAL_TSX} "/** default: the primary square. */" "/** default: square. */"`]);
  assert.equal(refused.view.state, "rejected");
  assert.deepEqual(refused.view.reasons.map((r) => [r.code, r.path]), [["outside-allowed-set", SEAL_TSX]]);
  assert.deepEqual(refused.after, refused.before);
  const accepted = await run(w, [`@edit ${SEAL_CSS} "border-radius: var(--fx-comp-seal-shape);" "border-radius: var(--fx-sys-shape-corner-md);"`]);
  assert.equal(accepted.view.state, "imported", JSON.stringify(accepted.view.reasons));
});

test("glob patterns", () => {
  const cases = [
    ["sb/src/components/**/*.css", "sb/src/components/seal/Seal.css", true],
    ["sb/src/components/**/*.css", "sb/src/components/Seal.css", true],
    ["sb/src/components/**/*.css", "sb/src/components/seal/Seal.tsx", false],
    ["tokens/*.css", "tokens/tokens-comp.css", true],
    ["tokens/*.css", "tokens/sub/tokens-comp.css", false],
    ["design-system/components/seal.md", "design-system/components/seal.md", true],
    ["design-system/components/s?al.md", "design-system/components/seal.md", true],
    ["a.b/*.css", "aXb/x.css", false],
  ];
  for (const [glob, file, matches] of cases) assert.equal(globToRegExp(glob).test(file), matches, `${glob} ~ ${file}`);
});
