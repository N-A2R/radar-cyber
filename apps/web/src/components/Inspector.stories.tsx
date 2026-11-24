import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import Inspector from "./Inspector";
import { events } from "../storybook/fixtures";

const meta = {
  title: "Design System/Inspector",
  component: Inspector,
  parameters: { docs: { description: { component: "Event inspector with enrichment, attachment explanation and actions." } } },
  args: {
    eventId: events[0]!.id,
    orgId: null,
    onClose: () => {},
    onOpenOrg: () => {},
  },
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof Inspector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EventSelected: Story = {};
export const Closed: Story = { args: { eventId: null } };
