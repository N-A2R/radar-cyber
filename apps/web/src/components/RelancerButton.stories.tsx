import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import RelancerButton, { RelanceResultat } from "./RelancerButton";

const relance = async () => ({ inserted: 2, skipped: 0 });

const meta = {
  title: "Design System/RelancerButton",
  component: RelancerButton,
  parameters: { docs: { description: { component: "Single-source recollect trigger using the existing collection path." } } },
  args: {
    sourceId: "cert_fr",
    sourceName: "CERT-FR",
    onRelance: relance,
    disabled: false,
  },
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof RelancerButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Enabled: Story = {};
export const Disabled: Story = { args: { disabled: true } };

/** Result states are pure presentation and can be documented one by one. */
export const SuccessResult: Story = {
  render: () => <RelanceResultat etat={{ kind: "succes", inserted: 2, skipped: 0 }} />,
};
export const ErrorResult: Story = {
  render: () => <RelanceResultat etat={{ kind: "erreur", message: "Feed unavailable" }} />,
};
