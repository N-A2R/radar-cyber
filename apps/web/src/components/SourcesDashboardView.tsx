/**
 * Écran du tableau de bord des sources — état mesuré des sources, en français.
 * Composant purement présentatif : chaque chiffre vient de
 * `GET /api/sources/dashboard`, calculé en base à l'appel. Aucune valeur par
 * défaut, aucun pourcentage inventé, aucune agrégation dans le navigateur.
 */
import { useId, useMemo } from "react";
import {
  sourceStatus,
  sourceYield,
  type CollecteMetrics,
  type Source,
  type SourceRendement,
  type SourcesDashboard,
} from "../api";
import type { SourcesDashboardViewProps } from "../contracts";
import CollecteMetricsView from "./CollecteMetricsView";
import { FAMILY_LABEL, countSourcesRouges, formatNumber } from "./SourcesView";
import "./sources-dashboard.css";
import { Badge } from "@astryxdesign/core/Badge";
import { Table } from "@astryxdesign/core/Table";

const countFormat = new Intl.NumberFormat("fr-FR");

export function formatCount(value: number): string {
  return countFormat.format(value);
}

const yieldFormat = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Un rendement est un ratio (0,2 = 20 %). `null` : rien n'a été lu. */
export function formatYield(value: number | null): string {
  if (value === null) return "non mesurable";
  return `${yieldFormat.format(value * 100)} %`;
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
  { key: "ok200", label: "OK 200", note: "Exécution réussie au cours des 7 derniers jours, sous le seuil de lenteur, avec une nouvelle production." },
  { key: "muette", label: "Silencieuse", note: "Collectée au cours des 7 derniers jours et ayant déjà produit des événements, mais aucun sur cette fenêtre." },
  { key: "morte", label: "Morte", note: "Déclarée morte explicitement. Cette décision prime sur tous les autres états." },
  { key: "lente", label: "Lente", note: "Dernière exécution réussie au cours des 7 derniers jours au-delà du seuil de lenteur." },
  { key: "dormante", label: "Dormante", note: "Aucune exécution réussie au cours des 7 derniers jours — santé non prouvée." },
] as const;

function etatsPanel(data: SourcesDashboard) {
  return (
    <section className="sdb__panel" aria-labelledby="sdb-states-title">
      <div className="sdb__panel-head">
        <h2 id="sdb-states-title">Sources par état</h2>
        <span className="sdb__meta">{formatCount(data.totalSources)} sources déclarées</span>
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
        Les cinq états partitionnent les sources déclarées : une source est comptée une fois, jamais deux.
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
          {formatCount(lignes.length)} sur {data.limiteClassement} mesurées · {data.fenetreRendementJours} derniers jours
        </span>
      </div>
      {lignes.length === 0 ? (
        <p className="sdb__empty">Aucune source n'a produit un rendement mesurable sur cette fenêtre.</p>
      ) : (
        <Table className="sdb__table" density="compact" dividers="rows">
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col" className="sdb__num">Entrées</th>
              <th scope="col" className="sdb__num">Événements</th>
              <th scope="col" className="sdb__num">Rendement</th>
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
        </Table>
      )}
      <p className="sdb__note">
        Rendement = événements retenus sur entrées lues, sur la même fenêtre. « non mesurable » signifie
        qu'aucune entrée n'a été lue — jamais 0 %.
      </p>
    </section>
  );
}

