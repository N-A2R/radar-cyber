import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { api, ApiError, type QuarantineRaw, type ReviewAction, type ReviewQueueResponse, type ReviewRow as ApiReviewRow } from "../api";
import { isReviewTypingTarget, reduceSelection, reviewIntent, type ReviewKeyState } from "../review-keys";
import { Dialog } from "@astryxdesign/core/Dialog";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import { useScreenExport } from "./ExportMenu";
import "./review.css";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { type ReviewUrlState, type RevueBucket } from "../url-state";
export type { RevueBucket } from "../url-state";

export type RevueDecision = "accepter" | "refuser" | "creer";


export type RevueCandidate = {
  id: number;
  name: string;
  score: number;
  via: string;
  city: string | null;
  dept: string | null;
};

/** Vue locale d'une ligne `/quarantine/queue`, avec les candidats affichés. */
export type RevueRow = Omit<ApiReviewRow, "candidates" | "rejectRule" | "city" | "dept"> & {
  candidates: RevueCandidate[];
  rejectRule: string | null;
  city: string | null;
  dept: string | null;
};

export type RevueQueue = Omit<ReviewQueueResponse, "rows"> & { rows: RevueRow[] };

/**
 * La route `/quarantine/queue` joint les candidats quand elle est enrichie ;
 * sinon le rapprochement serveur est déjà porté par `org`. On n'invente jamais
 * un candidat absent : l'UI affiche ce que le serveur a réellement trouvé.
 */
function versRevueRow(row: ApiReviewRow): RevueRow {
  const candidats: RevueCandidate[] = row.candidates ?? (
    row.org
      ? [{ id: row.org.id, name: row.org.name, score: row.orgConfidence ?? 0, via: "rapprochement", city: row.org.city, dept: null }]
      : []
  );
  return {
    ...row,
    candidates: candidats,
    rejectRule: row.rejectRule ?? null,
    city: row.city ?? row.org?.city ?? null,
    dept: row.dept ?? null,
  };
}

/** Décisions historiques de l'écran → actions canoniques de la quarantaine. */
const ACTION_PAR_DECISION: Record<RevueDecision, ReviewAction> = {
  accepter: "promote",
  refuser: "reject",
  creer: "promote",
};

