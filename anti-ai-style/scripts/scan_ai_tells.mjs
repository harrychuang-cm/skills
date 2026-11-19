#!/usr/bin/env node
// Scan UI source for the mechanical tells in references/tells.md.
//
//   node scan_ai_tells.mjs <path...> [--rules <ANTI_AI_STYLE_RULES.md>]
//                                    [--allow <ID,ID>] [--json] [--strict]
//                                    [--max-per-rule <n>]
//
// Every hit is a candidate, not a verdict: a pattern the product's design
// evidence shows is not a tell. `strong` candidates are rarely evidenced,
// `check` candidates often are. The scanner reads text only. It cannot see
// values behind tokens, layout, images, or anything drawn at runtime.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCAN_EXTENSIONS = new Set([
  ".css", ".scss", ".sass", ".less", ".styl",
  ".html", ".htm", ".vue", ".svelte", ".astro", ".mdx",
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".swift", ".kt",
]);
const SKIP_DIRECTORIES = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage", "vendor",
  ".next", ".nuxt", ".svelte-kit", ".turbo", ".cache", "storybook-static",
  "Pods", "DerivedData", ".gradle", "__tests__", "__snapshots__", "__mocks__",
]);
const SKIP_FILE = /(\.min\.(js|css)|\.d\.ts|\.(test|spec)\.[cm]?[jt]sx?|\.map)$/;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SNIPPET_LENGTH = 160;

// A utility class token: not part of a longer class or identifier.
const token = (body) => new RegExp(`(?<![\\w-])(?:${body})(?![\\w-])`);

