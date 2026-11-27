/**
 * Carte — one destination for the map, its timeline, the regional panel,
 * the graph, actor attributions and the organisation directory.
 *
 * The shell owns navigation and the URL; this workspace owns the three
 * internal panels (Carte, Graphe, Organisations) and the legacy sub-panels
 * (couverture, régional, concerné, attributions). Every data callback is
 * forwarded untouched: filtering, TLP-scoped results and offline snapshots
 * remain the shell's responsibility.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import Map3D from "../map/Map3D";
import MapTimeline from "../map/MapTimeline";
import MapLegend from "./MapLegend";
import NaView from "./NaView";
import CouvertureView from "./CouvertureView";
import AffectedView from "./AffectedView";
import GraphView from "../graph/GraphView";
import ActorAttributionsView from "./ActorAttributionsView";
import DirectoryView from "./DirectoryView";
import type {
  ActorAttributionsResponse,
  AffectedReport,
  CouvertureResponse,
  Event,
  Graph,
  MapTimelineBucket,
  MapTimelineEvent,
  NaFil,
  NaOverview,
  Org,
} from "../api";
import type { FlowArc } from "../map/arcs";
import type { GraphEventInfo, GraphOrgInfo, GraphSourceInfo } from "../graph/graphModel";
import type { DirectoryUrlState } from "../url-state";
import "./map-workspace.css";

/** Panels addressable through `#/map?panel=…`; legacy routes land here. */
export type MapWorkspacePanel =
  | "carte"
  | "couverture"
  | "regional"
  | "affected"
  | "graph"
  | "directory"
  | "attributions";

type WorkspaceTab = "carte" | "graphe" | "organisations";
type Basemap = "sat" | "plan";

