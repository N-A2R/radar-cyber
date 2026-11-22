/**
 * Écran Corpus — état mesuré du corpus, en français comme le reste de
 * l'interface. Le composant est purement présentatif : toutes les valeurs
 * viennent de `GET /api/corpus/stats`, une seule requête, aucune donnée
 * simulée côté navigateur. Chaque chiffre est accompagné de sa définition.
 */
import type { CorpusDepartment, CorpusIncident, CorpusStats } from "../api";
import "./corpus.css";

export type CorpusViewProps = {
  data: CorpusStats | null;
  loading?: boolean;
  error?: string | null;
};

/** Libellés français des familles présentes dans `source.family`. */
export const FAMILY_LABELS: Record<string, string> = {
  ransomware: "Rançongiciel",
  vuln: "Vulnérabilités",
  phishing: "Hameçonnage",
  malware: "Logiciels malveillants",
  cert: "CERT",
  cert_fr: "CERT-FR",
  typosquat: "Typosquatage",
  reputation: "Réputation",
  cti: "Renseignement sur les menaces",
  presse: "Presse",
  presse_cyber: "Presse cyber",
  warninglist: "Listes d'alerte",
  leaks: "Fuites",
  paste: "Sites de paste",
};

const numberFormat = new Intl.NumberFormat("fr-FR");

export function formatCount(value: number): string {
  return numberFormat.format(value);
}

