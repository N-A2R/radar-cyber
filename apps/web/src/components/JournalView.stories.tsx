import type { Meta, StoryObj } from "@storybook/react";
import JournalView from "./JournalView";

const meta = {
  title: "Design System/JournalView",
  component: JournalView,
  parameters: { docs: { description: { component: "Connected journal screen; filter state lives in the URL." } } },
  args: { onUnauthorized: () => {} },
} satisfies Meta<typeof JournalView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Journal: Story = {};
