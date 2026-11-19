// Scanner tests: node --test anti-ai-style/scripts/test_scan_ai_tells.test.mjs
//
// The scanner only proposes candidates, so the cost of a wrong rule is noise in
// every review. These tests pin each rule to a line it must report and to the
// legitimate look-alikes it must leave alone.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  RULES,
  formatReport,
  hexToHsl,
  isDefaultPurple,
  parseEvidencedExceptions,
  scanPaths,
  scanText,
} from "./scan_ai_tells.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const scanner = path.join(here, "scan_ai_tells.mjs");
const fixture = (...parts) => path.join(here, "fixtures", ...parts);
const idsIn = (text) => scanText(text).map((finding) => finding.id);
const run = (...args) => spawnSync(process.execPath, [scanner, ...args], { encoding: "utf8", cwd: here });

test("the generated fixture triggers every rule", () => {
  const result = scanPaths([fixture("generated")], { cwd: here });
  const found = new Set(result.findings.map((finding) => finding.id));
  for (const rule of RULES) assert.ok(found.has(rule.id), `${rule.id} ${rule.name} was not reported`);
  assert.equal(result.scannedFiles, 2);
  assert.equal(result.counts.strong + result.counts.check, result.findings.length);
});

test("the product fixture produces no candidates", () => {
  const result = scanPaths([fixture("product")], { cwd: here });
  assert.deepEqual(result.findings, []);
  assert.equal(result.scannedFiles, 2);
});

test("every rule ID is listed in the catalog with the same confidence", () => {
  const catalog = fs.readFileSync(path.join(here, "..", "references", "tells.md"), "utf8");
  for (const rule of RULES) {
    const row = catalog.split("\n").find((line) => line.startsWith(`| ${rule.id} |`));
    assert.ok(row, `${rule.id} has no row in tells.md`);
    assert.ok(row.trimEnd().endsWith(`| ${rule.confidence} |`), `${rule.id} confidence differs from tells.md`);
  }
  for (const line of catalog.split("\n")) {
    const row = line.match(/^\| ([A-Z]\d+) \|.*\| (strong|check) \|\s*$/);
    if (row) assert.ok(RULES.some((rule) => rule.id === row[1]), `${row[1]} is marked ${row[2]} but has no scanner rule`);
  }
});

test("K1 reports the indigo-to-fuchsia band and leaves blue and pink alone", () => {
  for (const hex of ["6366f1", "4f46e5", "7c3aed", "a855f7", "d946ef", "5856d6"]) {
    assert.ok(isDefaultPurple(hexToHsl(hex)), `#${hex} should be in the band`);
  }
  for (const hex of ["2563eb", "3b82f6", "ec4899", "e5484d", "30a46c", "16181c", "fff", "8b8fa3"]) {
    assert.ok(!isDefaultPurple(hexToHsl(hex)), `#${hex} should be outside the band`);
  }
  assert.deepEqual(idsIn("color: rgb(124, 58, 237);"), ["K1"]);
  assert.deepEqual(idsIn('<a className="text-blue-600 ring-sky-500">'), []);
  assert.deepEqual(idsIn('<a className="text-violet-600">'), ["K1"]);
});

test("S5 and D2 separate backdrop blur from blurred shapes", () => {
  assert.deepEqual(idsIn('<nav className="backdrop-blur-md">'), ["S5"]);
  assert.deepEqual(idsIn("backdrop-filter: blur(40px);"), ["S5"]);
  assert.deepEqual(idsIn("backdrop-filter: none;"), []);
  assert.deepEqual(idsIn('<i className="blur-3xl" />'), ["D2"]);
  assert.deepEqual(idsIn('<img className="blur-sm" />'), []);
  assert.deepEqual(idsIn("filter: blur(4px);"), []);
  assert.deepEqual(idsIn("filter: blur(48px);"), ["D2"]);
  assert.deepEqual(idsIn(".tabBar.background(.ultraThinMaterial)"), ["S5"]);
});

test("S3 needs border, shadow, and radius on the same element", () => {
  assert.deepEqual(idsIn('<div className="rounded-lg border shadow-sm p-4">'), ["S3"]);
  assert.deepEqual(idsIn('<div className="rounded-lg border p-4">'), []);
  assert.deepEqual(idsIn('<div className="rounded-lg border-0 shadow-sm">'), []);
  assert.deepEqual(idsIn('<div className="rounded-lg border shadow-none">'), []);
  assert.deepEqual(idsIn(".card { border: 1px solid var(--divider); box-shadow: var(--elevation-1); }"), []);
});

