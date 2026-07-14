import type { Meta, StoryObj } from "@storybook/react-vite";

import { ComponentCoverageAnalyzer } from "../../storybook/component-coverage";

const meta = {
  title: "Tools/Component Coverage Analyzer",
  component: ComponentCoverageAnalyzer,
  parameters: {
    docs: {
      description: {
        component:
          "上傳 UI 圖片或輸入產品功能文字（PRD），再將通用分析提示詞貼到 Cursor、Claude Code 或 Codex；agent 會使用 component-coverage-analyze skill 比對 `componentCatalog.ts` 與元件原始碼後產出覆蓋度報告。覆核時可切換組裝預覽與 UI Reference、點選或清除元件、在 Inspector 試用其他既有元件；右側 inspector 同步顯示所選元件在 UI Reference 中的原圖裁切，並可另開元件文件。完成覆核後，可將同樣 agent-neutral 的實作提示詞交給任一 agent，透過 component-coverage-implement skill 接續開發。請求與報告契約定義於 `src/storybook/component-coverage/coverageTypes.ts`。",
      },
    },
    layout: "fullscreen",
  },
} satisfies Meta<typeof ComponentCoverageAnalyzer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Analyzer: Story = {};
