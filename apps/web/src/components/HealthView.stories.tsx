import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import HealthView from "./HealthView";
import { sources } from "../storybook/fixtures";

const meta = {
  title: "Design System/HealthView",
  component: HealthView,
  parameters: { docs: { description: { component: "Health overview with source sortable table and counters." } } },
  args: { sources, loading: false, onRetry: () => {} },
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof HealthView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithSources: Story = {};
export const NoData: Story = { args: { sources: [] } };
