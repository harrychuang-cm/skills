import { existsSync, readFileSync } from "node:fs";

const canonical = {
  path: ".agents/skills/component-coverage-analyze/SKILL.md",
  surface: "Codex canonical",
};
const mirrors = [
  {
    path: ".claude/skills/component-coverage-analyze/SKILL.md",
    surface: "Claude Code",
  },
  {
    path: ".cursor/skills/component-coverage-analyze/SKILL.md",
    surface: "Cursor",
  },
];
const issues = [];

if (!existsSync(canonical.path)) {
  issues.push(`${canonical.surface}: missing ${canonical.path}.`);
}

const canonicalContents = existsSync(canonical.path)
  ? readFileSync(canonical.path)
  : null;

for (const mirror of mirrors) {
  if (!existsSync(mirror.path)) {
    issues.push(`${mirror.surface}: missing ${mirror.path}.`);
    continue;
  }

  if (
    canonicalContents &&
    !canonicalContents.equals(readFileSync(mirror.path))
  ) {
    issues.push(
      `${mirror.surface}: ${mirror.path} drifted from canonical ${canonical.path}.`,
    );
  }
}

if (issues.length > 0) {
  console.error("Component coverage agent skill check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(
  "Component coverage agent skill check passed: Codex, Claude Code, and Cursor project skills are byte-identical.",
);
