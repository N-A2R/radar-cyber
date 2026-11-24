/**
 * Règles de précision du rattachement — spec retenue par la campagne
 * (docs/plans/wave-precision.md, étapes S2/S3), mesurée sur le corpus gelé
 * et sur échantillon frais, adoptée en S2.4/S3.1.
 *
 * Ce module porte la **spécification** des règles que le rattachement doit
 * suivre. Depuis la vague « branchement » (docs/plans/wave-regles.md), le
 * moteur l'appelle au point de décision de la promotion
 * (quarantine/promote.ts), derrière le drapeau `PRECISION_RULES=on|off` —
 * les deux régimes se mesurent dans le même binaire. Les tests de régression
 * (test/regles-precision.test.ts) et le jeu d'or (scripts/precision-gold.mts)
 * la font respecter — toute modification du moteur qui viole une règle ou
 * fait bouger un cas du jeu d'or échoue.
 *
 * Les règles, dans l'ordre de leur évaluation :
 *
 *   3-masquage   un indice masqué (contenant des * ou ??) ne fonde jamais de
 *                rattachement — ce n'est pas un nom ; le masque prouve la
 *                non-identité par sa longueur ou laisse l'ambiguïté entière ;
 *   1-sigle      un seul jeton ne fonde pas un rattachement (via=name,
 *                confiance 0,7) — mesuré : 0 exacte et 0 partielle pour 125
 *                hors_sujet dans la strate qui pèse 70 % de la population ;
 *   sigle-confirme depuis le chantier couverture (S2.1) : un sigle n'est
 *                accepté que si le registre renvoie une seule organisation
 *                (dénomination ou alias officiel). Sans décision fournie,
 *                `1-sigle` continue de refuser — le jeu d'or ne bouge pas ;
 *   4-commentaire un indice à marqueur de fuite (hacked, leaked, GB/TB,
 *                DISCLOSED…) ne matche que par le chemin domaine — les jetons
 *                du commentaire ne désignent personne ;
 *   6-ville      le chemin ville+nom (0,6) est retiré — la ville citée ne
 *                désigne pas l'organisation ;
 *   2-homonyme   sur le chemin tous-jetons (0,75), l'indice doit être couvert
 *                par le nom de l'organisation — l'indice ne peut pas être
 *                plus précis que le nom.
 *
 * La règle 5 (TLD) n'a pas de prédicat propre : les 5 hors_sujet TLD du
 * corpus étaient des matchs à un seul jeton, éliminés par 1-sigle.
 *
 * Coût mesuré (S4.3) : +0,00 ms par indice — les prédicats sont O(jetons).
 */

import { GENERIC_TOKENS, normalizeNom } from "./normalisation.js";
import type { DecisionSigle } from "./sigles.js";


export type CandidatRattachement = {
	/** Le texte de la liste de fuite (org_hint). */
	indice: string;
	/** Le chemin du moteur qui a fondé la correspondance. */
	via: "domain" | "name";
	/** Le score du moteur (0,5 à 0,95). */
	confidence: number;
	/** Le nom de l'organisation proposée. */
	orgName: string;
	/** Décision du registre, fournie par la promotion quand elle l'a. */
	sigle?: DecisionSigle;
	/** Organisation proposée par le moteur, pour vérifier la confirmation. */
	orgId?: number;
};


/** Trace d'une décision : quelle règle l'a posée, et dans quel sens. */
export type TraceRegle = {
	regle: string;
	accepte: boolean;
	motif?: string;
};


/** Jetons discriminants d'un texte — même prédicat que le bloc nom du
 * moteur (≥ 3 caractères, ni générique ni forme juridique). */
export function jetonsDiscriminants(texte: string): string[] {
	const jetons = normalizeNom(texte).split(" ");
	return [...new Set(jetons.filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t)))];
}

/** Marqueurs de commentaire de fuite : le texte décrit une fuite, il ne
 * nomme pas une victime. */
const MARQUEURS_COMMENTAIRE =
	/hacked|leaked|data leak|disclosed|\d\s?(gb|tb)\b|file tree|announcement|will be leaked|you are welcome|welcome in our chat|part \d/i;

/** Règle 3 : indice masqué — ne fonde jamais de rattachement. */
export function elimineMasquage(indice: string): boolean {
	return /\*|\?\?/.test(indice);
}

/** Règle 1 : le chemin jeton-unique ne fonde pas de rattachement. */
export function elimineSigle(candidat: Pick<CandidatRattachement, "via" | "confidence">): boolean {
	return candidat.via === "name" && candidat.confidence === 0.7;
}

/** Règle 4 : indice à marqueur de fuite — chemin domaine seulement. */
export function elimineCommentaire(
	indice: string,
	via: CandidatRattachement["via"],
): boolean {
	return MARQUEURS_COMMENTAIRE.test(indice) && via !== "domain";
}

/** Règle 6 : le chemin ville+nom (0,6) est retiré. */
export function elimineVille(confidence: number): boolean {
	return confidence === 0.6;
}

/** Règle 2 : à 0,75, chaque jeton discriminant de l'indice doit figurer dans
 * le nom de l'organisation — l'indice ne peut pas être plus précis que le
 * nom. */
export function elimineHomonyme(
	indice: string,
	orgName: string,
): boolean {
	const jetonsIndice = new Set(jetonsDiscriminants(indice));
	const jetonsOrg = new Set(jetonsDiscriminants(orgName));
	for (const t of jetonsIndice) {
		if (!jetonsOrg.has(t)) return true;
	}
	return false;
}

/** Nom de la règle qui tranche les sigles confirmés au registre. */
export const REGLE_SIGLE = "sigle-confirme";

/** Rend le nom de la première règle violée, ou `null` si le rattachement
 * reste produit. La trace (quand elle est fournie) porte la règle qui a
 * tranché **dans les deux sens** : accepté aussi bien que refusé. Sans
 * décision du registre, le sigle reste refusé par `1-sigle` — c'est le
 * comportement qu'épingle le jeu d'or. */
export function ecarteeParRegles(candidat: CandidatRattachement, trace?: TraceRegle): string | null {
	const refuser = (regle: string, motif?: string): string => {
		if (trace) Object.assign(trace, { regle, accepte: false, motif });
		return regle;
	};
	const accepter = (regle: string, motif?: string): null => {
		if (trace) Object.assign(trace, { regle, accepte: true, motif });
		return null;
	};
	if (elimineMasquage(candidat.indice)) return refuser("3-masquage");
	if (elimineSigle(candidat)) {
		const d = candidat.sigle;
		if (!d) return refuser("1-sigle", "registre non consulté");
		if (d.accepte && d.orgId === candidat.orgId) return accepter(REGLE_SIGLE, d.motif);
		return refuser(
			REGLE_SIGLE,
			d.accepte ? "confirmation sur une autre organisation" : d.motif,
		);
	}
	if (elimineCommentaire(candidat.indice, candidat.via)) return refuser("4-commentaire");
	if (elimineVille(candidat.confidence)) return refuser("6-ville");
	if (candidat.via === "name" && candidat.confidence === 0.75 && elimineHomonyme(candidat.indice, candidat.orgName)) {
		return refuser("2-homonyme");
	}
	return accepter("aucune");
}
