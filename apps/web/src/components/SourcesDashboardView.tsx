/**
 * Écran Sources dashboard — état mesuré des sources, en anglais comme le
 * reste de l'interface. Composant purement présentatif : chaque chiffre vient
 * de `GET /api/sources/dashboard`, calculé en base à l'appel. Aucune valeur
 * par défaut, aucun pourcentage inventé, aucune agrégation dans le navigateur.
 */
import type { SourceRendement, SourcesDashboard } from "../api";
import type { SourcesDashboardViewProps } from "../contracts";
import "./sources-dashboard.css";
import { Badge } from "@astryxdesign/core/Badge";

const countFormat = new Intl.NumberFormat("en-GB");

export function formatCount(value: number): string {
  return countFormat.format(value);
}

/** Un rendement est un ratio (0,2 = 20 %). `null` : rien n'a été lu. */
export function formatYield(value: number | null): string {
  if (value === null) return "not measurable";
  return `${(value * 100).toFixed(1)}%`;
}

/** Durée cumulée réellement mesurée, avec son unité lisible. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const secondes = Math.round(ms / 1000);
  if (secondes < 60) return `${secondes} s`;
  const minutes = Math.floor(secondes / 60);
  const reste = secondes % 60;
  if (minutes < 60) return reste === 0 ? `${minutes} min` : `${minutes} min ${reste} s`;
  const heures = Math.floor(minutes / 60);
  const minutesRestantes = minutes % 60;
  return minutesRestantes === 0 ? `${heures} h` : `${heures} h ${minutesRestantes} min`;
}

const ETATS = [
  { key: "ok200", label: "OK 200", note: "Successful run in the last 7 days, under the slow threshold, with new output." },
  { key: "muette", label: "Silent", note: "Collected in the last 7 days and already produced events, but none in that window." },
  { key: "morte", label: "Dead", note: "Explicitly declared dead. This decision takes priority over every other state." },
  { key: "lente", label: "Slow", note: "Last successful run in the last 7 days exceeded the slow threshold." },
  { key: "dormante", label: "Dormant", note: "No successful run in the last 7 days — not proven healthy." },
] as const;

function etatsPanel(data: SourcesDashboard) {
  return (
    <section className="sdb__panel" aria-labelledby="sdb-states-title">
      <div className="sdb__panel-head">
        <h2 id="sdb-states-title">Sources by state</h2>
        <span className="sdb__meta">{formatCount(data.totalSources)} declared sources</span>
      </div>
      <dl className="sdb__states">
        {ETATS.map((etat) => (
          <div className="sdb__state" data-etat={etat.key} key={etat.key}>
            <dt>{etat.label}</dt>
            <dd>{formatCount(data.etats[etat.key])}</dd>
            <p>{etat.note}</p>
          </div>
        ))}
      </dl>
      <p className="sdb__note">
        The five states partition the declared sources: a source is counted once, never twice.
      </p>
    </section>
  );
}

function classement(data: SourcesDashboard, titre: string, id: string, lignes: SourceRendement[]) {
  return (
    <section className="sdb__panel" aria-labelledby={id}>
      <div className="sdb__panel-head">
        <h2 id={id}>{titre}</h2>
        <span className="sdb__meta">
          {formatCount(lignes.length)} of {data.limiteClassement} measured · last {data.fenetreRendementJours} days
        </span>
      </div>
      {lignes.length === 0 ? (
        <p className="sdb__empty">No source has produced a measurable yield in this window.</p>
      ) : (
        <table className="sdb__table">
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col" className="sdb__num">Entries</th>
              <th scope="col" className="sdb__num">Events</th>
              <th scope="col" className="sdb__num">Yield</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((source, index) => (
              <tr key={source.id}>
                <td>
                  <span className="sdb__rank">{index + 1}</span>
                  <span className="sdb__source-name">{source.name}</span>
                  <span className="sdb__source-family">{source.family}</span>
                </td>
                <td className="sdb__num">{formatCount(source.entrees)}</td>
                <td className="sdb__num">{formatCount(source.evenements)}</td>
                <td className="sdb__num sdb__yield">{formatYield(source.rendement)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="sdb__note">
        Yield = events retained over entries read, on the same window. “not measurable” means no entry was
        read — never 0 %.
      </p>
    </section>
  );
}

function evolutionPanel(data: SourcesDashboard) {
  const max = Math.max(1, ...data.evolution.map((jour) => jour.evenements));
  return (
    <section className="sdb__panel sdb__evolution" aria-labelledby="sdb-evolution-title">
      <div className="sdb__panel-head">
        <h2 id="sdb-evolution-title">Last {data.fenetreJours} days</h2>
        <span className="sdb__meta">UTC days, including today</span>
      </div>
      {data.evolution.length === 0 ? (
        <p className="sdb__empty">No daily measurement available.</p>
      ) : (
        <table className="sdb__table">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col" className="sdb__num">Events</th>
              <th scope="col" className="sdb__num">Entries</th>
              <th scope="col" className="sdb__num">Sources with events</th>
              <th scope="col">Volume</th>
            </tr>
          </thead>
          <tbody>
            {data.evolution.map((jour) => (
              <tr key={jour.date}>
                <td><time dateTime={jour.date}>{jour.date}</time></td>
                <td className="sdb__num">{formatCount(jour.evenements)}</td>
                <td className="sdb__num">{formatCount(jour.entrees)}</td>
                <td className="sdb__num">{formatCount(jour.sourcesActives)}</td>
                <td>
                  <span
                    className="sdb__bar"
                    role="img"
                    aria-label={`${jour.evenements} events on ${jour.date}`}
                  >
                    <span style={{ width: `${(jour.evenements / max) * 100}%` }} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="sdb__note">
        Days without events are measured zeros, not missing rows. Entries come from successful collector runs.
      </p>
    </section>
  );
}

function collectePanel(data: SourcesDashboard) {
  return (
    <section className="sdb__panel" aria-labelledby="sdb-collecte-title">
      <div className="sdb__panel-head">
        <h2 id="sdb-collecte-title">Total collection time</h2>
        <span className="sdb__meta">finished runs, last {data.fenetreJours} days</span>
      </div>
      <div className="sdb__duration">{formatDuration(data.collecte.dureeTotaleMs)}</div>
      <p className="sdb__duration-caption">
        {formatCount(data.collecte.dureeTotaleMs)} ms summed over {formatCount(data.collecte.runs)} finished runs.
      </p>
      <p className="sdb__note">
        This is cumulative collector time, not wall-clock time: concurrent runs overlap and are each counted.
      </p>
    </section>
  );
}

export default function SourcesDashboardView({ data, loading = false, error = null }: SourcesDashboardViewProps) {
  return (
    <div className="sdb">
      <header className="sdb__header">
        <span className="micro">Sources / dashboard</span>
        <Badge label="mesuré" className="sdb__badge" />
        <h1>Sources dashboard</h1>
        <p>What the collectors actually do — every figure comes from the sources dashboard endpoint.</p>
      </header>

      {error ? <p className="sdb__error" role="alert">Could not load the sources dashboard: {error}</p> : null}
      {data === null ? (
        <p className="sdb__state" role="status">
          {loading ? "Loading the sources dashboard…" : "Sources dashboard is not available in demo mode."}
        </p>
      ) : (
        <>
          {error ? <p className="sdb__stale" role="status">Showing the last successful snapshot.</p> : null}
          <div className="sdb__kpis">
            <div className="sdb__kpi">
              <span className="micro">Declared sources</span>
              <strong>{formatCount(data.totalSources)}</strong>
            </div>
            <div className="sdb__kpi">
              <span className="micro">Total collection time</span>
              <strong>{formatDuration(data.collecte.dureeTotaleMs)}</strong>
            </div>
          </div>
          {etatsPanel(data)}
          {collectePanel(data)}
          {evolutionPanel(data)}
          <div className="sdb__grid">
            {classement(data, "10 best sources by yield", "sdb-best-title", data.meilleures)}
            {classement(data, "10 worst sources by yield", "sdb-worst-title", data.pires)}
          </div>
          <footer className="sdb__footer">
            Source: <code>GET /api/sources/dashboard</code> · measured at {data.generatedAt} · states {data.fenetreJours} d ·
            yield {data.fenetreRendementJours} d · slow above {formatCount(data.seuilLenteMs)} ms · read-only, no estimated values.
          </footer>
        </>
      )}
    </div>
  );
}
