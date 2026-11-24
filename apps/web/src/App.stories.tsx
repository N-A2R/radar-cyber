import type { Meta, StoryObj } from "@storybook/react";
import App from "./App";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";

const meta = {
  title: "Design System/Application shell",
  component: App,
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
  parameters: {
    docs: { description: { component: "Top-level shell with the view rail, filters and lazy-loaded screens." } },
    layout: "fullscreen",
  },
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The shell also documents its loading and empty states when no API is attached. */
export const Shell: Story = {};
