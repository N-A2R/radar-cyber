import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getAuthToken, type Event, type FlowArc, type Graph, type Org, type Source, type Stats } from "./api";
import { mockData } from "./mock";
import Map3D from "./map/Map3D";
import GraphView from "./graph/GraphView";
import SourcesView from "./components/SourcesView";
import HealthView from "./components/HealthView";
import EventList from "./components/EventList";
import Inspector from "./components/Inspector";
import OrgSheet from "./components/OrgSheet";
import AlertsView from "./components/AlertsView";
import WallScreen from "./components/WallScreen";
import type { ViewKey } from "./contracts";

// Mode démonstration : données simulées, jamais d'appel API.
const MOCK_MODE = import.meta.env.VITE_DATA_MODE === "mock";

const VIEWS: { id: ViewKey; label: string }[] = [
  { id: "map", label: "Carte" },
  { id: "graph", label: "Graphe" },
  { id: "sources", label: "Sources" },
  { id: "health", label: "Santé" },
  { id: "alerts", label: "Alertes" },
  { id: "wall", label: "Mur" },
];

const FEED_LIMIT = 300;

export default function App() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [graph, setGraph] = useState<Graph>({ nodes: [], links: [] });
  const [flows, setFlows] = useState<FlowArc[]>([]);
  const [view, setView] = useState<ViewKey>("map");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!MOCK_MODE);
  const [family, setFamily] = useState<string | null>(null);
  // Ordre du fil : « régional d'abord » par défaut, « tout » = ordre de l'API.
  const [regionalFirst, setRegionalFirst] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [sheetOrgId, setSheetOrgId] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [basemap, setBasemap] = useState<"sat" | "plan">("sat");
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem("radar_token");
    } catch {
      return null;
    }
  });

  // Dernière vue hors mur : la touche F bascule mur ↔ vue précédente.
  const prevViewRef = useRef<ViewKey>("map");

  // Temps réel : le serveur pousse les nouveaux événements (SSE).
  useEffect(() => {
    // `EventSource` ne peut pas poser d'en-tête : le jeton passe en query,
    // accepté par la seule route /api/stream côté serveur.
    const streamToken = getAuthToken();
    const stream = new EventSource(
      streamToken ? `/api/stream?token=${encodeURIComponent(streamToken)}` : "/api/stream"
    );
    stream.onopen = () => setConnected(true);
    stream.onerror = () => setConnected(false);
    stream.addEventListener("new", (raw) => {
      setConnected(true);
      try {
        const row = JSON.parse((raw as MessageEvent).data) as Record<string, unknown>;
        const event: Event = {
          id: String(row.id),
          dedupKey: String(row.dedup_key),
          family: String(row.family),
          assertionType: String(row.assertion_type),
          title: String(row.title),
          summary: (row.summary as string | null) ?? null,
          observedAt: (row.observed_at as string | null) ?? null,
          severity: Number(row.severity),
          confidence: (row.confidence as string | null) ?? null,
          sourceId: String(row.source_id),
          sourceUrl: (row.source_url as string | null) ?? null,
          geoType: String(row.geo_type),
          lat: (row.lat as number | null) ?? null,
          lon: (row.lon as number | null) ?? null,
          orgId: (row.org_id as number | null) ?? null,
          // Même définition que /events : org rattachée ou géographie d'entité.
          regional:
            (row.org_id as number | null) !== null ||
            row.geo_type === "claimed_origin" ||
            row.geo_type === "entity_location",
        };
        setEvents((prev) => [event, ...prev].slice(0, FEED_LIMIT));
      } catch {
        // Charge utile illisible : on ignore le message plutôt que de casser le flux.
      }
    });
    return () => stream.close();
  }, []);

  // Les arcs réels (org → hébergement) sont rares ; à défaut on affiche les
  // arcs « orgs » (org → centroïde départemental) pour que la carte vive.
  const loadFlows = useCallback(async () => {
    const arcs = await api.flows(30);
    if (arcs.arcs.length > 0) return arcs.arcs;
    const fallback = await api.flows(30, 300, "orgs");
    return fallback.arcs;
  }, []);

  useEffect(() => {
    if (MOCK_MODE) {
      setOrgs(mockData.orgs);
      setEvents(mockData.events);
      setSources(mockData.sources);
      setStats(mockData.stats);
      setGraph(mockData.graph);
      setLoading(false);
      return;
    }
    Promise.all([api.orgs(), api.events(FEED_LIMIT), api.sources(), api.stats(), api.graph(90)])
      .then(([o, e, s, st, g]) => {
        setOrgs(o);
        setEvents(e);
        setSources(s);
        setStats(st);
        setGraph(g);
        setLoading(false);
        return loadFlows();
      })
      .then((arcs) => setFlows(arcs))
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [loadFlows]);

  // Rafraîchit statistiques, graphe et arcs toutes les 30 s.
  useEffect(() => {
    if (MOCK_MODE) return;
    const timer = setInterval(() => {
      api.stats().then(setStats).catch(() => {});
      api.graph(90).then(setGraph).catch(() => {});
      loadFlows().then(setFlows).catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [loadFlows]);

  const byFamily = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.family] = (counts[e.family] ?? 0) + 1;
    return Object.entries(counts)
      .map(([name, n]) => ({ family: name, n }))
      .sort((a, b) => b.n - a.n);
  }, [events]);

  // « tout » veut dire « tout ce qui est cyber » : la presse généraliste
  // reste consultable via son filtre, mais ne noie plus la veille.
  const filtered = useMemo(
    () =>
      family === null
        ? events.filter((e) => e.family !== "presse")
        : events.filter((e) => e.family === family),
    [events, family],
  );

  // « régional d'abord » : les événements qui touchent la région passent en
  // tête, les autres restent visibles derrière, dans l'ordre de l'API.
  const ordered = useMemo(() => {
    if (!regionalFirst) return filtered;
    return filtered
      .map((event, index) => ({ event, index }))
      .sort(
        (a, b) =>
          Number(b.event.regional) - Number(a.event.regional) || a.index - b.index,
      )
      .map((entry) => entry.event);
  }, [filtered, regionalFirst]);

  const eventsById = useMemo(() => {
    const m: Record<string, { title: string; family: string; severity: number; observedAt: string | null; sourceId: string; assertionType: string }> = {};
    for (const e of events) {
      m[e.id] = {
        title: e.title,
        family: e.family,
        severity: e.severity,
        observedAt: e.observedAt,
        sourceId: e.sourceId,
        assertionType: e.assertionType,
      };
    }
    return m;
  }, [events]);

  const orgsById = useMemo(() => {
    const m: Record<string, { kind: string; city: string | null; dept: string | null }> = {};
    for (const o of orgs) m[String(o.id)] = { kind: o.kind, city: o.city, dept: o.dept };
    return m;
  }, [orgs]);

  const sourcesById = useMemo(() => {
    const m: Record<string, { name: string; family: string; url: string }> = {};
    for (const s of sources) m[String(s.id)] = { name: s.name, family: s.family, url: s.url };
    return m;
  }, [sources]);

  const handleSelectOrg = useCallback((id: string) => {
    const numeric = Number(id.startsWith("org:") ? id.slice(4) : id);
    setSelectedOrgId(Number.isFinite(numeric) ? numeric : null);
    setSelectedEventId(null);
  }, []);

  const openOrgSheet = useCallback((id: number) => setSheetOrgId(id), []);

  const onUnauthorized = useCallback(() => {
    setToken(null);
    try {
      localStorage.removeItem("radar_token");
    } catch {
      // stockage indisponible : l'état local suffit
    }
  }, []);

  // Touche F : bascule vers l'écran mural et retour à la vue précédente.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== "f") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setView((current) => {
        if (current === "wall") return prevViewRef.current;
        prevViewRef.current = current;
        return "wall";
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const inspectorOpen =
    selectedEventId !== null || selectedOrgId !== null || sheetOrgId !== null;

  const bodyStyle =
    view === "wall"
      ? { gridTemplateColumns: "minmax(0,1fr)" }
      : {
          gridTemplateColumns: inspectorOpen ? "352px minmax(0,1fr) 320px" : "352px minmax(0,1fr)",
        };

  return (
    <div className="shell">
      {MOCK_MODE ? <div className="shell__mock">mode démonstration, données simulées</div> : null}

      <header className="rail">
        <div className="wordmark">
          <b>Radar Cyber</b>
          <span>Nouvelle-Aquitaine</span>
        </div>

        <nav className="rail__nav" aria-label="vues">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              aria-current={view === v.id ? "page" : undefined}
            >
              {v.label}
            </button>
          ))}
        </nav>

        <span className="rail__spacer" />

        {view === "map" ? (
          <button
            type="button"
            className="rail__toggle"
            aria-pressed={basemap === "sat"}
            onClick={() => setBasemap(basemap === "sat" ? "plan" : "sat")}
          >
            {basemap === "sat" ? "satellite" : "plan"}
          </button>
        ) : null}

        <span className="rail__live" data-on={connected}>
          <i aria-hidden="true" />
          {connected ? "flux direct" : "flux coupé"}
        </span>

        {token ? (
          <button type="button" className="rail__toggle" onClick={onUnauthorized}>
            déconnexion
          </button>
        ) : null}
      </header>

      {error ? <p className="shell__error">API : {error}</p> : null}

      <div className="shell__body" style={bodyStyle}>
        {view === "wall" ? null : (
          <aside className="shell__feed">
            <div className="family-filter" role="group" aria-label="Ordre du fil">
              <button
                type="button"
                className="family-filter__btn"
                aria-pressed={regionalFirst}
                onClick={() => setRegionalFirst(true)}
              >
                <span>régional d'abord</span>
              </button>
              <button
                type="button"
                className="family-filter__btn"
                aria-pressed={!regionalFirst}
                onClick={() => setRegionalFirst(false)}
              >
                <span>tout</span>
              </button>
            </div>
            <EventList
              events={ordered}
              byFamily={byFamily}
              family={family}
              onFamily={setFamily}
              selectedEventId={selectedEventId}
              onSelectEvent={(id) => {
                setSelectedEventId(id);
                setSelectedOrgId(null);
              }}
              loading={loading}
              error={null}
            />
          </aside>
        )}

        <main className="shell__stage">
          {view === "map" ? (
            <Map3D
              orgs={orgs}
              events={filtered}
              families={family ? [family] : undefined}
              flows={flows}
              basemap={basemap}
              onSelect={handleSelectOrg}
              onSelectEvent={(id) => {
                setSelectedEventId(id);
                setSelectedOrgId(null);
              }}
            />
          ) : null}

          {view === "graph" ? (
            <GraphView
              nodes={graph.nodes}
              links={graph.links}
              eventsById={eventsById}
              orgsById={orgsById}
              sourcesById={sourcesById}
              onSelect={(id) => {
                if (id) handleSelectOrg(id);
              }}
              theme="observatoire"
            />
          ) : null}

          {view === "sources" ? <SourcesView sources={sources} loading={loading} error={error} /> : null}

          {view === "health" ? <HealthView sources={sources} /> : null}

          {view === "alerts" ? (
            <AlertsView
              canWrite={Boolean(token)}
              onUnauthorized={onUnauthorized}
              onOpenEvent={(id) => {
                setSelectedEventId(id);
                setSelectedOrgId(null);
              }}
            />
          ) : null}

          {view === "wall" ? <WallScreen /> : null}
        </main>

        {view !== "wall" && inspectorOpen ? (
          <section className="shell__inspect">
            {sheetOrgId !== null ? (
              <OrgSheet orgId={sheetOrgId} onClose={() => setSheetOrgId(null)} />
            ) : (
              <Inspector
                eventId={selectedEventId}
                orgId={selectedOrgId}
                onOpenOrg={openOrgSheet}
                onClose={() => {
                  setSelectedEventId(null);
                  setSelectedOrgId(null);
                  setSheetOrgId(null);
                }}
              />
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
