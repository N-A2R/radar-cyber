#!/usr/bin/env -S npx tsx
/**
 * Matérialise la clé d'alias normalisée du gazetteer et mesure le gain.
 *
 * La table `org_alias` porte 1 678 185 alias. Jusqu'ici, chaque rechargement
 * du gazetteer (cache TTL 10 min) appelait `normaliser()` en JavaScript sur
 * chacun d'eux. La colonne générée `nom_normalise` ajoutée par la migration
 * 045 déplace ce travail dans l'écriture de l'alias, une seule fois.
 *
 * Le DDL vit dans `db/migrate-045-org-alias-nom-normalise.sql` : une seule
 * source de vérité, rejouée aussi par `pnpm migrate` sur une base neuve. Ce
 * script est le point d'entrée pour une base déjà en production, plus le
 * banc de mesure avant/après.
 *
 * Usage :
 *   pnpm exec tsx scripts/normaliser-alias.mts                 # diagnostic, aucun écrit
 *   pnpm exec tsx scripts/normaliser-alias.mts --apply         # ajoute colonne + index
 *   pnpm exec tsx scripts/normaliser-alias.mts --verifie       # confronte SQL et JS
 *   pnpm exec tsx scripts/normaliser-alias.mts --mesure        # chrono avant/après
 *   pnpm exec tsx scripts/normaliser-alias.mts --mesure --limite 200000
 */
import { readFileSync } from "node:fs";
import { closePools, ingestQuery, withClient } from "../apps/api/src/db.js";
import { buildGazetteer, normaliser, type GazetteerRow } from "../apps/api/src/match/gazetteer.js";

const APPLY = process.argv.includes("--apply");
const VERIFIE = process.argv.includes("--verifie");
const MESURE = process.argv.includes("--mesure");
const LIMITE_ARG = process.argv.indexOf("--limite");
const LIMITE = LIMITE_ARG >= 0 ? Number(process.argv[LIMITE_ARG + 1]) : null;
if (LIMITE !== null && (!Number.isInteger(LIMITE) || LIMITE <= 0)) {
	throw new Error("--limite attend un entier positif");
}

const MIGRATION = new URL("../db/migrate-045-org-alias-nom-normalise.sql", import.meta.url);
const SOURCE = `FROM org_alias a JOIN org o ON o.id = a.org_id WHERE a.status = 'active'`;
/** Avant : le JS normalise `alias`. Après : la colonne générée est lue telle quelle. */
const SQL_AVANT = `SELECT a.org_id, o.name, o.kind, o.dept, o.city, o.sector, a.alias, a.source ${SOURCE}`;
const SQL_APRES = `SELECT a.org_id, o.name, o.kind, o.dept, o.city, o.sector, a.alias, a.nom_normalise, a.source ${SOURCE}`;

type Ligne = GazetteerRow & { nom_normalise?: string | null };

async function colonnePresente(): Promise<boolean> {
	const { rows } = await ingestQuery<{ present: boolean }>(
		`SELECT EXISTS (
		   SELECT 1 FROM information_schema.columns
		   WHERE table_name = 'org_alias' AND column_name = 'nom_normalise'
		 ) AS present`,
	);
	return rows[0]?.present === true;
}

async function diagnostic(): Promise<void> {
	const { rows } = await ingestQuery<{ total: string; actifs: string }>(
		`SELECT (SELECT count(*) FROM org_alias)::text AS total,
		        (SELECT count(*) FROM org_alias WHERE status = 'active')::text AS actifs`,
	);
	const present = await colonnePresente();
	console.log(`Alias: ${rows[0]?.total} au total, ${rows[0]?.actifs} actifs.`);
	console.log(`Colonne nom_normalise: ${present ? "présente" : "absente"}.`);
	if (present) {
		const { rows: variantes } = await ingestQuery<{ n: string }>(
			`SELECT count(*)::text AS n FROM org_alias WHERE alias <> nom_normalise`,
		);
		console.log(`Alias dont la clé diffère de l'alias brut: ${variantes[0]?.n}.`);
	}
}

/** Une écriture de colonne générée sur 1,6 M lignes dépasse le timeout du pool API. */
async function appliquer(): Promise<void> {
	const sql = readFileSync(MIGRATION, "utf8");
	console.log("Application de migrate-045 (colonne générée + index partiel)…");
	await withClient(async (client) => {
		await client.query("SET statement_timeout = 0");
		await client.query("SET lock_timeout = '120s'");
		const debut = performance.now();
		await client.query(sql);
		console.log(`DDL terminé en ${(performance.now() - debut).toFixed(0)} ms.`);
	});
}

