/**
 * Couverture du référentiel par secteur et par taille d'entreprise.
 *
 * Le trou connu (agroalimentaire, industrie, construction, commerce à zéro
 * ligne) est mesuré, pas recopié. Chaque nombre publié dans le document vient
 * d'une requête SQL exécutée ici ; le script n'écrit aucune donnée en base.
 *
 * Source par défaut : l'instantané du référentiel d'origine sur le port 5433,
 * base `radar_d0` (34 335 organisations, 13 336 entreprises). L'état courant
 * peut être mesuré avec `--db=radar` ; le port reste imposé à 5433.
 *
 *   apps/api/node_modules/.bin/tsx scripts/mesure-referentiel.mts
 *   apps/api/node_modules/.bin/tsx scripts/mesure-referentiel.mts --db=radar --out=docs/autre.md
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/** `pg` vit dans apps/api (pnpm cloisonne les dépendances). */
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
type ClientLecture = {
	connect(): Promise<void>;
	query<T>(texte: string, parametres?: unknown[]): Promise<{ rows: T[] }>;
	end(): Promise<void>;
};
const { Client } = require("pg") as {
	Client: new (options: { connectionString: string; connectionTimeoutMillis: number }) => ClientLecture;
};

const args = process.argv.slice(2);
const option = (nom: string): string | undefined => {
	const prefixe = `--${nom}=`;
	return args.find((a) => a.startsWith(prefixe))?.slice(prefixe.length);
};

const base = option("db") ?? process.env.RADAR_DB_NAME ?? "radar_d0";
if (!/^[A-Za-z0-9_-]+$/.test(base)) throw new Error(`nom de base invalide : ${base}`);
const urlComplete = process.env.RADAR_MESURE_DB_URL;
if (urlComplete && !/:5433(\/|$)/.test(urlComplete)) {
	throw new Error("RADAR_MESURE_DB_URL doit pointer sur le port 5433");
}
const url = urlComplete ?? `postgres://radar:radar@localhost:5433/${base}`;
const sortie = option("out")
	? fileURLToPath(new URL(`../${option("out")}`, import.meta.url))
	: fileURLToPath(new URL("../docs/referentiel-trou.md", import.meta.url));

/** Les quatre secteurs historiquement absents, dans l'ordre du rapport. */
const SECTEURS_TROU = ["agroalimentaire", "industrie", "construction", "commerce"] as const;

/** Bornes basses des tranches SIRENE, telles qu'importées dans `effectif_min`. */
const BANDES = [
	{ libelle: "Non renseigné", min: null, max: null },
	{ libelle: "1–9", min: 1, max: 9 },
	{ libelle: "10–49", min: 10, max: 49 },
	{ libelle: "50–249", min: 50, max: 249 },
	{ libelle: "250 et +", min: 250, max: null },
] as const;

async function ligne<T>(client: ClientLecture, texte: string, parametres: unknown[] = []): Promise<T> {
	const { rows } = await client.query<T>(texte, parametres);
	const premiere = rows[0];
	if (!premiere) throw new Error(`requête sans résultat : ${texte.slice(0, 80)}`);
	return premiere;
}

async function nombre(client: ClientLecture, texte: string, parametres: unknown[] = []): Promise<number> {
	const { n } = await ligne<{ n: number | string }>(client, texte, parametres);
	const valeur = Number(n);
	if (!Number.isFinite(valeur)) throw new Error(`nombre SQL invalide : ${String(n)}`);
	return valeur;
}

function entier(valeur: number): string {
	return valeur.toLocaleString("fr-FR");
}

function pourcent(valeur: number | string): string {
	return `${String(valeur).replace(".", ",")} %`;
}

