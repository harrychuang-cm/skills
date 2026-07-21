## 1. 整合 workspace layout

- [x] 1.1 依「單一 workspace dock 與共享 slots」實作 `Integrated Figma workspace dock`：建立 idempotent document-level coordinator，讓既有 React Review 與 plain-DOM Export 掛入同一個 right/bottom dock、保留 canvas 空間且不產生 duplicate root；以 visual comment browser fixture 的 wide、narrow、rerender assertions 驗證。
- [x] 1.2 依「Story canvas 保留區與 capture 邊界」實作 `Export access persists throughout visual review`：capture prompt 與 composer 只能在 workspace 內捲動，Figma Export header 在 capture/composer 狀態仍可見且兩個 collapse preferences 獨立；以 `run-visual-comment-fixture.mjs` 的 capture、composer、story-change assertions 驗證 Story UI 未被 panel 或 z-index 遮住。

## 2. 修正真實 screenshot capture

- [x] 2.1 依「真實 DOM capture 與有效像素檢查」實作 `Rendered-pixel capture validity`：production `html-to-image` capture SHALL 畫出 target content與 resolved background、拒絕 all-transparent pixels並沿用 size/byte limits；以真實 DOM fixture 解碼 WebP/PNG 並 assert visible content pixels，不使用 injected capture stub 作為此項驗證。
- [x] 2.2 完成 capture failure 與 ignore boundary：`body` capture SHALL 排除整個 `data-sbfx-capture-ignore` workspace，zero bounds、timeout、decode、transparent 與 encode failure SHALL 保留可重試狀態且送出零 requests；以 browser fixture 的 API-call counter、error copy與 snapshot assertions 驗證。

## 3. 改善 meeting 與 report 導覽

- [x] 3.1 依「Active 與歷史 meeting 導覽」擴充 overview derived summary：active/recent session SHALL 回傳 `captureCount` 與 `commentCount`，closed meeting storage version仍為 1且既有 JSON 可讀；以 `run-visual-comment-store-test.mjs` 與 `run-visual-comment-http-test.mjs` 驗證 counts、ordering、active/closed boundary。
- [x] 3.2 實作 `Discoverable active and historical meetings`：panel、report index與session report SHALL 分組 current/closed meetings、顯示 counts、返回導覽與完整 snapshot/pin/comment/story evidence，空 session 不再是孤立的 `No comments yet`；以 `run-visual-comment-report-test.mjs` 的 HTML structure、escaping、counts與asset-link assertions 驗證。

## 4. 統一 config 與 capability 狀態

- [x] 4.1 依「單一 config source 與 API capability state」實作 `Single-source Storybook review configuration`：preview、Vite plugin、template與generator SHALL 從同一 Figma project config取得 status/comments endpoints、directory、capture selector與author storage key，split paths SHALL 讓 generator/template verification失敗並列出兩端值；以 `node design-system-to-storybook/scripts/test_generate_figma_export_config.mjs` 與 template typecheck驗證。
- [x] 4.2 實作 `Comment capability failure is actionable` 與 `Capability-scoped workspace status`：Export、review-status、comments SHALL 各自顯示 operation/endpoint error，一項 404 MUST NOT 隱藏或停用其他可用 capability，成功 poll SHALL 復原 comments controls；以 review fixture 的 status-404/comments-200、comments-404/status-200、recovery assertions驗證。

## 5. 發佈一致性與實例驗證

- [x] 5.1 依「Canonical build、vendor mirrors 與 downstream smoke」更新 addon patch version、README/setup reference與 build dist，再完整同步兩份 vendor mirrors；以 `npm run test:visual-comments`、既有 export/overlay/payload fixtures、template typecheck/build、`git diff --check`及 recursive mirror parity驗證。
- [x] 5.2 對 Hero Title Lockup Storybook 完成 downstream browser smoke，逐項確認 Implementation Contract 的 `Behavior`、`Interface and data shape`、`Failure modes`、`Acceptance criteria` 與 `Scope boundaries`：單一 dock不遮 Story、composer內Export入口持續可見、兩個 API path成功、capture含黃色card與文字、closed meeting evidence可開啟；最後執行 `spectra analyze integrate-figma-export-review-workspace --json` 與 `spectra validate integrate-figma-export-review-workspace`。

