/**
 * Écran Couverture — le chiffre de couverture et ses décompositions.
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
import { Card } from "@astryxdesign/core/Card";
import { Table } from "@astryxdesign/core/Table";


export type CouvertureProps = {
  data: CouvertureResponse | null;
  loading: boolean;
  error: string | null;
};

export type TriDepartement = "departement" | "vus" | "total" | "taux";
export type SensTri = "asc" | "desc";

const LIBELLES_MOTIF: Record<string, string> = {
  vu: "Vu",
  pas_admis: "Non admis comme cyber",
  pas_rattache: "Non rattaché à une organisation",
  hors_fenetre: "Hors fenêtre de mesure",
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
    if (cle === "departement") return a.departement.localeCompare(b.departement, "fr") * signe;
    // Le département départage à l'alphabetique, toujours dans le même sens :
    // deux taux égaux ne doivent pas s'échanger quand on inverse le tri.
    return (a[cle] - b[cle]) * signe || a.departement.localeCompare(b.departement, "fr");
  });
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
        {/* Le code de mesure reste accessible, mais il ne double plus le libellé
            à l'écran : « Vu vu » ne dit rien de plus que « Vu ». */}
        <span title={motif.motif}>{libelle}</span>
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
        {actif ? <span aria-hidden="true">{sens === "asc" ? " ▲" : " ▼"}</span> : null}
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
  const types = useMemo(() => data?.parType ?? [], [data]);

  function changerTri(cle: TriDepartement) {
    if (cle === tri) {
      setSens((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setTri(cle);
    setSens(cle === "departement" ? "asc" : "desc");
  }

  return (
    <Card variant="transparent" padding={0}>
    <section className="coverage" aria-labelledby="coverage-title">
      <header className="coverage__header">
        <div>
          <h2 id="coverage-title">Couverture</h2>
          <p className="coverage__subtitle">
            Incidents cyber publics en Nouvelle-Aquitaine vus par le radar
          </p>
        </div>
        {data ? (
          <p className="coverage__window">
            Fenêtre de mesure <time dateTime={data.fenetre.debut}>{data.fenetre.debut}</time>
            {" → "}
            <time dateTime={data.fenetre.fin}>{data.fenetre.fin}</time>
          </p>
        ) : null}
      </header>

      {error ? (
        <p className="coverage__error" role="alert">Couverture indisponible : {error}</p>
      ) : null}

      {loading && !data ? (
        <p className="coverage__loading" role="status">Chargement de la couverture…</p>
      ) : null}

      {!data ? (
        <p className="coverage__placeholder" aria-label="Aucun chiffre de couverture disponible">—</p>
      ) : (
        <>
          {data.stale ? (
            <div className="coverage__warning" role="alert">
              <strong>Non publiable — corpus périmé.</strong>{" "}
              L'empreinte du corpus servi ne correspond pas à celle de la référence
              enregistrée. Ne pas citer ce chiffre avant le rafraîchissement du corpus.
            </div>
          ) : null}

          <div className="coverage__hero">
            <p className="coverage__hero-number" aria-label={`${data.global.taux} pour cent couverts`}>
              {data.global.total > 0 ? data.global.taux : "—"}
              <span aria-hidden="true">%</span>
            </p>
            <div className="coverage__hero-context">
              <p className="coverage__hero-count">
                <b>{data.global.vus}</b> sur <b>{data.global.total}</b> incidents vus
              </p>
              <p className="coverage__hero-note">
                Part des incidents publiés collectés, reconnus comme cyber et rattachés
                à la bonne organisation.
              </p>
            </div>
          </div>

          {data.global.total === 0 ? (
            <p className="coverage__empty" role="status">
              Aucun incident dans la fenêtre de mesure. Aucun taux ne peut être publié.
            </p>
          ) : null}

          <section className="coverage__section" aria-labelledby="coverage-motifs">
            <h3 id="coverage-motifs">Pourquoi des incidents manquent</h3>
            <p className="coverage__hint">
              Chaque incident a exactement une issue ; les parts s'additionnent au total global.
            </p>
            {data.parMotif.length === 0 ? (
              <p className="coverage__empty">Aucune décomposition publiée pour cette mesure.</p>
            ) : (
              <ul className="coverage__breakdown">
                {data.parMotif.map((motif) => (
                  <LigneMotif key={motif.motif} motif={motif} />
                ))}
              </ul>
            )}
          </section>

          <section className="coverage__section" aria-labelledby="coverage-depts">
            <h3 id="coverage-depts">Par département</h3>
            <p className="coverage__hint">Cliquez sur un en-tête de colonne pour trier. Tous les départements sont affichés.</p>
            <div className="coverage__scroll">
              <Table className="coverage__table" density="compact" dividers="rows">
                <thead>
                  <tr>
                    <EnTeteTri cle="departement" libelle="Département" tri={tri} sens={sens} onTri={changerTri} />
                    <EnTeteTri cle="vus" libelle="Vus" tri={tri} sens={sens} onTri={changerTri} />
                    <EnTeteTri cle="total" libelle="Incidents" tri={tri} sens={sens} onTri={changerTri} />
                    <EnTeteTri cle="taux" libelle="Taux de couverture" tri={tri} sens={sens} onTri={changerTri} />
                  </tr>
                </thead>
                <tbody>
                  {departements.length === 0 ? (
                    <tr><td className="coverage__empty" colSpan={4}>Aucune donnée départementale publiée.</td></tr>
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
              </Table>
            </div>
          </section>

          <section className="coverage__section" aria-labelledby="coverage-secteurs">
            <h3 id="coverage-secteurs">Par type d'entité</h3>
            <p className="coverage__hint">Taux parmi les incidents publiés de chaque type d'entité.</p>
            {types.length === 0 ? (
              <p className="coverage__empty">Aucune décomposition par type d'entité publiée.</p>
            ) : (
              <ul className="coverage__breakdown">
                {types.map((ligne) => (
                  <li className="coverage__breakdown-row" key={ligne.type}>
                    <div className="coverage__breakdown-label"><span>{ligne.type}</span></div>
                    <Barre
                      largeur={ligne.taux}
                      libelle={`${ligne.type} : ${ligne.taux} % de couverture, ${ligne.vus} sur ${ligne.total} incidents`}
                    />
                    <span className="coverage__breakdown-value">
                      <b>{ligne.taux} %</b> <span>/ {ligne.vus} sur {ligne.total}</span>
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
                <dt>Calculé le</dt>
                <dd><time dateTime={data.dateCalcul}>{data.dateCalcul}</time></dd>
              </div>
              <div>
                <dt>SHA-256 du corpus</dt>
                <dd><code className="coverage__hash">{data.hashCorpus}</code></dd>
              </div>
              <div>
                <dt>État du corpus</dt>
                <dd>{data.stale ? "Périmé — non publiable" : "Correspond à la référence enregistrée"}</dd>
              </div>
            </dl>
          </footer>
        </>
      )}
    </section>
    </Card>
  );
}
