/**
 * Versions des moteurs — historique et rejeu.
 *
 * `DEPLOIEMENTS` date chaque version pour `asOf`. `MOTEUR_RATTACHEMENT` est
 * le moteur réellement exécuté par `resoudre()` : c'est la seule source de
 * vérité pour le journal (J12).
 *
 * Seules les versions dont la décision est encore reproductible sont
 * rejouables. `gazetteer@2` et `gazetteer@3` reposaient sur des règles
 * d'indexation supprimées (alias d'usage, garde anti-toponyme, confiance par
 * source) : les rejouer sur l'index courant donnerait une fausse vérité
 * historique. Leurs dates restent datées mais leur rejeu échoue explicitement.
 */

import { buildGazetteer, resoudre, type Gazetteer, type GazetteerMatch, type GazetteerRow } from "./gazetteer.js";
import { normaliser } from "./gazetteer.js";

// --- Historique des moteurs ----------------------------------------------
// Date de mise en prod de chaque version, à l'heure UTC. Avant cette date,
// le moteur précédent était l'autorité.

export type MoteurId = "gazetteer@1" | "gazetteer@2" | "gazetteer@3" | "gazetteer@4" | "contrat@1" | "regles@7";

/** Moteur courant, réellement exécuté — à utiliser par les producteurs du journal. */
export const MOTEUR_RATTACHEMENT: MoteurId = "gazetteer@4";

export const DEPLOIEMENTS: Record<MoteurId, string> = {
	"gazetteer@1": "2024-01-01T00:00:00.000Z", // rattachement initial : equal token overlap, naïf
	"gazetteer@2": "2025-10-15T00:00:00.000Z", // index inversé + rôle + lieu-contredit (non rejouable)
	"gazetteer@3": "2026-11-15T13:00:00.000Z", // alias d'usage + garde anti-toponyme (non rejouable)
	"gazetteer@4": "2026-11-15T17:00:00.000Z", // confiance par source : sirene-nom exige 2 mots propres
	"contrat@1": "2024-01-01T00:00:00.000Z",
	"regles@7": "2025-11-01T00:00:00.000Z",
};

// Moteur actif à une date donnée (pour `asOf`).
export function moteurActifA(date: Date | string, famille: "gazetteer" | "contrat" | "regles"): MoteurId {
	const t = new Date(date).getTime();
	if (famille === "gazetteer") {
		if (t >= Date.parse(DEPLOIEMENTS["gazetteer@4"])) return "gazetteer@4";
		if (t >= Date.parse(DEPLOIEMENTS["gazetteer@3"])) return "gazetteer@3";
		return t >= Date.parse(DEPLOIEMENTS["gazetteer@2"]) ? "gazetteer@2" : "gazetteer@1";
	}
	if (famille === "contrat") return "contrat@1";
	return "regles@7";
}

// --- gazetteer@1 : l'ancien moteur, conservé tel quel ---------------------
// Comportement : compte les jetons communs avec le nom de chaque org, exige
// un candidat unique dans la table entière, seuil 2 jetons. C'est ce qui ne
// rattachait qu'1/15 et a été remplacé pour cause de sous-rappel massif,
// mais qui reste la vérité de l'époque.

function resoudreGazetteerV1(gaz: Gazetteer, texte: string): GazetteerMatch {
	const jetons = normaliser(texte);
	if (jetons.length === 0) return { org: null, reason: "aucun", alias: null, confidence: 0, tied: [] };
	// Fenêtre de V1 : cherchait dans orgsByToken (porte d'admission de V2) mais
	// sans filtre de rôle/lieu. On simule en regardant tous les alias qui
	// partagent au moins 2 jetons avec le texte.
	const candidats = new Map<number, { org: NonNullable<GazetteerMatch["org"]>; score: number; alias: string }>();
	for (const [aliasKey, orgs] of gaz.byAliasKey) {
		const aliasJetons = aliasKey.split(" ");
		const communs = aliasJetons.filter((j) => jetons.includes(j)).length;
		if (communs < 2) continue;
		for (const org of orgs) {
			const prev = candidats.get(org.id);
			if (!prev || communs > prev.score) candidats.set(org.id, { org, score: communs, alias: aliasKey });
		}
	}
	if (candidats.size === 0) return { org: null, reason: "aucun", alias: null, confidence: 0, tied: [] };
	if (candidats.size === 1) {
		const seul = [...candidats.values()][0]!;
		return { org: seul.org, reason: "alias-distinctif", alias: seul.alias, confidence: 0.6, tied: [] };
	}
	// V1 rendait null en cas d'ambiguïté, sans départage sur département — c'est
	// sa faiblesse documentée, qu'on veut pouvoir rejouer.
	const tied = [...candidats.values()].map((c) => c.org);
	return { org: null, reason: "ambigu", alias: tied[0] ? candidats.get(tied[0].id)!.alias : null, confidence: 0, tied };
}

// --- Dispatcheur ----------------------------------------------------------

/** Résout un texte avec la version demandée, ou la version courante par défaut. */
export function resoudreAvecVersion(
	gaz: Gazetteer,
	texte: string,
	version: MoteurId = MOTEUR_RATTACHEMENT,
): GazetteerMatch {
	if (VERSIONS_HISTORIQUES.includes(version)) {
		throw new Error(`${version} n'est pas rejouable : l'index historique n'est plus disponible`);
	}
	if (version === "gazetteer@1") return resoudreGazetteerV1(gaz, texte);
	return resoudre(gaz, texte);
}

/** Construit le gazetteer courant — la décision varie avec la version demandée. */
export function gazetteerPourVersion(rows: GazetteerRow[]): Gazetteer {
	return buildGazetteer(rows);
}

/** Versions dont le rejeu est reproductible, pour l'API et le script de rejeu. */
export const VERSIONS_CONNUES: readonly MoteurId[] = [
	"gazetteer@1",
	MOTEUR_RATTACHEMENT,
	"contrat@1",
	"regles@7",
] as const;

/** Versions passées, conservées dans `DEPLOIEMENTS` mais non rejouables. */
export const VERSIONS_HISTORIQUES: readonly MoteurId[] = ["gazetteer@2", "gazetteer@3"] as const;

/** Résumé lisible pour le dossier de reprise. */
export function decrireVersion(version: MoteurId): string {
	const dep = DEPLOIEMENTS[version];
	const base =
		version === "gazetteer@1"
			? "rattachement naïf par chevauchement de jetons (seuil 2, sans contexte)"
			: version === "gazetteer@2"
				? "index inversé + rôle institutionnel + lieu-contredit + départage"
				: version === "gazetteer@3"
					? "gazetteer@2 + alias d'usage prioritaire (stock SIRENE) + garde anti-toponyme"
					: version === "gazetteer@4"
						? "gazetteer@3 + confiance par source : sirene-nom exige deux mots propres"
						: version === "contrat@1"
							? "contrat d'admission : filtre cyber / hors-sujet"
							: "moteur de règles de détection";
	const rejouable = VERSIONS_HISTORIQUES.includes(version) ? " — non rejouable" : "";
	return `${version} — ${base} — déployé le ${dep.slice(0, 10)}${rejouable}`;
}
