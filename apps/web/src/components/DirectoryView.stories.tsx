import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { gothicTheme } from "@astryxdesign/theme-gothic/built";
import DirectoryView from "./DirectoryView";
import { orgs } from "../storybook/fixtures";

const meta = {
  title: "Design System/DirectoryView",
  component: DirectoryView,
  parameters: { docs: { description: { component: "Organisation directory with local filtering and pagination." } } },
  args: {
    orgs,
    loading: false,
    error: null,
    server: false,
    onOpenOrg: () => {},
    onUrlStateChange: () => {},
    onCopyLink: () => {},
  },
  decorators: [
    (Story) => (
      <Theme theme={gothicTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof DirectoryView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LocalFiltering: Story = {};
export const Empty: Story = { args: { orgs: [], onRetry: () => {} } };
