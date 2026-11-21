import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { authHeaders } from "../api";
import { isReviewTypingTarget, reviewIntent, type ReviewKeyState } from "../review-keys";
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
  /** Filtres de la file, portés par l'URL (`#/review?bucket=…&q=…`). */
  urlState?: ReviewUrlState;
  onUrlStateChange?: (next: ReviewUrlState) => void;
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
const NO_SELECTION: ReadonlySet<number> = new Set();

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
  urlState,
  onUrlStateChange,
}: Props) {
  const [rows, setRows] = useState<RevueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [bucket, setBucket] = useState<RevueBucket | "">(urlState?.bucket ?? "");
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
  const [raison, setRaison] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  // 300 ms de silence avant d'interroger l'API : une frappe, un seul appel.
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
        setRaison("");
        setActive((index) => Math.min(index, Math.max(0, data.rows.length - 1)));
        setOrgId(null);
        setNotice(null);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [server, bucket, query, page, onUnauthorized]);

  // L'URL suit les filtres : un lien copié reproduit exactement cette file.
  useEffect(() => {
    onUrlStateChange?.({ bucket, q: query });
  }, [onUrlStateChange, bucket, query]);

  // Et les filtres suivent l'URL : un retour navigateur doit changer la file.
  const urlKey = urlState ? `${urlState.bucket}\u0000${urlState.q}` : "";
  useEffect(() => {
    if (!urlState) return;
    setBucket(urlState.bucket);
    // Une frappe en attente n'est pas écrasée par notre propre écriture URL.
    if (urlState.q !== query) {
      setSearch(urlState.q);
      setQuery(urlState.q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);

  useEffect(() => {
    if (openRow !== null) reasonRef.current?.focus();
  }, [openRow]);

  const openAction = useCallback((id: number, next: RevueDecision) => {
    setOpenRow(id);
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

  const keyState: ReviewKeyState = useMemo(() => ({
    count: rows.length,
    active,
    selected: NO_SELECTION,
    ids: rows.map((row) => row.id),
    rejecting: openRow !== null,
    help,
  }), [rows, active, openRow, help]);

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
      return;
    }
    if (!canWrite || submitting) return;
    const id = rows[active]?.id;
    if (id === undefined) return;
    if (intent.kind === "askReject") openAction(id, "refuser");
    else if (intent.kind === "decide") openAction(id, intent.decision);
  }

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

  return (
    <section
      className="revue"
      aria-label="Revue des rattachements"
      role="region"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <header className="revue__head">
        <div>
          <h1>Revue</h1>
          <p className="revue__count">{total} revendication{total === 1 ? "" : "s"} en attente d'une décision</p>
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
      <p className="revue__results" role="status">
        {rows.length} {rows.length === 1 ? "résultat affiché" : "résultats affichés"} sur {total} pour ces filtres
      </p>

      {notice ? <p className="revue__notice" role="status">{notice}</p> : null}
      {error ? <p className="revue__error" role="alert">{error}</p> : null}
      {loading ? <p className="revue__state" role="status">Chargement de la file de revue…</p> : null}
      {!loading && rows.length === 0 && !error
        ? <p className="revue__state">Aucune revendication à revoir.</p>
        : null}
      {!server ? <p className="revue__state">La file de revue exige l'API : aucune décision n'est simulée.</p> : null}
      {!canWrite ? <p className="revue__state">Lecture seule : connectez-vous pour décider.</p> : null}

      <ul className="revue__list">
        {rows.map((row, index) => (
          <li className="revue__row" key={row.id} data-bucket={row.triage.bucket} data-active={index === active ? "true" : undefined}>
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
              <button type="button" disabled={!canWrite || submitting} onClick={() => openAction(row.id, "accepter")}>
                Accepter
              </button>
              <button type="button" disabled={!canWrite || submitting} onClick={() => openAction(row.id, "refuser")}>
                Refuser
              </button>
              <button type="button" disabled={!canWrite || submitting} onClick={() => openAction(row.id, "creer")}>
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

      {help ? (
        <div className="revue__help" role="dialog" aria-modal="true" aria-labelledby="revue-help-title">
          <div className="revue__help-card">
            <h2 id="revue-help-title">Raccourcis clavier</h2>
            <dl>
              <dt>J / K</dt><dd>Descendre / monter la sélection</dd>
              <dt>A</dt><dd>Accepter le fait courant</dd>
              <dt>R</dt><dd>Refuser le fait courant</dd>
              <dt>C</dt><dd>Créer une organisation</dd>
              <dt>?</dt><dd>Afficher cette aide</dd>
              <dt>Échap</dt><dd>Fermer l'aide ou la décision en cours</dd>
            </dl>
            <button type="button" onClick={() => setHelp(false)}>Fermer</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
