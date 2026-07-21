## Context

Addon 0.4.0 目前由 React `FigmaExportReview` 與 renderer-agnostic plain-DOM export overlay 各自建立 fixed panel。兩者分別固定在右上與右下，沒有共同容器、可用高度或互斥規則；comment composer 展開後會蓋住 export overlay，也會遮蔽 Story UI。

在目前的 80sJP-Grok Storybook 實例中，`createFigmaExportReviewDecorator` 使用 `.storybook/figma-export.config.ts` 的 `/__figma_export_review_status`，Vite plugin 則使用 `.storybook/project.config.ts` 的 `/__md_figma_review_status`。實測前者回傳 404、後者回傳 200，comments endpoint 回傳 200。這證明 status 與 comments 狀態目前可能同時呈現部分成功、部分失敗。

上一個 closed meeting 已保存一筆 comment 與 WebP asset，但 active meeting report 只呈現自身的空狀態；report index 沒有 counts 或 snapshot preview，使用者很難發現歷史紀錄。保存的 WebP 有正確 dimensions 與 alpha channel，但實際像素為透明空白，現有 fixture 只替換 capture seam，未驗證 `html-to-image` 的真實輸出。

Delete 已能在最後一筆 comment 不再被引用時同步移除其 capture 與 screenshot asset，但 Reports index 仍列出衍生 counts 為 `0 captures · 0 comments` 的空 meeting。這些空卡片沒有可開啟的 evidence，會讓 closed history 持續累積無效項目。

Addon 已有 `--sbfx-*` surface、foreground、accent、border、radius、offset 與 motion conventions，也已有 Review 與 Export 兩個功能元件。本 change 沿用這些 tokens 與元件，不建立產品專屬 token 或新的共用視覺子元件；新增的 workspace coordinator 只負責現有兩個 surface 的 DOM slot、layout state 與 lifecycle。

整合後的 wide workspace 原先沿用 392px inline size，Figma export 的四個 actions 則以 flex wrapping 自動分欄；在目前內容密度下會形成不可預期的欄數並佔用過多 Story canvas。Workspace 已有集中管理 inline/reserved size 的 `--sbfx-workspace-*` variables，export actions 也已有單一 class，因此可在不新增 token或component的前提下收斂成固定版面契約：兩個主要JSON actions各佔full-width row，兩個較次要的utility actions共用底部雙欄row。

React Review header 已使用 `@storybook/icons` 的 `FigmaIcon`，但 renderer-agnostic Export overlay 內嵌的是另一組自行近似的 stroke/circle SVG。這組幾何同時出現在 Export header 與右下 icon-only action，因此兩處都呈現無法辨識的錯誤品牌圖形。

Canonical Figma geometry 修正後，plain-DOM mark 仍繼承 `createIconSpan` 的 inline-flex display，覆蓋 mark 原本的 grid centering，造成 SVG 靠向容器左側；同時 Review 與 Export headers 都使用 Figma mark，兩個 section 的功能語意仍不易區分。

Icon 語意區隔後，兩個 section 的 collapse controls 仍不一致：React Review 使用 Storybook filled `ChevronDownIcon`／`ChevronUpIcon`，plain-DOM Export 使用自製 stroke paths，且 Export 的 collapsed/expanded icon mapping 與 Review 相反。結果是同一個 workspace 中兩個已收合 section 顯示不同方向，視覺與操作提示互相衝突。

Session report目前將comment視為完全append-only evidence：comment record沒有處理狀態，static HTML也沒有mutation controls；既有spec更明確禁止delete API。這讓reviewer無法在report中維護待處理／已完成狀態，也無法移除誤建的單筆comment。

目前Delete雖已有browser confirmation，storage mutation只移除comment record，仍保留capture record與可由report URL讀取的圖片asset。使用者要求確認後的Delete同時移除該comment的截圖，因此需在不破壞其他comment或content-addressed shared asset的前提下加入reference-aware cleanup。

Review panel 的comment capture primary action目前顯示`Add visual comment`。在`Visual comments`區塊語境下，`visual`重複且增加按鈕密度；既有`defaultLabels.addVisualComment`已是集中預設文案來源，也保留consumer override能力。

Visual comments目前仍被渲染在Export review section底部，造成review status/source/notes與meeting/capture workflow混在同一個長panel。使用者需要讓export/review工作區固定在右下角，並將comments改為右上角的獨立工具：預設只顯示edit icon launcher，需要時才展開detail panel。兩個surface必須維持既有320px寬度與Story canvas保留區，且在較矮viewport不得彼此重疊。

第一版獨立comments panel展開後，Edit icon獨占頂列，`Visual comments`與文字link `Reports`又位於下一列，造成header垂直空間過多；同時Start meeting或Save comment後觸發的overview更新／preview remount會讓launcher回到icon-only狀態。使用者需要將heading與Reports組成同一個header左欄，並讓使用者主動的open state跨meeting與save-comment mutation保留。

Save comment後，panel目前只顯示該Story的comment總數，無法直接確認剛儲存的內容、修正文案或刪除誤建comment；使用者必須先開Reports才能管理任何既有comment。Static Reports也只有Copy AI prompt、Complete／Reopen與Delete，comment body仍不可編輯。新的需求是讓panel保留低密度meeting操作的同時提供最新3筆就地管理，並讓active／closed Reports使用同一份body mutation contract。

最近comment雖已可在panel內編輯body，但進入editor後只看到文字，無法對照該comment當初指向的UI區域。另一方面，static Reports的snapshot以`object-fit: contain`呈現時，圖片透明區域或比例留白會露出目前light scheme的白色／淺灰canvas，和addon本身的暗色review surface不一致。新的需求是在不改寫canonical screenshot的前提下，讓panel editor重現既有snapshot與pin，並讓Reports letterbox使用一致的暗灰surface。

目前session report在每個capture區塊內各自對filtered comments套用`index + 1`，因此不同captures各有一筆comment時，每張snapshot與card都顯示`1`。這個數字應表達comment在整個meeting內的序號，而不是capture內的局部位置；panel依Story過濾comments後也不能重新編號，否則同一comment在panel與Reports會出現不同數字。

Add comment目前在Story UI上攔截pointer並計算normalized pin後直接開始async capture；capture完成前沒有任何point feedback，composer開啟後的preview pin也不可移動。使用者因此無法確認第一次點擊是否命中正確位置，只能取消整筆draft並重新capture。第一階段已讓尚未Save的draft可調整point；後續使用者確認已儲存comment進入Edit時也需要調整既有point，因此mutation contract必須在不重新capture或替換image的前提下，支援body與normalized pin的原子更新。

## Goals / Non-Goals

**Goals:**

- 一次只呈現一個右下角 Figma workspace chrome，讓 Review 與 Export 在同一個可捲動 dock 中保持可見且不互相遮擋。
- 共用 workspace 的 DOM、鍵盤閱讀與視覺順序固定為 Figma export 在前、Export review 在後。
- Visual comments在右上角使用獨立panel，預設只顯示`EditIcon` icon button，點擊後才展開Reports、meeting、capture與composer detail features。
- 展開的comments header左側以兩列顯示`Visual comments` subheading與outline `Reports` button，右側Edit icon button與該左欄同列；Start meeting或Save comment成功後保持展開。
- Workspace 開啟時保留 Story canvas 的可操作區域；comments panel展開時不得與右下workspace重疊，capture 與 composer 不得把任何addon chrome收進 snapshot。
- 真實 capture 產生含有效像素的 WebP／PNG，並在全透明輸出時保留 composer 前狀態、顯示可重試錯誤且不送出 comment。
- Report index 清楚區分仍有 evidence 的 active 與 closed meetings，顯示 capture/comment counts，並能導向包含 snapshot、pin、author、body 與 story metadata 的 session report；`captureCount === 0 && commentCount === 0` 的 meeting 不渲染列表卡片，空分組不渲染 heading，全部為空時顯示單一空狀態。
- Preview、Vite server 與 generator 使用同一份 Figma export project config；status/comments 路徑分裂在測試或啟動時立即失敗。
- 保持既有 public decorator、export payload、version 1 meeting JSON向後讀取能力與 renderer-agnostic exporter contract 相容。
- Export header 與 `Copy design to Figma` action 顯示和 React Review 相同的 canonical Figma mark，且不改變其他 action icon 或 accessible name。
- Export mark 的 SVG box 精確置中；Review header 使用既有 `EyeIcon` 表達 preview/review，Figma mark只保留在 Figma export section。
- Review 與 Export collapse controls 使用相同的 Storybook canonical chevron geometry與狀態 mapping：collapsed 顯示向下、expanded 顯示向上，並保持 `aria-expanded`、accessible label及各自 preference一致。
- Figma export collapse control同時作為workspace父層disclosure：收合只顯示Figma export header，展開才顯示Export review slot；Export review自己的collapse preference不被父層收合改寫。可見addon版本只出現在Figma export header。
- Wide viewport 的共用側邊 workspace 精確使用 320px inline size，並為其右側 offset 保留 344px Story canvas 空間；Copy JSON與Download JSON各佔full-width row，`Console script`與`Copy design to Figma`共用底部雙欄row。
- Review panel只提供一個 `Reports` 瀏覽入口，不渲染 active `Open`、closed meeting history heading或per-session list；完整active/closed meeting導覽統一由Reports index提供。
- Active與closed session report的comment cards提供持久化Open／Completed狀態、可逆Complete／Reopen與確認後單筆Delete；Delete icon button固定貼齊操作列最左側，`Copy AI prompt`、Edit與Complete／Reopen則組成貼齊container最右側的action group。確認後同步移除不再被引用的capture與screenshot asset，mutation後canonical JSON、filesystem assets與static reports保持一致。
- Visual comments panel顯示目前Story、目前active meeting依`createdAt`倒序的最新3筆comments，提供body的Edit／Save／Cancel與經頁內確認的單筆Delete；panel mutation完成後仍保持展開，完整meeting history仍只在Reports瀏覽。
- Visual comments panel的recent comment與Reports card進入Edit時，顯示該comment既有snapshot與normalized pin，使用和Add comment composer相同的preview primitive；pin可由click、Pointer Events drag或keyboard調整，但不得提供recapture／replace入口。
- 同一meeting目前存在的comments依canonical array順序衍生連續序號`1..N`；跨capture、跨Story的同一comment在Add comment preview、panel edit preview、report pin與report card title都使用同一序號。
- Add comment在Story point被選取後立即顯示帶有next ordinal的live tag；capture完成後可在preview以pointer或keyboard調整pin，Story live tag同步移動且保持capture-ignore，只有Save提交最終位置。
- Active與closed session report的comment cards提供相同的body／point Edit、Save／Cancel能力；comment edit不取代原作者、capture、screenshot或createdAt。
- Static Reports的snapshot canvas在light／dark scheme都使用既有`--sbfx-surface-raised`暗灰semantic role，圖片仍以contain完整呈現。
- Active meeting 的預設capture action顯示精簡的`Add comment`，並維持既有按鈕功能、accessible name與`addVisualComment` override contract。

