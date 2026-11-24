import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import LieesCard, { LieesContenu } from "./LieesCard";
import { historiqueLiees, orgsLiees } from "../storybook/fixtures";

const meta = {
  title: "Design System/LieesCard",
  component: LieesCard,
  parameters: { docs: { description: { component: "Linked-organisation counter with its weekly history." } } },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof LieesCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Connected card: fetches its own counter from the existing API. */
export const Connected: Story = {};

/** Pure presentation: every data state is available without a network. */
export const WithHistory: Story = {
  render: () => (
    <LieesContenu data={orgsLiees} loading={false} error={null} historique={historiqueLiees} onRetry={() => {}} />
  ),
};
export const Empty: Story = {
  render: () => <LieesContenu data={null} loading={false} error={null} onRetry={() => {}} />,
};
