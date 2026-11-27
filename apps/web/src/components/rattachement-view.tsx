/**
 * Le bloc « rattachement » de l'inspecteur : une décision, expliquée.
 *
 * Séparé du composant pour deux raisons : il se rend sans réseau, donc il se
 * vérifie dans un test ; et il porte une règle produit qui n'a rien à voir avec
 * la mise en page — **un refus de trancher n'est pas une absence**. Le moteur
 * qui refuse de choisir entre deux homonymes a fait son travail ; l'écran doit
 * le dire, sinon un analyste lira « rien trouvé » là où le système a dit « je ne
 * devine pas ».
 */
import type { RattachementExplication } from "../api";
import { EmptyState } from "./Skeleton";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
/** Phrase et détails d'un rattachement. `null` = événement d'avant la trace. */
export function renduRattachement(
  explication: RattachementExplication | null,
  rattache = explication !== null && explication.motif !== "aucun" && explication.motif !== "ambiant" && explication.motif !== "ambigu",
  onAction?: () => void,
) {
  if (explication === null) {
    // Un événement ingéré avant que le pourquoi soit conservé : le dire vaut
    // mieux que laisser croire qu'il n'y avait rien à dire.
    const message = rattache ? "organisé, motif non conservé" : "aucune organisation rattachée, motif non conservé";
    return (
      <section className="inspector__section">
        <h3 className="inspector__section-title">Rattachement</h3>
        <Badge label="décision" className="inspector__badge" />
        {onAction
          ? <EmptyState message={message} actionLabel="Fermer l'inspecteur" onAction={onAction} />
          : <p className="inspector__muted">{message}</p>}
      </section>
    );
  }

  return (
    <section className="inspector__section">
      <h3 className="inspector__section-title">Rattachement</h3>
      <Badge label="décision" className="inspector__badge" />
      <p className="inspector__why" data-motif={explication.motif}>
        {explication.libelle}
      </p>
      <dl className="inspector__meta">
        {explication.alias !== null && (
          <Card variant="transparent" padding={0} className="inspector__meta-row">
            <dt className="inspector__meta-label">Alias retenu</dt>
            <dd className="inspector__meta-value inspector__mono">{explication.alias}</dd>
          </Card>
        )}
        {rattache && (
          <Card variant="transparent" padding={0} className="inspector__meta-row">
            <dt className="inspector__meta-label">Confiance</dt>
            <dd className="inspector__meta-value">{`${Math.round(explication.confiance * 100)} %`}</dd>
          </Card>
        )}
        <Card variant="transparent" padding={0} className="inspector__meta-row">
          <dt className="inspector__meta-label">Moteur</dt>
          <dd className="inspector__meta-value inspector__mono">{explication.moteur}</dd>
        </Card>
      </dl>
      {explication.indecis && (
        <p className="inspector__muted" role="status" aria-live="polite">
          référentiel indisponible au moment du rattachement : l'absence de rattachement n'est pas un
          verdict, il faudra rejouer.
        </p>
      )}
      {explication.candidats.length > 0 && (
        <>
          <h4 className="inspector__branch-title">
            {rattache ? "autres candidats écartés" : "candidats à égalité, non tranchés"}
          </h4>
          <ul className="inspector__list-mono">
            {explication.candidats.map((candidat) => (
              <li key={candidat.id} className="inspector__mono">
                {candidat.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