**Non-Goals:**

- 不新增雲端同步、登入、權限、comment author／capture／screenshot／`createdAt` edit、批次delete、delete undo或live cursors；saved point edit只改變既有capture座標，不重新capture或替換image。
- 不把 Figma workspace 移入 Storybook manager addon panel；manager/preview channel refactor 不在本 change 範圍。
- 不改變 Figma export payload 或 Code To Design import protocol。
- 不修改產品 component tokens 或為單一 Storybook 建立專屬視覺元件。
- 不重畫 Figma 品牌、引入圖示套件到 plain-DOM exporter，或改動 Figma export 按鈕高度、顏色、DOM順序與操作流程。
- 不新增 icon component、design token 或改變 header mark 的 32×32 visual slot。
- 不合併 Review 與 Export 的 collapse preference，也不改變header click target或預設展開狀態。
- 不刪除 `recentSessions`／`activeReportUrl` response fields、空 meeting JSON、其他仍被引用的assets或static report pages，也不改變start/end meeting與comment capture流程；空 meeting 只從 Reports index projection 隱藏，直接 session URL 仍維持相容。
- 不做批次或全域asset garbage collection；Delete只清理該comment釋放且不再被其他comment/capture引用的capture與image asset。
- 不重新命名public `FigmaReviewLabels.addVisualComment` key，也不改動其他meeting、composer或report文案。
- 不將comments移入Storybook manager，不提供rich-text／多人同步editor，也不允許替換既有capture或screenshot；本次只提供plain-text body edit與既有單筆lifecycle actions。

## Decisions

### 單一 workspace dock 與共享 slots

新增 plain-DOM workspace coordinator，確保 `document.body` 下最多一個 `data-sbfx-workspace` 容器，內含 review 與 export slots。Plain-DOM exporter 將既有 aside 掛入 export slot；React review 使用 `react-dom` portal 將既有 aside 掛入 review slot。Coordinator 以 slot presence 管理 workspace lifecycle，兩個 slot 都釋放後才移除容器與 document state。

Workspace 在wide viewport固定於右下角，使用單一 border/surface/elevation與內部垂直捲動；窄 viewport維持保留底部區域的bottom dock。Export保留自己的collapse preference並作為workspace父層disclosure；Review保留自己的內部collapse preference、action與accessibility label，但其slot只在Export展開時可見。Visual comments不再佔用review slot。兩種orientation都不得浮在capture target上。

替代方案是把功能移進 Storybook manager addon panel，但會新增 manager/preview channel、跨 renderer capture routing 與更多 public surface；這不符合本次針對 preview workflow 的小範圍修正。單靠兩個 fixed panel 的 offset calculation 也無法處理動態 composer 高度與小 viewport，因此不採用。

### Story canvas 保留區與 capture 邊界

Coordinator 在 `document.documentElement` 設定明確的 workspace open/orientation data attributes。Workspace CSS 以既有 `--sbfx-*` conventions 計算 reserved inline/block space，讓 Story root 的可用 canvas 與 workspace 不重疊；workspace 自身標記 `data-sbfx-capture-ignore`。

Capture target 維持 configured selector → `#storybook-root` → `body` 的 fallback，但若 fallback 到 `body`，filter 必須排除整個 workspace。Pin ratio 仍以 capture target 的 frozen bounds 計算，因此 dock reserved space 不會改變 snapshot 內的座標契約。

替代方案是在開啟 workspace 時縮放整個 Story，會破壞量測與視覺比對，因此不採用；保留區只改變可用 viewport，不施加 transform 或 zoom。

### 320px workspace 與 compact export actions

Wide viewport 的共用側邊 workspace 將 `--sbfx-workspace-inline-size` 從 392px 收斂為 320px，並將包含既有 24px inline-end offset 的 `--sbfx-workspace-reserved-inline-size` 從 416px 同步收斂為 344px。Standalone exporter 也使用相同 320px 上限，避免 integrated 與 fallback surface 寬度分裂。窄 viewport 繼續由既有 media query 切換為左右各 16px 的 bottom dock，不套用固定 320px。

`.sbfx-exporter__actions` 使用明確的兩欄 grid；Copy JSON與Download JSON依既有DOM order各自跨越兩欄形成full-width rows，原`Plugin Console Script`縮短為`Console script`，並與icon-only Copy design to Figma各佔底部row的一欄。Icon-only action仍以既有accessible name提供語意，視覺icon在其欄位內置中。窄viewport只改變dock orientation，不改變這個action composition。替代方案是保留四個full-width rows，但會讓兩個較次要actions佔用過多垂直空間；保留flex wrap則會在不同label／語系與320px容器形成不可預期欄數，因此均不採用。

### Figma export 優先的固定 section order

Workspace coordinator 建立 slots 時固定使用 `export`、`review` 的 DOM順序，讓 Figma export 同時成為視覺、鍵盤與輔助技術閱讀順序中的第一個 section，Export review緊接其後。兩個section仍使用原本的named slot acquisition、independent collapse preferences與各自scroll/lifecycle，不以CSS `order`產生視覺和DOM不一致。

替代方案是只在flex layout套用CSS `order`，但會讓screen reader與keyboard navigation仍先遇到Review，造成視覺順序與DOM順序分裂，因此不採用。另一替代方案是在各mount caller中動態prepend，會讓最先mount的功能決定順序並增加HMR漂移風險，因此由coordinator統一建立固定順序。

### Figma export 父層 disclosure 與單一版本標記

Figma export既有collapse preference繼續由`sbfx:exporter-collapsed`保存，但每次render同時把目前collapsed state投影到共用workspace root的`data-export-collapsed`。當值為`true`時，workspace以layout規則隱藏整個review slot，只保留Figma export header；值為`false`時恢復review slot。Review component不會因此unmount，也不寫入`sbfx:review-collapsed`，所以重新展開父層後會回到使用者先前選擇的Review內部狀態。

Figma export header繼續顯示addon patch version；Export review header移除重複的visible version badge。收合時，`Figma export` title label、Story subtitle與chevron glyph全部退出視覺layout，只留下24px Figma mark與版本文字；既有toggle以absolute inset覆蓋compact header作為完整click／focus target，所以compact surface本身仍具`aria-expanded="false"`、Expand label及Enter／Space button semantics。Workspace root與standalone exporter在此state皆使用intrinsic／max-content inline size，不再被320px parent width撐開。展開後恢復完整title、subtitle、up chevron與wide 320px workspace；窄viewport展開時仍維持既有full-width bottom dock。Diagnostics所需的非視覺data attribute不屬於header資訊，但workspace在任何展開狀態都不得同時呈現第二個visible version label。

替代方案是讓Figma export收合時同步改寫Review為collapsed，但這會混合兩個preference並讓重新展開失去使用者上下文，因此不採用。另一替代方案是unmount Review，會中斷其polling與local interaction state；使用CSS隱藏slot可保留既有component lifecycle。只隱藏chevron卻保留一個空白28px button column仍會浪費寬度，因此toggle在collapsed state改為覆蓋整個compact header；視覺最小化不犧牲keyboard或screen-reader展開能力。

### 獨立的 visual comments launcher 與雙 dock 位置

`VisualCommentsSection`保留既有meeting、capture、composer與polling state，但從Export review portal tree中拆出，改以獨立的capture-ignored React portal掛到`document.body`。Panel固定於右上角並沿用既有`--sbfx-*` surface、border、radius、foreground與motion conventions；收合狀態只顯示`@storybook/icons`的`EditIcon` icon button，`aria-expanded`、title與accessible label由集中labels同步表達Open／Close comments。展開後才顯示既有`Visual comments`heading、唯一`Reports`link與完整detail controls。

收合狀態將header grid收斂為單一launcher track並移除hidden header-copy保留的column gap，讓既有36×36 icon button完整貼齊36×36 panel surface；button沿用既有inline-flex centering，Storybook 14×14 `EditIcon`的水平／垂直中心與button及panel中心差皆不得超過0.5 CSS pixel。展開header仍維持左欄copy加右欄launcher的雙欄composition，不改變其對齊。

Comments panel不持久化新的open preference；每次preview mount預設收合。收合後仍保留component內尚未提交的composer/capture draft，重新展開可繼續；若使用者正在等待pointer point capture時收合，則取消該隱藏capture mode，避免頁面維持不可見的click interception。Panel與detail都標記`data-sbfx-capture-ignore`。

Wide viewport的export/review workspace固定在右下，comments launcher/detail固定在右上。Comments展開時，兩個surface以既有workspace reserved block size切分可用高度並各自內部捲動，DOMRect不得重疊；收合後workspace可恢復完整可用高度。窄viewport保留右上launcher與底部workspace，展開detail同樣在bottom reserved region上方捲動。替代方案是將comments保留在review section或用z-index覆蓋workspace，前者延續功能混雜，後者會再次遮住主要export actions，因此均不採用。

