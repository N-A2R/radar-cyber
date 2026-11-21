/**
 * Audit journal table — pure rendering component.
 *
 * Every filter, state (loading, error, empty), detail panel and export control
 * is visible without an API, so the screen can be verified through SSR.
 */
import type { JournalDecision } from "../api";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import "./journal.css";

/** Select value for facts with no recorded decision. */
export const DECISION_UNSPECIFIED = "unspecified";

export type JournalFilters = {
  actor?: string;
  kind?: string;
  q?: string;
  from?: string;
  to?: string;
};

/** Categories mirrored from the API — the same kinds must be filtered on both sides. */
export const KIND_CATEGORIES: Record<string, readonly string[]> = {
  review: ["review.decided"],
  publication: ["org.created", "alert.changed", "event.admitted"],
  correction: ["org.changed", "match.refuse", "match.decided", "event.rattachement"],
};

export const DECISION_LABEL: Record<Exclude<JournalDecision["decision"], null>, string> = {
  accepter: "Accepted",
  refuser: "Rejected",
  creer: "Created",
};

/** Labels are translations of stored kinds; an unknown kind is shown verbatim. */
export const KIND_LABEL: Record<string, string> = {
  "review.decided": "Review decision",
  "org.created": "Organisation created",
  "org.changed": "Organisation correction",
  "alert.changed": "Alert change",
  "event.admitted": "Event admitted",
  "event.rattachement": "Organisation link",
  "match.decided": "Match decision",
  "match.refuse": "Match rejected",
  "referentiel.charged": "Reference data loaded",
  "source.changed": "Source change",
  "source.morte": "Source retired",
  "journal.lacune": "Journal gap",
  "event.purge": "Event purge",
};

/** Payload keys that carry the proof; everything else is context. */
const PROOF_KEYS: Record<string, true> = {
  preuve: true,
  proof: true,
  evidence: true,
};

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function EntryDetails({ row }: { row: JournalDecision }) {
  const entrees = Object.entries(row.preuve ?? {});
  const preuves = entrees.filter(([key]) => key in PROOF_KEYS);
  const contexte = entrees.filter(([key]) => !(key in PROOF_KEYS));

  return (
    <aside className="journal__detail" aria-label={`Details of journal entry ${row.id}`}>
      <header className="journal__detail-head">
        <h2>Entry #{row.id}</h2>
        <span className="journal__kind" data-kind={row.kind}>
          {KIND_LABEL[row.kind] ?? row.kind}
        </span>
      </header>

      <dl className="journal__detail-meta">
        <dt>Date (UTC)</dt>
        <dd>{row.horodatage}</dd>
        <dt>Actor</dt>
        <dd>{row.acteur}</dd>
        <dt>Decision</dt>
        <dd>{row.decision ? DECISION_LABEL[row.decision] : "Not specified"}</dd>
        <dt>Subject</dt>
        <dd>{row.sujet}</dd>
        <dt>Summary</dt>
        <dd>{row.resume ?? "—"}</dd>
        <dt>Reason</dt>
        <dd>{row.raison ?? "No reason recorded for this entry."}</dd>
      </dl>

      <section className="journal__detail-section">
        <h3>Evidence</h3>
        {preuves.length === 0
          ? <p className="journal__detail-empty">No evidence recorded for this entry.</p>
          : (
            <dl className="journal__detail-values">
              {preuves.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd><pre>{formatValue(value)}</pre></dd>
                </div>
              ))}
            </dl>
          )}
      </section>

      <section className="journal__detail-section">
        <h3>Context</h3>
        {contexte.length === 0
          ? <p className="journal__detail-empty">No additional context recorded.</p>
          : (
            <dl className="journal__detail-values">
              {contexte.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd><pre>{formatValue(value)}</pre></dd>
                </div>
              ))}
            </dl>
          )}
      </section>
    </aside>
  );
}

type Props = {
  rows: JournalDecision[];
  /** Entries kept after filtering, across all pages. */
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
  selected: JournalDecision | null;
  onSelect: (row: JournalDecision) => void;
  onCloseDetail: () => void;
  onExport: () => void;
  exporting: boolean;
  exportError: string | null;
  /** Relance la lecture du journal depuis l'état vide. */
  onRetry?: () => void;
};

