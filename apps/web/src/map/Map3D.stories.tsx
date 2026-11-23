import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import Map3D from "./Map3D";
import { events, orgs } from "../storybook/fixtures";

const meta = {
  title: "Design System/Map3D",
  component: Map3D,
  parameters: {
    docs: { description: { component: "Nouvelle-Aquitaine map; marker positions come from synthetic regional records." } },
    layout: "fullscreen",
  },
  args: {
    orgs,
    events,
    basemap: "plan",
  },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof Map3D>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RegionalMap: Story = {};
export const NoEvents: Story = { args: { events: [] } };
