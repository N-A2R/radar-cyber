import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import OrgSheet, { OrgSheetBody, OrgSheetContenu } from "./OrgSheet";
import { orgDetail } from "../storybook/fixtures";

const meta = {
  title: "Design System/OrgSheet",
  component: OrgSheet,
  parameters: { docs: { description: { component: "Organisation sheet: facts, assets, exposure and right of reply." } } },
  args: { orgId: orgDetail.org.id, mock: true, onClose: () => {} },
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof OrgSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MockSheet: Story = {};

/** Pure states, verified without a network request. */
export const LoadingSheet: Story = {
  render: () => <OrgSheetContenu state={{ status: "loading" }} onClose={() => {}} />,
};
export const LoadedBody: Story = {
  render: () => <OrgSheetBody data={orgDetail} onClose={() => {}} />,
};