const PLACEHOLDER = /\b(?:John|Jane) (?:Doe|Smith)\b|\bLorem ipsum\b|\bAcme (?:Inc|Corp|Co)\b|王小明|陳小明/i;
const FILLER_COPY = new RegExp(
  [
    "\\bseamless(?:ly)?\\b", "\\beffortless(?:ly)?\\b", "\\belevate your\\b",
    "\\bunlock (?:the|your)\\b", "\\bsupercharge\\b", "\\bempower(?:s|ing)? (?:you|your|teams)\\b",
    "\\bstreamline your\\b", "\\brevolutioni[sz]", "\\bcutting[- ]edge\\b",
    "\\bnext[- ]gen(?:eration)?\\b", "\\bgame[- ]chang", "\\bunleash\\b",
    "\\bto the next level\\b", "\\ball[- ]in[- ]one\\b", "\\bblazing(?:ly)? fast\\b",
    "\\breimagin", "\\bthe future of\\b",
    "一站式", "賦能", "無縫", "全方位", "輕鬆打造", "釋放.{0,6}潛力", "開啟.{0,8}之旅",
    "顛覆", "極致體驗", "打造專屬",
  ].join("|"),
  "i",
);
// Pictographic emoji, plus the few symbols used as decoration in headings.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2728}\u{26A1}\u{2705}\u{274C}\u{2B50}]/u;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*(?!\s*[{,])|<!--)/;
const DEFAULT_FONTS = /\b(?:Inter|Poppins|Space Grotesk|Plus Jakarta Sans|Outfit|Manrope|Sora|DM Sans)\b/;
const FONT_CONTEXT = /font-family|fontFamily|next\/font|fonts\.googleapis\.com|--font-/;
const PURPLE_UTILITY = token(
  "(?:bg|text|from|via|to|border|ring|shadow|fill|stroke|outline|decoration|accent|divide)-(?:indigo|violet|purple|fuchsia)-(?:50|[1-9]00|950)(?:\\/\\d+)?",
);
const HEX_COLOR = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const RGB_COLOR = /rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi;
const TRANSLUCENT_WHITE = new RegExp(
  [
    token("(?:bg|border|ring|divide|outline)-white\\/(?:5|10|15|20|\\[0?\\.[012]\\d*\\])").source,
    "rgba\\(\\s*255\\s*,\\s*255\\s*,\\s*255\\s*,\\s*0?\\.[012]\\d*\\s*\\)",
    "rgb\\(\\s*255\\s+255\\s+255\\s*\\/\\s*(?:0?\\.[012]\\d*|[1-2]?\\d%)\\s*\\)",
  ].join("|"),
);
const CARD_RADIUS = token("rounded(?:-(?:md|lg|xl|2xl|3xl|\\[[^\\]]+\\]))?");
const CARD_BORDER = token("border(?:-(?!0\\b|none\\b|[trblxyse]-0\\b)[\\w/\\[\\]#.-]+)?");
const CARD_SHADOW = token("shadow(?:-(?:sm|md|lg|xl|2xl|\\[[^\\]]+\\]))?");
const LARGE_RADIUS = new RegExp(
  [
    token("rounded(?:-[trblse]{1,2})?-(?:xl|2xl|3xl)").source,
    token("rounded(?:-[trblse]{1,2})?-\\[(?:1[6-9]|[2-9]\\d)px\\]").source,
    "border-radius\\s*:\\s*(?:1[6-9]|[2-9]\\d)px",
  ].join("|"),
  "g",
);
const GLASS = new RegExp(
  [
    "backdrop-filter\\s*:(?!\\s*none)",
    token("backdrop-blur(?:-(?!none)[\\w\\[\\]]+)?").source,
    "backdropFilter",
    "\\.(?:ultraThin|thin|regular|thick|ultraThick)Material\\b",
  ].join("|"),
);
const GLOW = new RegExp(
  [
    token("shadow-[a-z]+-(?:50|[1-9]00|950)(?:\\/\\d+)?").source,
    token("(?:drop-)?shadow-\\[0_0_[^\\]]+\\]").source,
    "box-shadow\\s*:[^;]*?(?<![\\w.])0(?:px)?\\s+0(?:px)?\\s+(?:[2-9]\\d|\\d{3,})px",
  ].join("|"),
);
const GRADIENT = new RegExp(
  [
    "(?:repeating-)?(?:linear|radial|conic)-gradient\\(",
    token("bg-(?:gradient|linear|radial|conic)(?:-[\\w\\[\\]-]+)?").source,
    "<(?:linear|radial)Gradient\\b",
    "\\b(?:Linear|Radial|Angular|Mesh)Gradient\\(",
    "Brush\\.(?:linear|radial|sweep|vertical|horizontal)Gradient\\b",
  ].join("|"),
);
const GRADIENT_TEXT = new RegExp(
  ["background-clip\\s*:\\s*text", token("bg-clip-text").source, "WebkitBackgroundClip"].join("|"),
);
const BLUR_UTILITY = token("blur-(?:2xl|3xl|\\[(\\d+)px\\])");
const BLUR_FILTER = /(?<![\w-])filter\s*:[^;]*?blur\(\s*(\d+(?:\.\d+)?)px/;
const TINT_BACKGROUND = token("bg-(?:[a-z]+-(?:50|100)|[a-z]+(?:-\\d{2,3})?\\/(?:5|10|15|20))");
const ICON_BOX_SIZE = token("(?:size|w|h)-(?:8|9|10|11|12|14|16)");
const ANY_RADIUS = token("rounded(?:-[\\w\\[\\]]+)?");
const TRANSITION_ALL = new RegExp(
  ["transition(?:-property)?\\s*:\\s*[\"']?all\\b", token("transition-all").source].join("|"),
);
const HOVER_LIFT = new RegExp(
  [
    token("(?:group-)?hover:(?:scale-(?:10[2-9]|11\\d|\\[1\\.\\d+\\])|-translate-y-(?:0\\.5|1|1\\.5|2|\\[\\d+px\\]))").source,
    "whileHover=\\{\\{[^}]*\\b(?:scale|y)\\s*:",
  ].join("|"),
);
const ENTRANCE = new RegExp(
  [
    "data-aos=",
    "\\bwhileInView\\b",
    token("animate-(?:fade-in(?:-up)?|fade-up|slide-up|slide-in(?:-[a-z]+)?)").source,
    "animation(?:-name)?\\s*:[^;]*\\bfade(?:In)?Up\\b",
  ].join("|"),
);
const CENTERED_TEXT = new RegExp(
  [token("text-center").source, "text-align\\s*:\\s*center"].join("|"),
  "g",
);

export function hexToHsl(hex) {
  let value = hex.replace(/^#/, "");
  if (value.length === 3) value = value.split("").map((digit) => digit + digit).join("");
  return rgbToHsl(
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  );
}

export function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

// Indigo through fuchsia: the hue band of the default generated palette.
// Blue (below about 230) and pink (above about 300) are outside it.
export function isDefaultPurple({ h, s, l }) {
  return h >= 232 && h <= 295 && s >= 0.5 && l >= 0.3 && l <= 0.8;
}

function hasPurpleColor(line) {
  for (const match of line.matchAll(HEX_COLOR)) {
    if (isDefaultPurple(hexToHsl(match[1]))) return true;
  }
  for (const match of line.matchAll(RGB_COLOR)) {
    const channels = match.slice(1, 4).map(Number);
    if (channels.every((channel) => channel <= 255) && isDefaultPurple(rgbToHsl(...channels))) return true;
  }
  return false;
}

function hasLargeBlur(line) {
  const utility = line.match(BLUR_UTILITY);
  if (utility && (utility[1] === undefined || Number(utility[1]) >= 24)) return true;
  const filter = line.match(BLUR_FILTER);
  return Boolean(filter && Number(filter[1]) >= 24);
}

export const RULES = [
  { id: "C1", name: "Placeholder identities", confidence: "strong", test: (line) => PLACEHOLDER.test(line) },
  {
    id: "C3", name: "Filler copy", confidence: "check",
    test: (line) => !COMMENT_LINE.test(line) && FILLER_COPY.test(line),
  },
  {
    id: "C6", name: "Emoji as icons or bullets", confidence: "strong",
    test: (line) => !COMMENT_LINE.test(line) && !/\bconsole\./.test(line) && EMOJI.test(line),
  },
  {
    id: "L4", name: "Centered everything", confidence: "check",
    aggregate: { pattern: CENTERED_TEXT, threshold: 6, describe: (count) => `${count} centered text declarations in this file` },
  },
  {
    id: "T1", name: "Unchosen typeface", confidence: "check",
    test: (line) => FONT_CONTEXT.test(line) && DEFAULT_FONTS.test(line),
  },
  { id: "T6", name: "Gradient text", confidence: "strong", test: (line) => GRADIENT_TEXT.test(line) },
  {
    id: "K1", name: "Default indigo, violet, or purple", confidence: "check",
    test: (line) => PURPLE_UTILITY.test(line) || hasPurpleColor(line),
  },
  { id: "K6", name: "Translucent whites", confidence: "check", test: (line) => TRANSLUCENT_WHITE.test(line) },
  {
    id: "S3", name: "Stacked card: border, shadow, and radius together", confidence: "check",
    test: (line) => CARD_RADIUS.test(line) && CARD_BORDER.test(line) && CARD_SHADOW.test(line),
  },
  {
    id: "S4", name: "One large radius on everything", confidence: "check",
    aggregate: { pattern: LARGE_RADIUS, threshold: 8, describe: (count) => `${count} radius declarations of 16px or more in this file` },
  },
  { id: "S5", name: "Glassmorphism", confidence: "strong", test: (line) => GLASS.test(line) },
  { id: "S6", name: "Glow and colored shadows", confidence: "check", test: (line) => GLOW.test(line) },
  { id: "D1", name: "Background gradient", confidence: "check", test: (line) => GRADIENT.test(line) },
  { id: "D2", name: "Blurred blobs and orbs", confidence: "strong", test: hasLargeBlur },
  {
    id: "D3", name: "Icon in a tinted rounded square", confidence: "check",
    test: (line) =>
      TINT_BACKGROUND.test(line) && ICON_BOX_SIZE.test(line) && ANY_RADIUS.test(line) &&
      (/\bitems-center\b/.test(line) && /\bjustify-center\b/.test(line) || /\bplace-items-center\b/.test(line)),
  },
  { id: "M1", name: "transition: all", confidence: "check", test: (line) => TRANSITION_ALL.test(line) },
  { id: "M2", name: "Hover lift or scale", confidence: "check", test: (line) => HOVER_LIFT.test(line) },
  { id: "M3", name: "Entrance animation", confidence: "check", test: (line) => ENTRANCE.test(line) },
];

const RULE_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));
const INLINE_ALLOW = /anti-ai-allow:\s*([A-Z]\d+(?:\s*,\s*[A-Z]\d+)*)/;

