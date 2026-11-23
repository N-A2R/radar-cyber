import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import MapTimeline from "./MapTimeline";
import { buildBuckets } from "./timeline.js";
import { events } from "../storybook/fixtures";

const buckets = buildBuckets(events, 12);

const meta = {
  title: "Design System/MapTimeline",
  component: MapTimeline,
  parameters: {
    docs: { description: { component: "Monthly scrubber for geolocated events on the map." } },
  },
  args: {
    buckets,
    selected: buckets[0]?.key ?? "all",
    shown: 0,
    total: buckets.length,
    onSelect: () => {},
  },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof MapTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithBuckets: Story = {};