test("S6 reports glow and leaves ordinary elevation alone", () => {
  assert.deepEqual(idsIn("box-shadow: 0 0 32px var(--accent);"), ["S6"]);
  assert.deepEqual(idsIn("box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);"), []);
  assert.deepEqual(idsIn("box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);"), []);
  assert.deepEqual(idsIn("box-shadow: 0 0 0 1px var(--divider);"), []);
  assert.deepEqual(idsIn('<div className="shadow-md shadow-black/10">'), []);
  assert.deepEqual(idsIn('<div className="shadow-lg shadow-emerald-500/40">'), ["S6"]);
});

test("D1 covers CSS, utility, SVG, SwiftUI, and Compose gradients", () => {
  for (const line of [
    "background-image: repeating-linear-gradient(45deg, red, blue);",
    '<div className="bg-linear-to-r">',
    '<div className="bg-radial">',
    "<linearGradient id=\"a\">",
    "LinearGradient(colors: [.orange, .red], startPoint: .top, endPoint: .bottom)",
    "Brush.verticalGradient(listOf(Color.Red, Color.Blue))",
  ]) {
    assert.ok(idsIn(line).includes("D1"), `expected D1 for: ${line}`);
  }
  assert.deepEqual(idsIn("background: var(--color-surface);"), []);
});

test("motion rules name the property and the trigger", () => {
  assert.deepEqual(idsIn("transition: background-color 120ms linear;"), []);
  assert.deepEqual(idsIn("transition-property: all;"), ["M1"]);
  assert.deepEqual(idsIn('<a className="transition-colors hover:bg-surface-raised">'), []);
  assert.deepEqual(idsIn('<a className="hover:-translate-y-1">'), ["M2"]);
  assert.deepEqual(idsIn('<a className="md:hover:scale-[1.03]">'), ["M2"]);
  assert.deepEqual(idsIn('<a className="hover:scale-100">'), []);
  assert.deepEqual(idsIn("<motion.div whileInView={{ opacity: 1 }}>"), ["M3"]);
  assert.deepEqual(idsIn('<div className="animate-spin">'), []);
});

test("content rules skip comments and logs, and read Chinese copy", () => {
  assert.deepEqual(idsIn("// seamless handoff between the two caches"), []);
  assert.deepEqual(idsIn('console.log("🚀 server started");'), []);
  assert.deepEqual(idsIn("<h2>一站式投資平台，賦能每一位投資人</h2>"), ["C3"]);
  assert.deepEqual(idsIn('{ name: "王小明", plan: "Pro" }'), ["C1"]);
  assert.deepEqual(idsIn('{ name: "國泰永續高股息", symbol: "00878" }'), []);
  assert.deepEqual(idsIn("<li>✅ Done</li>"), ["C6"]);
  assert.deepEqual(idsIn("<li>→ Next ✓ ©</li>"), []);
});

test("T1 fires only where a font is being declared", () => {
  assert.deepEqual(idsIn("--font-sans: Inter, system-ui;"), ["T1"]);
  assert.deepEqual(idsIn("const label = 'Inter-team sync';"), []);
  assert.deepEqual(idsIn('font-family: "PingFang TC", "Noto Sans TC", sans-serif;'), []);
});

test("K6 and D3 report tint shortcuts", () => {
  assert.deepEqual(idsIn('<div className="border-white/10">'), ["K6"]);
  assert.deepEqual(idsIn('<div className="bg-white">'), []);
  assert.deepEqual(idsIn("background: rgb(255 255 255 / 8%);"), ["K6"]);
  assert.deepEqual(idsIn("box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);"), []);
  assert.deepEqual(idsIn('<span className="grid size-10 place-items-center rounded-lg bg-emerald-50">'), ["D3"]);
  assert.deepEqual(idsIn('<span className="size-10 rounded-lg bg-emerald-600">'), []);
});

test("aggregate rules report once per file, at the first occurrence, above their threshold", () => {
  const five = Array.from({ length: 5 }, () => '<p className="text-center">x</p>').join("\n");
  assert.deepEqual(idsIn(five), []);
  const six = scanText(`<main>\n${five}\n<p style="text-align: center">x</p>`);
  assert.equal(six.length, 1);
  assert.equal(six[0].id, "L4");
  assert.equal(six[0].line, 2);
  assert.match(six[0].snippet, /^6 centered/);

  const radii = Array.from({ length: 8 }, () => ".a { border-radius: 24px; }").join("\n");
  assert.deepEqual(idsIn(radii), ["S4"]);
  assert.deepEqual(idsIn(radii.replaceAll("24px", "8px")), []);
  assert.deepEqual(idsIn(radii.replaceAll("24px", "9999px")), []);
});

