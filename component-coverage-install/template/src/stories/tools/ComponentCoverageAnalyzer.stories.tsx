import type { Meta, StoryObj } from "@storybook/react-vite";

import { ComponentCoverageAnalyzer } from "../../storybook/component-coverage";

const meta = {
  title: "Tools/Component Coverage Analyzer",
  component: ComponentCoverageAnalyzer,
  parameters: {
    docs: {
      description: {
        component:
          "上傳 UI 圖片或輸入產品功能文字（PRD），再將通用分析提示詞貼到 Cursor、Claude Code 或 Codex；agent 會使用 component-coverage-analyze skill 比對 `componentCatalog.ts` 與元件原始碼後產出覆蓋度報告：可直接使用、需擴充 variant、缺少需新建。請求與報告契約定義於 `src/storybook/component-coverage/coverageTypes.ts`。",
      },
    },
    layout: "fullscreen",
  },
} satisfies Meta<typeof ComponentCoverageAnalyzer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Analyzer: Story = {};
