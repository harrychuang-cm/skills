## Context

figma-export addon（`design-system-to-storybook/assets/figma-export-addon`，目前 0.13.0）提供 Figma 匯出、Export review 與 Visual Comments。Visual Comments 的現況（2026-10-06 讀程式確認）：

- 掛載：專案在 `.storybook/preview.ts` 用 `createFigmaExportReviewDecorator(...)` 包住 story。它是 addon 唯一呼叫 `Story()` 的地方，也負責同步匯出面板（`syncFigmaExportOverlay`）與 review 工作區（`syncFigmaReviewWorkspace`）。addon 自己的 `./preview` 入口目前只輸出輔助函式，沒有 `decorators`。
- decorator 順序：Storybook 10.4.1 的 `composeConfigs` 預設反轉檔案順序，專案 `preview.ts` 的 decorator 會在最內層。Prototype Inspector 的 decorator 來自 addon preset，在 UI Flow 模式不呼叫 `Story()`，所以 addon 的 decorator 不會執行。從 Story 模式切到 UI Flow 時，面板也會停留在舊狀態。
- 釘點：`getVisualCommentPin` 把點擊位置記成擷取目標（預設 `#storybook-root`）外框的比例。已存釘點只在視窗縮放、捲動和每 500ms 的同步時重新定位。
- 分組：留言只帶 story id 與 `[data-prototype-root]` 的 route／state。overview 以 story id 篩選；清單只能依種類篩選；報告依擷取時間排序。
- 截圖：`captureVisualCommentTarget` 用 html-to-image 擷取同一個目標。同源 iframe 會被複製成 body 的副本，但濾除規則與 CSS 變數蒐集都不會深入 iframe。
- 已知錯誤：`figma-code-exporter.css` 縮窄 `#storybook-root` 的規則引用 `--sbfx-workspace-reserved-*`，但這些變數只定義在 `.sbfx-workspace` 上，所以縮窄規則失效。

Prototype Inspector 的 UI Flow 是相機式畫布：框和連線放在一個以 transform 平移縮放的 world 圖層裡，框可以拖曳，之後的 LOD change 還會把遠處的框換成截圖或空框。Inspector 必須維持零相依，不能 import addon。

## Goals / Non-Goals

**Goals:**

- addon 在任何會用自己內容取代 story 的宿主模式（例如 Inspector 的 UI Flow）下都會執行，而且不需要宿主 import addon。
- 宿主只靠 DOM 屬性與 DOM 事件，就能宣告留言檢視、錨點、畫布座標，以及「不提供匯出／留言」。
- 綁在元素、連線、畫布上的釘點，在平移、縮放、拖曳時保持在正確位置，而且和宿主同一個畫格更新。
- Story 和其他檢視的留言在面板與報告中分開，舊資料不需要遷移。
- 修正工作區沒有替 Story 畫布保留空間的錯誤。

**Non-Goals:**

- Prototype Inspector 端的標記、事件與畫面移動，由 `add-flow-canvas-comments` 處理。
- 在 UI Flow 畫布上匯出 Figma payload：畫布只顯示「改用 Static Flow」的提示。
- 已存釘點在畫布上直接拖曳移動：目前 Story 上也不支援，維持只在截圖上編輯。
- 跨 story 合併留言，或把 UI Flow 留言改掛到各 route 的 story 底下。
- 改變 Vue 或其他 renderer 的掛載方式：自動 decorator 與 renderer 無關，行為一致即可，本 change 不另外驗證 Vue 的錨點。

## Decisions

### 外層 decorator 由 addon 的 preview 入口提供，專案以設定函式登記

addon 的 `./preview` 入口新增 `decorators = [hostDecorator]`。Storybook 會依 `addons` 清單自動載入這個檔案；因為檔案順序被反轉，排在 Inspector 前面的 addon 會包在 Inspector 外層。

專案在 `preview.ts` 呼叫 `configureFigmaExportReview(figmaExportOptions, reviewOptions)`（從 `/review` 匯入，參數與 `createFigmaExportReviewDecorator` 相同），把同步函式登記到 `globalThis[Symbol.for("sbfx.review.registry")]`。用全域 symbol 是因為 tsup 設定為 `splitting: false`，`preview.js` 與 `review.js` 各有一份模組，模組層級的變數不共用；`captureStyleProperties.ts` 已經用 `Symbol.for` 處理過同樣的問題。

