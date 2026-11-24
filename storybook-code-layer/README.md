# Storybook Code Layer（核心迴路驗證版）

在 Storybook 上選取元件、在右側面板換 token、即時看到結果，按「套用」後直接改到真實的 token 檔或元件 CSS，寫完自動驗證畫面與檔案一致，也可以還原。操作方式接近 Figma 的選取與屬性面板。

> **狀態：驗證階段（0.1.0）。** 這個資料夾還沒有 `SKILL.md`，repo 的 `scripts/install_agent_skills.mjs` 會略過它。完整 v1（其餘屬性可編輯、AI 對話框、`--update`、綁定推導）會另外寫成 spectra change。

## 能做什麼

| 項目 | 驗證階段 |
|---|---|
| 工具列開關「Code Layer」、選取游標、hover 外框（含旋轉）、點選最外層元件、Esc 清除 | ✔ |
| 右側「設計」面板，開啟時自動停靠右側，關閉後回原位 | ✔ |
| **填色**、**圓角**：換成另一個 token，即時預覽 | ✔ 可編輯 |
| 文字色、字體、字級、字重、padding、最小尺寸 | 只顯示數值、token 與「尚不可編輯」的原因 |
| 套用：改 comp token（真相檔＋鏡像）或改元件 CSS 的 `var()`；寫入前在候選樹上跑 token 檢查 | ✔ |
| 寫入後驗證：已驗證／此頁看不到效果／不符／逾時；重新整理後接續 | ✔ |
| 還原（後進先出；檔案被其他來源改過時不覆蓋，可略過） | ✔ |
| 複製物件參照（選取框標籤上的按鈕），貼到任何 AI 對話 | ✔ |
| 雙擊進入下一層、繼承追蹤、數值步進、AI 對話框 | v1 |

只能把 `var()` 裡的 token 換成索引中已存在、型別相同的另一個 token；不能新增 token、不能寫任意文字。

## 需求

- Storybook 10（React + Vite builder），不使用 CSF factories（`defineMain`／`definePreview`）。
- token 分三層 `ref → sys → comp`，只有 comp 檔可寫；元件 CSS 以 `var(--…)` 引用 token。
- Node 24。這台機器預設的 Homebrew node 壞掉，指令前置 `PATH=/usr/local/bin:$PATH`。

## 安裝

安裝器只做三件事：複製模板到 `<storybook>/.storybook/code-layer/`、在 `.storybook/main.ts` 的 `addons` 末尾加一行 preset、在 `tsconfig.json` 的 `exclude` 加 `.storybook/code-layer/**`。最後寫 `INSTALL_RECEIPT.json`。任何檢查不通過就一個檔都不寫。

```sh
cd cm-skills/storybook-code-layer
node scripts/build_template_manifest.mjs --check          # 模板清單是否最新
node scripts/install_code_layer.mjs --project <storybook 根目錄> --config <綁定設定.json> --dry-run
node scripts/install_code_layer.mjs --project <storybook 根目錄> --config <綁定設定.json>
node scripts/install_code_layer.mjs --project <storybook 根目錄> --check
```

- 已存在的 `code-layer.config.json` 一律保留（`--config` 只在第一次安裝時使用）。
- 已安裝的檔與模板不同時拒絕安裝（驗證階段沒有 `--update`）。
- 安裝後重新啟動 Storybook：manager 與 dev server 的程式不會熱更新。

### 專案綁定設定（`code-layer.config.json`）

驗證階段不自動推導，需要手寫。相對路徑以 Storybook 根目錄為基準。

```jsonc
{
  "schemaVersion": 1,
  "projectId": "my-storybook",            // kebab-case
  "workspaceRoot": "..",                  // 物件參照裡的路徑以此為基準
  "stateDir": "../.code-layer",           // 必須在 Storybook 根目錄（Vite root）之外
  "tokens": {
    "prefix": "md",
    "entry": { "source": "../tokens/tokens.css", "mirror": "tokens/tokens.css" },
    "tiers": [
      { "tier": "ref",  "source": "../tokens/tokens-ref.css",  "mirror": "tokens/tokens-ref.css",  "writable": false },
      { "tier": "sys",  "source": "../tokens/tokens-sys.css",  "mirror": "tokens/tokens-sys.css",  "writable": false },
      { "tier": "comp", "source": "../tokens/tokens-comp.css", "mirror": "tokens/tokens-comp.css", "writable": true }
    ],
    "readonlySources": ["src/styles/storybook.css"]
  },
  "components": { "roots": ["src/components"], "classPrefixes": ["md-"] },
  "checks": [
    { "id": "token-audit-strict", "command": "node",
      "args": ["/abs/path/audit_tokens.mjs", "{candidateRoot}", "--strict"],
      "appliesTo": "tokens", "sha256": "sha256:…" }
  ]
}
```

- `source` 是真相檔，`mirror` 是 Storybook 實際載入的副本。兩者必須逐位元組相同，否則所有套用以 `mirror-drift` 拒絕（用 `cli.mjs sync-mirror` 以真相覆蓋鏡像）。
- `checks` 在候選樹（`{candidateRoot}`）上執行，失敗就不寫任何檔。啟動時先對未修改的專案跑一次基準線；腳本不存在或基準線失敗時，token 類的套用會停用。

