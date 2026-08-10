## Why

Design Automation Hub 的「整理設計稿」目前只接受畫布上剛好一個選取節點（`selection.length !== 1` 即拒絕），設計師要整理一輪頁面必須反覆「選一個 → 分析 → 套用 → 再選下一個」。實務上設計師心中的批次單位是「這一輪標成 Ready for dev 的那幾個 Section」，工具卻強迫他們逐個手動選取，入口摩擦與人工遺漏都集中在這一步。

同時 Figma 已經有 Dev Mode 的 Ready for dev 狀態，可以直接當成「這段設計已經定稿、可以進自動化」的訊號，但目前 Plugin 完全沒有讀取它，等於放著現成的意圖標記不用。

## What Changes

- 整理範圍從「單一 scope」放寬為「一批 scope」：一次選取多個 Section / Frame / Component / Component Set 時，Plugin 逐一擷取快照，並為每個範圍各自建立一筆 `figma-cleanup` 任務。
- 明確拒絕互相包含（祖先／後代關係）的選取組合，避免同一批內出現重疊範圍導致套用結果互相覆蓋。
- 新增 Ready for dev 掃描：在整理設計稿頁面提供一鍵掃描，列出目前頁面所有標記為 Ready for dev 的可整理節點，設計師勾選後即可整批排入分析，不必回畫布逐個點選。
- 整理設計稿頁面新增批次清單視圖：顯示這批任務的名稱與狀態，並可切入單一任務檢視整理提案與套用。
- 套用流程本身不變：仍然是每次一個 scope、套用前重新驗證快照雜湊、需要人工確認、失敗時在該 scope 內回滾。

## Non-Goals

- 不改動 Coordinator 契約：`POST /v1/automation/tasks` 仍然是一個請求對應一個 scope 與一個 `inputSnapshotHash`，不新增批次端點、不讓單一任務承載多個 scope。
- 不做無人值守自動觸發：不接 Figma Webhook（含 `DEV_MODE_STATUS_UPDATE`）、不在 Plugin 關閉時執行任何工作、不自動套用整理提案。真正的外部事件觸發留待後續獨立變更評估。
- 不掃描目前頁面以外的頁面。Plugin manifest 使用 dynamic-page 存取模式，全檔案掃描需要額外載入所有頁面，成本與逾時風險留待後續評估。
- 不放寬既有安全上限：每個 scope 仍各自受 500 節點與 1MB 快照上限約束，不因批次而放寬。
- 不改動元件覆核與流程狀態兩個功能，首頁仍維持三個入口。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `design-automation-hub-installer`: Plugin 的整理範圍擷取契約從單一選取節點改為一批選取節點，新增重疊範圍拒絕規則、Ready for dev 候選掃描規則，以及批次任務建立與批次清單呈現規則。

## Impact

- Affected specs: design-automation-hub-installer
- Affected code:
  - Modified:
    - design-automation-hub-install/template/figma/design-automation-hub/main.js
    - design-automation-hub-install/template/figma/design-automation-hub/ui.html
    - design-automation-hub-install/template/TEMPLATE_MANIFEST.json
    - design-automation-hub-install/scripts/check-design-automation-hub-install.mjs
  - New: (none)
  - Removed: (none)
- Coordinator 端（design-automation-hub-install/template/scripts/design-automation-hub/）不變動，既有已安裝專案不需要重跑 Coordinator 設定，只需更新 Plugin 檔案並在 Figma Desktop 重新載入。
