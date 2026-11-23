import type { Meta, StoryObj } from "@storybook/react";
import EventList from "./EventList";
import { events, stats } from "../storybook/fixtures";

const meta = {
  title: "Design System/EventList",
  component: EventList,
  parameters: { docs: { description: { component: "Event feed with family chips and expandable details." } } },
  args: {
    events,
    byFamily: stats.byFamily,
    family: null,
    onFamily: () => {},
    selectedEventId: null,
    onSelectEvent: () => {},
    loading: false,
    error: null,
    onRetry: () => {},
  },
} satisfies Meta<typeof EventList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Feed: Story = {};
export const Selected: Story = { args: { selectedEventId: events[0]!.id } };
export const Empty: Story = { args: { events: [], onRetry: () => {} } };
