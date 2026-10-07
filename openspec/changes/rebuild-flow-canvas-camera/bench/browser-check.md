# UI Flow 畫布跨瀏覽器檢查（task 4.4）

檢查對象：`create_flow_bench_fixture.mjs` 產生的 fixture，Storybook dev（`storybook dev -p 6142`），Inspector build tag `flow-camera-2026-10-05`，機器 Mac16,1（Apple M4，16 GB），macOS 26（Darwin 25.5.0）。

清單來源：design.md 的 Testing Strategy 手動瀏覽器檢查，加上 `globals=figmaExport:on` 時控制列的可見性。

## Chrome 154.0.8037.95（自動，2026-10-05）

以 Playwright 驅動系統 Chrome（headless），經由真正的 Storybook manager 操作，所以按鍵轉送、側欄快捷鍵與工具列縮放都是 Storybook 自己的行為。輸入走 Chrome 的輸入管線（CDP `Input.dispatch*`），不是在頁面內合成事件。story：`pages-prototypes-bench-growth-fund--default`；figma-export 項目用 `pages-prototypes-example-prototype--default`（bench prototype 沒有 `figmaExport.flowStoryId`，不會顯示 Open Static Flow）。

| 檢查 | 結果 | 觀察值 |
| --- | --- | --- |
| 指標在畫布上 pinch（ctrl+wheel）不放大頁面 | 通過 | 畫布縮放 0.0934 → 0.1260；manager `devicePixelRatio` 1、`visualViewport.scale` 1 |
| 指標在縮放群組上 pinch 不放大頁面 | 通過 | 畫布縮放 0.1260 → 0.1701；preview `visualViewport.scale` 1 |
| Shift+1／Shift+0 不觸發 Storybook | 通過 | Shift+1 後 Fit canvas `aria-pressed="true"`，Shift+0 後縮放為 1；preview 的 window 與 manager 的 `previewKeydown` 都沒有收到 Digit1／Digit0（只收到 Shift 鍵本身，畫布不處理單獨的 Shift） |
| 按 1 仍聚焦 Storybook 側欄 | 通過 | 焦點在畫布時按 1，manager 收到轉送的 Digit1，`document.activeElement` 為 `#storybook-explorer-menu` |
| Tab 聚焦 Zoom in 後按 Space 只放大一格 | 通過 | 由 100% 到 200%，viewport 沒有 `data-pan-mode` |
| 縮放停止後清晰 | 通過 | 縮放期間 world 圖層 `will-change: transform`，靜止後為 `auto` 且沒有 `data-camera-moving` |
| 平移時控制列不動 | 通過 | 相機平移 (-300, -200)，縮放群組與 layout 群組的螢幕位置不變 |
| Storybook 工具列縮放 150% 時拖曳對準指標 | 通過 | iframe 縮放 1.5、畫布縮放 0.0622，螢幕拖曳 120px，world 位移 1286（預期 1286.33） |
| `figmaExport:on`，匯出工作區、review 與留言面板都展開時，縮放群組與 layout 群組完整可見且可點擊 | 通過 | 七個控制項都在視窗內，中心與四邊中點的命中元素都是控制項本身；縮放群組在留言面板開啟時移到左上；flow 根節點寬 796px，工作區從 x = 796 開始；以指標點擊 Zoom in，36% → 50% |
| `figmaExport:on` 且工作區收合時，畫布保持完整寬度、控制列不被遮住 | 通過 | 收合後工作區只剩右下角 92px 寬的按鈕；flow 根節點寬度等於視窗寬度 1300px；縮放群組在左上、layout 群組在左下，七個控制項的中心與左右邊緣都命中控制項本身（2026-10-06 補測，見下方說明） |
| 頁面沒有錯誤 | 通過 | 沒有 `pageerror` |

2026-10-06 使用者回報：工作區收合後，UI Flow 畫布右側被切掉。原因是寬度上限只看 html 的「工作區開啟」標記，收合時仍會扣掉 344px。已改為只在工作區展開時設上限，並把控制列移到左側，避開 addon 固定在右側的留言按鈕與收合按鈕。另外，在 UI Flow 中關閉 Figma export 不會移除工作區，因為 UI Flow 模式下 addon 不會執行；這由後續的 `add-anchored-visual-comments` 處理。

figma-export 項目第一次執行時失敗：addon 0.13.0 縮窄 `#storybook-root` 的規則讀不到只定義在 `.sbfx-workspace` 上的尺寸變數，工作區蓋住了畫布右側與 layout 群組。Inspector 已在工作區開啟時自行為 flow 根節點設寬度／高度上限（見 design.md Risks），上表是修正後的結果。

注意：直接以 `globals=prototypeMode:flow;figmaExport:on` 開啟時，Inspector 的 UI Flow 不會呼叫 story，addon 的 decorator 不執行，所以不會出現匯出工作區；工作區只有在 Story 模式開啟後切換到 UI Flow 時才會與畫布同時出現，上表即依此流程檢查。

## Safari（手動，待使用者回報）

| 檢查 | 結果 | 備註 |
| --- | --- | --- |
| 觸控板在畫布上 pinch 不放大頁面 | 待回報 | |
| 觸控板在縮放群組上 pinch 不放大頁面 | 待回報 | |
| Shift+1／Shift+0 不觸發 Storybook | 待回報 | |
| 按 1 仍聚焦 Storybook 側欄 | 待回報 | |
| Tab 聚焦 Zoom in 後按 Space 只放大一格 | 待回報 | Safari 需在「設定 → 進階」開啟「按 Tab 鍵以反白顯示網頁上的每個項目」 |
| 縮放停止後清晰 | 待回報 | |
| 平移時控制列不動 | 待回報 | |
| 工具列縮放 150% 時拖曳對準指標 | 待回報 | |
| `figmaExport:on` 時控制列完整可見且可點擊 | 待回報 | |

## Firefox（手動，待使用者回報）

這台機器目前沒有安裝 Firefox，需要先安裝。

| 檢查 | 結果 | 備註 |
| --- | --- | --- |
| 觸控板在畫布上 pinch 不放大頁面 | 待回報 | |
| 觸控板在縮放群組上 pinch 不放大頁面 | 待回報 | |
| Shift+1／Shift+0 不觸發 Storybook | 待回報 | |
| 按 1 仍聚焦 Storybook 側欄 | 待回報 | |
| Tab 聚焦 Zoom in 後按 Space 只放大一格 | 待回報 | |
| 縮放停止後清晰 | 待回報 | |
| 平移時控制列不動 | 待回報 | |
| 工具列縮放 150% 時拖曳對準指標 | 待回報 | |
| `figmaExport:on` 時控制列完整可見且可點擊 | 待回報 | |
