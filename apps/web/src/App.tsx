import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { creerMemoire, etatDonnees, type Instantane } from "./offline";
import { api, clearAuthToken, getAffected, getAuthToken, setAuthToken, type AffectedReport, type CollecteMetrics, type CouvertureResponse, type CorpusStats, type DeptStat, type Event, type FlowArc, type Graph, type HealthCauses, type HealthDetail, type LiveAlert, type NaFil, type NaOverview, type Org, type Source, type Stats, type TodayResponse } from "./api";
import { mockData } from "./mock";
import MapLegend from "./components/MapLegend";
const Map3D = lazy(() => import("./map/Map3D"));
const GraphView = lazy(() => import("./graph/GraphView"));
const SourcesView = lazy(() => import("./components/SourcesView"));
const HealthView = lazy(() => import("./components/HealthView"));
const HealthDetailView = lazy(() => import("./components/HealthDetailView"));
const CollecteMetricsView = lazy(() => import("./components/CollecteMetricsView"));
const EventList = lazy(() => import("./components/EventList"));
const Inspector = lazy(() => import("./components/Inspector"));
const OrgSheet = lazy(() => import("./components/OrgSheet"));
const DirectoryView = lazy(() => import("./components/DirectoryView"));
const CommandPalette = lazy(() => import("./components/CommandPalette"));
import LiveAlerts, { addLiveAlert, connectLiveAlerts } from "./components/LiveAlerts";
const ReviewView = lazy(() => import("./components/ReviewView"));
const JournalView = lazy(() => import("./components/JournalView"));
const DossierView = lazy(() => import("./components/DossierView"));
const NaView = lazy(() => import("./components/NaView"));
const TodayView = lazy(() => import("./components/TodayView"));
const CouvertureView = lazy(() => import("./components/CouvertureView"));
const AlertsView = lazy(() => import("./components/AlertsView"));
const LoginScreen = lazy(() => import("./components/LoginScreen"));
const CorpusView = lazy(() => import("./components/CorpusView"));
const AffectedView = lazy(() => import("./components/AffectedView"));
import type { ViewKey } from "./contracts";
import { parseHash, toHash, shareableUrl, type AppUrlState } from "./url-state";

// Chaque écran chargé à la demande garde sa place dans le shell : le
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

