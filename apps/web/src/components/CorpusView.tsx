/**
 * Écran Corpus — état mesuré du corpus, en anglais comme le reste de
 * l'interface. Le composant est purement présentatif : toutes les valeurs
 * viennent de `GET /api/corpus/stats`, une seule requête, aucune donnée
 * simulée côté navigateur. Chaque chiffre est accompagné de sa définition.
 */
import type { CorpusDepartment, CorpusIncident, CorpusStats, PressOnlySummary } from "../api";
import "./corpus.css";

export type CorpusViewProps = {
  data: CorpusStats | null;
  loading?: boolean;
  error?: string | null;
  pressOnly?: PressOnlySummary | null;
  pressOnlyLoading?: boolean;
  pressOnlyError?: string | null;
};

/** Libellés anglais des familles présentes dans `source.family`. */
export const FAMILY_LABELS: Record<string, string> = {
  ransomware: "Ransomware",
  vuln: "Vulnerabilities",
  phishing: "Phishing",
  malware: "Malware",
  cert: "CERT",
  cert_fr: "CERT-FR",
  typosquat: "Typosquatting",
  reputation: "Reputation",
  cti: "Threat intel",
  presse: "Press",
  presse_cyber: "Cyber press",
  warninglist: "Warning lists",
  leaks: "Leaks",
  paste: "Paste sites",
};

const numberFormat = new Intl.NumberFormat("en-GB");

export function formatCount(value: number): string {
  return numberFormat.format(value);
}

/** Un pourcentage mesuré : jamais "0 %" quand le dénominateur est inconnu. */
export function formatPercent(value: number | null): string {
  if (value === null) return "not measurable";
  const digits = value > 0 && value < 1 ? 2 : 1;
  return `${value.toFixed(digits)}%`;
}

export function familyLabel(family: string): string {
  return FAMILY_LABELS[family] ?? family;
}

function signedCount(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatCount(Math.abs(value))}`;
}

function departmentBars(data: CorpusStats) {
  return (
    <section className="corpus__panel" aria-labelledby="corpus-sources-title">
      <div className="corpus__panel-head">
        <h2 id="corpus-sources-title">Sources by department</h2>
        <span className="corpus__panel-meta">
          {formatCount(data.totals.sources)} sources · {formatCount(data.totals.sourcesLocalised)} localised
        </span>
      </div>
      {data.byDepartment.length === 0 ? (
        <p className="corpus__empty">No sources recorded yet.</p>
      ) : (
        <div className="corpus__bars">
          {data.byDepartment.map((dept: CorpusDepartment) => {
            const slices = data.families
              .filter((family) => (dept.families[family] ?? 0) > 0)
              .map((family) => ({ family, count: dept.families[family] ?? 0 }));
            const detail = slices.map((slice) => `${familyLabel(slice.family)}: ${slice.count}`).join(", ");
            return (
              <div className="corpus__bar-row" key={dept.department || "unlocalised"}>
                <span className="corpus__bar-label" title={dept.department || undefined}>
                  {dept.label}
                  {dept.department ? <span className="corpus__dept-code">{dept.department}</span> : null}
                </span>
                <span
                  className="corpus__bar"
                  role="img"
                  aria-label={`${dept.label}: ${dept.total} sources. ${detail}`}
                >
                  {slices.map((slice) => (
                    <span
                      className="corpus__bar-segment"
                      data-family={slice.family}
                      key={slice.family}
                      style={{ width: `${(slice.count / dept.total) * 100}%` }}
                      title={`${familyLabel(slice.family)}: ${slice.count}`}
                    />
                  ))}
                </span>
                <span className="corpus__bar-total">{formatCount(dept.total)}</span>
              </div>
            );
          })}
          <div className="corpus__legend" aria-label="Source families">
            {data.families.map((family) => (
              <span className="corpus__legend-item" key={family}>
                <i className="corpus__swatch" data-family={family} aria-hidden="true" />
                {familyLabel(family)}
              </span>
            ))}
          </div>
          <p className="corpus__note">
            A source counts in a department only when its identifier, name, URL or description gives one
            unambiguous department. National and ambiguous sources appear as “Not localised” — never as
            zero, never assigned by guesswork.
          </p>
        </div>
      )}
    </section>
  );
}

function domainGauge(data: CorpusStats) {
  const coverage = data.domainCoverage;
  const percent = coverage.percent ?? 0;
  return (
    <section className="corpus__panel" aria-labelledby="corpus-domains-title">
      <div className="corpus__panel-head">
        <h2 id="corpus-domains-title">Organisations with a domain</h2>
        <span className="corpus__panel-meta">reference directory</span>
      </div>
      <div className="corpus__gauge-value">{formatPercent(coverage.percent)}</div>
      <div
        className="corpus__gauge"
        role="progressbar"
        aria-label="Share of organisations with a verified domain"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${formatCount(coverage.withDomain)} of ${formatCount(coverage.organisations)} organisations`}
      >
        <span className="corpus__gauge-fill" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
      <p className="corpus__gauge-caption">
        <strong>{formatCount(coverage.withDomain)}</strong> of {formatCount(coverage.organisations)} organisations
        carry a non-empty domain.
      </p>
      <p className="corpus__note">
        The directory is much larger than the incident corpus: this gauge measures domain coverage in the
        directory, not the share of corpus organisations.
      </p>
    </section>
  );
}

