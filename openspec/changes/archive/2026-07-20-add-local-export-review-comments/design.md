## Context

Export review 目前是 React-only 的 preview overlay；它與 story DOM 位於同一個 preview document，因此能看到使用者操作後的 component-local state。現有 review server 是 Vite middleware，只把每個 story 的單一 status/notes 物件寫進一個 JSON；不同瀏覽器同時 read-modify-write 可能互相覆蓋，而且 notes 沒有留言 ID、作者、點位或畫面證據。

使用情境是內部每週設計會議：主持人的 Storybook 以可連線的區網 IP 或 tunnel 開放，與會者直接用 browser 進入，不做登入。Storybook process 只在本機執行，但會議資料必須寫入主持人磁碟，重啟後仍存在，並能以獨立 HTML 回看。Prototype 的 route、modal、tab、form 與 loading state 可能只存在 browser memory；重新開 URL 無法可靠重建，因此 server/headless screenshot 不符合需求。

## Goals / Non-Goals

**Goals:**

- 在既有 Export review overlay 內完成 meeting lifecycle、點擊定位、當下 UI capture、留言與 report 入口。
- 每則 visual comment 保存乾淨 screenshot、normalized pin、作者、文字、story/prototype metadata 與 server timestamp。
- 讓連到同一 host 的多個瀏覽器加入同一 active meeting，並在併發或重送時不遺失、不重複留言。
- 以 repo 內 canonical JSON 與 immutable binary assets 保存資料，並產生能使用 relative assets 攜帶的 static HTML。
- 保持既有 renderer-agnostic preview/export bundle、review status、Figma source 與 notes 相容。
- 依 canonical addon 維護流程完成 version bump、build、tests 與兩份 template mirror 同步。

**Non-Goals:**

- 不加入帳號、權限、審核者驗證、雲端資料庫、外部 object storage、WebSocket 或正式協作後端。
- 不擷取 browser chrome、其他應用程式或作業系統畫面。
- 不序列化或重播任意 React/Vue/Svelte component state；screenshot 是狀態的 durable truth。
- 不保證 video、WebGL、nested iframe、跨域且無 CORS 的 image 或所有 CSS 都能達到 framebuffer pixel-perfect。
- 不把歷史 pin 疊回已切換狀態的 live story，也不把 comment 文字燒進 bitmap。
- 不移除或遷移既有 figma-export-review-status.json notes。
- 不為 static Storybook deployment 提供寫入能力；local Vite middleware 不在線時只能閱讀已產生的檔案。

## Decisions

### Preview 端擷取當下 UI，screenshot 作為不可變證據

Capture 必須在留言者的 preview document 內進行。使用者按下 Add visual comment 後，document capture phase 攔截下一組 pointer events；點擊位於 capture target 時立即阻止 prototype handler，凍結 target bounds 與 pointer 座標，隱藏所有帶 data-sbfx-capture-ignore 的 addon chrome，等待兩個 animation frames，再透過 visualComment.ts 的 capture adapter 產生 bitmap。Escape 或 panel 的 Cancel 會離開 capture mode，且不寫入 server。

capture target 先採 project-local captureSelector；未設定時使用 #storybook-root，最後才 fallback 到 document.body。需要包含 body portal 的專案可將 selector 設為 body，addon chrome 仍由 ignore attribute 排除。Prototype 的 data-prototype-root、data-route 與可選 data-prototype-state 只提供 metadata，不取代 screenshot。

Pin 在凍結的 CSS bounds 上計算 xRatio=(clientX-left)/width 與 yRatio=(clientY-top)/height，client 與 server 都確認是 finite number，client clamp 到 0..1。visualComment.ts 將 html-to-image 包在單一 adapter seam 內，使用 canvas 在 browser 端縮放與 WebP 編碼；輸出最大長邊 2048、最大 4 MP、最大 2 MiB。核心 preview.ts 與 overlay.ts 不匯入這個 dependency，renderer-agnostic export bundle 不受影響。

