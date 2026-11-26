// Interface language: one message catalog, two languages, identical keys.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { ADDON_ROOT, addon, loadPostcss, makeWorkspace } from "./helpers.mjs";

const { zhHant } = await addon("shared/messages.zh-Hant.ts");
const { en } = await addon("shared/messages.en.ts");
const i18n = await addon("shared/i18n.ts");
const { buildIndex, serializeIndex } = await addon("server/index-builder.mjs");
const { ERROR_CODES } = await addon("shared/api-contract.mjs");
const postcss = await loadPostcss();

function sources(extensions) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(full);
    }
  };
  walk(ADDON_ROOT);
  return out.sort();
}

const isCatalog = (file) => /messages\.[A-Za-z-]+\.(?:ts|mjs)$/.test(file);
const CJK = /[　-〿㐀-鿿豈-﫿＀-￯]/;
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("the two catalogs have identical key sets and the same placeholders per message", () => {
  const zhKeys = Object.keys(zhHant).sort();
  const enKeys = Object.keys(en).sort();
  assert.ok(zhKeys.length > 250, `${zhKeys.length} keys`);
  assert.deepEqual(enKeys.filter((k) => !(k in zhHant)), [], "keys only in English");
  assert.deepEqual(zhKeys.filter((k) => !(k in en)), [], "keys only in Traditional Chinese");
  assert.deepEqual(i18n.messageKeys("en"), i18n.messageKeys("zh-Hant"));
  for (const key of zhKeys) {
    assert.deepEqual(placeholders(en[key]), placeholders(zhHant[key]), `placeholders of ${key}`);
    assert.ok(en[key].trim() !== "" && zhHant[key].trim() !== "", `${key} is not empty`);
    assert.ok(!CJK.test(en[key]), `the English text of ${key} has no CJK characters`);
  }
});

