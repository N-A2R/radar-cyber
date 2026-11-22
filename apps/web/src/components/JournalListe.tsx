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
  accepter: "Acceptée",
  refuser: "Refusée",
  creer: "Créée",
};

/** Labels are translations of stored kinds; an unknown kind is shown verbatim. */
export const KIND_LABEL: Record<string, string> = {
  "review.decided": "Décision de revue",
  "org.created": "Organisation créée",
  "org.changed": "Correction d'organisation",
  "alert.changed": "Changement d'alerte",
  "event.admitted": "Événement admis",
  "event.rattachement": "Rattachement d'organisation",
  "match.decided": "Décision de rapprochement",
  "match.refuse": "Rapprochement refusé",
  "referentiel.charged": "Référentiel chargé",
  "source.changed": "Changement de source",
  "source.morte": "Source retirée",
  "journal.lacune": "Lacune de journal",
  "event.purge": "Purge d'événement",
};

/** Payload keys that carry the proof; everything else is context. */
const PROOF_KEYS: Record<string, true> = {
  preuve: true,
  proof: true,
  evidence: true,
};

/**
 * French labels for stored payload keys. The raw key stays available through
 * the `title` attribute, never as the visible text.
 */
export const KEY_LABEL: Record<string, string> = {
  preuve: "Preuve",
  proof: "Preuve",
  evidence: "Preuve",
  decision: "Décision",
  reason: "Motif",
  motif: "Motif",
  action: "Action",
  regle: "Règle",
  agent: "Agent",
  score: "Score",
  orgId: "Identifiant d'organisation",
  nomBrut: "Nom brut",
  changements: "Changements",
  quarantineId: "Identifiant de quarantaine",
  avant: "Avant",
  apres: "Après",
  sujet: "Sujet",
  acteur: "Acteur",
  resume: "Résumé",
  raison: "Motif",
};

