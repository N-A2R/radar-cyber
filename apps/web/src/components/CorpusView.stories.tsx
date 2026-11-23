import type { Meta, StoryObj } from "@storybook/react";
import CorpusView from "./CorpusView";
import { corpus } from "../storybook/fixtures";

const meta = {
  title: "Design System/CorpusView",
  component: CorpusView,
  parameters: { docs: { description: { component: "Reference corpus totals, department bars and recent incidents." } } },
  args: { data: corpus, loading: false, error: null },
} satisfies Meta<typeof CorpusView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithData: Story = {};
export const Empty: Story = { args: { data: null } };
