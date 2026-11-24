import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import JournalWorkspace from "./JournalWorkspace";

const noop = () => {};

const meta = {
  title: "Design System/JournalWorkspace",
  component: JournalWorkspace,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Espace Journal & dossier : les deux panneaux restent montés pour préserver filtres, pagination et sélection.",
      },
    },
  },
  args: { onUnauthorized: noop, onTabChange: noop },
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof JournalWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Journal: Story = {};
export const Dossier: Story = { args: { tab: "dossier" } };
