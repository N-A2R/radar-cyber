import type { Meta, StoryObj } from "@storybook/react";
import { EmptyState, LoadingSkeleton } from "./Skeleton";

const meta = {
  title: "Design System/Skeleton",
  component: LoadingSkeleton,
  parameters: { docs: { description: { component: "Shared loading and empty states for every screen." } } },
  args: { label: "Loading events" },
} satisfies Meta<typeof LoadingSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};

/** The companion empty state is documented in the same entry. */
export const EmptyWithoutAction: Story = {
  render: () => <EmptyState message="No events in this window" actionLabel="Retry" onAction={() => {}} />,
};
export const EmptyWithAction: Story = {
  render: () => <EmptyState message="No coverage measurement yet" actionLabel="Retry" onAction={() => {}} />,
};
