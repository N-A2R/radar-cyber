import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import SourcesWorkspace from "./SourcesWorkspace";
import {
  collecte,
  corpus,
  healthCauses,
  healthDetail,
  sources,
} from "../storybook/fixtures";

const noop = () => {};

const meta = {
  title: "Design System/SourcesWorkspace",
  component: SourcesWorkspace,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Espace Sources : registre, indicateurs, santé et corpus partagent une seule destination sans refetch croisé.",
      },
    },
  },
  args: {
    sources,
    loading: false,
    error: null,
    onRetry: noop,
    metrics: collecte,
    metricsLoading: false,
    metricsError: null,
    healthDetail,
    healthCauses,
    healthLoading: false,
    healthError: null,
    corpusData: corpus,
    corpusLoading: false,
    corpusError: null,
    initialTab: "registre",
    onTabChange: noop,
  },
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof SourcesWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Registre: Story = {};
export const Indicateurs: Story = { args: { initialTab: "indicateurs" } };
export const Sante: Story = { args: { initialTab: "sante" } };
export const CorpusAvecPreuve: Story = {
  args: {
    initialTab: "corpus",
    warcProof: {
      recordId: "fixture-warc-1",
      targetUri: "https://source.example.invalid/fait",
      date: "2026-11-21T09:00:00Z",
      digest: "sha256:fixture",
      identifiedPayloadType: "text/html",
      blockLength: 2048,
    },
  },
};
