import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import FamilyFilter from "./FamilyFilter";
import { stats } from "../storybook/fixtures";

const meta = {
  title: "Design System/FamilyFilter",
  component: FamilyFilter,
  parameters: { docs: { description: { component: "Family chips shared by the feed and timeline." } } },
  args: { byFamily: stats.byFamily, family: null, onFamily: () => {} },
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof FamilyFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllFamilies: Story = {};
export const RansomwareOnly: Story = { args: { family: "ransomware" } };
