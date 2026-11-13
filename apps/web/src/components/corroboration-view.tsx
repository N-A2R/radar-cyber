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
import type { Corroboration } from "../api";

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

export function renduCorroboration(corr: Corroboration | null) {
  // Serveur antérieur à l'analyse multi-sources : on ne fait pas semblant.
  if (corr === null) {
    return (
      <section className="orgsheet__section" data-testid="corroboration-absente">
        <h3 className="orgsheet__section-title">faits</h3>
        <p className="orgsheet__empty">regroupement multi-sources non disponible sur ce serveur</p>
      </section>
    );
  }

  const { resume, groupes, desaccords } = corr;

  return (
    <section className="orgsheet__section">
      <h3 className="orgsheet__section-title">
        faits <span className="orgsheet__count">{resume.faits}</span>
      </h3>
      <p className="orgsheet__breakdown">
        <span className="orgsheet__chip">
          corroborés <b>{resume.corrobores}</b>
        </span>
        <span className="orgsheet__chip">
          isolés <b>{resume.isoles}</b>
        </span>
        {resume.desaccords > 0 && (
          <span className="orgsheet__chip orgsheet__chip--desaccord">
            désaccords <b>{resume.desaccords}</b>
          </span>
        )}
      </p>

      {resume.faits === 0 && <p className="orgsheet__empty">aucun fait sur 180 jours</p>}

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
