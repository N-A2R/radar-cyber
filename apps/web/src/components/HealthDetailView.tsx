import type { HealthCauses, HealthDetail } from "../api";
import { ErrorRetry } from "./ErrorRetry";
import { FAMILY_LABEL, formatDate, formatNumber, formatRelative } from "./SourcesView";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import "./health-detail.css";
import { Badge } from "@astryxdesign/core/Badge";
import { Table } from "@astryxdesign/core/Table";


export type HealthDetailViewProps = {
  detail: HealthDetail | null;
  causes?: HealthCauses | null;
  loading?: boolean;
  error?: string | null;
  /** Relance la lecture de l'état depuis un écran sans donnée. */
  onRetry?: () => void;
};

/** Étiquette écrite à côté de la couleur : la teinte n'est jamais le seul signal. */
const TONE_LABEL = {
  green: "moins de 24 h",
  orange: "1 à 7 jours",
  red: "plus de 7 jours",
} as const;

function ageLabel(ageHours: number | null): string {
  if (ageHours === null) return "jamais produit";
  if (ageHours < 24) return `${ageHours} h`;
  return `${Math.floor(ageHours / 24)} j`;
}

/**
 * État du système en un coup d'œil : la réponse de `GET /api/health/detail`
 * est affichée telle quelle, sans recalcul côté navigateur. Chaque chiffre a
 * sa requête SQL dans `apps/api/src/routes/health-detail.ts`. La répartition
 * des causes vient de `GET /api/health/causes` et n'est jamais déduite ici.
 */
export default function HealthDetailView({ detail, causes = null, loading = false, error = null, onRetry }: HealthDetailViewProps) {
  if (loading && detail === null) {
    return <section className="health-detail"><LoadingSkeleton label="lecture de l’état du système…" /></section>;
  }
  if (error && detail === null) {
    return <section className="health-detail" aria-live="assertive"><ErrorRetry message={`état indisponible : ${error}`} onRetry={onRetry} /></section>;
  }
  if (detail === null || !detail.ok) {
    return (
      <section className="health-detail">
        {onRetry
          ? <EmptyState message="état non mesuré" actionLabel="Recharger l'état" onAction={onRetry} />
          : <p>état non mesuré</p>}
      </section>
    );
  }

  const { sources, queues } = detail;
  const metrics: { label: string; value: string; note: string }[] = [
    { label: "événements / 24 h", value: formatNumber(detail.events24h), note: "date du fait" },
    { label: "organisations reliées / 7 j", value: formatNumber(detail.orgs7j), note: "distinctes" },
    { label: "sources déclarées", value: formatNumber(sources.declared), note: `${formatNumber(sources.enabled)} habilitées` },
    { label: "sources actives / 7 j", value: formatNumber(sources.actives7j), note: "au moins un fait" },
    { label: "sources muettes / 7 j", value: formatNumber(sources.muettes7j), note: "aucun fait" },
    { label: "file · en attente", value: formatNumber(queues.pending), note: "quarantaine" },
    { label: "file · revues", value: formatNumber(queues.reviewed), note: "quarantaine" },
    { label: "file · promues", value: formatNumber(queues.promoted), note: "quarantaine" },
  ];

  return (
    <section className="health-detail" aria-label="état détaillé du système">
      <header>
        <h2>état du système</h2>
        <p>
          une seule requête · {formatDate(detail.generatedAt)} · fenêtre {detail.windowDays} jours
        </p>
      </header>

      <dl className="health-detail__metrics">
        {metrics.map((m) => (
          <div className="health-detail__metric" key={m.label}>
            <dt>{m.label}</dt>
            <dd>{m.value}</dd>
            <span>{m.note}</span>
          </div>
        ))}
      </dl>

      {causes ? (
        <>
          <h3>pourquoi {formatNumber(causes.rouges)} sources sont-elles rouges ?</h3>
          <p className="health-detail__legend">
            {formatNumber(causes.sansTrace)} sources rouges n’ont aucune trace de collecte sur 30 jours.
            {" "}{causes.stockage.explication}
          </p>
          {!causes.stockage.causeStockee ? (
            <p className="health-detail__proposition">
              Champ proposé : <code>{causes.stockage.champPropose.table}.{causes.stockage.champPropose.colonne}</code>
              {" — "}{causes.stockage.champPropose.definition}
            </p>
          ) : null}
          <div className="health-detail__scroll">
            <Table className="data" density="compact" dividers="rows">
              <thead>
                <tr>
                  <th scope="col">cause</th>
                  <th scope="col">sources</th>
                  <th scope="col">origine</th>
                  <th scope="col">exemples (3 au plus)</th>
                </tr>
              </thead>
              <tbody>
                {causes.causes.map((c) => (
                  <tr key={c.code}>
                    <td>{c.libelle}</td>
                    <td className="num">{formatNumber(c.sources)}</td>
                    <td>{c.origine === "compteur_run" ? "compteur de collecte" : "message d’erreur"}</td>
                    <td>
                      {c.exemples.length === 0 ? (
                        <span className="health-detail__vide">aucun exemple stocké</span>
                      ) : (
                        <ul className="health-detail__exemples">
                          {c.exemples.map((ex) => (
                            <li key={ex.source}>
                              <span>{ex.source}</span>
                              {" — "}<span className="mono" title={ex.detail}>{ex.detail}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <p className="health-detail__legend">
            Une source peut figurer dans plusieurs causes : ces catégories ne sont pas exclusives.
            {" "}Règles de déduction : {causes.causes.map((c) => `${c.libelle} = ${c.regle}`).join(" · ")}.
          </p>
        </>
      ) : null}

      <h3>dernier fait par famille</h3>
      <div className="health-detail__scroll">
        <Table className="data" density="compact" dividers="rows">
          <thead>
            <tr>
              <th scope="col">famille</th>
              <th scope="col">dernier fait</th>
              <th scope="col">âge</th>
              <th scope="col">fraîcheur</th>
            </tr>
          </thead>
          <tbody>
            {detail.families.map((f) => (
              <tr key={f.family}>
                <td>{FAMILY_LABEL[f.family] ?? f.family}</td>
                <td className="mono" title={formatDate(f.lastEventAt)}>{formatRelative(f.lastEventAt)}</td>
                <td className="num">{ageLabel(f.ageHours)}</td>
                <td>
                  <Badge className="health-detail__tone" data-tone={f.tone}
                    variant={f.tone === "green" ? "success" : f.tone === "orange" ? "warning" : "error"}
                    label={f.ageHours === null ? "jamais de fait" : TONE_LABEL[f.tone]} />
                </td>
              </tr>
            ))}
            {detail.families.length === 0 && (
              <tr><td colSpan={4}>
                {onRetry
                  ? <EmptyState message="aucun fait mesuré" actionLabel="Recharger l'état" onAction={onRetry} />
                  : "aucun fait mesuré"}
              </td></tr>
            )}
          </tbody>
        </Table>
      </div>

    </section>
  );
}
