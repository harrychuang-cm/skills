// Fixture check: component tokens may alias system tokens only.
// Reads tokens/tokens-comp.css relative to the current directory.
import fs from "node:fs";

const text = fs.readFileSync("tokens/tokens-comp.css", "utf8");
const bad = [...text.matchAll(/(--fx-comp-[a-z0-9-]+)\s*:\s*var\((--fx-(?!sys-)[a-z0-9-]+)\)/g)];
if (bad.length > 0) {
  for (const [, token, target] of bad) console.error(`${token} must alias a system token, not ${target}`);
  process.exit(1);
}
console.log("token inheritance ok");
