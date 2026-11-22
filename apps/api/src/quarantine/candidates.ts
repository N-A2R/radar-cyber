/**
 * Préfiltre de candidats pour le rapprochement de quarantaine.
 *
 * `matchOrgInIndex` compare l'indice à **toutes** les organisations : mesuré à
 * 2,31 ms par indice avec 4 462 organisations, soit 4,6 s pour une file de
 * 2 000 faits. Inutilisable à chaque ouverture de la file de revue.
 *
 * Ce module ne change **aucune règle de score**. Ilexploite une propriété du
 * moteur existant : toute correspondance positive exige qu'un jeton précis de
 * l'organisation soit présent dans l'indice.
 *
 *   - chemin « domaine »  : égalité ou suffixe → une étiquette du domaine de
 *     l'organisation est forcément dans l'indice ;
 *   - chemin « nom »      : égalité, ou **tous** les jetons du nom présents →
 *     le plus rare d'entre eux est forcément présent ;
 *   - chemin « ville »    : au moins un jeton du nom hors ville est présent.
 *
 * On indexe donc chaque organisation par ces jetons « témoins », et on ne
 * soumet au moteur que les organisations dont un témoin apparaît dans
 * l'indice. L'ensemble rendu est un **sur-ensemble** des correspondances
 * possibles : le moteur, appliqué dessus, donne exactement le même résultat.
 *
 * Cette propriété est vérifiée par un test différentiel sur le corpus réel et
 * sur le jeu d'or de rattachement, pas seulement affirmée ici.
 */
import { normalizeName, type OrgIndexEntry } from "./promote.js";

export type CandidateIndex = {
	/** jeton témoin → organisations à examiner */
	byToken: Map<string, OrgIndexEntry[]>;
	/** repli : index complet, si un indice ne présente aucun témoin exploitable */
	all: OrgIndexEntry[];
	size: number;
};

function tokensOf(value: string): string[] {
	return normalizeName(value).split(" ").filter((token) => token.length >= 2);
}

/** Étiquettes d'un domaine, TLD exclu : « mail.acme.com » → mail, acme. */
function domainLabels(domain: string | null): string[] {
	if (!domain) return [];
	const parts = domain.toLowerCase().split(".").filter(Boolean);
	return parts.slice(0, Math.max(0, parts.length - 1)).filter((part) => part.length >= 2);
}

/**
 * Étapes de construction, générateur : le même travail sert au chemin
 * synchrone (tests, petites index) et au chargement de fond, qui rend la main
 * toutes les 5 000 entrées pour ne pas bloquer la boucle d'événements.
 */
const PAS = 5_000;

function* etapesCandidateIndex(index: OrgIndexEntry[]): Generator<void, CandidateIndex> {
	// Fréquence des jetons de nom : sert à choisir le témoin le plus sélectif.
	const frequency = new Map<string, number>();
	let vus = 0;
	for (const entry of index) {
		for (const token of new Set(tokensOf(entry.name))) {
			frequency.set(token, (frequency.get(token) ?? 0) + 1);
		}
		if (++vus % PAS === 0) yield;
	}

	const byToken = new Map<string, OrgIndexEntry[]>();
	const push = (token: string, entry: OrgIndexEntry) => {
		const list = byToken.get(token);
		if (list) list.push(entry);
		else byToken.set(token, [entry]);
	};

	vus = 0;
	for (const entry of index) {
		const keys = new Set<string>();

		const nameTokens = tokensOf(entry.name);
		if (nameTokens.length > 0) {
			// Le plus rare : présent dans l'indice dès que le nom correspond.
			let rarest = nameTokens[0];
			let best = Number.POSITIVE_INFINITY;
			for (const token of nameTokens) {
				const count = frequency.get(token) ?? 0;
				if (count < best) {
					best = count;
					rarest = token;
				}
			}
			keys.add(rarest);
		}

		// Chemin « ville + nom » : n'importe lequel de ces jetons peut porter
		// la correspondance, il faut donc tous les indexer.
		const cityTokens = new Set(entry.cityNorm ? tokensOf(entry.cityNorm) : []);
		for (const token of entry.nameTokens) {
			if (!cityTokens.has(token) && token.length >= 2) keys.add(token);
		}

		for (const label of domainLabels(entry.domainNorm)) keys.add(label);
		for (const label of domainLabels(entry.websiteDomain)) keys.add(label);

		for (const key of keys) push(key, entry);
		if (++vus % PAS === 0) yield;
	}

	return { byToken, all: index, size: index.length };
}

export function buildCandidateIndex(index: OrgIndexEntry[]): CandidateIndex {
	const etapes = etapesCandidateIndex(index);
	for (;;) {
		const pas = etapes.next();
		if (pas.done) return pas.value;
	}
}

/** Même index, construit sans monopoliser la boucle : une pause toutes les 5 000 entrées. */
export async function buildCandidateIndexChunked(index: OrgIndexEntry[]): Promise<CandidateIndex> {
	const etapes = etapesCandidateIndex(index);
	for (;;) {
		const pas = etapes.next();
		if (pas.done) return pas.value;
		const { promise, resolve } = Promise.withResolvers<void>();
		setImmediate(resolve);
		await promise;
	}
}

/**
 * Organisations à soumettre au moteur pour cet indice. Rend l'index complet
 * si l'indice est vide ou sans jeton exploitable : on préfère payer le prix
 * fort que rater une correspondance.
 */
export function candidatesFor(hint: string, index: CandidateIndex): OrgIndexEntry[] {
	const tokens = tokensOf(hint);
	if (tokens.length === 0) return index.all;
	const picked = new Map<number, OrgIndexEntry>();
	for (const token of new Set(tokens)) {
		const list = index.byToken.get(token);
		if (!list) continue;
		for (const entry of list) picked.set(entry.id, entry);
	}
	if (picked.size === 0) return [];
	// Ordre stable : le moteur départage les égalités par identifiant, mais
	// un ordre déterministe évite toute surprise en diagnostic.
	return [...picked.values()].sort((a, b) => a.id - b.id);
}
