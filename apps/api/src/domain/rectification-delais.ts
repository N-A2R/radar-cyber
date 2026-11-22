/**
 * Droit de réponse : instruction et clôture dans un délai mesuré.
 *
 * Le dépôt nominal écrit un événement de réception et un fait de journal.
 * Ce module couvre le reste du parcours : une demande restée en réception est
 * ouverte à l'instruction, puis toute demande qui atteint l'échéance est close
 * avec un fait de décision. Sans ce passage, une organisation n'obtiendrait
 * qu'un accusé de réception, jamais d'issue tracée.
 *
 * La base porte le même invariant à l'insertion (trigger différé) et expose
 * `mesure_droit_reponse()` pour l'objectif chiffré. Le délai est borné à 29
 * jours côté SQL comme ici : le seuil opposable est de 30 jours, et la marge
 * d'un jour absorbe un tick manqué sans jamais franchir le seuil.
 */
import { query } from "../db.js";

/** Clôture au 29e jour : un jour de marge sous le seuil RGPD de 30 jours. */
export const DELAI_CLOTURE_JOURS = 29;

/** Délai effectif, réglable par `RADAR_DROIT_REPONSE_DELAI_JOURS`, jamais > 29. */
export function delaiClotureJours(): number {
	const brut = Number(process.env.RADAR_DROIT_REPONSE_DELAI_JOURS ?? DELAI_CLOTURE_JOURS);
	if (!Number.isFinite(brut)) return DELAI_CLOTURE_JOURS;
	return Math.min(Math.max(Math.trunc(brut), 1), DELAI_CLOTURE_JOURS);
}

export type PassageDroitReponse = {
	/** Demandes qui n'avaient aucun événement et ont été réparées. */
	reconstituees: number;
	/** Demandes passées de `recu` à `en_instruction`. */
	instruites: number;
	/** Demandes closes faute de décision dans le délai. */
	closes: number;
	/** Délai appliqué, en jours. */
	delaiJours: number;
};

/** Un passage d'instruction/clôture. Idempotent : un second appel ne fait rien. */
export async function instruireDemandesDroitReponse(): Promise<PassageDroitReponse> {
	const delaiJours = delaiClotureJours();
	const { rows } = await query<{ reconstituees: number; instruites: number; closes: number }>(
		"SELECT reconstituees, instruites, closes FROM instruire_droit_reponse($1)",
		[delaiJours],
	);
	const r = rows[0];
	return {
		reconstituees: Number(r?.reconstituees ?? 0),
		instruites: Number(r?.instruites ?? 0),
		closes: Number(r?.closes ?? 0),
		delaiJours,
	};
}

export type MesureDroitReponse = {
	total: number;
	ouvertes: number;
	/** Ouvertes alors qu'elles ont dépassé le délai : doit rester 0. */
	enRetard: number;
	closes: number;
	closesSousDelai: number;
	delaiMoyenJours: number | null;
	delaiMaxJours: number | null;
	/** Demandes sans aucun événement : doit rester 0. */
	sansEvenement: number;
};

/** Lecture de l'objectif chiffré, sans passer par une route HTTP. */
export async function mesurerDelaisDroitReponse(): Promise<MesureDroitReponse> {
	const delaiJours = delaiClotureJours();
	const { rows } = await query<{
		total: string | number; ouvertes: string | number; en_retard: string | number;
		closes: string | number; closes_sous_delai: string | number;
		delai_moyen_jours: string | number | null; delai_max_jours: string | number | null;
		sans_evenement: string | number;
	}>("SELECT * FROM mesure_droit_reponse($1)", [delaiJours]);
	const r = rows[0];
	const nombre = (v: string | number | null | undefined): number => Number(v ?? 0);
	return {
		total: nombre(r?.total),
		ouvertes: nombre(r?.ouvertes),
		enRetard: nombre(r?.en_retard),
		closes: nombre(r?.closes),
		closesSousDelai: nombre(r?.closes_sous_delai),
		delaiMoyenJours: r?.delai_moyen_jours == null ? null : Number(r.delai_moyen_jours),
		delaiMaxJours: r?.delai_max_jours == null ? null : Number(r.delai_max_jours),
		sansEvenement: nombre(r?.sans_evenement),
	};
}