function growthCard(data: CorpusStats) {
  const growth = data.sinceLastReport;
  const rising = growth.change > 0;
  const falling = growth.change < 0;
  return (
    <section className="corpus__panel corpus__growth" aria-labelledby="corpus-growth-title">
      <div className="corpus__panel-head">
        <h2 id="corpus-growth-title">Is the corpus growing?</h2>
        <span className="corpus__panel-meta">since the last {growth.windowHours} h report</span>
      </div>
      <div className="corpus__growth-value" data-trend={rising ? "up" : falling ? "down" : "flat"}>
        {signedCount(growth.newEvents)}
      </div>
      <p className="corpus__growth-caption">events ingested in the last {growth.windowHours} hours</p>
      <p className="corpus__growth-compare">
        Versus {formatCount(growth.previousEvents)} in the {growth.comparedTo}:{" "}
        <strong>{signedCount(growth.change)}</strong>
        {growth.percentChange === null
          ? " · no percentage available (empty comparison window)"
          : ` · ${growth.percentChange > 0 ? "+" : growth.percentChange < 0 ? "−" : ""}${formatPercent(Math.abs(growth.percentChange))}`}
      </p>
      <p className="corpus__note">
        Growth counts events by collection time (<code>event.collected_at</code>). It measures ingestion into
        the corpus, not the date the incident happened.
      </p>
    </section>
  );
}

function incidentRow(incident: CorpusIncident) {
  return (
    <li className="corpus__incident" key={incident.id}>
      <time className="corpus__incident-date" dateTime={incident.date ?? undefined}>
        {incident.date ?? "date unknown"}
      </time>
      <span className="corpus__incident-main">
        <span className="corpus__incident-title">{incident.title}</span>
        <span className="corpus__incident-meta">
          {incident.organisation ?? "organisation unknown"}
          {incident.department ? ` · ${incident.department}` : ""}
          {" · "}
          {familyLabel(incident.type)}
        </span>
      </span>
      {incident.sourceUrl ? (
        <a className="corpus__incident-source" href={incident.sourceUrl} target="_blank" rel="noopener noreferrer">
          {incident.sourceName} <span aria-hidden="true">↗</span>
        </a>
      ) : (
        <span className="corpus__incident-source corpus__incident-source--missing">source link unavailable</span>
      )}
    </li>
  );
}

