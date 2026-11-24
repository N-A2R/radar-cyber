/**
 * Ce que l'organisation a vécu, groupé par fait.
 *
 * La fiche listait des événements : cinq lignes pour un seul incident relayé par
 * cinq rédactions, ou cinq lignes pour cinq incidents distincts — impossible de
 * faire la différence. Ici un fait est un fait : combien de sources, laquelle a
 * parlé la première, et où elles ne disent pas la même chose.
 *
 * Isolé dans son propre fichier pour être rendu hors réseau, donc vérifiable
 * sans navigateur ni base.
 */
import type { Corroboration, Historique } from "../api";
import { EmptyState } from "./Skeleton";
import { Badge } from "@astryxdesign/core/Badge";

/** « 12 h », « 2 j » : l'écart lisible entre le premier signalement et une reprise. */
function delai(heures: number): string {
  if (heures < 1) return "moins d'une heure après";
  if (heures < 24) return `${Math.round(heures)} h après`;
  return `${Math.round(heures / 24)} j après`;
}

const FORCE_LABEL: Record<string, string> = {
  isole: "source unique",
  corrobore: "2 sources",
  etabli: "3 sources ou plus",
};

export function renduCorroboration(corr: Corroboration | null, onAction?: () => void) {
  // Serveur antérieur à l'analyse multi-sources : on ne fait pas semblant.
  if (corr === null) {
    return (
      <section className="orgsheet__section" data-testid="corroboration-absente">
        <h3 className="orgsheet__section-title">faits</h3>
        {onAction
          ? <EmptyState message="regroupement multi-sources non disponible sur ce serveur" actionLabel="Fermer la fiche" onAction={onAction} />
          : <p className="orgsheet__empty">regroupement multi-sources non disponible sur ce serveur</p>}
      </section>
    );
  }


  const { resume, groupes, desaccords } = corr;

  return (
    <section className="orgsheet__section">
      <h3 className="orgsheet__section-title">
        faits <span className="orgsheet__count">{resume.faits}</span>
      </h3>
      <Badge label="multi-sources" className="orgsheet__badge" />
      <p className="orgsheet__breakdown">
        <span className="orgsheet__chip" role="status" aria-live="polite">
          corroborés <b>{resume.corrobores}</b>
        </span>
        <span className="orgsheet__chip" role="status" aria-live="polite">
          isolés <b>{resume.isoles}</b>
        </span>
        {resume.desaccords > 0 && (
          <span className="orgsheet__chip orgsheet__chip--desaccord">
            désaccords <b>{resume.desaccords}</b>
          </span>
        )}
      </p>

      {resume.faits === 0 && (onAction
        ? <EmptyState message="aucun fait sur 180 jours" actionLabel="Fermer la fiche" onAction={onAction} />
        : <p className="orgsheet__empty">aucun fait sur 180 jours</p>)}

      {groupes.length > 0 && (
        <ul className="orgsheet__list">
          {groupes.slice(0, 8).map((groupe) => (
            <li key={groupe.cle} className="orgsheet__row" data-force={groupe.force}>
              <span className={groupe.force === "isole" ? "orgsheet__mono" : "orgsheet__mono orgsheet__corrobore"}>
                {groupe.titre}
              </span>
              <span className="orgsheet__meta">
                {formatDateCourte(groupe.debut)} · {groupe.family} · {FORCE_LABEL[groupe.force]} ·{" "}
                {groupe.sources.map((s) => s.sourceId).join(", ")}
              </span>
              {/* Qui a parlé en premier, et combien de temps après : c'est la
                  question que pose tout analyste devant un fait corroboré. */}
              {groupe.sources.length > 1 && (
                <span className="orgsheet__meta orgsheet__reprise">
                  révélé par {groupe.sources[0]?.sourceId}
                  {groupe.sources.slice(1).map((s) => ` · ${s.sourceId} ${delai(s.delaiHeures)}`).join("")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {desaccords.length > 0 && (
        <>
          <h4 className="orgsheet__subtitle">ce sur quoi les sources ne s'accordent pas</h4>
          <ul className="orgsheet__list">
            {desaccords.slice(0, 6).map((d) => (
              <li key={`${d.cle}:${d.objet}`} className="orgsheet__row orgsheet__row--desaccord">
                <span className="orgsheet__desaccord">{d.description}</span>
                <span className="orgsheet__meta">
                  {d.positions.map((p) => `${p.sourceId} : ${p.valeur}`).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Date courte côté fiche : « 12 nov. 2026 ». */
function formatDateCourte(iso: string | null): string {
  if (!iso) return "date inconnue";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const TENDANCE_LABEL: Record<Historique["tendance"], string> = {
  nouveau: "nouvelle dans le radar",
  "en hausse": "plus active qu'avant",
  stable: "régulière",
  "en baisse": "moins active",
  ancien: "silencieuse depuis trois mois",
};

/** « mars 2025 » : un repère pour situer le début, pas une date technique. */
function moisLisible(iso: string | null): string {
  if (iso === null) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/**
 * Le profil historique : est-ce que c'est nouveau, ou est-ce qu'on la voit tout
 * le temps ? Sans cette distinction, l'organisation qui apparaît dans trois
 * faits ressemble à celle qui en a trente sur deux ans.
 */
export function renduHistorique(histo: Historique | null, onAction?: () => void) {
  if (histo === null) {
    return (
      <section className="orgsheet__section" data-testid="historique-absent">
        <h3 className="orgsheet__section-title">historique</h3>
        {onAction
          ? <EmptyState message="profil historique non disponible sur ce serveur" actionLabel="Fermer la fiche" onAction={onAction} />
          : <p className="orgsheet__empty">profil historique non disponible sur ce serveur</p>}
      </section>
    );
  }

  const pic = Math.max(1, ...histo.parMois.map((m) => m.faits));

  return (
    <section className="orgsheet__section">
      <h3 className="orgsheet__section-title">
        historique <span className="orgsheet__count">{histo.faits} faits / 12 mois</span>
      </h3>
      {histo.faits === 0 ? (
        onAction
          ? <EmptyState message="aucun fait sur douze mois" actionLabel="Fermer la fiche" onAction={onAction} />
          : <p className="orgsheet__empty">aucun fait sur douze mois</p>
      ) : (
        <>
          <p className="orgsheet__meta" data-tendance={histo.tendance}>
            vue depuis {moisLisible(histo.premier)} · {TENDANCE_LABEL[histo.tendance]} ·{" "}
            {histo.sources.length} source{histo.sources.length > 1 ? "s" : ""}
          </p>
          {/* Un mois vide est dessiné comme un vide, pas omis : c'est l'absence
              qui porte l'information. */}
          <ol className="orgsheet__mois" aria-label="faits par mois sur douze mois">
            {histo.parMois.map((m) => (
              <li
                key={m.mois}
                className="orgsheet__mois-item"
                data-vide={m.faits === 0 ? "oui" : "non"}
                title={`${moisLisible(`${m.mois}-01T12:00:00Z`)} : ${m.faits} fait${m.faits > 1 ? "s" : ""}`}
              >
                <span
                  className="orgsheet__mois-barre"
                  style={{ height: `${Math.round((m.faits / pic) * 100)}%` }}
                  aria-hidden="true"
                />
              </li>
            ))}
          </ol>
          {histo.familles.length > 0 && (
            <p className="orgsheet__meta">
              {histo.familles
                .slice(0, 4)
                .map((f) => `${f.family} ×${f.faits}`)
                .join(" · ")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
