import { useMemo } from "react";
import { sourceStatus, type Source } from "../api";
import type { HealthDetail } from "../api";
import {
  FAMILY_LABEL,
  SOURCE_STATUS_LABEL,
  formatDate,
  formatRelative,
  isSourceRouge,
  lastProductionAt,
} from "./SourcesView";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import RelancerButton, { type RelanceOutcome } from "./RelancerButton";
import { Card } from "@astryxdesign/core/Card";
import "./sources-rouges.css";
import { Badge } from "@astryxdesign/core/Badge";
import { Table } from "@astryxdesign/core/Table";

export type SourcesRougesViewProps = {
  detail: HealthDetail | null;
  /** Registre `GET /api/sources` : c'est lui qui porte la fraîcheur de chaque flux. */
  sources?: Source[];
  loading?: boolean;
  error?: string | null;
  /** Appel du chemin de collecte existant — aucun nouveau chemin côté web. */
  onRelance: (sourceId: string) => Promise<RelanceOutcome>;
  /** Relance la lecture de l'état depuis un écran sans mesure. */
  onRetry?: () => void;
};

/**
 * Les sources rouges sont celles qui n'ont rien produit depuis plus de 7 jours,
 * ou jamais rien produit. Le critère et la date de production viennent de la
 * vue Sources, pour que les deux écrans ne puissent pas diverger.
 */
function sourcesRouges(sources: Source[], now: number): Source[] {
  return sources
    .filter((s) => isSourceRouge(s, now))
    .sort((a, b) => {
      const aAt = Date.parse(lastProductionAt(a) ?? "");
      const bAt = Date.parse(lastProductionAt(b) ?? "");
      // Jamais produit d'abord, puis du fait le plus ancien au plus récent.
      if (Number.isNaN(aAt) && Number.isNaN(bAt)) return a.name.localeCompare(b.name, "fr");
      if (Number.isNaN(aAt)) return -1;
      if (Number.isNaN(bAt)) return 1;
      return aAt - bAt || a.name.localeCompare(b.name, "fr");
    });
}

export default function SourcesRougesView({
  detail,
  sources = [],
  loading = false,
  error = null,
  onRelance,
  onRetry,
}: SourcesRougesViewProps) {
  const rouges = useMemo(() => sourcesRouges(sources, Date.now()), [sources]);

  if (loading && detail === null) {
    return <section className="sources-rouges"><LoadingSkeleton label="lecture des sources rouges…" /></section>;
  }
  if (error && detail === null) {
    return <section className="sources-rouges"><p role="alert" aria-live="assertive">sources indisponibles : {error}</p></section>;
  }
  if (detail === null || !detail.ok) {
    return (
      <section className="sources-rouges">
        {onRetry
          ? <EmptyState message="état non mesuré" actionLabel="Recharger l'état" onAction={onRetry} />
          : <p>état non mesuré</p>}
      </section>
    );
  }

  return (
    <section className="sources-rouges" aria-label="Sources rouges">
      <header>
        <h2>sources rouges</h2>
        <Badge label={`${rouges.length} sans fait`} className="sources-rouges__badge" />
        <p>
          {rouges.length} sources sans fait depuis plus de 7 jours sur {detail.sources.declared} déclarées
          {" · "}triées par dernière production, du plus ancien fait au plus récent
        </p>
      </header>

      <Card variant="transparent" padding={0} className="sources-rouges__scroll">
        <Table className="data sources-rouges__table" density="compact" dividers="rows">
          <thead>
            <tr>
              <th scope="col">source</th>
              <th scope="col">famille</th>
              <th scope="col">état</th>
              <th scope="col">dernier passage</th>
              <th scope="col">dernier événement</th>
              <th scope="col">action</th>
            </tr>
          </thead>
          <tbody>
            {rouges.map((s) => {
              const etatCollecte = SOURCE_STATUS_LABEL[sourceStatus(s)];
              return (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{FAMILY_LABEL[s.family] ?? s.family}</td>
                  <td>
                    <span className="sources-rouges__etat" data-enabled={s.enabled}>
                      {etatCollecte}{!s.enabled ? " · désactivée" : ""}
                    </span>
                  </td>
                  <td className="mono" title={formatDate(s.dernierRun ?? null)}>
                    {formatRelative(s.dernierRun ?? null)}
                  </td>
                  <td className="mono" title={formatDate(s.lastEventAt ?? null)}>
                    {formatRelative(s.lastEventAt ?? null)}
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
              <tr><td colSpan={6}>
                {onRetry
                  ? <EmptyState message="aucune source rouge mesurée" actionLabel="Recharger l'état" onAction={onRetry} />
                  : "aucune source rouge mesurée"}
              </td></tr>
            )}
          </tbody>
        </Table>
      </Card>
    </section>
  );
}
