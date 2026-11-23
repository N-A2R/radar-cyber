import type { Meta, StoryObj } from "@storybook/react";
import SourcesView from "./SourcesView";
import { sources } from "../storybook/fixtures";

const meta = {
  title: "Design System/SourcesView",
  component: SourcesView,
  parameters: { docs: { description: { component: "Source registry with status, yield and rejection reasons." } } },
  args: { sources, loading: false, error: null, onRetry: () => {} },
} satisfies Meta<typeof SourcesView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Registry: Story = {};
export const Empty: Story = { args: { sources: [], onRetry: () => {} } };