`hostDecorator` 有登記時，先設定 `globalThis[Symbol.for("sbfx.review.activeRender")]`，同步匯出面板與 review 工作區，再呼叫 `Story()` 並原樣回傳；沒有登記時直接回傳 `Story()`。舊的 `createFigmaExportReviewDecorator` 在同一次 render 看到標記時，只回傳 `Story()`，所以兩種寫法並存也只會掛載一次。`./preview` 入口不 import `/review`，也不載入 React 與 React DOM。（匯出面板原本就透過 `domExport.ts` 載入 html-to-image 的 `toPng`，這點不變；2026-10-06 實作時確認，修正了提案初稿中「不載入 html-to-image」的錯誤描述。）

替代方案：

- 專案自己加一個排在 Inspector 前面的 preset：每個專案都要多一個檔案。被否決。
- Inspector 在 UI Flow 呼叫 `Story()` 但不掛載結果：所有 story 層級的 decorator 都會被執行，行為隱晦。被否決。
- 在 `main.ts` 開 `features.legacyDecoratorFileOrder`：影響全域，而且 Storybook 標示這個旗標即將移除。被否決。
- 改聽 Storybook channel 事件來同步：工程量較大，而且仍然需要設定的登記機制。被否決。

### 宿主以 DOM 屬性與事件宣告，addon 不認得任何宿主

addon 只讀擷取目標內的這些屬性：`data-sbfx-view`、`data-sbfx-export`（含 `-href`、`-label`）、`data-sbfx-comments`、`data-sbfx-anchor`（含 `-label`、`-route`、`-kind`）、`data-sbfx-canvas`、`data-sbfx-canvas-world`。宿主在移動錨點後發出 `sbfx:anchors-moved`；addon 需要宿主移動畫面時發出 `sbfx:reveal-anchor`。

這些宣告在面板同步時才讀取（decorator 執行時 DOM 還沒畫出來）。替代方案「讀 Inspector 的 `prototypeMode` 全域或 `--prototype-flow-camera-*` CSS 變數」會讓 addon 綁死在 Inspector 上，所以被否決；「在 window 上提供 JS API」需要宿主 import 或偵測 addon，也被否決。

### 錨點依元素、連線、畫布的順序判定，元素位置以版面像素記錄

點擊落在帶 `data-sbfx-anchor` 的元素裡就用元素錨點；否則找 8 CSS 像素內最近的連線錨點；再否則若在宣告的畫布裡，就用畫布錨點；都不是就沒有錨點，維持舊的比例釘點。

元素錨點記錄「元素版面像素」的偏移（點擊位置換算成未縮放的座標），而不是比例。原因是 LOD change 的尺寸快取會讓框高從 812 變成 1040，用比例記錄的釘點會往下漂移；route 內容是從上方開始排的，所以像素偏移在高度改變後仍然對準同一個元件。

連線錨點記錄沿線長度的比例 `t`：框移動時連線會重新繞，`t` 讓釘點沿著同一條線移動。

畫布錨點記錄 world 座標，並記下最近的兩個元素錨點與相對偏移，用來顯示「靠近 A、B」以及偵測版面是否變動過。

8 像素是選定的命中容差（與常見設計工具的線段點選容差同級，屬設計選擇，不是量測值），會在錨點 fixture 中驗證「6 像素命中、9 像素不命中」。

### 錨點移動事件在同一畫格處理，直接寫入釘點位置

宿主在寫完 transform 的同一個 rAF 內發出 `sbfx:anchors-moved`。addon 在事件處理中同步讀取錨點位置，直接寫入釘點元素的 `style.left` 與 `style.top`，不觸發面板重新 render。

替代方案：

- 用 MutationObserver 觀察 style 變化：拖曳時每個畫格都會觸發大量紀錄，而且時機在畫格之後，會落後一格。被否決。
- addon 自己每個畫格輪詢：畫面靜止時也一直耗用資源。被否決。

既有的視窗縮放、捲動與 500ms 同步保留，作為沒有發出事件的宿主的後備。

### 檢視類型放在擷取的 story metadata

`view` 與既有的 `prototypeId`、`routeId`、`stateId` 並列在 `capture.story`，因為它描述的是「在哪個畫面擷取」。值為 `story` 時省略，舊資料讀成 `story`，不必改 `meeting.json` 版本。

替代方案「重用 `stateId`」會和 prototype 自己的狀態值衝突，所以被否決。

### 元素錨點的截圖由 iframe 內的 review runtime 自己擷取

