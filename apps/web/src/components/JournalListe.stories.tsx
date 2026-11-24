import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import JournalList from "./JournalListe";
import { journalRows } from "../storybook/fixtures";

const meta = {
  title: "Design System/JournalList",
  component: JournalList,
  parameters: { docs: { description: { component: "Auditable decision journal with filtering, detail panel and export." } } },
  args: {
    rows: journalRows,
    total: journalRows.length,
    filters: {},
    onFilterChange: () => {},
    onReset: () => {},
    loading: false,
    error: null,
    page: 1,
    pageCount: 1,
    onPrevious: () => {},
    onNext: () => {},
    selected: null,
    onSelect: () => {},
    onCloseDetail: () => {},
    onExport: () => {},
    exporting: false,
    exportError: null,
    onRetry: () => {},
  },
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof JournalList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithEntries: Story = { args: { total: journalRows.length } };
export const WithDetail: Story = { args: { total: journalRows.length, selected: journalRows[0] } };
export const Empty: Story = { args: { rows: [], total: 0 } };
