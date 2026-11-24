import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import { MapLegend } from "./MapLegend";

const meta = {
  title: "Design System/MapLegend",
  component: MapLegend,
  parameters: {
    docs: { description: { component: "Colour legend for the families shown on the map." } },
  },
  args: { families: ["sante", "gouvernance"] },
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof MapLegend>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RegionalFamilies: Story = {};
