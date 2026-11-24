import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import ReviewView from "./QuarantineReviewView";

const meta = {
  title: "Design System/QuarantineReviewView",
  component: ReviewView,
  parameters: { docs: { description: { component: "Quarantine review queue with recorded, replayable decisions." } } },
  args: {
    canWrite: true,
    server: true,
    onUnauthorized: () => {},
    onOpenOrg: () => {},
  },
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof ReviewView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reviewer: Story = {};
export const ReadOnly: Story = { args: { canWrite: false } };
