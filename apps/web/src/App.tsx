import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, clearAuthToken, getAuthToken, setAuthToken, type Event, type FlowArc, type Graph, type LiveAlert, type Org, type Source, type Stats } from "./api";
import { mockData } from "./mock";
import Map3D from "./map/Map3D";
import GraphView from "./graph/GraphView";
import SourcesView from "./components/SourcesView";
import HealthView from "./components/HealthView";
import EventList from "./components/EventList";
import Inspector from "./components/Inspector";
import OrgSheet from "./components/OrgSheet";
import DirectoryView from "./components/DirectoryView";
import CommandPalette from "./components/CommandPalette";
import LiveAlerts from "./components/LiveAlerts";
import ReviewView from "./components/ReviewView";
import { parseHash, toHash, shareableUrl, type AppUrlState } from "./url-state";
import AlertsView from "./components/AlertsView";
import LoginScreen from "./components/LoginScreen";
import type { ViewKey } from "./contracts";

// Mode démonstration : données simulées, jamais d'appel API.
const MOCK_MODE = import.meta.env.VITE_DATA_MODE === "mock";

const VIEWS: { id: ViewKey; label: string }[] = [
  { id: "map", label: "Carte" },
  { id: "directory", label: "Annuaire" },
  { id: "review", label: "Revue" },
  { id: "graph", label: "Graphe" },
  { id: "sources", label: "Sources" },
  { id: "health", label: "Santé" },
  { id: "alerts", label: "Alertes" },
];

const FEED_LIMIT = 300;
/** Alertes gardées en mémoire pour le bandeau (les plus récentes d'abord). */
const LIVE_ALERT_LIMIT = 50;
const SOUND_KEY = "radar.alertSound";

