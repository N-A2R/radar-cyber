import type { Meta, StoryObj } from "@storybook/react";
import { renduCorroboration, renduHistorique } from "./corroboration-view";
import { orgDetail } from "../storybook/fixtures";

/** A render function is treated as a component here: same props, same output. */
const CorroborationView = () => renduCorroboration(orgDetail.corroboration ?? null);

const meta = {
  title: "Design System/CorroborationView",
  component: CorroborationView,
  parameters: { docs: { description: { component: "Facts grouped by source agreement, not one row per event." } } },
} satisfies Meta<typeof CorroborationView>;

export default meta;
type Story = StoryObj<typeof meta>;


export const History: Story = {
  render: () => renduHistorique(orgDetail.historique ?? null),
};

export const HistoryAbsent: Story = {
  render: () => renduHistorique(null),
};
export const WithFacts: Story = {};

export const AbsentOnOlderServer: Story = {
  render: () => renduCorroboration(null),
};