route 框裡的 iframe 是同一個 Storybook 的預覽頁，也會執行專案 `preview.ts`，因此會載入 review runtime。review runtime 在自己的 window 註冊 `Symbol.for("sbfx.captureHook")`。父頁面直接呼叫 iframe window 上的這個函式，在 iframe 自己的文件裡擷取，樣式與 CSS 變數都正確。

沒有 hook（例如 LOD 換成截圖或空框）時，改擷取錨點元素本身。連線與畫布錨點的截圖規則見下一個決策「畫布截圖畫入可見框的頁面」。

替代方案「從父頁面用 html-to-image 複製 iframe 節點」有跨 realm 的樣式與濾除問題，所以被否決。

### 畫布截圖畫入可見框的頁面

**Supersedes**: add-anchored-visual-comments / 元素錨點的截圖由 iframe 內的 review runtime 自己擷取

原本連線與畫布錨點擷取畫布容器時略過所有 iframe，截圖裡只剩連線、標籤與節點，看不到各框的畫面（2026-10-06 使用者回報）。改為：先以略過 iframe 的方式擷取畫布容器，再對畫布中可見、同源且有 `sbfx.captureHook` 的框 iframe 呼叫 hook，把各框的頁面畫進同一張截圖，位置換算與元素錨點相同，並裁切在該 iframe 與畫布的可見交集內。

- 數量：依可見面積由大到小，最多 12 個框；可見寬度或高度小於 24 CSS 像素的框不擷取。12 與 24 是設計值，用來限制成本，不是量測值。
- 成本：hook 接受 `{ maxScale }`，畫布截圖時傳入「該框在截圖中的實際縮放」（上限 2、下限 0.25），框縮得越小擷取越便宜；舊版 runtime 忽略這個參數。
- 失敗：單一框的 hook 失敗或超過 4000ms 就留空，不影響整張截圖；整個合成失敗時退回略過 iframe 的畫布截圖。4000ms 是設計值；task 5.5 在 anchor fixture 記錄有框時的畫布截圖耗時（`measure:` 行），作為確認依據。

替代方案「一律擷取全部框」被否決：大型 flow 會超過擷取逾時。

### 審查後的擷取與撰寫修正

2026-10-06 的程式碼審查（`/spectra-review`）指出以下問題，一併修正：

- 沒有 iframe 截圖函式的錨點元素（例如 UI Flow 的流程節點）以版面尺寸（`offsetWidth`／`offsetHeight`）擷取，並以 html-to-image 的 `style` 選項重設複本根節點的 `position`、`left`、`top`、`inset`、`margin` 與 `transform`；否則 world 座標與畫布縮放會讓內容畫到圖片外，只剩背景色。
- 留言的檢視在按下釘點時記下，送出時使用記下的值；撰寫中切換 Inspector 模式不會把留言存到別的檢視。儲存後清單回到目前檢視。
- 對應截圖到頁面所需的外框（錨點元素、iframe、畫布與可見交集）都在按下的同一個 task、第一個 `await` 之前讀取；兩處 iframe 座標換算抽成共用函式。
- 畫布截圖的框依可見面積由大到小，最多 2 個並行，共用 4000ms 預算；預算用完就不再啟動新的框。原本 12 個框同時開始、各自逾時，在頁面重時會一起留空。
- SVG 繪製樣式的還原只在 `style` 屬性仍是 addon 寫入的字串時整串寫回；宿主在擷取期間改過的元素，只移除 addon 加上、且值沒被改過的屬性。
- 待送出釘點的可調範圍限制在「截圖範圍 ∩ 擷取目標 ∩ 畫布 ∩ 視窗」，調整後一定判定得出錨點。

### 待送出釘點依目前位置換算

撰寫留言時（擷取已完成、輸入框開著），畫布仍可平移與縮放，待送出的釘點會跟著錨點移動。拖曳或用方向鍵調整它時，截圖上的點必須對應「截圖拍到的那塊區域現在在畫面上的位置」，而不是拍照當下的位置。因此擷取完成時，把截圖範圍（`pinFrame`）記成相對於錨點的形式：元素錨點記成相對於錨點元素外框的比例，連線與畫布錨點記成 world 座標的矩形；之後每次換算都用錨點元素或 world 圖層目前的位置還原成 client 矩形。錨點元素或畫布不在時，退回拍照當下的矩形。2026-10-06 的驗收發現這個問題（`/spectra-verify` 的推論，讀程式確認屬實）。

