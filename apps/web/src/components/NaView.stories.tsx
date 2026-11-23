import type { Meta, StoryObj } from "@storybook/react";
import NaView from "./NaView";
import { naFil, naOverview, orgs } from "../storybook/fixtures";

const meta = {
  title: "Design System/NaView",
  component: NaView,
  parameters: { docs: { description: { component: "Nouvelle-Aquitaine department view: only NA departments appear." } } },
  args: {
    orgs,
    overview: naOverview,
    fil: naFil,
    loading: false,
    error: null,
    dept: "33",
    onSelectDept: () => {},
    onOpenOrg: () => {},
    onRetry: () => {},
  },
} satisfies Meta<typeof NaView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gironde: Story = {};
export const WholeRegion: Story = { args: { dept: null, fil: null } };
