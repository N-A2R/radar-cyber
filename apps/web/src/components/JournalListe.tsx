/**
 * Table des décisions de revue consignées dans le journal.
 * Composant de rendu pur : filtres, états (chargement, erreur, vide) et
 * pagination sont visibles sans API, donc vérifiables en SSR.
 */
import type { JournalDecision } from "../api";
import "./journal.css";

/** Valeur du sélect décision pour les faits sans décision consignée. */
export const DECISION_NON_PRECISEE = "non-precisee";

export type JournalFiltres = {
  acteur?: string;
  decision?: string | null;
  du?: string;
  au?: string;
};

export const DECISION_LABEL: Record<Exclude<JournalDecision["decision"], null>, string> = {
  accepter: "accepter",
  refuser: "refuser",
  creer: "creer",
};

type Props = {
  rows: JournalDecision[];
  /** Nombre de lignes retenues après filtrage, toutes pages confondues. */
  resultats: number;
  filtres: JournalFiltres;
  onFiltre: (patch: JournalFiltres) => void;
  onReset: () => void;
  /** Le journal dépasse le plafond de 10 000 lignes chargées. */
  tronque: boolean;
  loading: boolean;
  error: string | null;
  page: number;
  pageCount: number;
  onPrecedent: () => void;
  onSuivant: () => void;
};

export default function JournalListe({
  rows, resultats, filtres, onFiltre, onReset, tronque,
  loading, error, page, pageCount, onPrecedent, onSuivant,
}: Props) {
  return (
    <section className="journal" aria-label="Journal des décisions de revue">
      <header className="journal__head">
        <h1>Journal</h1>
        <p className="journal__count">décisions de revue enregistrées, les plus récentes d'abord</p>
      </header>

      <div className="journal__filters" role="group" aria-label="Filtrer le journal">
        <div className="journal__field">
          <label htmlFor="journal-acteur">acteur</label>
          <input
            id="journal-acteur"
            type="search"
            placeholder="nom ou partie du nom…"
            value={filtres.acteur ?? ""}
            onChange={(event) => onFiltre({ acteur: event.target.value })}
          />
        </div>
        <div className="journal__field">
          <label htmlFor="journal-decision">décision</label>
          <select
            id="journal-decision"
            value={filtres.decision ?? ""}
            onChange={(event) => onFiltre({ decision: event.target.value || undefined })}
          >
            <option value="">toutes</option>
            {(Object.keys(DECISION_LABEL) as Array<keyof typeof DECISION_LABEL>).map((d) => (
              <option key={d} value={d}>{DECISION_LABEL[d]}</option>
            ))}
            <option value={DECISION_NON_PRECISEE}>non précisée</option>
          </select>
        </div>
        <div className="journal__field">
          <label htmlFor="journal-du">du</label>
          <input
            id="journal-du"
            type="date"
            value={filtres.du ?? ""}
            onChange={(event) => onFiltre({ du: event.target.value })}
          />
        </div>
        <div className="journal__field">
          <label htmlFor="journal-au">au</label>
          <input
            id="journal-au"
            type="date"
            value={filtres.au ?? ""}
            onChange={(event) => onFiltre({ au: event.target.value })}
          />
        </div>
        <button type="button" onClick={onReset}>Réinitialiser</button>
      </div>

      {tronque ? (
        <p className="journal__truncated" role="status">
          Journal tronqué aux 10 000 décisions les plus récentes : filtrez pour atteindre les autres.
        </p>
      ) : null}
      {error ? <p className="journal__error" role="alert">API : {error}</p> : null}
      {loading ? <p className="journal__state" role="status">Chargement du journal…</p> : null}
      {!loading && !error && rows.length === 0
        ? <p className="journal__state">aucune décision enregistrée</p>
        : null}

      <div className="journal__scroll">
        <table className="journal__table">
          <thead>
            <tr>
              <th scope="col">horodatage</th>
              <th scope="col">acteur</th>
              <th scope="col">décision</th>
              <th scope="col">indice</th>
              <th scope="col">raison</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {/* `recorded_at::text` arrive en `2026-11-21 14:03:12+00` :
                      on tronque sans réinventer de fuseau via `Date`. */}
                  <time dateTime={row.horodatage}>
                    {row.horodatage.slice(0, 16).replace("T", " ")}
                  </time>
                </td>
                <td>{row.acteur}</td>
                <td>
                  <span className="journal__decision" data-decision={row.decision ?? "inconnue"}>
                    {row.decision ? DECISION_LABEL[row.decision] : "non précisée"}
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
        <button type="button" onClick={onPrecedent} disabled={loading || page <= 1}>
          Précédent
        </button>
        <span>{resultats} résultat{resultats > 1 ? "s" : ""} — page {page} / {pageCount}</span>
        <button type="button" onClick={onSuivant} disabled={loading || page >= pageCount}>
          Suivant
        </button>
      </footer>
    </section>
  );
}
