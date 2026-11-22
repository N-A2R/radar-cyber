import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { authHeaders } from "../api";
import { isReviewTypingTarget, reduceSelection, reviewIntent, type ReviewKeyState } from "../review-keys";
import { EmptyState, LoadingSkeleton } from "./Skeleton";
import "./review.css";
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

export type RevueRow = {
  id: number;
  source: string;
  sourceUrl: string | null;
  groupe: string | null;
  orgHint: string | null;
  claimedAt: string | null;
  receivedAt: string;
  tlp: string;
  triage: { score: number; bucket: RevueBucket; suggested: string; reasons: Array<{ label: string; weight: number }> };
  candidates: RevueCandidate[];
  rejectRule: string | null;
  city: string | null;
  dept: string | null;
  review: Array<{ at: string; by: string; action: string; reason: string | null }>;
};

export type RevueQueue = {
  rows: RevueRow[];
  total: number;
  page: number;
  limit: number;
  window: number;
  truncated: boolean;
  counts: Record<string, number>;
  tookMs: number;
};

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

/** L'API renvoie `{ error, details }` : afficher son message, pas un code générique. */
async function apiMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json() as { error?: unknown; details?: unknown; message?: unknown };
    if (Array.isArray(body.details) && body.details.length > 0) {
      const details = body.details
        .map((item) => (item && typeof item === "object" && "message" in item ? String(item.message) : String(item)))
        .join(", ");
      return `${typeof body.error === "string" ? body.error : "requête invalide"} : ${details}`;
    }
    if (typeof body.error === "string") return body.error;
    if (typeof body.message === "string") return body.message;
  } catch {
    // Pas de corps JSON : le statut HTTP est le seul fait certain.
  }
  return `${fallback} (${res.status})`;
}

