// Text of the approval dialog and of the terminal code, in both interface
// languages. The dev server shows it outside the page, so it cannot come from
// the page's message catalogs; the two languages must keep the same keys.

export const SUMMARY_TEXT_LIMIT = 600;

export const CONFIRM_TEXT = {
  "zh-Hant": {
    title: "Code Layer：允許 AI 修改？",
    colon: "：",
    allow: "允許",
    deny: "拒絕",
    intro: "Storybook 裡有人請 AI 修改這個專案。只有你在這裡按「允許」，AI 才會開始。",
    project: "專案",
    element: "元件",
    runner: "使用",
    allowed: "AI 只能修改",
    request: "需求",
    truncated: (n) => `（只顯示前 ${SUMMARY_TEXT_LIMIT} 字，全文 ${n} 字）`,
    cost: "每次請求會使用你自己帳號的額度。AI 在專案的複本上工作，結果通過檢查才會寫入，而且可以還原。",
    code: (code) => `在 Storybook 的對話框輸入這個代碼以允許：${code}`,
  },
  en: {
    title: "Code Layer: allow an AI edit?",
    colon: ": ",
    allow: "Allow",
    deny: "Deny",
    intro: "Someone in Storybook asked an AI agent to change this project. Nothing starts unless you allow it here.",
    project: "Project",
    element: "Element",
    runner: "Runner",
    allowed: "The agent may only change",
    request: "Request",
    truncated: (n) => `(first ${SUMMARY_TEXT_LIMIT} of ${n} characters shown)`,
    cost: "Each request uses your own account's quota. The agent works on a copy of the project; its result is written only after it passes the checks, and it can be undone.",
    code: (code) => `To allow it, type this code in the Storybook dialog: ${code}`,
  },
};