/**
 * La colonne doit reproduire `normaliser()` des deux côtés du rattachement,
 * sinon le gain se paierait en correspondances manquées. On confronte donc
 * les alias qui changent réellement (casse, accents, ponctuation, www.).
 */
async function verifier(): Promise<void> {
	if (!(await colonnePresente())) throw new Error("Colonne absente : lancer d'abord --apply");
	let dernierId = 0;
	let verifies = 0;
	let divergences = 0;
	const exemples: string[] = [];
	// Balayage complet par clé : un échantillon peut passer à côté d'une
	// ligature ou d'un diacritique rare, et une divergence vaudrait un faux
	// rattachement — pas un simple gain en moins.
	for (;;) {
		const { rows } = await ingestQuery<{ id: number; alias: string; nom_normalise: string }>(
			`SELECT id, alias, nom_normalise FROM org_alias
			  WHERE alias <> nom_normalise AND id > $1 ORDER BY id LIMIT 10000`,
			[dernierId],
		);
		const page = rows ?? [];
		if (page.length === 0) break;
		dernierId = (page[page.length - 1] as { id: number }).id;
		verifies += page.length;
		for (const l of page) {
			if (normaliser(l.alias).join(" ") === l.nom_normalise) continue;
			divergences++;
			if (exemples.length < 5) {
				const js = normaliser(l.alias).join(" ");
				exemples.push(`${JSON.stringify(l.alias)} → SQL ${JSON.stringify(l.nom_normalise)} / JS ${JSON.stringify(js)}`);
			}
		}
	}
	console.log(`Conformité SQL ↔ JS : ${verifies} alias variés vérifiés, ${divergences} divergences.`);
	for (const e of exemples) console.log(`  ${e}`);
	if (divergences > 0) throw new Error("Expression SQL et normaliser() divergentes");
}

type Mesure = {
	lignes: number;
	sqlMs: number;
	jsMs: number;
	totalMs: number;
};

async function charger(sql: string): Promise<Mesure> {
	const requete = LIMITE === null ? sql : `${sql} LIMIT ${LIMITE}`;
	const debutSql = performance.now();
	const { rows } = await ingestQuery<Ligne>(requete);
	const debutJs = performance.now();
	buildGazetteer(rows ?? []);
	const fin = performance.now();
	// On ne garde qu'un gazetteer à la fois : 1,6 M de lignes, deux cartes
	// inversées — laisser les deux vivants fausserait le second chrono.
	const globalAvecGc = globalThis as typeof globalThis & { gc?: () => void };
	globalAvecGc.gc?.();
	return {
		lignes: rows?.length ?? 0,
		sqlMs: debutJs - debutSql,
		jsMs: fin - debutJs,
		totalMs: fin - debutSql,
	};
}

function affiche(label: string, m: Mesure): void {
	console.log(
		`${label.padEnd(20)} ${String(m.lignes).padStart(8)} lignes | ` +
			`SQL ${m.sqlMs.toFixed(0).padStart(6)} ms | JS ${m.jsMs.toFixed(0).padStart(6)} ms | total ${m.totalMs.toFixed(0).padStart(6)} ms`,
	);
}

async function mesurer(): Promise<void> {
	if (!(await colonnePresente())) throw new Error("Colonne absente : lancer d'abord --apply");
	const avant = await charger(SQL_AVANT);
	const apres = await charger(SQL_APRES);
	affiche("avant (JS à la volée)", avant);
	affiche("après (colonne SQL)", apres);
	console.log(
		`Gain total: ${(avant.totalMs - apres.totalMs).toFixed(0)} ms ` +
			`(${((1 - apres.totalMs / avant.totalMs) * 100).toFixed(1)} %), ` +
			`dont ${(avant.jsMs - apres.jsMs).toFixed(0)} ms de normalisation JS évitée.`,
	);
}

async function main(): Promise<void> {
	await diagnostic();
	if (APPLY) await appliquer();
	if (APPLY || VERIFIE) await verifier();
	if (MESURE) await mesurer();
}

try {
	await main();
} finally {
	await closePools();
}
