import type { Meta, StoryObj } from "@storybook/react";
import LoginScreen from "./LoginScreen";

const meta = {
  title: "Design System/LoginScreen",
  component: LoginScreen,
  parameters: { docs: { description: { component: "Authentication screen using the existing token endpoint." } } },
  args: { onAuthenticated: () => {} },
} satisfies Meta<typeof LoginScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {};
