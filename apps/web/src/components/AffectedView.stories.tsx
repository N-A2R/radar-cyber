import type { Meta, StoryObj } from "@storybook/react";
import AffectedView from "./AffectedView";

const meta = {
  title: "Design System/AffectedView",
  component: AffectedView,
  parameters: {
    docs: { description: { component: "Public 'am I affected?' lookup with evidence and limitations." } },
  },
  args: { report: null, query: "", loading: false, error: null },
} satisfies Meta<typeof AffectedView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
