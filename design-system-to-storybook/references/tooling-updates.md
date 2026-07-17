# Tool Distribution And Updates

Use this reference when the user asks to update this skill or its bundled tools (the Figma export addon or the Storybook Code To Design importer), when `install_figma_export_addon.mjs --check` reports an update or a legacy layout, when a version badge looks stale, or when the user asks how tool updates work. Always end such a pass by telling the user what changed, in their language.

## Distribution Model

The two tools ship inside this skill but update on different layers. Keep the three layers separate when explaining or executing an update:

| Layer | What lives there | Update action | Frequency |
|---|---|---|---|
| Machine (skill + importer) | the skills repo checkout and the installed skill copy (for example `~/.claude/skills/design-system-to-storybook/`) | `git pull` the skills repo, then `install_agent_skill.mjs --agent <agent> --scope user --force` | each time a new tool version ships |
| Project (export addon) | `.storybook/vendor/harrychuang-storybook-addon-figma-export-<version>.tgz` plus the `file:` devDependency | re-run `install_figma_export_addon.mjs`, then commit the tarball, `package.json`, and lockfile | once per product repo per release |
| Figma (importer) | dev plugin loaded from the central manifest `design-system-to-storybook/assets/figma-plugin-code-to-design/manifest.json` | none after the first import — `git pull` refreshes the runtime because Figma re-reads it on every run | Figma import happens once per machine, ever |

The export addon is a per-project dependency, so every product repo upgrades explicitly and the upgrade is visible in that repo's git history. The importer is machine-level Figma tooling and must not be copied into product repos (see the Figma Import Plugin Gate).

## Update Journey For An Existing Skill User

Run these in order when helping a developer catch up to the latest tools:

1. **Machine.** In the skills repo checkout: `git pull`, then refresh the installed skill copy:

   ```sh
   node design-system-to-storybook/scripts/install_agent_skill.mjs --agent claude --scope user --force
   ```

   Use the matching `--agent` value when the developer also uses Codex or Cursor. After this step the machine has the newest addon asset, importer runtime, and installers.

2. **Export addon, in each product repo that uses it.**

   ```sh
   node <skill-root>/scripts/install_figma_export_addon.mjs <product-repo-root> --check
   node <skill-root>/scripts/install_figma_export_addon.mjs <product-repo-root>
   ```

   `--check` exit codes: 0 up to date, 2 not installed, 3 update available or legacy copied-directory layout. The plain run upgrades in place: it packs the new versioned tarball, updates the `file:` spec, prunes superseded tarballs, and migrates the legacy directory layout to `figma-export-addon-legacy-backup`. Then commit the tarball, `package.json`, and the lockfile — teammates and CI pick the upgrade up through `git pull` plus their normal package-manager install, with no skill required.

3. **Importer, once per machine.** If the developer's Figma still loads an old per-repo manifest (or has never loaded the plugin), import the central manifest once in Figma Desktop: `Plugins > Development > Import plugin from manifest...` and select the skills repo checkout path above. After that, importer updates are `git pull` only — no re-import. `install_figma_import_plugin.mjs [product-repo-root]` re-prints the version, manifest path, and setup steps, and flags legacy per-repo copies that can be deleted.

Template workspaces (created from the bundled `storybook-template`) are the exception: they stay self-contained. Their addon updates through the template's vendored copy plus `postinstall` patch script, and their bundled importer manifest stays valid.

## Version Visibility

Point the user at these instead of guessing:

- **Export addon:** the Storybook overlay title shows a `v<version>` badge (visible even when collapsed) and the overlay root carries `data-version`; `--check` prints bundled vs installed versions.
- **Importer:** the plugin UI shows a `build <version>` badge; the importer script's central mode prints the package version and the runtime stamp and warns when they drift.
- Versions are stamped automatically — the addon's from its `package.json` via the tsup `define`, the importer's via its `prebuild` stamp script. Never hand-edit `PLUGIN_VERSION`, the UI badge, or a built `dist/` version string; bump the tool's `package.json` and rebuild instead.

## What To Tell The User After An Update

Report, in the user's language:

- which layers were touched and the version change per tool (for example "export addon 0.1.0 → 0.2.0, importer already at 1.2.1")
- per-project: that the tarball, `package.json`, and lockfile need to be committed, and that teammates only need `git pull` plus install
- machine: that other machines repeat the `git pull` + `install_agent_skill.mjs --force` step
- Figma: whether a one-time manifest re-import applies (only when switching from an old per-repo manifest to the central one)
- how to self-check later: the version badges and `--check`

## Maintainer Release Flow

When shipping a new tool version through this skill:

1. Edit the tool under `assets/` (`figma-export-addon/src/` or `figma-plugin-code-to-design/`).
2. Bump that tool's `package.json` version — installers and stamps key off it; never ship changed `dist/` or runtime output without a bump.
3. Rebuild: `npm run build` in the tool directory (the addon injects its version via tsup; the importer's `prebuild` stamps `code.ts` and `ui.html`).
4. Run the tool's tests (`test/run-*.mjs` for the addon, `test/verify-*.cjs` for the importer).
5. Sync the template copies: the addon into `storybook-template/vendor/figma-export/` and `storybook-template/.storybook/vendor/figma-export-addon/`; the importer runtime into `storybook-template/figma/storybook-code-to-design/` (`main.js` is the built `code.js`, plus `ui.html`).
6. Commit and push the skills repo, then follow the update journey above on each machine.

If the company later gains Figma Organization private publishing, the importer's distribution can move there: publish the plugin to the organization, replace the central-manifest instructions with the organization install page, and keep everything else (version stamping, gates, addon flow) unchanged.
