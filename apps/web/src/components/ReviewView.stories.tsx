import type { Meta, StoryObj } from "@storybook/react";
import ReviewView from "./ReviewView";

const meta = {
  title: "Design System/ReviewView",
  component: ReviewView,
  parameters: { docs: { description: { component: "Candidate review queue with triage reasons and keyboard actions." } } },
  args: {
    canWrite: true,
    server: true,
    onUnauthorized: () => {},
    onOpenOrg: () => {},
  },
} satisfies Meta<typeof ReviewView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithQueue: Story = {};
export const ReadOnly: Story = { args: { canWrite: false } };
