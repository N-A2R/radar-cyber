import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { TopNav, TopNavItem } from "@astryxdesign/core/TopNav";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { creerMemoire, etatDonnees, type Instantane } from "./offline";
import { lastOfflineFallback, offlineStatus, onOfflineFallback } from "./offline/pwa";
import { type DataRow } from "./export";
import ExportMenu, { ExportProvider, useScreenExport } from "./components/ExportMenu";
import {
  api, ApiError, clearAuthToken, getAffected, getAuthToken, setAuthToken,
  type AffectedReport, type CollecteMetrics, type CouvertureResponse, type CorpusStats,
  type Event, type FlowArc, type Graph, type HealthCauses, type HealthDetail,
  type LiveAlert, type NaFil, type NaOverview, type Org, type Source,
} from "./api";
import type { ActorAttributionsResponse } from "./api";
import type { MapTimelineBucket, MapTimelineEvent } from "./api";
import { mockData } from "./mock";
import LiveAlerts, { addLiveAlert, connectLiveAlerts } from "./components/LiveAlerts";
const MapWorkspace = lazy(() => import("./components/MapWorkspace"));
const ActionWorkspace = lazy(() => import("./components/ActionWorkspace"));
const SourcesWorkspace = lazy(() => import("./components/SourcesWorkspace"));
const JournalWorkspace = lazy(() => import("./components/JournalWorkspace"));
const EventList = lazy(() => import("./components/EventList"));
const Inspector = lazy(() => import("./components/Inspector"));
const OrgSheet = lazy(() => import("./components/OrgSheet"));
const CommandPalette = lazy(() => import("./components/CommandPalette"));
const LoginScreen = lazy(() => import("./components/LoginScreen"));
import type { ViewKey } from "./contracts";
import {
  parseHash, toHash, shareableUrl,
  type ActionTab, type AppUrlState, type JournalTab, type MapPanel, type SourcesTab,
} from "./url-state";
import { buildBuckets, eventsInBucket, withEmptyBuckets } from "./map/timeline.js";

// Chaque destination chargée à la demande garde sa place dans le shell : le
// squelette occupe la même zone jusqu'à l'arrivée du chunk.
function ViewSkeleton() {
  return (
    <div className="view-skeleton" role="status" aria-live="polite">
      <span className="view-skeleton__label">chargement…</span>
      <span className="view-skeleton__line" />
      <span className="view-skeleton__line" />
      <span className="view-skeleton__line" />
    </div>
  );
}

// Mode démonstration : données simulées, jamais d'appel API.
const MOCK_MODE = import.meta.env.VITE_DATA_MODE === "mock";

const VIEW_LABELS: Record<ViewKey, string> = {
  map: "Carte",
  action: "Action",
  sources: "Sources",
  journal: "Journal",
};

const VIEW_ORDER: ViewKey[] = ["map", "action", "sources", "journal"];

const FEED_LIMIT = 300;
/** Alertes gardées en mémoire pour le bandeau (les plus récentes d'abord). */
const LIVE_ALERT_LIMIT = 50;
const SOUND_KEY = "radar.alertSound";

/** Destinations dont le shell publie les lignes ; les autres les publient elles-mêmes. */
const APP_EXPORT_VIEWS: Partial<Record<ViewKey, true>> = { map: true, sources: true };

/** Ce que chaque destination a réellement à rafraîchir ; `stats` n'est plus sondé. */
export type RefreshKind = "today" | "departements" | "graph" | "health" | "na" | "flows" | "corpus" | "sourcesDashboard";
export type RefreshPlan = Readonly<Partial<Record<RefreshKind, true>>>;
const AUCUN_REFRESH: RefreshPlan = {};
/** Anciennes vues : conservées pour les tests de décision de polling. */
const REFRESH_LEGACY: Partial<Record<string, RefreshPlan>> = {
  today: { today: true, departements: true },
  graph: { graph: true },
  health: { health: true },
  na: { na: true },
  corpus: { corpus: true },
  "sources-dashboard": { sourcesDashboard: true },
};

/** Onglet caché = zéro appel ; panneau non ouvert = zéro appel lourd. */
export function refreshPlan(view: string, visible: boolean, panel?: string, tab?: string): RefreshPlan {
  if (!visible) return AUCUN_REFRESH;
  if (view === "map") {
    const plan: Partial<Record<RefreshKind, true>> = { flows: true };
    if (panel === "graph") plan.graph = true;
    if (panel === "regional") plan.na = true;
    return plan;
  }
  if (view === "sources") {
    const plan: Partial<Record<RefreshKind, true>> = {};
    if (tab === "indicateurs") plan.sourcesDashboard = true;
    if (tab === "sante") plan.health = true;
    if (tab === "corpus") plan.corpus = true;
    return plan;
  }
  return REFRESH_LEGACY[view] ?? AUCUN_REFRESH;
}

export function pageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

/** Vue, panneau, onglet et fiche ouverte = navigation ; le reste = filtrage. */
function urlKey(state: AppUrlState): string {
  return `${state.view}\u0000${state.mapPanel}\u0000${state.actionTab}\u0000${state.sourcesTab}\u0000${state.journalTab}\u0000${state.org ?? ""}`;
}

