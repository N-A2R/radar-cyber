import { createHash } from "node:crypto";
/**
 * Contexte d'une ligne de la file de revue.
 *
 * Les indices de famille « nom » n'ont ni domaine ni sigle : le moteur de
 * rattachement ne peut pas trancher, et l'analyste a besoin de deux choses
 * pour décider — le passage du texte source où l'indice apparaît, et les
 * organisations dont le nom s'en approche le plus.
 *
 * L'extrait est calculé en base sur une fenêtre de 300 caractères centrée sur
 * l'indice (une seule requête groupée pour toute la page). La proximité est
 * le `ratio` de rapidfuzz, déjà utilisé par le filet flou du rattachement.
 * Un index de trigrammes borne le nombre de comparaisons : sans lui, chaque
 * ouverture de file comparerait 200 noms à 4 000 organisations.
 */
import { ratio } from "rapidfuzz-js/fuzz";
import { query } from "../db.js";
import { normalizeName, type OrgIndexEntry } from "./promote.js";

export type ContexteCandidat = {
	id: number;
	name: string;
	/** Similarité de nom dans [0,1] ; 1 = nom identique à l'indice normalisé. */
	score: number;
};

export type ContexteLigne = {
	/** 300 caractères du texte source centrés sur l'indice, ou null si absent. */
	extrait: string | null;
	candidats: ContexteCandidat[];
};

/** Données de contexte lues en une seule requête pour toute la page. */
export type DonneesLigne = {
	/** Titre du collecteur, sinon première ligne non vide du texte brut. */
	titre: string | null;
	/** Début du texte brut (240 caractères), conservé par la file historique. */
	debut: string | null;
	contexte: ContexteLigne;
};

export type LigneAContexte = { id: number; orgHint: string | null };

const EXTRAIT_MAX = 300;
const TITRE_MAX = 200;
const DEBUT_MAX = 240;
const RAYON = Math.floor(EXTRAIT_MAX / 2);
const CANDIDATS_MAX = 3;
/** Trigrammes trop fréquents (« commun», « des »…) : plus sélectifs ailleurs. */
const POSTINGS_MAX = 120;
/** Organisation soumises au scoreur après recoupement des trigrammes. */
const SHORTLIST_MAX = 60;

/** Titre structuré par le collecteur, sinon première ligne non vide du brut. */
function titreExtrait(debut: string | null, titreSource: string | null): string | null {
	const titre = (titreSource ?? "").trim();
	if (titre) return titre.slice(0, TITRE_MAX);
	const premiereLigne = (debut ?? "")
		.split(/\r?\n/)
		.map((ligne) => ligne.trim())
		.find((ligne) => ligne.length > 0);
	return premiereLigne ? premiereLigne.slice(0, TITRE_MAX) : null;
}

type SimilarityIndex = {
	byGram: Map<number, number[]>;
	orgs: OrgIndexEntry[];
};

// Le référentiel change rarement : reconstruire l'index à chaque ouverture de
// file coûte ~65 ms pour 4 462 organisations. La signature (ids + noms) rend
// le cache invalide dès qu'une organisation est ajoutée, renommée ou retirée.
let cache: { signature: string; index: SimilarityIndex } | null = null;

function signatureDe(orgs: readonly OrgIndexEntry[]): string {
	const hash = createHash("sha256");
	for (const entry of orgs) hash.update(`${entry.id}:${entry.nameNorm}\n`);
	return hash.digest("hex");
}

/** Trigrammes d'une clé normalisée, encodés sur un entier (a-z, 0-9, espace). */
function trigrammes(key: string): number[] {
	const padded = `  ${key} `;
	const grams = new Set<number>();
	for (let i = 0; i + 3 <= padded.length; i++) {
		grams.add((padded.charCodeAt(i) << 16) | (padded.charCodeAt(i + 1) << 8) | padded.charCodeAt(i + 2));
	}
	return [...grams];
}