## 6. 修正 Figma export iconography

- [x] 6.1 依「一致的 Figma icon primitive」實作 `Semantic Figma export iconography`：讓 plain-DOM Export header mark 與 `Copy design to Figma` action 共用 Storybook `FigmaIcon` 的 canonical 14×14 filled path，保留 `currentColor`、既有 accessible name及 copy/download/command/collapse icons；以 `run-overlay-fixture.mjs` 的兩個 canonical path assertions、addon build／mirror parity及 Hero Title Lockup browser screenshot驗證。
- [x] 6.2 依「區隔且置中的 review/export icon semantics」完成 `Semantic Figma export iconography` 與 `Distinct review iconography`：以flex-axis alignment讓32×32 Export mark內的14×14 Figma SVG水平／垂直center delta不超過0.5 CSS pixel，並將 `Export review` header改用既有Storybook `EyeIcon`、保留decorative `aria-hidden`與下方Figma action語意；以 `run-overlay-fixture.mjs` DOMRect assertions、visual-comment fixture icon assertion、addon build／mirror parity及 Hero Title Lockup browser screenshot驗證。
- [x] 6.3 依「一致的 collapse chevron 與狀態映射」完成 `Consistent workspace collapse controls`：讓 plain-DOM `svgIcons.chevronDown`／`svgIcons.chevronUp` 使用 Storybook canonical 14×14 filled `currentColor` paths，並統一 Review／Export 為 collapsed/down、expanded/up；click後內容、icon、`aria-expanded`、Expand／Collapse label及獨立localStorage preference SHALL 同步，以 `run-overlay-fixture.mjs` exact-path/state assertions、visual-comment fixture兩個section的matched-state／independent-state assertions、addon build／mirror parity及 Hero Title Lockup browser screenshot驗證。

## 7. 收斂 panel meeting 導覽

- [x] 7.1 依「Active 與歷史 meeting 導覽」更新 `Discoverable active and historical meetings` 與 `Comment capability failure is actionable`：Review panel SHALL 只保留單一overview `reportUrl` 的 `Reports` link，移除active `Open`、`Closed meeting history` heading、closed meeting cards與相關unused CSS，但保留`recentSessions`／`activeReportUrl` API及Reports index/session evidence；以visual-comment fixture唯一Reports/no-history assertions、report fixture active/closed counts/evidence、完整`npm run test:visual-comments`、addon build／mirror parity、Hero Title Lockup點擊Reports browser smoke與screenshot驗證。
- [x] 7.2 修正Reports index的relative session link在no-trailing-slash URL被解析到comments API：保留既有overview `reportUrl`，legacy `${basePath}/reports` SHALL以308 redirect至canonical `${basePath}/reports/` directory URL，且index內`Open report` SHALL導向`${basePath}/reports/sessions/<id>/index.html`並回傳session evidence；先以`run-visual-comment-http-test.mjs`新增redirect、Location、resolved-link與200 assertions，再執行完整`npm run test:visual-comments`、addon build／兩份vendor mirror parity及Hero Title Lockup Reports→Open report browser smoke。

## 8. 管理 report comment lifecycle

- [x] 8.1 依「Report comment lifecycle actions」完成`Append-only visual comment records`與`Report comment lifecycle actions`的storage/API contract：version 1 legacy comment缺少`resolvedAt`時為Open，`resolveComment`／`deleteComment`在serialized mutation queue中允許active與closed meeting，`PATCH /sessions/:sessionId/comments/:commentId`只接受boolean `resolved`且Complete idempotent，`DELETE`只移除comment並保留capture／asset，canonical write後重建reports且unknown ID回404；先以`run-visual-comment-store-test.mjs`與mounted-semantics `run-visual-comment-http-test.mjs`新增Open→Completed→Open、closed meeting、invalid body、unknown ID、commentCount減少而captureCount／asset不變的failing assertions，再實作至通過。
- [x] 8.2 依「Report comment lifecycle actions」完成static session report互動：每張comment card重用既有`--sbfx-success`／`--sbfx-error`／accent／surface tokens顯示Open／Completed badge、Complete／Reopen與Delete，nonce-authorized same-origin script保留`default-src 'none'`／`form-action 'none'`並只增加必要`script-src`與`connect-src 'self'`，Delete cancel送出零requests、confirm後reload regenerated report、mutation failure只在該card的`aria-live` region顯示；以`run-visual-comment-report-test.mjs`驗證escaped data attributes／CSP／status/actions，以完整`npm run test:visual-comments`、addon build／兩份vendor mirror parity、downstream typecheck及closed report browser smoke驗證resolve/reopen、cancel delete、專用smoke comment delete後snapshot仍存在。

