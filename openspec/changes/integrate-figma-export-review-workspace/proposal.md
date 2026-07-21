## Summary

整合 Storybook 內目前分離且互相遮擋的 Export review 與 Figma export 操作介面，並修正 preview/server 設定來源分裂、歷史 meeting 難以辨識、實際截圖只產生透明影像、已儲存 comments 無法在 panel 快速回看或於 panel／Reports 編輯、report comments 無法標記完成或安全刪除其截圖、workspace icons 語意混淆，以及側邊 workspace 過寬與 export action hierarchy 不清楚的問題。

## Motivation

目前 addon 0.4.0 在真實 Storybook 中會同時疊出兩個 fixed panel；進入 comment composer 後 Review panel 會覆蓋 Figma export panel 與 Story canvas。實測 workspace 的 preview 從 `.storybook/figma-export.config.ts` 呼叫 `/__figma_export_review_status`，server 卻從 `.storybook/project.config.ts` 掛載 `/__md_figma_review_status`，造成 `Save failed / HTTP 404`；comments endpoint 本身仍可讀寫。此外已儲存的 comment 位於已結束的 meeting，新的 active meeting 報告卻只顯示 `No comments yet`，讓使用者誤以為歷史紀錄遺失。即使從 Reports 找到 comment，也只能閱讀，無法修正文案、標記已處理或移除誤建／已不需要的單筆 comment；Visual comments panel 本身也只顯示數量，Save 後無法就地回看與管理剛建立的內容。

## Proposed Solution

- 將 Export review 與 Figma export 整合為同一個可收合、可捲動的 workspace，兩者共享右下角容器與狀態，不再互相覆蓋。
- 將共用 workspace 的固定閱讀與視覺順序調整為 Figma export 在上、Export review 在下，讓主要輸出操作先出現。
- 讓 Figma export header 成為共用 workspace 的父層 disclosure：收合時隱藏 `Figma export` 標題、Story subtitle與chevron，只保留Figma icon＋版本序號，並讓整個collapsed disclosure使用hug-content最小寬度；重新展開後才恢復wide 320px panel、完整header、Export review入口與其既有內部收合狀態。可見版本序號只保留在 Figma export header，Export review 不再重複顯示版本。
- 將 Visual comments 從 Export review 內容中拆成右上角的獨立 panel；預設只顯示 Storybook `EditIcon` icon button，且收合時 button 與 14×14 icon 必須在 36×36 launcher surface 內水平／垂直置中；點擊後才展開 Reports、meeting、capture 與 comment composer 等完整 detail features。
- 將展開後的 Visual comments header 收斂為同一列：左側以兩列堆疊 `Visual comments` subheading 與 compact、hug-content 的 outline `Reports` button（不得 fill container），右側保留 Edit icon button；啟動 meeting 或成功儲存 comment 後 panel 必須維持展開，不因 overview refresh／preview remount 回到 icon-only 狀態。
- Workspace 開啟時為 Story canvas 保留可視區域；右上 comments panel 展開或進入 point capture／comment composer 時，仍保留右下 Figma export 與 Export review 的可辨識入口、操作狀態與不重疊版面。
- 修正 browser capture，拒絕全透明或無有效像素的影像，並以真實 DOM 像素 fixture 證明 Story UI、背景與文字會出現在 WebP／PNG 預覽及 report。
- 讓 report index 與 active report 清楚區分目前 meeting 與歷史 meetings，並顯示每個 meeting 的 capture/comment 數量及可開啟的 snapshot evidence。
- 讓 Reports index 只列出仍有 capture 或 comment evidence 的 meeting；刪除最後一筆 comment 並清掉其未引用 capture 後，該空 meeting 與空分組 heading 立即從重新產生的列表移除，所有 meeting 都無 evidence 時則顯示單一空狀態。
- 移除 review panel 內的 active `Open` 與 closed meeting history list，將所有 meeting/report 瀏覽統一收斂到單一 `Reports` 入口；歷史資料、counts 與 evidence仍保留在 Reports index/session reports。
- 讓 config generator、Storybook template 與 Vite plugin wiring 共用單一設定來源，原子化同步 review status API、comments API、comments directory、capture selector 與 author storage key，並在啟動檢查偵測路徑分裂。
- 在 server 未掛載或 capture 無效時停用會失敗的 comment 動作，顯示可採取行動的設定訊息，不再只顯示 `Save failed` 或 `HTTP 404`。
- 讓 Figma export header mark 與右下 `Copy design to Figma` icon-only action 共用 Storybook `FigmaIcon` 的 canonical 14×14 geometry；保留既有 `currentColor`、accessible button label 與其餘 action icons。
- 讓 Figma export header 的 icon box 在 mark 中水平／垂直置中，並將 `Export review` header 改用 Storybook `EyeIcon`，以 review 語意和真正的 Figma export action 做視覺區隔。
- 讓兩個 section header 共用 Storybook canonical chevrons 與相同狀態規則：收合時向下、展開時向上，且 click、`aria-expanded`、accessible label 與獨立 preference 同步。
- 將 wide viewport 的共用側邊 workspace 固定為 320px；Copy JSON 與 Download JSON 各佔 full-width row，`Console script` 與最下方 `Copy design to Figma` 則以兩欄共用同一列；窄 viewport 仍維持全寬 bottom dock與相同action composition。
- 讓 active 與 closed session report 的每張 comment card 顯示 Open／Completed 狀態，提供可逆的 Complete／Reopen action；Delete 改為操作列最左側的 Storybook TrashIcon 語意 icon button，`Copy AI prompt`、Edit 與 Complete／Reopen 則組成貼齊container最右側的action group。Delete第一次點擊只開啟頁內確認 dialog，使用者明確確認後才從 canonical meeting JSON 移除 comment 與不再被引用的 capture，並刪除不再被任何 capture 共用的 screenshot asset，再重建 reports。
- 讓展開的 Visual comments panel 在 meeting controls 下方顯示目前 Story、目前 active meeting 依建立時間倒序的最新 3 筆 comments；每筆可就地 Edit／Save／Cancel，也可經頁內二次確認後 Delete，成功 mutation 後 panel 保持展開。完整 active／closed meeting 瀏覽仍統一由 Reports 提供。
- 讓 Visual comments panel 的既有 comment 進入 Edit 狀態時，以和 Add comment composer 相同的 snapshot＋pin preview 顯示該筆 comment 綁定的既有 evidence；既有 screenshot 維持不可替換，但 participant 可在 panel 與 Reports 的 Edit 狀態以 click、drag 或 keyboard 調整 normalized point，Save changes 原子保存 body 與 point，Cancel 則還原兩者。
- 將 Visual comments panel 的 recent comment Edit 從 320px card 內嵌 editor 改為 body-level overlay modal，使用較大的 stored screenshot＋numbered point、body field 與 actions；modal 支援 Escape／backdrop／Cancel 關閉與 focus return，Save 成功後關閉 modal 但維持 Visual comments panel 展開，失敗則保留 modal 與 drafts。Reports 頁面既有 inline editor 維持不變。
- 讓同一 meeting 內的 comment pin 依 canonical comment 順序共用連續序號 `1, 2, 3…`，Reports 不再於每張 capture 重新從 `1` 編號，panel edit preview、Add comment preview、report snapshot與comment card皆顯示一致序號。
- 讓 Add comment 尚未 Save 的流程在Story point被選取後立即顯示帶有下一筆序號的圓形live tag，並允許使用者在snapshot preview透過click、drag或keyboard調整normalized point；live tag同步預覽位置且不進入capture，Save才提交最終pin，Cancel則移除tag與未保存調整。
- 讓 active 與 closed session report 的每張 comment card 可就地編輯 body；儲存只改變該 comment 的文字，並保留作者、pin、capture、截圖、`createdAt`與resolved state，失敗時保留 editor draft 與原始 canonical comment。
- 讓 Reports 的 screenshot canvas 在 light／dark color scheme 都使用 addon 既有 `--sbfx-surface-raised` 暗灰 surface，避免透明區域或 contain letterbox 呈現白底並干擾視覺判讀。
- 將 active meeting 的 comment capture action 預設文案由 `Add visual comment` 精簡為 `Add comment`，保留既有 `addVisualComment` label override key與capture流程。

