/**
 * Écran des attributions acteur → groupe — interface en français.
 * Seuls les noms d'acteurs, les noms publics de groupes, les comptages et la
 * confiance sont affichés : aucun indice sur une revendication ou une victime.
 */
import type { ActorAttributionsResponse } from "../api";
import "./actor-attributions.css";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Table } from "@astryxdesign/core/Table";
import { EmptyState, LoadingSkeleton } from "./Skeleton";

type Props = {
  data: ActorAttributionsResponse | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
};

const numberFormat = new Intl.NumberFormat("fr-FR");
const scoreFormat = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** L'API renvoie un score sur 100 : 97,1 signifie 97,1 %. */
function formatScore(value: number, total: number): string {
  if (!Number.isFinite(value) || total <= 0) return "non mesuré";
  return `${scoreFormat.format(value)} %`;
}

const NIVEAUX: Record<string, string> = {
  high: "élevée",
  medium: "moyenne",
  low: "faible",
};

const METHODES: Record<string, string> = {
  alias: "Alias",
  exact: "Correspondance exacte",
};

export default function ActorAttributionsView({ data, loading, error, onRetry }: Props) {
  const recharger = onRetry ?? (() => window.location.reload());

  const header = (
    <header className="attrib__head">
      <h1>Attributions d'acteurs à des groupes</h1>
      <p>
        Libellés d'acteurs observés dans des revendications de Nouvelle-Aquitaine, attribués à des
        groupes suivis avec une confiance explicite.
      </p>
    </header>
  );

  if (loading && !data) {
    return (
      <section className="attrib" aria-label="Attributions acteur à groupe">
        {header}
        <LoadingSkeleton label="Chargement des attributions…" />
      </section>
    );
  }
  if (error) {
    return (
      <section className="attrib" aria-label="Attributions acteur à groupe">
        {header}
        <EmptyState
          className="attrib__etat"
          role="alert"
          message={`Impossible de charger les attributions : ${error}`}
          actionLabel="Recharger les attributions"
          onAction={recharger}
        />
      </section>
    );
  }
  if (!data || data.attributions.length === 0) {
    return (
      <section className="attrib" aria-label="Attributions acteur à groupe">
        {header}
        <EmptyState
          className="attrib__etat"
          message="Aucune attribution mesurée pour le moment."
          actionLabel="Recharger les attributions"
          onAction={recharger}
        />
      </section>
    );
  }

  return (
    <section className="attrib">
      {header}

      <Card className="attrib__resume" padding={3}>
        <dl className="attrib__stats">
          <Card variant="transparent" padding={0} className="attrib__stat">
            <dt>Attributions</dt>
            <dd>{numberFormat.format(data.total)}</dd>
          </Card>
          <Card variant="transparent" padding={0} className="attrib__stat">
            <dt>Confiance élevée</dt>
            <dd>{numberFormat.format(data.byLevel.high)}</dd>
          </Card>
          <Card variant="transparent" padding={0} className="attrib__stat">
            <dt>Confiance moyenne</dt>
            <dd>{numberFormat.format(data.byLevel.medium)}</dd>
          </Card>
          <Card variant="transparent" padding={0} className="attrib__stat">
            <dt>Confiance faible</dt>
            <dd>{numberFormat.format(data.byLevel.low)}</dd>
          </Card>
          <Card variant="transparent" padding={0} className="attrib__stat">
            <dt>Score moyen</dt>
            <dd>{formatScore(data.averageConfidence, data.total)}</dd>
          </Card>
        </dl>
      </Card>

      <Table
        className="attrib__table"
        data={data.attributions as unknown as Record<string, unknown>[]}
        idKey="actor"
        density="compact"
        dividers="rows"
        columns={[
          { key: "actor", header: "Libellé d'acteur" },
          { key: "groupName", header: "Groupe attribué" },
          {
            key: "method",
            header: "Méthode",
            renderCell: (row) => METHODES[String(row.method)] ?? String(row.method),
          },
          { key: "sources", header: "Sources", renderCell: (row) => numberFormat.format(Number(row.sources)) },
          { key: "claims", header: "Revendications", renderCell: (row) => numberFormat.format(Number(row.claims)) },
          {
            key: "confidence",
            header: "Confiance",
            renderCell: (row) => (
              <Badge
                variant={row.level === "high" ? "success" : row.level === "medium" ? "warning" : "neutral"}
                label={`${numberFormat.format(Number(row.confidence))} % · ${NIVEAUX[String(row.level)] ?? String(row.level)}`}
              />
            ),
          },
        ]}
      />
    </section>
  );
}
