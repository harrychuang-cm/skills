// Panel rows of the core-loop proof. Only "fill" and "radius" are editable;
// the rest are traced and shown read-only.

export type RowDef = {
  id: string;
  label: string;
  section: "填色" | "外觀" | "文字" | "間距與尺寸";
  /** Computed longhand read for display and verification. */
  computed: string;
  /** Authored properties that can set this row, shorthand first. */
  family: string[];
  /** Additional longhands that must agree (e.g. the four corners). */
  uniformWith?: string[];
  editableInProof: boolean;
  inherited: boolean;
  kinds: string[];
};

export const ROWS: RowDef[] = [
  {
    id: "fill",
    label: "填色",
    section: "填色",
    computed: "background-color",
    family: ["background", "background-color"],
    editableInProof: true,
    inherited: false,
    kinds: ["color"],
  },
  {
    id: "radius",
    label: "圓角",
    section: "外觀",
    computed: "border-top-left-radius",
    uniformWith: ["border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"],
    family: ["border-radius", "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius", "border-start-start-radius", "border-start-end-radius", "border-end-start-radius", "border-end-end-radius"],
    editableInProof: true,
    inherited: false,
    kinds: ["dimension", "zero", "percentage"],
  },
  { id: "color", label: "文字色", section: "文字", computed: "color", family: ["color"], editableInProof: false, inherited: true, kinds: ["color"] },
  { id: "fontFamily", label: "字體", section: "文字", computed: "font-family", family: ["font", "font-family"], editableInProof: false, inherited: true, kinds: ["font-family"] },
  { id: "fontSize", label: "字級", section: "文字", computed: "font-size", family: ["font", "font-size"], editableInProof: false, inherited: true, kinds: ["dimension"] },
  { id: "fontWeight", label: "字重", section: "文字", computed: "font-weight", family: ["font", "font-weight"], editableInProof: false, inherited: true, kinds: ["number"] },
  {
    id: "padding",
    label: "內距",
    section: "間距與尺寸",
    computed: "padding-top",
    uniformWith: ["padding-right", "padding-bottom", "padding-left"],
    family: ["padding", "padding-top", "padding-right", "padding-bottom", "padding-left", "padding-block", "padding-inline", "padding-block-start", "padding-block-end", "padding-inline-start", "padding-inline-end"],
    editableInProof: false,
    inherited: false,
    kinds: ["dimension", "zero"],
  },
  { id: "minInlineSize", label: "最小寬度", section: "間距與尺寸", computed: "min-inline-size", family: ["min-inline-size"], editableInProof: false, inherited: false, kinds: ["dimension", "zero"] },
  { id: "minBlockSize", label: "最小高度", section: "間距與尺寸", computed: "min-block-size", family: ["min-block-size"], editableInProof: false, inherited: false, kinds: ["dimension", "zero"] },
];

export const READ_ONLY_TEXT: Record<string, string> = {
  "not-in-proof": "尚不可編輯（下一階段開放）",
  "inline-style": "行內樣式（來自元件程式碼或 story），無法直接修改",
  "unknown-source": "來自未納入索引的樣式表",
  "identity-mismatch": "頁面上的 CSS 與檔案內容不一致，請重新整理預覽",
  "no-declaration": "沒有直接宣告：繼承自上層或瀏覽器預設，驗證階段不追蹤",
  "expression": "由運算式計算（calc() 等），驗證階段不可直接修改",
  "raw-value": "寫死的數值（未綁定 token）",
  "keyword": "關鍵字（例如 currentcolor、inherit）",
  "var-with-fallback": "var() 帶有 fallback，驗證階段不可直接修改",
  "comp-token-not-alias": "comp token 不是單一 alias",
  "token-shadowed": "這個 token 在目前主題下被其他樣式表覆寫",
  "scoped-override": "這個 token 在元件或上層元素上被重新宣告",
  "duplicate-declaration": "同一條規則內有重複或後續覆寫的宣告",
  "longhand": "個別角或邊的宣告，驗證階段只支援整體簡寫",
  "not-uniform": "各角或各邊的值不同",
  "background-not-color": "background 簡寫不是單一顏色",
  "uncertain-condition": "規則位於驗證階段不支援的條件區塊（@layer、@container 等）",
  "important": "!important 宣告，驗證階段不支援",
  "token-editing-disabled": "token 檔目前不能編輯（見伺服器狀態）",
  "unconfirmed-cascade": "無法確認這條宣告驅動此元素",
  "animated": "動畫中，無法證明",
  "not-indexed-token": "引用的名稱不在 token 索引中",
};