export default function App() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [graph, setGraph] = useState<Graph>({ nodes: [], links: [] });
  const [flows, setFlows] = useState<FlowArc[]>([]);
  // L'URL porte la vue, les filtres de l'annuaire et la fiche ouverte :
  // une vue se copie, se partage et survit au rechargement.
  const [urlState, setUrlState] = useState<AppUrlState>(() =>
    typeof window === "undefined"
      ? parseHash("")
      : parseHash(window.location.hash),
  );
  const view = urlState.view as ViewKey;
  const setView = useCallback((next: ViewKey) => {
    setUrlState((prev) => (prev.view === next ? prev : { ...prev, view: next }));
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!MOCK_MODE);
  const [family, setFamily] = useState<string | null>(null);
  // Ordre du fil : « régional d'abord » par défaut, « tout » = ordre de l'API.
  const [regionalFirst, setRegionalFirst] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const sheetOrgId = urlState.org;
  const setSheetOrgId = useCallback((id: number | null) => {
    setUrlState((prev) => (prev.org === id ? prev : { ...prev, org: id }));
  }, []);
  const [connected, setConnected] = useState(false);
  const [basemap, setBasemap] = useState<"sat" | "plan">("sat");
  const [token, setToken] = useState<string | null>(() => getAuthToken());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);
  const [unseenAlerts, setUnseenAlerts] = useState(0);
  const [alertSignal, setAlertSignal] = useState(0);
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      try {
        localStorage.setItem(SOUND_KEY, on ? "0" : "1");
      } catch {
        // stockage refusé : le réglage reste valable pour la session
      }
      return !on;
    });
  }, []);

  // Démonstration : sans API, on fait tomber des alertes simulées pour que le
  // bandeau et le badge soient observables. Aucun réseau, aucune donnée réelle.
  useEffect(() => {
    if (!MOCK_MODE) return;
    let n = 0;
    const timer = setInterval(() => {
      const candidates = mockData.events.filter((e) => e.orgId !== null);
      if (candidates.length === 0) return;
      const event = candidates[n % candidates.length];
      n += 1;
      const alert: LiveAlert = {
        id: 900_000 + n,
        rule_id: "demo-incident-organisation",
        title: event.title,
        severity: event.severity,
        status: "open",
        event_id: null,
        indicator_id: null,
        org_id: event.orgId,
        scope: "organization_incident",
        created_at: new Date().toISOString(),
      };
      setLiveAlerts((prev) => [alert, ...prev].slice(0, LIVE_ALERT_LIMIT));
      setUnseenAlerts((count) => count + 1);
      setAlertSignal((count) => count + 1);
    }, 18_000);
    return () => clearInterval(timer);
  }, []);

  // Recherche globale : ⌘K / Ctrl+K, disponible depuis toutes les vues.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Temps réel : le serveur pousse les nouveaux événements (SSE).
  useEffect(() => {
    if (!token) return;
    // `EventSource` ne peut pas poser d'en-tête : le jeton passe en query,
    // accepté par la seule route /api/stream côté serveur.
    const streamToken = getAuthToken();
    const stream = new EventSource(
      streamToken ? `/api/stream?token=${encodeURIComponent(streamToken)}` : "/api/stream"
    );
    stream.onopen = () => setConnected(true);
    stream.onerror = () => setConnected(false);
    stream.addEventListener("alert", (raw) => {
      setConnected(true);
      try {
        const alert = JSON.parse((raw as MessageEvent).data) as LiveAlert;
        setLiveAlerts((prev) => [alert, ...prev.filter((a) => a.id !== alert.id)].slice(0, LIVE_ALERT_LIMIT));
        setUnseenAlerts((n) => n + 1);
        setAlertSignal((n) => n + 1);
      } catch {
        // charge utile illisible : on ignore sans casser le flux
      }
    });
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
  }, [token]);

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
    if (!token) return;
    // Chaque appel est indépendant : un endpoint en erreur ne doit plus vider
    // l'écran. C'est exactement ce qui arrivait quand `/api/graph` dépassait
    // son `statement_timeout` — le `Promise.all` rejetait, et organisations,
    // événements, sources et statistiques n'étaient jamais posés en état.
    const load = async () => {
      const labels = ["organisations", "événements", "sources", "statistiques", "graphe"] as const;
      const results = await Promise.allSettled([
        api.orgs(),
        api.events(FEED_LIMIT),
        api.sources(),
        api.stats(),
        api.graph(90),
      ]);
      const [o, e, s, st, g] = results;
      if (o.status === "fulfilled") setOrgs(o.value);
      if (e.status === "fulfilled") setEvents(e.value);
      if (s.status === "fulfilled") setSources(s.value);
      if (st.status === "fulfilled") setStats(st.value);
      if (g.status === "fulfilled") setGraph(g.value);
      const failed = results.flatMap((r, i) => (r.status === "rejected" ? [labels[i]] : []));
      setError(failed.length > 0 ? `indisponible : ${failed.join(", ")}` : null);
      setLoading(false);
      const arcs = await loadFlows().catch(() => []);
      setFlows(arcs);
    };
    void load();
  }, [loadFlows, token]);

  // Rafraîchit statistiques, graphe et arcs toutes les 30 s.
  useEffect(() => {
    if (MOCK_MODE || !token) return;
    const timer = setInterval(() => {
      api.stats().then(setStats).catch(() => {});
      api.graph(90).then(setGraph).catch(() => {});
      loadFlows().then(setFlows).catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [loadFlows, token]);

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

  // Refléter l'état dans le hash, sans empiler une entrée par frappe.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = toHash(urlState);
    if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
  }, [urlState]);

  // Précédent / suivant : on relit le hash plutôt que de garder deux vérités.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHashChange = () => setUrlState(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const onDirectoryStateChange = useCallback((directory: AppUrlState["directory"]) => {
    setUrlState((prev) => {
      const same = prev.directory.q === directory.q
        && prev.directory.kind === directory.kind
        && prev.directory.sector === directory.sector
        && prev.directory.dept === directory.dept
        && prev.directory.withEvents === directory.withEvents
        && prev.directory.sort === directory.sort
        && prev.directory.dir === directory.dir
        && prev.directory.page === directory.page
        && prev.directory.size === directory.size;
      return same ? prev : { ...prev, directory };
    });
  }, []);

  const copyDirectoryLink = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = shareableUrl(urlState, window.location.origin, window.location.pathname);
    void navigator.clipboard?.writeText(url).catch(() => {});
  }, [urlState]);

  const onUnauthorized = useCallback(() => {
    setToken(null);
    setError(null);
    clearAuthToken();
  }, []);

  /** Connexion réussie : mémorise le jeton puis relance le chargement. */
  const onAuthenticated = useCallback((fresh: string) => {
    setAuthToken(fresh);
    setToken(fresh);
    setError(null);
  }, []);


  const inspectorOpen =
    selectedEventId !== null || selectedOrgId !== null || sheetOrgId !== null;

  const bodyStyle = {
    gridTemplateColumns: inspectorOpen ? "352px minmax(0,1fr) 320px" : "352px minmax(0,1fr)",
  };

  // Sans jeton (hors démonstration), le shell n'est jamais monté : seul
  // l'écran de connexion est rendu, aucune requête authentifiée ne part.
  if (!token && !MOCK_MODE) return <LoginScreen onAuthenticated={onAuthenticated} />;

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
              onClick={() => {
                setView(v.id);
                if (v.id === "alerts") setUnseenAlerts(0);
              }}
              aria-current={view === v.id ? "page" : undefined}
            >
              {v.label}
              {v.id === "alerts" && unseenAlerts > 0 ? (
                <span className="rail__badge" aria-label={`${unseenAlerts} alertes non vues`}>{unseenAlerts}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <span className="rail__spacer" />

        <button
          type="button"
          className="rail__toggle"
          onClick={() => setPaletteOpen(true)}
          aria-keyshortcuts="Meta+K Control+K"
        >
          rechercher ⌘K
        </button>

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

      <LiveAlerts
        alerts={liveAlerts}
        unseen={unseenAlerts}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        onOpenAlerts={() => {
          setView("alerts");
          setUnseenAlerts(0);
        }}
        onDismiss={() => {
          setLiveAlerts([]);
          setUnseenAlerts(0);
        }}
      />

      {error ? <p className="shell__error">API : {error}</p> : null}

      <div className="shell__body" style={bodyStyle}>
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

          {view === "directory" ? (
            <DirectoryView
              orgs={orgs}
              loading={loading}
              error={error}
              onOpenOrg={openOrgSheet}
              server={!MOCK_MODE}
              urlState={urlState.directory}
              onUrlStateChange={onDirectoryStateChange}
              onCopyLink={copyDirectoryLink}
            />
          ) : null}

          {view === "review" ? (
            <ReviewView
              canWrite={Boolean(token)}
              server={!MOCK_MODE}
              onUnauthorized={onUnauthorized}
              onOpenOrg={openOrgSheet}
            />
          ) : null}

          {view === "sources" ? <SourcesView sources={sources} loading={loading} error={error} /> : null}

          {view === "health" ? <HealthView sources={sources} /> : null}

          {view === "alerts" ? (
            <AlertsView
              refreshSignal={alertSignal}
              canWrite={Boolean(token)}
              onUnauthorized={onUnauthorized}
              onOpenEvent={(id) => {
                setSelectedEventId(id);
                setSelectedOrgId(null);
              }}
            />
          ) : null}

        </main>

        {inspectorOpen ? (
          <section className="shell__inspect">
            {sheetOrgId !== null ? (
              <OrgSheet orgId={sheetOrgId} onClose={() => setSheetOrgId(null)} mock={MOCK_MODE} />
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

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenOrg={openOrgSheet}
        onOpenEvent={(id) => {
          setSelectedEventId(id);
          setSelectedOrgId(null);
          setSheetOrgId(null);
        }}
        mock={MOCK_MODE ? { orgs, events } : null}
      />
    </div>
  );
}
