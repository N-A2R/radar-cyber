/**
 * Espace « Sources » : un seul écran pour le registre, ses indicateurs, la
 * santé de la flotte et l'état du corpus. Les vues existantes restent seules
 * maîtres de leur données et de leurs filtres : ce conteneur ne fait que les
 * loger dans des panneaux accessibles et ne duplique aucun appel API.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type {
  CollecteMetrics,
  CorpusStats,
  HealthCauses,
  HealthDetail,
  Source,
} from "../api";
import CorpusView from "./CorpusView";
import HealthDetailView from "./HealthDetailView";
import HealthView from "./HealthView";
import SourcesView from "./SourcesView";
import { RegistryIndicators } from "./SourcesDashboardView";
import { ArchiveProofCard, type WarcProof } from "./WarcProofCard";
import { Card } from "@astryxdesign/core/Card";

// Contrat historique : les tests et les shell existants importent `WarcProof`
// depuis ce module, même si le type est maintenant défini dans WarcProofCard.
export type { WarcProof } from "./WarcProofCard";
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
    <Card variant="transparent" padding={0} className="sws">
      <header className="sws__head">
        <h1 className="sws__title">Sources</h1>
        <Card variant="transparent" padding={0} className="sws__tabs" role="tablist" aria-label="Panneaux des sources">
          {TABS.map((tab, index) => (
            <button
              {...tabProps(tab.key, index)}
              key={tab.key}
              className={active === tab.key ? "sws__tab is-active" : "sws__tab"}
            >
              {tab.label}
            </button>
          ))}
        </Card>
      </header>

      <Card variant="transparent" padding={0} className="sws__body">
        <Card
          variant="transparent"
          padding={0}
          className="sws__panel"
          role="tabpanel"
          id={`sws-panel-${uid}-registre`}
          aria-labelledby={`sws-tab-${uid}-registre`}
          hidden={active !== "registre"}
        >
          {active === "registre" ? (
            <SourcesView sources={sources} loading={loading} error={error} onRetry={onRetry} />
          ) : null}
        </Card>

        <Card
          variant="transparent"
          padding={0}
          className="sws__panel"
          role="tabpanel"
          id={`sws-panel-${uid}-indicateurs`}
          aria-labelledby={`sws-tab-${uid}-indicateurs`}
          hidden={active !== "indicateurs"}
        >
          {active === "indicateurs" ? (
            <RegistryIndicators
              sources={sources}
              metrics={metrics ?? collecteMetrics ?? null}
              loading={metricsLoading ?? loading}
              error={metricsError ?? null}
              onRetry={onRetry}
            />
          ) : null}
        </Card>

        <Card
          variant="transparent"
          padding={0}
          className="sws__panel"
          role="tabpanel"
          id={`sws-panel-${uid}-sante`}
          aria-labelledby={`sws-tab-${uid}-sante`}
          hidden={active !== "sante"}
        >
          {active === "sante" ? (
            <Card variant="transparent" padding={0} className="sws__health">
              <Card variant="transparent" padding={0} className="sws__health-summary">
                <HealthDetailView
                  detail={healthDetail}
                  causes={healthCauses}
                  loading={healthLoading ?? loading}
                  error={healthError ?? error}
                  onRetry={onRetry}
                />
              </Card>
              <HealthView sources={sources} loading={loading} onRetry={onRetry} />
            </Card>
          ) : null}
        </Card>

        <Card
          variant="transparent"
          padding={0}
          className="sws__panel"
          role="tabpanel"
          id={`sws-panel-${uid}-corpus`}
          aria-labelledby={`sws-tab-${uid}-corpus`}
          hidden={active !== "corpus"}
        >
          {active === "corpus" ? (
            <Card variant="transparent" padding={0} className="sws__corpus">
              <CorpusView data={corpusData} loading={corpusLoading ?? loading} error={corpusError} />
              <ArchiveProofCard proof={warcProof} />
            </Card>
          ) : null}
        </Card>
      </Card>
    </Card>
  );
}