/** File de décisions de rattachement : GET /api/review/queue, POST /api/review/:id/decision. */
export default function ReviewView({
  canWrite = false,
  server = true,
  onUnauthorized,
  onOpenOrg,
  urlState,
  onUrlStateChange,
}: Props) {
  const [rows, setRows] = useState<RevueRow[]>([]);
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
  const [decision, setDecision] = useState<RevueDecision>("accepter");
  const [orgId, setOrgId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [selectedOrgs, setSelectedOrgs] = useState<Record<number, number>>({});
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
    const params = new URLSearchParams({ limit: String(LIMIT), page: String(page) });
    if (bucket) params.set("bucket", bucket);
    if (query) params.set("q", query);
    setLoading(true);
    setError(null);
    fetch(`/api/review/queue?${params.toString()}`, { headers: authHeaders(), signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401) onUnauthorized?.();
        if (!res.ok) throw new Error(await apiMessage(res, "File de revue indisponible"));
        return res.json() as Promise<RevueQueue>;
      })
      .then((data) => {
        setRows(data.rows);
        setTotal(data.total);
        setOpenRow(null);
        setReason("");
        setActive((index) => Math.min(index, Math.max(0, data.rows.length - 1)));
        setOrgId(null);
        setSelected(new Set());
        setSelectedOrgs({});
        setBulkReason("");
        setProgress(null);
        setNotice(pendingNotice.current);
        pendingNotice.current = null;
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
        pendingNotice.current = null;
        setProgress(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
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
    setSelectedOrgs({});
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
    setOrgId(null);
    setReason("");
    setActionError(null);
  }, []);

  const closeAction = useCallback(() => {
    setOpenRow(null);
    setOrgId(null);
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
    if (decision === "accepter" && orgId === null) {
      setActionError("Choisissez une organisation candidate.");
      return;
    }
    const body: { decision: RevueDecision; raison: string; orgId?: number } = { decision, raison: motif };
    if (decision === "accepter" && orgId !== null) body.orgId = orgId;
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/review/${openRow}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (res.status === 401) onUnauthorized?.();
      if (!res.ok) throw new Error(await apiMessage(res, "Décision refusée"));
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

    // L'API exige un orgId pour chaque acceptation : partir du meilleur
    // candidat de chaque ligne, modifiable dans le panneau avant l'envoi du lot.
    const payloads: Array<{ id: number; body: { decision: BulkDecision; raison: string; orgId?: number } }> = [];
    let skipped = 0;
    for (const row of targets) {
      if (kind === "refuser") {
        payloads.push({ id: row.id, body: { decision: kind, raison: motif } });
        continue;
      }
      const orgId = selectedOrgs[row.id] ?? row.candidates[0]?.id;
      if (orgId === undefined) {
        skipped += 1;
        continue;
      }
      payloads.push({ id: row.id, body: { decision: kind, raison: motif, orgId } });
    }
    if (payloads.length === 0) {
      setBulkError("Aucune des lignes sélectionnées n'a de candidat à rattacher.");
      return;
    }

    setSubmitting(true);
    setBulkError(null);
    setNotice(null);
    setProgress({ done: 0, total: payloads.length });
    let done = 0;
    try {
      // Volontairement séquentiel : le journal enregistre les décisions dans
      // l'ordre de la file, et une erreur arrête le lot au lieu d'envoyer le
      // reste à l'aveugle.
      for (const item of payloads) {
        const res = await fetch(`/api/review/${item.id}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(item.body),
        });
        if (res.status === 401) onUnauthorized?.();
        if (!res.ok) throw new Error(await apiMessage(res, "Décision refusée"));
        done += 1;
        setProgress({ done, total: payloads.length });
      }
      pendingNotice.current = `${BULK_LABEL[kind]} enregistrées : ${motif} (${done}/${payloads.length})`;
      if (skipped > 0) pendingNotice.current += ` — ${skipped} ligne(s) sans candidat ignorée(s)`;
    } catch (err) {
      setBulkError(`${done}/${payloads.length} décisions envoyées. ${err instanceof Error ? err.message : "La décision n'a pas pu être enregistrée"}`);
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
        <div>
          <h1>File de revue</h1>
          <p className="revue__count" role="status">
            {total} {total === 1 ? "revendication restante" : "revendications restantes"} à examiner
          </p>
        </div>
        <div className="revue__tools">
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
        </div>
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

      <div className="revue__buckets" role="group" aria-label="Filtrer par priorité">
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
      </div>

      <div className="revue__families" role="group" aria-label="Filtrer par famille">
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
      </div>

      <p className="revue__results" role="status">
        {visibleRows.length} affichées sur {total} dans la file
        {family ? ` · famille : ${family} (cette page)` : ""}
      </p>

      {notice ? <p className="revue__notice" role="status">{notice}</p> : null}
      {error ? <p className="revue__error" role="alert">{error}</p> : null}
      {loading ? <LoadingSkeleton label="Chargement de la file de revue…" /> : null}
      {!loading && visibleRows.length === 0 && !error && server ? (
        <EmptyState
          className="revue__empty"
          message={
            <>
              <strong>{total === 0 ? "Aucune revendication restante à examiner." : "Aucun résultat avec ces filtres."}</strong>
              <span>
                {total === 0
                  ? "La file est vide : chaque revendication publique a une décision enregistrée."
                  : "Essayez une autre priorité, une autre famille ou un autre terme de recherche."}
              </span>
            </>
          }
          actionLabel={filtersActive ? "Effacer les filtres" : "Recharger la file"}
          onAction={filtersActive ? clearFilters : refresh}
        />
      ) : null}
      {!server ? <p className="revue__state">La file de revue nécessite l'API — aucune décision n'est simulée.</p> : null}
      {!canWrite ? <p className="revue__state">Lecture seule : connectez-vous pour enregistrer des décisions.</p> : null}

      {visibleRows.length > 0 && server ? (
        <div className="revue__bulk" aria-label="Décisions en masse">
          <div className="revue__bulk-head">
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
          </div>

          {selectedRows.length > 0 ? (
            <ul className="revue__bulk-targets">
              {selectedRows.map((row) => (
                <li key={row.id}>
                  <span className="revue__bulk-hint">{row.orgHint ?? "(aucun indice)"}</span>
                  <label className="revue__bulk-org">
                    Organisation à rattacher (acceptation)
                    <select
                      aria-label={`Organisation pour ${row.orgHint ?? "cette ligne"}`}
                      value={selectedOrgs[row.id] ?? row.candidates[0]?.id ?? ""}
                      disabled={!canWrite || submitting}
                      onChange={(event) => setSelectedOrgs((prev) => ({ ...prev, [row.id]: Number(event.target.value) }))}
                    >
                      {row.candidates.length === 0 ? <option value="">aucun candidat</option> : null}
                      {row.candidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                      ))}
                    </select>
                  </label>
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
          <div className="revue__bulk-actions">
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
          </div>
          {progress ? (
            <p className="revue__progress" role="status">Décisions {progress.done}/{progress.total} envoyées…</p>
          ) : null}
          {bulkError ? <p className="revue__error" role="alert">{bulkError}</p> : null}
        </div>
      ) : null}

      <ul className="revue__list">
        {visibleRows.map((row, index) => (
          <li className="revue__row" key={row.id} data-bucket={row.triage.bucket} data-active={index === active ? "true" : undefined}>
            <div className="revue__main">
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
            </div>

            <div className="revue__candidates">
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
            </div>

            <div className="revue__actions">
              <button type="button" disabled={!canWrite || submitting} onClick={() => openAction(row.id, "accepter")}>
                Accepter
              </button>
              <button type="button" disabled={!canWrite || submitting} onClick={() => openAction(row.id, "refuser")}>
                Rejeter
              </button>
              <button type="button" disabled={!canWrite || submitting} onClick={() => openAction(row.id, "creer")}>
                Créer l'organisation
              </button>
            </div>

            {openRow === row.id ? (
              <form className="revue__decision" onSubmit={decide}>
                <p className="revue__decision-title">{DECISION_LABEL[decision]} — {row.orgHint}</p>
                {decision === "accepter" ? (
                  <fieldset className="revue__orgs">
                    <legend>Organisation à rattacher</legend>
                    {row.candidates.length === 0 ? <p className="revue__none">Aucun candidat : rejetez cette ligne ou créez l'organisation.</p> : null}
                    {row.candidates.map((candidate) => (
                      <label className="revue__org" key={candidate.id}>
                        <input
                          type="radio"
                          name={`org-${row.id}`}
                          value={candidate.id}
                          checked={orgId === candidate.id}
                          onChange={() => setOrgId(candidate.id)}
                        />
                        {candidate.name}
                      </label>
                    ))}
                  </fieldset>
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
                <div className="revue__decision-actions">
                  <button
                    type="submit"
                    disabled={submitting || !reason.trim() || (decision === "accepter" && orgId === null)}
                  >
                    Confirmer
                  </button>
                  <button type="button" onClick={closeAction}>Annuler</button>
                </div>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      <footer className="revue__foot">
        <button type="button" disabled={loading || page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          Précédent
        </button>
        <span>Page {page + 1} / {Math.max(1, Math.ceil(total / LIMIT))}</span>
        <button type="button" disabled={loading || (page + 1) * LIMIT >= total} onClick={() => setPage((p) => p + 1)}>
          Suivant
        </button>
      </footer>

      {help ? (
        <div className="revue__help" role="dialog" aria-modal="true" aria-labelledby="revue-help-title">
          <div className="revue__help-card">
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
            <button type="button" onClick={() => setHelp(false)}>Fermer</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
