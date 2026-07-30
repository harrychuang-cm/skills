## Problem

匯入時若字型無法載入，外掛會 fallback 到 CSS 堆疊的下一個家族，但使用者實際上察覺不到 —— 匯入結果看起來是成功的，字型卻是替換過的。對一個以「Storybook story 一比一還原到 Figma」為目標的工具，這等同於靜默產出錯誤結果。

2026-07-29 的實際案例：日文 Text Link story 匯入後，`こちら` 應為 Hiragino Kaku Gothic ProN，實際卻是 Noto Sans JP Bold；本文應為 Hiragino Mincho ProN，實際為 Noto Serif JP Regular。四個文字節點全數被替換，但外掛狀態顯示匯入成功，使用者判定「看起來正常」。實際字型是後續以 Figma MCP 讀取節點才確認的。

三個具體缺口：

- 替換訊息與其他警告混在同一個高度上限 88px 的可捲動小字區，四個文字節點就產生 8 條訊息，替換這件事沒有任何高於一般警告的顯著性。
- 訊息指向錯誤的方向。當時的訊息是「Hiragino Kaku Gothic ProN was unavailable」，但真正原因是 Figma 本機字型檔服務（`127.0.0.1:44950`）連線被拒，導致**所有**系統字型都載不到。訊息讀起來像是該字型未安裝，實際上字型檔存在於 `/System/Library/Fonts/`，Figma 字型選單也列得出來。
- 訊息只列出歐文候選 style（Bold、Semibold、Semi Bold、SemiBold、Medium、Regular），未列出 available-style 解析階段實際嘗試過的 W-number style。因此無法從外掛回報判斷 W6 是否被嘗試過，該次診斷必須依賴瀏覽器 console 的網路錯誤才定位到根因。

## Root Cause

字型 fallback 的解析邏輯本身正確 —— requirement「Text style application」已定義候選 style、available-style 最近字重解析與家族 fallback 次序，實測純函式亦符合（家族只提供 W3 與 W6 時，weight 700 解析為 W6）。缺陷不在解析，而在解析結果的回報。

匯入統計目前僅以 `warnings` 字串陣列承載所有訊息，字型替換與其他警告共用同一通道、同一顯著性。統計中沒有任何欄位表達「本次匯入發生了幾次字型替換、哪些節點被替換、替換前後的家族與 style」，UI 因此無法將替換提升到摘要層級。

替換訊息在字型家族層級各自獨立產生，彼此沒有關聯。單一家族載入失敗與多個不同家族同時載入失敗，在訊息上無法區分，因此無法辨識出「本機字型服務不可用」這種影響全域的失敗態樣。

available-style 解析階段嘗試過的 style 名稱未被記錄，訊息只能列出解析前的歐文候選清單。

## Proposed Solution

在匯入統計中新增字型替換的結構化紀錄，並據以改變回報方式：

- 匯入統計新增字型替換清單，每筆記錄節點路徑、請求的家族與字重、實際載入的家族與 style，以及該次嘗試過的全部 style 名稱（含 available-style 階段查到並嘗試的 W-number style）。
- 當同一次匯入中有兩個以上不同家族全部載入失敗時，判定為本機字型環境異常而非個別字型缺失，回報改為說明所有本機字型皆無法載入，並指出可能是 Figma 本機字型服務不可用，建議重啟 Figma 或檢查字型存取權限。
- 外掛 UI 摘要在發生字型替換時顯示替換次數，使其與節點數、變數數同層級可見，不再只存在於需要捲動的警告細節區。

## Non-Goals

- 不變更字型解析邏輯：候選 style 產生、available-style 最近字重解析、家族 fallback 次序與最後的 Inter Regular 保底皆維持現狀。
- 不阻擋或中止發生字型替換的匯入。替換仍是可接受的降級行為，本次只要求它可見。
- 不新增自動重試、字型安裝或連線修復行為。外掛不負責修復 Figma 的本機字型服務。
- 不變更匯出端 addon 或 payload schema，既有 payload 無需重新匯出。
- 不處理五份使用舊 `sbfx-json-importer` plugin id 的 fork 副本，散佈一致性另案處理。

## Success Criteria

- 匯入一份請求本機字型且該字型可正常載入的 payload 時，統計中的字型替換清單為空，UI 摘要不顯示替換資訊。
- 匯入一份請求本機字型但字型無法載入的 payload 時，統計中每個被替換的文字節點各有一筆紀錄，且該筆記錄同時包含請求家族、實際家族與實際 style。
- 替換紀錄所列的嘗試 style 名稱包含 available-style 解析階段實際嘗試過的 style，而不只是解析前的歐文候選清單。
- 同一次匯入有兩個以上不同家族全部載入失敗時，回報包含本機字型環境異常的判定與重啟 Figma 或檢查字型存取權限的建議；僅單一家族失敗時不出現該判定。
- 外掛 UI 摘要在發生替換時顯示替換次數，不發生替換時不顯示。
- 外掛既有測試維持通過：`node test/verify-pure-functions.cjs`、`node test/verify-manifest.mjs`、`node test/verify-bridge-helpers.cjs`。

## Impact

- Affected specs: figma-import-reconstruction
- Affected code:
  - Modified:
    - design-system-to-storybook/assets/figma-plugin-code-to-design/code.ts
    - design-system-to-storybook/assets/figma-plugin-code-to-design/code.js
    - design-system-to-storybook/assets/figma-plugin-code-to-design/ui.html
    - design-system-to-storybook/assets/figma-plugin-code-to-design/package.json
    - design-system-to-storybook/assets/figma-plugin-code-to-design/package-lock.json
    - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-pure-functions.cjs
    - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-manifest.mjs
    - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/code.js
    - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/ui.html
  - New: (none)
  - Removed: (none)