export default function JournalList({
  rows, resultCount, filters, onFilterChange, onReset, truncated,
  loading, error, page, pageCount, onPrevious, onNext,
  selected, onSelect, onCloseDetail, onExport, exporting, exportError, onRetry,
}: Props) {
  const hasFilters = Boolean(
    filters.actor || filters.q || (filters.kind && filters.kind !== "all") || filters.from || filters.to,
  );

  return (
    <section className="journal" aria-label="Audit journal">
      <header className="journal__head">
        <div>
          <h1>Journal</h1>
          <p className="journal__count">
            Auditable record of decisions — reviews, publications and corrections, newest first
          </p>
        </div>
        <button
          type="button"
          className="journal__export"
          onClick={onExport}
          disabled={loading || exporting}
        >
          {exporting ? "Preparing CSV…" : "Export filtered CSV"}
        </button>
      </header>

      <div className="journal__filters" role="group" aria-label="Filter the journal">
        <div className="journal__field journal__field--search">
          <label htmlFor="journal-q">Search</label>
          <input
            id="journal-q"
            type="search"
            placeholder="subject, actor, reason, evidence…"
            value={filters.q ?? ""}
            onChange={(event) => onFilterChange({ q: event.target.value })}
          />
        </div>
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
          <label htmlFor="journal-kind">Type</label>
          <select
            id="journal-kind"
            value={filters.kind ?? "all"}
            onChange={(event) => onFilterChange({ kind: event.target.value })}
          >
            <option value="all">All types</option>
            <option value="review">Review decisions</option>
            <option value="publication">Publications</option>
            <option value="correction">Corrections</option>
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
        <button type="button" className="journal__reset" onClick={onReset}>Reset</button>
      </div>

      {truncated ? (
        <p className="journal__truncated" role="status">
          Showing the 10,000 most recent entries only. Narrow the period or type to reach older ones.
        </p>
      ) : null}
      {error ? <p className="journal__error" role="alert">API: {error}</p> : null}
      {exportError ? <p className="journal__error" role="alert">{exportError}</p> : null}
      {loading ? <LoadingSkeleton label="Chargement du journal…" /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          message={hasFilters ? "No journal entries match these filters." : "No journal entries recorded yet."}
          actionLabel={onRetry ? "Recharger le journal" : "Page précédente"}
          onAction={onRetry ?? onPrevious}
        />
      ) : null}

      <div className="journal__scroll">
        <table className="journal__table">
          <thead>
            <tr>
              <th scope="col">Date (UTC)</th>
              <th scope="col">Type</th>
              <th scope="col">Actor</th>
              <th scope="col">Decision</th>
              <th scope="col">Summary</th>
              <th scope="col"><span className="journal__sr-only">Details</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="journal__row">
                <td>
                  {/* `recorded_at::text` arrives as `2026-11-21 14:03:12+00`;
                      slicing avoids inventing a timezone through `Date`. */}
                  <time dateTime={row.horodatage}>
                    {row.horodatage.slice(0, 16).replace("T", " ")} UTC
                  </time>
                </td>
                <td>
                  <span className="journal__kind" data-kind={row.kind}>
                    {KIND_LABEL[row.kind] ?? row.kind}
                  </span>
                </td>
                <td>{row.acteur}</td>
                <td>
                  <span className="journal__decision" data-decision={row.decision ?? DECISION_UNSPECIFIED}>
                    {row.decision ? DECISION_LABEL[row.decision] : "Not specified"}
                  </span>
                </td>
                <td>{row.resume ?? row.raison ?? row.indice ?? "—"}</td>
                <td>
                  <button
                    type="button"
                    className="journal__open"
                    onClick={() => onSelect(row)}
                    aria-label={`Open details of journal entry ${row.id}`}
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="journal__foot">
        <button type="button" onClick={onPrevious} disabled={loading || page <= 1}>
          Previous
        </button>
        <span>
          {resultCount} {resultCount === 1 ? "entry" : "entries"} — page {page} / {pageCount}
        </span>
        <button type="button" onClick={onNext} disabled={loading || page >= pageCount}>
          Next
        </button>
      </footer>

      {selected ? (
        <>
          <div className="journal__backdrop" onClick={onCloseDetail} aria-hidden="true" />
          <div className="journal__detail-wrap">
            <button
              type="button"
              className="journal__detail-close"
              onClick={onCloseDetail}
            >
              Close details
            </button>
            <EntryDetails row={selected} />
          </div>
        </>
      ) : null}
    </section>
  );
}
