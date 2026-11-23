import type { Meta, StoryObj } from "@storybook/react";
import RansomwareGroupsView from "./RansomwareGroupsView";

const meta = {
  title: "Design System/RansomwareGroupsView",
  component: RansomwareGroupsView,
  parameters: {
    docs: { description: { component: "Tracked ransomware groups and their regional claims." } },
  },
  args: { data: null, loading: false, error: null },
} satisfies Meta<typeof RansomwareGroupsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
