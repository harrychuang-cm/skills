# Vendored figma-export addon

這是 `@harrychuang/storybook-addon-figma-export`(來源:`github:harrychuang/storybook-addons#main`)的 **vendored 修正版**,
包含原本由 `scripts/patch-figma-export-addon.mjs` + `patch-figma-export-component-import.mjs`
needle-patch 機制累積的所有修補,以及後續直接在此維護的修正(例如 2026-06 的
borderSides 單邊框線 / auto layout 結構修復)。

## 運作方式

`npm install` 的 postinstall(`scripts/patch-figma-export-addon.mjs`)會把這個目錄
**整份覆蓋**到 `node_modules/storybook-addons/packages/figma-export/`,並清除
`node_modules/.cache/storybook`,確保 Storybook 重新 bundle。

## 修改流程

1. 直接編輯 `vendor/figma-export/src/`
2. 在此目錄重建 dist:
   ```sh
   cd vendor/figma-export
   npm install --no-save tsup typescript   # 第一次需要
   npx tsup                                # DTS build 失敗是已知狀況,ESM 成功即可
   ```
3. 跑 `node scripts/patch-figma-export-addon.mjs` 同步到 node_modules(或重跑 `npm install`)
4. 重啟 Storybook

## 注意

- 不要再直接編輯 `node_modules` 內的 addon —— 會在下次 postinstall 被覆蓋。
- 長期而言建議把這份內容 sync 回 `harrychuang/storybook-addons` repo,
  讓 GitHub main 重新成為單一事實來源,屆時這個 vendor 目錄即可移除。
