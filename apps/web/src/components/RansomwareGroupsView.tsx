/**
 * Ransomware group tracker screen — English UI, organisation-level evidence
 * only. No claim hint, e-mail address or person name is displayed here.
 */
import type { RansomwareGroupsResponse } from "../api";

type Props = {
  data: RansomwareGroupsResponse | null;
  loading?: boolean;
  error?: string | null;
};

const numberFormat = new Intl.NumberFormat("en-GB");

function formatDate(value: string | null): string {
  if (!value) return "unknown";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "unknown" : parsed.toISOString().slice(0, 10);
}

export default function RansomwareGroupsView({ data, loading, error }: Props) {
  if (loading && !data) return <section className="corpus"><p className="corpus__meta">Loading groups…</p></section>;
  if (error) return <section className="corpus"><p className="corpus__meta" role="alert">Unable to load groups: {error}</p></section>;
  if (!data) return <section className="corpus"><p className="corpus__meta">No measurement yet.</p></section>;

  return (
    <section className="corpus" aria-labelledby="ransomware-groups-title">
      <header className="corpus__header">
        <h1 id="ransomware-groups-title">Ransomware groups</h1>
        <p className="corpus__meta">
          Groups tracked from our own claims and events. Victims are public organisations located in
          Nouvelle-Aquitaine; no victim personal data is stored or shown.
        </p>
      </header>

      <div className="corpus__panels">
        <article className="corpus__panel">
          <h2>Tracked groups</h2>
          <p className="corpus__hero">{numberFormat.format(data.trackedGroups)}</p>
        </article>
        <article className="corpus__panel">
          <h2>Groups with NA victims</h2>
          <p className="corpus__hero">{numberFormat.format(data.groupsWithNaVictims)}</p>
        </article>
      </div>

      <section className="corpus__panel" aria-labelledby="ransomware-groups-list">
        <h2 id="ransomware-groups-list">Groups and victims</h2>
        <table className="corpus__table">
          <thead>
            <tr>
              <th scope="col">Group</th>
              <th scope="col">Claims</th>
              <th scope="col">NA victims</th>
              <th scope="col">Organisations</th>
            </tr>
          </thead>
          <tbody>
            {data.groups.map((group) => (
              <tr key={group.slug}>
                <th scope="row">{group.name}</th>
                <td>{numberFormat.format(group.claims)}</td>
                <td>{numberFormat.format(group.naVictims)}</td>
                <td>
                  {group.victims.length === 0 ? "—" : group.victims.map((victim) => (
                    <div key={`${victim.orgId}-${victim.matchType}`}>
                      {victim.orgName} (dept {victim.department ?? "?"}, {victim.matchType}, {formatDate(victim.claimedAt)})
                      {victim.sourceUrl ? (
                        <> · <a href={victim.sourceUrl} target="_blank" rel="noreferrer noopener">source</a></>
                      ) : null}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}
