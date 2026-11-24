import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import GraphMatrix from "./GraphMatrix";
import { graph } from "../storybook/fixtures";

const meta = {
  title: "Design System/GraphMatrix",
  component: GraphMatrix,
  parameters: { docs: { description: { component: "Family × department matrix derived from the relation graph." } } },
  args: { nodes: graph.nodes, links: graph.links, loading: false, onRetry: () => {} },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof GraphMatrix>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithLinks: Story = {};
export const Empty: Story = { args: { nodes: [], links: [] } };
