import type { Meta, StoryObj } from "@storybook/react-vite";

import { Seal } from "../seal/Seal";
import { Title } from "./Title";

const meta = {
  title: "Components/Title",
  component: Title,
  args: { text: "大売出し" },
} satisfies Meta<typeof Title>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithPlate: Story = { args: { plate: "本日限り" } };
// An outer component (Title) wrapping an inner one (Seal).
export const WithSeal: Story = { args: { slot: <Seal label="特価" /> } };
