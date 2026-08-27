import type { Meta, StoryObj } from "@storybook/react-vite";

import { ComponentTimeline } from "../../storybook/component-timeline";

const meta = {
  title: "Tools/Component Timeline",
  component: ComponentTimeline,
  parameters: {
    docs: {
      description: {
        component:
          "依建立日期排序的共用元件預覽中心：每張卡片載入該元件真正的 story，所以預覽永遠是最新狀態，不需要維護截圖。日期來自每個 componentCatalog entry 的 `componentPath` 首次進入 git 的 commit，由 `npm run build:component-timeline` 產生到 `src/storybook/componentTimeline.ts`；名稱與分類則即時取自 `componentCatalog.ts`。每頁 30 個元件，用頁碼清單切換。",
      },
    },
    layout: "fullscreen",
  },
} satisfies Meta<typeof ComponentTimeline>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Timeline: Story = {};