test("an inline allow comment covers its own line and the next one only", () => {
  const text = [
    "/* anti-ai-allow: D1 promo badge gradient, Figma 2114:8830 */",
    ".badge { background: linear-gradient(#ffd75e, #ffb400); }",
    ".hero { background: linear-gradient(#111, #333); }",
  ].join("\n");
  const findings = scanText(text);
  assert.deepEqual(findings.map((finding) => [finding.line, finding.id, finding.allowedInline]), [
    [2, "D1", true],
    [3, "D1", false],
  ]);
  assert.equal(scanText("x { transition: all 1s; } /* anti-ai-allow: D1 */")[0].allowedInline, false);
});

test("Evidenced Exceptions are read from that section only", () => {
  const markdown = fs.readFileSync(fixture("rules", "ANTI_AI_STYLE_RULES.md"), "utf8");
  assert.deepEqual([...parseEvidencedExceptions(markdown)].sort(), ["D1", "S5"]);
  assert.deepEqual([...parseEvidencedExceptions("# Rules\n\n| D1 | x |\n")], []);
});

test("--rules moves excepted tells to the allowed list and keeps them visible", () => {
  const withRules = run("fixtures/generated", "--rules", "fixtures/rules/ANTI_AI_STYLE_RULES.md", "--json");
  assert.equal(withRules.status, 0, withRules.stderr);
  const result = JSON.parse(withRules.stdout);
  assert.ok(!result.findings.some((finding) => ["D1", "S5"].includes(finding.id)));
  assert.ok(result.findings.some((finding) => finding.id === "K1"));
  assert.deepEqual([...new Set(result.allowed.map((finding) => finding.id))].sort(), ["D1", "S5"]);
  assert.ok(result.allowed.every((finding) => finding.allowedBy === "rules"));
  assert.equal(result.counts.allowed, result.allowed.length);

  const text = run("fixtures/generated", "--rules", "fixtures/rules/ANTI_AI_STYLE_RULES.md").stdout;
  assert.match(text, /Allowed \(confirm each use sits inside its allowed scope\):/);
  assert.match(text, /D1 Background gradient: 2 by project rules/);
});

test("--strict fails on strong candidates and passes when none remain", () => {
  assert.equal(run("fixtures/generated", "--strict").status, 1);
  assert.equal(run("fixtures/product", "--strict").status, 0);
  assert.equal(run("fixtures/generated/styles.css", "--strict", "--allow", "T6,S5,D2").status, 0);
});

test("the text report groups in catalog order and truncates long groups", () => {
  const result = scanPaths([fixture("generated")], { cwd: here });
  const report = formatReport(result, { maxPerRule: 1 });
  const order = [...report.matchAll(/^([A-Z]\d+) /gm)].map((match) => match[1]);
  assert.deepEqual(order, RULES.map((rule) => rule.id));
  assert.match(report, /… 5 more \(use --json or --max-per-rule\)/);
  assert.match(report, /^anti-ai-style scan: 2 files, 36 candidates \(11 strong, 25 check\)$/m);
});

test("bad invocations exit 2 with usage", () => {
  for (const args of [[], ["missing-folder"], ["fixtures/product", "--rules"], ["fixtures/product", "--nope"], ["fixtures/product", "--allow", "gradients"]]) {
    const result = run(...args);
    assert.equal(result.status, 2, `expected exit 2 for: ${args.join(" ")}`);
    assert.match(result.stderr, /Usage: node scan_ai_tells\.mjs/);
  }
  assert.equal(run("--help").status, 0);
});

test("tests, build output, and unsupported files are not scanned", () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? "/tmp"), "anti-ai-scan-"));
  try {
    const write = (relative, content) => {
      const file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    };
    const tell = ".x { backdrop-filter: blur(8px); }\n";
    write("src/panel.css", tell);
    write("src/panel.test.tsx", 'const user = "John Doe";\n');
    write("node_modules/pkg/index.css", tell);
    write("dist/app.css", tell);
    write(".next/static/app.css", tell);
    write("src/app.min.css", tell);
    write("notes.md", "backdrop-filter: blur(8px)\n");

    const result = scanPaths([root], { cwd: root });
    assert.equal(result.scannedFiles, 1);
    assert.deepEqual(result.findings.map((finding) => `${finding.file}:${finding.id}`), ["src/panel.css:S5"]);

    const explicit = scanPaths([path.join(root, "notes.md"), path.join(root, "src/panel.test.tsx")], { cwd: root });
    assert.deepEqual(explicit.skipped, [{ file: "notes.md", reason: "unsupported file type" }]);
    assert.deepEqual(explicit.findings.map((finding) => finding.id), ["C1"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
