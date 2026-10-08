## Why

相機與效能問題解決之後，UI Flow 仍只能一次拖一張畫面、沒有對齊輔助、拖錯也無法復原，在 30 個 route 的 flow 中也很難掌握自己在哪裡。設計師希望它更像設計工具：可以選取、框選、對齊、復原，也能看到分組與全局位置。實際 prototype 的資料支持這些需求（2026-10-02 實測）：11 個 prototype 的 114/115 個 x 座標落在 20px 格線、route 畫面之間最常見的水平 gutter 為 103px，代表作者在手動排版；48 個 flowGroup 中有 25 個至少兩個成員，但畫布上看不出分組。

## What Changes

- **選取**：點畫面或其名稱選取，Shift+點擊加入或移除，點空白處或按 Esc 取消，Cmd／Ctrl+A 全選。選取以 instance key 記錄（完整 flow 為 node id，簡化檢視為步驟實例的 `<stepIndex>:<nodeId>`），在放開指標時才提交。命中沿用 DOM（畫面的預覽區與名稱列接收指標，框上方的空白名稱區不接收），選取外框圍住可見矩形、畫在不縮放的覆蓋層，固定 2px，手勢中每一幀都貼著畫面。被選取的畫面會優先成為 live iframe（沿用 add-flow-canvas-level-of-detail 的提升介面）。
- **框選**：在空白處用主鍵拖曳拉出外框，可見矩形碰到的畫面都會被選取（Figma 的觸碰規則）；Shift+框選為加選；拖曳中按 Esc 取消並還原原本的選取。
- **多選拖曳與微調**：拖曳任一被選取的畫面時整組一起移動（auto-layout 的功能名稱跟著各自的錨點畫面）；Shift 鎖定水平或垂直方向；拖曳中不 commit React。方向鍵移動 20px、Shift+方向鍵移動 100px（對齊實際 prototype 的 20px 格線）；連按或按住（含自動連發）累積成一個只改 DOM 的微調，最後一次放開方向鍵 500ms 後，或在其他 layout 動作、復原、重做、選取改變、視窗失焦之前提交；提交時若正在手勢中就延後。
- **對齊參考線**：拖曳時被拖選取範圍的左、中、右與上、中、下線，會和可見範圍內其他畫面的三條線兩兩比對（也能讓右緣貼齊左緣），距離在 6 個螢幕像素內才吸附，並夾在 2–20 world px 之間（20 小於實際最小的 22px 垂直 gutter），畫出參考線；拖曳中按住 Ctrl 暫時停用吸附（與 Figma 相同）。參考線使用新 token `--pi-sys-color-annotation-touch-target`（Token Gate 已於 2026-10-07 由使用者核准）。
- **復原與重做**：拖曳、微調、Reset、Import 與 Auto Layout（連功能名稱）都可以 Cmd／Ctrl+Z 復原，Cmd／Ctrl+Shift+Z 或 Windows／Linux 的 Ctrl+Y 重做，最多 100 步，只保留在本次開啟期間；相機與選取不進入歷史。每次復原或重做都是一個已提交的 layout 動作，只寫入一次。依使用者決定（2026-10-08），Auto Layout 提示上的 `Undo` 改為復原歷史的捷徑，微調、復原與重做也會結束提示的復原期間。
- **小地圖**：畫布 viewport 左下角顯示所有畫面與目前可視範圍（功能流程清單顯示時在清單右側，兩者不重疊）；依使用者決定（2026-10-07），figma-export 工作區開啟時移到左上、縮放群組下方，避開移到左下的 layout 群組。點擊跳到該處、拖曳可視框平移。route 畫面與 flow-only node 合計 8 個以上預設顯示，可從縮放選單切換，偏好存在 localStorage。小地圖不是 Figma 的功能，是參考 React Flow／tldraw 的補充。
- **flowGroup 分區背景**：至少兩個 route 的 flowGroup 會在畫面後方畫出分區（各成員外框向外留白後的聯集，不用整體邊框，以免蓋到其他組的畫面），填色用與畫布背景不同的 `--pi-sys-color-surface-raised`（inline style，留言截圖才保得住），組名固定 12px 顯示在分區上方（同一組已顯示 auto-layout 的功能名稱時不重複），拖曳時即時更新；可從縮放選單切換。
- **畫面導覽**：Shift+2 縮放到選取範圍；N／Shift+N 依 flow 的 route 順序選取下一個或上一個畫面並移過去。這些相機移動會結束開啟時的 fit 追蹤，之後量到畫面尺寸也不會重新 fit 整個 flow。
- **簡化檢視中的行為**：在 add-flow-journey-focus 的簡化檢視中，整組拖曳、微調、吸附、復原與分區背景停用（相關按鍵照常傳給 Storybook）；選取、框選、小地圖與 Shift+2 作用在簡化檢視的步驟實例上，同一 route 出現兩次時只選取被點的那一個；N／Shift+N 改為依步驟索引移動並在兩端循環。進入簡化檢視、切換 journey 與回到「全部」時清除選取。
- 快捷鍵延續 rebuild-flow-canvas-camera 的 document 層攔截規則，`resolveCanvasShortcut` 維持回傳字串命令：只在有東西可處理時才攔截（例如沒有選取時方向鍵與 Esc 照常傳給 Storybook），焦點在按鈕、選單、功能流程清單或對話框時方向鍵交給該元素，拖曳或框選中不處理復原、重做、全選與 N。Esc 的處理順序為：關閉選單或對話框 > 取消拖曳 > 取消框選 > 清除選取。
- 選取外框、框選、參考線與小地圖都帶 `data-sbfx-capture-ignore`，不出現在留言截圖中；分區留在截圖中。

