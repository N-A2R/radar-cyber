/**
 * "Am I affected?" — evidence-first view of one organization.
 *
 * Everything rendered here comes from the structured `AffectedReport`: a
 * statement's category, label, value, clock and evidence metadata. Free text
 * (limitations, event titles, contact details) is deliberately never printed,
 * so no victim's personal data can reach this screen.
 */
import { useEffect, useState, type FormEvent } from "react";
import type { AffectedReport } from "../api";

type Statement = AffectedReport["statements"][number];
type Category = Statement["category"];
type Status = Statement["evidence"]["status"];

const CATEGORY_LABEL: Record<Category, string> = {
  identity: "Identity",
  location: "Location",
  activity: "Activity",
  incident: "Incident",
  claim: "Claim",
};

const STATUS_LABEL: Record<Status, string> = {
  "official-record": "Official record",
  reported: "Reported",
  "unverified-claim": "Unverified claim",
};

export type AffectedViewProps = {
  report?: AffectedReport | null;
  loading?: boolean;
  error?: string | null;
  query?: string;
  onQueryChange?: (q: string) => void;
  onSubmit?: (q: string) => void;
};

function StatementRow({ statement }: { statement: Statement }) {
  const { evidence, observedAt } = statement;
  return (
    <li className="affected__statement" data-category={statement.category}>
      <p className="affected__statement-head">
        <span className="affected__category" data-category={statement.category}>
          {CATEGORY_LABEL[statement.category] ?? statement.category}
        </span>
        <span className="affected__statement-label">{statement.label}</span>
      </p>
      <p className="affected__statement-value">{statement.value}</p>
      {observedAt ? (
        <p className="affected__observed">
          Observed: <time dateTime={observedAt}>{observedAt}</time>
        </p>
      ) : null}
      <p className="affected__evidence-title">Evidence</p>
      <dl className="affected__evidence" data-kind={evidence.kind}>
        <dt>Publisher</dt>
        <dd className="affected__publisher">{evidence.label}</dd>
        <dt>Reference</dt>
        <dd className="affected__reference">{evidence.reference}</dd>
        <dt>Status</dt>
        <dd>
          <span
            className={`affected__status affected__status--${evidence.status}`}
            data-status={evidence.status}
            title={evidence.status}
          >
            {STATUS_LABEL[evidence.status] ?? evidence.status}
          </span>
        </dd>
        {evidence.url ? (
          <>
            <dt>Source</dt>
            <dd className="affected__source">
              <a href={evidence.url} target="_blank" rel="noopener noreferrer">{evidence.url}</a>
            </dd>
          </>
        ) : null}
      </dl>
    </li>
  );
}

export default function AffectedView({
  report,
  loading = false,
  error = null,
  query,
  onQueryChange,
  onSubmit,
}: AffectedViewProps) {
  // The parent may own the query (URL, App state) or leave it entirely local.
  const [localQuery, setLocalQuery] = useState(query ?? "");
  useEffect(() => {
    if (query !== undefined) setLocalQuery(query);
  }, [query]);

  const handleChange = (next: string) => {
    setLocalQuery(next);
    onQueryChange?.(next);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit?.(localQuery);
  };

  const statements = report?.statements ?? [];
  const summary = report?.summary;

  return (
    <section className="affected" data-view="affected" aria-labelledby="affected-title">
      <header className="affected__header">
        <h2 id="affected-title">Am I affected?</h2>
        <p className="affected__scope">Nouvelle-Aquitaine only</p>
        <p className="affected__privacy">No victim personal data is displayed.</p>
      </header>

      <form className="affected__form" onSubmit={handleSubmit}>
        <label className="affected__query-label" htmlFor="affected-query">Organization</label>
        <input
          id="affected-query"
          className="affected__query"
          name="organization"
          type="search"
          value={localQuery}
          onChange={(event) => handleChange(event.target.value)}
          placeholder="Name, identifier or domain"
        />
        <button className="affected__check" type="submit">Check</button>
      </form>

      {loading ? <p className="affected__loading" role="status">Loading report...</p> : null}
      {error ? <p className="affected__error" role="alert">Error: {error}</p> : null}
      {!loading && !error && !report ? (
        <p className="affected__empty">Enter an organization name, identifier or domain to check.</p>
      ) : null}

      {report ? (
        <div className="affected__result">
          <p className="affected__organization">{report.organization.name}</p>
          <p className="affected__summary">
            {summary?.statements ?? 0} statements / {summary?.withEvidence ?? 0} with evidence / {summary?.sources ?? 0} sources
          </p>
          {statements.length === 0 ? (
            <p className="affected__no-statements">No statements recorded for this organization.</p>
          ) : (
            <ul className="affected__statements">
              {statements.map((statement) => (
                <StatementRow key={statement.id} statement={statement} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
