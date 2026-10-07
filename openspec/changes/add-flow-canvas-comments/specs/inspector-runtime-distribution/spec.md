## ADDED Requirements

### Requirement: Installer orders the inspector preset after the figma-export addon

`install_prototype_inspector.mjs` SHALL insert the inspector preset entry immediately after the `@harrychuang/storybook-addon-figma-export` entry when the Storybook main config's `addons` list contains it, and at the start of the list otherwise. When an existing main config lists the inspector preset before that addon, the installer SHALL move the inspector preset entry to immediately after the addon entry and SHALL print a line saying it reordered the addons so figma-export review runs in every Inspector mode. A main config that already lists the inspector preset after the addon SHALL be left unchanged.

#### Scenario: Installing into a project that uses the figma-export addon

- **WHEN** the installer runs on a main config whose `addons` are `["@storybook/addon-docs", "@harrychuang/storybook-addon-figma-export"]`
- **THEN** the resulting `addons` list ends with the figma-export addon followed by the inspector preset entry

#### Scenario: Repairing an inverted order

- **WHEN** the installer runs on a main config that lists the inspector preset entry before `@harrychuang/storybook-addon-figma-export`
- **THEN** the inspector preset entry is moved to immediately after the addon entry and the installer prints the reorder line

##### Example: addon order outcomes

| addons before | addons after |
| ----- | ----- |
| docs, figma-export | docs, figma-export, inspector |
| docs | inspector, docs |
| inspector, docs, figma-export | docs, figma-export, inspector |
| docs, figma-export, inspector | unchanged |