/** Readable French label for a payload key; unknown keys are humanised, never raw. */
export function keyLabel(key: string): string {
  const known = KEY_LABEL[key];
  if (known) return known;
  const words = key
    .replace(/[._-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

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
    <aside className="journal__detail" aria-label={`Détails de l'entrée de journal ${row.id}`}>
      <header className="journal__detail-head">
        <h2>Entrée n°{row.id}</h2>
        <span className="journal__kind" data-kind={row.kind}>
          {KIND_LABEL[row.kind] ?? row.kind}
        </span>
      </header>

      <dl className="journal__detail-meta">
        <dt>Date (UTC)</dt>
        <dd>{row.horodatage}</dd>
        <dt>Acteur</dt>
        <dd>{row.acteur}</dd>
        <dt>Décision</dt>
        <dd>{row.decision ? DECISION_LABEL[row.decision] : "Non précisée"}</dd>
        <dt>Sujet</dt>
        <dd>{row.sujet}</dd>
        <dt>Résumé</dt>
        <dd>{row.resume ?? "—"}</dd>
        <dt>Motif</dt>
        <dd>{row.raison ?? "Aucun motif enregistré pour cette entrée."}</dd>
      </dl>

      <section className="journal__detail-section">
        <h3>Preuve</h3>
        {preuves.length === 0
          ? <p className="journal__detail-empty">Aucune preuve enregistrée pour cette entrée.</p>
          : (
            <dl className="journal__detail-values">
              {preuves.map(([key, value]) => (
                <div key={key}>
                  <dt title={key}>{keyLabel(key)}</dt>
                  <dd><pre>{formatValue(value)}</pre></dd>
                </div>
              ))}
            </dl>
          )}
      </section>

      <section className="journal__detail-section">
        <h3>Contexte</h3>
        {contexte.length === 0
          ? <p className="journal__detail-empty">Aucun contexte supplémentaire enregistré.</p>
          : (
            <dl className="journal__detail-values">
              {contexte.map(([key, value]) => (
                <div key={key}>
                  <dt title={key}>{keyLabel(key)}</dt>
                  <dd><pre>{formatValue(value)}</pre></dd>
                </div>
              ))}
            </dl>
          )}
      </section>
    </aside>
  );
}

/** Nombre de lignes fantômes affichées pendant le chargement d'une page. */
const SKELETON_ROWS = 8;

type Props = {
  /** Lignes de la page courante, rendues par le serveur. */
  rows: JournalDecision[];
  /** Total filtré, toutes pages confondues — rendu par le serveur. */
  total: number;
  filters: JournalFilters;
  onFilterChange: (patch: JournalFilters) => void;
  onReset: () => void;
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
  rows, total, filters, onFilterChange, onReset,
  loading, error, page, pageCount, onPrevious, onNext,
  selected, onSelect, onCloseDetail, onExport, exporting, exportError, onRetry,
}: Props) {
  const hasFilters = Boolean(
    filters.actor || filters.q || (filters.kind && filters.kind !== "all") || filters.from || filters.to,
  );

  return (
    <section className="journal" aria-label="Journal d'audit">
      <header className="journal__head">
        <div>
          <h1>Journal</h1>
          <p className="journal__count">
            Registre auditable des décisions — revues, publications et corrections, plus récentes d'abord
          </p>
        </div>
        <button
          type="button"
          className="journal__export"
          onClick={onExport}
          disabled={loading || exporting}
        >
          {exporting ? "Préparation du CSV…" : "Exporter en CSV"}
        </button>
      </header>

      <div className="journal__filters" role="group" aria-label="Filtrer le journal">
        <div className="journal__field journal__field--search">
          <label htmlFor="journal-q">Rechercher</label>
          <input
            id="journal-q"
            type="search"
            placeholder="sujet, acteur, motif, preuve…"
            value={filters.q ?? ""}
            onChange={(event) => onFilterChange({ q: event.target.value })}
          />
        </div>
        <div className="journal__field">
          <label htmlFor="journal-actor">Acteur</label>
          <input
            id="journal-actor"
            type="search"
            placeholder="nom ou partie d'un nom…"
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
            <option value="all">Tous les types</option>
            <option value="review">Décisions de revue</option>
            <option value="publication">Publications</option>
            <option value="correction">Corrections</option>
          </select>
        </div>
        <div className="journal__field">
          <label htmlFor="journal-from">Du</label>
          <input
            id="journal-from"
            type="date"
            value={filters.from ?? ""}
            onChange={(event) => onFilterChange({ from: event.target.value })}
          />
        </div>
        <div className="journal__field">
          <label htmlFor="journal-to">Au</label>
          <input
            id="journal-to"
            type="date"
            value={filters.to ?? ""}
            onChange={(event) => onFilterChange({ to: event.target.value })}
          />
        </div>
        <button type="button" className="journal__reset" onClick={onReset}>Réinitialiser</button>
      </div>

      {error ? (
        <div className="journal__error" role="alert">
          <span>API : {error}</span>
          {onRetry ? (
            <button type="button" className="journal__retry" onClick={onRetry}>Réessayer</button>
          ) : null}
        </div>
      ) : null}
      {exportError ? <p className="journal__error" role="alert">{exportError}</p> : null}
      {loading ? <LoadingSkeleton label="Chargement du journal…" /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          message={
            hasFilters
              ? "Aucune entrée de journal ne correspond à ces filtres."
              : "Aucune entrée de journal enregistrée pour l'instant."
          }
          actionLabel={onRetry ? "Recharger le journal" : "Page précédente"}
          onAction={onRetry ?? onPrevious}
        />
      ) : null}

      <div
        className="journal__scroll"
        role="region"
        aria-label="Entrées du journal"
        tabIndex={0}
      >
        <table className="journal__table">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Date (UTC)</th>
              <th scope="col">Type</th>
              <th scope="col">Acteur</th>
              <th scope="col">Décision</th>
              <th scope="col">Résumé</th>
              <th scope="col"><span className="journal__sr-only">Détails</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <tr key={`squelette-${index}`} className="journal__row journal__row--squelette" aria-hidden="true">
                {Array.from({ length: 6 }, (_, cell) => (
                  <td key={cell}><span className="journal__shimmer" /></td>
                ))}
              </tr>
            )) : rows.map((row) => (
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
                    {row.decision ? DECISION_LABEL[row.decision] : "Non précisée"}
                  </span>
                </td>
                <td title={row.resume ?? row.raison ?? row.indice ?? "—"}>
                  {row.resume ?? row.raison ?? row.indice ?? "—"}
                </td>
                <td>
                  <button
                    type="button"
                    className="journal__open"
                    onClick={() => onSelect(row)}
                    aria-label={`Ouvrir le détail de l'entrée de journal ${row.id}`}
                  >
                    Détails
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="journal__foot">
        <button type="button" onClick={onPrevious} disabled={loading || page <= 1}>
          Précédent
        </button>
        <span>
          {loading
            ? "Chargement…"
            : `${total} ${total === 1 ? "entrée" : "entrées"} — page ${page} / ${pageCount}`}
        </span>
        <button type="button" onClick={onNext} disabled={loading || page >= pageCount}>
          Suivant
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
              Fermer le détail
            </button>
            <EntryDetails row={selected} />
          </div>
        </>
      ) : null}
    </section>
  );
}