### 舊資料相容：雜湊只在有新欄位時納入

idempotency 雜湊只在 `anchor` 存在時加入它，`story.view` 只在不是 `story` 時加入（與既有的 `hashKind` 做法相同），所以舊請求重送仍得到同一個雜湊。

伺服器把未知欄位丟掉的現有行為不變：較舊的伺服器收到新請求時會靜默忽略 `anchor` 與 `view`，留言仍可儲存，只是沒有錨點。

### 擷取模式攔截整個點擊序列，Esc 停止傳遞

主要按鍵按下後，500ms 內的第二下、`dblclick` 與 `contextmenu` 都會被攔下，避免宿主把雙擊當成「進入互動模式」，或把第二下當成選取。其他按鍵（例如中鍵平移）直接放行。500ms 是選定的值，與作業系統常見的雙擊間隔同級（設計選擇，不是量測值）；錨點 fixture 以 300ms 的雙擊驗證。

addon 處理的 Esc 加上 `stopPropagation`，避免同一次 Esc 同時關掉留言輸入框，又讓宿主取消拖曳或清除選取。

### 截圖時把 SVG 子元素的計算後樣式暫時寫成 inline

html-to-image 複製 `<svg>` 時只把樣式內嵌到 svg 元素本身，子元素沿用屬性與 inline style，樣式表規則不會套用。所以用 CSS class 設定 `fill`、`stroke` 的線條與圖示，截圖中會變成黑色色塊或消失（2026-10-06 在 UI Flow 的連線上實際發生）。

擷取前，對擷取元素內每個 SVG 子元素，把繪製相關的計算後樣式（fill、stroke 系列、opacity、visibility、display）暫時寫成 inline，擷取結束後（成功或失敗）逐一還原原本的 `style` 屬性。

替代方案「自己複製 DOM 取代 html-to-image」工程量過大，被否決；「要求宿主一律用 inline style」無法涵蓋第三方圖示元件，也被否決。Prototype Inspector 已在 `rebuild-flow-canvas-camera` 中把連線改為 inline style，兩邊都有處理，彼此不衝突。

### 工作區保留尺寸的變數改定義在 html 屬性選擇器上

把 `--sbfx-workspace-reserved-inline-size` 與 `--sbfx-workspace-reserved-block-size` 改定義在 `html[data-sbfx-workspace-open="true"]` 上（`.sbfx-workspace` 仍沿用同一組變數）。這樣 `#storybook-root` 的縮窄規則讀得到值。

overlay fixture 改用填滿視窗寬度的 `#storybook-root`，避免測試因為固定寬度而恆真。

### 宣告畫布的宿主不保留工作區尺寸

2026-10-07 使用者回報：Figma export 面板展開時，UI Flow 畫布右側被切掉。變數改定義在 html 之後，`#storybook-root` 的縮窄規則開始生效，連 UI Flow 這種可平移的畫布也被扣掉 344px（底部模式扣掉保留高度）。縮窄是為了讓工作區不蓋住不能移動的 Story；宿主宣告的畫布（`data-sbfx-canvas`）可以平移，被工作區蓋住的內容可以移開，縮窄只會讓畫布少一塊。因此 `#storybook-root` 內有 `[data-sbfx-canvas]` 時兩種方向都不縮窄，工作區浮在畫布上方，宿主自己讓控制項避開工作區。判斷用 CSS `:has()`，宿主加入或移除畫布時立即生效，不需要 JS 監聽。

### 版本升為 0.14.0

依既有需求「新增能力時升 minor 版本」，升為 0.14.0。重新 build dist，同步 `storybook-template/.storybook/vendor/figma-export-addon` 與 `storybook-template/vendor/figma-export` 兩份鏡像，並以 `check_figma_export_addon_mirrors.mjs` 確認。README 新增「Upgrading from 0.13.x」段落，說明如何改用 `configureFigmaExportReview`，以及 addon 必須排在 prototype inspector preset 之前。

## Implementation Contract

**宿主宣告（DOM 屬性，只在擷取目標內讀取）**

