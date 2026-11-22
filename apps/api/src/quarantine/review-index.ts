/**
 * Index de la file de revue, chargés une fois par processus.
 *
 * `reviewQueue` comparait chaque indice de sa fenêtre (2 000 faits) à
 * l'intégralité du référentiel. Sur la base d'exploitation — 1,67 M
 * organisations, 1,68 M alias — cela signifiait deux balayages complets
 * (`org`, puis `org_alias`) **à chaque appel HTTP**, et la construction de deux
 * index de plus d'un million d'entrées sur la boucle d'événements. La file ne
 * répondait plus (timeout à 30 s) et bloquait toutes les autres routes.
 *
 * Ce module charge les deux index une seule fois, au démarrage, page par page
 * (keyset sur la clé primaire) et en rendant la main toutes les 20 000 lignes :
 * le serveur reste réactif pendant le chargement. Les constructions d'index
 * sont chunkées de la même façon. Les requêtes ne lisent ensuite que le
 * snapshot en mémoire.
 *
 * Fraîcheur : un snapshot est invalidé par `resetReviewIndexes`, appelé après
 * une écriture du référentiel (création d'organisation, rechargement). Le
 * prochain appel reconstruit alors le snapshot en tâche de fond ; en attendant,
 * il sert l'ancien — jamais un référentiel vide.
 */
import { query } from "../db.js";
import { buildAliasIndexChunked, type AliasIndex, type AliasRow } from "../match/core.js";
import { buildCandidateIndexChunked, candidatesFor, type CandidateIndex } from "./candidates.js";
import {
	attacherAliasDomaines,
	matchOrgInIndex,
	chargerAliasDomaines,
	toIndexEntry,
	type OrgIndexEntry,
	type OrgRow,
} from "./promote.js";

export type ReviewSnapshot = {
	orgIndex: OrgIndexEntry[];
	candidates: CandidateIndex;
	aliasIndex: AliasIndex;
};

/**
 * Mémo des rapprochements par indice, valable le temps du snapshot : la file
 * relit les mêmes 2 000 indices à chaque page, et un rapprochement coûte
 * jusqu'à quelques milliers de comparaisons pour les noms courants.
 */
const memoMatch = new Map<string, ReturnType<typeof matchOrgInIndex>>();
const MEMO_MAX = 50_000;

/** Rapprochement d'un indice, mémoïsé sur le snapshot courant. */
export function hintMatch(hint: string): ReturnType<typeof matchOrgInIndex> {
	const cle = hint.trim();
	if (memoMatch.has(cle)) return memoMatch.get(cle) ?? null;
	const candidats = snapshot ? candidatesFor(cle, snapshot.candidates) : [];
	const resultat = matchOrgInIndex(cle, candidats);
	if (memoMatch.size >= MEMO_MAX) memoMatch.clear();
	memoMatch.set(cle, resultat);
	return resultat;
}

/** Taille de page : 20 000 lignes tiennent en une réponse sans monopoliser le pool. */
const PAGE = 20_000;

/** Rendre la main entre deux pages / deux tranches de construction. */
function pause(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	return promise;
}

/** Le cache est désactivé dans la suite de tests (données créées entre deux appels). */
export function reviewIndexCacheActif(): boolean {
	return (process.env.RADAR_REVIEW_INDEX_CACHE ?? "on").trim().toLowerCase() !== "off";
}

/**
 * Organisations, lues par pages ordonnées sur `id`. Le keyset évite le coût
 * quadratique d'`OFFSET` et laisse la boucle respirer entre deux pages.
 */
async function chargerOrgIndex(): Promise<OrgIndexEntry[]> {
	const entrees: OrgIndexEntry[] = [];
	let dernier = 0;
	for (;;) {
		const page = await query<OrgRow>(
			`SELECT id, name, slug, kind, city, domain, website
			   FROM org WHERE id > $1 ORDER BY id LIMIT $2`,
			[dernier, PAGE],
		);
		if (page.rows.length === 0) break;
		for (const row of page.rows) entrees.push(toIndexEntry(row));
		dernier = page.rows[page.rows.length - 1]!.id;
		await pause();
	}
	// 19 lignes mesurées : la table des alias-domaines reste minuscule.
	return attacherAliasDomaines(entrees, await chargerAliasDomaines());
}

