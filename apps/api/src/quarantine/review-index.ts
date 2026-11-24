/**
 * Index de la file de revue, construit pour les indices réellement affichés.
 *
 * `reviewQueue` comparait chaque indice de sa fenêtre (2 000 faits) à
 * l'intégralité du référentiel. Sur la base d'exploitation — 1,67 M
 * organisations, 1,68 M alias — cela signifiait deux balayages complets
 * (`org`, puis `org_alias`) à chaque appel HTTP.
 *
 * Une première version chargeait ces deux tables une fois au démarrage, en
 * pages : le snapshot tenait ~2,1 Go de RSS et faisait OOM le processus V8
 * (limite 2 Go) avant même la première requête. Le chargeur de référentiel
 * dispose pourtant d'un préfiltre par indice (`loadCandidateIndex`) et
 * `org_alias.nom_normalise` est indexé. On construit donc l'index à partir
 * des seuls indices demandés : aucun chargement global, mémoire bornée.
 *
 * Fraîcheur : un snapshot est invalidé par `resetReviewIndexes`, appelé après
 * une écriture du référentiel. L'ancien snapshot sert jusqu'à ce que le
 * nouveau soit prêt ; les indices déjà couverts sont conservés.
 */
import { query } from "../db.js";
import {
	MIN_ALIAS_LENGTH,
	normalize,
	buildAliasIndexChunked,
	type AliasIndex,
	type AliasRow,
} from "../match/core.js";
import { buildCandidateIndexChunked, candidatesFor, type CandidateIndex } from "./candidates.js";
import {
	GENERIC_TOKENS,
	attacherAliasDomaines,
	matchOrgInIndex,
	chargerAliasDomaines,
	normalizeName,
	toIndexEntry,
	type OrgIndexEntry,
	type OrgMatch,
	type OrgRow,
} from "./promote.js";

export type ReviewSnapshot = {
	orgIndex: OrgIndexEntry[];
	candidates: CandidateIndex;
	aliasIndex: AliasIndex;
	/** Indices déjà pris en compte par ce snapshot. */
	covered: Set<string>;
};

/**
 * Mémo des rapprochements par indice, valable le temps du snapshot : la file
 * relit les mêmes 2 000 indices à chaque page, et un rapprochement coûte
 * jusqu'à quelques milliers de comparaisons pour les noms courants.
 */
const memoMatch = new Map<string, OrgMatch | null>();
const MEMO_MAX = 50_000;

/** Rapprochement d'un indice, mémoïsé sur le snapshot courant. */
export function hintMatch(hint: string): OrgMatch | null {
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
 * Organisations, lues par pages ordonnées sur `id`. Chemin des tests uniquement
 * (cache désactivé) : en production, on ne charge jamais le référentiel entier.
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
	return attacherAliasDomaines(entrees, await chargerAliasDomaines());
}

/** Alias des organisations confirmées, par pages (tests, cache désactivé). */
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

/** Plafonds de sécurité : jamais de snapshot capable de saturer le heap V8. */
const MAX_ORGS = 120_000;
const MAX_ALIASES = 240_000;
const MOTIFS_PAR_REQUETE = 5;
const PHRASES_PAR_REQUETE = 2_000;

/** Séquences contiguës de jetons d'un indice, comme `analyzeAliasIndex` les cherche. */
function phrasesAlias(hint: string): string[] {
	const tokens = normalize(hint).split(" ").filter(Boolean);
	const phrases: string[] = [];
	for (let debut = 0; debut < tokens.length; debut++) {
		for (let fin = debut + 1; fin <= tokens.length; fin++) {
			phrases.push(tokens.slice(debut, fin).join(" "));
		}
	}
	return phrases;
}

/**
 * Alias actifs dont la forme normalisée apparaît dans un indice demandé.
 * `nom_normalise` est indexé : une égalité par phrase, même pour 2 000
 * indices, reste un accès indexé — pas un balayage des 1,68 M d'alias.
 */
async function chargerAliasParIndices(hints: readonly string[]): Promise<AliasRow[]> {
	const phrases = [...new Set(hints.flatMap(phrasesAlias))];
	const lignes: AliasRow[] = [];
	for (let i = 0; i < phrases.length; i += PHRASES_PAR_REQUETE) {
		const lot = phrases.slice(i, i + PHRASES_PAR_REQUETE);
		const r = await query<AliasRow>(
			`SELECT a.org_id, o.name, a.alias, o.dept
			   FROM org_alias a JOIN org o ON o.id = a.org_id
			  WHERE a.status = 'active' AND length(btrim(a.alias)) >= $2
			    AND a.nom_normalise = ANY($1::text[])`,
			[lot, MIN_ALIAS_LENGTH],
		);
		for (const row of r.rows) {
			if (lignes.length >= MAX_ALIASES) break;
			lignes.push(row);
		}
		await pause();
	}
	return lignes;
}

/** Motifs de nom déduits des indices : sur-ensemble des jetons témoins du moteur. */
function motifsNoms(hints: readonly string[]): string[] {
	const motifs = new Set<string>();
	for (const hint of hints) {
		for (const token of normalizeName(hint).split(" ")) {
			if (token.length < 3 || GENERIC_TOKENS.has(token)) continue;
			motifs.add(`%${token}%`);
		}
	}
	return [...motifs];
}

