import { useEffect, useMemo, useState } from "react";
import { api, type Event, type Org, type Source, type Stats, type Graph } from "./api";
import { mockData } from "./mock";

// Mode démonstration : données simulées, jamais d'appel API.
const MOCK_MODE = import.meta.env.VITE_DATA_MODE === "mock";
import Map3D from "./map/Map3D";
import GraphView from "./graph/GraphView";
import SourcesView from "./components/SourcesView";

const FAMILY_COLOR: Record<string, string> = {
  ransomware: "var(--ransomware)",
  vuln: "var(--vuln)",
  phishing: "var(--phishing)",
  malware: "var(--malware)",
  cert_fr: "var(--cert)",
  cert: "var(--cert)",
  typosquat: "var(--typosquat)",
  reputation: "var(--reputation)",
  cti: "var(--cti)",
};

const ASSERTION_LABEL: Record<string, string> = {
  confirmed_incident: "incident confirmé",
  third_party_claim: "revendication",
  technical_indicator: "indicateur",
  suggested_relation: "relation suggérée",
  ambient_signal: "signal d'ambiance",
};

const ASSERTION_TONE: Record<string, string> = {
  confirmed_incident: "confirmed",
  third_party_claim: "claim",
  technical_indicator: "indicator",
  suggested_relation: "indicator",
  ambient_signal: "ambient",
};

type View = "carte" | "graphe" | "sources";

export default function App() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [graph, setGraph] = useState<Graph>({ nodes: [], links: [] });
  const [view, setView] = useState<View>("carte");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>("observatoire");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Temps réel : le serveur pousse les nouveaux événements (SSE).
  useEffect(() => {
    const stream = new EventSource("/api/stream");
    stream.addEventListener("new", (ev) => {
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
      return;
    }
    Promise.all([api.orgs(), api.events(200), api.sources(), api.stats(), api.graph(90)])
      .then(([o, e, s, st, g]) => {
        setOrgs(o);
        setEvents(e);
        setSources(s);
        setStats(st);
        setGraph(g);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  // Rafraîchit statistiques et graphe toutes les 30 s (temps réel, hors mode mock).
  useEffect(() => {
    if (MOCK_MODE) return;
    const timer = setInterval(() => {
      api.stats().then(setStats).catch(() => {});
      api.graph(90).then(setGraph).catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const selectedOrg = useMemo(
    () => (selected?.startsWith("org:") ? orgs.find((o) => String(o.id) === selected.slice(4)) : undefined),
    [selected, orgs]
  );

  return (
    <div className="app">
      <div className="mock-banner" data-active={MOCK_MODE}>
        données simulées — démonstration
      </div>
      <header className="topbar">
        <div className="wordmark">
          <strong>Radar Cyber</strong>
          <span>Nouvelle-Aquitaine</span>
        </div>
        <nav className="nav">
          <button aria-current={view === "carte"} onClick={() => setView("carte")}>carte</button>
          <button aria-current={view === "graphe"} onClick={() => setView("graphe")}>graphe</button>
          <button aria-current={view === "sources"} onClick={() => setView("sources")}>sources</button>
        </nav>
        <select className="theme-picker" value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="variante de design">
          <option value="observatoire">observatoire</option>
          <option value="terminal">terminal</option>
          <option value="souverain">souverain</option>
          <option value="clair">clair</option>
        </select>
        <div className="status">
          <span className="dot" />
          <span>
            <b>{stats?.orgs ?? orgs.length}</b> organisations
          </span>
          <span>
            <b>{stats?.events ?? events.length}</b> événements
          </span>
          <span>
            <b>{stats ? stats.indicators.toLocaleString("fr-FR") : "—"}</b> indicateurs
          </span>
          <span>
            <b>{stats?.sources.ok ?? 0}</b>/{stats?.sources.total ?? sources.length} sources
          </span>
        </div>
      </header>

      {error && <div className="failed">API indisponible : {error}</div>}

      {view === "sources" ? (
        <SourcesView sources={sources} />
      ) : (
        <main className="workspace">
          <aside className="panel">
            <h2>fil d'événements</h2>
            <ul className="feed-list">
              {events.map((e) => (
                <li
                  key={e.dedupKey}
                  className="feed-item"
                  data-selected={selected === `org:${e.orgId}`}
                  onClick={() => setSelected(e.orgId ? `org:${e.orgId}` : null)}
                >
                  <span className="swatch" style={{ background: FAMILY_COLOR[e.family] ?? "var(--cti)" }} />
                  <div>
                    <p>{e.title}</p>
                    <small>
                      <span className="badge" data-tone={ASSERTION_TONE[e.assertionType]}>
                        {ASSERTION_LABEL[e.assertionType] ?? e.assertionType}
                      </span>{" "}
                      {e.sourceId}
                      {e.observedAt ? ` ${new Date(e.observedAt).toLocaleDateString("fr-FR")}` : ""}
                    </small>
                  </div>
                </li>
              ))}
              {events.length === 0 && !error && <li className="hint">Aucun événement.</li>}
            </ul>
          </aside>

          <section className="stage">
            {view === "carte" ? (
              <Map3D
                orgs={orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug, kind: o.kind, city: o.city, lat: o.lat, lon: o.lon }))}
                events={events.map((e) => ({
                  id: String(e.id),
                  title: e.title,
                  family: e.family,
                  assertionType: e.assertionType,
                  orgId: e.orgId,
                  lat: e.lat,
                  lon: e.lon,
                }))}
                onSelect={setSelected}
              />
            ) : (
              <GraphView nodes={graph.nodes} links={graph.links} onSelect={setSelected} />
            )}
          </section>

          <aside className="panel inspector">
            {selectedOrg ? (
              <>
                <h2>{selectedOrg.name}</h2>
                <dl className="kv">
                  <dt>type</dt>
                  <dd>{selectedOrg.kind}</dd>
                  <dt>secteur</dt>
                  <dd>{selectedOrg.sector ?? "—"}</dd>
                  <dt>territoire</dt>
                  <dd>
                    {selectedOrg.city ?? "—"} ({selectedOrg.dept ?? "—"})
                  </dd>
                  <dt>événements</dt>
                  <dd>{selectedOrg.eventCount}</dd>
                </dl>
              </>
            ) : (
              <p className="empty">Sélectionnez une organisation sur la carte ou dans le fil.</p>
            )}
          </aside>
        </main>
      )}
    </div>
  );
}
