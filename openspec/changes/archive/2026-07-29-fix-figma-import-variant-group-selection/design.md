## Context

`Storybook Code To Design` 外掛在匯入 payload 時，依 `artifactKind` 分為兩條路徑。`page` 走一般節點重建；`component` 則試圖把結果建成 Figma 的元件或元件集，讓匯入產物可被設計檔重複使用。

在 `component` 路徑中，若 payload 帶有 root component reference，外掛直接以該 reference 建立元件定義。實測的兩份 payload（`components-actions-text-link--inline`、`components-broker-import-broker-import-menu--default`）都沒有 `payload.component` 或 `payload.root.component`，因此都落入後備分支 `createComponentSetFromVariants`。

該後備分支的設計意圖，是支援「一支 story 呈現同一元件多個 variant」的情境（例如 `components-switch--all-variants`）：此時 payload 的 root 只是排版容器，真正該產出的是那組 variant 構成的 component set。

問題在於後備分支的候選規則無法區分「root 本身就是一組 variant」與「root 內部使用了別的元件的多個 variant」。目前 `chooseVariantGroup` 以組內 variant 數量至少 2 作為前置過濾，名稱比對 `isPreferredVariantGroup` 只在通過過濾後的排序階段生效；`getVariantGroupDepth` 同樣僅參與排序。

約束：外掛以純函式為主要可測單元，既有測試在 `test/verify-pure-functions.cjs`；`code.js` 由 `code.ts` 建置產生，且 `storybook-template` 下有一份需保持一致的鏡像。修正不得要求既有 payload 重新匯出。

## Goals / Non-Goals

### Goals

- 讓複合元件的 payload 匯入後產出 payload 描述的完整樹，而非被巢狀子元件的 variant 組取代。
- 保留「同一元件多 variant」story 產出 component set 的既有行為。
- 讓匯入結果的選擇依據可從匯入統計得知，消除靜默的非預期輸出。

### Non-Goals

- 不處理使用舊 `sbfx-json-importer` plugin id 的 fork 副本，散佈一致性另案處理。
- 不變更匯出端 addon 的 payload schema，不新增 root component reference 欄位。
- 不變更 variant set 的命名、排版與 `combineAsVariants` 既有行為。
- 不變更 `artifactKind` 為 `page` 的匯入路徑。

## Decisions

### 決策一：名稱比對升級為硬性資格，數量門檻降為後備

採用「先以 `componentTitle` 尋找名稱相符的 variant 組；找到即採用，不論組內 variant 數量」。僅當沒有任何名稱相符的組時，才套用現行「至少 2 個 variant」的啟發式挑選。

理由：`componentTitle` 是 payload 對「這份匯出描述的是哪一個元件」的明確宣告，比「哪一組 variant 比較多」這種間接訊號可靠。實測案例中目標組 `Broker Import Menu` 僅有一個 variant，正是被數量門檻剔除而失敗。

替代方案一是「保留數量門檻，改為在排序時給名稱相符極高權重」。否決原因是過濾發生在排序之前，加權無法讓已被剔除的候選復活，除非同時移除過濾——那等同本決策但語意更不明確。

替代方案二是「要求匯出端一律補上 root component reference，匯入端不再猜測」。否決原因是這會使既有 payload 全數失效、需重新匯出，且與 Non-Goals 衝突；此方向可作為後續強化，但不應成為修好本缺陷的前提。

### 決策二：巢狀且名稱不符的組不得成為 root

即使沒有任何名稱相符的組，只有位於 root 層級的 variant 組才有資格成為匯入結果的 root node。名稱不符且位於 root 之下的組一律不採用，改為建立 payload 的實際樹。

理由：後備分支的意圖是處理「root 就是一組 variant」。一個位於深層的子元件 variant 組，在任何情況下都不該取代整份匯出。實測案例的 `Icon` 組正是此類。此規則即使名稱比對失敗（例如 `componentTitle` 與節點命名不一致）仍能防止整棵樹被丟棄，是本修正的防呆底線。

替代方案是「僅靠決策一的名稱比對」。否決原因是名稱正規化可能失敗（大小寫、空白、前綴差異），單一防線不足以保證不再出現整棵樹消失的災難性輸出。

### 決策三：選擇結果納入匯入統計

匯入統計新增所選 variant 組的名稱，以及被略過的候選組名稱。

理由：本缺陷最大的傷害不是選錯，而是選錯時完全沒有訊號。使用者看到非預期輸出時無從判斷是資料問題還是外掛問題。統計輸出讓後續同類問題可自我診斷。

## Implementation Contract

### 可觀察行為

給定 `artifactKind` 為 `component` 且無 root component reference 的 payload：

- 當樹內存在名稱正規化後與 `componentTitle` 相符的 variant 組時，匯入結果為該組構成的元件或元件集，不受組內 variant 數量影響。
- 當不存在名稱相符的組，但 root 層級存在含至少 2 個 variant 的組時，維持現行行為，產出該組的 component set。
- 當不存在名稱相符的組，且所有含至少 2 個 variant 的組都位於 root 之下時，匯入結果為 payload 實際樹的重建結果，其節點種類與數量與 payload 的 `root` 子樹一致。

### 介面

variant 組選擇邏輯需可作為純函式測試，輸入為候選組集合與 `componentTitle`，輸出為所選組或「不選任何組」的結果，並附帶被略過的候選組名稱。純函式不得依賴 Figma runtime API。

### 失敗模式

選擇邏輯不得拋出例外中止匯入。找不到可用組時，回傳「不選任何組」讓呼叫端改建實際樹。

### 驗收

- 以 `components-broker-import-broker-import-menu--default` payload 匯入，產出樹含 6 個 frame、5 個 text、3 個 svg。
- 以 `components-actions-text-link--inline` payload 匯入，結果與修正前一致。
- `test/verify-pure-functions.cjs` 新增涵蓋上述三種可觀察行為的案例並通過。
- `test/verify-manifest.mjs`、`test/verify-bridge-helpers.cjs` 維持通過。

### 範圍邊界

在範圍內：`code.ts` 的 variant 組候選與選擇邏輯、對應建置產物 `code.js` 與版本徽章 `ui.html`、`storybook-template` 的 runtime 鏡像、純函式測試、外掛版本號。

`storybook-template` 鏡像僅收 runtime 檔案（`code.js`、`ui.html`、`manifest.json`、`README.md`），因為它是被複製進目標專案直接匯入 Figma 的產物，不需要建置工具鏈；`code.ts`、`package.json`、測試與建置設定一律不得放入鏡像。

在範圍外：匯出端 addon、payload schema、`page` 匯入路徑、variant set 命名與排版、舊 `sbfx-json-importer` fork 副本。