test("outside the catalogs, the template has no CJK text in any string", () => {
  const offenders = [];
  for (const file of sources([".ts", ".tsx", ".mjs", ".js"])) {
    if (isCatalog(file)) continue;
    // Comments may be written in any language; strings and JSX text may not.
    const code = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    code.split("\n").forEach((line, i) => {
      if (CJK.test(line)) offenders.push(`${path.relative(ADDON_ROOT, file)}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test("every message key the code uses exists, including the families built from codes", () => {
  const used = new Set();
  const families = new Set();
  for (const file of sources([".ts", ".tsx"])) {
    if (isCatalog(file)) continue;
    const code = fs.readFileSync(file, "utf8");
    for (const m of code.matchAll(/\bt(?:Maybe)?\(\s*"([A-Za-z0-9_.-]+)"/g)) used.add(m[1]);
    for (const m of code.matchAll(/\btCode\(\s*"([A-Za-z0-9_.-]+)",[^,]+,\s*"([A-Za-z0-9_.-]+)"/g)) {
      families.add(m[1]);
      used.add(m[2]);
    }
    // Keys carried as data (preview statuses, verification reasons) and chosen by a condition.
    for (const m of code.matchAll(/"((?:draft\.message|verify\.reason|verify|report|postApply)\.[A-Za-z0-9_.-]+)"/g)) used.add(m[1]);
    for (const m of code.matchAll(/\bt(?:Maybe)?\(\s*`([a-z][A-Za-z0-9_.-]*)\.\$\{/g)) families.add(m[1]);
  }
  const missing = [...used].filter((key) => !(key in zhHant)).sort();
  assert.deepEqual(missing, []);
  for (const family of families) assert.ok(Object.keys(zhHant).some((key) => key.startsWith(`${family}.`)), `the catalog has messages for ${family}.*`);

  // Server refusal codes are translated by the catalog, not by the server.
  for (const code of Object.keys(ERROR_CODES)) assert.ok(`error.${code}` in zhHant, `error.${code}`);
  // Every reason the tracer can give, every scope and every status has words.
  for (const key of [
    ...["no-declaration", "inherited-default", "inherited-other-component", "inherited-outside", "inline-style", "presentation-attribute", "animated", "unknown-source", "identity-mismatch", "uncertain-condition", "important", "structural", "unsupported-shorthand", "unsupported-value", "unsupported-writing-mode", "duplicate-declaration", "var-with-fallback", "reference-list", "slash-value", "expression", "reset-by-shorthand", "keyword", "raw-value", "scoped-override"].map((r) => `readonly.${r}`),
    ...["declaration", "component-token", "system-token"].map((s) => `scope.${s}`),
    ...["file-not-writable", "token-editing-disabled", "tier-not-writable", "duplicate-token", "not-single-alias", "token-shadowed"].map((r) => `scope.reason.${r}`),
    ...["previewing", "no-visible-effect", "in-source", "conflict", "pending-load", "paused"].map((s) => `draft.status.${s}`),
    ...["verified", "written-not-observable", "mismatch", "timeout"].flatMap((s) => [`report.apply.${s}`, `report.undo.${s}`, `verify.item.${s}`]),
    ...["docs", "figma-export", "prototype-mode", "story-error", "index-unavailable", "read-only-server", "manager-framed", "unsupported-browser"].map((r) => `suspend.${r}`),
    ...["popover", "adopted-stylesheets", "constructable-stylesheets", "web-crypto", "elements-from-point", "get-animations"].map((c) => `capability.${c}`),
    ...["row-not-found", "row-not-unique", "second-cell-mismatch", "no-spec-file", "spec-unreadable", "no-contract-heading", "contract-heading-not-unique", "declaration-not-documented", "comment-on-rewritten-line", "mentions-old-name", "system-token-changed", "too-many-entries"].map((r) => `pending.reason.${r}`),
    ...["same-component", "other-component", "outside"].map((k) => `inherit.${k}`),
    ...["awaiting-confirmation", "preparing", "running", "checking", "imported", "needs-decision", "rejected", "failed", "denied", "cancelled", "interrupted"].map((s) => `agent.state.${s}`),
  ]) {
    assert.ok(key in zhHant, key);
  }

  // Every reason an AI run or its readiness can give (written `code: "…"` in the agent server) has words.
  const agentDir = path.join(ADDON_ROOT, "server", "agent");
  const agentReasons = new Set(["confirmation-denied", "confirmation-timeout"]);
  for (const file of fs.readdirSync(agentDir).filter((name) => name.endsWith(".mjs"))) {
    for (const m of fs.readFileSync(path.join(agentDir, file), "utf8").matchAll(/\bcode: "([a-z0-9-]+)"/g)) agentReasons.add(m[1]);
  }
  assert.ok(agentReasons.size > 30, "the agent server's reason codes were found");
  for (const code of agentReasons) assert.ok(`agent.reason.${code}` in zhHant, `agent.reason.${code}`);
});

test("the language follows the binding's locale, then the browser language, then English", () => {
  assert.equal(i18n.resolveLocale("en", "zh-TW"), "en", "the binding wins over the browser");
  assert.equal(i18n.resolveLocale("zh-Hant", "en-US"), "zh-Hant");
  assert.equal(i18n.resolveLocale(null, "zh-TW"), "zh-Hant");
  assert.equal(i18n.resolveLocale(undefined, "zh-CN"), "zh-Hant", "any Chinese browser language gets the Chinese catalog");
  assert.equal(i18n.resolveLocale(null, "ja-JP"), "en");
  assert.equal(i18n.resolveLocale(null, null), "en");
  assert.equal(i18n.resolveLocale("fr", "zh-TW"), "zh-Hant", "an unknown binding value is ignored");

  // Start from a known language whatever this process's own locale is.
  i18n.applyBindingLocale("zh-Hant");
  let changes = 0;
  const off = i18n.onLocaleChange(() => {
    changes += 1;
  });
  assert.equal(i18n.applyBindingLocale("en"), true);
  assert.equal(i18n.getLocale(), "en");
  assert.equal(i18n.t("changes.previewOnly", { count: 3 }), "Preview only · 3 change(s) not written to files yet");
  assert.equal(i18n.t("scope.writesMirror", { file: "a.css", line: 4, mirror: "b.css" }), "Writes a.css:4 (+ mirror b.css)");
  assert.equal(i18n.tMaybe("error.mirror-drift"), en["error.mirror-drift"]);
  assert.equal(i18n.tMaybe("error.no-such-code"), null);
  assert.equal(i18n.tCode("error", "no-such-code", "error.unknown"), "An error occurred (no-such-code).");
  assert.equal(i18n.applyBindingLocale("en"), false, "no change, no notification");
  assert.equal(i18n.applyBindingLocale("zh-Hant"), true);
  assert.equal(i18n.t("changes.previewOnly", { count: 3 }), "預覽中 · 3 項變更尚未寫入檔案");
  assert.equal(i18n.t("report.apply.verified"), "已寫入並驗證");
  assert.equal(i18n.t("row.original", {}), "原本：", "a missing parameter renders as empty, never as undefined");
  assert.equal(changes, 2);
  off();
});

test("the binding's locale reaches the page through the index", async () => {
  const english = await makeWorkspace({ fixture: "v1", config: { locale: "en" } });
  assert.equal(serializeIndex(buildIndex({ config: english.config, postcss }), english.config).locale, "en");
  const unset = await makeWorkspace({ fixture: "v1" });
  assert.equal(serializeIndex(buildIndex({ config: unset.config, postcss }), unset.config).locale, null);
});

test("the approval dialog's texts have the same keys in both languages", async () => {
  const { CONFIRM_TEXT } = await addon("server/agent/messages.confirm.mjs");
  assert.deepEqual(Object.keys(CONFIRM_TEXT).sort(), ["en", "zh-Hant"]);
  assert.deepEqual(Object.keys(CONFIRM_TEXT.en).sort(), Object.keys(CONFIRM_TEXT["zh-Hant"]).sort());
});
