import type { Meta, StoryObj } from "@storybook/react";
import ActorAttributionsView from "./ActorAttributionsView";

const meta = {
  title: "Design System/ActorAttributionsView",
  component: ActorAttributionsView,
  parameters: {
    docs: { description: { component: "Published actor/group attribution counts with confidence levels." } },
  },
  args: { data: null, loading: false, error: null },
} satisfies Meta<typeof ActorAttributionsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