### Visual comments compact header 與 open-state continuity

展開狀態沿用同一個`.sbfx-comments-panel`與既有`EditIcon` launcher，不新增shared component或token。Panel內新增語意化header composition：左欄為兩列，第一列是`Visual comments` subheading，第二列是唯一的`Reports` anchor並套用既有secondary/outline action的border、foreground、radius與focus conventions；Reports使用intrinsic／hug-content inline size、靠左對齊與較緊湊的高度／padding，不得撐滿左欄。右欄為Edit icon button，讓launcher與左欄位於同一個grid row。Meeting、capture與composer內容保留在header下方的detail body，不再重複heading或Reports。

`isPanelOpen`只由launcher的顯式toggle改變。Start meeting、End meeting、Save comment、polling refresh、active-session identity改變與mutation pending/success都不得重設這個local UI state；成功mutation只更新overview與相應meeting／composer controls。為涵蓋canonical meeting JSON或screenshot asset寫入後可能發生的preview reload，Start／End／Save comment mutation開始前寫入story-scoped、time-bounded且consume-on-read的`sessionStorage` continuation marker；同一Story在短時間內remount時以展開狀態恢復，使用者主動收合會立即清除marker，過期後也不生效。這不是open preference，不使用localStorage，也不讓一般preview mount改為預設展開。

### 精簡的 visual comment action copy

沿用`defaultLabels`作為review UI的集中預設英文文案來源，僅將`addVisualComment`的預設值改為`Add comment`。Public label key保持`addVisualComment`，consumer傳入的custom label仍優先於default，因此不造成type或API migration。Button的click handler、disabled logic、capture state與其他labels不變。

替代方案是將key也改為`addComment`，但會破壞既有consumer的label override；另一替代方案是在render處直接寫死`Add comment`，會繞過既有集中labels contract，因此均不採用。

### 真實 DOM capture 與有效像素檢查

Capture pipeline 改用 `html-to-image` 的 canvas-oriented path，使用 frozen bounds、resolved non-transparent ancestor background、既有 size/byte limits 與 capture-ignore filter。Encode 前檢查 canvas 至少存在可見 alpha pixel；全透明輸出視為 capture failure，不得開啟可提交 composer或呼叫 API。

Browser fixture 必須使用真實 DOM（至少包含不同 surface color、文字與邊界），執行 production capture function，解碼 data URL 並以 pixel assertions 證明輸出不是全透明或單一 fallback 背景。既有 injected capture seam 測試繼續驗證 pointer interception 與 pre-action state。

只設定 opaque background 會讓 clone failure 變成看似成功的空白底圖，因此不單獨採用；有效像素 fixture 必須同時證明 target content 被畫出。

### Active 與歷史 meeting 導覽

Overview response 的 `recentSessions` 每筆增加 `captureCount` 與 `commentCount`；active session 也回傳相同 counts。這些是 meeting JSON 的衍生值，不改變 canonical storage schema。

Panel 只保留 current meeting 的操作狀態與 visual comments heading中的單一 `Reports` 入口，不顯示 active `Open`、recent closed meetings list或per-session cards。Static report index 先以衍生的 `captureCount`／`commentCount` 過濾 meeting，只有至少一個count大於零的active或closed meeting才進入對應分組並顯示時間、counts、狀態與session link；沒有可見meeting的分組不渲染heading，兩組都空時顯示單一empty state。Session report直接URL與canonical meeting JSON保持可讀，即使沒有comments仍顯示capture count與返回所有meetings的導覽。存在comments時，snapshot、pin、author、body與story metadata必須位於同一evidence card。

不把歷史 comments 混進 active meeting，也不在操作 panel 複製 Reports index 的meeting導覽清單，避免工作區密度隨 meeting 數量成長。Overview 的 `recentSessions`、`activeReportUrl` 與 counts仍保持API相容，但panel不渲染這些meeting links；目前Story／active meeting的最新3筆comment items是操作捷徑，直接使用同一份canonical overview而非建立第二套meeting導覽資料源。

### Report comment lifecycle actions

`VisualComment`在既有version 1 `meeting.json`中新增optional `resolvedAt` ISO timestamp；missing或`null`代表Open，Complete由server寫入時間，重複Complete保持原timestamp，Reopen清除resolved state。既有meeting JSON不需migration，讀取時將missing視為Open。

Store提供serialized `resolveComment(sessionId, commentId, resolved)`、`updateCommentDetails(sessionId, commentId, patch)`與`deleteComment(sessionId, commentId)` mutations，active與closed meetings都允許執行。HTTP contract使用`PATCH /sessions/:sessionId/comments/:commentId`；`resolved` payload保持exclusive，comment edit payload可包含body、pin或兩者，Delete則使用`DELETE /sessions/:sessionId/comments/:commentId`；不存在的meeting/comment回404。Delete先移除指定comment；若沒有其他comment引用其`captureId`，同一mutation也移除該capture record；若沒有其他capture引用該`image.path`，則刪除對應session asset。共享capture或content-addressed shared asset必須保留到最後一個reference被移除，root counts與affected session report在canonical write後重建。

Static session report沿用既有comment card、`--sbfx-success`、`--sbfx-error`、accent、surface與border tokens，增加狀態badge、Edit、Complete／Reopen與Delete controls，不新增design token、共用component或Storybook story。Delete control重用Storybook canonical 14×14 `TrashIcon` geometry作為具有`aria-label`／`title`的icon-only button，並固定為`.comment__actions`的第一個DOM child與最左側視覺action。後續`Copy AI prompt`、Edit與Complete／Reopen依序放入同一個end-action wrapper，由既有flex composition與auto inline-start margin將整組貼齊container最右側。第一次點擊Delete只開啟頁內modal dialog；dialog以page-level `role="dialog"`／`aria-modal="true"` overlay與`hidden` state實作，不依賴可能不存在的native `HTMLDialogElement.showModal()`。Dialog明確說明comment與screenshot都會永久刪除，提供Cancel與Confirm delete，僅Confirm delete進入既有mutation；開啟後focus移至Cancel，Cancel／Escape／backdrop close會回到原Delete button。單一nonce-authorized report action script從card data attributes導出same-origin API URL；CSP只新增對該nonce的`script-src`與`connect-src 'self'`，維持`default-src 'none'`及`form-action 'none'`。Cancel、Escape或關閉dialog送出零requests並清除pending card。Mutation期間只disable該card actions，失敗在該card的`aria-live` region顯示且不改變canonical內容；成功後reload canonical session report。為避免addon升級後既有derived HTML仍保留舊互動，GET root/session report HTML在serialized store queue中先由canonical state／meeting JSON重建，再由既有static route回傳；asset GET維持純讀取。

替代方案是soft-delete或保留tombstone，但不符合使用者要求的單筆刪除；無條件刪除capture或hash asset則可能破壞共享reference，因此採reference-aware cleanup。直接加入inline event handler或`'unsafe-inline'`會放寬整頁CSP，因此不採用。

### 最近三筆 comment 與跨 surface 編輯

Overview既有`comments`只包含目前active meeting並可依`storyId`過濾；panel直接將這份current-story集合依`createdAt`倒序排序並截取前3筆，不把closed meeting comments或第4筆以後的紀錄塞回panel。每個compact comment item顯示author、createdAt、body與Open／Completed狀態，並沿用現有`--sbfx-*` semantic variables、button、field、focus與error conventions；不新增token、shared component或Storybook story。完整active／closed meeting內容仍由唯一`Reports`入口負責。

Panel recent comment提供單一body-level overlay editor；static report仍提供單卡片inline editor。Panel同一時間最多只有一筆comment進入modal，持有該筆body與pin drafts。Edit將目前body帶入既有textarea pattern並在stored screenshot preview上投影canonical pin；Save changes先trim body、套用`VISUAL_COMMENT_LIMITS.maxBodyLength`並驗證normalized pin，Cancel還原兩個canonical values且不送request。Store使用serialized `updateCommentDetails(sessionId, commentId, patch)`；HTTP沿用`PATCH /sessions/:sessionId/comments/:commentId`，comment edit request可包含`body`、`pin`或兩者，且不得和既有`{ "resolved": boolean }`混用。成功mutation只更新指定comment的supplied fields，保留`authorName`、`captureId`、`createdAt`、`resolvedAt`、capture與image asset，並重建session report與root index；canonical `meeting.json`繼續使用version 1且不新增`updatedAt`。

Panel以集中`FigmaReviewLabels`／`defaultLabels`補充Edit、Save changes、Cancel與Delete的source-compatible文案，render處不寫死新的使用者可見文字。Panel Delete使用與report相同的`DELETE` endpoint及reference-aware cleanup，第一次操作只開啟React-owned的頁內`role="dialog"`確認層，Cancel／Escape／backdrop close送出零requests並返回原按鈕，只有Confirm delete才真正刪除comment與已無引用的screenshot evidence。Edit／Delete開始前沿用story-scoped短效continuation marker，mutation refresh或同Story remount後panel維持展開並以canonical overview更新最近3筆。

Static report在既有右側end-action group中保留`Copy AI prompt`在前與Complete／Reopen在後，將Edit插入兩者之間；進入editor後在卡片內顯示stored screenshot、editable pin、body field與Save changes／Cancel，Delete仍固定在最左側。Report script使用既有nonce與same-origin fetch，不放寬CSP；comment PATCH失敗只更新該卡片的`aria-live` error並保留body／pin drafts，成功後reload regenerated canonical report。替代方案是讓每次edit建立新comment或替換capture，但會扭曲comment counts與review evidence，因此只原地修改body與normalized pin。

### Visual comments edit overlay modal

