# Anti-AI Style 說明文件

繁體中文｜[English](README.en.md)

`anti-ai-style` 讓 AI agent 找出畫面中看起來像 AI 生成的地方，並把每一處換成屬於這個產品的決定。預設只審查、不改檔案。給 agent 讀的完整指令在 [SKILL.md](SKILL.md)，這份文件是給人看的導覽。

## 核心觀念

畫面會有「AI 味」，是因為上面看得到的選擇其實沒有人做過。參考稿、內容或需求留了空白，最常見的答案就被填進去：靛紫漸層、一律很大的圓角、加了外框又加陰影的卡片、三張等寬的功能卡、置中的大標題、「John Doe」、「一站式賦能」。

單獨看，每一項都沒問題。它們一起出現，又都沒有人選過，才讓畫面看起來像生成的。

整個 skill 由兩條規則推出來：

- **判斷的是有沒有依據，不是樣式本身。** 產品設計稿裡本來就有的漸層是證據；為了填滿空白才加上去的同一個漸層是預設值。
- **只刪不算修好。** 把畫面刪成一堆灰色方塊，是另一種預設值。每個修正都要寫出換成什麼：真實內容、內容需要的結構，或設計依據裡看得到的處理方式。

## 什麼時候用、怎麼叫它

一次請求用一種模式。需求不明確時一律先做 `review`。

| 情境 | 模式 | 會得到什麼 | 可以這樣說 |
| --- | --- | --- | --- |
| 畫面已經做好，想知道哪裡像 AI 做的 | `review`（預設） | 審查報告，不改任何檔案 | 用 $anti-ai-style 審查 src/pages/Dashboard.tsx，這次只做 review。 |
| 想直接把 AI 味修掉 | `fix` | 審查報告、套用的修正、修完的驗證結果 | 用 $anti-ai-style 把 ./prototype 的首頁去 AI 味，設計依據在 design-system/。 |
| 準備生成新的 UI | `prevent` | 生成前先寫出決定，生成後自我審查再交付 | 生成這個畫面之前，先用 $anti-ai-style 的 prevent 模式。 |
| 專案需要自己的規則檔 | `rules` | `design-system/ANTI_AI_STYLE_RULES.md` | 用 $anti-ai-style 的 rules 模式，依 design-system/ 寫出這個專案的規則檔。 |

Claude Code 與 Cursor 用 `/anti-ai-style`，Codex 用 `$anti-ai-style`。說「去 AI 味」「很 AI」「罐頭感」「模板感」也會觸發。

沒有參考稿也能用：它會先寫一份很短的 Design Direction，再依它判斷。要跟參考稿逐像素比對時，請改用 `ui-pixel-align-report` 或 `ui-compare-to-reference`。

## 怎麼判斷一個地方是不是 AI 味

一個樣式要不要留，由下面第一個有講到它的來源決定，前面的優先：

1. 專案規則：`design-system/ANTI_AI_STYLE_RULES.md`（含 Evidenced Exceptions）、設計系統文件與 tokens
2. 設計證據：Figma、參考截圖、既有產品實際的畫面
3. 使用者這次講過的方向，或已經記錄的 Design Direction
4. 通用目錄 [references/tells.md](references/tells.md)

前三項都沒有時，要先寫一份九行的 Design Direction：畫面類型、內容、主從層次、密度、字、色彩角色、表面、動態，以及「不做什麼」。沒有它，審查只能列出通用目錄的比對結果，而且必須註明。模板在 [references/decisions.md](references/decisions.md)。

每個候選項會得到一個判定：

| 判定 | 意思 | 處理 |
| --- | --- | --- |
| `evidenced` | 依據裡看得到這個樣式用在這個角色 | 保留，註明來源 |
| `chosen` | 記錄的設計方向要求它 | 保留，註明方向 |
| `default` | 沒有任何依據 | 列為問題，修正 |
| `wrong genre` | 樣式屬於另一種畫面，例如 App 畫面上放行銷頁的大標區 | 列為問題，重排結構，不是換樣式 |
| `open` | 主色、字型這類品牌層級的選擇，正反都沒有依據 | 先問，不擅自更換 |

拿不準時用五個測試：

- **理由**：能不能用這個產品的語言說出它為什麼在這裡？「看起來現代」「比較有質感」不算。
- **換名**：把產品名換成競品，畫面還是完全適用，就表示上面沒有東西屬於這個產品。
- **移除**：拿掉之後沒有少資訊或功能，它就是裝飾。
- **瞇眼**：模糊著看，應該有一個主角、一個配角。全部一樣重，表示主從層次沒有決定過。
- **極端內容**：放進最長的名字、0、負數、空清單、錯誤訊息，版面還撐得住嗎？

