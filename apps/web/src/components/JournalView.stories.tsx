import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import JournalView from "./JournalView";

const meta = {
  title: "Design System/JournalView",
  component: JournalView,
  parameters: { docs: { description: { component: "Connected journal screen; filter state lives in the URL." } } },
  args: { onUnauthorized: () => {} },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof JournalView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Journal: Story = {};
