/**
 * Écran Coverage — le chiffre de couverture et ses décompositions.
 *
 * Aucune donnée n'est calculée ici : la route `/api/couverture` sert une mesure
 * figée, avec son empreinte de corpus. Le front trie et met en forme, il ne
 * réinvente ni le taux ni les motifs. Quand le hash servi diverge de la
 * référence, le bandeau dit explicitement que le chiffre n'est pas publiable :
 * un grand nombre sans cette réserve serait trompeur.
 */
import { useMemo, useState } from "react";
import type { CouvertureLigne, CouvertureResponse } from "../api";
import "./couverture.css";

export type CouvertureProps = {
  data: CouvertureResponse | null;
  loading: boolean;
  error: string | null;
};

export type TriDepartement = "departement" | "vus" | "total" | "taux";
export type SensTri = "asc" | "desc";

const LIBELLES_MOTIF: Record<string, string> = {
  vu: "Seen",
  pas_admis: "Not admitted as cyber",
  pas_rattache: "Not linked to an organisation",
  hors_fenetre: "Outside the measurement window",
};

/** Libellé lisible d'un motif venu de la mesure, sans jamais le masquer. */
export function libelleMotif(motif: string): string {
  return LIBELLES_MOTIF[motif] ?? motif.replace(/_/g, " ");
}

/**
 * Tri du tableau département. La clé vient de l'utilisateur, pas de l'ordre
 * renvoyé par l'API : un en-tête cliqué doit toujours donner le même ordre.
 */
export function trierDepartements(
  lignes: readonly (CouvertureLigne & { departement: string })[],
  cle: TriDepartement,
  sens: SensTri,
): Array<CouvertureLigne & { departement: string }> {
  const signe = sens === "asc" ? 1 : -1;
  return [...lignes].sort((a, b) => {
    if (cle === "departement") return a.departement.localeCompare(b.departement, "en") * signe;
    // Le département départage à l'alphabetique, toujours dans le même sens :
    // deux taux égaux ne doivent pas s'échanger quand on inverse le tri.
    return (a[cle] - b[cle]) * signe || a.departement.localeCompare(b.departement, "en");
  });
}

/** L'évolution se lit dans le temps, jamais dans l'ordre d'agrégation reçu. */
export function trierParMois(
  lignes: readonly (CouvertureLigne & { mois: string })[],
): Array<CouvertureLigne & { mois: string }> {
  return [...lignes].sort((a, b) => a.mois.localeCompare(b.mois));
}

function Barre({ largeur, libelle }: { largeur: number; libelle: string }) {
  const borne = Math.max(0, Math.min(100, largeur));
  return (
    <span className="coverage__bar" role="img" aria-label={libelle}>
      <span className="coverage__bar-fill" style={{ width: `${borne}%` }} />
    </span>
  );
}

function LigneMotif({ motif }: { motif: CouvertureResponse["parMotif"][number] }) {
  const libelle = libelleMotif(motif.motif);
  return (
    <li className="coverage__breakdown-row">
      <div className="coverage__breakdown-label">
        <span>{libelle}</span>
        <code>{motif.motif}</code>
      </div>
      <Barre largeur={motif.part} libelle={`${libelle}: ${motif.part} %`} />
      <span className="coverage__breakdown-value">
        <b>{motif.incidents}</b> <span>/ {motif.part} %</span>
      </span>
    </li>
  );
}

type EnTeteProps = {
  cle: TriDepartement;
  libelle: string;
  tri: TriDepartement;
  sens: SensTri;
  onTri: (cle: TriDepartement) => void;
};