Recent comment的Edit trigger保存為focus-return target，並在`document.body`建立一個`data-sbfx-capture-ignore`的page-level backdrop與`role="dialog"`、`aria-modal="true"` editor。Modal使用集中label組成可辨識的Edit heading，重用既有`.sbfx-review__snapshot-preview`、`.sbfx-review__pin`、field、button、surface、border、focus、spacing與radius conventions；寬螢幕以大於320px panel的responsive surface顯示較大的stored evidence，窄螢幕則限制在viewport inset內並讓內容可scroll，不新增產品token、shared component或Storybook story。

Edit開啟後focus移至可調整的point；evidence unavailable時改移至body field。Escape、backdrop與Cancel皆清除local body／pin drafts、關閉modal、送出零request並將focus還給原Edit trigger。成功Save沿用既有單一body＋pin PATCH，關閉modal、刷新canonical overview並維持Visual comments panel展開；失敗則保留modal、body draft與point draft，讓participant直接修正或重試。Panel顯式收合、Story切換或component unmount視同Cancel，不留下body-level overlay。Delete confirmation維持獨立dialog，Reports inline editor與saved screenshot read-only contract不變。

替代方案是在320px recent card內繼續放大preview，但會增加panel高度與scroll密度，仍無法清楚比對整張UI evidence；另一替代方案是讓Reports負責唯一edit入口，但會破壞Visual comments的快速修正流程，因此採用只針對panel recent comment的modal。

### 編輯 evidence preview 與 report snapshot surface

Overview HTTP response在每筆current-story comment上新增derived `preview`，包含same-origin screenshot URL、stored image width／height與normalized pin。Store以comment的`captureId`解析canonical capture及`image.path`；server再將asset path投影為`${basePath}/reports/sessions/<sessionId>/assets/<filename>`，避免React client自行拼接storage路徑。若legacy／損壞資料缺少capture或asset metadata，`preview`為`null`，editor仍可操作並顯示集中label提供的evidence unavailable狀態，不因單筆evidence損壞中止整個overview。

Recent comment進入Edit後，在textarea之前重用Add comment composer既有`.sbfx-review__snapshot-preview`與`.sbfx-review__pin`視覺primitive，使用stored width／height維持aspect ratio，並以normalized pin重現標記位置。Screenshot本身保持read-only evidence，numbered pin則成為可focus的draft editor；Edit／Save／Cancel不新增capture request、file picker或replace control。替代方案是讓editor重新capture，但會改變原review point的證據語意，因此不採用。

Static report的standalone token map補上addon既有`--sbfx-surface-raised`semantic role，`.snapshot`在light與dark color schemes都使用此暗灰surface；圖片保留`object-fit: contain`，所以透明像素與letterbox都顯示同一暗灰背景。這是既有semantic token reuse，不新增產品token或shared component；pin的foreground／error semantics與report其他surface不變。

### Meeting-scoped comment ordinals

Comment序號是derived presentation data，不寫入version 1 `meeting.json`。每次產生overview或report時，先依canonical `meeting.comments`目前array順序建立`comment.id → ordinal` map，ordinal為zero-based index加一；之後才做Story／capture filtering。如此同一comment即使位於不同Story或capture，在任何surface仍取得相同meeting-wide ordinal，且report的snapshot pin與comment card heading不會各自重設。

Panel overview的每筆comment帶入top-level meeting-wide `ordinal`，preview evidence仍可獨立為null。既有comment editor在pin內顯示該值；Add comment composer尚未建立canonical comment時使用active meeting目前`commentCount + 1`作為next ordinal。Body edit與Complete／Reopen不改array順序，因此ordinal保持不變。Delete移除comment後，下一次canonical overview／report regeneration會對剩餘array重新產生連續`1..N`，避免永久缺號且不需要schema migration。

替代方案是在comment record永久保存sequence number，但會要求version 1 migration並在Delete後留下缺號；另一替代方案是各Story或各capture自行排序，會讓同一meeting出現重複號碼，因此均不採用。

### Pending point adjustment 與 immediate live tag

`beginVisualCommentCapture`新增optional且source-compatible的point-selected callback，在pointerdown完成target bounds、normalized pin與viewport計算後、async capture開始前同步通知Review UI。Review立即在`document.body`的capture-ignored portal呈現一個fixed live tag，顯示`activeSession.commentCount + 1`；tag使用現有`.sbfx-review__pin`primitive與`--sbfx-error`／foreground／border／radius／focus semantics，不新增token或shared component。Live tag本身為`aria-hidden`的視覺鏡像，避免和composer內可操作的pin產生重複screen-reader內容。

Capture pipeline既有兩個animation-frame等待保留，tag在capture期間可見但因`data-sbfx-capture-ignore`與既有filter不得出現在captured pixels。Capture成功後，`pendingCapture.pin`成為唯一draft source of truth；Story live tag與snapshot preview pin都由該state投影。Composer的preview surface支援click-to-move與Pointer Events drag，將preview DOMRect內的pointer座標經`getVisualCommentPin`轉回clamped `xRatio`／`yRatio`。Pin改為可focus的button，Arrow keys每次移動1 percentage point，Shift+Arrow每次移動5 percentage points，並以現有focus token顯示focus-visible state；集中`FigmaReviewLabels`提供adjustment hint與accessible name。

Submit沿用既有create-comment request並直接讀取最後的`pendingCapture.pin`，因此Save原子寫入screenshot、body與最終point，不新增後端PATCH、store mutation或meeting schema。Cancel composer、capture failure、Story unmount或Save success會清除live tag；panel主動收合時保留pending draft/pin但隱藏tag，重新展開時依目前target bounds重現。Scroll／resize時以normalized pin與capture target目前bounds重新計算fixed tag位置；target暫時不存在時只隱藏Story tag，snapshot preview與draft仍可用。

不讓Story live tag本身直接拖曳，避免再次攔截prototype interaction；位置調整集中在已凍結的snapshot preview，live tag只做同步回饋。也不替換screenshot，因為point座標本來就是相對同一capture的overlay evidence。

### 已儲存 comment point 的 draft 與原子 mutation

Recent panel item與static report card進入Edit時，各自以canonical comment pin建立local draft，並重用Add comment preview的normalized coordinate、Pointer Events與keyboard step規則。Panel editor在既有`.sbfx-review__snapshot-preview`內把read-only pin改為focusable button；report editor則在該comment card內顯示同一張stored image與獨立editable pin，避免一張capture含多筆comment時誤改其他pin。Saved edit不建立Story live tag，因為目前Story DOM與原始capture viewport可能已不同；可操作的source of truth是凍結screenshot上的normalized point。

`PATCH /sessions/:sessionId/comments/:commentId`保留`{ resolved: boolean }`的exclusive lifecycle payload；comment edit payload則接受`body`、`pin`至少一個且最多兩者。Server驗證body trim／length與pin的finite `xRatio`／`yRatio`均位於`0..1`後，serialized store在同一次canonical write更新指定comment，重建report並回傳updated comment。Panel與report的Save changes送出目前body與pin draft，使兩者原子成功或原子失敗；legacy body-only PATCH仍相容。Cancel只清除local drafts並送出零request，failure保留兩份draft與原canonical evidence。

替代方案是讓point edit重新capture目前Story，但這會替換歷史evidence且可能因UI已變更而扭曲review context，因此不採用。另一替代方案是新增獨立pin endpoint，但會使body與point同時修改時產生部分成功；沿用單一PATCH可維持原子性與既有report regeneration queue。

### 單一 config source 與 API capability state

Template 的 preview decorator與 Vite plugin 都從 `.storybook/figma-export.config.ts` 讀取 review status、comments 與 visual capture 設定。`.storybook/project.config.ts` 只保留對同一 config shape 的引用或生成結果，不再持有可漂移的第二組 endpoint values。Generator test 必須比較 preview/server 實際使用的 path、enabled flag、comments directory、capture selector 與 author storage key。

Review UI 將 status API 與 comments API 的 capability state 分開：status 404 顯示具體 endpoint 與設定修復提示，但不錯誤標示 comments storage；comments 無法連線時停用 meeting/comment actions並保留 Reports 導覽。不能以單一 `Save failed` 同時代表兩種服務。

替代方案是讓 server 同時掛載所有發現的 legacy paths，但會掩蓋設定 drift 並留下不可預測的 storage ownership，因此只提供明確 migration，而不做多路徑 alias。

### Canonical build、vendor mirrors 與 downstream smoke

所有 source/test 先在 `design-system-to-storybook/assets/figma-export-addon` 實作，build 產生 dist 後再同步兩份 template vendor mirror。Package 版本升至下一個 minor-safe patch，README、setup reference、template config 與 generator 同步更新。

Downstream smoke 使用目前 Storybook 的 Hero Title Lockup story 驗證：單一 dock 不遮住 card；status 與 comments endpoints 都成功；capture preview 包含黃色 card 與文字；closed meeting 在 Reports 中可見。下游 workspace 只作驗證與安裝測試，不把其產品檔案納入本 repository commit。

### 一致的 Figma icon primitive

Plain-DOM exporter 保持無 React、無 `@storybook/icons` runtime dependency，但其 `svgIcons.figma` 改為逐字對齊 Storybook `FigmaIcon` 的 14×14 viewBox、single filled path 與 `currentColor`。Export header mark 與 `Copy design to Figma` icon-only action 繼續共用同一 primitive，因此不會再次產生兩份幾何。

`Copy JSON`、`Download JSON`、`Console script` 與 collapse icons 的geometry不在本次修正範圍；overlay fixture 直接驗證兩個 Figma icon instance 的 canonical path、填色模式與舊 circle/stroke 幾何已移除。替代方案是讓 plain-DOM exporter import React icon component，但會破壞 renderer-agnostic contract，因此不採用。

### 區隔且置中的 review/export icon semantics

`createIconSpan` 繼續提供 renderer-agnostic inline SVG wrapper；`.sbfx-exporter__mark` 明確使用 flex alignment將 14×14 SVG box置於32×32 mark中央，不再依賴會被 inline `display` 覆蓋的 grid-only `place-items`。Fixture 以 DOMRect center delta不超過0.5 CSS pixel驗證水平與垂直置中。

