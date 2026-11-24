#!/usr/bin/env -S npx tsx
/**
 * Mesure en lecture seule des doublons d'alias et de l'ambiguïté du gazetteer.
 *
 * Deux normalisations sont distinguées :
 *  - `lower(btrim(alias))`, celle de `docs/qualite-donnees.md` ;
 *  - `org_alias.nom_normalise`, la clé réellement indexée par le gazetteer
 *    (accents, ligatures et ponctuation réduits par la migration 045).
 *
 * Le rapport sépare les doublons intra-organisation (sans risque pour la
 * décision), les collisions entre organisations (légitimes, à ne pas écraser)
 * et les fausses ambiguïtés causées par les fragments `sirene-nom`.
 *
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/mesure-alias-ambiguite.mts
 *
 * Aucune écriture : une transaction `READ ONLY` encadre toutes les requêtes.
 * La sortie est un objet JSON sur stdout, sans alias brut ni donnée privée.
 */
import { createRequire } from "node:module";

/** `pg` vit dans apps/api (pnpm cloisonne les dépendances). */
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
type ClientLecture = {
	connect(): Promise<void>;
	query<T>(texte: string): Promise<{ rows: T[] }>;
	end(): Promise<void>;
};
const { Client } = require("pg") as {
	Client: new (options: { connectionString: string; connectionTimeoutMillis: number }) => ClientLecture;
};

const url = process.env.RADAR_MESURE_DB_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL (ou RADAR_MESURE_DB_URL) est requis");

type Ligne = Record<string, string | number | boolean | null>;

function entier(client: Ligne, cle: string): number {
	const brut = client[cle];
	if (brut === null || brut === undefined) throw new Error(`colonne absente : ${cle}`);
	const n = Number(brut);
	if (!Number.isFinite(n)) throw new Error(`valeur non numérique : ${cle} = ${String(brut)}`);
	return n;
}

async function unique(client: ClientLecture, sql: string): Promise<Ligne> {
	const { rows } = await client.query<Ligne>(sql);
	const premiere = rows[0];
	if (!premiere) throw new Error(`requête sans résultat : ${sql.slice(0, 80)}`);
	return premiere;
}

const FILTRE_ALIAS = "alias IS NOT NULL AND btrim(alias) <> ''";

