## Context

design-system-extractor 在萃取後產生兩份靜態頁：主文件 docs/design-system/index.html 與審查頁 docs/design-system/review.html。審查頁由 design-system-extractor/scripts/generate_review_html.mjs 產生，目前是唯讀表格：重複來源、色階問題、相近顏色、相近數值、相似元件各一張表，狀態只有 Documented / Needs review。

2026-11-13 的實測（以現行腳本對本機 lab 套件執行，數字皆為實測）：

- 7 個套件中 6 個的 needsReview 為 0。原因不是沒有問題，而是 AI 在萃取當下就把 merge / keep distinct 寫進 TOKEN_ARCHITECTURE.md。80sJP-Grok 記錄了 16 筆相近 token 決定（其中 5 筆合併），審查頁只列出 4 對；合併後被移除的值不再出現在頁面上。
- 相近值逐對列出：320 個 ref token 的套件產生 343 對；cm-linepay 產生 56 對。
- 「是否已決定」的邏輯在 audit_tokens.mjs 與 generate_review_html.mjs 各有一份。以最小案例重現四種誤判：只決定 size-18 與 size-20 時，size-1 與 size-2 也被視為已決定（字串包含比對）；決定欄寫「待確認」被視為已決定（關鍵字含「確認」）；只有建議欄寫 merge、決定欄空白被視為已決定（整行比對）；以 a11y-remap 記錄的配對，audit 視為已記錄但審查頁與 pipeline-board 視為待審。
- 相似元件每筆只記一張截圖、沒有區域；seven-lights 的 crop-app-header-tabs.png 實際內容是 K 線圖片段，裁切位置錯誤卻無從察覺。

使用者（設計師）於 2026-11-13 依原型確認了本設計的互動，並決定三項政策：AI 的建議須經設計師確認才生效；報告語言第一次使用時詢問且預設 English；截圖在頁內放大並由 AI 標出比較部位。

