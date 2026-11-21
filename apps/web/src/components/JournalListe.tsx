/**
 * Table of review decisions recorded in the journal.
 * Pure rendering component: filters, states (loading, error, empty) and
 * pagination are visible without an API, so they can be checked via SSR.
 */
import type { JournalDecision } from "../api";
import "./journal.css";

/** Select value for facts with no recorded decision. */
export const DECISION_UNSPECIFIED = "unspecified";

export type JournalFilters = {
  actor?: string;
  decision?: string | null;
  from?: string;
  to?: string;
};

export const DECISION_LABEL: Record<Exclude<JournalDecision["decision"], null>, string> = {
  accepter: "Accept",
  refuser: "Reject",
  creer: "Create",
};

type Props = {
  rows: JournalDecision[];
  /** Number of rows kept after filtering, across all pages. */
  resultCount: number;
  filters: JournalFilters;
  onFilterChange: (patch: JournalFilters) => void;
  onReset: () => void;
  /** The journal exceeds the 10,000-row loading cap. */
  truncated: boolean;
  loading: boolean;
  error: string | null;
  page: number;
  pageCount: number;
  onPrevious: () => void;
  onNext: () => void;
};

export default function JournalList({
  rows, resultCount, filters, onFilterChange, onReset, truncated,
  loading, error, page, pageCount, onPrevious, onNext,
}: Props) {
  return (
    <section className="journal" aria-label="Review decision journal">
      <header className="journal__head">
        <h1>Journal</h1>
        <p className="journal__count">review decisions recorded, most recent first</p>
      </header>

      <div className="journal__filters" role="group" aria-label="Filter journal">
        <div className="journal__field">
          <label htmlFor="journal-actor">Actor</label>
          <input
            id="journal-actor"
            type="search"
            placeholder="name or part of a name…"
            value={filters.actor ?? ""}
            onChange={(event) => onFilterChange({ actor: event.target.value })}
          />
        </div>
        <div className="journal__field">
          <label htmlFor="journal-decision">Decision</label>
          <select
            id="journal-decision"
            value={filters.decision ?? ""}
            onChange={(event) => onFilterChange({ decision: event.target.value || undefined })}
          >
            <option value="">All</option>
            {(Object.keys(DECISION_LABEL) as Array<keyof typeof DECISION_LABEL>).map((d) => (
              <option key={d} value={d}>{DECISION_LABEL[d]}</option>
            ))}
            <option value={DECISION_UNSPECIFIED}>Not specified</option>
          </select>
        </div>
        <div className="journal__field">
          <label htmlFor="journal-from">From</label>
          <input
            id="journal-from"
            type="date"
            value={filters.from ?? ""}
            onChange={(event) => onFilterChange({ from: event.target.value })}
          />
        </div>
        <div className="journal__field">
          <label htmlFor="journal-to">To</label>
          <input
            id="journal-to"
            type="date"
            value={filters.to ?? ""}
            onChange={(event) => onFilterChange({ to: event.target.value })}
          />
        </div>
        <button type="button" onClick={onReset}>Reset</button>
      </div>

      {truncated ? (
        <p className="journal__truncated" role="status">
          Journal truncated to the 10,000 most recent decisions: filter to reach the others.
        </p>
      ) : null}
      {error ? <p className="journal__error" role="alert">API: {error}</p> : null}
      {loading ? <p className="journal__state" role="status">Loading journal…</p> : null}
      {!loading && !error && rows.length === 0
        ? <p className="journal__state">no decisions recorded</p>
        : null}

      <div className="journal__scroll">
        <table className="journal__table">
          <thead>
            <tr>
              <th scope="col">Timestamp</th>
              <th scope="col">Actor</th>
              <th scope="col">Decision</th>
              <th scope="col">Clue</th>
              <th scope="col">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {/* `recorded_at::text` arrives as `2026-11-21 14:03:12+00`:
                      truncate it without inventing a time zone via `Date`. */}
                  <time dateTime={row.horodatage}>
                    {row.horodatage.slice(0, 16).replace("T", " ")}
                  </time>
                </td>
                <td>{row.acteur}</td>
                <td>
                  <span className="journal__decision" data-decision={row.decision ?? "unknown"}>
                    {row.decision ? DECISION_LABEL[row.decision] : "Not specified"}
                  </span>
                </td>
                <td>{row.indice ?? "—"}</td>
                <td>{row.raison ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="journal__foot">
        <button type="button" onClick={onPrevious} disabled={loading || page <= 1}>
          Previous
        </button>
        <span>{resultCount} result{resultCount > 1 ? "s" : ""} — page {page} / {pageCount}</span>
        <button type="button" onClick={onNext} disabled={loading || page >= pageCount}>
          Next
        </button>
      </footer>
    </section>
  );
}