/**
 * Organisations candidates aux indices demandés. Le préfiltre par nom utilise
 * l'index trigramme `org_name_norm_trgm` par petits lots : au-delà de quelques
 * motifs, Postgres choisit un seq scan et chaque indice coûte plusieurs
 * secondes. Les ~10 000 organisations pourvues d'un domaine sont ajoutées en
 * une passe pour couvrir les rapprochements par domaine.
 */
async function chargerOrgParIndices(hints: readonly string[]): Promise<OrgIndexEntry[]> {
	const entrees = new Map<number, OrgIndexEntry>();
	const ajouter = (row: OrgRow) => {
		if (entrees.size < MAX_ORGS) entrees.set(row.id, toIndexEntry(row));
	};
	const motifs = motifsNoms(hints);
	for (let i = 0; i < motifs.length; i += MOTIFS_PAR_REQUETE) {
		const r = await query<OrgRow>(
			`SELECT id, name, slug, kind, city, domain, website FROM org
			  WHERE name_norm ILIKE ANY($1::text[])`,
			[motifs.slice(i, i + MOTIFS_PAR_REQUETE)],
		);
		for (const row of r.rows) ajouter(row);
		await pause();
	}
	const avecDomaine = await query<OrgRow>(
		`SELECT id, name, slug, kind, city, domain, website FROM org
		  WHERE lower(domain) IS NOT NULL OR lower(website) IS NOT NULL`,
	);
	for (const row of avecDomaine.rows) ajouter(row);
	return attacherAliasDomaines([...entrees.values()], await chargerAliasDomaines());
}

async function construire(hints: readonly string[]): Promise<ReviewSnapshot> {
	const [orgIndex, lignesAlias] = reviewIndexCacheActif()
		? await Promise.all([chargerOrgParIndices(hints), chargerAliasParIndices(hints)])
		: await Promise.all([chargerOrgIndex(), chargerLignesAlias()]);
	const candidates = await buildCandidateIndexChunked(orgIndex);
	const aliasIndex = await buildAliasIndexChunked(lignesAlias);
	return { orgIndex, candidates, aliasIndex, covered: new Set(hints) };
}

let snapshot: ReviewSnapshot | null = null;
let enCours: Promise<ReviewSnapshot> | null = null;
/** Une écriture du référentiel demande un nouveau snapshot ; l'ancien reste servi. */
let perime = false;

async function construireEtStocker(hints: readonly string[]): Promise<ReviewSnapshot> {
	const neuf = await construire(hints);
	snapshot = neuf;
	perime = false;
	memoMatch.clear();
	// Les indices demandés sont déjà chargés : le préchauffage est gratuit.
	for (const hint of hints) hintMatch(hint);
	return neuf;
}

/**
 * Snapshot couvrant les indices fournis. Un snapshot périmé reste servi pendant
 * que le nouveau se construit, pour qu'une écriture ne suspende jamais la file.
 */
export async function reviewSnapshot(hints: readonly string[] = []): Promise<ReviewSnapshot> {
	const demandes = [...new Set(hints.map((h) => h.trim()).filter(Boolean))];
	if (!reviewIndexCacheActif()) {
		const neuf = await construire(demandes);
		snapshot = neuf;
		memoMatch.clear();
		return neuf;
	}
	const manquants = demandes.filter((h) => !snapshot?.covered.has(h));
	if (snapshot && !perime && manquants.length === 0) return snapshot;
	if (enCours) {
		// Une seule construction à la fois : on attend puis on réévalue.
		const neuf = await enCours.catch(() => null);
		if (neuf && !perime && demandes.every((h) => neuf.covered.has(h))) return neuf;
		if (!neuf && snapshot) return snapshot;
	}
	const cibles = [...new Set([...(snapshot?.covered ?? []), ...demandes])];
	enCours = construireEtStocker(cibles).finally(() => {
		enCours = null;
	});
	return snapshot ?? enCours;

}

/**
 * Snapshot immédiat s'il couvre les indices affichés. Sinon la construction
 * bornée démarre en arrière-plan et la route peut répondre « en préparation »
 * sans bloquer le reste de l'API.
 */
export function snapshotRevueSiPret(hints: readonly string[] = []): ReviewSnapshot | null {
	if (!reviewIndexCacheActif()) return null;
	const demandes = [...new Set(hints.map((h) => h.trim()).filter(Boolean))];
	if (snapshot && demandes.every((h) => snapshot!.covered.has(h))) return snapshot;
	if (!enCours) {
		const cibles = [...new Set([...(snapshot?.covered ?? []), ...demandes])];
		const construction = construireEtStocker(cibles).finally(() => {
			enCours = null;
		});
		enCours = construction;
		void construction.catch(() => {
			// La prochaine requête relancera la construction.
		});
	}
	return null;
}

/**
 * À appeler au démarrage, avant `listen` : la fenêtre par défaut de la file est
 * indexée sans attendre la première requête, avec les mêmes bornes qu'elle.
 */
export async function prechaufferIndexRevue(): Promise<void> {
	if (!reviewIndexCacheActif()) return;
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
	await reviewSnapshot(rows.map((row) => String(row.org_hint ?? "")));
}

/**
 * Invalide le snapshot après une écriture du référentiel. L'ancien reste servi
 * jusqu'à ce que le nouveau soit prêt : une reconstruction ne vide jamais la file.
 */
export function resetReviewIndexes(): void {
	if (!reviewIndexCacheActif() || enCours) return;
	perime = true;
	void reviewSnapshot([...(snapshot?.covered ?? [])]).catch(() => {
		// Une reconstruction ratée laissera le prochain appel réessayer.
	});
}