React `Export review` header 改為沿用 `@storybook/icons` 已存在的 `EyeIcon`，代表預覽與審查；下方 `Figma export` header及 `Copy design to Figma` action繼續使用 canonical `FigmaIcon`。替代方案是為 Review 自製新 SVG，但會重複既有 shared icon primitive，因此不採用。

### 一致的 collapse chevron 與狀態映射

React Review 繼續使用 `@storybook/icons` 的 `ChevronDownIcon`／`ChevronUpIcon`。Renderer-agnostic Export 不增加 React runtime dependency，而是讓 `svgIcons.chevronDown` 與 `svgIcons.chevronUp` 逐字對齊 Storybook 14×14 filled `currentColor` paths，移除原本的近似 stroke geometry。

兩個 controls 採用同一個 state-to-icon contract：`collapsed === true` 顯示 `ChevronDownIcon`，表示點擊可向下展開內容；`collapsed === false` 顯示 `ChevronUpIcon`，表示點擊可向上收合內容。兩者的 `aria-expanded` 仍為 `!collapsed`，accessible label/title依狀態切換 Expand／Collapse，兩份 localStorage preference維持獨立。替代方案是保留原本 Export 方向並只換 path，但仍會讓相同狀態顯示相反方向，因此不採用。

## Implementation Contract

### Behavior

- 開啟 toolbar 的 Figma export global 後，preview SHALL 在右下角顯示一個 `Figma workspace` dock；dock 內 SHALL 同時包含 Figma export 與 Export review sections，且 document 中 MUST NOT 存在兩個互相重疊的export/review fixed panel chrome。
- 右側 dock SHALL 保留 Story canvas 的 inline 空間；窄 viewport bottom dock SHALL 保留 block 空間。Workspace、capture prompt、composer、pin chrome 與 exporter controls MUST NOT 出現在 captured image。
- Visual comments SHALL以右上角獨立surface呈現：預設只顯示36×36的`EditIcon` icon button，且收合header SHALL不保留hidden copy track或column gap，14×14 icon、button與panel的水平／垂直中心差皆不超過0.5 CSS pixel；展開後header左欄SHALL以兩列顯示`Visual comments` subheading與compact、hug-content outline `Reports` button（不得fill container），右欄SHALL顯示同一個Edit icon launcher，meeting、capture與composer detail controls置於header下方；launcher SHALL同步`aria-expanded`與Open／Close accessible label。Start meeting成功後panel SHALL維持展開。
- Active meeting存在時，展開的Visual comments panel SHALL在meeting controls下顯示目前Story依`createdAt`倒序的最新3筆comments，不顯示第4筆或closed meeting資料；每筆 SHALL提供Edit與經頁內確認的Delete，Edit SHALL開啟body-level accessible overlay modal並在其中提供Save／Cancel。成功或失敗的edit／delete mutation MUST NOT自行收合panel。
- Recent comment或report card進入Edit狀態時 SHALL在body editor之前顯示該comment綁定的stored screenshot與normalized pin，使用和Add comment composer相同的preview visual；screenshot MUST為read-only，pin SHALL支援pointer／keyboard adjustment，且Edit／Save／Cancel MUST NOT建立、替換或重新capture screenshot。若該筆legacy evidence無法解析，body editor SHALL保持可用並顯示evidence unavailable狀態，point editor SHALL不可用。
- 同一meeting內目前存在的comments SHALL依canonical `meeting.comments` array順序使用唯一且連續的`1..N` ordinal；ordinal MUST在Story／capture filtering之前衍生。Report snapshot pin、對應comment card heading與panel edit preview SHALL為同一comment顯示相同ordinal，Add comment composer SHALL顯示目前`commentCount + 1`。Body edit或resolution mutation MUST NOT改變ordinal；Delete後再生的overview／report SHALL為剩餘comments重新產生連續序號。
- Add comment point在Story UI被選取後 SHALL在capture promise完成前立即顯示next ordinal live tag；tag MUST被capture-ignore且不得出現在snapshot pixels。Composer SHALL允許使用者在Save前以preview click、pointer drag與keyboard arrows調整draft pin，Story live tag與preview pin SHALL即時顯示相同normalized位置及ordinal。Save SHALL只提交最終draft pin，Cancel／failure SHALL送出零comment requests並清除live tag。已儲存comments的Edit flow SHALL在凍結snapshot內編輯pin且MUST NOT建立Story live tag。
- Point capture 與 comment composer 期間，右下workspace的Export section header MUST 保持可見並可收合；comments detail SHALL在自身panel內捲動，MUST NOT以z-index或DOMRect覆蓋workspace。收合comments panel SHALL保留pending composer draft，但若point-capture listener仍在等待點擊則MUST取消該隱藏capture mode。
- Capture SHALL 包含 capture target 的實際可見 content。全透明輸出 MUST 產生 `Captured image contains no visible pixels.` 類型的可重試錯誤，MUST NOT 呼叫 create-comment API。
- Review panel SHALL 提供且只提供一個 `Reports` meeting瀏覽入口，MUST NOT 渲染active `Open`、`Closed meeting history`、closed meeting cards或任何per-session report links。Reports index SHALL 使用不同label/section呈現current與closed meetings，並為每筆顯示capture/comment counts與session report link；closed meeting data MUST NOT合併進active meeting comment list。
- Canonical Reports index URL SHALL end in `/reports/`，且 legacy `/reports` request SHALL redirect to that directory URL，讓index內的relative `sessions/<id>/index.html` links永遠解析到static report route而不會落入comments sessions API。
- Review status 與 visual comments SHALL 顯示獨立 capability/error state。任何 404 訊息 MUST 包含失敗的 endpoint；comments 可用時，status path 失敗 MUST NOT 停用 meeting/report 功能。
- Export header 與 `Copy design to Figma` icon-only action SHALL 顯示相同的 canonical Figma mark；兩者 MUST NOT 使用舊的近似 stroke/circle 圖形，其他 action icons MUST 保持原語意。
- Export header mark內的 SVG box SHALL 水平與垂直置中。`Export review` header SHALL 顯示 `EyeIcon`，MUST NOT 和 `Figma export` header共用 Figma mark。
- Export review header SHALL維持canonical 14×14 Storybook chevron state mapping。Figma export在expanded state SHALL顯示`ChevronUpIcon`；collapsed state SHALL隱藏chevron glyph並讓icon＋version compact surface本身作為可操作的Expand control。兩者click後內容可見性、`aria-expanded`與Expand／Collapse label SHALL同步更新。
- Wide viewport 的 expanded shared workspace SHALL 精確為 320 CSS pixels，Story canvas SHALL 保留包含既有 24px offset 的 344 CSS pixels。Collapsed workspace SHALL改用icon＋version內容的intrinsic／hug-content width且嚴格小於320px。Figma export actions SHALL 保持既有DOM順序：Copy JSON與Download JSON各自跨越兩欄使用full-width row，`Console script`與`Copy design to Figma`各佔一欄並共用底部row；窄viewport expanded state SHALL保持既有full-width bottom dock與相同action composition，collapsed state則同樣收斂為右側hug-content disclosure。
- Shared workspace SHALL render and expose its named slots in the fixed DOM order `export` then `review`, so Figma export appears above Export review in both side and bottom orientations without changing either section's collapse state or controls.
- When an active meeting can accept a new comment, the default primary capture action SHALL display and expose the accessible name `Add comment`; activating it SHALL enter the existing point-capture flow.
- Each report comment SHALL render an icon-only Delete button with canonical Storybook `TrashIcon` geometry as the first action aligned to the container's left edge. `Copy AI prompt` and Complete／Reopen SHALL retain that order inside one action group aligned to the container's right edge. Activating Delete SHALL open an in-page modal confirmation that names both comment and screenshot consequences and SHALL send no request; only activating Confirm delete SHALL send the DELETE request. Cancel, Escape or closing the dialog SHALL preserve all evidence. A confirmed Delete SHALL remove the comment, remove its capture when no other comment references that capture, and remove the image asset when no remaining capture references the same asset path.
- Each active or closed report comment SHALL provide Edit between `Copy AI prompt` and Complete／Reopen in the right-aligned group. Panel與report editor SHALL在stored screenshot上提供可focus的numbered pin，支援click、Pointer Events drag、Arrow `0.01`與Shift+Arrow `0.05`且clamp至`0..1`。Saving SHALL atomically update that comment's valid body and normalized pin then reload canonical projections；Cancel SHALL send no request，failed PATCH SHALL keep canonical evidence unchanged and retain both drafts.
- Reports的每個`.snapshot` canvas SHALL在light與dark color schemes都使用addon既有`--sbfx-surface-raised`暗灰semantic surface；stored image SHALL繼續以contain完整顯示，透明像素與letterbox不得回退成白色背景。

### Interface and data shape