type AppExportInput = {
  view: ViewKey;
  mapPanel: MapPanel;
  sourcesTab: SourcesTab;
  coverage: CouvertureResponse | null;
  corpus: CorpusStats | null;
  sources: Source[];
  orgs: Org[];
  graph: Graph;
  na: NaOverview | null;
  attributions: ActorAttributionsResponse | null;
};

function rowsForAppScreen(input: AppExportInput): DataRow[] {
  if (input.view === "map") {
    if (input.mapPanel === "couverture") {
      return (input.coverage?.parDepartement ?? []).map((line) => ({
        department: line.departement, seen: line.vus, total: line.total, rate: line.taux,
      }));
    }
    if (input.mapPanel === "graph") {
      return input.graph.nodes.map((node) => ({
        id: node.id, label: node.label, kind: node.kind, department: node.dept,
      }));
    }
    if (input.mapPanel === "regional") {
      return (input.na?.depts ?? []).map((dept) => ({
        department: dept.dept, organisations: dept.orgs,
        withEvents: dept.orgsAvecEvenement, events: dept.evenements,
      }));
    }
    if (input.mapPanel === "attributions") {
      return (input.attributions?.attributions ?? []).map((row) => ({
        actor: row.actor, groupName: row.groupName, confidence: row.confidence,
        level: row.level, method: row.method, sources: row.sources, claims: row.claims,
      }));
    }
    return input.orgs.map((org) => ({
      id: org.id, organisation: org.name, department: org.dept, family: org.kind,
      latitude: org.lat, longitude: org.lon, events: org.eventCount,
    }));
  }
  if (input.view === "sources") {
    if (input.sourcesTab === "corpus") {
      return (input.corpus?.byDepartment ?? []).map((line) => ({
        department: line.department, label: line.label, total: line.total,
      }));
    }
    return input.sources.map((source) => ({
      id: source.id, name: source.name, family: source.family, kind: source.kind,
      status: source.ok ? "ok" : "unverified", lastSeen: source.lastOkAt,
      items: source.itemsTotal, events: source.evenements30j,
    }));
  }
  return [];
}

