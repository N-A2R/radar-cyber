import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import WarcProofCard from "./WarcProofCard";

const meta = {
  title: "Design System/WarcProofCard",
  component: WarcProofCard,
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof WarcProofCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Carte: Story = {};