function snippet(line) {
  const text = line.trim().replace(/\s+/g, " ");
  return text.length > SNIPPET_LENGTH ? `${text.slice(0, SNIPPET_LENGTH - 1)}…` : text;
}

function inlineAllowed(lines, index) {
  const allowed = new Set();
  for (const candidate of [lines[index], lines[index - 1]]) {
    const match = candidate?.match(INLINE_ALLOW);
    if (match) for (const id of match[1].split(",")) allowed.add(id.trim());
  }
  return allowed;
}

// Returns every candidate in one file's text. `allowedInline` marks hits that
// carry an `anti-ai-allow: <ID>` comment on the same line or the line above.
export function scanText(text, file = "<text>") {
  const lines = text.split(/\r?\n/);
  const findings = [];
  const aggregates = new Map();

  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const allowed = inlineAllowed(lines, index);
    for (const rule of RULES) {
      if (rule.aggregate) {
        const count = (line.match(rule.aggregate.pattern) ?? []).length;
        if (!count || allowed.has(rule.id)) continue;
        const entry = aggregates.get(rule.id) ?? { count: 0, line: index + 1 };
        entry.count += count;
        aggregates.set(rule.id, entry);
        continue;
      }
      if (!rule.test(line)) continue;
      findings.push({
        id: rule.id,
        name: rule.name,
        confidence: rule.confidence,
        file,
        line: index + 1,
        snippet: snippet(line),
        allowedInline: allowed.has(rule.id),
      });
    }
  });

  for (const [id, entry] of aggregates) {
    const rule = RULE_BY_ID.get(id);
    if (entry.count < rule.aggregate.threshold) continue;
    findings.push({
      id,
      name: rule.name,
      confidence: rule.confidence,
      file,
      line: entry.line,
      snippet: rule.aggregate.describe(entry.count),
      allowedInline: false,
    });
  }

  return findings.sort((a, b) => a.line - b.line || a.id.localeCompare(b.id));
}

