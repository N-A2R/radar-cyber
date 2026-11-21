/**
 * Écran d'accueil : ce qui s'est passé dans les dernières 24 h.
 *
 * Tout vient de GET /api/today — compteurs compris. Aucune valeur par défaut
 * numérique : tant que la réponse n'est pas là, on affiche un tiret, pas un
 * zéro qui prétendrait mesurer quelque chose.
 */
import type { TodayEvent } from "../api";
import { ErrorRetry } from "./ErrorRetry";
import type { TodayViewProps } from "../contracts";
import "./today.css";
import LieesCard from "./LieesCard";

/** Date lisible et sans ambiguïté : UTC affichée, jamais une heure locale devinée. */
export function dateLisible(iso: string | null): string {
  if (!iso) return "date inconnue";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function instant(iso: string | null): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(iso.replace(" ", "T"));
  return Number.isFinite(t) ? t : 0;
}

/** L'API trie déjà ; on retrie pour tenir le contrat même avec un vieux serveur. */
export function triRecents(evenements: TodayEvent[]): TodayEvent[] {
  return [...evenements].sort(
    (a, b) => instant(b.date) - instant(a.date) || Number(b.id) - Number(a.id),
  );
}

function options(valeurs: (string | null)[], courant: string | null): string[] {
  const unique = new Set(valeurs.filter((v): v is string => Boolean(v)));
  if (courant) unique.add(courant);
  return [...unique].sort((a, b) => a.localeCompare(b, "fr"));
}

export default function TodayView({
  data,
  loading,
  error,
  family,
  dept,
  onFamily,
  onDept,
  onOpenOrg,
  onOpenEvent,
  onRetry,
}: TodayViewProps) {
  const evenements = triRecents(data?.evenements ?? []);
  const familles = options(evenements.map((e) => e.famille), family);
  const depts = options(evenements.map((e) => e.dept), dept);
  const compteurs = data?.compteurs;
  const vide = data !== null && !loading && !error && evenements.length === 0;

  return (
    <section className="today" aria-labelledby="today-titre">
      <LieesCard />
      <header className="today__head">
        <div>
          <p className="today__kicker">veille du jour</p>
          <h1 className="today__titre" id="today-titre">Aujourd'hui</h1>
          <p className="today__sous-titre">Les 24 dernières heures, telles que collectées.</p>
        </div>
        <div className="today__compteurs" aria-label="Compteurs en direct">
          <div className="today__compteur">
            <span className="today__valeur">{compteurs ? compteurs.evenements24h : "—"}</span>
            <span className="today__libelle">événements · 24 h</span>
          </div>
        </div>
      </header>

      <div className="today__filtres" role="group" aria-label="Filtres de la période">
        <label className="today__filtre">
          <span>famille</span>
          <select
            value={family ?? ""}
            onChange={(e) => onFamily(e.target.value || null)}
            aria-label="Filtrer par famille"
          >
            <option value="">toutes les familles</option>
            {familles.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="today__filtre">
          <span>département</span>
          <select
            value={dept ?? ""}
            onChange={(e) => onDept(e.target.value || null)}
            aria-label="Filtrer par département"
          >
            <option value="">tous les départements</option>
            {depts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        {compteurs?.derniereCollecte ? (
          <p className="today__collecte">dernière collecte : {dateLisible(compteurs.derniereCollecte)}</p>
        ) : null}
      </div>

      {loading ? <p className="today__statut" role="status">chargement des événements…</p> : null}
      {error ? <ErrorRetry message={`API : ${error}`} onRetry={onRetry} className="today__statut today__statut--erreur" /> : null}

      {vide ? (
        <div className="today__vide" role="status">
          <p className="today__vide-titre">Aucun incident sur cette période</p>
          <p className="today__vide-detail">
            {family || dept
              ? `Filtres actifs : ${family ? `famille « ${family} »` : ""}${family && dept ? ", " : ""}${dept ? `département ${dept}` : ""}.`
              : "Aucun filtre actif."}
          </p>
        </div>
      ) : null}

      {evenements.length > 0 ? (
        <div className="today__table-wrap">
          <table className="today__table">
            <thead>
              <tr>
                <th scope="col">date</th>
                <th scope="col">titre</th>
                <th scope="col">organisation</th>
                <th scope="col">source</th>
                <th scope="col">famille</th>
                <th scope="col">lien</th>
              </tr>
            </thead>
            <tbody>
              {evenements.map((e) => (
                <tr key={e.id}>
                  <td>
                    <time dateTime={e.date ?? undefined} title={e.dateSource === "collecte" ? "date de collecte" : "date observée"}>
                      {dateLisible(e.date)}
                    </time>
                  </td>
                  <td className="today__cellule-titre">
                    <button type="button" className="today__lien-titre" onClick={() => onOpenEvent(String(e.id))}>
                      {e.titre}
                    </button>
                  </td>
                  <td>
                    {e.orgId !== null ? (
                      <button type="button" className="today__lien-org" onClick={() => onOpenOrg(e.orgId as number)}>
                        {e.organisation ?? `organisation ${e.orgId}`}
                      </button>
                    ) : (
                      <span>non rattaché</span>
                    )}
                  </td>
                  <td>{e.source}</td>
                  <td>{e.famille}</td>
                  <td>
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer noopener">ouvrir la source</a>
                    ) : (
                      <span>lien absent</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