## Non-Goals

- 雙擊與 Enter 進入互動模式（add-flow-frame-interact-mode）。
- 等距間隔參考線、格線吸附與自動消除重疊；作者刻意的重疊（3 個 prototype 共 7 組，實測）維持原位。自動排版由 add-flow-auto-layout 提供。
- 刪除、新增、改名畫面或分組：畫面與分組來自 flow 程式碼，畫布只編排位置。
- 跨重新整理保留復原歷史，或把相機與選取寫入 layout payload。
- 修改 Static Flow、layout payload 格式與 storage key。

## Capabilities

### New Capabilities

- `flow-canvas-editing`: UI Flow 畫布的編排工具——選取、框選、多選拖曳與微調、對齊參考線、復原與重做、小地圖、flowGroup 分區背景、畫面導覽快捷鍵，以及這些工具在簡化檢視中的行為。

### Modified Capabilities

(none)

## Impact

- Affected specs: flow-canvas-editing（新）
- 相依：在 fix-inspector-runtime-drift、rebuild-flow-canvas-camera、add-flow-canvas-level-of-detail、add-flow-canvas-comments、add-flow-journey-focus（`476f381`）與 add-flow-auto-layout（`d6020a8`）之後實作，前置 change 都已實作並 commit（未歸檔）。依賴相機、快捷鍵 dispatcher、geometry 模組、分層的提升介面、留言的錨點與截圖規則、簡化檢視的步驟實例與功能流程清單，以及 Auto Layout 的寫入動作、功能名稱與復原提示。flow-canvas-navigation 尚未歸檔到 `openspec/specs`，擴充點以 rebuild-flow-canvas-camera 的 change 規格為準。
- 不加 MODIFIED delta，改用前置 change 的擴充點：
  - rebuild-flow-canvas-camera 的 flow-canvas-navigation：整組拖曳（拖曳時移動每個被選取的畫面）、唯讀檢視中不開始拖曳、其他能力定義的按鍵只在其情境中攔截與焦點在控制項時的按鍵規則、Esc 的路由列、程式化相機移動結束 fit 追蹤、覆蓋層元素跟隨相機、畫面的可見矩形。
  - add-flow-journey-focus：步驟實例的 instance key，以及功能流程清單排在 viewport 旁邊。
  - fix-inspector-runtime-drift 的 inspector-viewport-resolution「Layout signature honored by the inspector」：其通用條款允許「UI Flow 畫布能力定義的其他已提交 layout 動作（例如方向鍵微調、復原或重做）」寫入且每個動作只寫入一次；本 change 的整組拖曳放開、微調提交、復原與重做都依此條款各寫入一次，因此不需要對該 capability 加 delta。
- 新增顏色 token：`--pi-sys-color-annotation-touch-target: var(--sbt-sys-color-annotation-touch-target, #db2777)`（深色 fallback `#f472b6`），用於參考線；Token Gate 已於 2026-10-07 由使用者核准。template 中它解析為 pink-70 `#ffb7b9`（白底對比約 1.65:1），列入手動檢查。
- Affected code:
  - Modified:
    - storybook-product-prototype/assets/prototype-inspector/flow-canvas.js
    - storybook-product-prototype/assets/prototype-inspector/flow-canvas-geometry.js
    - storybook-product-prototype/assets/prototype-inspector/prototype-inspector.css
    - storybook-product-prototype/assets/prototype-inspector/preview.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas-geometry.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/prototype-inspector.css
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/preview.js
    - design-system-to-storybook/storybook-template/src/pages/prototypes/README.md
    - storybook-product-prototype/scripts/test_flow_canvas_geometry.test.mjs
    - storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs
    - storybook-product-prototype/scripts/bench_flow_canvas.mjs
    - storybook-product-prototype/scripts/check_flow_canvas_comments.mjs
    - storybook-product-prototype/scripts/check_flow_auto_layout.mjs
    - storybook-product-prototype/references/storybook-integration.md
    - storybook-product-prototype/SKILL.md
  - New:
    - storybook-product-prototype/scripts/check_flow_canvas_editing.mjs
  - Removed: (none)