- Workspace DOM contract: one element carrying `data-sbfx-workspace`, with the named export slot immediately before the named review slot and `data-sbfx-capture-ignore`; document root carries open/orientation state only while at least one slot is mounted.
- Comments DOM contract: one independent `.sbfx-comments-panel` portal carrying `data-sbfx-capture-ignore` and `data-expanded`; collapsed state exposes one 36×36 icon-only `EditIcon` launcher whose header uses one track with zero inter-column gap, and whose 14×14 SVG, button and panel centers differ by at most 0.5 CSS pixel on both axes. Expanded state contains one header grid whose left column stacks the subheading and unique outline Reports anchor while its right column contains the same launcher. The Reports anchor uses intrinsic width, start alignment and compact height/padding instead of filling the left column. The launcher controls one meeting/capture/composer detail region through `aria-controls` and synchronized `aria-expanded`, while the document root exposes comments-open state only while the panel is expanded. The active detail contains at most three current-story comment items sorted by descending `createdAt`; each item owns edit/delete controls and one item at a time may project body／pin drafts into a separate body-level `[data-comment-edit-modal]` backdrop carrying `data-sbfx-capture-ignore`, with a labelled `role="dialog"`／`aria-modal="true"` surface larger than the 320px panel at wide viewports and bounded within the viewport at narrow sizes. A private story-scoped `sessionStorage` continuation marker is written before Start／End／Save／Edit／Delete comment mutations, time-bounded, consumed on remount, and cleared by explicit collapse; it is not a persisted preference or public option.
- Pending point DOM contract: after point selection and while the panel remains open, one body-level element marked `data-sbfx-live-comment-pin` and `data-sbfx-capture-ignore` SHALL mirror the draft pin as a fixed, `aria-hidden` numbered circle. The composer snapshot pin SHALL be a focusable button exposing the next ordinal and centralized adjustment instructions; preview pointer coordinates SHALL pass through `getVisualCommentPin`, Arrow keys SHALL change each ratio by`0.01`, Shift+Arrow by`0.05`, and every result SHALL be clamped to`0..1`. No live pin SHALL remain after Cancel, capture failure, successful Save or unmount.
- Existing `createFigmaExportDecorator`, `createFigmaExportReviewDecorator`, `createFigmaReviewStatusPlugin` and public options remain source compatible.
- Visual comment overview session summaries add integer `captureCount` and `commentCount` fields；overview `comments` remains the current active meeting filtered by optional `storyId` and exposes the stored `id`, `authorName`, `body`, `createdAt`, optional `resolvedAt`, top-level derived `ordinal: number`, and derived `preview: { imageUrl: string; width: number; height: number; pin: { xRatio: number; yRatio: number } } | null` needed by the panel. `ordinal` SHALL be computed from the unfiltered canonical meeting comment array before optional Story filtering；`imageUrl` SHALL be a same-origin `${basePath}/reports/sessions/<sessionId>/assets/<filename>` URL derived server-side from the comment's canonical capture. Canonical `meeting.json` version remains 1 and MUST NOT persist the derived URL or ordinal.
- `.storybook/figma-export.config.ts` is the endpoint/config source consumed by both preview and server wiring. Generated configuration SHALL keep `review.apiPath`, `review.commentsApiPath`, `review.commentsDir`, `review.commentsEnabled`, `review.visualComments.apiPath`, `captureSelector` and `authorStorageKey` consistent.
- Overview response 的 `recentSessions`、`activeReportUrl`、`captureCount`、`commentCount`與既有no-slash `reportUrl` fields保持相容；panel只使用overview `reportUrl`作為唯一Reports link。Static Reports index projection SHALL只渲染`captureCount > 0 || commentCount > 0`的meeting，空active／closed group SHALL不輸出heading，全部meeting皆空時SHALL輸出單一empty state。`${basePath}/reports` SHALL redirect至`${basePath}/reports/` canonical directory URL，而static session report paths、meeting JSON與既有comments API routes保持穩定。
- `svgIcons.figma` SHALL 保持 plain-DOM SVG string，使用 `viewBox="0 0 14 14"`、`fill="currentColor"` 與 Storybook `FigmaIcon` 的 canonical path；icon-only action 的 `aria-label`／`title` 仍為 `Copy design to Figma`。
- `.sbfx-exporter__mark` 的32×32 slot SHALL 以 flex alignment置中其14×14 SVG；Review header SHALL 使用既有 `EyeIcon` component且保留 decorative `aria-hidden` wrapper。
- Plain-DOM `svgIcons.chevronDown`／`svgIcons.chevronUp` SHALL 使用 Storybook canonical filled paths、`viewBox="0 0 14 14"`、`fill="currentColor"`，不得使用舊的 stroke-only geometry；Review 與 Export 的 `aria-expanded` SHALL 等於各自 `!collapsed`，兩份 collapse storage keys維持不變。
- Workspace root SHALL以`data-export-collapsed`同步Figma export的collapsed state；值為`true`時review slot SHALL不可見且不佔layout空間，root與exporter SHALL使用intrinsic width，`.sbfx-exporter__title-label`、subtitle與chevron glyph SHALL不可見且不佔欄位，只保留mark與`.sbfx-exporter__version`，而既有toggle SHALL覆蓋compact header並維持Expand accessibility；值為`false`時SHALL恢復wide 320px root、完整export header、原slot與Review既有`data-collapsed`狀態。父層切換MUST NOT改寫Review collapse storage。Visible version contract SHALL只包含`.sbfx-exporter__version`，Review header MUST NOT render `.sbfx-review__version`。
- Layout contract: wide expanded `.sbfx-workspace` 與 standalone `.sbfx-exporter` 使用320px inline size；collapsed state改用max-content且小於320px，expanded workspace reserved inline-size為344px；`.sbfx-exporter__actions`為兩欄grid，前兩個action跨越全部欄位，後兩個action各佔一欄。`actionLabels.script.idle`為`Console script`，其busy/done feedback與`Copy design to Figma`的accessible name保持不變。窄viewport expanded orientation與左右offset保持原契約，collapsed root只保留inline-end offset與intrinsic width。
- Comments labels contract: `FigmaReviewLabels`新增source-compatible的open／close comments、Edit comment、Save changes、Cancel、Delete comment與delete-confirmation labels並由`defaultLabels`提供預設值；launcher只以`EditIcon`呈現，不以可見文字取代icon-only contract。
- Comment evidence labels／style contract: `FigmaReviewLabels`新增source-compatible的evidence unavailable文案；panel與report editor重用`.sbfx-review__snapshot-preview`／`.sbfx-review__pin`的geometry與centralized point-adjustment copy，editable saved pin使用button／focus-visible semantics；static report token map重用`--sbfx-surface-raised`作為snapshot背景，不新增shared component或產品token。
- Comment ordinal contract: overview／report generator SHALL建立同一份meeting-wide `comment.id → arrayIndex + 1`衍生規則；panel existing-comment pin讀取top-level `comment.ordinal`，pending Add comment pin讀取`activeSession.commentCount + 1`，report pin與card heading讀取meeting-wide map而非capture-local filtered-array index。
- Capture controller contract: `beginVisualCommentCapture`新增optional point-selected callback但保留既有callers；callback SHALL在normalized pin／viewport建立後且production capture promise settle前觸發。`VisualCommentCaptureResult`與`CreateVisualCommentRequest.pin` shape保持不變，mutable pending pin只存在client memory。
- Pending point labels／style contract: adjustment hint與focusable pin accessible name SHALL來自source-compatible `FigmaReviewLabels` defaults；live／preview tag重用既有`--sbfx-error`、foreground、border、radius與focus conventions，不新增display text literal、design token或shared component。
- Copy contract: `FigmaReviewLabels.addVisualComment`與`defaultLabels.addVisualComment` keys保持不變；default value為`Add comment`，consumer-provided override仍取代default。
- Delete response contract: successful `DELETE /sessions/:sessionId/comments/:commentId` SHALL retain `deletedCommentId` and add nullable `deletedCaptureId` and `deletedAssetPath` fields describing reference-aware screenshot cleanup; canonical `meeting.json` remains version 1.
- Comment PATCH contract: `PATCH /sessions/:sessionId/comments/:commentId` SHALL accept either exclusive `{ "resolved": boolean }` or an edit object containing one or both of `{ "body": string, "pin": { "xRatio": number, "yRatio": number } }` and no unknown fields. `body` is trimmed and MUST be non-empty and no longer than `VISUAL_COMMENT_LIMITS.maxBodyLength`; both pin ratios MUST be finite and within `0..1`. A successful edit SHALL atomically update only supplied body／pin fields, preserve authorName, captureId, createdAt, resolvedAt, capture and image asset, and return the updated comment plus `reportStale`.
- Report action DOM contract: each `.comment__actions` places one `button[data-comment-action="delete"]` as its first element child and left-aligned control, followed by one right-aligned end-action wrapper containing `button[data-comment-action="copy-ai-prompt"]`, `button[data-comment-action="edit"]`, then `button[data-comment-action="resolve"]`. Delete exposes `aria-label` and `title` as `Delete comment` and contains the canonical 14×14 Trash SVG as decorative content. Each card owns a textarea plus Save changes／Cancel controls hidden until edit begins. One page-level `[role="dialog"][data-delete-dialog][aria-modal="true"]` overlay owns Cancel／Confirm delete controls and toggles via `hidden` without native dialog APIs；the nonce-authorized script keeps at most one pending delete card/button, handles Escape/backdrop close and focus return, then invokes the existing same-origin DELETE endpoint only after confirmation.
- Report refresh contract: GET of the Reports index or a session `index.html` SHALL serialize behind canonical mutations, regenerate that HTML projection from current store state or `meeting.json`, then serve it; screenshot asset GET SHALL NOT trigger report regeneration.

### Failure modes