## 使用

1. 開 Storybook，按工具列的「Code Layer」。面板自動停靠右側並切到「設計」。
2. 滑到元件上看外框，點一下選取。面板顯示元件、variant、檔案位置與各屬性。
3. 點「填色」或「圓角」那一列，打開 token 選擇器（游標停在選項上就會預覽）。點選項加入變更清單。
4. 變更清單的每一筆顯示寫入位置與影響數。按住「按住對照」暫時看原樣；「全部捨棄」清空清單。
5. 按「套用」：寫入、熱更新、驗證。結果會寫在面板上：

| 結果 | 意思 |
|---|---|
| 已寫入並驗證 | 檔案內容已到達頁面，移除預覽後畫面就是預覽的樣子 |
| 已寫入，此頁看不到效果 | 檔案已更新，但這個 story 看不到受影響的元素（回到原 story 按「重新驗證」） |
| 已寫入，但畫面與預覽不符 | 寫入成功但畫面不是預期值，可以「還原這次套用」 |
| 已寫入，但頁面樣式沒有在時限內更新 | 熱更新沒到；按「重新整理預覽並驗證」 |

6. 「還原這次套用」把檔案改回寫入前的位元組並再驗證一次。
7. 選取框標籤上的「複製參照」（面板標題也有一個）會把物件參照放進剪貼簿（`[Code Layer 物件參照 v1]` 開頭：story、元件、CSS 檔與規則、每個屬性的 token 鏈與檔案行號），貼到 AI 對話就能指定要改的地方。

## 紀錄、還原與 CLI

`stateDir` 底下有 journal（只附加）、每次寫入前的備份、候選樹與 lock。dev server 重啟後仍可還原。

```sh
node <storybook>/.storybook/code-layer/server/cli.mjs status      --project <storybook>
node <storybook>/.storybook/code-layer/server/cli.mjs index       --project <storybook> [--json]
node <storybook>/.storybook/code-layer/server/cli.mjs sync-mirror --project <storybook> --dry-run|--apply
node <storybook>/.storybook/code-layer/server/cli.mjs undo        --project <storybook> --apply-id <id>
node <storybook>/.storybook/code-layer/server/cli.mjs recover     --project <storybook>
```

寫入類指令與 dev server 共用同一個 lock：Storybook 執行中請用面板，或先停掉 Storybook。

## 安全與已知限制

- 只在 `storybook dev` 啟用；`storybook build` 的產物不含這個 addon。
- 寫入 API（`/__code-layer/*`）只接受 loopback 連線、`localhost`／`127.0.0.1`／`[::1]` 的 Host、同源的 Origin、每次啟動隨機產生的 session header；帶 forwarded header 的請求一律拒絕。
- **已接受的風險**：同一個頁面的程式（story 載入的腳本、其他 addon）、對 localhost 有權限的瀏覽器擴充套件、本機的其他程式，都能做面板能做的事（在封閉的可寫集合內改綁 token、還原）。開著 SSH 轉送或 ngrok 之類的通道時不要啟用 Code Layer。
- 選不到 `pointer-events: none` 的元素；繼承來的屬性、`@layer`、`!important` 只顯示 computed 值與原因。
- rename 寫檔會換 inode：xattr、ACL、建立時間不保留。
- 尚未測過：play function、loader、動畫、story 開的 dialog／popover／portal、Safari 與 Firefox。

## 開發

```sh
# 模板 → 已安裝副本（單向；目的地被人改過時拒絕）。永遠不要直接改 .storybook/code-layer/
node scripts/dev_sync.mjs --project <storybook>
node scripts/build_template_manifest.mjs              # 改完模板後重建清單

# 測試（CODE_LAYER_TEST_PROJECT 用來解析 Vite 與 PostCSS）
CODE_LAYER_TEST_PROJECT=<storybook> node --test 'test/*.test.mjs'
CODE_LAYER_TEST_PROJECT=<storybook> node test/run_live_api.mjs --log <storybook log>         # 需要執行中的 Storybook
CODE_LAYER_TEST_PROJECT=<storybook> node test/run_core_loop_browser.mjs --stage 6,7,11        # CDP 真實輸入，需要 Chrome
```

`run_live_api.mjs` 與 `run_core_loop_browser.mjs --stage 11` 會真的寫入並還原專案檔，結束時檢查位元組回到原狀。

```
template/code-layer/   安裝到 .storybook/code-layer/ 的內容
  preset.js            只在 DEVELOPMENT 加入 manager、preview annotation 與 Vite plugin
  annotations.ts       preview 入口（檔名避開 preview 開頭，否則 story index 會失效）
  server/              dev API、索引、PostCSS 定位與修補、交易、journal、檢查、CLI
  runtime/             preview：選取、外框、tracer、即時預覽、驗證
  manager.tsx, manager/  工具列開關與「設計」面板（Storybook 自帶的 React 18，classic JSX）
  shared/              兩端共用的值解析、API 契約、channel 協定
template/TEMPLATE_MANIFEST.json   安裝器用的檔案清單與 sha256
scripts/               dev_sync、build_template_manifest、install_code_layer、lib/
test/                  單元測試、fixture、CDP 瀏覽器測試、真實伺服器 API 測試
```
