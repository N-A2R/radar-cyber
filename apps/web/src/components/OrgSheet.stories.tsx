import type { Meta, StoryObj } from "@storybook/react";
import OrgSheet, { OrgSheetBody, OrgSheetContenu } from "./OrgSheet";
import { orgDetail } from "../storybook/fixtures";

const meta = {
  title: "Design System/OrgSheet",
  component: OrgSheet,
  parameters: { docs: { description: { component: "Organisation sheet: facts, assets, exposure and right of reply." } } },
  args: { orgId: orgDetail.org.id, mock: true, onClose: () => {} },
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
