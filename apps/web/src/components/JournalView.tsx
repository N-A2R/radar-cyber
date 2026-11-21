/**
 * Journal screen: reads GET /api/journal/review read-only.
 *
 * API pages of 500 rows are accumulated until the `before` cursor is exhausted
 * (documented cap of 10,000 rows), then filtered and paginated in the browser
 * in pages of 50. The AbortController cancels stale requests on unmount.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type JournalDecision } from "../api";
import JournalList, { type JournalFilters } from "./JournalListe";
import { filterJournal } from "./journalFilter";

export { DECISION_UNSPECIFIED } from "./JournalListe";
export type { JournalFilters } from "./JournalListe";
export { filterJournal } from "./journalFilter";

const API_LIMIT = 500;
const MAX_ROWS = 10_000;
const ROWS_PER_PAGE = 50;

type Props = {
  onUnauthorized?: () => void;
};

export default function JournalView({ onUnauthorized }: Props) {
  const [rows, setRows] = useState<JournalDecision[]>([]);
  const [filters, setFilters] = useState<JournalFilters>({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    (async () => {
      const loaded: JournalDecision[] = [];
      let cursor: number | null = null;
      let truncatedResult = false;
      try {
        for (;;) {
          const data = await api.journalReview(API_LIMIT, cursor, controller.signal);
          if (controller.signal.aborted) return;

          const remaining = MAX_ROWS - loaded.length;
          loaded.push(...data.rows.slice(0, remaining));
          if (data.rows.length > remaining) truncatedResult = true;
          if (data.nextCursor === null || data.rows.length === 0) break;
          if (loaded.length >= MAX_ROWS || data.nextCursor === cursor) {
            // Cursor exhausted by the cap or not progressing: stop here.
            truncatedResult = true;
            break;
          }
          cursor = data.nextCursor;
        }
        setRows(loaded);
        setTruncated(truncatedResult);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        if (typeof err === "object" && err !== null && "status" in err && err.status === 401) {
          onUnauthorized?.();
        }
        setError(err instanceof Error ? err.message : "journal unavailable");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [onUnauthorized]);

  const filteredRows = useMemo(() => filterJournal(rows, filters), [rows, filters]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE,
  );

  const changeFilter = useCallback((patch: JournalFilters) => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({});
    setPage(1);
  }, []);

  const goToPrevious = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const goToNext = useCallback(() => setPage((p) => Math.min(pageCount, p + 1)), [pageCount]);

  return (
    <JournalList
      rows={visibleRows}
      resultCount={filteredRows.length}
      filters={filters}
      onFilterChange={changeFilter}
      onReset={resetFilters}
      truncated={truncated}
      loading={loading}
      error={error}
      page={currentPage}
      pageCount={pageCount}
      onPrevious={goToPrevious}
      onNext={goToNext}
    />
  );
}