function EnTeteTri({ cle, libelle, tri, sens, onTri }: EnTeteProps) {
  const actif = tri === cle;
  return (
    <th scope="col" aria-sort={actif ? (sens === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="coverage__sort" onClick={() => onTri(cle)}>
        {libelle}
        <span aria-hidden="true">{actif ? (sens === "asc" ? " ▲" : " ▼") : " ↕"}</span>
      </button>
    </th>
  );
}

export default function CouvertureView({ data, loading, error }: CouvertureProps) {
  const [tri, setTri] = useState<TriDepartement>("total");
  const [sens, setSens] = useState<SensTri>("desc");

  const departements = useMemo(
    () => trierDepartements(data?.parDepartement ?? [], tri, sens),
    [data, tri, sens],
  );
  const mois = useMemo(() => trierParMois(data?.parMois ?? []), [data]);

  function changerTri(cle: TriDepartement) {
    if (cle === tri) {
      setSens((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setTri(cle);
    setSens(cle === "departement" ? "asc" : "desc");
  }

  return (
    <section className="coverage" aria-labelledby="coverage-title">
      <header className="coverage__header">
        <div>
          <h2 id="coverage-title">Coverage</h2>
          <p className="coverage__subtitle">
            Public cyber incidents in Nouvelle-Aquitaine seen by the radar
          </p>
        </div>
        {data ? (
          <p className="coverage__window">
            Measurement window <time dateTime={data.fenetre.debut}>{data.fenetre.debut}</time>
            {" → "}
            <time dateTime={data.fenetre.fin}>{data.fenetre.fin}</time>
          </p>
        ) : null}
      </header>

      {error ? (
        <p className="coverage__error" role="alert">Coverage unavailable: {error}</p>
      ) : null}

      {loading && !data ? (
        <p className="coverage__loading" role="status">Loading coverage…</p>
      ) : null}

      {!data ? (
        <p className="coverage__placeholder" aria-label="No coverage figure available">—</p>
      ) : (
        <>
          {data.stale ? (
            <div className="coverage__warning" role="alert">
              <strong>Not publishable — corpus out of date.</strong>{" "}
              The served corpus hash does not match the recorded reference hash.
              Do not quote this figure until the reference corpus is refreshed.
            </div>
          ) : null}

          <div className="coverage__hero">
            <p className="coverage__hero-number" aria-label={`${data.global.taux} percent covered`}>
              {data.global.total > 0 ? data.global.taux : "—"}
              <span aria-hidden="true">%</span>
            </p>
            <div className="coverage__hero-context">
              <p className="coverage__hero-count">
                <b>{data.global.vus}</b> of <b>{data.global.total}</b> incidents seen
              </p>
              <p className="coverage__hero-note">
                Share of published incidents collected, recognised as cyber and linked
                to the right organisation.
              </p>
            </div>
          </div>

          {data.global.total === 0 ? (
            <p className="coverage__empty" role="status">
              No incident in the measurement window. No rate can be published.
            </p>
          ) : null}

          <section className="coverage__section" aria-labelledby="coverage-motifs">
            <h3 id="coverage-motifs">Why incidents are missing</h3>
            <p className="coverage__hint">
              Each incident has exactly one outcome; the shares add up to the global total.
            </p>
            {data.parMotif.length === 0 ? (
              <p className="coverage__empty">No breakdown published for this measure.</p>
            ) : (
              <ul className="coverage__breakdown">
                {data.parMotif.map((motif) => (
                  <LigneMotif key={motif.motif} motif={motif} />
                ))}
              </ul>
            )}
          </section>

          <section className="coverage__section" aria-labelledby="coverage-depts">
            <h3 id="coverage-depts">By department</h3>
            <p className="coverage__hint">Select a column heading to sort. All departments are shown.</p>
            <div className="coverage__scroll">
              <table className="coverage__table">
                <thead>
                  <tr>
                    <EnTeteTri cle="departement" libelle="Department" tri={tri} sens={sens} onTri={changerTri} />
                    <EnTeteTri cle="vus" libelle="Seen" tri={tri} sens={sens} onTri={changerTri} />
                    <EnTeteTri cle="total" libelle="Incidents" tri={tri} sens={sens} onTri={changerTri} />
                    <EnTeteTri cle="taux" libelle="Coverage rate" tri={tri} sens={sens} onTri={changerTri} />
                  </tr>
                </thead>
                <tbody>
                  {departements.length === 0 ? (
                    <tr><td className="coverage__empty" colSpan={4}>No department data published.</td></tr>
                  ) : (
                    departements.map((ligne) => (
                      <tr key={ligne.departement}>
                        <th scope="row">{ligne.departement}</th>
                        <td>{ligne.vus}</td>
                        <td>{ligne.total}</td>
                        <td>{ligne.taux} %</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="coverage__section" aria-labelledby="coverage-secteurs">
            <h3 id="coverage-secteurs">By entity type</h3>
            <p className="coverage__hint">Rate among published incidents of each entity type.</p>
            {data.parSecteur.length === 0 ? (
              <p className="coverage__empty">No entity-type breakdown published.</p>
            ) : (
              <ul className="coverage__breakdown">
                {data.parSecteur.map((ligne) => (
                  <li className="coverage__breakdown-row" key={ligne.secteur}>
                    <div className="coverage__breakdown-label"><span>{ligne.secteur}</span></div>
                    <Barre
                      largeur={ligne.taux}
                      libelle={`${ligne.secteur}: ${ligne.taux} % coverage, ${ligne.vus} of ${ligne.total} incidents`}
                    />
                    <span className="coverage__breakdown-value">
                      <b>{ligne.taux} %</b> <span>/ {ligne.vus} of {ligne.total}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="coverage__section" aria-labelledby="coverage-mois">
            <h3 id="coverage-mois">Monthly evolution</h3>
            <p className="coverage__hint">
              Coverage rate by publication month. Months with no incident seen stay visible.
            </p>
            {mois.length === 0 ? (
              <p className="coverage__empty">No monthly series published.</p>
            ) : (
              <ul className="coverage__months">
                {mois.map((ligne) => (
                  <li className="coverage__month" key={ligne.mois}>
                    <Barre
                      largeur={ligne.taux}
                      libelle={`${ligne.mois}: ${ligne.taux} % coverage, ${ligne.vus} of ${ligne.total} incidents`}
                    />
                    <time dateTime={ligne.mois} className="coverage__month-label">{ligne.mois}</time>
                    <span className="coverage__month-value">
                      <b>{ligne.taux} %</b> <span>/ {ligne.vus} of {ligne.total}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <footer className="coverage__provenance">
            <h3>Provenance</h3>
            <dl>
              <div>
                <dt>Calculated on</dt>
                <dd><time dateTime={data.dateCalcul}>{data.dateCalcul}</time></dd>
              </div>
              <div>
                <dt>Corpus SHA-256</dt>
                <dd><code className="coverage__hash">{data.hashCorpus}</code></dd>
              </div>
              <div>
                <dt>Corpus status</dt>
                <dd>{data.stale ? "Out of date — not publishable" : "Matches the recorded reference"}</dd>
              </div>
            </dl>
          </footer>
        </>
      )}
    </section>
  );
}
