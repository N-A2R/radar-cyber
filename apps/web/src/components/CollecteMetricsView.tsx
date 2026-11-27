import type { AlerteSupervision, CollecteMetrics, CycleCollecte } from "../api";
import { formatDate, formatNumber, formatRelative } from "./SourcesView";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Table } from "@astryxdesign/core/Table";


export type CollecteMetricsViewProps = {
  metrics: CollecteMetrics | null;
  loading?: boolean;
  error?: string | null;
};

const STATUT: Record<CycleCollecte["statut"], { label: string; tone: string }> = {
  ok: { label: "ok", tone: "green" },
  degraded: { label: "dégradé", tone: "orange" },
  error: { label: "échoué", tone: "red" },
};

function duree(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

function megabytes(octets: number): string {
  return `${formatNumber(Math.round(octets / 1024 / 1024))} Mo`;
}

/** Historique et alertes de la collecte, tels que renvoyés par l'API. */
export default function CollecteMetricsView({ metrics, loading = false, error = null }: CollecteMetricsViewProps) {
  if (loading && metrics === null) {
    return <section className="health-detail"><p>lecture de la supervision de la collecte…</p></section>;
  }
  if (error && metrics === null) {
    return <section className="health-detail"><p role="alert">supervision indisponible : {error}</p></section>;
  }
  if (metrics === null) {
    return <section className="health-detail"><p>supervision non mesurée</p></section>;
  }

  const { resume } = metrics;
  const chiffres: { label: string; value: string; note: string }[] = [
    { label: "cycles / 24 h", value: formatNumber(resume.cycles), note: `dont ${formatNumber(resume.cyclesEchoues)} échoué(s)` },
    { label: "durée moyenne", value: duree(resume.dureeMoyenneMs), note: `max ${duree(resume.dureeMaxMs)}` },
    { label: "sources ok", value: formatNumber(resume.sourcesOk), note: "runs réussis cumulés" },
    { label: "sources en erreur", value: formatNumber(resume.sourcesError), note: "runs en échec cumulés" },
    { label: "éléments collectés", value: formatNumber(resume.itemsIn), note: `${formatNumber(resume.itemsNew)} nouveau(x)` },
    { label: "mémoire max", value: megabytes(resume.memoireMaxOctets), note: "RSS du processus API" },
  ];

  return (
    <section className="health-detail" aria-label="supervision de la collecte">
      <header>
        <h2>supervision de la collecte</h2>
        <p>
          historique des cycles · {formatDate(metrics.generatedAt)} · fenêtre {metrics.fenetreHeures} h
        </p>
      </header>

      <dl className="health-detail__metrics">
        {chiffres.map((m) => (
          <Card variant="transparent" padding={0} className="health-detail__metric" key={m.label}>
            <dt>{m.label}</dt>
            <dd>{m.value}</dd>
            <span>{m.note}</span>
          </Card>
        ))}
      </dl>

      <h3>alertes de supervision</h3>
      {metrics.alertes.length === 0 ? (
        <p className="health-detail__legend">aucune alerte sur les cycles affichés.</p>
      ) : (
        <Card variant="transparent" padding={0} className="health-detail__scroll">
          <Table className="data" density="compact" dividers="rows">
            <thead>
              <tr>
                <th scope="col">alerte</th>
                <th scope="col">cible</th>
                <th scope="col">gravité</th>
                <th scope="col">date</th>
              </tr>
            </thead>
            <tbody>
              {metrics.alertes.map((alerte: AlerteSupervision) => (
                <tr key={alerte.id}>
                  <td>{alerte.titre}</td>
                  <td className="mono">
                    {alerte.sourceId ?? (alerte.cycleId === null ? "—" : `cycle ${alerte.cycleId}`)}
                  </td>
                  <td className="num">{alerte.severite}</td>
                  <td className="mono" title={formatDate(alerte.createdAt)}>{formatRelative(alerte.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <h3>derniers cycles</h3>
      {metrics.cycles.length === 0 ? (
        <p className="health-detail__legend">aucun cycle enregistré.</p>
      ) : (
        <Card variant="transparent" padding={0} className="health-detail__scroll">
          <Table className="data" density="compact" dividers="rows">
            <thead>
              <tr>
                <th scope="col">cycle</th>
                <th scope="col">fin</th>
                <th scope="col">état</th>
                <th scope="col">durée</th>
                <th scope="col">sources ok / erreur</th>
                <th scope="col">éléments</th>
                <th scope="col">mémoire</th>
              </tr>
            </thead>
            <tbody>
              {metrics.cycles.map((cycle) => {
                const statut = STATUT[cycle.statut];
                return (
                  <tr key={cycle.id}>
                    <td className="mono">#{cycle.id}</td>
                    <td className="mono" title={formatDate(cycle.finishedAt)}>{formatRelative(cycle.finishedAt)}</td>
                    <td>
                      <Badge className="health-detail__tone" data-tone={statut.tone}
                        variant={statut.tone === "green" ? "success" : statut.tone === "orange" ? "warning" : "error"}
                        label={statut.label} />
                    </td>
                    <td className="mono">{duree(cycle.dureeMs)}</td>
                    <td className="num">{cycle.sourcesOk} / {cycle.sourcesError}</td>
                    <td className="num">{formatNumber(cycle.itemsIn)} <span style={{ color: "var(--muted)" }}>({formatNumber(cycle.itemsNew)})</span></td>
                    <td className="num">{megabytes(cycle.memoireRssOctets)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </section>
  );
}
