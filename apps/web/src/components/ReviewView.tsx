import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { authHeaders } from "../api";
import "./review.css";

export type RevueBucket = "chaud" | "tiede" | "froid";
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
type BulkProgress = { done: number; total: number; label: string; finished: boolean };

type Props = {
  canWrite?: boolean;
  server?: boolean;
  onUnauthorized?: () => void;
  onOpenOrg?: (orgId: number) => void;
};

const LIMIT = 50;
const BUCKETS: Array<{ value: RevueBucket | ""; label: string }> = [
  { value: "", label: "Tous" },
  { value: "chaud", label: "Chaud" },
  { value: "tiede", label: "Tiède" },
  { value: "froid", label: "Froid" },
];
const DECISION_LABEL: Record<RevueDecision, string> = {
  accepter: "Acceptation",
  refuser: "Refus",
  creer: "Création d'organisation",
};

/** Le serveur renvoie `{ error, details }` : on affiche son message, pas un code générique. */
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
    // réponse sans corps JSON : le statut reste le seul fait certain
  }
  return `${fallback} (${res.status})`;
}

/** File de décision des rattachements : GET /api/review/queue, POST /api/review/:id/decision. */
export default function ReviewView({
  canWrite = false,
  server = true,
  onUnauthorized,
  onOpenOrg,
}: Props) {
  const [rows, setRows] = useState<RevueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [bucket, setBucket] = useState<RevueBucket | "">("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(server);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [decision, setDecision] = useState<RevueDecision>("accepter");
  const [orgId, setOrgId] = useState<number | null>(null);
  const [raison, setRaison] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkDecision, setBulkDecision] = useState<"accepter" | "refuser" | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkOrg, setBulkOrg] = useState<Record<number, number>>({});
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const selectedRows = rows.filter((row) => selectedIds.includes(row.id));
  const bulkRunning = bulkProgress !== null && !bulkProgress.finished;
  const busy = submitting || bulkRunning;

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
        setRaison("");
        setOrgId(null);
        setSelectedIds([]);
        setBulkDecision(null);
        setBulkOrg({});
        setBulkProgress(null);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [server, bucket, query, page, refreshKey, onUnauthorized]);

  useEffect(() => {
    if (openRow !== null) reasonRef.current?.focus();
  }, [openRow]);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedIds.length > 0 && selectedIds.length < rows.length;
    }
  }, [selectedIds, rows]);

  const openAction = useCallback((id: number, next: RevueDecision) => {
    setOpenRow(id);
    setBulkDecision(null);
    setDecision(next);
    setOrgId(null);
    setRaison("");
    setActionError(null);
  }, []);

  const closeAction = useCallback(() => {
    setOpenRow(null);
    setOrgId(null);
    setRaison("");
    setActionError(null);
  }, []);

  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (openRow === null || submitting) return;
    const motif = raison.trim();
    if (!motif) {
      setActionError("Le motif est obligatoire.");
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
      // La ligne sort de la liste immédiatement : aucun rechargement de la file.
      setRows((prev) => prev.filter((row) => row.id !== decidedId));
      setTotal((n) => Math.max(0, n - 1));
      setNotice(`${DECISION_LABEL[decision]} enregistrée : ${motif}`);
      closeAction();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Décision impossible");
    } finally {
      setSubmitting(false);
    }
  }
  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  }, []);

  const openBulk = useCallback((next: "accepter" | "refuser") => {
    const defaults: Record<number, number> = {};
    for (const row of rows) {
      if (selectedIds.includes(row.id) && row.candidates.length > 0) {
        defaults[row.id] = row.candidates[0].id;
      }
    }
    setBulkOrg(defaults);
    setBulkDecision(next);
    setBulkError(null);
    setOpenRow(null);
  }, [rows, selectedIds]);

  const closeBulk = useCallback(() => {
    setBulkDecision(null);
    setBulkError(null);
  }, []);

  /** Décisions envoyées une par une : l'API unitaire journalise chaque ligne. */
  async function submitBulk() {
    if (bulkDecision === null || bulkRunning) return;
    const motif = bulkReason.trim();
    if (!motif) {
      setBulkError("Le motif est obligatoire.");
      return;
    }
    const targets = rows.filter((row) => selectedIds.includes(row.id));
    if (targets.length === 0) return;
    if (bulkDecision === "accepter" && targets.some((row) => !bulkOrg[row.id])) {
      setBulkError("Choisissez une organisation pour chaque ligne acceptée.");
      return;
    }
    const decision = bulkDecision;
    setBulkError(null);
    setBulkProgress({ done: 0, total: targets.length, label: DECISION_LABEL[decision], finished: false });
    let done = 0;
    try {
      for (const row of targets) {
        const body: { decision: RevueDecision; raison: string; orgId?: number } = { decision, raison: motif };
        if (decision === "accepter") body.orgId = bulkOrg[row.id];
        const res = await fetch(`/api/review/${row.id}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(body),
        });
        if (res.status === 401) onUnauthorized?.();
        if (!res.ok) throw new Error(await apiMessage(res, `Décision refusée pour ${row.orgHint ?? row.id}`));
        done += 1;
        setBulkProgress({ done, total: targets.length, label: DECISION_LABEL[decision], finished: false });
      }
      setNotice(`${DECISION_LABEL[decision]} enregistrée pour ${done} ligne${done === 1 ? "" : "s"} : ${motif}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Décision impossible";
      setBulkError(`${message} — ${done}/${targets.length} décision${done === 1 ? "" : "s"} enregistrée${done === 1 ? "" : "s"}`);
      setNotice(`${done}/${targets.length} décisions enregistrées avant l'échec : ${message}`);
    } finally {
      setBulkProgress({ done, total: targets.length, label: DECISION_LABEL[decision], finished: true });
      setBulkDecision(null);
      setBulkReason("");
      setBulkOrg({});
      setSelectedIds([]);
      setRefreshKey((n) => n + 1);
    }
  }
  return (
    <section className="revue" aria-label="Revue des rattachements">
      <header className="revue__head">
        <div>
          <h1>Revue</h1>
          <p className="revue__count">{total} revendication{total === 1 ? "" : "s"} en attente d'une décision</p>
        </div>
        <form
          className="revue__search"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search.trim());
            setPage(0);
          }}
        >
          <label className="revue__label" htmlFor="revue-q">Rechercher un indice ou un groupe</label>
          <input
            id="revue-q"
            type="search"
            value={search}
            placeholder="Indice ou groupe…"
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="submit">Rechercher</button>
        </form>
      </header>

      <div className="revue__buckets" role="group" aria-label="Filtrer par seau">
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
      <div className="revue__bulk" role="group" aria-label="Actions groupées">
        <label className="revue__pick">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={rows.length > 0 && selectedIds.length === rows.length}
            onChange={() => setSelectedIds((prev) => prev.length === rows.length ? [] : rows.map((row) => row.id))}
            disabled={!canWrite || !server || rows.length === 0 || busy}
          />
          Tout sélectionner
        </label>
        <span className="revue__selection" role="status">
          {selectedIds.length} ligne{selectedIds.length > 1 ? "s" : ""} sélectionnée{selectedIds.length > 1 ? "s" : ""} sur {rows.length}
        </span>
        <button type="button" disabled={!canWrite || !server || selectedIds.length === 0 || busy}
          onClick={() => openBulk("accepter")}>Accepter la sélection</button>
        <button type="button" disabled={!canWrite || !server || selectedIds.length === 0 || busy}
          onClick={() => openBulk("refuser")}>Refuser la sélection</button>
      </div>
      {bulkDecision !== null ? (
        <form className="revue__bulk-form" onSubmit={(event) => { event.preventDefault(); void submitBulk(); }}>
          <p className="revue__decision-title">{DECISION_LABEL[bulkDecision]} groupée — {selectedRows.length} lignes</p>
          <label className="revue__label" htmlFor="revue-bulk-raison">Motif commun (obligatoire)</label>
          <textarea
            id="revue-bulk-raison"
            rows={2}
            value={bulkReason}
            placeholder="Écrivez le motif appliqué à toute la sélection"
            onChange={(event) => setBulkReason(event.target.value)}
          />
          {bulkDecision === "accepter" ? (
            <fieldset className="revue__orgs">
              <legend>Organisation à rattacher par ligne</legend>
              {selectedRows.map((row) => (
                <label className="revue__org" key={row.id}>
                  <span>{row.orgHint ?? row.source}</span>
                  {row.candidates.length === 0 ? (
                    <span className="revue__none">aucun candidat — retirez la ligne ou refusez-la</span>
                  ) : (
                    <select
                      aria-label={`Organisation pour ${row.orgHint ?? row.source}`}
                      value={bulkOrg[row.id] ?? row.candidates[0].id}
                      onChange={(event) => setBulkOrg((prev) => ({ ...prev, [row.id]: Number(event.target.value) }))}
                    >
                      {row.candidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name} ({candidate.score.toFixed(2)} · {candidate.via})
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              ))}
            </fieldset>
          ) : null}
          <div className="revue__decision-actions">
            <button
              type="submit"
              disabled={busy || !bulkReason.trim() || selectedRows.length === 0
                || (bulkDecision === "accepter" && selectedRows.some((row) => row.candidates.length === 0))}
            >
              Confirmer ({selectedRows.length})
            </button>
            <button type="button" disabled={busy} onClick={closeBulk}>Annuler</button>
          </div>
        </form>
      ) : null}
      {bulkError ? <p className="revue__error" role="alert">{bulkError}</p> : null}
      {bulkProgress ? (
        <p className="revue__progress" role="status">
          {bulkProgress.label} : {bulkProgress.done}/{bulkProgress.total} {bulkProgress.finished ? "terminé" : "en cours"}
        </p>
      ) : null}

      {notice ? <p className="revue__notice" role="status">{notice}</p> : null}
      {error ? <p className="revue__error" role="alert">{error}</p> : null}
      {loading ? <p className="revue__state" role="status">Chargement de la file de revue…</p> : null}
      {!loading && rows.length === 0 && !error
        ? <p className="revue__state">Aucune revendication à revoir.</p>
        : null}
      {!server ? <p className="revue__state">La file de revue exige l'API : aucune décision n'est simulée.</p> : null}
      {!canWrite ? <p className="revue__state">Lecture seule : connectez-vous pour décider.</p> : null}

      <ul className="revue__list">
        {rows.map((row) => (
          <li className="revue__row" key={row.id} data-bucket={row.triage.bucket}>
            <label className="revue__check">
              <input
                type="checkbox"
                aria-label={`Sélectionner ${row.orgHint ?? row.source}`}
                checked={selectedIds.includes(row.id)}
                onChange={() => toggleSelected(row.id)}
                disabled={!canWrite || !server || busy}
              />
            </label>
            <div className="revue__main">
              <strong className="revue__hint">{row.orgHint || "(sans indice)"}</strong>
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
              <button type="button" disabled={!canWrite || busy} onClick={() => openAction(row.id, "accepter")}>
                Accepter
              </button>
              <button type="button" disabled={!canWrite || busy} onClick={() => openAction(row.id, "refuser")}>
                Refuser
              </button>
              <button type="button" disabled={!canWrite || busy} onClick={() => openAction(row.id, "creer")}>
                Créer cette organisation
              </button>
            </div>

            {openRow === row.id ? (
              <form className="revue__decision" onSubmit={decide}>
                <p className="revue__decision-title">{DECISION_LABEL[decision]} — {row.orgHint}</p>
                {decision === "accepter" ? (
                  <fieldset className="revue__orgs">
                    <legend>Organisation à rattacher</legend>
                    {row.candidates.length === 0 ? <p className="revue__none">Aucun candidat : refusez ou créez l'organisation.</p> : null}
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
                <label className="revue__label" htmlFor={`raison-${row.id}`}>Motif de la décision (obligatoire)</label>
                <textarea
                  id={`raison-${row.id}`}
                  ref={reasonRef}
                  required
                  rows={2}
                  value={raison}
                  placeholder="Écrivez le motif de cette décision"
                  onChange={(event) => setRaison(event.target.value)}
                />
                {actionError ? <p className="revue__error" role="alert">{actionError}</p> : null}
                <div className="revue__decision-actions">
                  <button
                    type="submit"
                    disabled={submitting || !raison.trim() || (decision === "accepter" && orgId === null)}
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
    </section>
  );
}