export function buildSimilarityIndex(orgs: readonly OrgIndexEntry[]): SimilarityIndex {
	const signature = signatureDe(orgs);
	if (cache?.signature === signature) return cache.index;

	const listes: number[][] = orgs.map((entry) => trigrammes(entry.nameNorm));
	const frequence = new Map<number, number>();
	for (const grams of listes) {
		for (const gram of grams) frequence.set(gram, (frequence.get(gram) ?? 0) + 1);
	}
	const byGram = new Map<number, number[]>();
	listes.forEach((grams, position) => {
		for (const gram of grams) {
			if ((frequence.get(gram) ?? 0) > POSTINGS_MAX) continue;
			const list = byGram.get(gram);
			if (list) list.push(position);
			else byGram.set(gram, [position]);
		}
	});
	const index = { byGram, orgs: [...orgs] };
	cache = { signature, index };
	return index;
}

/** Borne supérieure exacte du ratio : 200 * min(l1,l2) / (l1+l2), ramenée à [0,1]. */
function borneSuperieure(a: string, b: string): number {
	const total = a.length + b.length;
	return total === 0 ? 1 : (2 * Math.min(a.length, b.length)) / total;
}

/** Trois noms d'organisation les plus proches de l'indice, score décroissant. */
export function organisationsProches(
	hint: string | null,
	index: SimilarityIndex,
	limit = CANDIDATS_MAX,
): ContexteCandidat[] {
	const key = normalizeName(hint ?? "");
	if (key === "" || index.orgs.length === 0) return [];

	const comptes = new Map<number, number>();
	for (const gram of trigrammes(key)) {
		for (const position of index.byGram.get(gram) ?? []) {
			comptes.set(position, (comptes.get(position) ?? 0) + 1);
		}
	}
	const shortlist = [...comptes.entries()]
		.sort((a, b) => b[1] - a[1] || a[0] - b[0])
		.slice(0, SHORTLIST_MAX)
		.map(([position]) => index.orgs[position]);
	if (shortlist.length === 0) return [];

	const meilleurs: ContexteCandidat[] = [];
	for (const entry of shortlist) {
		if (meilleurs.length === limit && borneSuperieure(key, entry.nameNorm) <= meilleurs[limit - 1].score) continue;
		const candidat = {
			id: entry.id,
			name: entry.name,
			score: Number((ratio(key, entry.nameNorm) / 100).toFixed(3)),
		};
		const position = meilleurs.findIndex((autre) =>
			candidat.score > autre.score || (candidat.score === autre.score && candidat.id < autre.id));
		if (meilleurs.length === limit && position === -1) continue;
		meilleurs.splice(position === -1 ? meilleurs.length : position, 0, candidat);
		if (meilleurs.length > limit) meilleurs.pop();
	}
	return meilleurs;
}

/** Extrait + candidats pour une page entière : une requête, puis le calcul en mémoire. */
export async function contextesDes(
	lignes: readonly LigneAContexte[],
	orgs: readonly OrgIndexEntry[],
): Promise<Map<number, DonneesLigne>> {
	if (lignes.length === 0) return new Map();

	const values: unknown[] = [];
	const tuples = lignes.map((ligne) => {
		values.push(ligne.id, (ligne.orgHint ?? "").trim().slice(0, 300));
		return `($${values.length - 1}::bigint, $${values.length}::text)`;
	}).join(", ");
	const result = await query<{
		id: string;
		extrait: string | null;
		debut: string | null;
		titre_source: string | null;
	}>(
		`WITH demandes(id, indice) AS (VALUES ${tuples})
		    SELECT d.id,
		           substring(q.raw_body FROM GREATEST(1,
		             strpos(lower(q.raw_body), lower(d.indice)) - ${RAYON}) FOR ${EXTRAIT_MAX}) AS extrait,
		           left(q.raw_body, 500) AS debut,
		           COALESCE(NULLIF(btrim(extracted->>'title'), ''),
		                    NULLIF(btrim(extracted->>'titre_brut'), '')) AS titre_source
		      FROM demandes d
		      JOIN quarantine_raw q ON q.id = d.id`,
		values,
	);
	const extraits = new Map(result.rows.map((row) => [Number(row.id), row]));
	const index = buildSimilarityIndex(orgs);

	return new Map(lignes.map((ligne) => {
		const row = extraits.get(ligne.id);
		return [ligne.id, {
			titre: titreExtrait(row?.debut ?? null, row?.titre_source ?? null),
			debut: row?.debut === null || row?.debut === undefined ? null : row.debut.slice(0, DEBUT_MAX),
			contexte: {
				extrait: row?.extrait ?? null,
				candidats: organisationsProches(ligne.orgHint, index),
			},
		}];
	}));
}