替代方案包括 server/headless Chromium 與 browser tab capture。前者無法看到留言者的 in-memory state；後者需要 extension、CDP 或螢幕權限，超出輕量內部工具範圍，因此不採用。

### Canonical meeting store 與 derived reports 分離

visualCommentStore.ts 是 Node-side storage seam，負責資料驗證、ID、hash、filesystem mutation 與 report projection；review-server.ts 僅把 same-origin HTTP request 導向 store。移除這個 seam 會直接失去持久化、併發保護及 HTML，而不是只少一層 wrapper。

預設儲存結構為：

```text
design-system/figma-export-review/
├── state.json
├── index.html
└── sessions/
    └── <server-generated-session-id>/
        ├── meeting.json
        ├── assets/
        │   └── <sha256>.webp
        └── index.html
```

state.json 只保存 schema version 與 activeSessionId。meeting.json 是 session、captures、comments 的 canonical truth；base64 不得寫入 JSON 或 HTML。每次 comment 都有獨立 capture record，capture 參照以 SHA-256 命名的 immutable asset；相同 bytes 共用 asset，但保留各自的 capture metadata。index.html 都是可重建 projection，不能作為後續 mutation 的輸入。

comments 採 append-only；MVP 不提供 edit/delete。這能保持會議證據與無登入環境的責任邊界，修正內容以新 comment 表達。

### Shared active meeting lifecycle 與 polling API

commentsApiPath 預設為 /__figma_export_review_comments。所有 route 都是 Storybook same-origin，不設定 wildcard CORS。API contract：

- GET base path：回傳 activeSession、recentSessions、目前 story 的 comments 與 report URLs。
- POST base path/sessions：以 title 建立 active meeting；已有 active meeting 時回傳 409 與該 meeting，client 直接加入而不另建。
- GET base path/sessions/:sessionId：回傳 meeting metadata、captures 與 comments。
- POST base path/sessions/:sessionId/comments：建立 capture/comment；成功回傳 201，idempotent replay 回傳 200。
- POST base path/sessions/:sessionId/close：設定 closedAt、清除 activeSessionId 並重建 reports。
- GET base path/reports 與其 session/assets 子路徑：由 middleware 讀取已產生的 static files。

Panel mount、story change、自己的 mutation 後立即 GET；active meeting 期間每 5 秒 polling，讓其他 browser 的留言無需 WebSocket 也能出現。沒有 active meeting 時 Add visual comment 停用；Start meeting 的預設 title 使用本機日期時間，使用者可修改。authorName 存在各 browser 的 localStorage，送出後連同 comment 持久化；空值正規化為 Anonymous，不代表登入身分。

### 序列化 atomic writes、idempotency 與 bounded inputs

Store root 使用單一 server-side mutation queue，序列化 active pointer、meeting JSON、asset 與 root report 的跨檔案更新。JSON/HTML 先寫同目錄的 server-generated temporary file，再 atomic rename；asset 先 hash 後以 exclusive create 寫入。這個規模以一致性優先，不加入 lock service。

每次 create comment 要求 1–64 字元的 clientRequestId。相同 session 內重送相同 request 與相同內容時回傳既有 comment；同一 clientRequestId 搭配不同內容時回傳 409，不新增資料。ID、createdAt、closedAt、asset path 與 hash 全由 server 生成。

HTTP reader 在串流期間執行 4 MiB request limit，超過立即回傳 413。Server 強制以下限制：title 120 characters、author 80、comment 2,000、decoded image 2 MiB、2048 longest side、4 MP、session assets 100 MiB。只接受通過 data URL decoding、declared MIME、magic bytes 與 dimension 一致性檢查的 image/webp 或 image/png。非 finite pin 回傳 400；finite pin clamp 到 0..1。任何 4xx/413 都不得修改 canonical JSON 或留下未引用 asset。

