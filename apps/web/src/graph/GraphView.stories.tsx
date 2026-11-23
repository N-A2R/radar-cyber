import type { Meta, StoryObj } from "@storybook/react";
import GraphView from "./GraphView";
import { graph } from "../storybook/fixtures";

const meta = {
  title: "Design System/GraphView",
  component: GraphView,
  parameters: { docs: { description: { component: "Relation graph with node filters, neighbourhood selection and time slider." } } },
  args: {
    nodes: graph.nodes,
    links: graph.links,
    now: Date.parse("2026-11-21T12:00:00Z"),
  },
} satisfies Meta<typeof GraphView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Network: Story = {};
export const Empty: Story = { args: { nodes: [], links: [] } };