| 屬性 | 放在哪裡 | 意義 |
| --- | --- | --- |
| `data-sbfx-view="<name>"` | 宿主畫面根節點 | 目前的留言檢視；名稱需符合 `^[a-z0-9][a-z0-9-]{0,39}$`，不符合時視為 `story` |
| `data-sbfx-export="unavailable"`，可加 `data-sbfx-export-href`、`data-sbfx-export-label` | 匯出範圍內任一元素 | 此畫面不提供 Figma 匯出，改顯示提示與同源連結 |
| `data-sbfx-comments="unavailable"` | 擷取目標內任一元素 | 此畫面不提供留言 |
| `data-sbfx-anchor="<id>"`，可加 `data-sbfx-anchor-label`、`data-sbfx-anchor-route` | 可留言的 HTML 元素（例如框的可見區域） | 元素錨點；同一 id 有多個元素時取文件順序第一個；以屬性值直接比對（不組 CSS 選擇器），所以 id 可以含 `>`、`:` 等字元 |
| `data-sbfx-anchor="<id>"` 加 `data-sbfx-anchor-kind="path"`，可加 `data-sbfx-anchor-label` | SVG 幾何元素（polyline、path） | 連線錨點 |
| `data-sbfx-canvas` | 畫布容器 | 畫布錨點的範圍；也作為釘點的可見範圍 |
| `data-sbfx-canvas-world` | 畫布容器內、以 transform 平移縮放的圖層（transform-origin 為 0 0） | world 座標系 |

**換算**

- 元素錨點：`scale = rect.width / element.offsetWidth`（`offsetWidth` 為 0 時視為 1）；`x = (clientX - rect.left) / scale`；顯示位置為 `rect.left + x × scale`。y 方向同理。
- 畫布錨點：world 圖層的 client 外框 `worldRect` 與縮放 `s = worldRect.width / world.offsetWidth`；`worldX = (clientX - worldRect.left) / s`。y 方向同理。`world.offsetWidth` 為 0 時改用 `getComputedStyle(world).transform` 的矩陣與畫布的 `offsetWidth` 換算。在「平移加等比縮放、原點 0 0」的前提下兩種算法結果相同。
- 連線錨點：polyline、polygon、line 以點到各線段的精確距離判定；一般 `<path>` 依螢幕像素取樣（粗取 8px、細修 0.5px）。座標換算優先用 `getCTM()` 加上外層 `<svg>` 的外框，`getScreenCTM()` 只作後備；距離以 CSS 像素計（量測見 Risks）。

**事件**

- `sbfx:anchors-moved`：宿主在 `document` 或其內任一元素發出、會冒泡的 `CustomEvent`，不需要 detail。addon 在 `document` 監聽，並在處理函式內同步重新定位所有可見的錨點釘點。
- `sbfx:reveal-anchor`：addon 在 `document` 發出、會冒泡、可取消的 `CustomEvent`，`detail = { commentId, view, anchor }`。宿主處理後呼叫 `preventDefault()`。

**全域 symbol**

- `Symbol.for("sbfx.review.registry")`：`configureFigmaExportReview` 寫入，內容為 `{ sync(context): void }`。
- `Symbol.for("sbfx.review.activeRender")`：`hostDecorator` 在同步前寫入目前 render 的識別值；舊 decorator 讀到相同值時只放行。
- `Symbol.for("sbfx.captureHook")`：review runtime 在自己的 window 註冊 `(options?: { maxScale?: number }) => Promise<VisualCommentAnchoredCapture>`，擷取自己的 capture target；`maxScale` 限制擷取的像素倍率。

**資料形狀（TypeScript）**

```ts
type VisualCommentAnchor =
  | { type: "element"; id: string; label?: string; route?: string; x: number; y: number; width: number; height: number }
  | { type: "path"; id: string; label?: string; t: number }
  | { type: "canvas"; x: number; y: number; nearby?: Array<{ id: string; label?: string; dx: number; dy: number }> };

// CreateVisualCommentRequest 新增 anchor?: VisualCommentAnchor
// VisualCommentStoryMetadata 新增 view?: string（省略代表 story）
// VisualComment（儲存）新增 anchor?: VisualCommentAnchor
// overview 的每則留言新增 view: string（由 capture.story.view 推導）與 anchor?
```

限制：`id` 1–200 字元、`label` ≤ 120、`route` ≤ 240、`nearby` ≤ 2 筆、座標為有限數、`width` 與 `height` > 0、`t` 介於 0 與 1。違反時伺服器回傳驗證錯誤，不寫入。

**失敗處理**