const VIEWS: { id: ViewKey; label: string }[] = [
  { id: "today", label: "Aujourd'hui" },
  { id: "coverage", label: "Couverture" },
  { id: "review", label: "Revue" },
  { id: "journal", label: "Journal" },
  { id: "corpus", label: "Corpus" },
  { id: "sources", label: "Sources" },
  { id: "map", label: "Carte" },
  { id: "graph", label: "Graphe" },
  { id: "health", label: "Santé" },
  { id: "alerts", label: "Alertes" },
  { id: "na", label: "Nouvelle-Aquitaine" },
  { id: "affected", label: "Suis-je concerné ?" },
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
  const [healthDetail, setHealthDetail] = useState<HealthDetail | null>(null);
  const [healthCauses, setHealthCauses] = useState<HealthCauses | null>(null);
  const [collecteMetrics, setCollecteMetrics] = useState<CollecteMetrics | null>(null);
  const [naOverview, setNaOverview] = useState<NaOverview | null>(null);
  const [naFil, setNaFil] = useState<NaFil | null>(null);
  const [todayData, setTodayData] = useState<TodayResponse | null>(null);
  const [todayLoading, setTodayLoading] = useState(!MOCK_MODE);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [couvertureData, setCouvertureData] = useState<CouvertureResponse | null>(null);
  const [couvertureLoading, setCouvertureLoading] = useState(false);
  const [couvertureError, setCouvertureError] = useState<string | null>(null);
  const [corpusData, setCorpusData] = useState<CorpusStats | null>(null);
  const [corpusLoading, setCorpusLoading] = useState(false);
  const [corpusError, setCorpusError] = useState<string | null>(null);
  // "Am I affected?" is a user action: one request per Check, never on view load.
  const [affectedReport, setAffectedReport] = useState<AffectedReport | null>(null);
  const [affectedLoading, setAffectedLoading] = useState(false);
  const [affectedError, setAffectedError] = useState<string | null>(null);
  const [affectedQuery, setAffectedQuery] = useState("");
  const [statsDepartements, setStatsDepartements] = useState<DeptStat[]>([]);
  const [graph, setGraph] = useState<Graph>({ nodes: [], links: [] });
  const [temporalGraph, setTemporalGraph] = useState<Graph | null>(null);
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
  const [loading, setLoading] = useState(!MOCK_MODE);
  const [reloadSignal, setReloadSignal] = useState(0);
  const recharger = useCallback(() => setReloadSignal((n) => n + 1), []);
  const [family, setFamily] = useState<string | null>(null);
  // Ordre du fil : « régional d'abord » par défaut, « tout » = ordre de l'API.
  const [regionalFirst, setRegionalFirst] = useState(true);
  /**
   * Ce que le fil montre : la région (défaut), tout, ou la veille CVE.
   * Le fil par défaut ne affichait 19 000 lignes dont 87 % de bulletins de
   * vulnérabilités et aucune ne concernait la région.
   */
  const [portee, setPortee] = useState<"region" | "toutes" | "vulnerabilites">("region");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const sheetOrgId = urlState.org;
  const setSheetOrgId = useCallback((id: number | null) => {
    setUrlState((prev) => (prev.org === id ? prev : { ...prev, org: id }));
  }, []);
  const [connected, setConnected] = useState(false);
  // Le fond par défaut est le plan sombre : l'imagerie satellite est superbe
  // mais elle occupe l'œil, et la densité du référentiel comme les pastilles
  // de regroupement ne se lisent plus dessus. C'est un mode de détail.
  const [basemap, setBasemap] = useState<"sat" | "plan">("plan");
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
    const stream = connectLiveAlerts({ token: getAuthToken(), onConnection: setConnected, onAlert: (a) => {
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
        // Le flux direct doit respecter la portée choisie : sinon les
        // bulletins CVE arrivent en continu et noient le fil filtré.
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
    // événements, sources et statistiques n'étaient jamais posés en état.
    const load = async () => {
      const labels = ["organisations", "événements", "sources", "statistiques", "graphe", "vue NA", "état détaillé", "causes des sources rouges", "supervision de la collecte", "graphe temporel"] as const;
      const results = await Promise.allSettled([
        api.orgs(),
        api.events(FEED_LIMIT, "regional", portee),
        api.sources(),
        api.stats(),
        api.graph(90),
        api.naOverview(),
        api.healthDetail(),
        api.healthCauses(),
        api.collecteMetrics(),
        api.graphTemporal(),
      ]);
      const [o, e, s, st, g, na, hd, hc, cm, tg] = results;
      if (o.status === "fulfilled") setOrgs(o.value);
      if (e.status === "fulfilled") setEvents(e.value);
      if (o.status === "fulfilled" && e.status === "fulfilled") {
        // On n'écrit l'instantané que si les deux moitiés de la carte sont là :
        // une carte avec des organisations et sans événements serait un état
        // qui n'a jamais existé.
        const at = Date.now();
        memoire.ecrire("carte", { orgs: o.value, events: e.value }, at);
        setInstantane({ at, data: { orgs: o.value, events: e.value } });
      }
      if (s.status === "fulfilled") setSources(s.value);
      if (st.status === "fulfilled") setStats(st.value);
      if (g.status === "fulfilled") setGraph(g.value);
      if (na.status === "fulfilled") setNaOverview(na.value);
      if (hd.status === "fulfilled") setHealthDetail(hd.value);
      if (hc.status === "fulfilled") setHealthCauses(hc.value);
      if (cm.status === "fulfilled") setCollecteMetrics(cm.value);
      if (tg.status === "fulfilled") setTemporalGraph(tg.value);
      const failed = results.flatMap((r, i) => (r.status === "rejected" ? [labels[i]] : []));
      setError(failed.length > 0 ? `indisponible : ${failed.join(", ")}` : null);
      setLoading(false);
      const arcs = await loadFlows().catch(() => []);
      setFlows(arcs);
    };
    void load();
  }, [loadFlows, token, portee, reloadSignal]);

  // Rafraîchit statistiques, graphe et arcs toutes les 30 s.
  useEffect(() => {
    if (MOCK_MODE || !token) return;
    const timer = setInterval(() => {
      api.stats().then(setStats).catch(() => {});
      api.graph(90).then(setGraph).catch(() => {});
      api.healthDetail().then(setHealthDetail).catch(() => {});
      api.healthCauses().then(setHealthCauses).catch(() => {});
      api.collecteMetrics().then(setCollecteMetrics).catch(() => {});
      api.naOverview().then(setNaOverview).catch(() => {});
      loadFlows().then(setFlows).catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [loadFlows, token]);

  // Le fil d'événements suit le filtre département (?naDept=) : rechargé à
  // chaque changement, et une org cliquée dans le fil n'efface pas le filtre —
  // elle ouvre la fiche, l'URL reste `#/na?naDept=NN`.
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

  // Écran d'accueil : un seul appel donne les compteurs et le fil. Les filtres
  // vivent dans l'URL, donc un lien partagé recharge exactement la même liste.
  useEffect(() => {
    if (MOCK_MODE || !token || view !== "today") return;
    const controller = new AbortController();
    const charger = () => {
      setTodayLoading(true);
      api
        .today({ family: urlState.today.family, dept: urlState.today.dept }, controller.signal)
        .then((donnees) => {
          setTodayData(donnees);
          setTodayError(null);
        })
        .catch((err: unknown) => {
          if (!controller.signal.aborted) {
            setTodayError(err instanceof Error ? err.message : "indisponible");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setTodayLoading(false);
        });
    };
    charger();
    const timer = setInterval(charger, 60_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [view, urlState.today.family, urlState.today.dept, token, reloadSignal]);

  // Corpus : lecture publique, indépendante du token et du fil d'événements.
  // Un appel à l'ouverture, puis toutes les minutes pour que la réponse à
  // « est-ce que mon corpus grossit ? » ne soit pas une mesure périmée.
  useEffect(() => {
    if (MOCK_MODE || view !== "corpus") return;
    const controller = new AbortController();
    const charger = () => {
      setCorpusLoading(true);
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
  }, [view]);

  // La liste des départements vient de l'agrégat serveur, pas du fil courant :
  // un filtre appliqué ne doit pas faire disparaître les autres départements.
  useEffect(() => {
    if (MOCK_MODE || !token || view !== "today") return;
    const controller = new AbortController();
    const charger = () => {
      api.statsDepartements(controller.signal)
        .then((reponse) => setStatsDepartements(reponse.departements))
        .catch(() => { /* le fil reste utilisable avec les dept du fil */ });
    };
    charger();
    const timer = setInterval(charger, 60_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [view, token]);

  // The coverage figure is a published measurement: one request when the view
  // is opened, aborted as soon as the user leaves it.
  useEffect(() => {
    if (view !== "coverage") return;
    const controller = new AbortController();
    setCouvertureLoading(true);
    setCouvertureError(null);
    api.couverture(controller.signal)
      .then(setCouvertureData)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setCouvertureError(err instanceof Error ? err.message : "unavailable");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCouvertureLoading(false);
      });
    return () => controller.abort();
  }, [view]);

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

  const onTodayFamily = useCallback((family: string | null) => {
    setUrlState((prev) => (prev.today.family === family ? prev : { ...prev, today: { ...prev.today, family } }));
  }, []);
  const onTodayDept = useCallback((dept: string | null) => {
    setUrlState((prev) => (prev.today.dept === dept ? prev : { ...prev, today: { ...prev.today, dept } }));
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
          setAffectedError(err instanceof Error ? err.message : "unavailable");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setAffectedLoading(false);
      });
  }, []);
  useEffect(() => () => affectedController.current?.abort(), []);


  const inspectorOpen =
    selectedEventId !== null || selectedOrgId !== null || sheetOrgId !== null;

  // Le fil occupe un tiers de la largeur sur tous les onglets. Sur Sources,
  // Santé ou Dossier — des vues qui ont besoin de toute la largeur — il se
  // replie en un rail de 44 px. La largeur des colonnes vit dans styles.css :
  // un style inline écrasait les media queries et laissait une colonne vide
  // de 352 px sous 1024 px.
  const [feedOpen, setFeedOpen] = useState(true);
  const feedState = view === "today" ? "none" : feedOpen ? "open" : "rail";

  // Sans jeton (hors démonstration), le shell n'est jamais monté : seul
  // l'écran de connexion est rendu, aucune requête authentifiée ne part.
  if (!token && !MOCK_MODE) return (
    <Suspense fallback={<ViewSkeleton />}>
      <LoginScreen onAuthenticated={onAuthenticated} />
    </Suspense>
  );

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      {MOCK_MODE ? <div className="shell__mock">Demo mode, simulated data</div> : null}

      <header className="rail">
        <div className="wordmark">
          <b>Radar Cyber</b>
          <span>Nouvelle-Aquitaine</span>
        </div>

        <nav className="rail__nav" aria-label="views">
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
                <span className="rail__badge" aria-label={`${unseenAlerts} unread alerts`}>{unseenAlerts}</span>
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
          Rechercher ⌘K
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
          {connected ? "flux direct" : "flux interrompu"}
        </span>

        {token ? (
          <button type="button" className="rail__toggle" onClick={onUnauthorized}>
            Déconnexion
          </button>
        ) : null}
      </header>

      <Suspense fallback={null}>
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
      </Suspense>

      {error ? <p className="shell__error" role="alert" aria-live="assertive">API : {error}</p> : null}
      {/* Hors ligne assumé : on dit l'âge des données plutôt que de faire
          croire à un temps réel qu'on n'a plus. */}
      {error && instantaneData ? (
        <p className="shell__offline" data-etat={instantaneData.etat} role="status" aria-live="polite">
          {instantaneData.libelle}
          {instantaneData.etat === "perime" ? " — map frozen on the last response received" : null}
        </p>
      ) : null}

      <div
        className="shell__body"
        data-feed={feedState}
        data-inspector={inspectorOpen ? "open" : "closed"}
      >
        {view === "today" ? null : feedOpen ? (
        <aside className="shell__feed">
            <button
              type="button"
              className="shell__feed-collapse"
              onClick={() => setFeedOpen(false)}
              aria-label="Collapse the event feed"
              title="Collapse feed"
            >
              ‹
            </button>
            <div className="family-filter" role="group" aria-label="Feed scope">
              <span className="family-filter__label">Scope</span>
              <button
                type="button"
                className="family-filter__btn"
                aria-pressed={portee === "region"}
                onClick={() => { setPortee("region"); setRegionalFirst(true); }}
              >
                <span>Region</span>
              </button>
              <button
                type="button"
                className="family-filter__btn"
                aria-pressed={portee === "toutes"}
                onClick={() => { setPortee("toutes"); setRegionalFirst(false); }}
              >
                <span>All</span>
              </button>
              <button
                type="button"
                className="family-filter__btn"
                aria-pressed={portee === "vulnerabilites"}
                onClick={() => { setPortee("vulnerabilites"); setRegionalFirst(false); }}
                title="Vulnerability bulletins: 87% of the raw feed, no regional event"
              >
                <span>Vulnerabilities</span>
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
            aria-label="Expand the event feed"
            title="Expand feed"
          >
            Feed
          </button>
        )}

        <main className="shell__stage" id="main">
          <Suspense fallback={<ViewSkeleton />}>
          {view === "today" ? (
            <TodayView
              data={todayData}
              loading={todayLoading}
              error={todayError}
              family={urlState.today.family}
              dept={urlState.today.dept}
              onFamily={onTodayFamily}
              onDept={onTodayDept}
              departements={statsDepartements}
              onRetry={recharger}
              onOpenOrg={openOrgSheet}
              onOpenEvent={(id) => {
                setSelectedEventId(id);
                setSelectedOrgId(null);
                setSheetOrgId(null);
              }}
            />
          ) : null}
          {view === "coverage" ? (
            <CouvertureView data={couvertureData} loading={couvertureLoading} error={couvertureError} />
          ) : null}
          {view === "map" ? (
            <div className="map-view">
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
              <MapLegend families={filtered.map((e) => e.family)} />
            </div>
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
              loading={loading}
              temporal={temporalGraph}
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
              onRetry={recharger}
            />
          ) : null}

          {view === "review" ? (
            <ReviewView
              canWrite={Boolean(token)}
              server={!MOCK_MODE}
              onUnauthorized={onUnauthorized}
              onOpenOrg={openOrgSheet}
              urlState={urlState.review}
              onUrlStateChange={onReviewStateChange}
            />
          ) : null}
          {view === "journal" ? <JournalView onUnauthorized={onUnauthorized} /> : null}

          {view === "corpus" ? (
            <CorpusView data={corpusData} loading={corpusLoading} error={corpusError} />
          ) : null}
          {view === "sources" ? <SourcesView sources={sources} loading={loading} error={error} onRetry={recharger} /> : null}

          {view === "health" ? (
            // Le stage est un item de grille en block : deux vues empilées n'y
            // tiennent pas. Ce conteneur donne à chacune sa place — le résumé
            // garde 40 % au plus, le tableau prend le reste et défile.
            <div className="health-ecran">
              <div className="health-ecran__resume">
                <HealthDetailView detail={healthDetail} causes={healthCauses} loading={loading} error={error} onRetry={recharger} />
              </div>
              <HealthView sources={sources} loading={loading} onRetry={recharger} />
            </div>
          ) : null}

          {view === "dossier" ? <DossierView /> : null}

          {view === "na" ? (
            <NaView
              orgs={orgs}
              overview={naOverview}
              fil={naFil}
              loading={loading}
              error={error}
              dept={urlState.naDept}
              onSelectDept={(d) => setUrlState((prev) => (prev.naDept === d ? prev : { ...prev, naDept: d }))}
              onOpenOrg={setSheetOrgId}
              onRetry={recharger}
            />
          ) : null}

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

          {view === "affected" ? (
            <AffectedView
              report={affectedReport}
              loading={affectedLoading}
              error={affectedError}
              query={affectedQuery}
              onQueryChange={setAffectedQuery}
              onSubmit={onAffectedSubmit}
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
        onOpenEvent={(id) => {
          setSelectedEventId(id);
          setSelectedOrgId(null);
          setSheetOrgId(null);
        }}
        mock={MOCK_MODE ? { orgs, events } : null}
      />
      </Suspense>
    </div>
  );
}
