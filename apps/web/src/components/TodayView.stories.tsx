import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import TodayView from "./TodayView";
import { departements, today } from "../storybook/fixtures";

const meta = {
  title: "Design System/TodayView",
  component: TodayView,
  parameters: { docs: { description: { component: "Daily feed with timeline, counters and department filters." } } },
  args: {
    data: today,
    loading: false,
    error: null,
    family: null,
    dept: null,
    departements,
    maintenant: Date.parse("2026-11-21T12:00:00Z"),
    onFamily: () => {},
    onDept: () => {},
    onOpenOrg: () => {},
    onOpenEvent: () => {},
    onRetry: () => {},
  },
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof TodayView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithEvents: Story = {};
export const GirondeOnly: Story = { args: { dept: "33" } };
export const Empty: Story = { args: { data: null, onRetry: () => {} } };
