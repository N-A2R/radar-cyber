/**
 * Index de la file de revue, construits à la demande et partagés par processus.
 *
 * `reviewQueue` comparait chaque indice de sa fenêtre (2 000 faits) à
 * l'intégralité du référentiel. Sur la base d'exploitation — 1,67 M
 * organisations, 1,68 M alias — cela signifiait deux balayages complets
 * (`org`, puis `org_alias`) **à chaque appel HTTP**, et la construction de deux
 * index de plus d'un million d'entrées sur la boucle d'événements. La file ne
 * répondait plus (timeout à 30 s) et bloquait toutes les autres routes.
 *
 * Le snapshot coûte 1,5 à 2,8 Go de RSS : le charger au démarrage faisait
 * attendre `listen` ~20 s et poussait la machine en swap pour une file que
 * personne n'ouvre en permanence. Il n'est donc **plus préchauffé** : la
 * première requête de revue déclenche sa construction en tâche de fond (page
 * par page, keyset sur la clé primaire, une pause toutes les 20 000 lignes) et
 * reçoit immédiatement un état « en préparation » ; les requêtes suivantes
 * lisent le snapshot en mémoire. `/api/health` reste donc immédiat même
 * pendant la construction.
 *
 * Fraîcheur : un snapshot est invalidé par `resetReviewIndexes`, appelé après
 * une écriture du référentiel (création d'organisation, rechargement). La
 * mémoire de l'ancien est libérée aussitôt et le prochain appel de revue
 * reconstruit ; une construction lancée avant l'écriture est jetée et reprise
 * sur les données à jour.
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
/** Incrémenté à chaque écriture du référentiel : une construction antérieure est jetée. */
let generation = 0;
/** Dernier échec de construction, pour ne pas relancer une requête par appel. */
let echecLe = 0;
const ECHEC_REPOS_MS = 10_000;

/**
 * Préchauffe les rapprochements de la fenêtre courante : la première requête
 * servie après la construction ne paie pas les 2 000 indices.
 */
async function prechaufferRapprochements(): Promise<void> {
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
}

/**
 * Construit puis publie le snapshot. L'ancien est lâché avant la construction :
 * le pic mémoire ne dépasse pas un index, et aucune requête ne lit un
 * référentiel partiel. Une écriture survenue pendant la construction fait
 * repartir le travail sur les données à jour.
 */
async function construireEtStocker(): Promise<ReviewSnapshot> {
	for (;;) {
		const gen = generation;
		snapshot = null;
		memoMatch.clear();
		const neuf = await construire();
		if (gen !== generation) continue;
		snapshot = neuf;
		await prechaufferRapprochements();
		// Une écriture pendant le préchauffage rend le snapshot obsolète : on
		// le jette plutôt que de servir un référentiel d'avant l'écriture.
		if (gen !== generation) {
			snapshot = null;
			memoMatch.clear();
			continue;
		}
		return neuf;
	}
}

/** Lance (ou rejoint) la construction en tâche de fond, sans jamais attendre. */
function demarrerConstruction(): Promise<ReviewSnapshot> {
	if (!enCours) {
		enCours = construireEtStocker()
			.catch((error) => {
				echecLe = Date.now();
				throw error;
			})
			.finally(() => {
				enCours = null;
			});
	}
	return enCours;
}

/**
 * Snapshot s'il est prêt, sinon `null` **immédiatement** après avoir déclenché
 * sa construction en tâche de fond. C'est le point d'entrée des routes : une
 * première requête de revue répond « en préparation » en quelques dizaines de
 * millisecondes au lieu d'attendre ~20 s.
 */
export function snapshotRevueSiPret(): ReviewSnapshot | null {
	if (!reviewIndexCacheActif()) return null;
	if (snapshot) return snapshot;
	if (Date.now() - echecLe >= ECHEC_REPOS_MS) {
		void demarrerConstruction().catch(() => {
			// Le prochain appel réessaiera après le repos.
		});
	}
	return null;
}

/**
 * Snapshot partagé, en attendant sa construction. Utilisé par les routes qui
 * ne peuvent pas rendre un résultat partiel (`/quarantine`) et par le mode
 * sans cache des tests.
 */
export async function reviewSnapshot(): Promise<ReviewSnapshot> {
	if (!reviewIndexCacheActif()) {
		memoMatch.clear();
		snapshot = await construire();
		return snapshot;
	}
	if (snapshot) return snapshot;
	return demarrerConstruction();
}

/**
 * Invalide le snapshot après une écriture du référentiel. La mémoire de
 * l'ancien est libérée tout de suite : rien ne reste en RSS tant qu'aucune
 * revue ne redemande l'index. Une construction en cours est jetée et reprise.
 */
export function resetReviewIndexes(): void {
	if (!reviewIndexCacheActif()) return;
	generation += 1;
	snapshot = null;
	memoMatch.clear();
}
