/**
 * Actor-to-group attribution screen — English UI.
 * Only actor names, public group names, counts and confidence are displayed.
 */
import type { ActorAttributionsResponse } from "../api";
import "./actor-attributions.css";

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

      <table className="attrib__table">
        <thead>
          <tr>
            <th scope="col">Actor label</th>
            <th scope="col">Attributed group</th>
            <th scope="col">Method</th>
            <th scope="col">Sources</th>
            <th scope="col">Claims</th>
            <th scope="col">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {data.attributions.map((item) => (
            <tr key={item.actor}>
              <td>{item.actor}</td>
              <td>{item.groupName}</td>
              <td>{item.method}</td>
              <td>{numberFormat.format(item.sources)}</td>
              <td>{numberFormat.format(item.claims)}</td>
              <td>
                <span className={`attrib__badge attrib__badge--${item.level}`}>
                  {item.confidence} · {item.level}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
