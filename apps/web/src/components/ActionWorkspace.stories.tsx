import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import ActionWorkspace from "./ActionWorkspace";
import { DEFAULT_REVIEW } from "../url-state";

const noop = () => {};

const meta = {
  title: "Design System/ActionWorkspace",
  component: ActionWorkspace,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Espace Action : alertes et file de revue dans une seule destination, avec navigation à onglets accessible.",
      },
    },
  },
  args: {
    initialTab: "alerts",
    canWrite: true,
    // Sans backend, la file de revue affiche son état démo au lieu d'appeler l'API.
    server: false,
    onUnauthorized: noop,
    onOpenEvent: noop,
    onOpenOrg: noop,
    refreshSignal: 0,
    urlState: DEFAULT_REVIEW,
    onUrlStateChange: noop,
    onTabChange: noop,
  },
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof ActionWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Alertes: Story = {};
export const Revue: Story = { args: { initialTab: "review" } };
export const LectureSeule: Story = { args: { canWrite: false } };