// Reads tell IDs from the first column of the table under
// "## Evidenced Exceptions" in a project's ANTI_AI_STYLE_RULES.md.
export function parseEvidencedExceptions(markdown) {
  const ids = new Set();
  let inSection = false;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (heading) {
      inSection = /^evidenced exceptions$/i.test(heading[2]);
      continue;
    }
    if (!inSection) continue;
    const cell = line.match(/^\s*\|\s*`?([A-Z]\d+)`?\s*\|/);
    if (cell) ids.add(cell[1]);
  }
  return ids;
}

export function collectFiles(targets) {
  const files = [];
  const skipped = [];
  const visit = (target, explicit) => {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isDirectory() && (SKIP_DIRECTORIES.has(entry.name) || entry.name.startsWith("."))) continue;
        if (entry.isDirectory() || entry.isFile()) visit(path.join(target, entry.name), false);
      }
      return;
    }
    if (!stat.isFile()) return;
    const supported = SCAN_EXTENSIONS.has(path.extname(target).toLowerCase());
    if (!explicit && (!supported || SKIP_FILE.test(target))) return;
    if (!supported) {
      skipped.push({ file: target, reason: "unsupported file type" });
      return;
    }
    if (stat.size > MAX_FILE_BYTES) {
      skipped.push({ file: target, reason: "larger than 2 MB" });
      return;
    }
    files.push(target);
  };
  for (const target of targets) visit(target, true);
  return { files, skipped };
}

export function scanPaths(targets, { allow = new Set(), cwd = process.cwd() } = {}) {
  const { files, skipped } = collectFiles(targets);
  const findings = [];
  const allowed = [];
  for (const file of files) {
    const relative = path.relative(cwd, file) || file;
    for (const finding of scanText(fs.readFileSync(file, "utf8"), relative.split(path.sep).join("/"))) {
      const { allowedInline, ...rest } = finding;
      if (allowedInline) allowed.push({ ...rest, allowedBy: "inline" });
      else if (allow.has(finding.id)) allowed.push({ ...rest, allowedBy: "rules" });
      else findings.push(rest);
    }
  }
  const count = (list, confidence) => list.filter((finding) => finding.confidence === confidence).length;
  return {
    scannedFiles: files.length,
    skipped: skipped.map((entry) => ({ ...entry, file: path.relative(cwd, entry.file) || entry.file })),
    counts: { strong: count(findings, "strong"), check: count(findings, "check"), allowed: allowed.length },
    findings,
    allowed,
  };
}