function est401(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

type Props = {
  canWrite?: boolean;
  server?: boolean;
  onUnauthorized?: () => void;
  onOpenOrg?: (orgId: number) => void;
  /** Filtres de la file portés par l'URL (`#/review?bucket=…&q=…`). */
  urlState?: ReviewUrlState;
  onUrlStateChange?: (next: ReviewUrlState) => void;
};

const LIMIT = 50;
/** Au-delà, la file est déclarée muette : un squelette sans fin n'informe pas. */
const QUEUE_TIMEOUT_MS = 10_000;
const BUCKETS: Array<{ value: RevueBucket | ""; label: string }> = [
  { value: "", label: "Toutes" },
  { value: "chaud", label: "Chaud" },
  { value: "tiede", label: "Tiède" },
  { value: "froid", label: "Froid" },
];
const DECISION_LABEL: Record<RevueDecision, string> = {
  accepter: "Acceptation",
  refuser: "Rejet",
  creer: "Création d'organisation",
};
type BulkDecision = "accepter" | "refuser";
const BULK_LABEL: Record<BulkDecision, string> = { accepter: "Acceptations", refuser: "Rejets" };

/** File de décisions de rattachement : client API central, routes /quarantine/*. */
export default function ReviewView({
  canWrite = false,
  server = true,
  onUnauthorized,
  onOpenOrg,
  urlState,
  onUrlStateChange,
}: Props) {
  const [rows, setRows] = useState<RevueRow[]>([]);
  useScreenExport("review", rows.map((row) => ({
    id: row.id, title: row.orgHint ?? row.source,
    organisation: row.candidates[0]?.name ?? row.orgHint,
    department: row.dept, family: row.groupe, source: row.source,
    status: row.triage.suggested, bucket: row.triage.bucket,
  })));
  const [total, setTotal] = useState(0);
  const [bucket, setBucket] = useState<RevueBucket | "">(urlState?.bucket ?? "");
  // `groupe` est la famille de la revendication (par exemple l'opérateur de
  // rançongiciel). L'API de la file n'expose pas de facette famille : ce
  // filtre restreint donc la page déjà chargée.
  const [family, setFamily] = useState("");
  const [search, setSearch] = useState(urlState?.q ?? "");
  const [query, setQuery] = useState(urlState?.q ?? "");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(server);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [help, setHelp] = useState(false);
  const [rawById, setRawById] = useState<Record<number, QuarantineRaw>>({});
  const [rawLoading, setRawLoading] = useState<number | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);
  const showRaw = useCallback(async (id: number) => {
    if (rawById[id] !== undefined || rawLoading === id) return;
    setRawLoading(id);
    setRawError(null);
    try {
      const raw = await api.quarantineRaw(id);
      setRawById((prev) => ({ ...prev, [id]: raw }));
    } catch (err) {
      setRawError((err as Error).message);
    } finally {
      setRawLoading(null);
    }
  }, [rawById, rawLoading]);
  const [decision, setDecision] = useState<RevueDecision>("accepter");
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [bulkReason, setBulkReason] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const pendingNotice = useRef<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const families = useMemo(
    () => [...new Set(rows.map((row) => row.groupe).filter((name): name is string => Boolean(name)))]
      .sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const visibleRows = useMemo(
    () => (family ? rows.filter((row) => row.groupe === family) : rows),
    [rows, family],
  );
  const selectedRows = useMemo(() => visibleRows.filter((row) => selected.has(row.id)), [visibleRows, selected]);
  const allSelected = visibleRows.length > 0 && selectedRows.length === visibleRows.length;
  const filtersActive = Boolean(bucket || family || query);

  // 300 ms de silence avant d'interroger l'API : une frappe, une requête.
  useEffect(() => {
    const next = search.trim();
    if (next === query) return;
    const timer = setTimeout(() => {
      setQuery(next);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, query]);

  useEffect(() => {
    if (!server) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    // Une requête muette ne doit pas laisser un squelette éternel : passé le
    // délai, on quitte le chargement et on propose de réessayer. Les lignes
    // déjà connues restent affichées, l'échec ne les efface pas.
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      pendingNotice.current = null;
      setProgress(null);
      setError("La file de revue ne répond pas.");
      setLoading(false);
      controller.abort();
    }, QUEUE_TIMEOUT_MS);
    api.reviewQueue({ limit: LIMIT, page, bucket: bucket || undefined, q: query || undefined }, controller.signal)
      .then((data) => {
        if (timedOut) return;
        setRows(data.rows.map(versRevueRow));
        setTotal(data.total);
        setOpenRow(null);
        setReason("");
        setActive((index) => Math.min(index, Math.max(0, data.rows.length - 1)));
        setSelected(new Set());
        setBulkReason("");
        setProgress(null);
        setNotice(pendingNotice.current);
        pendingNotice.current = null;
      })
      .catch((err: unknown) => {
        if (timedOut || (err instanceof Error && err.name === "AbortError")) return;
        if (err instanceof ApiError && err.status === 401) onUnauthorized?.();
        setError(err instanceof Error ? err.message : "File de revue indisponible");
        pendingNotice.current = null;
        setProgress(null);
      })
      .finally(() => {
        clearTimeout(timer);
        if (!timedOut && !controller.signal.aborted) setLoading(false);
      });
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [server, bucket, query, page, reloadKey, onUnauthorized]);

  // L'URL suit les filtres bucket et recherche : un lien copié reproduit
  // exactement cette file. Le filtre famille reste local à la page chargée.
  useEffect(() => {
    onUrlStateChange?.({ bucket, q: query });
  }, [onUrlStateChange, bucket, query]);

  // Et les filtres suivent l'URL : le retour du navigateur doit changer la file.
  const urlKey = urlState ? `${urlState.bucket}\u0000${urlState.q}` : "";
  useEffect(() => {
    if (!urlState) return;
    setBucket(urlState.bucket);
    // Une frappe encore en attente ne doit pas être écrasée par notre propre
    // écriture de l'URL.
    if (urlState.q !== query) {
      setSearch(urlState.q);
      setQuery(urlState.q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);


  const reinitialiser = useCallback(() => {
    setBucket("");
    setSearch("");
    setQuery("");
    setPage(0);
  }, []);
  useEffect(() => {
    if (openRow !== null) reasonRef.current?.focus();
  }, [openRow]);

  useEffect(() => {
    if (selectAllRef.current) {
      const picked = visibleRows.filter((row) => selected.has(row.id)).length;
      selectAllRef.current.indeterminate = picked > 0 && picked < visibleRows.length;
    }
  }, [visibleRows, selected]);

  const changeFamily = useCallback((next: string) => {
    setFamily(next);
    setSelected(new Set());
    setActive(0);
    setOpenRow(null);
  }, []);

  const clearFilters = useCallback(() => {
    setBucket("");
    setFamily("");
    setSearch("");
    setQuery("");
    setPage(0);
    setSelected(new Set());
  }, []);

  const refresh = useCallback(() => {
    if (!server || loading) return;
    pendingNotice.current = "File actualisée.";
    setReloadKey((key) => key + 1);
  }, [server, loading]);

  // Réessayer après un échec repart du même contrat que l'actualisation :
  // une nouvelle requête, et l'erreur disparaît dès que le chargement reprend.
  const retry = useCallback(() => {
    if (!server) return;
    setReloadKey((key) => key + 1);
  }, [server]);

  const toggleSelected = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(visibleRows.map((row) => row.id)));
  }, [allSelected, visibleRows]);

  const openAction = useCallback((id: number, next: RevueDecision) => {
    setOpenRow(id);
    setDecision(next);
    setReason("");
    setActionError(null);
  }, []);

  const closeAction = useCallback(() => {
    setOpenRow(null);
    setReason("");
    setActionError(null);
  }, []);

  const keyState: ReviewKeyState = useMemo(() => ({
    count: visibleRows.length,
    active,
    selected,
    ids: visibleRows.map((row) => row.id),
    rejecting: openRow !== null,
    help,
  }), [visibleRows, active, selected, openRow, help]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const intent = reviewIntent(event.key, event.shiftKey, {
      ...keyState,
      typing: isReviewTypingTarget(event.target),
    });
    if (intent.kind === "none") return;
    event.preventDefault();
    if (intent.kind === "move") {
      setActive(intent.active);
      return;
    }
    if (intent.kind === "help") {
      setHelp((open) => !open);
      return;
    }
    if (intent.kind === "cancelReject") {
      closeAction();
      return;
    }
    if (intent.kind === "clear") {
      setHelp(false);
      setSelected(new Set());
      return;
    }
    if (intent.kind === "toggle" || intent.kind === "selectAll") {
      const next = reduceSelection(intent, keyState);
      setActive(next.active);
      setSelected(next.selected);
      return;
    }
    if (!canWrite || submitting) return;
    const id = visibleRows[active]?.id;
    if (id === undefined) return;
    if (intent.kind === "askReject") openAction(id, "refuser");
    else if (intent.kind === "decide") openAction(id, intent.decision);
  }

  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (openRow === null || submitting) return;
    const motif = reason.trim();
    if (!motif) {
      setActionError("Un motif est obligatoire.");
      return;
    }
    const ligne = rows.find((row) => row.id === openRow);
    setSubmitting(true);
    setActionError(null);
    try {
      if (decision === "creer") {
        if (!ligne?.orgHint) throw new Error("Aucun indice ne permet de créer une organisation.");
        await api.orgFromHint({
          nom: ligne.orgHint,
          source: `revue:${ligne.source}`,
          preuve: motif,
        });
      }
      const outcome = await api.reviewAction([openRow], ACTION_PAR_DECISION[decision], motif);
      if (outcome.changed === 0) throw new Error("Aucune décision appliquée par le serveur.");
      const decidedId = openRow;
      // Retirer la ligne immédiatement : aucun rechargement de la file pour
      // une seule revendication tranchée.
      setRows((prev) => prev.filter((row) => row.id !== decidedId));
      setSelected((prev) => {
        if (!prev.has(decidedId)) return prev;
        const next = new Set(prev);
        next.delete(decidedId);
        return next;
      });
      setTotal((n) => Math.max(0, n - 1));
      setNotice(`${DECISION_LABEL[decision]} enregistrée : ${motif}`);
      closeAction();
    } catch (err) {
      if (est401(err)) onUnauthorized?.();
      setActionError(err instanceof Error ? err.message : "La décision n'a pas pu être enregistrée");
    } finally {
      setSubmitting(false);
    }
  }

  async function bulkDecide(kind: BulkDecision) {
    if (submitting) return;
    const motif = bulkReason.trim();
    if (!motif) {
      setBulkError("Un motif est obligatoire.");
      return;
    }
    const targets = selectedRows;
    if (targets.length === 0) return;

    // Le serveur journalise dans l'ordre de la file : on garde un appel par
    // ligne, mais il passe désormais par le client API central.
    const ids = targets.map((row) => row.id);
    setSubmitting(true);
    setBulkError(null);
    setNotice(null);
    setProgress({ done: 0, total: ids.length });
    let done = 0;
    let changes = 0;
    let ignores = 0;
    try {
      for (const id of ids) {
        const outcome = await api.reviewAction([id], ACTION_PAR_DECISION[kind], motif);
        done += 1;
        changes += outcome.changed;
        ignores += outcome.skipped.length;
        setProgress({ done, total: ids.length });
      }
      pendingNotice.current = `${BULK_LABEL[kind]} enregistrées : ${motif} (${changes}/${ids.length})`;
      if (ignores > 0) pendingNotice.current += ` — ${ignores} ligne(s) ignorée(s) par le serveur`;
    } catch (err) {
      if (est401(err)) onUnauthorized?.();
      setBulkError(`${done}/${ids.length} décisions envoyées. ${err instanceof Error ? err.message : "La décision n'a pas pu être enregistrée"}`);
    } finally {
      setSubmitting(false);
      setReloadKey((key) => key + 1);
    }
  }

  return (
    <section
      className="revue"
      aria-label="File de revue"
      role="region"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <header className="revue__head">
        <Card variant="transparent" padding={0}>
          <h1>File de revue</h1>
          <Badge label="file" className="revue__badge" />
          <p className="revue__count" role="status">
            {loading
              ? "Chargement de la file…"
              : error && rows.length === 0
                ? "File indisponible"
                : `${total} ${total === 1 ? "revendication restante" : "revendications restantes"} à examiner`}
          </p>
        </Card>
        <Card variant="transparent" padding={0} className="revue__tools">
          <button
            type="button"
            className="revue__refresh"
            aria-label="Actualiser la file"
            disabled={!server || loading}
            onClick={refresh}
          >
            ↻ Actualiser
          </button>
          <button type="button" onClick={() => setHelp(true)}>? Raccourcis</button>
        </Card>
        <form
          className="revue__search"
          onSubmit={(event) => {
            event.preventDefault();
            const next = search.trim();
            if (next !== query) {
              setQuery(next);
              setPage(0);
            }
          }}
        >
          <label className="revue__label" htmlFor="revue-q">Rechercher un indice ou une famille</label>
          <input
            id="revue-q"
            type="search"
            value={search}
            placeholder="Indice ou famille…"
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="submit">Rechercher</button>
        </form>
      </header>

      <Card variant="transparent" padding={0} className="revue__buckets" role="group" aria-label="Filtrer par priorité">
        {BUCKETS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={bucket === item.value}
            onClick={() => { setBucket(item.value); setPage(0); }}
          >
            {item.label}
          </button>
        ))}
      </Card>

      <Card variant="transparent" padding={0} className="revue__families" role="group" aria-label="Filtrer par famille">
        <span className="revue__filter-label">Famille</span>
        <button type="button" aria-pressed={family === ""} onClick={() => changeFamily("")}>Toutes</button>
        {families.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={family === name}
            onClick={() => changeFamily(name)}
            title={`Afficher uniquement les revendications ${name} de cette page`}
          >
            {name}
            <span className="revue__family-count">{rows.filter((row) => row.groupe === name).length}</span>
          </button>
        ))}
        {families.length === 0 ? <span className="revue__none">aucune famille sur cette page</span> : null}
      </Card>

      {!loading && !error ? (
        <p className="revue__results" role="status">
          {visibleRows.length} affichées sur {total} dans la file
          {family ? ` · famille : ${family} (cette page)` : ""}
        </p>
      ) : null}

      {!loading && notice ? <p className="revue__notice" role="status">{notice}</p> : null}
      {!loading && error ? (
        <Card variant="transparent" padding={0} className="revue__error" role="alert">
          <p>{error}</p>
          {server ? (
            <button type="button" className="revue__retry" onClick={retry}>
              Réessayer
            </button>
          ) : null}
          {server && rows.length > 0 ? (
            <p className="revue__stale">Dernier résultat connu conservé ci-dessous.</p>
          ) : null}
        </Card>
      ) : null}
      {loading ? <LoadingSkeleton label="Chargement de la file de revue…" /> : null}
      {!loading && visibleRows.length === 0 && !error && server ? (
        <EmptyState
          className="revue__empty"
          message={total === 0 ? "Aucune revendication restante à examiner." : "Aucun résultat avec ces filtres."}
          description={total === 0
            ? "La file est vide : chaque revendication publique a une décision enregistrée."
            : "Essayez une autre priorité, une autre famille ou un autre terme de recherche."}
          actionLabel={filtersActive ? "Effacer les filtres" : "Recharger la file"}
          onAction={filtersActive ? clearFilters : refresh}
        />
      ) : null}
      {!server ? <p className="revue__state">La file de revue nécessite l'API — aucune décision n'est simulée.</p> : null}
      {!canWrite ? <p className="revue__state">Lecture seule : connectez-vous pour enregistrer des décisions.</p> : null}

      {!loading && visibleRows.length > 0 && server ? (
        <Card variant="transparent" padding={0} className="revue__bulk" aria-label="Décisions en masse">
          <Card variant="transparent" padding={0} className="revue__bulk-head">
            <label className="revue__select">
              <input
                ref={selectAllRef}
                type="checkbox"
                aria-label="Tout sélectionner"
                checked={allSelected}
                disabled={!canWrite || submitting}
                onChange={toggleAll}
              />
              <span>Tout sélectionner</span>
            </label>
            <span className="revue__bulk-count" role="status">
              {selectedRows.length} sélectionnée{selectedRows.length > 1 ? "s" : ""} sur {visibleRows.length}
            </span>
          </Card>

          {selectedRows.length > 0 ? (
            <ul className="revue__bulk-targets">
              {selectedRows.map((row) => (
                <li key={row.id}>
                  <span className="revue__bulk-hint">{row.orgHint ?? "(aucun indice)"}</span>
                  <span className="revue__bulk-org">
                    Rattachement pressenti : {row.candidates[0]?.name ?? "à déterminer par le serveur"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <label className="revue__label" htmlFor="revue-bulk-raison">Motif commun (obligatoire)</label>
          <textarea
            id="revue-bulk-raison"
            className="revue__bulk-raison"
            rows={2}
            value={bulkReason}
            disabled={!canWrite || submitting}
            placeholder="Motif appliqué à chaque ligne sélectionnée"
            onChange={(event) => { setBulkReason(event.target.value); setBulkError(null); }}
          />
          <Card variant="transparent" padding={0} className="revue__bulk-actions">
            <button
              type="button"
              disabled={!canWrite || submitting || selectedRows.length === 0 || !bulkReason.trim()}
              onClick={() => bulkDecide("accepter")}
            >
              Accepter la sélection
            </button>
            <button
              type="button"
              disabled={!canWrite || submitting || selectedRows.length === 0 || !bulkReason.trim()}
              onClick={() => bulkDecide("refuser")}
            >
              Rejeter la sélection
            </button>
          </Card>
          {progress ? (
            <p className="revue__progress" role="status">Décisions {progress.done}/{progress.total} envoyées…</p>
          ) : null}
          {bulkError ? <p className="revue__error" role="alert">{bulkError}</p> : null}
        </Card>
      ) : null}

      {!loading && visibleRows.length > 0 ? (
      <ul className="revue__list">
        {visibleRows.map((row, index) => (
          <li className="revue__row" key={row.id} data-bucket={row.triage.bucket} data-active={index === active ? "true" : undefined}>
            <Card variant="transparent" padding={0} className="revue__main">
              <label className="revue__select">
                <input
                  type="checkbox"
                  aria-label={`Sélectionner ${row.orgHint ?? "cette ligne"}`}
                  checked={selected.has(row.id)}
                  disabled={!canWrite || !server || submitting}
                  onChange={() => toggleSelected(row.id)}
                />
                <span>Sélectionner</span>
              </label>
              <strong className="revue__hint">{row.orgHint || "(aucun indice)"}</strong>
              <span className="revue__source">{row.source}</span>
              <time className="revue__date" dateTime={row.claimedAt ?? row.receivedAt}>
                {(row.claimedAt ?? row.receivedAt)?.slice(0, 10) ?? "date inconnue"}
              </time>
              <span className="revue__bucket">{row.triage.bucket}</span>
            </Card>

            <Card variant="transparent" padding={0} className="revue__candidates">
              <span className="revue__label">Candidats</span>
              {row.candidates.length === 0 ? <span className="revue__none">aucun candidat</span> : null}
              {row.candidates.map((candidate) => (
                <button
                  className="revue__candidate"
                  key={candidate.id}
                  type="button"
                  onClick={() => onOpenOrg?.(candidate.id)}
                  title={candidate.dept ? `Département ${candidate.dept}` : undefined}
                >
                  {candidate.name}
                  <span className="revue__candidate-score">{candidate.score.toFixed(2)} · {candidate.via}</span>
                </button>
              ))}
            </Card>
            <Card variant="transparent" padding={0} className="revue__raw" data-raw="level-4">
              <button
                type="button"
                disabled={!server || rawLoading === row.id}
                onClick={() => { void showRaw(row.id); }}
                aria-label={`Afficher le brut du fait ${row.id}`}
              >
                {rawLoading === row.id ? "Chargement du brut…" : "Afficher le brut"}
              </button>
              {rawById[row.id] ? (
                <>
                  <pre className="revue__raw-body">{rawById[row.id]!.rawBody ?? "(aucun corps brut)"}</pre>
                  <pre className="revue__raw-extracted">{JSON.stringify(rawById[row.id]!.extracted, null, 2)}</pre>
                </>
              ) : null}
            </Card>

            <Card variant="transparent" padding={0} className="revue__actions">
              <button type="button" disabled={!canWrite || submitting} onClick={() => openAction(row.id, "accepter")}>
                Accepter
              </button>
              <button type="button" disabled={!canWrite || submitting} onClick={() => openAction(row.id, "refuser")}>
                Rejeter
              </button>
              <button type="button" disabled={!canWrite || submitting} onClick={() => openAction(row.id, "creer")}>
                Créer l'organisation
              </button>
            </Card>

            {openRow === row.id ? (
              <form className="revue__decision" onSubmit={decide}>
                <p className="revue__decision-title">{DECISION_LABEL[decision]} — {row.orgHint}</p>
                {decision === "accepter" ? (
                  <p className="revue__none">
                    {row.candidates.length > 0
                      ? `Rattachement proposé : ${row.candidates.map((candidate) => candidate.name).join(", ")}. Le serveur applique le rapprochement retenu.`
                      : "Aucun rattachement proposé : le serveur décidera ou la décision sera ignorée."}
                  </p>
                ) : null}
                <label className="revue__label" htmlFor={`raison-${row.id}`}>Motif de cette décision (obligatoire)</label>
                <textarea
                  id={`raison-${row.id}`}
                  ref={reasonRef}
                  required
                  rows={2}
                  value={reason}
                  placeholder="Écrivez le motif de cette décision"
                  onChange={(event) => setReason(event.target.value)}
                />
                {actionError ? <p className="revue__error" role="alert">{actionError}</p> : null}
                <Card variant="transparent" padding={0} className="revue__decision-actions">
                  <button
                    type="submit"
                    disabled={submitting || !reason.trim()}
                  >
                    Confirmer
                  </button>
                  <button type="button" onClick={closeAction}>Annuler</button>
                </Card>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      ) : null}

      {!loading && !(error && rows.length === 0) ? (
      <footer className="revue__foot">
        <button type="button" disabled={loading || page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          Précédent
        </button>
        <span>Page {page + 1} / {Math.max(1, Math.ceil(total / LIMIT))}</span>
        <button type="button" disabled={loading || (page + 1) * LIMIT >= total} onClick={() => setPage((p) => p + 1)}>
          Suivant
        </button>
      </footer>
      ) : null}

      <Dialog
        isOpen={help}
        onOpenChange={setHelp}
        width={560}
        aria-labelledby="revue-help-title"
      >
        <Card variant="transparent" padding={0} className="revue__help">
          <h2 id="revue-help-title">Raccourcis clavier</h2>
          <dl>
            <dt>J / ↓</dt><dd>Aller à la ligne suivante</dd>
            <dt>K / ↑</dt><dd>Aller à la ligne précédente</dd>
            <dt>X</dt><dd>Sélectionner ou désélectionner la ligne courante</dd>
            <dt>Maj+A</dt><dd>Sélectionner toutes les lignes de cette page</dd>
            <dt>A</dt><dd>Ouvrir l'acceptation de la ligne courante</dd>
            <dt>R</dt><dd>Ouvrir le rejet de la ligne courante</dd>
            <dt>C</dt><dd>Créer une organisation</dd>
            <dt>?</dt><dd>Afficher cette aide</dd>
            <dt>Échap</dt><dd>Fermer l'aide, le formulaire de décision ou la sélection</dd>
          </dl>
          <p className="revue__help-note">Les raccourcis sont ignorés pendant la saisie dans un champ.</p>
          <Button label="Fermer" onClick={() => setHelp(false)} />
        </Card>
      </Dialog>
    </section>
  );
}