限制：頁面必須是自足的靜態檔，可直接以 file 協定開啟；Markdown 與 tokens/*.css 是唯一真相來源；pipeline-board 以 generate_review_html.mjs --json 的 counts.needsReview 顯示待決定數；暫存中的 change add-production-extraction-and-mount 會修改部分相同檔案。

## Design Source

- 來源：2026-11-13 經使用者確認的可操作原型，以 lab 套件 seven-lights 的真實 token 與決定表產生（9 對相近 token 併為 3 組、2 筆已合併的圓角、4 筆相似元件、2 筆重複來源）。
- 快取：.spectra/design-cache/add-extractor-designer-review-flow/（review.html 為建好的原型頁，prototype-src/page.template.html 為頁面模板，prototype-src/build.mjs 為資料組裝，prototype-src/verify.mjs 為 headless Chrome 走查腳本，shots/ 為截圖與兩種語言的提示詞樣本）。
- 原型中由人工補上的資料（正式版須由萃取流程寫入）：理由的繁中文字、來源說明、相似元件 B 邊的截圖與所有區域座標。
- 原型與正式版的差異：原型把既有決定一律顯示為待確認以示範流程；正式版依本文件的判定規則，既有套件的已記錄決定顯示為已確認。

| 項目 | 值 |
| --- | --- |
| 頁面底色 / 側欄 / 卡片 / 次層 / 三層 | #0e1116 / #0b0e12 / #151a21 / #1c232d / #27313d |
| 文字 / 次要文字 / 最淡文字 | #e8ecf1 / #a0aab6 / #77828f |
| 待確認訊號（文字 / 實色按鈕 / 按鈕 hover / 標籤底） | #ff7a97 / #cf3a68 / #dd4b78 / #35141f |
| 已確認（文字 / 標籤底） | #4ade80 / #12291b |
| 設計師調整、提醒（文字 / 標籤底） | #f0b35f / #2d2214 |
| 焦點外框 | 2px #7cc4ff，offset 2px |
| 標示框 A / B | #d81b60 / #1565c0，框線 2.5px、圓角 6px、外圈 1.5px #ffffff |
| 色塊舞台底色（深 / 灰 / 淺） | #0e1116 / #8b9097 / #f5f6f8 |
| 字級 | 內文 15px、說明 14.5px、欄位標題與標籤 13px、標籤膠囊 12.5px、最小 12px |
| 卡片標題 / 區段標題 / 頁面標題 | 17px / 18px / 22px，字重 650 至 700 |
| 圓角 | 卡片 14px、舞台 12px、按鈕與輸入 10px、選項 12px、標籤 999px |
| 版面 | 側欄寬 268px、內容最大寬 1000px、主區左右內距 36px、卡片內距 22px 24px 20px、卡片間距 12px |
| 色條 | 高 116px（合併後預覽 40px），相鄰色塊無間隙，接縫標籤 12px 等寬字 |
| 值清單列 | 欄寬 44px、26px、最小 170px、88px、其餘；列內距 9px 10px |
| 底部操作列 | 固定於視窗底、左緣對齊側欄右緣、內距 14px 36px、上方陰影 0 -10px 28px rgb(0 0 0 / 38%) |
| 窄螢幕斷點 | 920px 以下側欄改為置頂、操作列左緣歸零、相似元件兩邊改為上下排列 |
| 字型 | 介面用系統無襯線字型堆疊（含 PingFang TC、Noto Sans TC），token 名稱與數值用系統等寬字型 |

## Goals / Non-Goals

**Goals:**

- 設計師在審查頁上一次完成決定，產出提示詞交給 AI 套用。
- 審查事項更少、更容易判斷：相近值分組、顯示用途、白話差異、可比較的視覺呈現。
- AI 的建議在確認前只是建議：不算已決定、不得先合併。
- 「是否已決定」只有一份判定邏輯，並修正四種誤判。
- 截圖在頁內放大；相似元件兩邊的比較部位以 A、B 框出。
- 報告語言預設 English；兩支 HTML 產生腳本的介面語言跟隨套件記錄。
- 既有套件不需修改即可繼續使用；pipeline-board 與 design-system-to-storybook 的讀取契約不變。

**Non-Goals:**

- 主文件 index.html 的分層（設計總覽 / 工程參考 / 流程紀錄）與在主文件套用頁內檢視器，留給下一個 change。
- 設計師在截圖上自行加標記並帶入提示詞。使用者在三個選項中選了只由 AI 標示。
- 伺服器、帳號、多人共用狀態。頁面不寫入任何專案檔案。
- 以腳本確定性地套用決定。套用由 AI 依提示詞執行，strict audits 負責驗證結果。
- 在 design-system-to-storybook 加硬性關卡。該 skill 目前不檢查 token audit，是否新增關卡列為待決事項。
- 調整相近門檻（顏色 deltaE 3、alpha 0.03、數值規則）與 CSS token-review 註解的語意。
- audit_sources.mjs 的判定邏輯。
- 翻譯既有的英文套件。

## Decisions

### 單一判定模組 review_core.mjs，audit_tokens 與審查頁共用

新增 design-system-extractor/scripts/review_core.mjs，只匯出純函式、沒有頂層副作用、不讀 process.argv。內容涵蓋：CSS 宣告解析（含註解）、顏色解析與 deltaE76、數值解析與相近判斷、Markdown 表格解析、相近配對偵測、決定記錄收集與配對判定、審查事項組裝（分組、用途、建議與已記錄狀態）、圖片區域解析、locale 解析。audit_tokens.mjs 保留層級與命名檢查，改為匯入相近偵測與判定並刪除自身副本；generate_review_html.mjs 改為匯入並刪除自身副本。相近門檻沿用現值。

理由：兩份副本已經分歧（a11y-remap、同行註解的正則修正只進了 audit）。替代方案「保留兩份並加比對測試」只能事後發現分歧；「讓審查頁匯入 audit_tokens.mjs」不可行，因為 audit 在頂層直接執行並呼叫 process.exit。

### 決定判定規則：精確 token 名稱、只讀決定欄、未決字樣優先

一個相近配對是否已決定，依序套用：

1. token 名稱必須完整相符：名稱前後不得緊接英數字、底線或連字號。--md-ref-size-1 不會比對到 --md-ref-size-18。
2. 表格列的候選 token 是該列中 Rationale 與 Confirmed by 以外各欄出現的 ref token 名稱。
3. 表格有決定欄（標頭正規化後含 decision 且不含 suggested）時，只讀該欄。該欄先比對未決字樣，符合即為未決；否則含決定關鍵字（沿用現行清單：merge、merged、keep、distinct、separate、split、approved、合併、保留、拆開、分開、確認）才算有決定。未決字樣沿用 audit_components.mjs 與 audit_sources.mjs 中 unresolvedPattern 的完整清單，包含空白、連字號、n/a、none、pending、open、unknown、needs review、needs decision、待確認、未決、未定、要確認、問號等。
4. 表格標頭同時含 Suggested action 與 Confirmed by 時稱為審查流程表，該表的列另須 Confirmed by 欄寫有確認者才算已決定；該欄空白或只有未決字樣時視為沒有確認者。只有其中一欄的表格是本變更之前的版面，依第 3 條只看決定欄，不看 Confirmed by 欄的內容。（端對端驗證時修正：原本只以 Suggested action 欄判定。比對 lab 的 8 個既有套件後發現兩種既有版面：cm-demo-ds 的表格有 Suggested action 與 Developer decision 而沒有 Confirmed by 欄，原規則會讓它從通過變成失敗；變更前的模板則本來就有 Confirmed by 欄而沒有 Suggested action 欄，由萃取階段自行填寫或留空，有 5 個套件採用，所以也不能只以 Confirmed by 欄判定。兩欄同時存在只會出現在新模板。）
5. 一列已決定時，該列候選集合內的所有相近配對都算已決定。該列的動作是合併時，被併掉的 token（存活 token 以外的候選）與任何其他 token 的配對也一併算已決定，因為它即將被移除；建議欄的合併同樣以此範圍涵蓋配對。（實作第 2 步時補上：一組內有保留也有合併、拆成兩列記錄時，被併掉的值與保留列中各值的配對不在任何一列的候選集合內，沒有這條就永遠無法涵蓋。）
6. 相容規則：不在表格內的文字行，或所屬表格沒有決定欄的列，只要同時含兩個完整 token 名稱、含決定關鍵字、且不含未決字樣，仍算已決定。
7. CSS 註解與 a11y-remap 沿用 audit_tokens.mjs 現行規則：任一 token 的前置或同行註解含 token-review 決定或 a11y-remap；或 TOKEN_ARCHITECTURE.md 的 Accessibility Remap 章節內、或含 a11y-remap 字樣的行同時含兩個完整名稱。

配對的判定結果有三種：confirmed（依上列規則已決定）、suggested（尚未決定，但有表格列以 Suggested action 欄涵蓋該配對；任何有這一欄的表格都算，不限審查流程表）、undecided（其餘）。audit_tokens.mjs 的 Token review candidates 計入所有非 confirmed 的配對（suggested 與 undecided），Awaiting designer confirmation 是其中 suggested 的數量。

替代方案「只接受表格列、不再接受文字行」會讓以條列文字記錄決定的既有套件全部失敗，故保留相容規則，但套用精確比對與未決字樣檢查。

### Near Token Decisions 新欄位與待確認語意

模板的 Near Token Decisions 表改為：Candidates、Provenance、Difference、Suggested action、Decision、Rationale、Confirmed by。

- Candidates：兩個以上、以反引號標記的項目。項目是 ref token 名稱；不存在或已不存在的值則寫原始值。當該列的建議或決定是合併時，每個 token 後須以括號附上值（例如 --md-ref-size-15 後接 (15px)），合併套用後 token 被移除，這個值是頁面顯示與拆回的依據。
- Suggested action 與 Decision 的用語：keep distinct，或 merge into 加一個反引號標記的存活 token。一列只有一種動作；同一組內有保留也有合併時拆成多列。
- Provenance：沿用 authored / measured 兩個關鍵字，可用報告語言補充說明。
- Decision 在確認前留空或寫 pending。Confirmed by 記錄確認者、方式與日期，例如 designer via review.html 2026-11-13，或 user in chat 2026-11-13。
- AI 在萃取時只寫 Suggested action、Provenance、Difference、Rationale，並把相近值各自保留為獨立的 ref token，不得先合併。設計師以審查頁的提示詞或在對話中明確答覆後，AI 才填 Decision 與 Confirmed by 並套用合併。
- 缺少 Suggested action 欄或 Confirmed by 欄的既有表格維持原語意：決定欄有決定即算已決定，不看 Confirmed by 欄的內容。這類表格若有 Suggested action 欄，其內容仍讀作建議，所以有建議而沒有決定的列會列為等待設計師確認。

理由：其他兩種審查表（重複來源、相似元件）原本就有「建議」與「決定」兩欄，只有相近 token 表沒有，導致 AI 的建議與人的決定無法區分。替代方案「AI 先依建議合併、頁面事後可反悔」會讓拆回需要從證據重新推回哪些角色用了被併掉的值，容易出錯；保留為獨立 token 直到確認，套用合併只是改指向與刪除，是機械操作。

### 相近值分組與密集階梯呈現

- 以所有相近配對為邊，取連通分量；每個分量是一件審查事項。顏色與數值天然分開（數值只在同一 family 與單位群組內成對）。
- 成員排序：顏色依相對亮度由亮到暗，數值由小到大。
- 事項識別碼：tok: 加上成員 token 名稱排序後以直線符號串接。成員不變時識別碼不變。
- 成員超過 12 個的事項標記為密集階梯：頁面以精簡卡片呈現（依序列出所有值，標出沒有任何 sys 角色使用的值與非整數值），可展開成逐值勾選。不拆分、不推測等差規律。門檻 12 為具名常數，依原型對 11 個字級的事項仍可直接閱讀、對 113 個尺寸的事項不可閱讀而定。
- 事項的 AI 建議由有 Suggested action 欄的表格列推得：被某列以 merge into 指定併入的成員為合併，其餘為保留。事項內每個相近配對都被至少一列的 Suggested action 涵蓋（或已決定）時，事項才算有建議。
- 事項狀態：所有配對 confirmed 為 confirmed；否則有建議為 suggested；否則為 undecided。
- 已合併的值：任何表格列若決定或建議為合併，且候選含原始值或已不存在於 tokens-ref.css 的 token，另組成一件來源為 merged 的事項，成員含存活 token 與被併掉的值，可在頁面上選擇拆回。與存活 token 的值相同的原始值不算被併掉的值：seven-lights 的既有紀錄寫成「6px 與 8px 併入 radius-8」，而 radius-8 就是 8px，被併掉的只有 6px。（端對端驗證時以真實套件比對原型後補上。）

替代方案「把大分量在最大間距處切成數件」會產生多張內容相近的卡片，且邊界兩側的值無法互相合併；「偵測等差數列並自動略過」需要推測設計意圖，誤判時會把該審的值藏起來。精簡卡片不隱藏任何值，只改變預設的呈現密度。

### 審查事項資料模型與 --json 輸出

generate_review_html.mjs --json 輸出單一 JSON 物件且不寫檔，包含：

- counts：保留 sources、colorScaleIssues、nearColors、nearNumbers、components、needsReview；新增 items（事項總數）、confirmed（已確認事項數）、unresolvedNearPairs（未決的相近配對數，與 audit_tokens.mjs 的 Token review candidates 相等）。
- needsReview：狀態為 suggested、undecided、issue 的事項，陣列長度等於 counts.needsReview。
- items：全部事項。相近 token 事項含 id、section（tokens）、kind（color、type、radius、length、number）、origin（near 或 merged）、status、dense、pairs、members（name、value、exists、roles、components、componentTokenCount）、suggestion（keep、merge、reason、provenance，或 null）、recorded（keep、merge、confirmedBy，或 null）。相似元件與重複來源事項含 id、section、kind（choice）、status、left、right、options、suggestion（choice、reason）、recorded（choice），相似元件另含 sides（每邊的 key、name、image 的 src 與自然尺寸、marks 的區域）。色階問題事項 kind 為 color-scale、status 為 issue。

相似元件與重複來源事項的狀態：Developer decision 欄依現行 audit 規則已有決定為 confirmed；否則 Suggested action 欄有可辨識的動作為 suggested；否則為 undecided。

counts.needsReview 的意義由「待審的列與配對數」改為「等待設計師的審查事項數」，與頁面上的待確認數一致。pipeline-board 只讀這個整數，程式不需修改。

用途計算：ref token 的 roles 是 tokens-sys.css 中以 var() 引用它的 sys token；components 是引用這些 sys token 的 comp token 所屬元件，歸屬依 design-system/components 下各規格文件內出現的 comp token 名稱決定，沒有任何規格列出的 comp token 只計入 componentTokenCount。

### 靜態審查頁以模板檔產生，狀態存在瀏覽器，導出提示詞

- 頁面模板為 design-system-extractor/assets/review-page/review.template.html（單一檔，內含 CSS 與 JavaScript），產生腳本把資料以 JSON 注入後寫出單一 HTML。資料中的小於符號須跳脫，避免提早結束 script 區塊。頁面不引用任何外部資源；截圖以相對路徑引用產生腳本複製到輸出目錄旁的 assets。
- 每件事項的初始狀態：confirmed 的事項收合顯示已記錄的結果；suggested 的事項以 AI 建議為起點；undecided 的事項以全部保留為起點且沒有「同意 AI 建議」。
- 相近 token 的操作：每個值一個勾選框，打勾為保留；取消勾選時自動併入距離最近的保留值（顏色用 deltaE，數值用差值；距離相同時取顯示順序較前者），可用下拉選單改選併入對象；最後一個保留值不可取消。顏色事項在有合併時顯示合併後的色條預覽。
- 相似元件與重複來源的操作：單選選項，每個選項附一句白話說明，AI 建議的選項有標記。
- 每張卡有確認、先跳過；偏離 AI 建議時可還原並可填補充說明；確認後收合成一列摘要並可再修改。底部操作列有進度、全部同意 AI 建議（只作用於尚未改動且有建議的事項）、預覽提示詞、複製提示詞。
- 狀態存於 localStorage，鍵為 ds-review: 加上套件資料夾名稱與目標根目錄絕對路徑的短雜湊（SHA-256 十六進位的前 8 碼，於產生時算好並寫入頁面），避免 file 協定下不同套件互相覆蓋。已不存在的事項，以及已記錄結果與本機選擇相同的事項，其本機紀錄在載入時清除。localStorage 不可用時頁面照常運作，只是不保存。
- 提示詞涵蓋本次在頁面上確認、且結果尚未記錄的事項。內容依序為：指定使用 design-system-extractor 套用審查決定、套件名稱、審查頁產生日期、確認者與日期；依區段列出各事項，每筆以狀態標記開頭（同意 AI、設計師調整並附 AI 原建議、設計師決定），相近 token 逐值列出保留、合併（含兩邊的完整 token 名稱與值）、維持合併、拆回，並附設計師的補充說明；最後是套用指示（合併與拆回的作法、各類決定寫入哪一張表、Confirmed by 的寫法、重跑 strict audits 與重新產生文件、回報無法套用的項目）。提示詞語言跟隨頁面語言，決定關鍵字維持英文正典形式。
- 複製使用剪貼簿 API，失敗時退回選取文字的複製方式；兩者都失敗時開啟預覽並提示手動複製。

替代方案「下載 JSON 再由腳本套用」對保留區分可行，但合併需要改寫 sys 對應並判斷命名，仍需 AI；讓使用者只處理一段可讀的文字比處理檔案簡單。

### 相似元件兩邊截圖與區域標示

- Component Similarity Review 的 Visual reference 欄可放兩張 Markdown 圖片：第一張是新候選（A），第二張是既有的相似元件（B）。只有一張時視為 A，B 邊顯示沒有截圖。
- 區域寫在圖片網址的片段，採 W3C Media Fragments 的空間維度語法：xywh=percent: 後接 x、y、寬、高（0 到 100，佔圖片的百分比），或 xywh= 後接像素值（可帶 pixel: 前綴）。瀏覽器與 Markdown 檢視器會忽略片段並顯示整張圖。無法解析的片段視為沒有區域。
- 建議記錄完整截圖加區域，而不是預先裁切的圖；區域座標的來源依序為實際渲染頁面的元素範圍、Figma 節點範圍、對純截圖的目測。SKILL.md 建議使用百分比以避免裝置像素比換算錯誤。
- 卡片上兩邊並排。有區域且知道圖片自然尺寸（產生時讀 PNG 檔頭）時，縮圖自動對準區域：以區域外擴（至少 28px，或區域短邊的 18%）為取景框，取景框寬不小於 380px，寬高比限制在 0.8 到 2.4 之間，並限制在圖片範圍內。這四個數值取自使用者已確認的原型。區域以實色框線加字母標示，不覆蓋色塊；字母優先放在框的上方，其次下方，框佔滿畫面時才放在框內。
- audit_components.mjs 對缺少 B 邊圖片或缺少區域的相似元件列發出警告（不列為 issue），既有套件的 strict 結果不變。

替代方案「新增 Candidate visual 與 Existing visual 兩欄」需要更動表格欄位與所有解析標頭的程式；沿用單一欄位放兩張圖，既有列不需修改。

### 頁內截圖檢視器

點擊卡片上的截圖開啟覆蓋整個視窗的檢視器，不開新分頁。檢視器顯示完整截圖與該圖上的所有區域框（兩邊共用同一張截圖時 A、B 同時顯示）；可切換 A、B（按鈕或左右方向鍵）、開關標示、切換符合視窗、100%、200%（點圖片切到下一個與目前不同的大小）；Esc、點圖片外空白處或關閉按鈕關閉，焦點回到原本的截圖。開啟期間背景內容設為 inert 並鎖定捲動。圖片容器以像素寬度定尺寸，區域以百分比定位，各種大小下框線位置一致；放大後容器以 margin auto 置中，確保可捲到圖片左上角。背景為實色，不使用半透明遮罩。

### 套用審查決定流程（Review Decision Apply Pass）

SKILL.md 新增一個檢查點後流程，在使用者貼上審查頁的提示詞、或在對話中明確回覆審查決定時使用：

1. 逐筆核對提示詞中的 token 名稱是否存在於 tokens-ref.css；不存在者列為無法套用，其餘繼續。
2. 合併：把被合併 token 的所有 sys 引用改指向存活 token，移除被合併的 ref token。拆回：依來源證據把值還原為獨立的 ref token，並修正應使用它的 sys 與 comp 對應。
3. 在對應的表格寫入 Decision 與 Confirmed by（相近 token），或 Developer decision（相似元件、重複來源）。合併列須保留被合併 token 的值。
4. 重跑三支 strict audits，重新產生 index.html 與 review.html，更新 SESSION_STATE.md，回報已套用與無法套用的項目。

工作流程第 4 步（Token Architecture）與第 5 步（Component Inventory）的「停下來逐一詢問」改為：寫入建議、產生審查頁、在檢查點回報等待設計師的事項數與審查頁路徑。使用者在對話中直接答覆仍然有效，等同確認。

### 第一次詢問報告語言的預設改為 English

**Supersedes**: add-extractor-report-language / Report Language 詢問時機與 SESSION_STATE 持久化

詢問時機與持久化不變：SESSION_STATE.md 沒有可辨識的 Report Language 紀錄時詢問一次，之後沿用。變更的是選項與預設：依序為 English（預設、推薦）、繁體中文、日本語、使用者指定的其他語言。無法詢問時（非互動執行）使用 English 並寫入紀錄。使用者的需求原文是「至少可以選擇中文或是英文，預設為英文」。

### HTML 產生腳本未指定 locale 時依套件記錄的語言

**Supersedes**: add-extractor-report-language / generate_docs_html.mjs 新增 --locale 參數並連動報告語言

generate_docs_html.mjs 與 generate_review_html.mjs 的介面語言依序決定：--locale 旗標的支援值（zh-Hant、en、ja）；否則 SESSION_STATE.md 的 Report Language 紀錄經對應（中文標籤對應 zh-Hant、ja 對應 ja、其餘對應 en）；沒有紀錄時為 en。旗標值不支援時在 stderr 印出警告、依後兩者決定、結束碼為 0。原先「未指定即 zh-Hant、不支援值退回 zh-Hant」的行為取消。審查頁與主文件一樣提供繁中、EN、日本語切換，瀏覽器記住選擇；AI 撰寫的理由文字不翻譯。

理由：README 與各 agent 指示範例呼叫產生腳本時多半不帶旗標，現行結果是英文內容配繁中介面。

### 審查頁介面規則：深色操作台、實色、卡片無外框

- 版面為應用程式外殼：左側欄（標題、進度、區段導覽、使用說明、語言與色塊背景設定）、主區（置頂標題列與卡片）、固定底部操作列。
- 不使用漸層、半透明底色與 backdrop blur；卡片不加外框、不在卡片內再放卡片，層級以底色差異表達；裝飾線只用在文字左側。色塊舞台是功能性畫布，可切換深、灰、淺三種底色。
- 文字不小於 12px；內文 15px、說明 14.5px。
- 互動元素使用原生 button、checkbox、select；所有可聚焦元素有 focus-visible 外框；prefers-reduced-motion 時取消平滑捲動。
- 具體數值以 Design Source 的表格為準。

references/html-documentation.md 原本要求審查頁採「editorial documentation layout」，該段改為本規則；主文件 index.html 的規則不在此變更。

### pipeline-board 的待決定數量以審查事項計

pipeline-board 規格中「機器可讀模式加入後 HTML 輸出須逐位元組相同」的情境是當時新增 --json 的一次性保證，審查頁改版後不再成立，予以移除。改為要求：看板顯示的數量取自 counts.needsReview，其值等於審查頁上等待設計師的事項數，且 needsReview 陣列長度與之相等。pipeline-board 的程式與設定不修改。

## Implementation Contract

**行為**

- 設計師開啟 docs/design-system/review.html，看到依區段排列的審查事項卡片與等待確認的數量；可逐張同意或調整、一次同意全部 AI 建議、複製提示詞；重新整理後先前的選擇仍在。
- AI 依提示詞套用後重新產生的頁面中，已套用的事項顯示為已確認。
- 採用審查流程表的套件，只要有相近配對僅有建議而未確認，audit_tokens.mjs --strict 以結束碼 1 結束並列出這些配對。

**介面與資料形狀**

- node design-system-extractor/scripts/generate_review_html.mjs，參數為目標根目錄、可選的輸出路徑、可選的 --locale（zh-Hant、en、ja）、可選的 --json。HTML 模式寫出一個 HTML 檔（預設 docs/design-system/review.html）並把 design-system/assets 複製到輸出目錄旁；保留現有的摘要輸出行並新增事項數與等待設計師數。--json 模式只輸出「審查事項資料模型與 --json 輸出」所述的物件。
- node design-system-extractor/scripts/audit_tokens.mjs，參數不變。保留 Token review candidates 與 Documented review decisions 兩行；新增 Awaiting designer confirmation 一行，計入有建議但未確認的配對；未決配對的訊息區分「有建議、等待確認」與「沒有決定」。
- node design-system-extractor/scripts/generate_docs_html.mjs，參數不變，只改 locale 的決定順序。
- Markdown 契約：Near Token Decisions 的欄位與儲存格格式、Visual reference 的兩張圖片與 xywh 片段，如上列決策所述。
- localStorage 鍵與提示詞內容結構，如上列決策所述。

**失敗模式**

- 缺少 token 檔或文件：產生腳本仍寫出頁面，對應區段為空，--json 的計數為 0。
- 找不到頁面模板檔：產生腳本以非 0 結束並指出缺少的路徑。
- 圖片區域無法解析或缺少：頁面顯示完整截圖、不畫框；audit_components.mjs 發出警告。
- 剪貼簿不可用：頁面開啟提示詞預覽並提示手動複製。
- localStorage 不可用：不保存，其餘功能正常。
- --locale 值不支援：stderr 警告，依套件紀錄或 en，結束碼 0。
- 提示詞指到已不存在的 token：套用流程把該筆列為無法套用並繼續其餘項目。

**驗收**

- node --test design-system-extractor/scripts/test_review_core.test.mjs 通過，至少涵蓋：四種誤判的回歸案例、審查流程表需 Confirmed by、既有表格與文字行的相容、分組（9 對成為 3 件）、密集階梯標記（13 個相連值）、已合併的值、用途計算、xywh 兩種語法、locale 決定順序。
- node --test design-system-extractor/scripts/test_review_page.test.mjs 通過，至少涵蓋：HTML 不含對外部網址的資源引用、--json 的 needsReview 長度等於 counts.needsReview、counts.unresolvedNearPairs 等於同一夾具上 audit_tokens.mjs 的 Token review candidates、--locale 三種情況、缺模板時的錯誤。
- 以瀏覽器開啟夾具產生的頁面，逐項確認：調整與確認、全部同意、提示詞內容、複製、重新整理後保留、語言與色塊背景切換、截圖檢視器（頁內開啟、三種大小、A 與 B 切換、標示開關、Esc 關閉且焦點返回）、420px 寬無水平捲動。可用快取中的 verify.mjs 作為走查腳本的參考。
- 既有套件（Near Token Decisions 表沒有同時具備 Suggested action 與 Confirmed by 兩欄）在本變更前後，除了修正的誤判之外，三支 strict audits 的結果相同。

**範圍**

- 範圍內：design-system-extractor 的審查頁、判定模組、token audit 的相近判定、component audit 的警告、兩支產生腳本的 locale 決定、SKILL.md 與參考文件、模板、流程說明頁；兩份新規格與兩份修改規格。
- 範圍外：Non-Goals 所列各項；pipeline-board、design-system-to-storybook、agent-automation-orchestrate 的程式。

## Risks / Trade-offs

- [修正誤判後，既有套件中原本靠誤判通過的配對會變成待審] → audit 訊息逐筆列出配對與原因；README 的升級說明寫明這是修正而非新限制；以夾具測試確認沒有誤判的套件結果不變。
- [AI 仍可能自行填寫 Decision 與 Confirmed by] → 腳本無法分辨填寫者；以 SKILL.md 的規則與 Confirmed by 的稽核軌跡約束，並在檢查點回報等待設計師的事項數。
- [套用依賴 AI 正確解讀提示詞] → 提示詞逐值列出完整 token 名稱與值；套用後 strict audits 與重新產生的頁面是驗證；無法套用的項目必須回報。
- [密集階梯全部保留時，一列要列出全部 token 名稱，儲存格很長] → 這是精確記錄的代價；新增同 family 的值時未涵蓋的配對會被 audit 指出，不會被舊決定默默帶過。
- [純截圖的區域由 AI 目測，框可能偏移] → 框畫在完整截圖上，偏移一眼可見；設計師可在補充說明或對話中指出。
- [file 協定下 localStorage 可能被多個頁面共用] → 鍵含套件名稱與路徑雜湊。
- [下游沒有硬性關卡：design-system-to-storybook 不檢查 token audit，待確認事項不會自動擋住它] → 本變更只提供可見性（strict audit 失敗、pipeline-board 顯示數量）；是否加關卡見 Open Questions。
- [與暫存中的 add-production-extraction-and-mount 修改相同檔案] → 後套用的一方以當時的檔案內容為準合併；本變更的任務以行為描述，不依賴行號。
- [日文介面字串沒有原型] → 以英文字串為底翻譯，並由測試確認三種語言的字串鍵一致。

## Migration Plan

- 既有套件不需修改。若升級後 strict token audit 新增失敗，代表該配對原本是誤判通過，補上決定即可。
- 既有套件要採用新流程時，把 Near Token Decisions 表換成新欄位；已有的決定列可保留在舊表格或搬到新表格並填 Confirmed by。不要只在舊表格補上缺少的那一欄：兩欄一旦齊備，表內每一列已有的決定都需要確認者。
- 對仍是舊版面的表格套用審查決定時，寫進表格既有的欄位：決定寫入既有的決定欄；表格沒有 Confirmed by 欄時，把確認者寫在 Rationale 的末尾。
- 未帶 --locale 且沒有 Report Language 紀錄的既有套件，重新產生的文件介面會由繁中變成英文；在 SESSION_STATE.md 補上紀錄或帶旗標即可指定。
- 回復方式：還原腳本與模板即可；新欄位的表格在舊腳本下仍可解析（舊腳本會把只有建議的列視為已決定，這是回復後已知的舊行為）。

## Open Questions

- design-system-to-storybook 是否要在開始前檢查等待設計師的事項數並停下或警示？負責決定：使用者。這不影響本變更的實作。
