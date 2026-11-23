import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import AffectedView from "./AffectedView";

const meta = {
  title: "Design System/AffectedView",
  component: AffectedView,
  parameters: {
    docs: { description: { component: "Public 'am I affected?' lookup with evidence and limitations." } },
  },
  args: { report: null, query: "", loading: false, error: null },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof AffectedView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