/** Un pourcentage mesuré : jamais "0 %" quand le dénominateur est inconnu. */
export function formatPercent(value: number | null): string {
  if (value === null) return "non mesurable";
  const digits = value > 0 && value < 1 ? 2 : 1;
  return `${value.toFixed(digits).replace(".", ",")}\u00a0%`;
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
        <h2 id="corpus-sources-title">Sources par département</h2>
        <span className="corpus__panel-meta">
          {formatCount(data.totals.sources)} sources · {formatCount(data.totals.sourcesLocalised)} localisées
        </span>
      </div>
      {data.byDepartment.length === 0 ? (
        <p className="corpus__empty">Aucune source enregistrée pour l'instant.</p>
      ) : (
        <div className="corpus__bars">
          {data.byDepartment.map((dept: CorpusDepartment) => {
            const slices = data.families
              .filter((family) => (dept.families[family] ?? 0) > 0)
              .map((family) => ({ family, count: dept.families[family] ?? 0 }));
            const detail = slices.map((slice) => `${familyLabel(slice.family)} : ${slice.count}`).join(", ");
            return (
              <div className="corpus__bar-row" key={dept.department || "unlocalised"}>
                <span className="corpus__bar-label" title={dept.department || undefined}>
                  {dept.label}
                  {dept.department ? <span className="corpus__dept-code">{dept.department}</span> : null}
                </span>
                <span
                  className="corpus__bar"
                  role="img"
                  aria-label={`${dept.label} : ${dept.total} sources. ${detail}`}
                >
                  {slices.map((slice) => (
                    <span
                      className="corpus__bar-segment"
                      data-family={slice.family}
                      key={slice.family}
                      style={{ width: `${(slice.count / dept.total) * 100}%` }}
                      title={`${familyLabel(slice.family)} : ${slice.count}`}
                    />
                  ))}
                </span>
                <span className="corpus__bar-total">{formatCount(dept.total)}</span>
              </div>
            );
          })}
          <div className="corpus__legend" aria-label="Familles de sources">
            {data.families.map((family) => (
              <span className="corpus__legend-item" key={family}>
                <i className="corpus__swatch" data-family={family} aria-hidden="true" />
                {familyLabel(family)}
              </span>
            ))}
          </div>
          <p className="corpus__note">
            Une source n'est comptée dans un département que lorsque son identifiant, son nom, son URL ou sa
            description désigne un département sans ambiguïté. Les sources nationales ou ambiguës apparaissent
            comme « Non localisées » — jamais comme zéro, jamais attribuées au hasard.
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
        <h2 id="corpus-domains-title">Organisations avec un domaine</h2>
        <span className="corpus__panel-meta">annuaire de référence</span>
      </div>
      <div className="corpus__gauge-value">{formatPercent(coverage.percent)}</div>
      <div
        className="corpus__gauge"
        role="progressbar"
        aria-label="Part des organisations avec un domaine vérifié"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${formatCount(coverage.withDomain)} sur ${formatCount(coverage.organisations)} organisations`}
      >
        <span className="corpus__gauge-fill" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
      <p className="corpus__gauge-caption">
        <strong>{formatCount(coverage.withDomain)}</strong> organisations sur {formatCount(coverage.organisations)}{" "}
        portent un domaine non vide.
      </p>
      <p className="corpus__note">
        L'annuaire est bien plus vaste que le corpus d'incidents : cette jauge mesure la couverture des domaines
        dans l'annuaire, pas la part des organisations du corpus.
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
        <h2 id="corpus-growth-title">Le corpus progresse-t-il ?</h2>
        <span className="corpus__panel-meta">depuis le dernier rapport de {growth.windowHours} h</span>
      </div>
      <div className="corpus__growth-value" data-trend={rising ? "up" : falling ? "down" : "flat"}>
        {signedCount(growth.newEvents)}
      </div>
      <p className="corpus__growth-caption">événements ingérés lors des {growth.windowHours} dernières heures</p>
      <p className="corpus__growth-compare">
        Par rapport à {formatCount(growth.previousEvents)} sur « {growth.comparedTo} » :{" "}
        <strong>{signedCount(growth.change)}</strong>
        {growth.percentChange === null
          ? " · aucun pourcentage disponible (fenêtre de comparaison vide)"
          : ` · ${growth.percentChange > 0 ? "+" : growth.percentChange < 0 ? "−" : ""}${formatPercent(Math.abs(growth.percentChange))}`}
      </p>
      <p className="corpus__note">
        La croissance compte les événements par heure de collecte (<code>event.collected_at</code>). Elle mesure
        l'ingestion dans le corpus, pas la date à laquelle l'incident a eu lieu.
      </p>
    </section>
  );
}

function incidentRow(incident: CorpusIncident) {
  return (
    <li className="corpus__incident" key={incident.id}>
      <time className="corpus__incident-date" dateTime={incident.date ?? undefined}>
        {incident.date ?? "date inconnue"}
      </time>
      <span className="corpus__incident-main">
        <span className="corpus__incident-title">{incident.title}</span>
        <span className="corpus__incident-meta">
          {incident.organisation ?? "organisation inconnue"}
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
        <span className="corpus__incident-source corpus__incident-source--missing">lien de source indisponible</span>
      )}
    </li>
  );
}

function recentIncidents(data: CorpusStats) {
  return (
    <section className="corpus__panel corpus__incidents" aria-labelledby="corpus-incidents-title">
      <div className="corpus__panel-head">
        <h2 id="corpus-incidents-title">20 derniers incidents du corpus</h2>
        <span className="corpus__panel-meta">
          {formatCount(data.totals.incidents)} incidents dans le corpus
        </span>
      </div>
      {data.recentIncidents.length === 0 ? (
        <p className="corpus__empty">Aucun incident dans le corpus pour l'instant.</p>
      ) : (
        <ol className="corpus__incident-list">
          {data.recentIncidents.map(incidentRow)}
        </ol>
      )}
      <p className="corpus__note">
        Un incident désigne un incident confirmé ou une allégation tierce. Les indicateurs techniques et les
        signaux ambiants sont exclus. Le lien de source ouvre l'URL de preuve enregistrée, ou la page d'accueil
        de la source lorsqu'aucune URL de preuve n'a été relevée.
      </p>
    </section>
  );
}

export default function CorpusView({ data, loading = false, error = null }: CorpusViewProps) {
  return (
    <div className="corpus">
      <header className="corpus__header">
        <span className="micro">Corpus / vue d'ensemble</span>
        <h1>Corpus</h1>
        <p>Ce que l'observatoire contient réellement — chaque chiffre vient du point d'accès aux statistiques du corpus.</p>
      </header>

      {error ? (
        <p className="corpus__error" role="alert">
          Impossible de charger les statistiques du corpus : {error}
        </p>
      ) : null}
      {data === null ? (
        <p className="corpus__state" role="status">
          {loading ? "Chargement des statistiques du corpus…" : "Les statistiques du corpus ne sont pas disponibles en mode démo."}
        </p>
      ) : (
        <>
          {error ? <p className="corpus__stale">Affichage du dernier instantané réussi.</p> : null}
          <div className="corpus__kpis">
            <div className="corpus__kpi">
              <span className="micro">Incidents dans le corpus</span>
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
              <span className="micro">Couverture des domaines</span>
              <strong>{formatPercent(data.domainCoverage.percent)}</strong>
            </div>
          </div>
          {growthCard(data)}
          <div className="corpus__grid">
            {departmentBars(data)}
            {domainGauge(data)}
          </div>
          {recentIncidents(data)}
          <footer className="corpus__footer">
            Source : <code>GET /api/corpus/stats</code> · mesuré le {data.generatedAt} · lecture seule, aucune valeur
            estimée.
          </footer>
        </>
      )}
    </div>
  );
}
