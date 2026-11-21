/**
 * Audit journal screen.
 *
 * Reads GET /api/journal/review (every decision kind, not only reviews).
 * Filters are debounced and pushed to the API so the server does the work and
 * the CSV export can apply the exact same query. The rows are also filtered
 * locally by a pure function — instant feedback while typing, and a single
 * testable definition of what "filtered" means. Stale requests are cancelled
 * on unmount or when the filters change.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type JournalDecision, type JournalReviewParams } from "../api";
import JournalList, {
  DECISION_UNSPECIFIED, KIND_CATEGORIES, KIND_LABEL, DECISION_LABEL,
  type JournalFilters,
} from "./JournalListe";

export { DECISION_UNSPECIFIED, KIND_CATEGORIES, KIND_LABEL, DECISION_LABEL } from "./JournalListe";
export type { JournalFilters } from "./JournalListe";

const API_LIMIT = 500;
const MAX_ROWS = 10_000;
const ROWS_PER_PAGE = 50;
const SEARCH_DELAY_MS = 250;

/** Transforms the UI filter shape into the API query (and the export query). */
export function journalApiParams(filters: JournalFilters): JournalReviewParams {
  return {
    kind: filters.kind || "all",
    actor: filters.actor?.trim(),
    q: filters.q?.trim(),
    du: filters.from,
    au: filters.to,
  };
}

function searchableText(row: JournalDecision): string {
  return [
    row.sujet, row.acteur, row.resume, row.raison, row.indice, row.decision,
    JSON.stringify(row.preuve ?? {}),
  ].filter(Boolean).join(" ").toLowerCase();
}

/**
 * Pure filter: no mutation, original order preserved.
 * Actor = case-insensitive substring; type = category or exact journal kind;
 * search = case-insensitive substring over subject, actor, summary, reason,
 * decision and the raw evidence; dates = inclusive bounds on the first ten
 * characters of the timestamp (YYYY-MM-DD).
 */
export function filterJournal(
  rows: JournalDecision[],
  filters: JournalFilters,
): JournalDecision[] {
  const actor = filters.actor?.trim().toLowerCase() ?? "";
  const q = filters.q?.trim().toLowerCase() ?? "";
  const kind = (filters.kind?.trim() || "all").toLowerCase();
  const kinds = kind === "all" ? null : KIND_CATEGORIES[kind] ?? [kind];
  const from = filters.from ?? "";
  const to = filters.to ?? "";

  return rows.filter((row) => {
    if (actor && !row.acteur.toLowerCase().includes(actor)) return false;
    if (kinds && !kinds.includes(row.kind)) return false;
    if (q && !searchableText(row).includes(q)) return false;
    const day = row.horodatage.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}

/** HTTP status without asserting an unchecked shape on an unknown error. */
function statusOf(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err && typeof err.status === "number") {
    return err.status;
  }
  return undefined;
}

type Props = {
  onUnauthorized?: () => void;
};

export default function JournalView({ onUnauthorized }: Props) {
  const [rows, setRows] = useState<JournalDecision[]>([]);
  const [filters, setFilters] = useState<JournalFilters>({});
  /** Debounced copy actually sent to the API. */
  const [applied, setApplied] = useState<JournalFilters>({});
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<JournalDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Avoid a second identical request on mount: the initial `applied` object
  // already matches the initial `filters`.
  useEffect(() => {
    const timer = setTimeout(() => {
      setApplied((previous) =>
        previous.actor === filters.actor && previous.kind === filters.kind
        && previous.q === filters.q && previous.from === filters.from
        && previous.to === filters.to ? previous : filters);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setPage(1);
    setSelected(null);

    (async () => {
      const loaded: JournalDecision[] = [];
      let cursor: number | null = null;
      let truncatedResult = false;
      try {
        for (;;) {
          const data = await api.journalReview(
            { ...journalApiParams(applied), limite: API_LIMIT, avant: cursor },
            controller.signal,
          );
          if (controller.signal.aborted) return;

          const remaining = MAX_ROWS - loaded.length;
          loaded.push(...data.rows.slice(0, remaining));
          if (data.rows.length > remaining) truncatedResult = true;
          if (data.avant === null || data.rows.length === 0) break;
          if (loaded.length >= MAX_ROWS || data.avant === cursor) {
            truncatedResult = true;
            break;
          }
          cursor = data.avant;
        }
        setRows(filterJournal(loaded, applied));
        setTruncated(truncatedResult);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        if (statusOf(err) === 401) onUnauthorized?.();
        setError(err instanceof Error ? err.message : "journal unavailable");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [applied, onUnauthorized]);

  const filteredRows = useMemo(() => filterJournal(rows, applied), [rows, applied]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE,
  );

  const changeFilter = useCallback((patch: JournalFilters) => {
    setFilters((previous) => ({ ...previous, ...patch }));
  }, []);

  const reset = useCallback(() => setFilters({}), []);
  const previousPage = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const nextPage = useCallback(() => setPage((p) => Math.min(pageCount, p + 1)), [pageCount]);
  const closeDetail = useCallback(() => setSelected(null), []);

  const exportCsv = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await api.journalExport(journalApiParams(applied));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "journal-review.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      if (statusOf(err) === 401) onUnauthorized?.();
      else if (statusOf(err) === 403) {
        setExportError("CSV export requires administrator access.");
      } else {
        setExportError(`CSV export failed: ${err instanceof Error ? err.message : "unavailable"}`);
      }
    } finally {
      setExporting(false);
    }
  }, [applied, onUnauthorized]);

  return (
    <JournalList
      rows={visibleRows}
      resultCount={filteredRows.length}
      filters={filters}
      onFilterChange={changeFilter}
      onReset={reset}
      truncated={truncated}
      loading={loading}
      error={error}
      page={currentPage}
      pageCount={pageCount}
      onPrevious={previousPage}
      onNext={nextPage}
      selected={selected}
      onSelect={setSelected}
      onCloseDetail={closeDetail}
      onExport={exportCsv}
      exporting={exporting}
      exportError={exportError}
    />
  );
}
