import type { Meta, StoryObj } from "@storybook/react-vite";

import { Seal } from "./Seal";

const meta = {
  title: "Components/Seal",
  component: Seal,
  args: { label: "特價" },
} satisfies Meta<typeof Seal>;

export default meta;
type Story = StoryObj<typeof meta>;

// The primary seal.
export const Default: Story = {};
export const Vertical: Story = { args: { variant: "vertical" } };
export const Stamp: Story = { args: { variant: "stamp" } };
export const Ribbon: Story = { args: { variant: "ribbon" } };
