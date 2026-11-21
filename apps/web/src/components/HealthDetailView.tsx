import type { HealthDetail } from "../api";
import { FAMILY_LABEL, formatDate, formatNumber, formatRelative } from "./SourcesView";
import "./health-detail.css";

export type HealthDetailViewProps = {
  detail: HealthDetail | null;
  loading?: boolean;
  error?: string | null;
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
 * sa requête SQL dans `apps/api/src/routes/health-detail.ts`.
 */
export default function HealthDetailView({ detail, loading = false, error = null }: HealthDetailViewProps) {
  if (loading && detail === null) {
    return <section className="health-detail"><p>lecture de l’état du système…</p></section>;
  }
  if (error && detail === null) {
    return <section className="health-detail"><p role="alert">état indisponible : {error}</p></section>;
  }
  if (detail === null || !detail.ok) {
    return <section className="health-detail"><p>état non mesuré</p></section>;
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

      <h3>dernier fait par famille</h3>
      <div className="health-detail__scroll">
        <table className="data">
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
                  <span className="health-detail__tone" data-tone={f.tone}>
                    {f.ageHours === null ? "jamais de fait" : TONE_LABEL[f.tone]}
                  </span>
                </td>
              </tr>
            ))}
            {detail.families.length === 0 && (
              <tr><td colSpan={4}>aucun fait mesuré</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h3>dernière collecte par source</h3>
      <p className="health-detail__legend">
        vert : production sous 24 h · orange : 1 à 7 j · rouge : au-delà ou jamais produit
      </p>
      <div className="health-detail__scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">source</th>
              <th scope="col">famille</th>
              <th scope="col">dernière collecte</th>
              <th scope="col">dernier fait</th>
              <th scope="col">fraîcheur</th>
            </tr>
          </thead>
          <tbody>
            {sources.bySource.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.name}
                  {!s.enabled ? " · désactivée" : ""}
                </td>
                <td>{FAMILY_LABEL[s.family] ?? s.family}</td>
                <td className="mono" title={formatDate(s.lastCollectedAt)}>{formatRelative(s.lastCollectedAt)}</td>
                <td className="mono" title={formatDate(s.lastEventAt)}>{ageLabel(s.ageHours)}</td>
                <td>
                  <span className="health-detail__tone" data-tone={s.tone}>
                    {s.ageHours === null ? "jamais produit" : TONE_LABEL[s.tone]}
                  </span>
                </td>
              </tr>
            ))}
            {sources.bySource.length === 0 && (
              <tr><td colSpan={5}>aucune source déclarée</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