async function mesurer(): Promise<void> {
	const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
	await client.connect();
	try {
		await client.query("BEGIN READ ONLY");

		const contexte = await unique(client, "SELECT current_database()::text AS base, current_user::text AS role");

		// Repère : la requête publiée dans docs/qualite-donnees.md, section 2.
		const reference = await unique(client, `
			WITH doublons AS (
			  SELECT lower(btrim(alias)) AS cle, count(*) AS lignes,
			         count(DISTINCT org_id) AS orgs
			    FROM org_alias
			   WHERE ${FILTRE_ALIAS}
			   GROUP BY 1 HAVING count(*) > 1
			)
			SELECT count(*)::text AS valeurs_dupliquees,
			       coalesce(sum(lignes), 0)::text AS lignes_concernees,
			       coalesce(sum(lignes - 1), 0)::text AS lignes_supplementaires,
			       coalesce(sum(orgs) FILTER (WHERE orgs > 1), 0)::text AS valeurs_multi_org
			  FROM doublons`);

		// Clé réellement utilisée par buildGazetteer (jetonsAlias).
		const normalise = await unique(client, `
			WITH base AS (
			  SELECT nom_normalise AS cle, org_id FROM org_alias
			   WHERE ${FILTRE_ALIAS} AND nom_normalise IS NOT NULL AND nom_normalise <> ''
			),
			g AS (
			  SELECT cle, count(*) AS lignes, count(DISTINCT org_id) AS orgs
			    FROM base GROUP BY cle HAVING count(*) > 1
			)
			SELECT count(*)::text AS cles_dupliquees,
			       coalesce(sum(lignes), 0)::text AS lignes_concernees,
			       coalesce(sum(lignes - 1), 0)::text AS lignes_supplementaires,
			       count(*) FILTER (WHERE orgs = 1)::text AS cles_intra_org,
			       coalesce(sum(lignes - 1) FILTER (WHERE orgs = 1), 0)::text AS surplus_intra_org,
			       count(*) FILTER (WHERE orgs > 1)::text AS cles_multi_org,
			       coalesce(sum(lignes) FILTER (WHERE orgs > 1), 0)::text AS lignes_multi_org,
			       count(*) FILTER (WHERE cle NOT LIKE '% %')::text AS cles_un_jeton
			  FROM g`);

		// Variantes de forme : casse (même minuscule), accents, ponctuation.
		const avecUnaccent = await unique(client,
			"SELECT to_regprocedure('unaccent(text)') IS NOT NULL AS present");
		const colonneAccent = avecUnaccent.present === true
			? "count(DISTINCT unaccent(lower(btrim(alias)))) AS sans_accents"
			: "NULL::bigint AS sans_accents";
		const variantes = await unique(client, `
			WITH base AS (
			  SELECT lower(btrim(alias)) AS minuscule, nom_normalise AS cle, org_id, alias
			    FROM org_alias
			   WHERE ${FILTRE_ALIAS} AND nom_normalise IS NOT NULL AND nom_normalise <> ''
			),
			g AS (
			  SELECT cle, count(*) AS lignes, count(DISTINCT org_id) AS orgs,
			         count(DISTINCT minuscule) AS minuscules, ${colonneAccent}
			    FROM base GROUP BY cle HAVING count(*) > 1
			),
			casse AS (
			  SELECT count(*) AS valeurs, coalesce(sum(lignes), 0) AS lignes FROM (
			    SELECT lower(btrim(alias)) AS cle, count(*) AS lignes, count(DISTINCT alias) AS formes
			      FROM org_alias WHERE ${FILTRE_ALIAS} GROUP BY 1 HAVING count(DISTINCT alias) > 1
			  ) c
			)
			SELECT (SELECT valeurs::text FROM casse) AS variantes_casse_valeurs,
			       (SELECT lignes::text FROM casse) AS variantes_casse_lignes,
			       count(*) FILTER (WHERE minuscules > 1)::text AS variantes_forme_cles,
			       coalesce(sum(lignes - minuscules) FILTER (WHERE minuscules > 1), 0)::text AS variantes_forme_surplus,
			       count(*) FILTER (WHERE minuscules > 1 AND orgs = 1)::text AS variantes_forme_intra_org,
			       count(*) FILTER (WHERE minuscules > 1 AND orgs > 1)::text AS variantes_forme_multi_org,
			       count(*) FILTER (WHERE minuscules > 1 AND sans_accents = 1)::text AS variantes_accent_seul,
			       count(*) FILTER (WHERE minuscules > 1 AND sans_accents > 1)::text AS variantes_ponctuation
			  FROM g`);

		// Ambiguïté avant/après la garde : fragments exclus du décompte.
		const ambiguite = await unique(client, `
			WITH base AS (
			  SELECT nom_normalise AS cle, org_id, source FROM org_alias
			   WHERE ${FILTRE_ALIAS} AND nom_normalise IS NOT NULL AND nom_normalise <> ''
			),
			g AS (
			  SELECT cle, count(DISTINCT org_id) AS orgs,
			         count(DISTINCT org_id) FILTER (WHERE source <> 'sirene-nom') AS orgs_nommantes,
			         count(*) FILTER (WHERE source <> 'sirene-nom') AS lignes_nommantes,
			         count(*) FILTER (WHERE source <> 'sirene-nom' AND source IN ('usage', 'annuaire-entreprises')) AS curateurs
			    FROM base GROUP BY cle
			)
			SELECT count(*)::text AS cles_totales,
			       count(*) FILTER (WHERE orgs > 1)::text AS ambigues_toutes_sources,
			       count(*) FILTER (WHERE orgs_nommantes > 1)::text AS ambigues_sources_nommantes,
			       count(*) FILTER (WHERE orgs > 1 AND orgs_nommantes <= 1)::text AS fausses_ambiguites,
			       count(*) FILTER (WHERE orgs > 1 AND orgs_nommantes <= 1 AND cle NOT LIKE '% %')::text AS fausses_ambiguites_un_jeton,
			       count(*) FILTER (WHERE orgs > 1 AND orgs_nommantes = 1 AND cle NOT LIKE '% %' AND length(cle) >= 4 AND lignes_nommantes > 0)::text AS marques_restaurees,
			       count(*) FILTER (WHERE orgs > 1 AND orgs_nommantes = 1 AND curateurs > 0)::text AS alias_curateur_restaures,
			       count(*) FILTER (WHERE orgs_nommantes > 1 AND cle NOT LIKE '% %')::text AS ambigues_un_jeton
			  FROM g`);

		const groupes = { reference, normalise, variantes, ambiguite } as const;
		const rapport: Record<string, unknown> = {
			genere_le: new Date().toISOString(),
			base: contexte.base,
			role: contexte.role,
			lecture_seule: true,
		};
		for (const [nom, lignes] of Object.entries(groupes)) {
			rapport[nom] = Object.fromEntries(
				Object.entries(lignes).map(([cle]) => [cle, entier(lignes, cle)]),
			);
		}
		console.log(JSON.stringify(rapport, null, 2));

		await client.query("ROLLBACK");
	} catch (erreur) {
		await client.query("ROLLBACK").catch(() => {});
		throw erreur;
	} finally {
		await client.end();
	}
}

await mesurer();
