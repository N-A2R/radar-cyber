import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Card, Layout, Segmented, Table } from "antd";
import { api, type Event, type Org, type Source, type Stats, type Graph, type FlowArc } from "./api";
import { mockData } from "./mock";
import { t } from "./i18n";
// Mode démonstration : données simulées, jamais d'appel API.
const MOCK_MODE = import.meta.env.VITE_DATA_MODE === "mock";
import Map3D from "./map/Map3D";
import GraphView from "./graph/GraphView";
import SourcesView from "./components/SourcesView";
import HealthView from "./components/HealthView";
import EventList from "./components/EventList";
import FamilyFilter from "./components/FamilyFilter";
import KpiBand, { type KpiItem } from "./components/KpiBand";
import EventTicker from "./components/EventTicker";
import MapLegend from "./components/MapLegend";
import StatusBar from "./components/StatusBar";
import TimelineScrubber, { type TimelineRange } from "./components/TimelineScrubber";
import AlertsView from "./components/AlertsView";
import "./components/chrome.css";

type View = "carte" | "graphe" | "sources" | "sante" | "alertes";

const PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const VIEWS: { id: View; label: string }[] = [
  { id: "carte", label: t("nav.map") },
  { id: "graphe", label: t("nav.graph") },
  { id: "sources", label: t("nav.sources") },
  { id: "sante", label: t("nav.health") },
  { id: "alertes", label: t("nav.alerts") },
];