export default function App() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [healthDetail, setHealthDetail] = useState<HealthDetail | null>(null);
  const [healthCauses, setHealthCauses] = useState<HealthCauses | null>(null);
  const [collecteMetrics, setCollecteMetrics] = useState<CollecteMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [naOverview, setNaOverview] = useState<NaOverview | null>(null);
  const [naFil, setNaFil] = useState<NaFil | null>(null);
  const [couvertureData, setCouvertureData] = useState<CouvertureResponse | null>(null);
  const [couvertureLoading, setCouvertureLoading] = useState(false);
  const [couvertureError, setCouvertureError] = useState<string | null>(null);
  const [corpusData, setCorpusData] = useState<CorpusStats | null>(null);
  const [corpusLoading, setCorpusLoading] = useState(false);
  const [corpusError, setCorpusError] = useState<string | null>(null);
  const [attributionsData, setAttributionsData] = useState<ActorAttributionsResponse | null>(null);
  const [attributionsLoading, setAttributionsLoading] = useState(false);
  const [attributionsError, setAttributionsError] = useState<string | null>(null);
  // "Am I affected?" is a user action: one request per Check, never on view load.
  const [affectedReport, setAffectedReport] = useState<AffectedReport | null>(null);
  const [affectedLoading, setAffectedLoading] = useState(false);
  const [affectedError, setAffectedError] = useState<string | null>(null);
  const [affectedQuery, setAffectedQuery] = useState("");
  const [graph, setGraph] = useState<Graph>({ nodes: [], links: [] });
  const [temporalGraph, setTemporalGraph] = useState<Graph | null>(null);
  const [flows, setFlows] = useState<FlowArc[]>([]);
  // L'URL porte la destination, le panneau, les filtres et la fiche ouverte :
  // un état se copie, se partage et survit au rechargement.
  const [urlState, setUrlState] = useState<AppUrlState>(() =>
    typeof window === "undefined"
      ? parseHash("")
      : parseHash(window.location.hash),
  );
  const view = urlState.view;
  const appExportRows = useMemo(() => rowsForAppScreen({
    view, mapPanel: urlState.mapPanel, sourcesTab: urlState.sourcesTab,
    coverage: couvertureData, corpus: corpusData, sources, orgs, graph,
    na: naOverview, attributions: attributionsData,
  }), [view, urlState.mapPanel, urlState.sourcesTab, couvertureData, corpusData, sources, orgs, graph, naOverview, attributionsData]);
  useScreenExport(view, appExportRows, APP_EXPORT_VIEWS[view] === true);
  const navigate = useCallback((next: ViewKey) => {
    setUrlState((prev) => (prev.view === next ? prev : { ...prev, view: next }));
    if (next === "action") setUnseenAlerts(0);
  }, []);
  const setMapPanel = useCallback((panel: MapPanel) => {
    setUrlState((prev) => (
      prev.view === "map" && prev.mapPanel === panel ? prev : { ...prev, view: "map", mapPanel: panel }
    ));
  }, []);
  const setActionTab = useCallback((tab: ActionTab) => {
    setUrlState((prev) => (
      prev.view === "action" && prev.actionTab === tab ? prev : { ...prev, view: "action", actionTab: tab }
    ));
  }, []);
  const setSourcesTab = useCallback((tab: SourcesTab) => {
    setUrlState((prev) => (
      prev.view === "sources" && prev.sourcesTab === tab ? prev : { ...prev, view: "sources", sourcesTab: tab }
    ));
  }, []);
  const setJournalTab = useCallback((tab: JournalTab) => {
    setUrlState((prev) => (
      prev.view === "journal" && prev.journalTab === tab ? prev : { ...prev, view: "journal", journalTab: tab }
    ));
  }, []);
  const setNaDept = useCallback((dept: string | null) => {
    setUrlState((prev) => (prev.naDept === dept ? prev : { ...prev, naDept: dept }));
  }, []);
  const [error, setError] = useState<string | null>(null);
  // Tant que la révocation serveur n'est pas confirmée, le jeton local (et la
  // session HttpOnly associée) reste intact : on ne peut pas afficher un état
  // déconnecté alors que la session distante est toujours valable.
  const [logoutState, setLogoutState] = useState<"idle" | "pending" | "failed">("idle");
  const [logoutForced, setLogoutForced] = useState(false);
  const logoutBusy = useRef(false);
  const logoutGeneration = useRef(0);
  /**
   * Hors ligne : quand l'API ne répond pas, on continue d'afficher le dernier
   * état connu de la carte, avec son âge. Un écran vide en dit moins qu'un
   * écran daté.
   */
  const [instantane, setInstantane] = useState<Instantane<{ orgs: unknown; events: unknown }> | null>(null);
  const [horloge, setHorloge] = useState(() => Date.now());
  const memoire = useMemo(() => creerMemoire(typeof localStorage === "undefined" ? null : localStorage), []);
  // L'âge des données doit vieillir à l'écran : une mention « 3 min » qui reste
  // figée devient un mensonge au bout d'une heure.
  useEffect(() => {
    const timer = setInterval(() => setHorloge(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const instantaneData = useMemo(() => etatDonnees(instantane, horloge), [instantane, horloge]);
  // Offline is a first-class state: the network can drop between two renders.
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [offlineAt, setOfflineAt] = useState<number | null>(() => lastOfflineFallback()?.at ?? null);
  useEffect(() => {
    const down = () => setOffline(true);
    const up = () => { setOffline(false); setOfflineAt(null); };
    const unsubscribe = onOfflineFallback((info) => {
      setOffline(true);
      setOfflineAt(info.at);
    });
    window.addEventListener("offline", down);
    window.addEventListener("online", up);
    return () => {
      window.removeEventListener("offline", down);
      window.removeEventListener("online", up);
      unsubscribe();
    };
  }, []);
  const [loading, setLoading] = useState(!MOCK_MODE);
  const [reloadSignal, setReloadSignal] = useState(0);
  const recharger = useCallback(() => setReloadSignal((n) => n + 1), []);
  const [family, setFamily] = useState<string | null>(null);
  // Un lien `#/today?family=…` garde son filtre dans le fil de la Carte.
  useEffect(() => {
    setFamily(urlState.today.family);
  }, [urlState.today.family]);
  // Ordre du fil : « régional d'abord » par défaut, « tout » = ordre de l'API.
  const [regionalFirst, setRegionalFirst] = useState(true);
  /**
   * Ce que le fil montre : la région (défaut), tout, ou la veille CVE.
   * Le fil par défaut ne noie pas l'écran sous 19 000 bulletins dont 87 %
   * ne concernent pas la région.
   */
  const [portee, setPortee] = useState<"region" | "toutes" | "vulnerabilites">("region");
  // Le fil d'événements change sans relancer les endpoints du shell.
  const porteeRef = useRef(portee);
  const porteeInitiale = useRef(true);
  const orgsRef = useRef<Org[]>([]);
  const mainRef = useRef<HTMLElement | null>(null);
  const urlKeyRef = useRef<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const sheetOrgId = urlState.org;
  const setSheetOrgId = useCallback((id: number | null) => {
    setUrlState((prev) => (prev.org === id ? prev : { ...prev, org: id }));
  }, []);
  const [connected, setConnected] = useState(false);
  // Le fond par défaut est le plan sombre : l'imagerie satellite est superbe
  // mais elle occupe l'œil, et la densité du référentiel ne se lit plus dessus.
  const [basemap, setBasemap] = useState<"sat" | "plan">("plan");
  // Map timeline: monthly counts from the API, one page of geolocated points.
  const [mapBuckets, setMapBuckets] = useState<MapTimelineBucket[]>([]);
  const [mapBucket, setMapBucket] = useState("all");
  const [mapEvents, setMapEvents] = useState<MapTimelineEvent[]>([]);
  const [mapTotal, setMapTotal] = useState(0);
  const [mapLoading, setMapLoading] = useState(false);
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

  // Arrivée sur Action (déclic ou lien direct) : le badge est acquitté.
  useEffect(() => {
    if (view === "action") setUnseenAlerts(0);
  }, [view]);

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

  // Recherche globale : ⌘K / Ctrl+K, disponible depuis toutes les destinations.
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
    const stream = connectLiveAlerts({ onConnection: setConnected, onAlert: (a) => {
      setLiveAlerts((prev) => addLiveAlert(prev, a, LIVE_ALERT_LIMIT));
      setUnseenAlerts((n) => n + 1);
      setAlertSignal((n) => n + 1);
    } });
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
          // La portée vient du serveur : une seule définition, remplie à
          // l'écriture par `porteeRegionale`. Le front ne la réinvente plus.
          regional: row.regional === true,
        };
        const visible =
          portee === "toutes" ||
          (portee === "region" && event.regional) ||
          (portee === "vulnerabilites" && event.family === "vuln");
        if (visible) setEvents((prev) => [event, ...prev].slice(0, FEED_LIMIT));
      } catch {
        // Charge utile illisible : on ignore le message plutôt que de casser le flux.
      }
    });
    return stream.close;
  }, [token, portee]);

  // Les arcs réels (org → hébergement) sont rares ; à défaut on affiche les
  // arcs « orgs » (org → centroïde départemental) pour que la carte vive.
  const loadFlows = useCallback(async () => {
    const arcs = await api.flows(30);
    if (arcs.arcs.length > 0) return arcs.arcs;
    const fallback = await api.flows(30, 300, "orgs");
    return fallback.arcs;
  }, []);

  useEffect(() => { orgsRef.current = orgs; }, [orgs]);

  useEffect(() => {
    if (MOCK_MODE) {
      setOrgs(mockData.orgs);
      setEvents(mockData.events);
      setSources(mockData.sources);
      setGraph(mockData.graph);
      setCouvertureData(mockData.couverture);
      setLoading(false);
      return;
    }
    if (!token) return;
    // 1. Ce qu'on avait la dernière fois, tout de suite, pour ne pas ouvrir sur
    //    un écran vide si le réseau est tombé entre deux sessions.
    const cache = memoire.lire<{ orgs: Org[]; events: Event[] }>("carte");
    if (cache !== null && cache.data.orgs.length > 0) {
      setOrgs(cache.data.orgs);
      setEvents(cache.data.events);
      setLoading(false);
      setInstantane(cache as unknown as Instantane<{ orgs: unknown; events: unknown }>);
    }
    // Chaque appel est indépendant : un endpoint en erreur ne doit plus vider
    // l'écran. C'est exactement ce qui arrivait quand `/api/graph` dépassait
    // son `statement_timeout` — le `Promise.all` rejetait, et organisations,
    // événements et sources n'étaient jamais posés en état.
    const load = async () => {
      const labels = ["organisations", "événements", "sources", "graphe", "vue NA", "état détaillé", "causes des sources rouges", "graphe temporel"] as const;
      const results = await Promise.allSettled([
        api.orgs(),
        api.events(FEED_LIMIT, "regional", porteeRef.current),
        api.sources(),
        api.graph(90),
        api.naOverview(),
        api.healthDetail(),
        api.healthCauses(),
        api.graphTemporal(),
      ]);
      const [o, e, s, g, na, hd, hc, tg] = results;
      if (o.status === "fulfilled") setOrgs(o.value);
      if (e.status === "fulfilled") setEvents(e.value);
      if (o.status === "fulfilled" && e.status === "fulfilled") {
        // On n'écrit l'instantané que si les deux moitiés de la carte sont là :
        // une carte avec des orgs et sans événements serait un état qui n'a
        // jamais existé.
        const at = Date.now();
        memoire.ecrire("carte", { orgs: o.value, events: e.value }, at);
        setInstantane({ at, data: { orgs: o.value, events: e.value } });
      }
      if (s.status === "fulfilled") setSources(s.value);
      if (g.status === "fulfilled") setGraph(g.value);
      if (na.status === "fulfilled") setNaOverview(na.value);
      if (hd.status === "fulfilled") setHealthDetail(hd.value);
      if (hc.status === "fulfilled") setHealthCauses(hc.value);
      if (tg.status === "fulfilled") setTemporalGraph(tg.value);
      const failed = results.flatMap((r, i) => (r.status === "rejected" ? [labels[i]] : []));
      setError(failed.length > 0 ? `indisponible : ${failed.join(", ")}` : null);
      setLoading(false);
      const arcs = await loadFlows().catch(() => []);
      setFlows(arcs);
    };
    void load();
  }, [loadFlows, token, reloadSignal]);

  // Changer le périmètre ne concerne que le fil : on relit /events et on
  // reconnecte le SSE (effet plus haut), sans toucher aux autres endpoints.
  useEffect(() => {
    if (MOCK_MODE || !token) return;
    if (porteeInitiale.current) {
      porteeInitiale.current = false;
      return;
    }
    porteeRef.current = portee;
    const controller = new AbortController();
    api.events(FEED_LIMIT, "regional", portee, controller.signal)
      .then((nouveaux) => {
        if (controller.signal.aborted) return;
        setEvents(nouveaux);
        const orgsConnues = orgsRef.current;
        if (orgsConnues.length > 0) {
          const at = Date.now();
          memoire.ecrire("carte", { orgs: orgsConnues, events: nouveaux }, at);
          setInstantane({ at, data: { orgs: orgsConnues, events: nouveaux } });
        }
      })
      .catch(() => { /* le fil garde les événements déjà chargés */ });
    return () => controller.abort();
  }, [portee, token, memoire]);

  // Rafraîchissement 30 s : seulement les données utiles à la destination
  // ouverte, et jamais dans un onglet caché. Retour sur l'onglet : immédiat.
  useEffect(() => {
    if (MOCK_MODE || !token) return;
    const rafraichir = () => {
      const plan = refreshPlan(
        view, pageVisible(),
        view === "map" ? urlState.mapPanel : undefined,
        view === "sources" ? urlState.sourcesTab : undefined,
      );
      if (plan.graph) api.graph(90).then(setGraph).catch(() => {});
      if (plan.health) {
        api.healthDetail().then(setHealthDetail).catch(() => {});
        api.healthCauses().then(setHealthCauses).catch(() => {});
      }
      if (plan.na) api.naOverview().then(setNaOverview).catch(() => {});
      if (plan.flows) loadFlows().then(setFlows).catch(() => {});
    };
    const timer = setInterval(rafraichir, 30_000);
    document.addEventListener("visibilitychange", rafraichir);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", rafraichir);
    };
  }, [loadFlows, token, view, urlState.mapPanel, urlState.sourcesTab]);

  // Le fil d'événements suit le filtre département du panneau régional.
  useEffect(() => {
    if (MOCK_MODE || !token) return;
    if (!urlState.naDept) {
      setNaFil(null);
      return;
    }
    api
      .naEvents(urlState.naDept)
      .then((f) => setNaFil(f))
      .catch(() => setNaFil(null));
  }, [urlState.naDept, token]);

  // The scrubber is populated only while the Carte panneau is open. In mock
  // mode the same pure helpers read the simulated events, so no network call.
  const timelineVisible = view === "map" && urlState.mapPanel === "carte";
  useEffect(() => {
    if (!timelineVisible) return;
    if (MOCK_MODE) {
      setMapBuckets(buildBuckets(mockData.events, 12));
      return;
    }
    if (!token) return;
    const controller = new AbortController();
    api.mapTimelineBuckets(12, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setMapBuckets(withEmptyBuckets(response.buckets, 12));
      })
      .catch(() => { if (!controller.signal.aborted) setMapBuckets([]); });
    return () => controller.abort();
  }, [timelineVisible, token, reloadSignal]);

  useEffect(() => {
    if (!timelineVisible) return;
    if (MOCK_MODE) {
      const visible = eventsInBucket(mockData.events, mapBucket);
      setMapEvents(visible.slice(0, 1000));
      setMapTotal(visible.length);
      return;
    }
    if (!token || mapBuckets.length === 0) return;
    const controller = new AbortController();
    setMapLoading(true);
    api.mapTimelineEvents(mapBucket, 1000, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setMapEvents(response.events);
        setMapTotal(response.total);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMapEvents([]);
          setMapTotal(0);
        }
      })
      .finally(() => { if (!controller.signal.aborted) setMapLoading(false); });
    return () => controller.abort();
  }, [timelineVisible, token, mapBucket, mapBuckets, reloadSignal]);

  // Corpus : lecture publique, indépendante du token et du fil d'événements.
  const corpusVisible = view === "sources" && urlState.sourcesTab === "corpus";
  useEffect(() => {
    if (MOCK_MODE || !corpusVisible) return;
    const controller = new AbortController();
    const charger = () => {
      if (!refreshPlan(view, pageVisible(), undefined, "corpus").corpus) return;
      api
        .corpusStats(controller.signal)
        .then((donnees) => {
          setCorpusData(donnees);
          setCorpusError(null);
        })
        .catch((err: unknown) => {
          if (!controller.signal.aborted) {
            setCorpusError(err instanceof Error ? err.message : "indisponible");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setCorpusLoading(false);
        });
    };
    charger();
    const timer = setInterval(charger, 60_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [corpusVisible, view]);

  // Supervision des cycles : complète les chiffres du registre des sources.
  useEffect(() => {
    if (MOCK_MODE || !token || view !== "sources") return;
    const controller = new AbortController();
    const charger = () => {
      setMetricsLoading(true);
      setMetricsError(null);
      api.collecteMetrics(20, controller.signal)
        .then((donnees) => {
          setCollecteMetrics(donnees);
          setMetricsLoading(false);
        })
        .catch((err: unknown) => {
          if (!controller.signal.aborted) {
            setMetricsError(err instanceof Error ? err.message : "indisponible");
            setMetricsLoading(false);
          }
        });
    };
    charger();
    const timer = setInterval(charger, 60_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [view, token]);

  // Couverture : mesure publiée, un appel à l'ouverture du panneau, annulé à
  // la fermeture.
  const couvertureVisible = view === "map" && urlState.mapPanel === "couverture";
  useEffect(() => {
    if (!couvertureVisible) return;
    if (MOCK_MODE) {
      setCouvertureData(mockData.couverture);
      setCouvertureLoading(false);
      setCouvertureError(null);
      return;
    }
    if (!token) return;
    const controller = new AbortController();
    setCouvertureLoading(true);
    setCouvertureError(null);
    api.couverture(controller.signal)
      .then(setCouvertureData)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setCouvertureError(err instanceof Error ? err.message : "indisponible");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCouvertureLoading(false);
      });
    return () => controller.abort();
  }, [couvertureVisible, token]);

  // Attribution figures are a published measurement: fetched on panel open.
  const attributionsVisible = view === "map" && urlState.mapPanel === "attributions";
  useEffect(() => {
    if (!attributionsVisible || MOCK_MODE) return;
    const controller = new AbortController();
    setAttributionsLoading(true);
    setAttributionsError(null);
    api.actorAttributions(controller.signal)
      .then(setAttributionsData)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setAttributionsError(err instanceof Error ? err.message : "indisponible");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setAttributionsLoading(false);
      });
    return () => controller.abort();
  }, [attributionsVisible]);

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
    setSheetOrgId(Number.isFinite(numeric) ? numeric : null);
  }, [setSheetOrgId]);

  const openOrgSheet = useCallback((id: number) => setSheetOrgId(id), [setSheetOrgId]);

  const openEventInspector = useCallback((id: string) => {
    setSelectedEventId(id);
    setSelectedOrgId(null);
    setSheetOrgId(null);
  }, [setSheetOrgId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = toHash(urlState);
    const cle = urlKey(urlState);
    if (window.location.hash === hash) {
      urlKeyRef.current = cle;
      return;
    }
    // Changer de destination, de panneau ou ouvrir une fiche empile une
    // entrée : « Retour » revient à l'état précédent. Frapper dans un champ
    // ne le fait pas.
    const navigation = urlKeyRef.current !== null && cle !== urlKeyRef.current;
    if (navigation) window.history.pushState(null, "", hash);
    else window.history.replaceState(null, "", hash);
    urlKeyRef.current = cle;
  }, [urlState]);

  // Précédent / suivant, hash collé ou lien externe : une seule vérité, le hash.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHashChange = () => {
      const next = parseHash(window.location.hash);
      urlKeyRef.current = urlKey(next);
      setUrlState(next);
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
    };
  }, []);

  /** Oubli local : seulement après révocation confirmée, 401, ou accord explicite. */
  const finishLogout = useCallback((forced = false) => {
    logoutGeneration.current += 1;
    setToken(null);
    setError(null);
    clearAuthToken();
    setLogoutState("idle");
    setLogoutForced(forced);
    logoutBusy.current = false;
  }, []);

  const onUnauthorized = useCallback(() => {
    // 401 : le jeton est déjà invalide côté serveur, pas de révocation à appeler.
    finishLogout();
  }, [finishLogout]);

  /** Déconnexion volontaire : révoquer la session avant de oublier le jeton. */
  const onLogout = useCallback(async () => {
    if (logoutBusy.current) return;
    if (!getAuthToken()) { finishLogout(); return; }
    const generation = logoutGeneration.current;
    logoutBusy.current = true;
    setLogoutState("pending");
    try {
      const resultat = await api.logout();
      if (resultat?.ok === false) throw new Error("révocation refusée");
      if (logoutGeneration.current !== generation) return;
      finishLogout();
    } catch (err) {
      // Un 401 passif ou une nouvelle connexion a changé de session entretemps.
      if (logoutGeneration.current !== generation) return;
      const status = err instanceof ApiError ? err.status : (err as { status?: number } | null)?.status;
      if (status === 401) {
        // Session déjà invalide : même traitement qu'un 401 sur toute autre route.
        finishLogout();
        return;
      }
      // La session distante peut encore être valable : garder le jeton et le
      // shell, et laisser l'utilisateur choisir révocation ou déconnexion locale.
      logoutBusy.current = false;
      setLogoutState("failed");
    }
  }, [finishLogout]);

  const onDirectoryStateChange = useCallback((directory: AppUrlState["directory"]) => {
    setUrlState((prev) => {
      const same = prev.directory.q === directory.q
        && prev.directory.kind === directory.kind
        && prev.directory.sector === directory.sector
        && prev.directory.dept === directory.dept
        && prev.directory.withEvents === directory.withEvents
        && prev.directory.withoutEvents === directory.withoutEvents
        && prev.directory.sort === directory.sort
        && prev.directory.dir === directory.dir
        && prev.directory.page === directory.page
        && prev.directory.size === directory.size;
      return same ? prev : { ...prev, directory };
    });
  }, []);

  const onReviewStateChange = useCallback((review: AppUrlState["review"]) => {
    setUrlState((prev) => {
      const same = prev.review.bucket === review.bucket && prev.review.q === review.q;
      return same ? prev : { ...prev, review };
    });
  }, []);

  const copyDirectoryLink = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = shareableUrl(urlState, window.location.origin, window.location.pathname);
    void navigator.clipboard?.writeText(url).catch(() => {});
  }, [urlState]);

  /** Connexion réussie : mémorise le jeton puis relance le chargement. */
  const onAuthenticated = useCallback((fresh: string) => {
    logoutGeneration.current += 1;
    logoutBusy.current = false;
    setAuthToken(fresh);
    setToken(fresh);
    setError(null);
    setLogoutState("idle");
    setLogoutForced(false);
  }, []);

  const affectedController = useRef<AbortController | null>(null);
  const onAffectedSubmit = useCallback((q: string) => {
    if (q.trim() === "") {
      setAffectedReport(null);
      setAffectedError(null);
      return;
    }
    affectedController.current?.abort();
    const controller = new AbortController();
    affectedController.current = controller;
    setAffectedLoading(true);
    setAffectedError(null);
    getAffected(q.trim(), controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          setAffectedReport(next);
          setAffectedError(null);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setAffectedReport(null);
          setAffectedError(err instanceof Error ? err.message : "indisponible");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setAffectedLoading(false);
      });
  }, []);
  useEffect(() => () => affectedController.current?.abort(), []);

  const inspectorOpen =
    selectedEventId !== null || selectedOrgId !== null || sheetOrgId !== null;

  // Le fil n'est utile qu'à la Carte. Ailleurs, chaque destination garde
  // toute la largeur : pas de colonne permanente qui parasite la lecture.
  const feedVisible = view === "map";
  const [feedOpen, setFeedOpen] = useState(true);
  const feedState = !feedVisible ? "none" : feedOpen ? "open" : "rail";

  // Sans jeton (hors démonstration), le shell n'est jamais monté : seul
  // l'écran de connexion est rendu, aucune requête authentifiée ne part.
  if (!token && !MOCK_MODE) return (
    <>
      {logoutForced ? (
        <p className="shell__error" role="alert" aria-live="assertive">
          Session distante encore active : la déconnexion locale ne l'a pas révoquée.
        </p>
      ) : null}
      <Suspense fallback={<ViewSkeleton />}>
        <LoginScreen onAuthenticated={onAuthenticated} />
      </Suspense>
    </>
  );

  return (
    <ExportProvider>
    <div className="shell" data-view={view}>
      <Button
        type="button"
        className="skip-link"
        label="Aller au contenu"
        onClick={() => mainRef.current?.focus()}
      />
      {MOCK_MODE ? (
        <Banner status="info" container="section" title="Mode démonstration, données simulées" />
      ) : null}

      <header className="rail">
        <div className="wordmark">
          <b>Radar Cyber</b>
          <span>Nouvelle-Aquitaine</span>
        </div>

        <TopNav
          className="rail__nav"
          label="Navigation principale"
          startContent={VIEW_ORDER.map((id) => (
            <TopNavItem
              key={id}
              label={VIEW_LABELS[id]}
              href={toHash({ ...urlState, view: id })}
              isSelected={view === id}
              aria-current={view === id ? "page" : undefined}
              onClick={(event) => { event.preventDefault(); navigate(id); }}
            >
              {id === "action" && unseenAlerts > 0 ? (
                <span className="rail__nav-label">
                  {VIEW_LABELS[id]}
                  <Badge variant="error" label={String(unseenAlerts)} />
                </span>
              ) : undefined}
            </TopNavItem>
          ))}
        />

        <span className="rail__spacer" />

        <Button label="Rechercher ⌘K" variant="ghost" size="sm" onClick={() => setPaletteOpen(true)} />
        <ExportMenu />

        <span className="rail__live" data-on={connected}>
          <i aria-hidden="true" />
          {connected ? "flux direct" : "flux interrompu"}
        </span>

        {token ? (
          <Button
            label={logoutState === "pending" ? "Déconnexion…" : "Déconnexion"}
            variant="ghost"
            size="sm"
            isDisabled={logoutState === "pending"}
            onClick={() => void onLogout()}
          />
        ) : null}
      </header>

      <Suspense fallback={null}>
      <LiveAlerts
        alerts={liveAlerts}
        unseen={unseenAlerts}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        onOpenAlerts={() => { navigate("action"); }}
        onDismiss={() => {
          setLiveAlerts([]);
          setUnseenAlerts(0);
        }}
      />
      </Suspense>

      {error ? <p className="shell__error" role="alert" aria-live="assertive">API : {error}</p> : null}
      {logoutState === "failed" ? (
        <div className="shell__error" role="alert" aria-live="assertive">
          <span>Session distante encore active : la révocation a échoué, vous restez connecté.</span>
          <Button label="Réessayer" variant="ghost" size="sm" onClick={() => void onLogout()} />
          <Button label="Se déconnecter quand même" variant="ghost" size="sm" onClick={() => finishLogout(true)} />
        </div>
      ) : null}
      {/* Offline first: the cache age replaces the live claim; an API error
          with no offline event still reports stale snapshot data. */}
      {offline ? (() => {
        const statut = offlineStatus(offlineAt ?? instantane?.at ?? null, horloge);
        return <p className="shell__offline" data-etat={statut.state} role="status" aria-live="polite">{statut.label}</p>;
      })() : null}
      {!offline && error && instantaneData ? (
        <p className="shell__offline" data-etat={instantaneData.etat} role="status" aria-live="polite">
          {instantaneData.libelle}
          {instantaneData.etat === "perime" ? " — carte figée sur la dernière réponse reçue" : null}
        </p>
      ) : null}

      <div
        className="shell__body"
        data-feed={feedState}
        data-inspector={inspectorOpen ? "open" : "closed"}
      >
        {!feedVisible ? null : feedOpen ? (
        <aside className="shell__feed">
            <button
              type="button"
              className="shell__feed-collapse"
              onClick={() => setFeedOpen(false)}
              aria-label="Replier le fil d'événements"
              title="Replier le fil"
            >
              ‹
            </button>
            <div className="family-filter" role="group" aria-label="Périmètre du fil">
              <span className="family-filter__label">Périmètre</span>
              <button
                type="button"
                className="family-filter__btn"
                aria-pressed={portee === "region"}
                onClick={() => { setPortee("region"); setRegionalFirst(true); }}
              >
                <span>Région</span>
              </button>
              <button
                type="button"
                className="family-filter__btn"
                aria-pressed={portee === "toutes"}
                onClick={() => { setPortee("toutes"); setRegionalFirst(false); }}
              >
                <span>Tout</span>
              </button>
              <button
                type="button"
                className="family-filter__btn"
                aria-pressed={portee === "vulnerabilites"}
                onClick={() => { setPortee("vulnerabilites"); setRegionalFirst(false); }}
                title="Bulletins de vulnérabilités : 87 % du flux brut, sans événement régional"
              >
                <span>Vulnérabilités</span>
              </button>
            </div>
            <Suspense fallback={<ViewSkeleton />}>
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
                onRetry={recharger}
              />
            </Suspense>
        </aside>
        ) : (
          <button
            type="button"
            className="shell__feed-rail"
            onClick={() => setFeedOpen(true)}
            aria-label="Déployer le fil d'événements"
            title="Déployer le fil"
          >
            Fil
          </button>
        )}

        <main className="shell__stage" id="main" ref={mainRef} tabIndex={-1}>
          <Suspense fallback={<ViewSkeleton />}>
          {view === "map" ? (
            <MapWorkspace
              orgs={orgs}
              events={events}
              loading={loading}
              error={error}
              onRetry={recharger}
              flows={flows}
              basemap={basemap}
              onBasemapChange={setBasemap}
              mapBuckets={mapBuckets}
              mapBucket={mapBucket}
              onMapBucketChange={setMapBucket}
              mapEvents={mapEvents}
              mapTotal={mapTotal}
              mapLoading={mapLoading}
              family={family}
              onFamily={setFamily}
              onOpenOrg={openOrgSheet}
              onOpenEvent={openEventInspector}
              initialPanel={urlState.mapPanel}
              onPanelChange={setMapPanel}
              coverage={{ data: couvertureData, loading: couvertureLoading, error: couvertureError }}
              regional={{
                overview: naOverview, fil: naFil, dept: urlState.naDept,
                onSelectDept: setNaDept, loading, error,
              }}
              affected={{
                report: affectedReport, loading: affectedLoading, error: affectedError,
                query: affectedQuery, onQueryChange: setAffectedQuery, onSubmit: onAffectedSubmit,
              }}
              graph={{ graph, temporal: temporalGraph, eventsById, orgsById, sourcesById }}
              directory={{
                urlState: urlState.directory, onUrlStateChange: onDirectoryStateChange,
                onCopyLink: copyDirectoryLink, server: !MOCK_MODE,
              }}
              attributions={{ data: attributionsData, loading: attributionsLoading, error: attributionsError }}
            />
          ) : null}

          {view === "action" ? (
            <ActionWorkspace
              initialTab={urlState.actionTab}
              onTabChange={setActionTab}
              canWrite={Boolean(token)}
              server={!MOCK_MODE}
              onUnauthorized={onUnauthorized}
              onOpenEvent={openEventInspector}
              onOpenOrg={openOrgSheet}
              refreshSignal={alertSignal}
              urlState={urlState.review}
              onUrlStateChange={onReviewStateChange}
            />
          ) : null}

          {view === "sources" ? (
            <SourcesWorkspace
              sources={sources}
              loading={loading}
              error={error}
              onRetry={recharger}
              metrics={collecteMetrics}
              metricsLoading={metricsLoading}
              metricsError={metricsError}
              healthDetail={healthDetail}
              healthCauses={healthCauses}
              healthLoading={loading}
              healthError={error}
              corpusData={corpusData}
              corpusLoading={corpusLoading}
              corpusError={corpusError}
              initialTab={urlState.sourcesTab}
              onTabChange={setSourcesTab}
            />
          ) : null}

          {view === "journal" ? (
            <JournalWorkspace
              tab={urlState.journalTab}
              onTabChange={setJournalTab}
              onUnauthorized={onUnauthorized}
            />
          ) : null}
          </Suspense>
        </main>

        {inspectorOpen ? (
          <section className="shell__inspect">
            <Suspense fallback={<ViewSkeleton />}>
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
            </Suspense>
          </section>
        ) : null}
      </div>

      <Suspense fallback={null}>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenOrg={openOrgSheet}
        onOpenEvent={openEventInspector}
        mock={MOCK_MODE ? { orgs, events } : null}
      />
      </Suspense>
    </div>
    </ExportProvider>
  );
}
