import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import SourcesDashboardView from "./SourcesDashboardView";
import type { SourcesDashboard } from "../api";

const data: SourcesDashboard = {
  generatedAt: "2026-11-24T00:00:00.000Z",
  fenetreJours: 30,
  fenetreRendementJours: 30,
  seuilLenteMs: 30000,
  limiteClassement: 10,
  totalSources: 0,
  etats: { ok200: 0, muette: 0, morte: 0, lente: 0, dormante: 0 },
  meilleures: [],
  pires: [],
  evolution: [],
  collecte: { dureeTotaleMs: 0, runs: 0 },
};

const meta = {
  title: "Design System/SourcesDashboardView",
  component: SourcesDashboardView,
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
  args: { data, loading: false, error: null },
} satisfies Meta<typeof SourcesDashboardView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mesuree: Story = {};
export const Vide: Story = { args: { data: null } };