async function main(): Promise<void> {
	const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
	await client.connect();
	try {
		// Verrou de lecture : une mesure ne doit jamais Modifier la base.
		await client.query("BEGIN READ ONLY");

		// 1. Totaux et couverture globale : un seul passage SQL sur `org`.
		const totaux = await ligne<{
			orgs: number;
			entreprises: number;
			sectorisees: number;
			effectifs: number;
			salaries_min: string;
			pct_sectorisees: string;
			pct_effectifs: string;
		}>(
			client,
			`SELECT count(*)::int AS orgs,
			        count(*) FILTER (WHERE kind = 'entreprise')::int AS entreprises,
			        count(*) FILTER (WHERE kind = 'entreprise' AND sector IS NOT NULL AND sector <> '')::int AS sectorisees,
			        count(*) FILTER (WHERE kind = 'entreprise' AND effectif_min IS NOT NULL)::int AS effectifs,
			        coalesce(sum(effectif_min) FILTER (WHERE kind = 'entreprise'), 0)::bigint AS salaries_min,
			        round(100.0 * count(*) FILTER (WHERE kind = 'entreprise' AND sector IS NOT NULL AND sector <> '')
			              / NULLIF(count(*) FILTER (WHERE kind = 'entreprise'), 0), 2) AS pct_sectorisees,
			        round(100.0 * count(*) FILTER (WHERE kind = 'entreprise' AND effectif_min IS NOT NULL)
			              / NULLIF(count(*) FILTER (WHERE kind = 'entreprise'), 0), 2) AS pct_effectifs
			   FROM org`,
		);

		// 2. Par secteur. Les quatre secteurs du trou sont ajoutés au jeu de
		//    résultats même s'ils sont absents de la table : un secteur avec
		//    zéro ligne doit apparaître comme tel, pas disparaître du GROUP BY.
		const parSecteur = (
			await client.query<{ secteur: string; n: number; pct: string; salaries_min: string }>(
				`WITH secteurs(secteur) AS (
				   SELECT DISTINCT sector FROM org WHERE kind = 'entreprise' AND sector IS NOT NULL AND sector <> ''
				   UNION SELECT unnest($1::text[])
				 )
				 SELECT s.secteur,
				        count(o.id)::int AS n,
				        round(100.0 * count(o.id) / NULLIF((SELECT count(*) FROM org WHERE kind = 'entreprise'), 0), 2) AS pct,
				        coalesce(sum(o.effectif_min), 0)::bigint AS salaries_min
				   FROM secteurs s
				   LEFT JOIN org o ON o.kind = 'entreprise' AND o.sector = s.secteur
				  GROUP BY s.secteur
				  ORDER BY n DESC, s.secteur`,
				[[...SECTEURS_TROU]],
			)
		).rows;

		// 3. Par taille : les cinq tranches viennent de SQL, y compris celle à
		//    zéro ligne, pour qu'un trou de taille ne soit pas invisible.
		const bandesSql = BANDES.map((b, i) => `(${i},'${b.libelle}',${b.min ?? "NULL"},${b.max ?? "NULL"})`).join(",");
		const parTaille = (
			await client.query<{ libelle: string; n: number; pct: string }>(
				`WITH bandes(ordre, libelle, bmin, bmax) AS (VALUES ${bandesSql})
				 SELECT b.libelle,
				        count(o.id)::int AS n,
				        round(100.0 * count(o.id) / NULLIF((SELECT count(*) FROM org WHERE kind = 'entreprise'), 0), 2) AS pct
				   FROM bandes b
				   LEFT JOIN org o ON o.kind = 'entreprise'
				    AND ((b.bmin IS NULL AND b.bmax IS NULL AND o.effectif_min IS NULL)
				      OR (b.bmin IS NOT NULL AND o.effectif_min >= b.bmin
				          AND (b.bmax IS NULL OR o.effectif_min <= b.bmax)))
				  GROUP BY b.ordre, b.libelle
				  ORDER BY b.ordre`,
			)
		).rows;

		// 4. Le tableau nominatif : deux requêtes par secteur, une pour le
		//    volume total, une pour le périmètre « 50 salariés et plus ».
		const nominatif: { secteur: string; total: number; ge50: number }[] = [];
		for (const secteur of SECTEURS_TROU) {
			const total = await nombre(
				client,
				"SELECT count(*)::int AS n FROM org WHERE kind = 'entreprise' AND sector = $1",
				[secteur],
			);
			const ge50 = await nombre(
				client,
				"SELECT count(*)::int AS n FROM org WHERE kind = 'entreprise' AND sector = $1 AND effectif_min >= 50",
				[secteur],
			);
			nominatif.push({ secteur, total, ge50 });
		}

		// 5. Croisement secteur × taille : 20 cellules SQL, une requête.
		const croisement = (
			await client.query<{ secteur: string; libelle: string; n: number }>(
				`WITH secteurs(secteur) AS (SELECT unnest($1::text[])),
				      bandes(ordre, libelle, bmin, bmax) AS (VALUES ${bandesSql})
				 SELECT s.secteur, b.libelle, count(o.id)::int AS n
				   FROM secteurs s CROSS JOIN bandes b
				   LEFT JOIN org o ON o.kind = 'entreprise' AND o.sector = s.secteur
				    AND ((b.bmin IS NULL AND b.bmax IS NULL AND o.effectif_min IS NULL)
				      OR (b.bmin IS NOT NULL AND o.effectif_min >= b.bmin
				          AND (b.bmax IS NULL OR o.effectif_min <= b.bmax)))
				  GROUP BY s.secteur, b.ordre, b.libelle
				  ORDER BY s.secteur, b.ordre`,
				[[...SECTEURS_TROU]],
			)
		).rows;

		await client.query("COMMIT");

		const date = new Date().toISOString().slice(0, 10);
		const ligneSecteur = (s: { secteur: string; n: number; pct: string; salaries_min: string }): string =>
			`| ${s.secteur} | ${entier(s.n)} | ${pourcent(s.pct)} | ${entier(Number(s.salaries_min))} |`;
		const lignesTrou = nominatif
			.map(
				(t) =>
					`| ${t.secteur} | ${entier(t.total)} | ${entier(t.ge50)} | ${
						t.total === 0 && t.ge50 === 0 ? "trou confirmé" : "présent"
					} |`,
			)
			.join("\n");
		const cellule = new Map(croisement.map((c) => [`${c.secteur}\u0000${c.libelle}`, c.n]));
		const lignesCroisement = SECTEURS_TROU.map(
			(s) =>
				`| ${s} | ${BANDES.map((b) => entier(cellule.get(`${s}\u0000${b.libelle}`) ?? 0)).join(" | ")} |`,
		).join("\n");

		const markdown = `# Le trou du référentiel — mesure du ${date}

Script : \`apps/api/node_modules/.bin/tsx scripts/mesure-referentiel.mts\`.
Source : PostgreSQL \`localhost:5433\`, base \`${base}\` (instantané du
référentiel d'origine). Rejouer avec \`--db=radar\` pour mesurer l'état courant.
Lecture seule. **Chaque chiffre ci-dessous est le résultat d'une requête SQL**
exécutée par le script ; aucun n'est écrit en dur.

## Ce que le référentiel couvre

| Indicateur | Valeur |
| --- | --- |
| Organisations en base | ${entier(totaux.orgs)} |
| Entreprises | ${entier(totaux.entreprises)} |
| Entreprises avec secteur renseigné | ${entier(totaux.sectorisees)} (${pourcent(totaux.pct_sectorisees)}) |
| Entreprises avec tranche d'effectif | ${entier(totaux.effectifs)} (${pourcent(totaux.pct_effectifs)}) |
| Salariés couverts (borne basse des tranches SIRENE) | ${entier(Number(totaux.salaries_min))} |

## Couverture par secteur

| Secteur | Entreprises | Part | Salariés (borne basse) |
| --- | ---: | ---: | ---: |
${parSecteur.map(ligneSecteur).join("\n")}

## Couverture par taille d'entreprise

| Tranche d'effectif (borne basse SIRENE) | Entreprises | Part |
| --- | ---: | ---: |
${parTaille.map((b) => `| ${b.libelle} | ${entier(b.n)} | ${pourcent(b.pct)} |`).join("\n")}

## Le tableau nominatif du trou

| Secteur | Lignes | Dont ≥ 50 salariés | Verdict |
| --- | ---: | ---: | --- |
${lignesTrou}

Les quatre secteurs cités dans le chantier « référentiel entreprises complet »
sont ici nommés un par un, avec leur volume réel. À zéro ligne, ils ne peuvent
rattacher aucun incident : le taux de couverture global serait flatteur à tort.

### Croisement secteur × taille

| Secteur | ${BANDES.map((b) => b.libelle).join(" | ")} |
| --- | ${BANDES.map(() => "---:").join(" | ")} |
${lignesCroisement}

Chaque cellule est un \`count(*)\` SQL sur le croisement secteur/tranche, y
compris les zéros : un secteur absent n'est pas un secteur couvert.

## Méthode

- Périmètre compté : \`org.kind = 'entreprise'\` ; le secteur vient de
  \`org.sector\` et la taille de la borne basse \`org.effectif_min\` (tranches
  SIRENE 1, 3, 6, 10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000).
- Un secteur sans aucune ligne est produit par un \`LEFT JOIN\` depuis une liste
  explicite, pas déduit de l'absence d'une ligne de résultat.
- Le total des salariés additionne des bornes basses : c'est un minorant, pas
  un effectif réel.
`;
		writeFileSync(sortie, markdown, "utf8");

		console.log(`Mesure du référentiel — ${date} — base ${base} (port 5433)`);
		console.log(`${entier(totaux.orgs)} organisations, ${entier(totaux.entreprises)} entreprises`);
		for (const t of nominatif) {
			console.log(`  ${t.secteur.padEnd(16)} ${String(t.total).padStart(4)} ligne(s), ${t.ge50} avec ≥50 salariés`);
		}
		console.log(`document publié : ${sortie}`);
	} finally {
		await client.end();
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
