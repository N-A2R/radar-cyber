/**
 * Racine Merkle recomputable du journal de vérité.
 *
 * La racine est calculée sur les faits *enregistrés* (`recorded_at`) d'un jour
 * UTC, dans l'ordre de leur id. Chaque feuille est l'empreinte d'une structure
 * canonique qui contient les deux horloges : une décision rétroactive
 * (`valid_at` ancien) reste ancrée le jour où le radar l'a apprise.
 *
 * Le hachage est déterministe et indépendant du moteur PostgreSQL, de l'ordre
 * des clés JSON et du fuseau du processus : n'importe quel vérificateur peut
 * relire les mêmes lignes et retrouver la même racine.
 */
import { createHash } from "node:crypto";

const FEUILLE = "radar.journal.feuille/v1\0";
const NOEUD = "radar.journal.noeud/v1\0";
const VIDE = "radar.journal.racine-vide/v1\0";

export type LigneJournal = {
	id: number | string;
	kind: string;
	subject: string;
	summary: string;
	payload: unknown;
	actor: string;
	valid_at: string | Date | null;
	recorded_at: string | Date;
};

function sha256(valeur: string): string {
	return createHash("sha256").update(valeur, "utf8").digest("hex");
}

/** Sérialisation JSON à clés triées, récursive : `{"b":1,"a":2}` → `{"a":2,"b":1}`. */
export function stableStringify(valeur: unknown): string {
	if (valeur === null || typeof valeur !== "object") {
		return JSON.stringify(valeur) ?? "null";
	}
	if (Array.isArray(valeur)) {
		return `[${valeur.map(stableStringify).join(",")}]`;
	}
	const entrees = Object.entries(valeur as Record<string, unknown>)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([cle, v]) => `${JSON.stringify(cle)}:${stableStringify(v)}`);
	return `{${entrees.join(",")}}`;
}

function horodatage(valeur: string | Date | null): string | null {
	if (valeur === null) return null;
	const date = valeur instanceof Date ? valeur : new Date(valeur);
	return Number.isNaN(date.getTime()) ? String(valeur) : date.toISOString();
}

/** Empreinte d'une ligne du journal, avec un préfixe de domaine non ambigu. */
export function feuilleJournal(ligne: LigneJournal): string {
	return sha256(
		FEUILLE +
			stableStringify({
				id: Number(ligne.id),
				kind: ligne.kind,
				subject: ligne.subject,
				summary: ligne.summary,
				payload: ligne.payload ?? {},
				actor: ligne.actor,
				valid_at: horodatage(ligne.valid_at),
				recorded_at: horodatage(ligne.recorded_at),
			}),
	);
}

/**
 * Arbre binaire de hachage : les feuilles sont appariées deux par deux, la
 * dernière est dupliquée si le nombre est impair. Un jour sans fait a une
 * racine dédiée, elle aussi recomputable.
 */
export function racineMerkle(feuilles: readonly string[]): string {
	if (feuilles.length === 0) return sha256(VIDE);
	let niveau: readonly string[] = feuilles;
	while (niveau.length > 1) {
		const suivant: string[] = [];
		for (let i = 0; i < niveau.length; i += 2) {
			const gauche = niveau[i]!;
			const droite = i + 1 < niveau.length ? niveau[i + 1]! : gauche;
			suivant.push(sha256(NOEUD + gauche + droite));
		}
		niveau = suivant;
	}
	return niveau[0]!;
}

/** Racine d'un jour : les lignes doivent être fournies par id croissant. */
export function racineJournal(lignes: readonly LigneJournal[]): string {
	return racineMerkle(lignes.map(feuilleJournal));
}
