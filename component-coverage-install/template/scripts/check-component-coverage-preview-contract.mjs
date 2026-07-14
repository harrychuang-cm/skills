import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function requireText(source, expected, label) {
  if (!source.includes(expected)) {
    throw new Error(`${label}: missing ${JSON.stringify(expected)}`);
  }
}

const [preview, report, model, styles] = await Promise.all([
  read("src/storybook/component-coverage/CompositionPreview.tsx"),
  read("src/storybook/component-coverage/ReportView.tsx"),
  read("src/storybook/component-coverage/compositionPreviewModel.ts"),
  read("src/storybook/component-coverage/component-coverage.css"),
]);

for (const expected of [
  'reference: "UI Reference"',
  "onClearSelection",
  "onReferenceImageSelect",
  "referenceImages",
  'event.key === "Escape"',
]) {
  requireText(preview, expected, "Composition preview contract");
}

for (const expected of [
  "storyDocsManagerUrl",
  'target="_blank"',
  "尚未選取任何元件",
  "onDraftOverrideChange",
  "requestStorageId",
  "cm-coverage__report-open-state",
  "cm-coverage__report-disclosure",
  "aria-controls={detailId}",
]) {
  requireText(report, expected, "Report view contract");
}

for (const expected of [
  "CompositionPreviewOverride",
  "updateCompositionPreviewOverride",
  "findCompositionBlockNode",
  '"draft-override"',
]) {
  requireText(model, expected, "Preview model contract");
}

for (const expected of [
  ".cm-coverage__composition-canvas-mode",
  ".cm-coverage__composition-reference-image",
  ".cm-coverage__composition-inspector-empty",
  ".cm-coverage__report-entry[data-expanded=\"true\"]",
  ".cm-coverage__report-disclosure",
  "padding: 10px 10px 10px 8px;",
]) {
  requireText(styles, expected, "Preview styles contract");
}

console.log("Component Coverage preview contract check passed.");