## 流程與修正順序

1. **確認範圍與依據。** 點名要看的畫面、story、檔案或 Figma frame，並記下哪些依據存在。
2. **收集候選項。** 三個來源各自會找到別處找不到的東西：原始碼（掃描腳本）、實際渲染的畫面、文案與資料。
3. **逐項判定。** 同一個畫面出現同一群集三個以上的 tell，代表它是套模板做的，要從決定重做，不是逐項修補。
4. **依決定順序排修正計畫。** 動手前先寫出每一項要換成什麼、來源是什麼。
5. **套用。** 只有 `fix` 模式會改檔案。
6. **驗證。** 重跑掃描、重看畫面、重做五個測試，並確認沒有修成空白一片。
7. **產出報告。** 依使用者的語言撰寫。

修正永遠照這個順序：

**畫面類型 → 內容 → 主從層次 → 密度 → 字 → 色 → 表面 → 裝飾 → 動態**

後面每一層都在裝飾前一層的決定。內容還是假資料就先修陰影，只會得到一個做工精緻的假畫面。

改在程式碼的哪一層也有順序：token 或 theme、共用元件、組裝、單一頁面。在很多畫面重複出現的問題，幾乎都不該修在頁面上。改到 token 或共用元件時，照專案的設計系統核准流程走（有 `ds-governance` 就用它）。

報告包含：總評、問題清單（tell 編號、位置、現況、判定、替代方案、該修在哪一層）、保留清單、待確認事項、修正計畫、驗證結果與這次沒看到的範圍。有依據而保留的項目會列出來源，下一位審查者就不會再標一次。結構見 [references/review-report-template.md](references/review-report-template.md)。

## Tell 目錄

目錄共 41 個 tell，分成七組。每個 tell 都有固定編號、它跳過了哪個決定，以及該換成什麼。其中 18 個可以從原始碼機械偵測，其餘要看實際畫面或讀內容才能判斷。完整內容在 [references/tells.md](references/tells.md)。

| 群組 | 數量 | 例子 | 掃描腳本涵蓋 |
| --- | --- | --- | --- |
| C 內容 | 6 | 佔位人名、整齊對稱的假資料、罐頭文案、只有理想狀態、用 emoji 當圖示 | C1、C3、C6 |
| L 版面 | 6 | 畫面類型錯置、什麼都包成卡片、等權重的格狀排列、全部置中、為了高級感灌留白 | L4 |
| T 字 | 7 | 沒選過的預設字型、UI 標籤用大標字、全部加粗、灰到看不清、漸層文字 | T1、T6 |
| K 色 | 6 | 預設的靛紫色、主色染滿全畫面、套用通用語意而不是領域語意、半透明白 | K1、K6 |
| S 表面與形狀 | 6 | 每張卡片都有外框、外框套外框、外框加陰影加大圓角疊在一起、玻璃擬態、發光陰影 | S3、S4、S5、S6 |
| D 裝飾 | 6 | 背景漸層、光暈色塊與波浪、淡色圓角方塊裡放圖示、用裝飾代替產品畫面、到處貼標籤 | D1、D2、D3 |
| M 動態 | 4 | `transition: all`、hover 浮起或放大、所有元素進場淡入、沒有意義的循環動畫 | M1、M2、M3 |

領域語意優先於通用語意。例如台股行情裡紅色是上漲、綠色是下跌，不是錯誤與成功。

Tell 通常成群出現，群集比單一項目更能說明問題。目錄列了四個常見群集：Landing template、Default dashboard、Dark glass、Soft everything。

要新增或修改 tell 時，只改 `references/tells.md`：用該組下一個空號、不重新編號，升版號並記在 change log。能機械偵測的再補上掃描規則與測試。只適用單一產品的規則寫進該專案的規則檔，不進通用目錄。

## 掃描腳本與專案規則檔

掃描腳本讀原始碼，列出 18 個可機械偵測的 tell，附 `檔案:行號`。結果是候選項，不是判決。

```bash
node anti-ai-style/scripts/scan_ai_tells.mjs <UI 原始碼路徑> --rules design-system/ANTI_AI_STYLE_RULES.md
```

