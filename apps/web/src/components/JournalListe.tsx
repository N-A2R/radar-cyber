/**
 * Table des décisions de revue consignées dans le journal.
 * Composant de rendu pur : les états (chargement, erreur, vide) et la
 * pagination sont visibles sans API, donc vérifiables en SSR.
 */
import type { JournalDecision } from "../api";
import "./journal.css";

export const DECISION_LABEL: Record<Exclude<JournalDecision["decision"], null>, string> = {
  accepter: "accepter",
  refuser: "refuser",
  creer: "creer",
};

type Props = {
  rows: JournalDecision[];
  loading: boolean;
  error: string | null;
  /** Curseur de la page suivante renvoyé par l'API. */
  suivant: number | null;
  page: number;
  onPrecedent: () => void;
  onSuivant: () => void;
};

export default function JournalListe({
  rows, loading, error, suivant, page, onPrecedent, onSuivant,
}: Props) {
  return (
    <section className="journal" aria-label="Journal des décisions de revue">
      <header className="journal__head">
        <h1>Journal</h1>
        <p className="journal__count">décisions de revue enregistrées, les plus récentes d'abord</p>
      </header>

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
        <span>page {page}</span>
        <button type="button" onClick={onSuivant} disabled={loading || suivant === null}>
          Suivant
        </button>
      </footer>
    </section>
  );
}
