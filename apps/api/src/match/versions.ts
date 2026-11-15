/**
 * Versions des moteurs — ce qui permet de rejouer avec un autre moteur.
 *
 * Le journal consigne `actor: "moteur:gazetteer@2"` à chaque décision, mais
 * sans ce fichier, un `gazetteer@2` n'est qu'une étiquette : on ne sait pas ce
 * que faisait `gazetteer@1`, ni quand il a été remplacé, ni si rejouer avec lui
 * redonne l'état de l'époque. Ce module rend la version exécutable, pas
 * déclarative.
 *
 * Règle : chaque version est une fonction pure `texte -> décision`, versionnée
 * en même temps que le code. Le déploiement est daté dans `DEPLOIEMENTS` —
 * c'est ce qui permet `asOf` côté journal.
 */

import { buildGazetteer, resoudre, type Gazetteer, type GazetteerMatch, type GazetteerRow } from "./gazetteer.js";
import { normaliser } from "./gazetteer.js";

// --- Historique des moteurs ----------------------------------------------
// Date de mise en prod de chaque version, à l'heure UTC. Avant cette date,
// le moteur précédent était l'autorité.

export type MoteurId = "gazetteer@1" | "gazetteer@2" | "gazetteer@3" | "gazetteer@4" | "contrat@1" | "regles@7";

export const DEPLOIEMENTS: Record<MoteurId, string> = {
	"gazetteer@1": "2024-01-01T00:00:00.000Z", // rattachement initial : equal token overlap, naïf
	"gazetteer@2": "2025-10-15T00:00:00.000Z", // index inversé + rôle + lieu-contredit
	"gazetteer@3": "2026-11-15T13:00:00.000Z", // alias d'usage prioritaire + garde anti-toponyme (vague SIRENE)
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
	version: MoteurId = "gazetteer@4",
): GazetteerMatch {
	if (version === "gazetteer@1") return resoudreGazetteerV1(gaz, texte);
	return resoudre(gaz, texte);
}

/** Construit le gazetteer — même index pour les deux versions, seule la décision change. */
export function gazetteerPourVersion(rows: GazetteerRow[]): Gazetteer {
	return buildGazetteer(rows);
}

/** Liste des versions connues, pour l'API et le script de rejeu. */
export const VERSIONS_CONNUES: readonly MoteurId[] = [
	"gazetteer@1",
	"gazetteer@2",
	"gazetteer@3",
	"gazetteer@4",
	"contrat@1",
	"regles@7",
] as const;

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
	return `${version} — ${base} — déployé le ${dep.slice(0, 10)}`;
}
