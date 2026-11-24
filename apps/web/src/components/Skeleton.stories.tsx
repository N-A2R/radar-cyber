import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import { EmptyState, LoadingSkeleton } from "./Skeleton";

const meta = {
  title: "Design System/Skeleton",
  component: LoadingSkeleton,
  parameters: { docs: { description: { component: "États de chargement et états vides partagés par tous les écrans." } } },
  args: { label: "Chargement des événements" },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof LoadingSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {};

/** The companion empty state is documented in the same entry. */
export const EmptyWithoutAction: Story = {
  render: () => <EmptyState message="Aucun événement sur cette période" actionLabel="Réessayer" onAction={() => {}} />,
};
export const EmptyWithAction: Story = {
  render: () => <EmptyState message="Aucune mesure de couverture disponible" actionLabel="Réessayer" onAction={() => {}} />,
};
