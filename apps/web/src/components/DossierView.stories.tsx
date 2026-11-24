import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import DossierView from "./DossierView";

const meta = {
  title: "Design System/DossierView",
  component: DossierView,
  parameters: { docs: { description: { component: "Case file screen grouping events into corroborated facts." } } },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof DossierView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The component reads its own URL state; the shell story documents the empty state. */
export const Dossier: Story = {};
