import { useMemo } from "react";
import { sourceStatus, type Source } from "../api";
import type { HealthDetail } from "../api";
import {
  FAMILY_LABEL,
  SOURCE_STATUS_LABEL,
  formatDate,
  formatRelative,
} from "./SourcesView";
import RelancerButton, { type RelanceOutcome } from "./RelancerButton";
import "./sources-rouges.css";

type SourceSante = HealthDetail["sources"]["bySource"][number];

export type SourcesRougesViewProps = {
  detail: HealthDetail | null;
  /** Registre `GET /api/sources` : apporte l'état de collecte (ok / erreur / attente). */
  sources?: Source[];
  loading?: boolean;
  error?: string | null;
  /** Appel du chemin de collecte existant — aucun nouveau chemin côté web. */
  onRelance: (sourceId: string) => Promise<RelanceOutcome>;
};

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Les sources rouges sont celles que `GET /api/health/detail` classe `red` :
 * plus de 7 jours sans fait, ou jamais de fait. On ne recalcule pas la couleur
 * côté navigateur, et on ne confond pas une source désactivée avec une source
 * muette : les deux figurent dans le compte de 214, mais leur état diffère.
 */
function sourcesRouges(detail: HealthDetail): SourceSante[] {
  return detail.sources.bySource
    .filter((s) => s.tone === "red")
    .sort((a, b) => {
      const aAt = timestamp(a.lastEventAt);
      const bAt = timestamp(b.lastEventAt);
      // Jamais produit d'abord, puis du fait le plus ancien au plus récent.
      if (aAt === null && bAt === null) return a.name.localeCompare(b.name, "fr");
      if (aAt === null) return -1;
      if (bAt === null) return 1;
      return aAt - bAt || a.name.localeCompare(b.name, "fr");
    });
}

export default function SourcesRougesView({
  detail,
  sources = [],
  loading = false,
  error = null,
  onRelance,
}: SourcesRougesViewProps) {
  const parId = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const rouges = useMemo(() => (detail ? sourcesRouges(detail) : []), [detail]);

  if (loading && detail === null) {
    return <section className="sources-rouges"><p role="status" aria-live="polite">lecture des sources rouges…</p></section>;
  }
  if (error && detail === null) {
    return <section className="sources-rouges"><p role="alert" aria-live="assertive">sources indisponibles : {error}</p></section>;
  }
  if (detail === null || !detail.ok) {
    return <section className="sources-rouges"><p role="status" aria-live="polite">état non mesuré</p></section>;
  }

  return (
    <section className="sources-rouges" aria-label="Sources rouges">
      <header>
        <h2>sources rouges</h2>
        <p>
          {rouges.length} sources sans fait depuis plus de 7 jours sur {detail.sources.declared} déclarées
          {" · "}triées par dernière production, du plus ancien fait au plus récent
        </p>
      </header>

      <div className="sources-rouges__scroll">
        <table className="data sources-rouges__table">
          <thead>
            <tr>
              <th scope="col">source</th>
              <th scope="col">famille</th>
              <th scope="col">état</th>
              <th scope="col">dernière collecte</th>
              <th scope="col">dernier événement</th>
              <th scope="col">action</th>
            </tr>
          </thead>
          <tbody>
            {rouges.map((s) => {
              const registre = parId.get(s.id);
              const etatCollecte = registre
                ? SOURCE_STATUS_LABEL[sourceStatus(registre)]
                : s.enabled ? "habilitée" : "désactivée";
              return (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{FAMILY_LABEL[s.family] ?? s.family}</td>
                  <td>
                    <span className="sources-rouges__etat" data-enabled={s.enabled}>
                      {etatCollecte}{!s.enabled ? " · désactivée" : ""}
                    </span>
                  </td>
                  <td className="mono" title={formatDate(s.lastCollectedAt)}>
                    {formatRelative(s.lastCollectedAt)}
                  </td>
                  <td className="mono" title={formatDate(s.lastEventAt)}>
                    {formatRelative(s.lastEventAt)}
                  </td>
                  <td>
                    <RelancerButton
                      sourceId={s.id}
                      sourceName={s.name}
                      onRelance={onRelance}
                      disabled={!s.enabled}
                    />
                  </td>
                </tr>
              );
            })}
            {rouges.length === 0 && (
              <tr><td colSpan={6}>aucune source rouge mesurée</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
