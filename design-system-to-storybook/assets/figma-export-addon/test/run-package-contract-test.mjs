#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const addonRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(addonRoot, "package.json"), "utf8"),
);
const expectedExports = {
  ".": {
    types: "./dist/index.d.ts",
    default: "./dist/index.js",
  },
  "./preview": {
    types: "./dist/preview.d.ts",
    default: "./dist/preview.js",
  },
  "./preset": {
    types: "./dist/preset.d.ts",
    default: "./dist/preset.js",
  },
  "./manager": {
    types: "./dist/manager.d.ts",
    default: "./dist/manager.js",
  },
  "./review": {
    types: "./dist/review.d.ts",
    default: "./dist/review.js",
  },
  "./review-server": {
    types: "./dist/review-server.d.ts",
    default: "./dist/review-server.js",
  },
  "./source": {
    types: "./dist/source.d.ts",
    default: "./dist/source.js",
  },
  "./visual-comment-store": {
    types: "./dist/visual-comment-store.d.ts",
    default: "./dist/visual-comment-store.js",
  },
  "./visual-comment-report": {
    types: "./dist/visual-comment-report.d.ts",
    default: "./dist/visual-comment-report.js",
  },
  "./styles.css": "./dist/figma-code-exporter.css",
  "./review.css": "./dist/review.css",
  "./package.json": "./package.json",
};

assert.equal(
  packageJson.name,
  "@harrychuang/storybook-addon-figma-export",
  "published package name must remain stable",
);
assert.match(packageJson.version, /^\d+\.\d+\.\d+$/, "package version must be semver");
assert.deepEqual(
  packageJson.exports,
  expectedExports,
  "public export map must remain backward compatible",
);
assert.equal(
  packageJson.peerDependenciesMeta?.react?.optional,
  true,
  "React must be an optional peer",
);
assert.equal(
  packageJson.peerDependenciesMeta?.["react-dom"]?.optional,
  true,
  "React DOM must be an optional peer",
);

const preview = await import("@harrychuang/storybook-addon-figma-export/preview");
const review = await import("@harrychuang/storybook-addon-figma-export/review");
const reviewServer = await import(
  "@harrychuang/storybook-addon-figma-export/review-server"
);
const source = await import("@harrychuang/storybook-addon-figma-export/source");
assert.equal(typeof preview.createFigmaExportDecorator, "function");
assert.equal(typeof review.createFigmaExportReviewDecorator, "function");
assert.equal(typeof reviewServer.createFigmaReviewStatusPlugin, "function");
assert.equal(typeof source.getFigmaSourceUrl, "function");

// Self-registered review decorator: Storybook applies the preview entry's
// decorators from the addons list; the review entry registers through the
// global symbol registry because each entry is bundled separately.
assert.equal(typeof review.configureFigmaExportReview, "function");
assert.ok(
  Array.isArray(preview.decorators) && preview.decorators.length === 1,
  "the preview entry exports exactly one decorator",
);
assert.equal(preview.decorators[0], preview.figmaExportHostDecorator);
const storyResult = { story: "result" };
assert.equal(
  preview.figmaExportHostDecorator(() => storyResult, { id: "demo--story" }),
  storyResult,
  "without configureFigmaExportReview the host decorator passes the story through",
);
review.configureFigmaExportReview({ storyTitlePrefix: false }, {});
const legacyDecorator = review.createFigmaExportReviewDecorator({ storyTitlePrefix: false });
assert.equal(
  preview.figmaExportHostDecorator(
    () => legacyDecorator(() => storyResult, { id: "demo--story" }),
    { id: "demo--story", globals: { figmaExport: "on" } },
  ),
  storyResult,
  "a legacy decorator inside a host render returns the story result unchanged",
);
const previewBundle = fs.readFileSync(path.join(addonRoot, "dist", "preview.js"), "utf8");
const previewImports = [
  ...previewBundle.matchAll(/^import\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/gm),
].map((match) => match[1]);
for (const specifier of previewImports) {
  assert.ok(
    !/^react(?:-dom)?(?:\/|$)/.test(specifier) && !/review/.test(specifier),
    `dist/preview.js must not import ${specifier}`,
  );
}

// Option types added for consumers must reach the published declarations.
const publishedDeclarations = fs
  .readdirSync(path.join(addonRoot, "dist"))
  .filter((file) => file.endsWith(".d.ts"))
  .map((file) => fs.readFileSync(path.join(addonRoot, "dist", file), "utf8"))
  .join("\n");
assert.match(
  publishedDeclarations,
  /shortcuts\?: boolean/,
  "visualComments.shortcuts is part of the published option types",
);

for (const renderer of ["react", "vue"]) {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(addonRoot, "test", "fixtures", renderer, "package.json"),
      "utf8",
    ),
  );
  const declared = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
  };
  if (renderer === "react") {
    assert.ok(declared.react, "React upgrade fixture must retain React");
    assert.ok(declared["react-dom"], "React upgrade fixture must retain React DOM");
  } else {
    assert.equal(declared.react, undefined, "Vue fixture must not declare React");
    assert.equal(
      declared["react-dom"],
      undefined,
      "Vue fixture must not declare React DOM",
    );
  }
}

const packResult = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["pack", "--dry-run", "--json"],
  {
    cwd: addonRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NPM_CONFIG_CACHE:
        process.env.NPM_CONFIG_CACHE ??
        path.join(process.env.TMPDIR || "/tmp", "sbfx-package-contract-cache"),
    },
  },
);
assert.equal(
  packResult.status,
  0,
  `npm pack --dry-run failed:\n${packResult.stderr}`,
);
const packReport = JSON.parse(packResult.stdout);
const packedFiles = new Set(packReport[0]?.files?.map((entry) => entry.path));
for (const requiredFile of [
  "README.md",
  "package.json",
  "dist/index.js",
  "dist/preview.js",
  "dist/review.js",
  "dist/review-server.js",
  "dist/figma-code-exporter.css",
]) {
  assert.ok(packedFiles.has(requiredFile), `packed addon is missing ${requiredFile}`);
}

console.log(
  `package contract checks passed (${packageJson.name}@${packageJson.version}, ${packedFiles.size} files)`,
);
