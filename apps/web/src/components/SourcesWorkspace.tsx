/**
 * Espace « Sources » : un seul écran pour le registre, ses indicateurs, la
 * santé de la flotte et l'état du corpus. Les vues existantes restent seules
 * maîtres de leur données et de leurs filtres : ce conteneur ne fait que les
 * loger dans des panneaux accessibles et ne duplique aucun appel API.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  sourceStatus,
  sourceYield,
  type CollecteMetrics,
  type CorpusStats,
  type HealthCauses,
  type HealthDetail,
  type Source,
} from "../api";
import CollecteMetricsView from "./CollecteMetricsView";
import CorpusView from "./CorpusView";
import HealthDetailView from "./HealthDetailView";
import HealthView from "./HealthView";
import SourcesView, {
  FAMILY_LABEL,
  countSourcesRouges,
  formatDate,
  formatNumber,
} from "./SourcesView";
import "./sources-workspace.css";

export type SourcesTabKey = "registre" | "indicateurs" | "sante" | "corpus";

/** Alias pour le shell : le nom du type n'est pas un contrat d'URL. */
export type SourcesWorkspaceTab = SourcesTabKey;

const TABS: readonly { key: SourcesTabKey; label: string }[] = [
  { key: "registre", label: "Registre" },
  { key: "indicateurs", label: "Indicateurs" },
  { key: "sante", label: "Santé" },
  { key: "corpus", label: "Corpus" },
];

/** Une preuve d'archive est affichée telle quelle : jamais recomposée ici. */
export type WarcProof = {
  recordId: string;
  targetUri: string;
  date: string;
  digest?: string | null;
  identifiedPayloadType?: string | null;
  blockLength?: number | null;
};

type WarcProofCardProps = {
  proof?: WarcProof | null;
};

/**
 * Carte de traçabilité d'un enregistrement WARC. Sans métadonnées fournies,
 * elle le dit explicitement plutôt que d'afficher une preuve inventée.
 */