- Workspace slot mount/unmount MUST be idempotent across story rerenders and HMR; one section failing to mount MUST NOT remove the other section's slot.
- Story rerender、HMR或不同section mount timing MUST NOT reverse the fixed export-before-review slot order or create duplicate slots.
- Comments portal mount/unmount MUST NOT acquire a workspace slot or duplicate its launcher。Comments展開時若可用高度不足，兩個surface SHALL各自捲動且MUST NOT互相重疊；收合時若point capture仍armed，listener與prompt SHALL被取消。Start／End meeting與overview polling造成的server state更新MUST NOT改寫使用者已展開的local panel state。
- Invalid selector、zero bounds、clone timeout、decode failure、all-transparent pixels、encode limit 與 server save failure SHALL preserve the last recoverable user state described by the existing comments contract and SHALL NOT write partial assets.
- Missing status API and missing comments API SHALL be diagnosed separately。Comments capability失敗時，panel SHALL 保留可用的單一 `Reports` navigation，且MUST NOT claim a comment was lost when a closed meeting still exists in `recentSessions`。
- Report generation failure after canonical save SHALL retain canonical JSON/assets and continue to signal report pending.
- Reports index的session link MUST NOT解析成`${basePath}/sessions/...` API route；若index由legacy no-slash URL進入，server SHALL先redirect再serve index。
- Initial Delete activation, Cancel, Escape and dialog close SHALL send no request and preserve the comment, capture and asset; stale pending-card state SHALL be cleared when the dialog closes. Unknown comment SHALL回404；empty／over-limit body、non-finite／out-of-range pin、resolved混用、empty edit object、unknown field或其他invalid PATCH body SHALL回400且不得改寫canonical comment。Comment edit request失敗時panel／report SHALL保留body與pin drafts及原canonical values，並只在相應item/card顯示error。Canonical meeting write失敗時asset SHALL NOT be removed；missing asset during eligible cleanup SHALL be treated as already removed。Report regeneration失敗 SHALL回傳`reportStale: true`但MUST NOT回滾已完成的canonical mutation。
- Overview解析不到comment對應的capture／asset metadata時 SHALL回傳該comment的`preview: null`，MUST NOT讓其他comments或meeting controls載入失敗；panel SHALL保留body editor與body-only mutation能力、停用point editing並顯示evidence unavailable狀態。Preview image載入失敗 SHALL保留body draft與controls，不得觸發recapture、送出未知point或覆寫canonical evidence。
- Canonical comments存在重複`createdAt`、跨Story或跨capture時 SHALL仍以array位置產生唯一ordinal，不得依timestamp或filtered subset造成collision；unknown／missing capture只讓該comment preview為null，但其array位置仍參與後續comments的meeting-wide ordinal。Delete後derived projections若無法重建 SHALL沿用既有reportStale failure contract且不得改寫canonical sequence。
- Capture失敗、transparent rejection或使用者在capture完成前按Escape時 SHALL移除immediate live tag並保持create-comment request count為零。Preview drag移出bounds或keyboard adjustment超出邊界時 SHALL clamp而非丟失draft；target在scroll／resize期間不可解析時 SHALL暫時隱藏Story tag且MUST NOT清除pending screenshot、pin、author或body。Panel收合 SHALL隱藏live tag但沿用既有draft retention，重新展開後可繼續調整。
- A stale or pre-upgrade derived report HTML file MUST NOT bypass the current Delete confirmation UI when its canonical meeting JSON is readable; GET regeneration failure SHALL surface through the existing report error response without modifying canonical evidence.
- Confirmed Delete移除meeting最後一筆comment及其未引用capture後，regenerated Reports index MUST NOT保留該`0 captures · 0 comments` meeting card或空分組heading；filtering failure MUST NOT刪除canonical meeting JSON或破壞直接session report URL。

### Acceptance criteria

- `npm run test:visual-comments` passes including real-pixel capture, workspace layout/composer, HTTP and report history assertions.
- Existing export, overlay and payload-store fixtures pass without changing export payload output.
- `node design-system-to-storybook/scripts/test_generate_figma_export_config.mjs` proves one config source drives preview and server endpoints.
- Storybook template typecheck/build passes; canonical addon source/dist/package and both vendor mirrors match recursively.
- Browser smoke at the Hero Title Lockup story confirms one dock, unoccluded Story UI, persistent Export entry during composer, non-empty screenshot preview, working status/comments requests and discoverable closed-session evidence.
- Visual-comment fixture與Hero Title Lockup browser smoke SHALL確認wide workspace固定於右下、comments launcher固定於右上且預設只顯示`EditIcon`；收合狀態的panel／button邊界貼齊且SVG／button／panel中心差各軸不超過0.5 CSS pixel；點擊後detail可見、`aria-expanded`／accessible label同步、Reports與meeting controls仍可操作，comments detail與workspace DOMRect不重疊，收合後detail隱藏。
- Visual-comment fixture與Hero Title Lockup browser smoke SHALL確認展開header左欄為`Visual comments` subheading加compact、hug-content outline `Reports` button兩列（button寬度小於左欄且高度小於原32px control）、右欄Edit icon button與左欄同列；點擊`Start meeting`或`Save comment`並等待overview更新／同Story remount後，panel仍為`data-expanded="true"`且相應meeting detail可見。
- Visual-comment fixture SHALL建立同一active meeting內目前Story的4筆comments與另一Story的comment，確認panel只依`createdAt`倒序顯示目前Story最新3筆；並驗證Edit可調整stored pin、Cancel零request且還原body／pin、Save送出單一body＋pin PATCH且保留展開狀態、Delete首次點擊零request而Confirm送出單一DELETE且更新最近3筆。
- Visual-comment fixture與Hero Title Lockup browser smoke SHALL確認recent comment的Edit在body-level開啟單一labelled `role="dialog"`／`aria-modal="true"` overlay，wide modal與stored screenshot preview均比320px panel更容易檢視且narrow modal不超出viewport；Escape、backdrop與Cancel關閉modal、送出零request並return focus，Save成功關閉modal且panel保持展開，Save失敗保留modal與body／pin drafts。
- Store／HTTP fixtures SHALL驗證overview每筆current-story comment的derived preview使用正確same-origin report asset URL、stored dimensions與normalized pin，missing capture時回`preview: null`且overview仍為200。Visual-comment fixture SHALL驗證只有進入Edit的item顯示和Add comment composer相同的snapshot＋editable pin preview，click／drag／keyboard更新local pin，Cancel／Save後preview隨editor關閉且不產生capture request；missing preview只允許body edit。
- Store／HTTP fixtures SHALL以同一meeting的跨Story／跨capture comments驗證overview在filter前衍生ordinals；visual-comment fixture SHALL確認existing editor pin顯示其meeting-wide ordinal、pending Add comment顯示`commentCount + 1`。Report fixture SHALL確認三個不同captures的pins與card headings依序為`1, 2, 3`而非三個`1`，並確認body edit／Complete／Reopen不改號、Delete後剩餘comments在regenerated report連續重編為`1, 2`。
- Visual-comment fixture SHALL以delayed capture promise證明pointerdown後、capture完成前即顯示capture-ignored next-ordinal live tag；確認production capture pixels不含tag。Fixture SHALL驗證preview click、drag、Arrow與Shift+Arrow同步更新preview／Story tag、clamp ratios並讓Save request攜帶最終pin；Cancel、failure與unmount移除tag且送出零comment requests，panel收合／重開則隱藏／恢復同一draft位置。Browser smoke SHALL在Hero Title Lockup上確認point `N`立即可見、可於preview移動且Save後report pin使用最終位置。
- Report fixture SHALL驗證`.snapshot`在light與dark color schemes都由`--sbfx-surface-raised`提供暗灰computed background，圖片仍使用`object-fit: contain`且既有pin／comment actions不變。
- Overlay fixture 與 Hero Title Lockup browser smoke確認 Export header／右下 action 的兩個 Figma icon 都使用 canonical geometry，且 copy/download/command icons 未改變。
- Overlay fixture SHALL 量測 Export mark與SVG center delta不超過0.5 CSS pixel；visual-comment fixture與 Hero Title Lockup screenshot SHALL 確認 Review header為EyeIcon、Export header為置中FigmaIcon。
- Overlay fixture SHALL驗證Export expanded state的canonical up path及collapsed state隱藏chevron glyph，同時兩個state的`aria-expanded`與labels保持正確；visual-comment fixture及Hero Title Lockup browser smoke SHALL驗證切換後內容／父層slot同步且preferences仍獨立。
- Overlay／visual-comment fixtures與Hero Title Lockup browser smoke SHALL驗證收合Figma export後workspace只留下Figma mark＋version、title／subtitle／chevron與review slot皆不可見或不佔layout、wide與narrow collapsed workspace皆為hug-content且小於320px；重新展開後wide workspace精確回到320px、完整header與Review先前內部collapse狀態恢復，且workspace只有一個visible version badge並位於Figma export header。
- Report fixture SHALL驗證Delete icon button使用canonical Trash paths且為comment action row第一個element並貼齊container左側，`Copy AI prompt`、Edit與Complete／Reopen依序位於同一個貼齊container右側的group；同時驗證頁內dialog文案與accessible wiring完整，並以isolated action-script fixture證明initial click與Cancel皆為零requests、Confirm delete才送出一次DELETE。HTTP fixture SHALL覆寫derived session HTML為stale sentinel並證明下一次GET由canonical meeting重建新版dialog；downstream session report browser smoke SHALL確認左右分離的action composition、dialog可見且Cancel不移除comment。
- Store／HTTP fixtures SHALL驗證edit PATCH對active與closed meetings皆可用，接受body-only、pin-only與body＋pin，原子更新指定comment supplied fields並preserve author／capture／createdAt／resolvedAt，拒絕empty／over-limit／non-finite／out-of-range／resolved混用／unknown-field payload且unknown comment回404。Report fixture SHALL驗證right group為Copy AI prompt→Edit→Complete／Reopen、Edit preview pin的pointer／keyboard adjustment、Cancel零request、成功Save以單一PATCH reload regenerated body／pin、失敗Save保留兩份draft並只顯示card-local error。
- Report／HTTP fixtures SHALL驗證closed meeting刪除最後一筆comment及未引用capture後，重新產生的Reports index不含該meeting、`0 captures · 0 comments`卡片或已空的closed heading；若active與closed皆無evidence則只顯示單一empty state，而直接session report與canonical meeting JSON仍可讀。
- Overlay fixture SHALL 在wide viewport量測workspace width為320 CSS pixels，確認Copy JSON與Download JSON的水平起點／寬度一致且各佔full-width row，並確認`Console script`與`Copy design to Figma`具有相同top、相等欄寬且不重疊；visual-comment fixture SHALL繼續驗證narrow viewport使用bottom dock並保持相同action composition。
- Visual-comment fixture SHALL在wide與narrow viewport確認workspace的第一個named slot為export、第二個為review，且實際Figma exporter top小於Export review top；Hero Title Lockup browser smoke SHALL確認相同順序與320px／compact actions契約。
- Visual-comment fixture SHALL以`Add comment`定位並操作capture action，並確認rendered Review panel不存在舊的`Add visual comment`文案；Hero Title Lockup browser smoke SHALL確認按鈕可見、enabled且accessible name為`Add comment`。
- Visual-comment fixture SHALL 驗證panel只有一個 `Reports` link、沒有active `Open`／`.sbfx-review__history`／`.sbfx-review__history-item`，而report fixture仍驗證active/closed groups、counts與session evidence；Hero Title Lockup browser smoke SHALL 點擊 `Reports` 並確認meeting index可開啟。
- Visual-comments HTTP fixture SHALL驗證既有overview `reportUrl`保持相容、legacy `/reports` redirect的`Location`，以及redirect後index內的session link可導向200 static report；browser smoke SHALL從Reports index實際點擊一筆`Open report`並看到session evidence而非405／blocked page。
- Store／HTTP fixtures SHALL驗證version 1 legacy comments預設Open、Complete idempotency、Reopen、closed-meeting mutation、unknown ID errors，以及confirmed Delete減少commentCount與unreferenced captureCount、使unshared asset URL回404，同時保留仍被其他capture引用的shared asset；report fixture SHALL驗證明確confirmation copy、status/actions、escaped identifiers、nonce CSP與per-card error region。
- Downstream browser smoke SHALL在closed session report完成Open→Completed→Open，取消一次Delete並確認comment與snapshot仍存在，再建立專用smoke comment、確認Delete後該comment與snapshot都消失且asset URL回404。
- `spectra validate integrate-figma-export-review-workspace` and artifact analysis complete without Critical or Warning findings before archive.

