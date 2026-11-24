import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import AlertsView from "./AlertsView";

const meta = {
  title: "Design System/AlertsView",
  component: AlertsView,
  parameters: { docs: { description: { component: "Supervision alerts table with acknowledgement controls." } } },
  args: {
    canWrite: true,
    onUnauthorized: () => {},
    onOpenEvent: () => {},
    refreshSignal: 0,
  },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof AlertsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadWrite: Story = {};
export const ReadOnly: Story = { args: { canWrite: false } };
