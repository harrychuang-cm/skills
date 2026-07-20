## 1. 方案邊界與契約準備

- [x] 1.1 依 design.md 的 Context、Goals / Non-Goals、Decisions、Implementation Contract 與 Open Questions，建立 visual comment 的 shared types、`meeting.json` v1 fixture shape，以及 capture/API/report boundary；以 `spectra analyze add-local-export-review-comments --json` 的 requirement/task coverage 結果與人工檢視路徑一致性驗證。
- [x] 1.2 將 `visualComments.enabled`、`apiPath`、`captureSelector`、`authorStorageKey`、`commentsDir` 的 project-local defaults 加入 `FigmaExportReviewOptions`/`FigmaReviewStatusPluginOptions`、`generate_figma_export_config.mjs` 與 Storybook template config；執行 generator 的 fixture command 並檢查輸出的 `.storybook/figma-export.config.ts` 可保留覆寫值。

## 2. Preview capture 與 review UI

- [x] 2.1 依「Preview 端擷取當下 UI，screenshot 作為不可變證據」實作 Point-based pre-action UI capture：在 React review entry 的 capture mode 以 capture phase 攔截 pointer sequence、凍結 bounds/座標、排除 `data-sbfx-capture-ignore`、等待兩個 animation frames，再透過單一 `html-to-image` adapter 產生 image/webp（png fallback）；用 browser fixture 驗證 interactive state 不變、addon chrome 不入圖、body portal selector 可用與 zero-size/encoding failure 不開 composer。
- [x] 2.2 實作 Immutable snapshot evidence and metadata 與 Normalized point anchors：保存 story/prototype/route/state、viewport、scroll、image dimensions 與 finite `xRatio/yRatio`，在 client clamp 到 0..1 並應用 2048px/4MP/2MiB bounds；以 browser fixture 驗證 modal state snapshot、Escape/Cancel 不發 request，以及 resize 後 pin 百分比一致。
- [x] 2.3 將 Shared meeting session lifecycle、Append-only visual comment records 與 Same-origin local API and browser synchronization 接入 `review.ts`/`review.css`：提供 Start/End、author localStorage、Add visual comment、composer draft retry、5 秒 polling、story/viewMode gating、report link 與明確 409/500 錯誤狀態；以 review UI fixture 的 DOM assertions 和 mock API round trip 驗證。

## 3. Canonical store 與 HTTP middleware

- [x] 3.1 依「Canonical meeting store 與 derived reports 分離」實作 Canonical persistent meeting storage：在 `design-system/figma-export-review/` 建立 `state.json`、root index、session `meeting.json`、relative `assets/<sha256>.<ext>`，server 生成 IDs/timestamps/paths，對重複 image bytes 去重且不把 base64 寫入 JSON；以 Node store test 驗證 restart persistence、session portability 與 existing review notes unchanged。
- [x] 3.2 依「序列化 atomic writes、idempotency 與 bounded inputs」實作 Serialized atomic and idempotent mutations：以單一 store mutation queue、同目錄 temporary file + atomic rename、exclusive asset create、clientRequestId replay/conflict handling 保存 comment；以 Node concurrency test 驗證 parallel comments 都保留、identical retry 不重複、different payload 回 409、temporary file interruption 不污染 canonical files。
- [x] 3.3 實作「Shared active meeting lifecycle 與 polling API」的 Vite routes 與 Same-origin local API and browser synchronization endpoints（GET state、POST session、GET detail、POST comment、POST close、GET reports），並讓 close/active conflict/polling response 遵守 contract；以 Node HTTP test 驗證 concurrent start 只有一個 active meeting、closed session 拒絕 comment、無 wildcard CORS 與 offline-safe filesystem behavior。
- [x] 3.4 依「序列化 atomic writes、idempotency 與 bounded inputs」實作 Bounded and validated inputs：在 streamed request reader 於 4MiB 超限時回 413，驗證 title/author/body、clientRequestId、MIME magic bytes/dimensions、pin finite/clamp、2048px/4MP/2MiB image 與 100MiB session budget；以 Node test 驗證 invalid JSON/MIME/path、oversized request/image、budget exhaustion 都不改 JSON 且不留下 orphan asset。

## 4. Static report projection 與安全性

- [x] 4.1 依「Safe portable HTML report projection」實作 Static root and meeting reports：在 session create/comment/close 後由 canonical JSON 重建 root index 與 meeting report，依 story/capture/comment 時間排序，在維持 image aspect ratio 的 container 以百分比疊 numbered pins 並保留 reportStale 行為；以 generator test 驗證 clean image、matching cards、ordering、relative paths 與後續 mutation repair。
- [x] 4.2 實作 Plain-text and content-safe reports：分別 escape text/attributes、只接受 http/https story links、server 生成 image paths，並在 root/meeting HTML 寫入 restrictive CSP；以 malicious-input report test 驗證 `</style><script>`、event handler、`javascript:`/`data:`/`file:` URL 都只呈現文字且不產生 executable DOM。

## 5. Template、文件與發行同步

- [x] 5.1 依「Additive project config 與 bundled tool release sync」更新 template main/preview/project config、example prototype 的 `data-prototype-root`/`data-route` metadata，以及 review setup/README，讓 Additive addon configuration and distribution integrity 的 defaults、captureSelector、same-origin report path 與 prototype metadata contract 可被新安裝專案使用；以 template source inspection、generator output review 與 existing export workflow compatibility fixture 驗證 renderer-agnostic preview 未載入 React 或 capture dependency。
- [x] 5.2 依 design.md 的 Risks / Trade-offs 與 Migration Plan 更新 canonical addon README、`design-system-to-storybook/SKILL.md` 與 template mirror 說明，清楚標示 DOM-to-image 限制、可信內網/no-auth 邊界、portable report、rollback 不刪資料及 visual comments 為 additive；以文件 grep、`git diff --check` 與手動 scope review 驗證沒有宣稱 state replay 或 pixel-perfect framebuffer。
- [x] 5.3 將 canonical addon minor version bump 到下一個可用版本，執行 `npm run build`，並把 source/dist/package metadata 同步到 `storybook-template/vendor/figma-export/` 與 `storybook-template/.storybook/vendor/figma-export-addon/`；以 recursive mirror comparison 與 package metadata diff 驗證 bundled copies have no drift。

## 6. 整合驗證與交付門檻

- [x] 6.1 執行既有 export fixture、overlay fixture、payload-store test 與新增 visual-comment browser/store/report tests，確認 Existing export workflow remains compatible 且所有 Acceptance criteria 可追溯；以 addon package 的 build/test commands 收集結果並修正失敗。
- [x] 6.2 執行 `spectra analyze add-local-export-review-comments --json`、`spectra validate add-local-export-review-comments` 與 `git diff --check`，確認每個 spec Requirement 有可驗證 task、每個 task 有 behavior/verification、路徑與 scope 一致；完成前不得開始 `$spectra-apply`。
