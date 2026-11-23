/**
 * Écran du journal d'audit.
 *
 * Lit GET /api/journal/review (toutes les décisions, pas seulement les revues).
 * Une seule requête par page affichée : la pagination du bas change `offset`
 * et le serveur rend les lignes de cette page avec le total filtré. Les
 * filtres sont temporisés (250 ms), repartent en page 1 et sont appliqués en
 * SQL — plus de tampon accumulé côté client. La requête en cours est annulée
 * quand les filtres, la page ou l'écran changent.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useScreenExport } from "./ExportMenu";
import { api, type JournalDecision, type JournalReviewParams, type JournalReviewResponse } from "../api";
import JournalList, {
  DECISION_UNSPECIFIED, KIND_CATEGORIES, KIND_LABEL, DECISION_LABEL,
  type JournalFilters,
} from "./JournalListe";

export { DECISION_UNSPECIFIED, KIND_CATEGORIES, KIND_LABEL, DECISION_LABEL } from "./JournalListe";
export type { JournalFilters } from "./JournalListe";

/** Taille d'une page : assez de lignes pour lire, assez peu pour répondre vite. */
export const ROWS_PER_PAGE = 50;
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
 *
 * Le serveur applique déjà ces règles : cette fonction reste la définition
 * testable de « filtré » et n'est plus utilisée pour tronquer la page reçue.
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
  const [filters, setFilters] = useState<JournalFilters>({});
  /** Copie temporisée réellement envoyée à l'API. */
  const [applied, setApplied] = useState<JournalFilters>({});
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<JournalReviewResponse | null>(null);
  useScreenExport("journal", (result?.rows ?? []).map((entry) => ({
    date: entry.horodatage, kind: entry.kind, actor: entry.acteur,
    target: entry.sujet, decision: entry.decision,
  })));
  const [selected, setSelected] = useState<JournalDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [reloadSignal, setReloadSignal] = useState(0);

  // Le debounce ne relance rien tant que les filtres n'ont pas changé ; quand
  // ils changent, on revient page 1 dans le même rendu pour éviter une requête
  // intermédiaire sur l'ancienne page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setApplied((previous) =>
        previous.actor === filters.actor && previous.kind === filters.kind
        && previous.q === filters.q && previous.from === filters.from
        && previous.to === filters.to ? previous : filters);
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [filters]);

  // Une requête par page affichée. `offset` saute directement à la page
  // demandée : le serveur rend les lignes et le total correspondant aux filtres.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSelected(null);

    (async () => {
      try {
        const data = await api.journalReview(
          {
            ...journalApiParams(applied),
            limit: ROWS_PER_PAGE,
            offset: (page - 1) * ROWS_PER_PAGE,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setResult(data);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        if (statusOf(err) === 401) onUnauthorized?.();
        setResult(null);
        setError(err instanceof Error ? err.message : "journal indisponible");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [applied, page, onUnauthorized, reloadSignal]);

  const rows = useMemo(() => result?.rows ?? [], [result]);
  const total = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);

  // Un filtre peut réduire le total sous la page courante : on borne la page.
  useEffect(() => {
    if (!loading && result && page > pageCount) setPage(pageCount);
  }, [loading, result, page, pageCount]);

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
      rows={rows}
      total={total}
      filters={filters}
      onFilterChange={changeFilter}
      onReset={reset}
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
      onRetry={() => setReloadSignal((n) => n + 1)}
    />
  );
}