Canonical mutation 成功但 report regeneration 失敗時不回滾 comment；response 保留成功 status 並帶 reportStale: true。下一次成功 mutation 會重建 root 與 session reports。Filesystem 或 JSON 解析錯誤顯示於 panel，不靜默宣稱已保存。

### Safe portable HTML report projection

Root report 列出所有 meetings；session report 依 story、capture、comment 排序。每個 snapshot 使用與圖片相同 aspect ratio 的容器，以 left:xRatio*100% 與 top:yRatio*100% 疊編號 pin，旁邊提供對應 author、server time 與 comment card。歷史 pin 只出現在該 frozen snapshot/report；live UI 只顯示正在建立的暫態 pin。

Report generator 對 title、author、comment、story metadata 與 attribute 分別 escape，所有文字均為 plain text。Image path 由 server 生成；可點擊 story/source URL 僅允許 http: 或 https:。HTML 加入 CSP：default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'。Report 以 relative asset paths 引用圖片，整個 session directory 可複製或 zip 後直接閱讀。

### Additive project config 與 bundled tool release sync

FigmaExportReviewOptions 新增 visualComments 設定，包含 enabled、apiPath、captureSelector 與 authorStorageKey；FigmaReviewStatusPluginOptions 新增 commentsEnabled、commentsApiPath 與 commentsDir。generate_figma_export_config.mjs 與 Storybook template 將 project-specific path/selector 保留在 .storybook config，不把產品設定寫進 canonical addon。

Visual comments 只在 React review entry 且 viewMode=story 時啟用；plain preview exporter 繼續支援其他 renderer。Template example 補齊 data-prototype-root=true 與 data-route，讓 report metadata 與 prototype scaffold contract 一致，但功能在沒有這些 attributes 時仍使用 storyId 與 screenshot。

Canonical addon 從目前 0.3.0 升為 0.4.0，加入 runtime capture dependency，執行 build 與全部既有/新增 tests，再把 source、dist、package metadata 同步到 storybook-template/vendor/figma-export/ 與 storybook-template/.storybook/vendor/figma-export-addon/。若 apply 時 live version 已變更，使用下一個 minor version，不覆蓋較新的版本線。

## Implementation Contract

**Observable behavior**

1. 使用者 Start meeting 後，其他 browser 在 5 秒內看到相同 active meeting。
2. 使用者先把 prototype 操作到任意 state，再按 Add visual comment 並點擊 UI；該 pointer sequence 不觸發 prototype action，capture 保存點擊前 state。
3. Capture 成功才顯示 composer；Submit 將 snapshot、pin 與 comment 原子地加入 session。Cancel 不產生 server 資料。
4. 同一 active session 的留言在 Storybook restart 後仍可讀，End meeting 後不接受新留言但 report 保留。
5. Report image 縮放時 pin 仍對準相同位置，文字可搜尋且不包含可執行 user HTML。

**Interface and data shape**

Create comment request 的 durable shape 為：

```ts
type CreateVisualCommentRequest = {
  clientRequestId: string;
  authorName: string;
  body: string;
  story: {
    id: string;
    title: string;
    name: string;
    url?: string;
    prototypeId?: string;
    routeId?: string;
    stateId?: string;
  };
  pin: { xRatio: number; yRatio: number };
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
    scrollX: number;
    scrollY: number;
  };
  capture: {
    dataUrl: string;
    mimeType: "image/webp" | "image/png";
    width: number;
    height: number;
    cssWidth: number;
    cssHeight: number;
  };
};
```

meeting.json 使用 version:1，包含 session{id,title,startedAt,closedAt}、captures keyed by server captureId、comments array；comment 包含 id、clientRequestId、captureId、authorName、body、pin、createdAt，capture 包含 story/viewport/image metadata。Client 不得指定 server ID、timestamp、filesystem path 或 asset hash。

**Failure modes**

