import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import CollecteMetricsView from "./CollecteMetricsView";
import { collecte } from "../storybook/fixtures";

const meta = {
  title: "Design System/CollecteMetricsView",
  component: CollecteMetricsView,
  parameters: { docs: { description: { component: "Collection cycles, memory use and supervision alerts." } } },
  args: { metrics: collecte, loading: false, error: null },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof CollecteMetricsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithCycles: Story = {};
export const Loading: Story = { args: { metrics: null, loading: true } };
export const Error: Story = { args: { metrics: null, error: "Metrics unavailable" } };
