import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import CouvertureView from "./CouvertureView";
import { coverage } from "../storybook/fixtures";

const meta = {
  title: "Design System/CouvertureView",
  component: CouvertureView,
  parameters: { docs: { description: { component: "Frozen coverage measurement with department and sector breakdowns." } } },
  args: { data: coverage, loading: false, error: null },
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof CouvertureView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithData: Story = {};
export const Loading: Story = { args: { data: null, loading: true } };
export const Error: Story = { args: { data: null, error: "Coverage unavailable" } };
