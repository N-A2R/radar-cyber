import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import RansomwareGroupsView from "./RansomwareGroupsView";

const meta = {
  title: "Design System/RansomwareGroupsView",
  component: RansomwareGroupsView,
  parameters: {
    docs: { description: { component: "Tracked ransomware groups and their regional claims." } },
  },
  args: { data: null, loading: false, error: null },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof RansomwareGroupsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