function WarcProofCard({ proof = null }: WarcProofCardProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `sws-warc-${uid}`;
  return (
    <section className="sws-warc" aria-labelledby={titleId}>
      <header className="sws-warc__head">
        <h2 id={titleId}>Preuve d’archive</h2>
        <span className="sws-warc__format">WARC</span>
      </header>
      {proof === null ? (
        <p className="sws-warc__empty" role="status">Aucune preuve d’archive jointe à cette vue.</p>
      ) : (
        <dl className="sws-warc__fields">
          <div>
            <dt>Cible</dt>
            <dd>
              {/^https?:\/\//i.test(proof.targetUri) ? (
                <a href={proof.targetUri} target="_blank" rel="noopener noreferrer">
                  {proof.targetUri}
                </a>
              ) : (
                <span>{proof.targetUri}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Enregistrement</dt>
            <dd><code>{proof.recordId}</code></dd>
          </div>
          <div>
            <dt>Date de capture</dt>
            <dd><time dateTime={proof.date}>{formatDate(proof.date)}</time></dd>
          </div>
          {proof.digest ? (
            <div>
              <dt>Empreinte du bloc</dt>
              <dd><code>{proof.digest}</code></dd>
            </div>
          ) : null}
          {proof.identifiedPayloadType ? (
            <div>
              <dt>Type de contenu</dt>
              <dd>{proof.identifiedPayloadType}</dd>
            </div>
          ) : null}
          {proof.blockLength !== null && proof.blockLength !== undefined ? (
            <div>
              <dt>Taille du bloc</dt>
              <dd>{formatNumber(proof.blockLength)} octets</dd>
            </div>
          ) : null}
        </dl>
      )}
    </section>
  );
}

type SourcesDashboardViewProps = {
  sources: Source[];
  metrics?: CollecteMetrics | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

/**
 * Tableau de bord du registre : les compteurs sont dérivés des sources déjà
 * chargées par le shell, la supervision des cycles vient de sa propre réponse.
 * Aucun chiffre n'est fabriqué quand la mesure manque.
 */
function SourcesDashboardView({
  sources,
  metrics = null,
  loading = false,
  error = null,
  onRetry,
}: SourcesDashboardViewProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `sws-dashboard-${uid}`;
  const familiesId = `sws-families-${uid}`;
  const resume = useMemo(() => {
    const families = new Map<string, number>();
    let actives = 0;
    let productives = 0;
    let enErreur = 0;
    let evenements = 0;
    for (const source of sources) {
      families.set(source.family, (families.get(source.family) ?? 0) + 1);
      if (source.evenements30j > 0) actives += 1;
      if (sourceYield(source) === "productive") productives += 1;
      if (sourceStatus(source) === "error") enErreur += 1;
      evenements += source.evenements30j;
    }
    return {
      families: [...families.entries()].sort((a, b) => b[1] - a[1]),
      actives,
      productives,
      enErreur,
      evenements,
      rouges: countSourcesRouges(sources),
    };
  }, [sources]);

  const chiffres: { label: string; value: string; note: string }[] = [
    { label: "flux déclarés", value: formatNumber(sources.length), note: "registre complet" },
    { label: "en erreur", value: formatNumber(resume.enErreur), note: "dernier passage" },
    { label: "sans production", value: formatNumber(resume.rouges), note: "plus de 7 jours" },
    { label: "actives 30 j", value: formatNumber(resume.actives), note: "au moins un fait attribué" },
    { label: "productives", value: formatNumber(resume.productives), note: "au moins un fait retenu" },
    { label: "événements 30 j", value: formatNumber(resume.evenements), note: "attribués aux flux" },
  ];

  return (
    <section className="sws-dashboard" aria-labelledby={titleId}>
      <header className="sws-dashboard__head">
        <div>
          <h2 id={titleId}>Indicateurs du registre</h2>
          <p>Mesures calculées sur les sources chargées, sans valeur estimée.</p>
        </div>
        {onRetry ? (
          <button type="button" className="sws-retry" onClick={onRetry}>
            Recharger les indicateurs
          </button>
        ) : null}
      </header>
      {error ? <p className="sws-dashboard__error" role="alert">{error}</p> : null}
      {loading && sources.length === 0 ? (
        <p className="sws-dashboard__state" role="status">lecture des sources…</p>
      ) : null}
      <dl className="sws-dashboard__kpis">
        {chiffres.map((item) => (
          <div className="sws-dashboard__kpi" key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}<span>{item.note}</span></dd>
          </div>
        ))}
      </dl>
      <section className="sws-dashboard__families" aria-labelledby={familiesId}>
        <h3 id={familiesId}>Familles représentées</h3>
        {resume.families.length === 0 ? (
          <p className="sws-dashboard__state">aucune famille mesurée</p>
        ) : (
          <ul>
            {resume.families.slice(0, 8).map(([family, count]) => (
              <li key={family}>
                <span className="sws-dashboard__family-name">{FAMILY_LABEL[family] ?? family}</span>
                <span className="sws-dashboard__bar" aria-hidden="true">
                  <span style={{ width: `${Math.round((count / sources.length) * 100)}%` }} />
                </span>
                <strong>{formatNumber(count)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="sws-dashboard__cycles">
        <CollecteMetricsView metrics={metrics} loading={loading} error={error} />
      </div>
    </section>
  );
}

export type SourcesWorkspaceProps = {
  sources: Source[];
  loading: boolean;
  error: string | null;
  /** Relance commune au registre, aux indicateurs et à la santé. */
  onRetry?: () => void;
  /** Supervision de la collecte (GET /api/collecte/metrics). */
  metrics?: CollecteMetrics | null;
  /** Alias de `metrics`, pour reprendre le nom d'état du shell. */
  collecteMetrics?: CollecteMetrics | null;
  metricsLoading?: boolean;
  metricsError?: string | null;
  /** Résumé et causes de la santé (GET /api/health/detail et /causes). */
  healthDetail?: HealthDetail | null;
  healthCauses?: HealthCauses | null;
  healthLoading?: boolean;
  healthError?: string | null;
  /** Statistiques du corpus (GET /api/corpus/stats). */
  corpusData?: CorpusStats | null;
  corpusLoading?: boolean;
  corpusError?: string | null;
  /** Métadonnées d'un enregistrement d'archive, quand le shell en dispose. */
  warcProof?: WarcProof | null;
  /** Panneau ouvert au premier rendu ; les changements restent locaux. */
  initialTab?: SourcesTabKey;
  /** Notifie le shell d'un changement de panneau (URL, analytics). */
  onTabChange?: (tab: SourcesTabKey) => void;
};

export default function SourcesWorkspace({
  sources,
  loading,
  error,
  onRetry,
  metrics,
  collecteMetrics,
  metricsLoading,
  metricsError,
  healthDetail = null,
  healthCauses = null,
  healthLoading,
  healthError,
  corpusData = null,
  corpusLoading,
  corpusError = null,
  warcProof = null,
  initialTab = "registre",
  onTabChange,
}: SourcesWorkspaceProps) {
  const [active, setActive] = useState<SourcesTabKey>(initialTab);
  // Le shell peut changer de hash (retour navigateur, lien partagé) : le
  // panneau reste interne, mais la graine fournie reste autoritaire.
  useEffect(() => { setActive(initialTab); }, [initialTab]);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function selectTab(key: SourcesTabKey) {
    if (key === active) return;
    setActive(key);
    onTabChange?.(key);
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    const key = TABS[next].key;
    selectTab(key);
    tabRefs.current[next]?.focus();
  }

  const tabProps = (key: SourcesTabKey, index: number) => ({
    id: `sws-tab-${uid}-${key}`,
    type: "button" as const,
    role: "tab" as const,
    "aria-selected": active === key,
    "aria-controls": `sws-panel-${uid}-${key}`,
    tabIndex: active === key ? 0 : -1,
    ref: (node: HTMLButtonElement | null) => { tabRefs.current[index] = node; },
    onClick: () => selectTab(key),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => onTabKeyDown(event, index),
  });

  return (
    <div className="sws">
      <header className="sws__head">
        <h1 className="sws__title">Sources</h1>
        <div className="sws__tabs" role="tablist" aria-label="Panneaux des sources">
          {TABS.map((tab, index) => (
            <button
              {...tabProps(tab.key, index)}
              key={tab.key}
              className={active === tab.key ? "sws__tab is-active" : "sws__tab"}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="sws__body">
        <div
          className="sws__panel"
          role="tabpanel"
          id={`sws-panel-${uid}-registre`}
          aria-labelledby={`sws-tab-${uid}-registre`}
          hidden={active !== "registre"}
        >
          {active === "registre" ? (
            <SourcesView sources={sources} loading={loading} error={error} onRetry={onRetry} />
          ) : null}
        </div>

        <div
          className="sws__panel"
          role="tabpanel"
          id={`sws-panel-${uid}-indicateurs`}
          aria-labelledby={`sws-tab-${uid}-indicateurs`}
          hidden={active !== "indicateurs"}
        >
          {active === "indicateurs" ? (
            <SourcesDashboardView
              sources={sources}
              metrics={metrics ?? collecteMetrics ?? null}
              loading={metricsLoading ?? loading}
              error={metricsError ?? null}
              onRetry={onRetry}
            />
          ) : null}
        </div>

        <div
          className="sws__panel"
          role="tabpanel"
          id={`sws-panel-${uid}-sante`}
          aria-labelledby={`sws-tab-${uid}-sante`}
          hidden={active !== "sante"}
        >
          {active === "sante" ? (
            <div className="sws__health">
              <div className="sws__health-summary">
                <HealthDetailView
                  detail={healthDetail}
                  causes={healthCauses}
                  loading={healthLoading ?? loading}
                  error={healthError ?? error}
                  onRetry={onRetry}
                />
              </div>
              <HealthView sources={sources} loading={loading} onRetry={onRetry} />
            </div>
          ) : null}
        </div>

        <div
          className="sws__panel"
          role="tabpanel"
          id={`sws-panel-${uid}-corpus`}
          aria-labelledby={`sws-tab-${uid}-corpus`}
          hidden={active !== "corpus"}
        >
          {active === "corpus" ? (
            <div className="sws__corpus">
              <CorpusView data={corpusData} loading={corpusLoading ?? loading} error={corpusError} />
              <WarcProofCard proof={warcProof} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
