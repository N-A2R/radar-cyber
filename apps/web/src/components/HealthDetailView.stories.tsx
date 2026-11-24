import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import HealthDetailView from "./HealthDetailView";
import { healthCauses, healthDetail } from "../storybook/fixtures";

const meta = {
  title: "Design System/HealthDetailView",
  component: HealthDetailView,
  parameters: { docs: { description: { component: "System health detail, source tones and recorded failure causes." } } },
  args: { detail: healthDetail, causes: healthCauses, loading: false, error: null, onRetry: () => {} },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof HealthDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithCauses: Story = {};
export const WithoutCauses: Story = { args: { causes: null } };
export const Empty: Story = { args: { detail: null, onRetry: () => {} } };
