import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import WarcProofCard from "./WarcProofCard";
import { ArchiveProofCard } from "./WarcProofCard";

const meta = {
  title: "Design System/WarcProofCard",
  component: WarcProofCard,
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof WarcProofCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Carte: Story = {};
export const PreuveArchive: Story = { render: () => <ArchiveProofCard /> };