## 9. 收斂 workspace 寬度與 export actions

- [x] 9.1 依「320px workspace 與單欄 export actions」實作`Compact single-column Figma export actions`：wide shared workspace與standalone exporter SHALL使用320px inline-size上限、workspace SHALL保留含既有24px offset的344px Story canvas空間，Copy JSON／Download JSON／Plugin Console Script／Copy design to Figma SHALL維持順序並各佔一個full-width row，narrow viewport SHALL維持bottom dock；先在`run-overlay-fixture.mjs`加入wide workspace DOMRect及四按鈕逐列alignment assertions，再完成canonical CSS、`npm run test:visual-comments`與overlay fixture、addon build、兩份vendor mirror parity及Hero Title Lockup downstream smoke驗證。

## 10. 交換 workspace section 順序

- [x] 10.1 依「Figma export 優先的固定 section order」更新`Integrated Figma workspace dock`：shared coordinator SHALL固定以`export`、`review`建立named slots，使Figma export在side與bottom orientations都位於Export review上方，DOM／keyboard／screen-reader順序一致，且任一section先mount、Story rerender或HMR後都不反轉或重複；先在`visual-comment-fixture-entry.ts`加入wide／narrow初次render與rerender的slot order及DOMRect assertions，再更新coordinator，執行`npm run test:visual-comments`、overlay fixture、addon build、兩份vendor mirror parity及Hero Title Lockup downstream browser smoke驗證。

## 11. 精簡 comment capture action 文案

- [x] 11.1 依「精簡的 visual comment action copy」實作`Concise visual comment capture action`：default Review action SHALL顯示與暴露accessible name `Add comment`、舊`Add visual comment` SHALL不再出現在default panel，public `addVisualComment` label key、custom override、disabled logic與point-capture流程 SHALL保持相容；先將`visual-comment-fixture-entry.ts`的capture action assertions改為`Add comment`並新增舊copy不存在檢查，再更新`defaultLabels`與README，執行`npm run test:visual-comments`、overlay fixture、addon build、兩份vendor mirror parity及Hero Title Lockup downstream browser smoke驗證。

## 12. Delete 同步移除 screenshot evidence

- [x] 12.1 依「Report comment lifecycle actions」更新`Append-only visual comment records`與`Report comment lifecycle actions`：Delete SHALL在明確說明comment與screenshot永久刪除的browser confirmation被接受前送出零requests；確認後 SHALL移除comment、無其他comment引用的capture record及無其他capture引用的image asset，並保留shared capture/asset references。先在`run-visual-comment-report-test.mjs`鎖定confirmation copy，在store/HTTP fixtures將原本保留capture/asset的assertions改為unreferenced captureCount減少與asset 404、加入shared asset仍存在的assertions，再更新serialized store mutation與report script，執行`npm run test:visual-comments`、addon build、兩份vendor mirror parity、`git diff --check`及downstream closed-report browser smoke驗證cancel保留與confirmed delete移除comment/snapshot/asset。

## 13. 收斂 export action hierarchy

- [x] 13.1 依「320px workspace 與 compact export actions」實作`Compact Figma export action layout`並更新`Semantic Figma export iconography`：command-icon action的idle visible text與accessible name SHALL由`Plugin Console Script`改為`Console script`，Copy JSON與Download JSON SHALL各佔full-width row，`Console script`與icon-only `Copy design to Figma` SHALL依既有DOM順序以兩個等寬columns共用底部row，wide／narrow dock皆維持此composition且busy/done feedback、icons、click behavior不變。先在`overlay-fixture.html`更新copy assertion並以DOMRect鎖定前兩列full-width及底部同top／等寬／不重疊，再更新canonical action label與grid CSS，執行overlay fixture、`npm run test:visual-comments`、addon build、兩份vendor mirror parity、`git diff --check`及Hero Title Lockup downstream smoke驗證。

