/**
 * Journal des changements d'état d'une source.
 *
 * Une source qui se tait pendant trois jours et une source qui n'a jamais rien
 * rendu se ressemblent dans le tableau de bord : `last_ok_at` est renseigné,
 * aucune erreur, zéro événement. La différence est dans la **transition**, et
 * une transition n'existe que si on la compare au passé.
 *
 * Ce module ne juge pas la qualité d'une source. Il répond à une question plus
 * modeste et vérifiable : *son état a-t-il changé ?* Trois états seulement, et
 * quatre transitions, journalisées comme des faits (`source.changed`) :
 *
 *   muette → productive      réveil          la source se remet à produire
 *   productive → muette      assoupissement  elle répond, mais ne rend plus rien
 *   * → en-erreur            panne           elle ne répond plus
 *   en-erreur → *            réparation      elle répond de nouveau
 *
 * « Muette » n'est **pas** « nulle » : c'est « passée au collecteur, rien lu ou
 * rien retenu ». Une source jamais tentée n'a pas d'état, donc pas de
 * transition — et c'est ce qui empêche de la condamner par omission.
 */
import { consigner } from "../journal/index.js";
import { ingestQuery } from "../db.js";

export type EtatSource = "muette" | "productive" | "en-erreur";

/** Nature du changement, quand il y en a un. */
export type Transition = "reveil" | "assoupissement" | "panne" | "reparation";

/** État d'un run, à partir de son résultat. Fonction pure. */
export function etatDuRun(statut: string, itemsNew: number): EtatSource {
	if (statut === "error") return "en-erreur";
	return itemsNew > 0 ? "productive" : "muette";
}

/**
 * État d'une source avant le run courant.
 *
 * On lit **le dernier run non vide** plutôt que le dernier tout court : une
 * source qui alterne un run productif et deux runs vides n'est pas en train de
 * s'assoupir, elle a un flux irrégulier. Seul un silence continu change l'état.
 */
export function etatPrecedent(historique: readonly { statut: string; itemsNew: number }[]): EtatSource | null {
	if (historique.length === 0) return null;
	const productif = historique.find((run) => etatDuRun(run.statut, run.itemsNew) === "productive");
	const erreur = historique[0];
	// Une panne n'est effacée que par un run réussi.
	if (erreur !== undefined && etatDuRun(erreur.statut, erreur.itemsNew) === "en-erreur") return "en-erreur";
	return productif ? "productive" : "muette";
}

/** Transition entre deux états, ou `null` si rien n'a changé. */
export function transition(precedent: EtatSource | null, suivant: EtatSource): Transition | null {
	if (precedent === null) return null;
	if (precedent === suivant) return null;
	if (suivant === "en-erreur") return "panne";
	if (precedent === "en-erreur") return "reparation";
	if (suivant === "productive") return "reveil";
	return "assoupissement";
}

const LIBELLE: Record<Transition, string> = {
	reveil: "se remet à produire",
	assoupissement: "répond mais ne rend plus rien",
	panne: "ne répond plus",
	reparation: "répond de nouveau",
};

/**
 * Constaté et consigné : lit l'historique récent, compare, journalise.
 *
 * Ne lève jamais : le journal ne doit pas faire perdre une collecte. Rend la
 * transition retenue (ou `null`), ce qui rend la fonction testable.
 */
export async function constaterTransition(
	sourceId: string,
	statut: string,
	itemsNew: number,
	erreur: string | null = null,
): Promise<Transition | null> {
	try {
		const suivant = etatDuRun(statut, itemsNew);
		const { rows } = await ingestQuery<{ status: string; items_new: number }>(
			`SELECT status, items_new FROM collector_run
			  WHERE source_id = $1
			  ORDER BY started_at DESC, id DESC
			  LIMIT 5`,
			[sourceId],
		);
		const precedent = etatPrecedent(
			rows.map((row) => ({ statut: row.status, itemsNew: Number(row.items_new) })),
		);
		const changement = transition(precedent, suivant);
		if (changement === null) return null;

		await consigner({
			kind: "source.changed",
			subject: sourceId,
			summary: `${sourceId} ${LIBELLE[changement]} (${precedent} → ${suivant})`,
			actor: `collecteur:${sourceId}`,
			payload: {
				transition: changement,
				precedent,
				suivant,
				statut,
				itemsNew,
				...(erreur !== null ? { erreur: erreur.slice(0, 300) } : {}),
			},
		});
		return changement;
	} catch {
		// Une lacune de journal est visible ; une collecte perdue ne l'est pas.
		return null;
	}
}
