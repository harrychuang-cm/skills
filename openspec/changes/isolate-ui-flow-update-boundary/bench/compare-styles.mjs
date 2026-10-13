// Compares two computed-style-snapshot.mjs outputs: node compare-styles.mjs before.json after.json
import fs from "node:fs";
const [a, b] = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
let diffs = 0, values = 0, presence = 0;
for (const state of new Set([...Object.keys(a), ...Object.keys(b)])) {
  const sa = a[state] ?? {}, sb = b[state] ?? {};
  for (const el of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
    // Which snapshot images or frames have loaded depends on timing; report it apart from style values.
    if (!sa[el] || !sb[el]) { presence++; console.log("element only in one run:", state, el, Boolean(sa[el]), Boolean(sb[el])); continue; }
    for (const prop of new Set([...Object.keys(sa[el]), ...Object.keys(sb[el])])) {
      values++;
      if (sa[el][prop] !== sb[el][prop]) { diffs++; if (diffs <= 40) console.log(state, el, prop, JSON.stringify(sa[el][prop]), "->", JSON.stringify(sb[el][prop])); }
    }
  }
}
console.log(`${values} values compared, ${diffs} value differences, ${presence} elements present in one run only`);
process.exit(diffs ? 1 : 0);