export interface MapWorkspaceProps {
  orgs: Org[];
  events: Event[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  /** Arcs animés du flux direct, rendus par Map3D. */
  flows: FlowArc[];
  basemap: Basemap;
  onBasemapChange: (basemap: Basemap) => void;
  /** Timeline mensuelle : compteurs API + page de points géolocalisés. */
  mapBuckets: readonly MapTimelineBucket[];
  mapBucket: string;
  onMapBucketChange: (bucket: string) => void;
  mapEvents: MapTimelineEvent[];
  mapTotal: number;
  mapLoading: boolean;
  /** Filtre de famille du fil global ; la workspace ne le modifie pas. */
  family: string | null;
  onFamily: (family: string | null) => void;
  onOpenOrg: (orgId: number) => void;
  onOpenEvent: (eventId: string) => void;
  /** Panneau demandé par l'URL au montage (ou après une navigation). */
  initialPanel?: MapWorkspacePanel;
  /** Notifie le shell pour qu'il réécrive `#/map?panel=…`. */
  onPanelChange?: (panel: MapWorkspacePanel) => void;
  coverage: {
    data: CouvertureResponse | null;
    loading: boolean;
    error: string | null;
  };
  regional: {
    overview: NaOverview | null;
    fil: NaFil | null;
    dept: string | null;
    onSelectDept: (dept: string | null) => void;
    loading: boolean;
    error: string | null;
  };
  affected: {
    report: AffectedReport | null;
    loading: boolean;
    error: string | null;
    query: string;
    onQueryChange: (query: string) => void;
    onSubmit: (query: string) => void;
  };
  graph: {
    graph: Graph;
    temporal: Graph | null;
    eventsById: Record<string, GraphEventInfo>;
    orgsById: Record<string, GraphOrgInfo>;
    sourcesById: Record<string, GraphSourceInfo>;
  };
  directory: {
    urlState: DirectoryUrlState;
    onUrlStateChange: (state: DirectoryUrlState) => void;
    onCopyLink?: () => void;
    /** true : l'API filtre, trie et pagine ; false : tout en mémoire (démo). */
    server?: boolean;
  };
  attributions: {
    data: ActorAttributionsResponse | null;
    loading: boolean;
    error: string | null;
  };
}

const VALID_PANELS: readonly MapWorkspacePanel[] = [
  "carte", "couverture", "regional", "affected", "graph", "directory", "attributions",
];

/** La démonstration ne doit ouvrir aucun flux temps réel. */
const MOCK_MODE = import.meta.env.VITE_DATA_MODE === "mock";


/** Map3D emits `org:<id>`; GraphView emits `org:`/`event:` prefixed ids. */
function selectNode(id: string | null, onOpenOrg: (id: number) => void, onOpenEvent: (id: string) => void) {
  if (!id) return;
  const separator = id.indexOf(":");
  if (separator < 0) return;
  const kind = id.slice(0, separator);
  const raw = id.slice(separator + 1);
  if (kind === "org" && /^\d+$/.test(raw)) onOpenOrg(Number(raw));
  else if (kind === "event" && raw) onOpenEvent(raw);
}

export default function MapWorkspace({
  orgs,
  events,
  loading,
  error,
  onRetry,
  flows,
  basemap,
  onBasemapChange,
  mapBuckets,
  mapBucket,
  onMapBucketChange,
  mapEvents,
  mapTotal,
  mapLoading,
  family,
  onFamily,
  onOpenOrg,
  onOpenEvent,
  initialPanel,
  onPanelChange,
  coverage,
  regional,
  affected,
  graph,
  directory,
  attributions,
}: MapWorkspaceProps) {
  const requestedPanel: MapWorkspacePanel = initialPanel && VALID_PANELS.includes(initialPanel) ? initialPanel : "carte";
  const [panel, setPanel] = useState<MapWorkspacePanel>(requestedPanel);
  const tab: WorkspaceTab = panel === "graph" || panel === "attributions"
    ? "graphe"
    : panel === "directory" ? "organisations" : "carte";

  // L'URL est la source de vérité : une navigation vers un lien ancien
  // (« couverture », « directory »…) déplace le panneau sans passer par un
  // clic local, et sans renvoyer d'événement au shell.
  useEffect(() => {
    setPanel((prev) => (prev === requestedPanel ? prev : requestedPanel));
  }, [requestedPanel]);

  const selectPanel = useCallback((next: MapWorkspacePanel) => {
    setPanel(next);
    onPanelChange?.(next);
  }, [onPanelChange]);

  const selectTab = useCallback((next: string) => {
    if (next === "graphe") selectPanel("graph");
    else if (next === "organisations") selectPanel("directory");
    else selectPanel("carte");
  }, [selectPanel]);

  const handleSelectNode = useCallback((id: string | null) => {
    selectNode(id, onOpenOrg, onOpenEvent);
  }, [onOpenOrg, onOpenEvent]);

  const handleSelectMapOrg = useCallback((id: string) => {
    selectNode(id, onOpenOrg, onOpenEvent);
  }, [onOpenOrg, onOpenEvent]);

  const families = useMemo(() => [...new Set(events.map((event) => event.family).filter(Boolean))].sort(), [events]);
  const legendFamilies = useMemo(() => {
    const visible = family ? events.filter((event) => event.family === family) : events;
    return visible.map((event) => event.family);
  }, [events, family]);

  return (
    <section className="map-workspace" data-panel={panel} aria-label="Espace Carte">
      <header className="map-workspace__bar">
        <SegmentedControl
          label="Panneau de la Carte"
          size="sm"
          value={tab}
          onChange={selectTab}
        >
          <SegmentedControlItem value="carte" label="Carte" />
          <SegmentedControlItem value="graphe" label="Graphe" />
          <SegmentedControlItem value="organisations" label="Organisations" />
        </SegmentedControl>

        {tab === "carte" ? (
          <div className="map-workspace__tools">
            <select
              className="map-workspace__family"
              aria-label="Filtrer la carte par famille"
              value={family ?? ""}
              onChange={(change) => onFamily(change.target.value || null)}
            >
              <option value="">Toutes les familles</option>
              {families.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <button
              type="button"
              className="map-workspace__search"
              aria-controls="map-workspace-side"
              aria-expanded={panel === "affected"}
              onClick={() => selectPanel(panel === "affected" ? "regional" : "affected")}
            >
              <span aria-hidden="true">⌕</span> Suis-je concerné ?
            </button>
            <div className="map-workspace__basemap" role="group" aria-label="Fond de carte">
              <button type="button" aria-pressed={basemap === "plan"} onClick={() => onBasemapChange("plan")}>
                plan
              </button>
              <button type="button" aria-pressed={basemap === "sat"} onClick={() => onBasemapChange("sat")}>
                satellite
              </button>
            </div>
          </div>
        ) : null}

        <span className="map-workspace__status" role="status" aria-live="polite">
          {loading ? "chargement…" : error ? "données partielles" : null}
        </span>
      </header>

      {tab === "carte" ? (
        <div className="map-workspace__carte">
          <div className="map-workspace__stage">
            <Map3D
              orgs={orgs}
              events={mapEvents}
              families={family ? [family] : undefined}
              flows={flows}
              live={!MOCK_MODE}
              basemap={basemap}
              onSelect={handleSelectMapOrg}
              onSelectEvent={onOpenEvent}
            />
            <MapTimeline
              buckets={mapBuckets}
              selected={mapBucket}
              shown={mapEvents.length}
              total={mapTotal}
              loading={mapLoading}
              onSelect={onMapBucketChange}
            />
            <MapLegend families={legendFamilies} />
          </div>

          <aside className="map-workspace__side" id="map-workspace-side">
            <SegmentedControl
              label="Panneau régional"
              size="sm"
              value={panel === "affected" ? "affected" : panel === "couverture" ? "couverture" : "regional"}
              onChange={(next) => selectPanel(next === "affected" || next === "couverture" ? next : "regional")}
            >
              <SegmentedControlItem value="regional" label="Région" />
              <SegmentedControlItem value="couverture" label="Couverture" />
              <SegmentedControlItem value="affected" label="Concerné ?" />
            </SegmentedControl>

            {panel === "affected" ? (
              <AffectedView
                report={affected.report}
                loading={affected.loading}
                error={affected.error}
                query={affected.query}
                onQueryChange={affected.onQueryChange}
                onSubmit={affected.onSubmit}
              />
            ) : panel === "couverture" ? (
              <CouvertureView data={coverage.data} loading={coverage.loading} error={coverage.error} />
            ) : (
              <NaView
                orgs={orgs}
                overview={regional.overview}
                fil={regional.fil}
                loading={regional.loading}
                error={regional.error}
                dept={regional.dept}
                onSelectDept={regional.onSelectDept}
                onOpenOrg={onOpenOrg}
                onRetry={onRetry}
              />
            )}
          </aside>
        </div>
      ) : null}

      {tab === "graphe" ? (
        <div className="map-workspace__graphe">
          <div className="map-workspace__subbar">
            <SegmentedControl
              label="Vue du graphe"
              size="sm"
              value={panel === "attributions" ? "attributions" : "graph"}
              onChange={(next) => selectPanel(next === "attributions" ? "attributions" : "graph")}
            >
              <SegmentedControlItem value="graph" label="Réseau" />
              <SegmentedControlItem value="attributions" label="Attributions" />
            </SegmentedControl>
          </div>
          {panel === "attributions" ? (
            <ActorAttributionsView
              data={attributions.data}
              loading={attributions.loading}
              error={attributions.error}
              onRetry={onRetry}
            />
          ) : (
            <GraphView
              nodes={graph.graph.nodes}
              links={graph.graph.links}
              eventsById={graph.eventsById}
              orgsById={graph.orgsById}
              sourcesById={graph.sourcesById}
              onSelect={handleSelectNode}
              theme="observatoire"
              loading={loading}
              temporal={graph.temporal}
            />
          )}
        </div>
      ) : null}

      {tab === "organisations" ? (
        <div className="map-workspace__directory">
          <DirectoryView
            orgs={orgs}
            loading={loading}
            error={error}
            onOpenOrg={onOpenOrg}
            server={directory.server}
            urlState={directory.urlState}
            onUrlStateChange={directory.onUrlStateChange}
            onCopyLink={directory.onCopyLink}
            onRetry={onRetry}
          />
        </div>
      ) : null}
    </section>
  );
}
