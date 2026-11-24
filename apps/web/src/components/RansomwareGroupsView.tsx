/**
 * Ransomware group tracker screen — English UI, organisation-level evidence
 * only. No claim hint, e-mail address or person name is displayed here.
 */
import type { RansomwareGroupsResponse } from "../api";
import { Table } from "@astryxdesign/core/Table";

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
        <Table
          className="corpus__table"
          data={data.groups as unknown as Record<string, unknown>[]}
          idKey="slug"
          density="compact"
          dividers="rows"
          columns={[
            { key: "name", header: "Group" },
            { key: "claims", header: "Claims", renderCell: (row) => numberFormat.format(Number(row.claims)) },
            { key: "naVictims", header: "NA victims", renderCell: (row) => numberFormat.format(Number(row.naVictims)) },
            {
              key: "victims",
              header: "Organisations",
              renderCell: (row) => {
                const victims = (row.victims ?? []) as Array<{
                  orgId: string;
                  orgName: string;
                  department: string | null;
                  matchType: string;
                  claimedAt: string | null;
                  sourceUrl: string | null;
                }>;
                if (victims.length === 0) return "—";
                return victims.map((victim) => (
                  <div key={`${victim.orgId}-${victim.matchType}`}>
                    {victim.orgName} (dept {victim.department ?? "?"}, {victim.matchType}, {formatDate(victim.claimedAt)})
                    {victim.sourceUrl ? (
                      <> · <a href={victim.sourceUrl} target="_blank" rel="noreferrer noopener">source</a></>
                    ) : null}
                  </div>
                ));
              },
            },
          ]}
        />
      </section>
    </section>
  );
}
