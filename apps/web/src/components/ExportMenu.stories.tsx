import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import ExportMenu, { ExportProvider } from "./ExportMenu";

const meta = {
  title: "Design System/ExportMenu",
  component: ExportMenu,
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof ExportMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Menu: Story = { render: () => <ExportMenu /> };
export const Provider: Story = {
  render: () => (
    <ExportProvider>
      <ExportMenu />
    </ExportProvider>
  ),
};
