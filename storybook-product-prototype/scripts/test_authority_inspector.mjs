import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
// Run in the skill source checkout after installing the existing Storybook template dependencies.
// Optional first argument: directory for inspectable SSR HTML artifacts.
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(`${root}/design-system-to-storybook/storybook-template/package.json`);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
// preview.js imports its shared pure helpers from flow-canvas-geometry.js; load that module natively and
// hand its exports to the vm in place of the stripped import.
const geometry = await import(new URL('../assets/prototype-inspector/flow-canvas-geometry.js', import.meta.url));
// The Components mode also needs flow-canvas.js helpers (rendered the way test_flow_canvas_ssr.mjs does)
// and the review fingerprint module.
const helper = await import(new URL('../assets/prototype-flow-layout/prototypeFlowLayout.ts', import.meta.url));
const { computeFingerprint } = await import(new URL('../assets/prototype-review/fingerprint.mjs', import.meta.url));
const flowCode = fs.readFileSync(`${root}/storybook-product-prototype/assets/prototype-inspector/flow-canvas.js`, 'utf8')
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace(/^export (function|const) /gm, '$1 ');
const flowContext = vm.createContext({ ...React, ...geometry, ...helper, console, URL, Date, JSON, Set, Map, UPDATE_GLOBALS: 'UPDATE_GLOBALS', addons: { getChannel: () => ({ emit() {} }) } });
vm.runInContext(`${flowCode}\nglobalThis.flowApi = { createStorybookGlobals, getPrototypeViewport, getRoutePreviewSource, openPrototypeExternalUrl, PrototypeFlow };`, flowContext);
const original = fs.readFileSync(`${root}/storybook-product-prototype/assets/prototype-inspector/preview.js`, 'utf8');
const code = original.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export const /gm, 'const ');
const context = vm.createContext({ ...React, ...geometry, ...flowContext.flowApi, computeFingerprint, console, URL, Date, JSON, Set, Map, UPDATE_GLOBALS: 'UPDATE_GLOBALS', addons: {} });
vm.runInContext(`${code}\nglobalThis.testApi = { readPrototypeDataAuthority, PrototypeData, PrototypeDocs, PrototypeComponents, decorators };`, context);
const { readPrototypeDataAuthority, PrototypeData, PrototypeDocs, PrototypeComponents, decorators } = context.testApi;
const source = { reference: 'docs/api.yaml#/AlertPage', revision: 'abc123', confirmedBy: 'Alerts RD', confirmedOn: '2026-09-14' };
const row = { group: 'rows', values: 'fake', schemaScope: 'ui-model', status: 'proposed', source: null, owner: 'Product team' };
const registry = (fixture = row, contracts = []) => ({ schemaVersion: 1, fixtures: [fixture], contracts });
const markdown = value => `# Data Spec\n\n## Data Authority\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n\n## Data Schemas (JSON Schema)\n\`\`\`json\n{"type":"object"}\n\`\`\`\n`;
const artifacts = process.argv[2];
if (artifacts) fs.mkdirSync(artifacts, { recursive: true });
const cases = [
  ['fake-only', markdown(registry()), true, ['FAKE', 'UI model proposed', 'No real contracts are provided']],
  ['confirmed-ui', markdown(registry({ ...row, status: 'confirmed', source })), true, ['UI model confirmed — no transport authority', 'abc123']],
  ['confirmed-transport', markdown(registry({ ...row, schemaScope: 'transport', status: 'confirmed', source })), true, ['Transport schema confirmed', 'FAKE', 'Alerts RD']],
  ['independent-api', markdown(registry({ ...row, contractId: 'alerts-api' }, [{ id: 'alerts-api', kind: 'api', status: 'confirmed', source, owner: 'Alerts RD' }])), true, ['UI model proposed', 'alerts-api', 'docs/api.yaml#/AlertPage', 'confirmed']],
  ['legacy', '# Data Spec\n\n## Fixture Inventory\nrows', false, ['Data authority unverified', 'FAKE']],
  ['malformed', '## Data Authority\n```json\n{"schemaVersion":\n```', false, ['malformed JSON', 'Data authority unverified']],
  ['unsupported-confirmation', markdown(registry({ ...row, status: 'confirmed' })), false, ['incomplete confirmation evidence', 'Data authority unverified']],
  ['duplicate-group', markdown({ schemaVersion: 1, fixtures: [row, row], contracts: [] }), false, ['duplicate group', 'Data authority unverified']],
  ['unknown-contract', markdown(registry({ ...row, contractId: 'missing' })), false, ['unknown contract id', 'Data authority unverified']],
  ['duplicate-section', markdown(registry()) + markdown(registry()), false, ['exactly one complete JSON block', 'Data authority unverified']],
  ['missing-fake', markdown(registry({ ...row, values: 'real' })), false, ['invalid fields', 'Data authority unverified']],
  ['duplicate-json-key', '## Data Authority\n```json\n{"schemaVersion":2,"schemaVersion":1,"fixtures":[],"contracts":[]}\n```', false, ['duplicate keys', 'Data authority unverified']],
  ['placeholder-owner', markdown(registry({ ...row, owner: '[Team]' })), false, ['invalid fields', 'Data authority unverified']],
  ['unknown-source', markdown(registry({ ...row, status: 'confirmed', source: { ...source, reference: 'unknown' } })), false, ['incomplete confirmation evidence', 'Data authority unverified']],
  ['bad-source-date', markdown(registry({ ...row, status: 'confirmed', source: { ...source, confirmedOn: '2026-02-30' } })), false, ['incomplete confirmation evidence', 'Data authority unverified']],
];
for (const [name, doc, expectedValid, expected] of cases) {
  assert.equal(readPrototypeDataAuthority(doc).valid, expectedValid, name);
  const prototype = { id: 'authority-review', flow: { routes: [] }, docs: { dataSpec: doc }, data: { overview: { status: 'confirmed by obsolete metadata' }, fixtures: { rows: 2 }, apiContracts: [{ method: 'GET', endpoint: '/example' }] } };
  const html = renderToStaticMarkup(React.createElement(PrototypeData, { prototype }));
  for (const phrase of expected) assert.ok(html.includes(phrase), `${name}: missing ${phrase}`);
  assert.ok(html.includes('API Replacement Requirements'), name);
  assert.ok(!html.includes('<dd>confirmed by obsolete metadata</dd>'), name);
  if (!expectedValid) assert.ok(!html.includes('<td>Transport schema confirmed</td>'), name);
  if (artifacts) fs.writeFileSync(`${artifacts}/${name}.html`, html);
}
// Docs, Components and Data decline figma-export comments and export on their
// root element; Story mode renders the story untouched.
const modeRoot = (html, mode) => html.match(new RegExp(`<div class="prototype-inspector prototype-inspector--${mode}"[^>]*>`))?.[0] ?? '';
const declaringPrototype = { id: 'declarations', title: 'Declarations', flow: { routes: [{ id: 'home', title: 'Home' }] }, docs: { prd: '# PRD\n\nGoal.' }, data: {} };
for (const [mode, component] of [['docs', PrototypeDocs], ['components', PrototypeComponents], ['data', PrototypeData]]) {
  const root = modeRoot(renderToStaticMarkup(React.createElement(component, { prototype: declaringPrototype })), mode);
  assert.ok(root, `${mode}: root rendered`);
  assert.match(root, /data-sbfx-export="unavailable"/, `${mode}: declines Figma export`);
  assert.match(root, /data-sbfx-comments="unavailable"/, `${mode}: declines comments`);
}
const emptyDocs = renderToStaticMarkup(React.createElement(PrototypeDocs, { prototype: { ...declaringPrototype, docs: {} } }));
assert.match(emptyDocs, /data-sbfx-comments="unavailable"/, 'docs without documents still declines comments');
const storyMarkup = renderToStaticMarkup(decorators[0](() => React.createElement('main', { id: 'story' }, 'Story'), { globals: { prototypeMode: 'story' }, parameters: { prototype: declaringPrototype } }));
assert.equal(storyMarkup, '<main id="story">Story</main>', 'story mode renders the story unchanged');
assert.doesNotMatch(storyMarkup, /data-sbfx-/, 'story mode adds no figma-export declarations');

const exampleBefore = '```md\n## Data Authority\n```\n' + markdown(registry());
assert.equal(readPrototypeDataAuthority(exampleBefore).valid, true, 'heading inside example ignored');
assert.equal(fs.readFileSync(`${root}/design-system-to-storybook/storybook-template/.storybook/prototype-inspector/preview.js`, 'utf8'), original, 'runtime source parity');
console.log(`PASS ${cases.length} actual React server renders + mode comment declarations + fenced-heading parser + runtime parity${artifacts ? `; artifacts: ${artifacts}` : ''}`);