- 錨點元素不存在：釘點隱藏，清單顯示「顯示位置」。宿主沒有處理 `sbfx:reveal-anchor` 時，顯示 `This location is not available in this view.`。
- iframe 沒有 capture hook，或 hook 擷取失敗：元素錨點改擷取錨點元素並略過 iframe 內容；畫布截圖中該框留空；再失敗才顯示既有的可重試錯誤。
- 較舊的伺服器：靜默忽略新欄位，留言仍可儲存。

**驗收**

- 新增錨點 fixture（`test/run-anchor-fixture.mjs`，在 headless Chrome 透過 CDP 執行）。驗證：元素、連線、畫布三種錨點的判定與換算（含 6 像素與 9 像素的連線命中）；發出 `sbfx:anchors-moved` 後同一畫格的釘點位置；錨點移除後隱藏；`sbfx:reveal-anchor` 的兩種結果；檢視篩選；雙擊只放一個釘點；Esc 不傳到 bubble 階段的 document 監聽；`data-sbfx-comments="unavailable"`；`data-sbfx-export="unavailable"`。
- 擴充既有測試：`run-visual-comment-store-test.mjs`（錨點與檢視的驗證、儲存、雜湊相容、編輯錨點）、`run-visual-comment-http-test.mjs`（新欄位往返）、`run-visual-comment-report-test.mjs`（檢視篩選與錨點描述）、`run-package-contract-test.mjs`（`./preview` 輸出 `decorators`、`/review` 輸出 `configureFigmaExportReview`、preview 入口不含 React 與 review 模組）、overlay fixture（填滿寬度的 `#storybook-root` 被縮窄）。
- `npm run test:visual-comments`、`npm run test:package`、`npm run test:renderer-fixtures` 全數通過。`node design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs` 通過。`node design-system-to-storybook/scripts/test_install_figma_export_addon.mjs` 通過。

**範圍**

- 範圍內：上述 addon 程式、測試、dist、README、兩份鏡像、`figma_export_wiring.mjs` 與其測試、template 的 `preview.ts`、`design-system-to-storybook` 的設定文件。
- 範圍外：Prototype Inspector 的任何檔案；Inspector 安裝程式的 addons 順序（屬於 `add-flow-canvas-comments`）；已安裝到外部專案的 addon 升級。

## Risks / Trade-offs

- [addon 必須在 `addons` 清單中排在 Inspector 前面，外層 decorator 才會包住 Inspector] → 接線工具負責排序；Inspector 安裝程式的排序由 `add-flow-canvas-comments` 處理；README 寫明這個規則。順序錯誤時的結果與現在相同（UI Flow 沒有留言），不會壞掉。
- [專案同時保留舊 decorator 與新設定] → 以 `activeRender` 標記確保只掛載一次，並有對應的驗收情境。
- [`getScreenCTM()` 在 HTML 祖先有 CSS transform 時的結果，各瀏覽器可能不同] → 錨點 fixture 把 SVG 放在有 `transform: scale()` 的圖層裡驗證；若不一致，改用 SVG 外框與 viewBox 自行換算。
- [連線判定的成本] → 先以外框距離排除遠處的線。2026-10-06 在錨點 fixture 量測最壞情況（150 條 1000 單位長、外框全部涵蓋點擊位置的線）：每 4 個使用者單位取樣為 27.5ms，改為依螢幕像素取樣（粗取 8px、細修 0.5px）為 19.0ms；polyline、polygon、line 改用點到線段的精確距離後為 1.1ms。一般 `<path>` 元素仍走螢幕像素取樣。
- [每個畫格同步釘點的成本] → 只處理可見且有錨點的釘點；以直接寫入 style 避免重新 render。
- [iframe 內沒有 review runtime（例如專案沒有在 `preview.ts` 呼叫設定）] → 退回擷取錨點元素，截圖可能缺少 iframe 內容，但留言仍可儲存。

## Migration Plan

1. template 的 `.storybook/preview.ts` 改為在模組層呼叫 `configureFigmaExportReview(figmaExportOptions, {...})`，移除 decorators 裡的 `figmaExportReviewDecorator` 呼叫；主題 decorator 保留。
2. `figma_export_wiring.mjs` 產生同樣的寫法，並把 addon 插在 inspector preset 之前。
3. 已安裝的專案不需要立即修改：舊 decorator 照常運作，只是 UI Flow 沒有留言。README 的升級段落說明一行即可完成的遷移。
4. 回復方式：還原 template 的 `preview.ts` 並安裝 0.13.0；資料檔沒有版本變動，0.13.0 會忽略新欄位。

## Open Questions

（無）