/** Alias des organisations confirmées, par pages ordonnées sur `org_alias.id`. */
async function chargerLignesAlias(): Promise<AliasRow[]> {
	const lignes: AliasRow[] = [];
	let dernier = 0;
	for (;;) {
		const page = await query<{ alias_id: number; org_id: number; name: string; alias: string }>(
			`SELECT a.id AS alias_id, a.org_id, o.name, a.alias
			   FROM org_alias a JOIN org o ON o.id = a.org_id
			  WHERE o.status = 'confirme' AND a.id > $1
			  ORDER BY a.id LIMIT $2`,
			[dernier, PAGE],
		);
		if (page.rows.length === 0) break;
		for (const row of page.rows) {
			lignes.push({ org_id: row.org_id, name: row.name, alias: row.alias });
		}
		dernier = page.rows[page.rows.length - 1]!.alias_id;
		await pause();
	}
	return lignes;
}

async function construire(): Promise<ReviewSnapshot> {
	const [orgIndex, lignesAlias] = await Promise.all([chargerOrgIndex(), chargerLignesAlias()]);
	const candidates = await buildCandidateIndexChunked(orgIndex);
	const aliasIndex = await buildAliasIndexChunked(lignesAlias);
	return { orgIndex, candidates, aliasIndex };
}

let snapshot: ReviewSnapshot | null = null;
let enCours: Promise<ReviewSnapshot> | null = null;
/** Une écriture du référentiel demande un nouveau snapshot ; l'ancien reste servi. */
let perime = false;

async function construireEtStocker(): Promise<ReviewSnapshot> {
	const neuf = await construire();
	snapshot = neuf;
	perime = false;
	memoMatch.clear();
	// Préchauffe les rapprochements de la fenêtre courante : la première
	// requête après démarrage ne doit pas payer les 2 000 indices.
	const fenetre = Math.min(
		10_000,
		Math.max(1, Number(process.env.RADAR_REVIEW_WINDOW ?? 2000) || 2000),
	);
	const { rows } = await query<{ org_hint: string | null }>(
		`SELECT org_hint FROM quarantine_raw
		  WHERE kind = 'claim' AND promoted = false
		    AND org_hint IS NOT NULL AND btrim(org_hint) <> ''
		  ORDER BY received_at DESC, id DESC LIMIT $1`,
		[fenetre],
	);
	for (const row of rows) hintMatch(String(row.org_hint ?? ""));
	return neuf;
}

/**
 * Snapshot partagé. Le premier appel (hors préchauffage) attend sa
 * construction ; un snapshot périmé reste servi pendant que le nouveau se
 * construit en fond, pour qu'une écriture du référentiel ne suspende jamais la
 * file.
 */
export async function reviewSnapshot(): Promise<ReviewSnapshot> {
	if (!reviewIndexCacheActif()) {
		const neuf = await construire();
		snapshot = neuf;
		memoMatch.clear();
		return neuf;
	}
	if (snapshot && !perime) return snapshot;
	if (!enCours) {
		enCours = construireEtStocker().finally(() => {
			enCours = null;
		});
	}
	// Un rafraîchissement en cours : l'ancien snapshot reste la réponse.
	return snapshot ?? enCours;
}

/**
 * À appeler au démarrage, avant `listen` : le serveur ne sert aucune requête
 * tant que l'index n'est pas prêt, mais l'attente ne bloque jamais une requête
 * en cours.
 */
export async function prechaufferIndexRevue(): Promise<void> {
	if (!reviewIndexCacheActif()) return;
	await reviewSnapshot();
}

/**
 * Invalide le snapshot après une écriture du référentiel. L'ancien reste servi
 * jusqu'à ce que le nouveau soit prêt : une reconstruction ne vide jamais la
 * file.
 */
export function resetReviewIndexes(): void {
	if (!reviewIndexCacheActif() || enCours) return;
	perime = true;
	void reviewSnapshot().catch(() => {
		// Une reconstruction ratée laissera le prochain appel réessayer.
	});
}