function groupById(findings) {
  const groups = new Map();
  for (const finding of findings) {
    if (!groups.has(finding.id)) groups.set(finding.id, []);
    groups.get(finding.id).push(finding);
  }
  // Catalog order, which is also the order fixes are planned in.
  const order = (id) => RULES.findIndex((rule) => rule.id === id);
  return [...groups.entries()].sort(([a], [b]) => order(a) - order(b));
}

export function formatReport(result, { maxPerRule = 20 } = {}) {
  const { counts, findings, allowed } = result;
  const lines = [
    `anti-ai-style scan: ${result.scannedFiles} files, ${findings.length} candidates (${counts.strong} strong, ${counts.check} check)`,
    "",
    "Candidates, not verdicts. A pattern the product's design evidence shows is not a tell.",
  ];
  for (const [id, group] of groupById(findings)) {
    lines.push("", `${id} ${group[0].name} (${group[0].confidence}): ${group.length}`);
    for (const finding of group.slice(0, maxPerRule)) {
      lines.push(`  ${finding.file}:${finding.line}  ${finding.snippet}`);
    }
    if (group.length > maxPerRule) lines.push(`  … ${group.length - maxPerRule} more (use --json or --max-per-rule)`);
  }
  if (allowed.length) {
    lines.push("", "Allowed (confirm each use sits inside its allowed scope):");
    for (const [id, group] of groupById(allowed)) {
      const byRules = group.filter((finding) => finding.allowedBy === "rules").length;
      const inline = group.length - byRules;
      const parts = [];
      if (byRules) parts.push(`${byRules} by project rules`);
      if (inline) parts.push(`${inline} by inline comment`);
      lines.push(`  ${id} ${group[0].name}: ${parts.join(", ")}`);
    }
  }
  for (const entry of result.skipped) lines.push("", `Skipped ${entry.file}: ${entry.reason}`);
  return lines.join("\n");
}

const USAGE = `Usage: node scan_ai_tells.mjs <path...> [options]

Options:
  --rules <file>        Project ANTI_AI_STYLE_RULES.md; tell IDs listed under
                        "Evidenced Exceptions" are reported as allowed.
  --allow <ID,ID>       Additional tell IDs to report as allowed.
  --json                Print the full result as JSON.
  --strict              Exit 1 when any strong candidate is not allowed.
  --max-per-rule <n>    Lines shown per tell in the text report (default 20).
  --help                Show this message.`;

function parseArguments(argv) {
  const options = { targets: [], allow: new Set(), json: false, strict: false, maxPerRule: 20 };
  const fail = (message) => {
    console.error(`${message}\n\n${USAGE}`);
    process.exit(2);
  };
  const valueOf = (name, index) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) fail(`${name} requires a value.`);
    return value;
  };
  const addIds = (name, value) => {
    for (const id of value.split(",").map((item) => item.trim()).filter(Boolean)) {
      if (!RULE_BY_ID.has(id) && !/^[A-Z]\d+$/.test(id)) fail(`${name}: "${id}" is not a tell ID.`);
      options.allow.add(id);
    }
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (argument === "--json") options.json = true;
    else if (argument === "--strict") options.strict = true;
    else if (argument === "--allow") addIds("--allow", valueOf("--allow", index++));
    else if (argument === "--rules") {
      const file = valueOf("--rules", index++);
      if (!fs.existsSync(file)) fail(`--rules: ${file} does not exist.`);
      for (const id of parseEvidencedExceptions(fs.readFileSync(file, "utf8"))) options.allow.add(id);
    } else if (argument === "--max-per-rule") {
      const value = Number(valueOf("--max-per-rule", index++));
      if (!Number.isInteger(value) || value < 1) fail("--max-per-rule must be a positive integer.");
      options.maxPerRule = value;
    } else if (argument.startsWith("--")) fail(`Unknown option ${argument}.`);
    else options.targets.push(argument);
  }
  if (!options.targets.length) fail("Give at least one file or folder to scan.");
  for (const target of options.targets) {
    if (!fs.existsSync(target)) fail(`${target} does not exist.`);
  }
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = scanPaths(options.targets, { allow: options.allow });
  console.log(options.json ? JSON.stringify(result, null, 2) : formatReport(result, options));
  if (options.strict && result.counts.strong > 0) process.exit(1);
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) main();
