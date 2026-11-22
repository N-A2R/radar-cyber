import type { Meta, StoryObj } from "@storybook/react";
import { renduRattachement } from "./rattachement-view";

const explanation = {
  motif: "nom",
  libelle: "Exact-name match to a Nouvelle-Aquitaine organisation",
  alias: "chu-bordeaux",
  confiance: 0.93,
  moteur: "referentiel.na.v2",
  candidats: [],
  indecis: false,
};

const RattachementView = () => renduRattachement(explanation);

const meta = {
  title: "Design System/RattachementView",
  component: RattachementView,
  parameters: { docs: { description: { component: "Attachment decision with its reason, engine and confidence." } } },
} satisfies Meta<typeof RattachementView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Attached: Story = {};

export const UndecidedEngine: Story = {
  render: () => renduRattachement({ ...explanation, motif: "ambigu", indecis: true, candidats: [{ id: 1, name: "Regional hospital" }] }),
};

export const NoTraceKept: Story = {
  render: () => renduRattachement(null),
};
