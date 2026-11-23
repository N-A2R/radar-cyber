import type { Meta, StoryObj } from "@storybook/react";
import SourcesRougesView from "./SourcesRougesView";
import { healthDetail, sources } from "../storybook/fixtures";

const meta = {
  title: "Design System/SourcesRougesView",
  component: SourcesRougesView,
  parameters: { docs: { description: { component: "Red sources with their last trace and a recollect action." } } },
  args: {
    detail: healthDetail,
    sources,
    loading: false,
    error: null,
    onRelance: async () => ({ inserted: 1, skipped: 0 }),
    onRetry: () => {},
  },
} satisfies Meta<typeof SourcesRougesView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRedSources: Story = {};
export const Empty: Story = { args: { detail: null, sources: [], onRetry: () => {} } };
