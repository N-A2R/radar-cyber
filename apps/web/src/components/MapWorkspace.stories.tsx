import type { Meta, StoryObj } from "@storybook/react";
import { Theme } from "@astryxdesign/core/theme";
import { stoneTheme } from "@astryxdesign/theme-stone/built";
import MapWorkspace from "./MapWorkspace";
import type { GraphEventInfo, GraphOrgInfo, GraphSourceInfo } from "../graph/graphModel";
import type { FlowArc } from "../map/arcs";
import {
  coverage,
  events,
  graph,
  naFil,
  naOverview,
  orgs,
  sources,
} from "../storybook/fixtures";
import { DEFAULT_DIRECTORY } from "../url-state";

const noop = () => {};

/** La démonstration n'appelle aucune API : les index du graphe viennent des mêmes faux enregistrements. */
const eventsById: Record<string, GraphEventInfo> = Object.fromEntries(
  events.map((event) => [event.id, {
    title: event.title,
    family: event.family,
    severity: event.severity,
    observedAt: event.observedAt,
    sourceId: event.sourceId,
    sourceUrl: event.sourceUrl,
    assertionType: event.assertionType,
    orgId: event.orgId,
  }]),
);
const orgsById: Record<string, GraphOrgInfo> = Object.fromEntries(
  orgs.map((org) => [String(org.id), { kind: org.kind, city: org.city, dept: org.dept }]),
);
const sourcesById: Record<string, GraphSourceInfo> = Object.fromEntries(
  sources.map((source) => [source.id, { name: source.name, family: source.family, url: source.url }]),
);

const flows: FlowArc[] = events.flatMap((event) => {
  const org = orgs.find((candidate) => candidate.id === event.orgId);
  if (!org || org.lat === null || org.lon === null || event.lat === null || event.lon === null) return [];
  return [{
    id: `fixture-arc-${event.id}`,
    from: { lat: org.lat, lon: org.lon, label: org.name },
    to: { lat: event.lat, lon: event.lon, label: event.title },
    family: event.family,
    nature: org.kind,
    severity: event.severity,
    observedAt: event.observedAt,
    title: event.title,
    sourceUrl: event.sourceUrl,
  }];
});

const meta = {
  title: "Design System/MapWorkspace",
  component: MapWorkspace,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Espace Carte : plan, graphe, annuaire et panneaux historiques. Toutes les données sont fournies par le shell, jamais inventées ici.",
      },
    },
  },
  args: {
    orgs,
    events,
    loading: false,
    error: null,
    onRetry: noop,
    flows,
    basemap: "plan",
    onBasemapChange: noop,
    mapBuckets: [{ key: "2026-11", from: "2026-11-01", to: "2026-12-01", count: events.length }],
    mapBucket: "2026-11",
    onMapBucketChange: noop,
    mapEvents: events.filter((event) => event.lat !== null && event.lon !== null),
    mapTotal: events.length,
    mapLoading: false,
    family: null,
    onFamily: noop,
    onOpenOrg: noop,
    onOpenEvent: noop,
    initialPanel: "carte",
    onPanelChange: noop,
    coverage: { data: coverage, loading: false, error: null },
    regional: {
      overview: naOverview,
      fil: naFil,
      dept: "33",
      onSelectDept: noop,
      loading: false,
      error: null,
    },
    affected: {
      report: null,
      loading: false,
      error: null,
      query: "",
      onQueryChange: noop,
      onSubmit: noop,
    },
    graph: { graph, temporal: null, eventsById, orgsById, sourcesById },
    directory: {
      urlState: DEFAULT_DIRECTORY,
      onUrlStateChange: noop,
      onCopyLink: noop,
      // Sans backend, l'annuaire filtre et trie les faux enregistrements en mémoire.
      server: false,
    },
    attributions: { data: null, loading: false, error: null },
  },
  decorators: [
    (Story) => (
      <Theme theme={stoneTheme} mode="dark">
        <Story />
      </Theme>
    ),
  ],
} satisfies Meta<typeof MapWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Carte: Story = {};
export const Couverture: Story = { args: { initialPanel: "couverture" } };
export const Graphe: Story = { args: { initialPanel: "graph" } };
export const Organisations: Story = { args: { initialPanel: "directory" } };
