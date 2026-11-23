import type { Meta, StoryObj } from "@storybook/react";
import { MapLegend } from "./MapLegend";

const meta = {
  title: "Design System/MapLegend",
  component: MapLegend,
  parameters: {
    docs: { description: { component: "Colour legend for the families shown on the map." } },
  },
  args: { families: ["sante", "gouvernance"] },
} satisfies Meta<typeof MapLegend>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RegionalFamilies: Story = {};
