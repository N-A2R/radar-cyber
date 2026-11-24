import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import CommandPalette from "./CommandPalette";
import { events, orgs } from "../storybook/fixtures";

const meta = {
  title: "Design System/CommandPalette",
  component: CommandPalette,
  parameters: { docs: { description: { component: "Global search palette (Ctrl/Cmd+K) over organisations and events." } } },
  args: {
    open: true,
    onClose: () => {},
    onOpenOrg: () => {},
    onOpenEvent: () => {},
    mock: { orgs, events },
  },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof CommandPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const Closed: Story = { args: { open: false } };