export default function App() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [graph, setGraph] = useState<Graph>({ nodes: [], links: [] });
  const [flows, setFlows] = useState<FlowArc[]>([]);
  const [view, setView] = useState<View>("carte");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>("observatoire");
  const [basemap, setBasemap] = useState<"sat" | "plan">("sat");
  const [families, setFamilies] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [connected, setConnected] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date>(() => new Date());
  // Plage temporelle : sept jours en arrière, un jour de marge en avant pour que
  // les événements poussés en SSE restent visibles.
  const [range, setRange] = useState<TimelineRange>(() => ({
    from: new Date(Date.now() - 7 * DAY_MS),
    to: new Date(Date.now() + DAY_MS),
  }));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Temps réel : le serveur pousse les nouveaux événements (SSE).
  useEffect(() => {
    const stream = new EventSource("/api/stream");
    stream.onopen = () => setConnected(true);
    stream.onerror = () => setConnected(false);
    stream.addEventListener("new", (ev) => {
      setConnected(true);
      try {
        const row = JSON.parse((ev as MessageEvent).data) as Record<string, unknown>;
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
        };
        setEvents((prev) => [event, ...prev].slice(0, 300));
      } catch {
        // Charge utile illisible : on ignore le message plutôt que de casser le flux.
      }
    });
    return () => stream.close();
  }, []);

  useEffect(() => {
    if (MOCK_MODE) {
      setOrgs(mockData.orgs);
      setEvents(mockData.events);
      setSources(mockData.sources);
      setStats(mockData.stats);
      setGraph(mockData.graph);
      setUpdatedAt(new Date());
      return;
    }
    // Les arcs réels (org → point d'hébergement) sont rares ; si aucun n'existe,
    // on retombe sur le mode « orgs » (org → centroïde départemental) pour que la
    // carte ne reste jamais vide.
    const loadFlows = async () => {
      const arcs = await api.flows(30);
      if (arcs.arcs.length > 0) return arcs.arcs;
      const fallback = await api.flows(30, 300, "orgs");
      return fallback.arcs;
    };
    Promise.all([api.orgs(), api.events(200), api.sources(), api.stats(), api.graph(90)])
      .then(([o, e, s, st, g]) => {
        setOrgs(o);
        setEvents(e);
        setSources(s);
        setStats(st);
        setGraph(g);
        setUpdatedAt(new Date());
        return loadFlows();
      })
      .then((arcs) => setFlows(arcs))
      .catch((err: Error) => setError(err.message));
  }, []);

  // Rafraîchit statistiques, graphe et arcs toutes les 30 s (temps réel, hors mode mock).
  useEffect(() => {
    if (MOCK_MODE) return;
    const timer = setInterval(() => {
      api.stats().then((next) => {
        setStats(next);
        setUpdatedAt(new Date());
      }).catch(() => {});
      api.graph(90).then(setGraph).catch(() => {});
      api.flows(30).then((f) => setFlows(f.arcs)).catch(() => {});
      api.flows(30, 300, "orgs").then((f) => {
        setFlows((prev) => (prev.length > 0 ? prev : f.arcs));
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Filtre temporel : les événements sans date restent visibles (ils ne peuvent
  // pas être placés sur la frise, mais restent pertinents dans le fil).
  const inRange = useMemo(() => {
    const from = range.from.getTime();
    const to = range.to.getTime();
    return events.filter((e) => {
      if (!e.observedAt) return true;
      const ms = Date.parse(e.observedAt);
      if (Number.isNaN(ms)) return true;
      return ms >= from && ms <= to;
    });
  }, [events, range]);

  const filtered = useMemo(
    () => (families.size === 0 ? inRange : inRange.filter((e) => families.has(e.family))),
    [inRange, families],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.family] = (c[e.family] ?? 0) + 1;
    return c;
  }, [events]);

  const pageEvents = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const sourcesById = useMemo(() => {
    const m: Record<string, { name: string; family: string; url: string }> = {};
    for (const s of sources) m[String(s.id)] = { name: s.name, family: s.family, url: s.url };
    return m;
  }, [sources]);

  const orgsById = useMemo(() => {
    const m: Record<string, { kind: string; city: string | null; dept: string | null }> = {};
    for (const o of orgs) m[String(o.id)] = { kind: o.kind, city: o.city, dept: o.dept };
    return m;
  }, [orgs]);

  const eventsById = useMemo(() => {
    const m: Record<string, { title: string; family: string; severity: number; observedAt: string | null; sourceId: string; assertionType: string }> = {};
    for (const e of events) {
      m[String(e.id)] = {
        title: e.title,
        family: e.family,
        severity: e.severity,
        observedAt: e.observedAt ?? null,
        sourceId: e.sourceId,
        assertionType: e.assertionType,
      };
    }
    return m;
  }, [events]);

  const selectedOrg = useMemo(
    () => (selected?.startsWith("org:") ? orgs.find((o) => String(o.id) === selected.slice(4)) : undefined),
    [selected, orgs],
  );

  // Indicateurs de la bande KPI : volume, périmètre, fraîcheur.
  const kpis = useMemo<KpiItem[]>(() => {
    const depts = new Set<string>();
    for (const o of orgs) if (o.dept) depts.add(o.dept);
    const since = Date.now() - DAY_MS;
    const recent = events.filter((e) => e.observedAt != null && Date.parse(e.observedAt) >= since).length;
    const active = stats?.sources.active ?? sources.filter((s) => s.enabled).length;
    const total = stats?.sources.total ?? sources.length;
    return [
      { label: t("kpi.orgs"), value: stats?.orgs ?? orgs.length, state: `${depts.size} dept` },
      { label: t("kpi.events"), value: stats?.events ?? events.length, state: `+${recent} / 24 h` },
      { label: t("kpi.indicators"), value: stats?.indicators ?? 0, state: "90 d" },
      { label: t("kpi.sources"), value: active, state: `/ ${total}` },
    ];
  }, [orgs, events, sources, stats]);

  const tickerEvents = useMemo(
    () => filtered.slice(0, 14).map((e) => ({ id: String(e.id), title: e.title, severity: e.severity })),
    [filtered],
  );

  const toggleFamily = (family: string) => {
    const next = new Set(families);
    if (next.has(family)) next.delete(family);
    else next.add(family);
    setFamilies(next);
    setPage(1);
  };

  return (
    <Layout className="app" style={{ minHeight: "100vh" }}>
      <div className="mock-banner" data-active={MOCK_MODE}>
        {t("mock")}
      </div>
      <Layout.Header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="wordmark">
          <b>RADAR CYBER</b>
          <span>Nouvelle-Aquitaine</span>
        </div>
        <Segmented
          options={VIEWS.map((v) => ({ label: v.label, value: v.id }))}
          value={view}
          onChange={(v) => setView(v as View)}
        />
        <span style={{ flex: 1 }} />
        <Badge dot status={connected ? "success" : "error"} text="live · sse" />
        <Segmented
          options={[{ label: "satellite", value: "sat" }, { label: "plan", value: "plan" }]}
          value={basemap}
          onChange={(v) => setBasemap(v as "sat" | "plan")}
        />
        <select className="theme-picker" value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="variante de design">
          <option value="observatoire">observatoire</option>
          <option value="terminal">terminal</option>
          <option value="souverain">souverain</option>
          <option value="clair">clair</option>
        </select>
      </Layout.Header>
      <KpiBand items={kpis} />
      <EventTicker events={tickerEvents} limit={14} />
      {error && <Alert type="error" message={`${t("error.api")} : ${error}`} showIcon />}
      {view === "alertes" ? (
        <Layout.Content style={{ padding: 12 }}>
          <Card><AlertsView /></Card>
        </Layout.Content>
      ) : view === "sante" ? (
        <Layout.Content style={{ padding: 12 }}>
          <Card><HealthView sources={sources} /></Card>
        </Layout.Content>
      ) : view === "sources" ? (
        <Layout.Content style={{ padding: 12 }}>
          <Card><SourcesView sources={sources} /></Card>
        </Layout.Content>
      ) : (
        <Layout.Content style={{ display: "flex", gap: 12, padding: 12 }}>
          <Card style={{ width: 360, overflow: "auto" }}>
            <EventList events={pageEvents} page={page} total={filtered.length} pageSize={PAGE_SIZE} sourcesById={sourcesById} onChange={setPage} filters={<FamilyFilter value={families} onChange={(next) => { setFamilies(next); setPage(1); }} counts={counts} />} />
            <Table dataSource={pageEvents.map((e) => ({ key: e.id, title: e.title }))} columns={[{ title: "title", dataIndex: "title" }]} size="small" pagination={false} />
            <TimelineScrubber events={events} range={range} onRangeChange={setRange} height={54} />
          </Card>
          <Card style={{ flex: 1, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }} styles={{ body: { flex: 1, display: "flex", flexDirection: "column", padding: 0, minHeight: 0 } }}>
            <section className="stage">
              <div className="stage__canvas">
                {view === "carte" ? (
                  <Map3D orgs={orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug, kind: o.kind, city: o.city, dept: o.dept, lat: o.lat, lon: o.lon }))} events={filtered.map((e) => ({ id: String(e.id), title: e.title, family: e.family, assertionType: e.assertionType, orgId: e.orgId, lat: e.lat, lon: e.lon, severity: e.severity, sourceId: e.sourceId, sourceUrl: e.sourceUrl, observedAt: e.observedAt, summary: e.summary }))} flows={flows} basemap={basemap} families={Array.from(families)} onSelect={setSelected} onSelectEvent={(id) => setSelected(id.startsWith("org:") ? id : null)} />
                ) : (
                  <GraphView nodes={graph.nodes} links={graph.links} eventsById={eventsById} orgsById={orgsById} sourcesById={sourcesById} onSelect={setSelected} theme={theme} />
                )}
              </div>
              {view === "carte" ? <MapLegend counts={counts} active={Array.from(families)} onToggle={toggleFamily} /> : null}
            </section>
          </Card>
          <Card style={{ width: 280 }}>
            <span className="micro">{t("inspector")}</span>
            {selectedOrg ? (
              <div>
                <h2>{selectedOrg.name}</h2>
                <div>{selectedOrg.kind} · {selectedOrg.dept ?? "—"}</div>
              </div>
            ) : (
              <p className="empty">{t("empty.inspect")}</p>
            )}
          </Card>
        </Layout.Content>
      )}
      <Layout.Footer>
        <StatusBar connected={connected} sourcesActive={stats?.sources.active ?? sources.filter((s) => s.enabled).length} sourcesTotal={stats?.sources.total ?? sources.length} updatedAt={updatedAt} note={`radar-cyber · na · ${updatedAt.toISOString().slice(0, 10)}`} />
      </Layout.Footer>
    </Layout>
  );
}