- `strong` 候選項很少有設計依據；`check` 候選項常常是合理的，要對照依據才知道。
- `--rules`：專案規則檔 `Evidenced Exceptions` 表格第一欄列出的編號會改列為「允許」。它們仍會顯示，方便確認每一次使用都在允許的範圍內。
- `--allow <編號,編號>` 額外允許；`--json` 輸出機器可讀的結果；`--strict` 在還有未被允許的 `strong` 候選項時以 1 結束。
- 單行例外：在該行或上一行的註解寫 `anti-ai-allow: D1 <原因>`。
- 掃得到：CSS、SCSS、HTML、JSX、TSX、Vue、Svelte、Astro，以及 SwiftUI 的漸層與 material、Compose 的漸層筆刷。
- 掃不到：藏在 token 後面的數值、版面與主從層次、圖片，以及執行時才畫出來的內容。這些要看實際畫面。
- 會自動略過 `node_modules`、build 輸出、測試檔與壓縮過的檔案。

專案規則檔 `design-system/ANTI_AI_STYLE_RULES.md` 是判斷依據的第一順位。通用目錄說的是哪裡容易出錯；專案規則檔說的是這個產品不能出什麼錯，以及哪些長得像 tell 但其實是產品自己的東西。它有五個部分：

| 段落 | 內容 |
| --- | --- |
| Product Character | 兩三句話說明這是什麼產品、畫面用來做什麼、密度多高 |
| Evidenced Exceptions | 符合某個 tell 但屬於產品的樣式，逐列寫編號、樣式、允許範圍、依據 |
| Domain Semantics | 通用解讀會弄錯的意義，例如紅綠代表什麼 |
| Do Not Add Unless Evidenced | 除非有依據否則不加的項目 |
| Component Restraints | 綁在具名元件上的規則，這份檔案大部分的價值在這裡 |

一條有用的元件規則會點名四件事：元件、它容易被做成的通用版本、要保留的可量測特徵、依據。

- 好的寫法：不要把 Realtime Quote Tile 做成一般的股票卡片或儀表板方塊；保留 170x148 的尺寸、密度與底部圖表區。
- 沒用的寫法：「保持介面簡潔一致」「避免 AI 感的設計」。這種句子無法檢查，放到別的產品也一樣成立。

寫法細節見 [references/project-rules.md](references/project-rules.md)，起始模板是 [assets/ANTI_AI_STYLE_RULES.template.md](assets/ANTI_AI_STYLE_RULES.template.md)。

## 不做的事

- `review` 模式不改任何檔案。
- 依據裡有的樣式不移除，不管它多像 tell。
- 不用另一個預設值取代原本的預設值。把靛紫換成青色、把一個流行字型換成另一個，沒有來源就是同一個問題。
- 不為了「有人味」加東西。歪歪的貼紙、手繪底線、刻意不對稱，都是沒有來源的裝飾。
- 不捏造事實、客戶或數字讓內容看起來真實。沒有來源的宣稱直接刪掉；範例資料會標明是範例。
- 標為 `open` 的品牌層級選擇，沒有使用者回覆前不動。
- 不擁有 token 與共用元件。改到它們要走專案的設計系統核准流程。
- 不做逐像素比對。

## 檔案、安裝與搭配的 skill

| 檔案 | 用途 |
| --- | --- |
| `SKILL.md` | 流程、四種模式、判定規則 |
| `references/tells.md` | Tell 目錄，目前版本 1.0.0 |
| `references/decisions.md` | 八個決定、Design Direction 模板、五個測試、過度修正的陷阱 |
| `references/project-rules.md` | 專案規則檔的寫法 |
| `references/review-report-template.md` | 審查報告的結構 |
| `assets/ANTI_AI_STYLE_RULES.template.md` | 專案規則檔模板 |
| `scripts/scan_ai_tells.mjs` | 原始碼掃描腳本 |
| `scripts/test_scan_ai_tells.test.mjs` | 掃描腳本的測試，用 `node --test` 執行 |

安裝到 Claude Code、Codex、Cursor（在 cm-skills repo 根目錄執行，先預演再安裝）：

```bash
node scripts/install_agent_skills.mjs --agent all --scope user --skill anti-ai-style --dry-run
node scripts/install_agent_skills.mjs --agent all --scope user --skill anti-ai-style
```

搭配的 skill：

- `design-system-extractor`：萃取設計系統時，用本 skill 的 `rules` 模式寫專案規則檔。沒安裝本 skill 時，extractor 會用自己的基本版。
- `ds-governance`：修正動到 token 或共用元件時，核准流程照它走。
- `ui-pixel-align-report`、`ui-compare-to-reference`：要對照參考稿逐項比對與修正時用它們。
