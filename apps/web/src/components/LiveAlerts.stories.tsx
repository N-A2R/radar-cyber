import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import LiveAlerts from "./LiveAlerts";
import { liveAlerts } from "../storybook/fixtures";

const meta = {
  title: "Design System/LiveAlerts",
  component: LiveAlerts,
  parameters: { docs: { description: { component: "Real-time alert ribbon with sound toggle and unread count." } } },
  args: {
    alerts: liveAlerts,
    unseen: 1,
    soundOn: false,
    onToggleSound: () => {},
    onOpenAlerts: () => {},
    onDismiss: () => {},
  },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof LiveAlerts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithAlert: Story = {};
export const Quiet: Story = { args: { alerts: [], unseen: 0 } };
