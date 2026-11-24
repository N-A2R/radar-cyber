import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import CustodyPanel, { CustodyDetails } from "./CustodyPanel";
import type { CustodyChain } from "../api";

const chain: CustodyChain = {
  subject: "Fixture organisation",
  regional: true,
  complete: false,
  missing: ["proof"],
  source: null,
  sourceUrl: null,
  observedAt: null,
  links: [],
};

const meta = {
  title: "Design System/CustodyPanel",
  component: CustodyPanel,
  parameters: {
    docs: { description: { component: "Chain-of-custody panel and its detailed evidence view." } },
  },
  args: { subject: chain.subject },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof CustodyPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Panel: Story = {};
export const Details: Story = { render: () => <CustodyDetails chain={chain} /> };
