import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import LoginScreen from "./LoginScreen";

const meta = {
  title: "Design System/LoginScreen",
  component: LoginScreen,
  parameters: { docs: { description: { component: "Authentication screen using the existing token endpoint." } } },
  args: { onAuthenticated: () => {} },
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof LoginScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {};