## Non-Goals

- 不把 review comments 上傳到雲端，也不新增帳號、權限、已儲存comment的author／capture／screenshot／`createdAt`編輯、批次刪除、刪除復原、preview panel跨meeting歷史清單或未被本次 comment Delete 釋放的 capture／asset 清理能力；saved point edit只更新既有screenshot內的normalized coordinates，不重新capture、替換image或讓Story live tag成為第二個editor。
- 不改變 Figma export payload schema、Figma plugin import protocol 或 Storybook 的 Controls/Actions addon panel。
- 不為單一產品建立專屬元件或設計 token；整合介面沿用 addon 既有 `--sbfx-*` surface、color、spacing、radius 與 motion conventions。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `visual-export-review-comments`: 要求有效像素截圖、右上角獨立且由置中的Edit icon button展開的comments panel、收合時button／SVG與36×36 launcher surface同心、展開時使用subheading／compact hug-content outline Reports雙列header且meeting／comment mutation不收合panel、在panel顯示目前Story／active meeting最新3筆可編輯與可確認刪除的comments、panel Edit以較大的accessible overlay modal重現snapshot＋pin evidence並允許pointer／keyboard原子更新body與normalized point、Reports維持inline edit、同一meeting的comments跨captures使用一致且連續的pin序號、Add comment point選取後即時顯示numbered tag並允許Save前調整、以單一 Reports 入口瀏覽仍有evidence的active/history meeting reports並排除空meeting／空分組、Reports screenshot canvas使用暗灰surface、Reports逐comment body編輯與completion lifecycle、Delete icon button排序與頁內雙重確認、確認後刪除comment及其不再被引用的capture/screenshot、完整 comments API wiring，以及不可用時的明確降級狀態。
- `figma-export-workflow`: 要求 review 與 export 共用右下角且不互相遮擋的 workspace、由Figma export父層disclosure控制Export review入口可見性，收合時只顯示Figma icon＋版本且hug content、展開時恢復wide 320px完整header與actions、在獨立comments panel的capture/composer狀態持續提供workspace入口，並讓兩個 section 使用置中且語意有別的 review／Figma icons，以及一致的 canonical collapse state與accessibility邏輯。

## Impact

- Affected specs: `visual-export-review-comments`, `figma-export-workflow`
- Affected code:
  - Modified: `design-system-to-storybook/assets/figma-export-addon/src/review.ts`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/src/review.css`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/src/overlay.ts`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/src/figma-code-exporter.css`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/src/review-server.ts`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/test/run-overlay-fixture.mjs`
  - Modified: `design-system-to-storybook/scripts/generate_figma_export_config.mjs`
  - Modified: `design-system-to-storybook/scripts/test_generate_figma_export_config.mjs`
  - Modified: `design-system-to-storybook/storybook-template/.storybook/main.ts`
  - Modified: `design-system-to-storybook/storybook-template/.storybook/preview.ts`
  - Modified: `design-system-to-storybook/storybook-template/.storybook/project.config.ts`
  - Modified: `design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/`
  - Modified: `design-system-to-storybook/storybook-template/vendor/figma-export/`
  - Modified: `design-system-to-storybook/references/figma-export-review-setup.md`