## 14. 拆分 visual comments panel 與調整 dock 位置

- [x] 14.1 依「獨立的 visual comments launcher 與雙 dock 位置」實作`Independent visual comments panel`：Visual comments SHALL從Export review slot移至右上角獨立且`data-sbfx-capture-ignore`的React portal，預設只顯示Storybook `EditIcon` icon button；點擊後才顯示heading、唯一Reports link、meeting、capture與composer details，launcher SHALL同步`aria-controls`、`aria-expanded`與Open／Close accessible label。收合 SHALL保留pending composer draft，但armed point capture SHALL呼叫既有cancel flow。先在`visual-comment-fixture-entry.ts`加入預設收合、展開／收合、detail visibility、draft retention與capture cancellation assertions，再更新canonical React surface並執行`npm run test:visual-comments`驗證。
- [x] 14.2 依「單一 workspace dock 與共享 slots」完成`Integrated Figma workspace dock`與`Export access persists throughout visual review`的新位置契約：wide 320px export/review workspace SHALL固定在右下角且維持export-before-review，獨立comments launcher/detail SHALL固定在右上角；comments展開時兩個surface MUST NOT重疊並各自使用internal scrolling，narrow viewport SHALL維持bottom workspace與其上方comments detail。以wide／narrow DOMRect、slot order、capture-ignore及composer期間workspace可操作assertions更新visual-comment fixture，完成addon build、兩份vendor mirror parity、`git diff --check`與Hero Title Lockup downstream browser smoke後，再執行`spectra analyze integrate-figma-export-review-workspace --json`及`spectra validate integrate-figma-export-review-workspace`。

## 15. 收斂 visual comments header 與 meeting 展開狀態

- [x] 15.1 依「Visual comments compact header 與 open-state continuity」更新`Independent visual comments panel`：展開panel SHALL以同一header row呈現左側兩列`Visual comments` subheading／outline `Reports` button與右側Edit icon button，meeting controls SHALL位於header下方且Start meeting成功、overview refresh與active-session identity更新後`data-expanded`／`aria-expanded`仍保持true。先在`visual-comment-fixture-entry.ts`新增header DOMRect／outline style與Start meeting前後展開狀態assertions，再更新canonical React/CSS、README與patch version，執行`npm run test:visual-comments`、addon build、兩份vendor mirror parity、`git diff --check`及Hero Title Lockup downstream browser smoke，最後執行`spectra analyze integrate-figma-export-review-workspace --json`與`spectra validate integrate-figma-export-review-workspace`。

## 16. 收斂 Reports button 尺寸

- [x] 16.1 依「Visual comments compact header 與 open-state continuity」更新`Independent visual comments panel`：Reports outline button SHALL使用intrinsic／hug-content inline size、靠左對齊與較小的control height／padding，不得fill header左欄，且既有兩列header、Edit icon與meeting open-state continuity保持不變。先在`visual-comment-fixture-entry.ts`新增computed style／DOMRect尺寸assertions，再更新canonical CSS、README與patch version，執行`npm run test:visual-comments`、addon build、兩份vendor mirror parity、`git diff --check`及Hero Title Lockup downstream browser smoke，最後執行`spectra analyze integrate-figma-export-review-workspace --json`與`spectra validate integrate-figma-export-review-workspace`。

## 17. 強化 report Delete 安全與操作排序

- [x] 17.1 依「Report comment lifecycle actions」更新`Report comment lifecycle actions`：每張comment card SHALL將具`Delete comment` accessible name且使用Storybook canonical 14×14 TrashIcon geometry的icon-only Delete button放在Complete／Reopen左側；第一次點擊只開啟不依賴native dialog API的page-level `role="dialog"` modal confirmation且送出零requests，focus移至Cancel，Cancel／Escape／backdrop close清除pending state、focus回Delete並保留comment與screenshot，只有Confirm delete才送出一次DELETE並沿用既有reference-aware cleanup。GET Reports index／session HTML SHALL先在serialized store queue中由canonical state／meeting JSON重建，避免舊derived HTML保留pre-upgrade Delete行為，asset GET維持純讀取。先更新`run-visual-comment-report-test.mjs`加入DOM order／exact SVG／dialog accessibility與isolated script初次點擊、Cancel零request、Confirm一次DELETE assertions，並在`run-visual-comment-http-test.mjs`加入stale sentinel HTML被GET重建assertion；再更新canonical report generator／store／server與README、升patch version、執行`npm run test:visual-comments`、addon build、兩份vendor mirror parity、`git diff --check`及downstream session report browser smoke，最後執行`spectra analyze integrate-figma-export-review-workspace --json`與`spectra validate integrate-figma-export-review-workspace`。