### Scope boundaries

- In scope: addon preview/review workspace layout（包含wide expanded 320px、collapsed icon＋version hug-content width、右下位置、兩個full-width export rows、底部雙欄utility row與export-before-review section order）、右上獨立且由Edit icon launcher展開的visual comments panel、compact subheading／outline Reports header、meeting與comment mutation期間的open-state continuity、目前Story／active meeting最新3筆comment管理、panel與Reports edit狀態的stored snapshot＋editable normalized pin evidence preview、Add comment Save前的immediate numbered live tag與pending pin click／drag／keyboard adjustment、meeting-wide連續comment ordinals、panel／active／closed report plain-text body與point原子edit、Reports暗灰snapshot canvas、`Console script` action copy、visual comment capture action預設copy、visual capture validity, report discoverability, left-aligned Delete and right-aligned prompt/edit/resolution action composition, confirmed per-comment resolve/delete mutation and reference-aware capture/asset cleanup, config generation/wiring, canonical build artifacts, vendor mirrors, tests and documentation.
- Out of scope: Storybook manager panel architecture, remote persistence, authentication,已儲存comment的 author／capture／screenshot／`createdAt` editing or replacement, Story live tag直接拖曳, saved point edit時重新capture或project到目前Story DOM, rich text or collaborative editing, comments open-state persistence, panel closed-meeting history, bulk mutation, delete undo, unrelated/global asset garbage collection, product component redesign, Figma payload/import changes and committing downstream product files.

## Risks / Trade-offs

- [Reserved dock space changes responsive story viewport] → 不縮放 Story；browser fixture 同時驗證 wide right dock 與 narrow bottom dock，並讓使用者可收合 workspace。
- [React portal lifecycle與 plain-DOM overlay不同步] → Coordinator 以具名 slot presence/refcount 管理，不以 React render 次數判斷整體 teardown。
- [Collapsed visual chrome雖隱藏但空白toggle column仍撐寬] → collapsed toggle以absolute inset成為整個compact header的click／focus layer，fixture同時量測visible children與workspace DOMRect。
- [Canvas pixel scan增加 capture latency] → 僅在最多 4 megapixels 的既有限制內掃描 alpha，encode 前一次完成。
- [Inline report CSS與 addon tokens漂移] → Report generator使用同名 `--sbfx-*` semantic variables並由 snapshot test 驗證必要結構，不複製產品 tokens。
- [Legacy projects仍持有兩份 config] → Generator/reference 提供明確 migration；runtime error 顯示實際 endpoint，不靜默掛載 alias。
- [Plain-DOM SVG 與上游 Storybook icon未來漂移] → 以 canonical path fixture鎖定目前契約；升級 `@storybook/icons` 時必須顯式更新兩端與 snapshot assertion。
- [Icon wrapper inline style覆蓋layout class] → Mark class同時定義flex-axis alignment，並以實際DOMRect而非僅CSS文字做fixture驗證。
- [Chevron方向被誤解為目前狀態或下一個動作] → 以兩個 section現有 Review convention為單一 contract：collapsed/down、expanded/up，並同時測試 icon path、`aria-expanded`、label與內容狀態。
- [移除panel list讓使用者誤以為歷史資料被刪除] → 保留清楚且唯一的 `Reports` link，browser smoke實際打開Reports index並驗證closed meeting仍存在；只有使用者在session report明確確認Delete時才移除指定comment。
- [無登入的local report mutation誤觸或被跨來源呼叫] → mutation routes不提供CORS、report script只使用same-origin fetch、Delete要求browser confirmation，且本能力明確限於本機Storybook review workspace。
- [Delete誤刪其他comment共用的review evidence] → 只有在capture沒有其他comment reference時移除capture，只有在asset path沒有其他capture reference時unlink實體檔；store fixture覆蓋shared reference。
- [320px width讓長label或狀態文字擁擠] → 兩個主要JSON actions維持full-width，utility copy縮短為`Console script`後才與icon-only Figma action共用等寬底部row；fixture量測欄寬與無重疊，窄viewport維持bottom dock。
- [Mount timing讓section順序在rerender後漂移] → Coordinator預先以固定`export`、`review`順序建立兩個named slots，fixture在初次render與story rerender後都驗證DOM順序。
- [Copy rename意外破壞consumer override] → 只改`defaultLabels.addVisualComment` value、不改public key，fixture同時鎖定新預設copy與既有互動流程。
- [右上comments detail與右下workspace在矮viewport相撞] → comments open document state限制兩個surface的可用block size並啟用各自內部scroll；fixture在wide與narrow量測DOMRect不重疊。
- [收合comments時留下不可見point-capture listener] → toggle在armed capture狀態呼叫既有cancel flow；pending composer draft則保留在mounted component內供重新展開。
- [Meeting或comment asset寫入觸發preview remount並重設open state] → mutation前寫入短效、story-scoped continuation marker，launcher local state仍只由顯式toggle改變；fixture鎖定Start meeting與Save comment後的overview／remount state及`aria-expanded`。
- [最近3筆排序或edit後refresh造成使用者操作的comment跳動] → 只以server-generated `createdAt`倒序且body edit不改時間；Delete後由canonical overview補入原第4筆，fixture鎖定精確順序與panel展開狀態。
- [Body／pin PATCH意外部分成功或覆寫evidence metadata] → `updateCommentDetails`先完整驗證edit payload，再以一次serialized canonical write更新supplied fields並重建reports；store fixture逐欄比對author、captureId、createdAt、resolvedAt、capture與asset，invalid request逐欄確認body／pin都未改變。
- [Overview preview URL洩漏filesystem path或在自訂base path失效] → Store只回傳session-relative asset metadata，server以configured `basePath`產生same-origin report asset URL；HTTP fixture使用非預設base path鎖定URL與200 asset response。
- [Edit preview讓320px panel過高或誤認為可替換截圖] → 重用composer既有contain preview與internal scrolling，editable affordance只放在numbered pin且不渲染upload／recapture control；fixture確認preview只在editing item內出現。
- [Modal遮住目前Story或留下孤立focus] → 只在participant明確點擊Edit時顯示capture-ignored backdrop，Escape／backdrop／Cancel與panel collapse／unmount都關閉modal並return focus；使用較大snapshot是為了精確比對凍結evidence，關閉後立即恢復Story操作。
- [Saved screenshot viewport與目前Story不同導致live projection誤導] → saved point只在凍結snapshot preview內編輯，不建立Story live tag；Save只寫入normalized pin。
- [Story／capture filter讓同一comment在不同surface得到不同序號] → 在任何filter前由canonical array建立meeting-wide ID map，overview與report fixtures以跨Story／跨capture資料鎖定相同ordinal。
- [Delete造成序號缺口或需要schema migration] → Ordinal不持久化，canonical Delete完成後由剩餘array重新產生連續`1..N`；fixture驗證regenerated projections。
- [Immediate tag被截進evidence或遮住prototype click] → Point-selected callback先攔截原始pointer，再以capture-ignored body portal呈現non-interactive tag；production pixel fixture與pointer assertions同時驗證。
- [Drag與Story live tag產生兩份pin state] → `pendingCapture.pin`是唯一draft source，兩個surface只做projection；Save request fixture比對最終normalized ratios。
- [Small preview難以精準拖曳或不支援keyboard] → 同時提供click-to-move、Pointer Events drag、Arrow 1%與Shift+Arrow 5%，並沿用既有focus-visible token。

## Migration Plan

1. 更新 canonical addon source、tests、dist 與版本。
2. 將 canonical addon完整同步至兩份 Storybook template vendor mirrors，更新 template imports/config generator/reference。
3. 執行 addon fixtures、generator test、template typecheck/build與 mirror parity check。
4. 在 downstream Storybook 安裝新 vendor/package、使 preview與 server共同讀取 figma-export config並重新啟動 Storybook。
5. 使用既有 meeting JSON/assets 驗證歷史 report，另建立暫時 meeting驗證真實 capture；測試 meeting 必須清楚命名並於驗證後關閉。
6. Rollback 時還原 addon與 template版本；version 1 meeting JSON/assets保持可讀，不需資料 migration。
7. 既有version 1 comments沒有`resolvedAt`時視為Open；不執行eager migration，首次Edit／Complete／Reopen／Delete才原子寫回該meeting並重建reports。Body edit不新增schema version或`updatedAt`。

## Open Questions

(none)