function recentIncidents(data: CorpusStats) {
  return (
    <section className="corpus__panel corpus__incidents" aria-labelledby="corpus-incidents-title">
      <div className="corpus__panel-head">
        <h2 id="corpus-incidents-title">20 most recent corpus incidents</h2>
        <span className="corpus__panel-meta">
          {formatCount(data.totals.incidents)} incidents in the corpus
        </span>
      </div>
      {data.recentIncidents.length === 0 ? (
        <p className="corpus__empty">No incidents in the corpus yet.</p>
      ) : (
        <ol className="corpus__incident-list">
          {data.recentIncidents.map(incidentRow)}
        </ol>
      )}
      <p className="corpus__note">
        An incident is a confirmed incident or a third-party claim. Technical indicators and ambient signals
        are excluded. The source link opens the stored evidence URL, or the source home page when no evidence
        URL was recorded.
      </p>
    </section>
  );
}

function pressOnlyPanel(summary: PressOnlySummary) {
  return (
    <section className="corpus__panel corpus__press-only" aria-labelledby="corpus-press-only-title">
      <div className="corpus__panel-head">
        <h2 id="corpus-press-only-title">Press-only incidents</h2>
        <span className="corpus__panel-meta">{summary.scope}</span>
      </div>
      <p className="press-only__count">{formatCount(summary.count)}</p>
      <p className="corpus__growth-caption">
        of {formatCount(summary.corpusTotal)} corpus incidents reported by the press alone
      </p>
      <p className="corpus__note">
        Reported by the press without victim or authority confirmation; a claimed attack is not counted.
        Grey public publishers are detection leads only, never confirmation.
      </p>
      <ul className="press-only__list">
        {summary.incidents.map((incident) => (
          <li className="press-only__item" key={incident.id}>
            <code>{incident.id}</code>
            {" · department "}
            {incident.department}
            {" · "}
            {incident.publicationDate ?? "date unknown"}
            {" · "}
            {incident.publisherKind}
            {" · "}
            {incident.incidentType ?? "type unknown"}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CorpusView({
  data,
  loading = false,
  error = null,
  pressOnly = null,
  pressOnlyLoading = false,
  pressOnlyError = null,
}: CorpusViewProps) {
  return (
    <div className="corpus">
      <header className="corpus__header">
        <span className="micro">Corpus / overview</span>
        <h1>Corpus</h1>
        <p>What the observatory actually holds — every figure comes from the corpus statistics endpoint.</p>
      </header>

      {error ? (
        <p className="corpus__error" role="alert">
          Could not load corpus statistics: {error}
        </p>
      ) : null}
      {data === null ? (
        <p className="corpus__state" role="status">
          {loading ? "Loading corpus statistics…" : "Corpus statistics are not available in demo mode."}
        </p>
      ) : (
        <>
          {error ? <p className="corpus__stale">Showing the last successful snapshot.</p> : null}
          <div className="corpus__kpis">
            <div className="corpus__kpi">
              <span className="micro">Incidents in corpus</span>
              <strong>{formatCount(data.totals.incidents)}</strong>
            </div>
            <div className="corpus__kpi">
              <span className="micro">Sources</span>
              <strong>{formatCount(data.totals.sources)}</strong>
            </div>
            <div className="corpus__kpi">
              <span className="micro">Organisations</span>
              <strong>{formatCount(data.totals.organisations)}</strong>
            </div>
            <div className="corpus__kpi">
              <span className="micro">Domain coverage</span>
              <strong>{formatPercent(data.domainCoverage.percent)}</strong>
            </div>
          </div>
          {growthCard(data)}
          <div className="corpus__grid">
            {departmentBars(data)}
            {domainGauge(data)}
          </div>
          {recentIncidents(data)}
          {pressOnlyError ? (
            <p className="corpus__error" role="alert">
              {`Could not load press-only incidents: ${pressOnlyError}`}
            </p>
          ) : null}
          {pressOnly === null ? (
            pressOnlyLoading ? (
              <p className="corpus__state" role="status">Loading press-only incidents…</p>
            ) : null
          ) : (
            pressOnlyPanel(pressOnly)
          )}
          <footer className="corpus__footer">
            Source: <code>GET /api/corpus/stats</code> · measured at {data.generatedAt} · read-only, no estimated
            values.
          </footer>
        </>
      )}
    </div>
  );
}