function evolutionPanel(data: SourcesDashboard) {
  const max = Math.max(1, ...data.evolution.map((jour) => jour.evenements));
  return (
    <section className="sdb__panel sdb__evolution" aria-labelledby="sdb-evolution-title">
      <div className="sdb__panel-head">
        <h2 id="sdb-evolution-title">{data.fenetreJours} derniers jours</h2>
        <span className="sdb__meta">Jours UTC, aujourd'hui inclus</span>
      </div>
      {data.evolution.length === 0 ? (
        <p className="sdb__empty">Aucune mesure quotidienne disponible.</p>
      ) : (
        <Table className="sdb__table" density="compact" dividers="rows">
          <thead>
            <tr>
              <th scope="col">Jour</th>
              <th scope="col" className="sdb__num">Événements</th>
              <th scope="col" className="sdb__num">Entrées</th>
              <th scope="col" className="sdb__num">Sources avec événements</th>
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
                    aria-label={`${formatCount(jour.evenements)} événements le ${jour.date}`}
                  >
                    <span style={{ width: `${(jour.evenements / max) * 100}%` }} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="sdb__note">
        Les jours sans événements sont des zéros mesurés, pas des lignes manquantes. Les entrées proviennent des exécutions réussies des collecteurs.
      </p>
    </section>
  );
}

function collectePanel(data: SourcesDashboard) {
  return (
    <section className="sdb__panel" aria-labelledby="sdb-collecte-title">
      <div className="sdb__panel-head">
        <h2 id="sdb-collecte-title">Temps de collecte cumulé</h2>
        <span className="sdb__meta">exécutions terminées, {data.fenetreJours} derniers jours</span>
      </div>
      <div className="sdb__duration">{formatDuration(data.collecte.dureeTotaleMs)}</div>
      <p className="sdb__duration-caption">
        {formatCount(data.collecte.dureeTotaleMs)} ms cumulées sur {formatCount(data.collecte.runs)} exécutions terminées.
      </p>
      <p className="sdb__note">
        Il s'agit du temps cumulé des collecteurs, et non du temps écoulé : les exécutions simultanées se chevauchent et sont chacune comptées.
      </p>
    </section>
  );
}

export type RegistryIndicatorsProps = {
  sources: Source[];
  metrics?: CollecteMetrics | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

/** Indicateurs dérivés du registre déjà chargé par le workspace Sources. */
export function RegistryIndicators({
  sources,
  metrics = null,
  loading = false,
  error = null,
  onRetry,
}: RegistryIndicatorsProps) {
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

export default function SourcesDashboardView({ data, loading = false, error = null }: SourcesDashboardViewProps) {
  return (
    <div className="sdb">
      <header className="sdb__header">
        <span className="micro">Sources / tableau de bord</span>
        <Badge label="mesuré" className="sdb__badge" />
        <h1>Tableau de bord des sources</h1>
        <p>Ce que les collecteurs font réellement — chaque chiffre provient de l'endpoint du tableau de bord des sources.</p>
      </header>

      {error ? <p className="sdb__error" role="alert">Impossible de charger le tableau de bord des sources : {error}</p> : null}
      {data === null ? (
        <p className="sdb__state" role="status">
          {loading ? "Chargement du tableau de bord des sources…" : "Le tableau de bord des sources n'est pas disponible en mode démo."}
        </p>
      ) : (
        <>
          {error ? <p className="sdb__stale" role="status">Affichage du dernier instantané réussi.</p> : null}
          <div className="sdb__kpis">
            <div className="sdb__kpi">
              <span className="micro">Sources déclarées</span>
              <strong>{formatCount(data.totalSources)}</strong>
            </div>
            <div className="sdb__kpi">
              <span className="micro">Temps de collecte cumulé</span>
              <strong>{formatDuration(data.collecte.dureeTotaleMs)}</strong>
            </div>
          </div>
          {etatsPanel(data)}
          {collectePanel(data)}
          {evolutionPanel(data)}
          <div className="sdb__grid">
            {classement(data, "10 meilleures sources par rendement", "sdb-best-title", data.meilleures)}
            {classement(data, "10 pires sources par rendement", "sdb-worst-title", data.pires)}
          </div>
          <footer className="sdb__footer">
            Source : <code>GET /api/sources/dashboard</code> · mesuré le {data.generatedAt} · états {data.fenetreJours} j ·
            rendement {data.fenetreRendementJours} j · seuil de lenteur au-delà de {formatCount(data.seuilLenteMs)} ms · lecture seule, aucune valeur estimée.
          </footer>
        </>
      )}
    </div>
  );
}
