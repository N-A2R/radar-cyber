import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import { ErrorRetry } from "./ErrorRetry";

const meta = {
  title: "Design System/ErrorRetry",
  component: ErrorRetry,
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
  args: { message: "lecture impossible", onRetry: () => {} },
} satisfies Meta<typeof ErrorRetry>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AvecAction: Story = {};
export const SansAction: Story = { args: { onRetry: undefined } };
