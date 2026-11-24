/**
 * Actor-to-group attribution screen — English UI.
 * Only actor names, public group names, counts and confidence are displayed.
 */
import type { ActorAttributionsResponse } from "../api";
import "./actor-attributions.css";
import { Badge } from "@astryxdesign/core/Badge";
import { Table } from "@astryxdesign/core/Table";

type Props = {
  data: ActorAttributionsResponse | null;
  loading: boolean;
  error: string | null;
};

const numberFormat = new Intl.NumberFormat("en-GB");

export default function ActorAttributionsView({ data, loading, error }: Props) {
  if (loading && !data) {
    return <section className="attrib" role="status">Loading attributions…</section>;
  }
  if (error) {
    return <section className="attrib" role="alert">Unable to load attributions: {error}</section>;
  }
  if (!data) return null;

  return (
    <section className="attrib">
      <header className="attrib__head">
        <h1>Actor to group attribution</h1>
        <p>Actor labels observed in Nouvelle-Aquitaine claims, attributed to tracked groups with an explicit confidence.</p>
      </header>

      <div className="attrib__stats">
        <article>
          <span>Attributions</span>
          <strong>{numberFormat.format(data.total)}</strong>
        </article>
        <article>
          <span>High confidence</span>
          <strong>{numberFormat.format(data.byLevel.high)}</strong>
        </article>
        <article>
          <span>Medium confidence</span>
          <strong>{numberFormat.format(data.byLevel.medium)}</strong>
        </article>
        <article>
          <span>Low confidence</span>
          <strong>{numberFormat.format(data.byLevel.low)}</strong>
        </article>
        <article>
          <span>Average score</span>
          <strong>{data.averageConfidence}</strong>
        </article>
      </div>

      <Table
        className="attrib__table"
        data={data.attributions as unknown as Record<string, unknown>[]}
        idKey="actor"
        density="compact"
        dividers="rows"
        columns={[
          { key: "actor", header: "Actor label" },
          { key: "groupName", header: "Attributed group" },
          { key: "method", header: "Method" },
          { key: "sources", header: "Sources", renderCell: (row) => numberFormat.format(Number(row.sources)) },
          { key: "claims", header: "Claims", renderCell: (row) => numberFormat.format(Number(row.claims)) },
          {
            key: "confidence",
            header: "Confidence",
            renderCell: (row) => (
              <Badge
                variant={row.level === "high" ? "success" : row.level === "medium" ? "warning" : "neutral"}
                label={`${String(row.confidence)} · ${String(row.level)}`}
              />
            ),
          },
        ]}
      />
    </section>
  );
}