## 18. 修正收合 comments launcher 對齊

- [x] 18.1 依「獨立的 visual comments launcher 與雙 dock 位置」更新`Independent visual comments panel`：收合`.sbfx-comments-panel` SHALL移除hidden header-copy造成的grid track／column gap，讓既有36×36 Edit icon button完整貼齊36×36 panel surface，Storybook canonical 14×14 `EditIcon`、button與panel的水平／垂直中心差各不超過0.5 CSS pixel；展開header composition、toggle semantics與位置不變。先在`visual-comment-fixture-entry.ts`加入collapsed panel／button bounds及SVG center assertions，再更新canonical CSS與README、升patch version、執行`npm run test:visual-comments`、addon build、兩份vendor mirror parity、`git diff --check`及Hero Title Lockup downstream browser DOMRect／screenshot smoke，最後執行`spectra analyze integrate-figma-export-review-workspace --json`與`spectra validate integrate-figma-export-review-workspace`。

## 19. 收斂 workspace 父層 disclosure 與版本資訊

- [x] 19.1 依「Figma export 父層 disclosure 與單一版本標記」實作`Figma export controls workspace disclosure`：Figma export收合時shared workspace SHALL只顯示其header並讓完整review slot不可見且不佔layout空間，重新展開時SHALL恢復Export review先前的內部collapse preference與component state；workspace可見版本資訊SHALL只出現在Figma export header，Export review MUST NOT顯示版本序號。先在`visual-comment-fixture-entry.ts`與`overlay-fixture.html`加入父層state projection、review slot visibility／state continuity及single-version assertions，再更新canonical workspace／overlay／review實作與README、升patch version，執行fixtures、addon build、兩份vendor mirror parity、`git diff --check`及Hero Title Lockup downstream browser collapsed／expanded screenshot smoke，最後執行`spectra analyze integrate-figma-export-review-workspace --json`與`spectra validate integrate-figma-export-review-workspace`。

## 20. 保留 Save comment 後的 panel 展開狀態

- [x] 20.1 依「Visual comments compact header 與 open-state continuity」更新`Independent visual comments panel`：展開狀態送出`Save comment`時 SHALL在comment／screenshot寫入與overview refresh前保留同Story的短效continuation，成功後即使preview remount也維持`data-expanded="true"`／`aria-expanded="true"`並顯示active meeting detail，composer則清除；先在`visual-comment-fixture-entry.ts`加入save後同Story remount的failing assertion，再更新canonical React state flow與README、升patch version，執行`npm run test:visual-comments`、addon build、兩份vendor mirror parity、`git diff --check`，最後執行`spectra analyze integrate-figma-export-review-workspace --json`與`spectra validate integrate-figma-export-review-workspace`。

## 21. 最小化收合的 Figma export disclosure

- [x] 21.1 依「Figma export 父層 disclosure 與單一版本標記」更新`Figma export controls workspace disclosure`：collapsed workspace／standalone exporter SHALL只顯示canonical Figma mark＋版本、隱藏title／subtitle／chevron glyph並以hug-content寬度縮至小於320px，既有toggle SHALL覆蓋compact surface且維持Expand click／keyboard／`aria-expanded`語意；重新展開後wide workspace SHALL精確恢復320px、完整header/actions與Review既有state，narrow expanded bottom dock保持相容。先在`overlay-fixture.html`與`visual-comment-fixture-entry.ts`加入visible-content、DOMRect、accessibility與restore assertions，再更新canonical overlay/CSS與README、升patch version，執行overlay fixture、`npm run test:visual-comments`、addon build、兩份vendor mirror parity、template typecheck、`git diff --check`，最後執行`spectra analyze integrate-figma-export-review-workspace --json`與`spectra validate integrate-figma-export-review-workspace`。