- 無 target、zero-size target、capture/encoding failure：離開 capture mode並顯示 retryable error，不開啟 composer。
- 無 active meeting或 closed meeting：API 回傳 409；panel refresh server state。
- Invalid JSON/MIME/dimensions/pin/text：回傳 400；超過 byte/asset limits 回傳 413。
- Duplicate request with different content：回傳 409；identical replay 回傳原 comment。
- Canonical save failure：回傳 500 且 UI 保留 draft 供 retry。
- Report-only failure：comment 仍成功，回傳 reportStale:true 並在 panel 顯示 report pending warning。

**Acceptance criteria**

- Browser fixture 證明 pointer 被攔截、interaction state 未改變、addon chrome 被排除、Escape/cancel 生效、normalized pin 在 resize 後一致。
- Node store test 證明兩個 parallel POST 都存在、restart persistence、idempotent replay、conflict、400/413、magic-byte validation、100 MiB budget、atomic-write recovery 與 reportStale 行為。
- Report test 使用含 script/style/event-handler payload 的 title/author/comment，驗證只顯示 escaped text、CSP 存在、assets 為 relative path、story/capture ordering 與 pin percent 正確。
- npm run build、既有 export/overlay/payload-store tests 與新增 visual-comment tests 全部通過。
- Canonical addon 與兩份 template mirror 的 source/dist/package metadata 遞迴比對無 drift，generator/template config 能啟用預設 comments path。
- spectra validate add-local-export-review-comments 通過。

**Scope boundaries**

In scope 是 canonical addon、local Vite middleware、project config generator、React Storybook template、template example、文件、tests、dist 與 vendor mirrors。Out of scope 是 standalone backend、production hosting、其他 Storybook builder 的 persistence adapter、authentication、comment edit/delete、state replay 與 product repo migration。

## Risks / Trade-offs

- [DOM-to-image 與真正 framebuffer 有差異] → capture adapter 對 unsupported content 回傳清楚錯誤，browser fixture 覆蓋常用 CSS/portal，文件列出 video、WebGL、nested iframe 與跨域 image 限制。
- [body portal 可能落在預設 #storybook-root 外] → 提供 captureSelector；需要 portal 的專案設定 body，所有 addon chrome 使用統一 ignore attribute。
- [未驗證的 IP 使用者也能留言] → 明確限制為可信內網；same-origin 且不開 wildcard CORS，不把資料暴露到外部 service。
- [圖片累積占用 repo 磁碟] → WebP、dimension/byte/session budget、SHA-256 去重；不自動刪除會議證據。
- [Polling 有最多 5 秒延遲] → 自己的 mutation 立即 refresh；MVP 以簡單、無連線狀態的 polling 換取低維護成本。
- [Report 與 canonical JSON 短暫不同步] → JSON 是唯一 truth，reportStale 明確顯示，任何後續 mutation 都重新 projection。
- [單一 mutation queue 降低 throughput] → 會議留言量低，一致性高於平行寫入速度；未來可在不變更 API/data contract 下細分 queue。

## Migration Plan

1. 在 canonical addon 新增 client/store seams 與 tests，保留現有 status/notes API。
2. 擴充 config generator、template main/preview/project config 與 example metadata。
3. 升級 addon minor version、build dist、執行全部 addon tests。
4. 同步兩份 template mirrors 與文件，驗證三份 package 無 drift。
5. 既有 product repo 透過 installer 升級 tarball並重新產生/合併 config；既有 figma-export-review-status.json 不需 migration。
6. Rollback 時還原 addon/package/template 到前一版本；新的 design-system/figma-export-review/ 目錄保留為可讀資料，不由 rollback 自動刪除。

## Open Questions

無阻塞問題。若 html-to-image 在 browser fixture 無法滿足乾淨 snapshot、ignore filter、尺寸與 portal 驗收，apply 可在不改 API/data/report contract 的前提下替換 visualComment.ts 內部 capture backend，並在 tasks/verification log 記錄原因。
