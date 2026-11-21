/**
 * Rapport de qualité des données — lecture seule sur la base de test (5433).
 *
 * Chaque chiffre publié est calculé par une requête SQL exécutée au moment du
 * run ; les requêtes sont publiées telles quelles dans `docs/qualite-donnees.md`.
 *
 *   apps/api/node_modules/.bin/tsx scripts/qualite-donnees.mts
 *   apps/api/node_modules/.bin/tsx scripts/qualite-donnees.mts --out /tmp/qualite.md
 *   apps/api/node_modules/.bin/tsx scripts/qualite-donnees.mts --json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const BASE_TEST = "postgres://radar:radar@localhost:5433/radar";
process.env.DATABASE_URL = BASE_TEST;
// Les agrégats sur ~1,6 M de lignes d'alias dépassent parfois les 15 s par
// défaut de db.ts quand la base est occupée : marge pour un rapport rejouable.
process.env.RADAR_PG_API_TIMEOUT_MS = "60000";
const { withClient, closePools } = await import("../apps/api/src/db.js");
const { MOTS_GENERIQUES, MOTS_GENERIQUES_ENTREPRISE } = await import(
	"../apps/api/src/match/generique.js"
);

const SORTIE_PAR_DEFAUT = fileURLToPath(new URL("../docs/qualite-donnees.md", import.meta.url));

/** Liste SQL littérale, construite depuis le vocabulaire source du moteur. */
function listeSql(values: Iterable<string>): string {
	return [...values]
		.map((value) => `'${value.replace(/'/g, "''")}'`)
		.join(", ");
}

const TLD_AUTORISES = [
	"ae", "ar", "au", "br", "ca", "com", "de", "ec", "edu", "es", "fr",
	"hk", "id", "ie", "in", "ir", "it", "jp", "ke", "ma", "mk", "mx", "mz",
	"net", "ng", "nl", "org", "pa", "pe", "ph", "sa", "uk", "us", "vn",
	"ai", "app", "biz", "blog", "cloud", "co", "dev", "digital", "eu",
	"gouv", "gov", "info", "int", "io", "me", "mil", "name", "neo", "ninja",
	"online", "pro", "shop", "site", "store", "tech", "top", "tv", "xyz",
	"at", "be", "ch", "cl", "cn", "cz", "dk", "fi", "gr", "hu", "il",
	"kr", "lu", "no", "nz", "pl", "pt", "ro", "ru", "se", "sg", "sk",
	"th", "tr", "tw", "ua", "za",
];
const TLD_INTERDITS = ["dom", "loc", "local", "test", "invalid", "internal"];

/** Importance des familles dans la synthèse. */
const FAMILLES = ["domaine", "sigle", "nom", "vide"] as const;
type Famille = (typeof FAMILLES)[number];

const SQL_DOMAINES = `SELECT
       (count(*) FILTER (WHERE domain IS NULL OR btrim(domain) = ''))::text AS sans_domaine,
       count(*)::text AS total,
       round(100.0 * count(*) FILTER (WHERE domain IS NULL OR btrim(domain) = '')
             / nullif(count(*), 0), 2)::text AS pourcentage
  FROM org`;

/** Regroupement sur alias normalisé : « ACME », « acme » et « acme » sont un doublon. */
const SQL_ALIAS = `WITH brut AS (
  SELECT alias, count(*) AS lignes
    FROM org_alias
   WHERE alias IS NOT NULL AND btrim(alias) <> ''
   GROUP BY 1 HAVING count(*) > 1
),
doublons AS (
  SELECT lower(btrim(alias)) AS alias_normalise,
         count(*) AS lignes,
         count(DISTINCT org_id) AS orgs_distinctes
    FROM org_alias
   WHERE alias IS NOT NULL AND btrim(alias) <> ''
   GROUP BY 1 HAVING count(*) > 1
)
SELECT count(*)::text AS valeurs_dupliquees,
       coalesce(sum(lignes), 0)::text AS lignes_concernees,
       coalesce(sum(lignes - 1), 0)::text AS lignes_supplementaires,
       coalesce(sum(orgs_distinctes) FILTER (WHERE orgs_distinctes > 1), 0)::text AS valeurs_multi_org,
       (SELECT count(*)::text FROM brut) AS valeurs_dupliquees_brut,
       (SELECT coalesce(sum(lignes), 0)::text FROM brut) AS lignes_concernees_brut
  FROM doublons`;

const SQL_EVENEMENTS = `SELECT
       count(*)::text AS total,
       count(*) FILTER (WHERE org_id IS NULL)::text AS sans_org,
       count(*) FILTER (WHERE org_id IS NULL AND regional = true)::text AS sans_org_regional,
       count(*) FILTER (WHERE regional = true)::text AS regional_total
  FROM event`;

/** Même définition que GET /api/health/detail et scripts/probe-red-sources.mts. */
const SQL_ROUGES = `WITH dernier_fait AS (
  SELECT source_id, max(COALESCE(observed_at, collected_at)) AS dernier
    FROM event GROUP BY 1
)
SELECT count(*)::text AS rouges,
       count(*) FILTER (WHERE d.dernier IS NULL)::text AS sans_fait,
       count(*) FILTER (WHERE s.enabled)::text AS rouges_activees,
       (SELECT count(*)::text FROM source) AS total_sources
  FROM source s
  LEFT JOIN dernier_fait d ON d.source_id = s.id
 WHERE d.dernier IS NULL OR d.dernier < now() - interval '7 days'`;

const SQL_MORTES = `SELECT count(*)::text AS mortes
  FROM source WHERE statut = 'morte'`;

const HOTE =
	"(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?[.])+[a-z]{2,}";

/**
 * Classification SQL des indices (famille-indice.ts), sans appeler le
 * classifieur JS : domaine = regex + liste blanche de TLD, sigle = jeton
 * court en majuscules hors mots génériques, sinon nom, sinon vide.
 */
const SQL_FAMILLES = `WITH file AS (
  SELECT id, org_hint
    FROM quarantine_raw
   WHERE promoted = false AND kind = 'claim' AND status = 'pending'
),
nettoye AS (
  SELECT id, org_hint,
         regexp_replace(lower(regexp_replace(org_hint, '^[[:space:]]+|[[:space:]]+$', '', 'g')),
                        '^[a-z][a-z0-9+.-]*://', '') AS sans_scheme
    FROM file
),
hotes AS (
  SELECT id, org_hint,
         regexp_replace(regexp_replace(
           split_part(regexp_replace(sans_scheme, '[/?#].*$', ''), ':', 1),
           '[.]+$', ''), '^(www[.])+', '') AS domaine_direct,
         (regexp_match(org_hint, '${HOTE}', 'i'))[1] AS domaine_texte
    FROM nettoye
),
domaines AS (
  SELECT id, org_hint,
         CASE
           WHEN domaine_direct ~ '^${HOTE}$' THEN domaine_direct
           WHEN domaine_texte IS NOT NULL THEN
             regexp_replace(regexp_replace(lower(domaine_texte), '[.]+$', ''), '^(www[.])+', '')
         END AS domaine
    FROM hotes
),
classe AS (
  SELECT id, org_hint, domaine,
         upper(regexp_replace(
           regexp_replace(org_hint, '^[[:space:]]+|[[:space:]]+$', '', 'g'),
           '[.[:space:]]+', '', 'g')) AS compact
    FROM domaines
),
familles AS (
  SELECT CASE
           WHEN org_hint IS NULL OR btrim(org_hint) = '' THEN 'vide'
           WHEN domaine IS NOT NULL
                AND regexp_replace(domaine, '^.*[.]', '') IN (${listeSql(TLD_AUTORISES)})
                AND regexp_replace(domaine, '^.*[.]', '') NOT IN (${listeSql(TLD_INTERDITS)})
             THEN 'domaine'
           WHEN compact ~ '^[A-Z]{2,6}$'
                AND CASE WHEN compact ~ '[AEIOUY]'
                         THEN cardinality(regexp_split_to_array(
                                btrim(regexp_replace(compact, '[^AEIOUY]+', ' ', 'g')), ' +'))
                         ELSE 0 END <= 2
                AND lower(compact) NOT IN (${listeSql([
					...MOTS_GENERIQUES,
					...MOTS_GENERIQUES_ENTREPRISE,
				])})
             THEN 'sigle'
           ELSE 'nom'
         END AS famille
    FROM classe
)
SELECT f.famille,
       coalesce(c.nb, 0)::text AS nb,
       (SELECT count(*)::text FROM file) AS total_file,
       (SELECT count(*)::text FROM file WHERE org_hint IS NULL OR btrim(org_hint) = '') AS sans_indice,
       (SELECT count(*)::text FROM file) AS verif_total
  FROM (VALUES ('domaine'), ('sigle'), ('nom'), ('vide')) AS f(famille)
  LEFT JOIN (SELECT famille, count(*) AS nb FROM familles GROUP BY famille) c ON c.famille = f.famille
 ORDER BY f.famille`;

interface Mesures {
	domaines: { sans_domaine: string; total: string; pourcentage: string };
	alias: {
		valeurs_dupliquees: string;
		lignes_concernees: string;
		lignes_supplementaires: string;
		valeurs_multi_org: string;
		valeurs_dupliquees_brut: string;
		lignes_concernees_brut: string;
	};
	evenements: {
		total: string;
		sans_org: string;
		sans_org_regional: string;
		regional_total: string;
	};
	rouges: { rouges: string; sans_fait: string; rouges_activees: string; total_sources: string };
	mortes: { mortes: string };
	familles: Array<{
		famille: Famille;
		nb: string;
		total_file: string;
		sans_indice: string;
		verif_total: string;
	}>;
}

type Rapport = Mesures & { base: string; generatedAt: string };

async function mesure(): Promise<Mesures> {
	return withClient(async (client) => {
		await client.query("BEGIN READ ONLY");
		try {
			// Une seule connexion pg : les requêtes sont séquentielles dans la transaction.
			const d = await client.query<Mesures["domaines"]>(SQL_DOMAINES);
			const a = await client.query<Mesures["alias"]>(SQL_ALIAS);
			const e = await client.query<Mesures["evenements"]>(SQL_EVENEMENTS);
			const r = await client.query<Mesures["rouges"]>(SQL_ROUGES);
			const m = await client.query<Mesures["mortes"]>(SQL_MORTES);
			const f = await client.query<Mesures["familles"][number]>(SQL_FAMILLES);
			const familles = f.rows.map((row) => ({
				...row,
				nb: row.nb,
				famille: row.famille as Famille,
			}));
			const somme = familles.reduce((total, row) => total + Number(row.nb), 0);
			const total = familles[0] === undefined ? 0 : Number(familles[0]!.verif_total);
			if (familles.length === 0 || somme !== total || familles.some((row) => row.total_file !== String(total))) {
				throw new Error(`familles.incohérent: somme=${somme}, total=${total}`);
			}
			return {
				domaines: d.rows[0]!,
				alias: a.rows[0]!,
				evenements: e.rows[0]!,
				rouges: r.rows[0]!,
				mortes: m.rows[0]!,
				familles,
			};
		} finally {
			await client.query("ROLLBACK");
		}
	});
}

const nf = new Intl.NumberFormat("fr-FR");

function dateParis(): string {
	const parties = Object.fromEntries(
		new Intl.DateTimeFormat("fr-CA", {
			timeZone: "Europe/Paris",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		})
			.formatToParts(new Date())
			.filter((partie) => partie.type !== "literal")
			.map((partie) => [partie.type, partie.value]),
	);
	return `${parties.year}-${parties.month}-${parties.day} à ${parties.hour}:${parties.minute}:${parties.second}`;
}

function bloc(sql: string): string {
	return ["```sql", sql, "```"].join("\n");
}

function section(
	titre: string,
	definition: string,
	resultat: string,
	sql: string | string[],
): string[] {
	const blocs = (Array.isArray(sql) ? sql : [sql]).map(bloc);
	return [
		`## ${titre}`,
		"",
		`**Définition / périmètre.** ${definition}`,
		"",
		`**Résultat.** ${resultat}`,
		"",
		...blocs,
		"",
	];
}

function render(rapport: Rapport): string {
	const { domaines, alias, evenements, rouges, mortes, familles } = rapport;
	const comptes = Object.fromEntries(familles.map((row) => [row.famille, Number(row.nb)])) as Record<
		Famille,
		number
	>;
	const totalFile = Number(familles[0]!.total_file);
	const sansIndice = Number(familles[0]!.sans_indice);
	const pct = (part: number, total: number): string =>
		total === 0 ? "—" : `${nf.format(Number((100 * part / total).toFixed(2)))} %`;
	const pctOrg = `${domaines.pourcentage.replace(".", ",")} %`;

	const lignes: string[] = [
		`# Qualité des données — ${rapport.generatedAt.slice(0, 10)}`,
		"",
		`Généré le ${rapport.generatedAt} (Europe/Paris) · base : \`${rapport.base}\` · lecture seule (\`BEGIN READ ONLY\` … \`ROLLBACK\`).`,
		"",
		"Chaque chiffre ci-dessous est le résultat d'une requête SQL exécutée pendant la génération ; la requête est publiée telles quelles dans sa section.",
		"",
		"## Synthèse",
		"",
		"| Indicateur | Mesure | Détail |",
		"| --- | ---: | --- |",
		`| Organisations sans domaine | ${nf.format(Number(domaines.sans_domaine))} | ${nf.format(Number(domaines.total))} organisations, ${pctOrg} |`,
		`| Alias en doublon (alias normalisé) | ${nf.format(Number(alias.valeurs_dupliquees))} valeurs | ${nf.format(Number(alias.lignes_concernees))} lignes concernées ; brut : ${nf.format(Number(alias.valeurs_dupliquees_brut))} valeurs / ${nf.format(Number(alias.lignes_concernees_brut))} lignes |`,
		`| Événements sans organisation | ${nf.format(Number(evenements.sans_org))} | ${nf.format(Number(evenements.total))} événements ; ${nf.format(Number(evenements.sans_org_regional))} régionaux |`,
		`| Sources rouges (7 j sans fait) | ${nf.format(Number(rouges.rouges))} | ${nf.format(Number(rouges.rouges_activees))} actives sur ${nf.format(Number(rouges.total_sources))} sources |`,
		`| Sources mortes | ${nf.format(Number(mortes.mortes))} | \`source.statut = 'morte'\` |`,
		`| File en attente | ${nf.format(totalFile)} | ${nf.format(sansIndice)} sans indice |`,
		...FAMILLES.map(
			(f) => `| Indice famille \`${f}\` | ${nf.format(comptes[f]!)} | ${pct(comptes[f]!, totalFile)} de la file |`,
		),
		"",
	];

	lignes.push(
		...section(
			"1. Organisations sans domaine",
			"Toutes les lignes de `org` dont `domain` est NULL ou vide après `btrim`. Le total et le pourcentage sont calculés dans la même requête.",
			`${nf.format(Number(domaines.sans_domaine))} organisations sans domaine sur ${nf.format(Number(domaines.total))} (${pctOrg}).`,
			SQL_DOMAINES,
		),
	);
	lignes.push(
		...section(
			"2. Alias en doublon",
			"Regroupement principal sur `lower(btrim(alias))` et non sur l'alias brut : les variantes de casse et d'espaces entourants désignent le même alias et sont des doublons réels pour la qualité du référentiel. La requête compte les valeurs répétées (GROUP BY … HAVING count(*) > 1), les lignes concernées, les lignes surnuméraires et les valeurs partagées par plusieurs organisations ; elle publie aussi, pour comparaison, les mêmes compteurs sur l'alias brut.",
			`${nf.format(Number(alias.valeurs_dupliquees))} valeurs d'alias normalisées dupliquées, touchant ${nf.format(Number(alias.lignes_concernees))} lignes (${nf.format(Number(alias.lignes_supplementaires))} lignes surnuméraires, ${nf.format(Number(alias.valeurs_multi_org))} valeurs partagées entre organisations). En alias brut : ${nf.format(Number(alias.valeurs_dupliquees_brut))} valeurs dupliquées et ${nf.format(Number(alias.lignes_concernees_brut))} lignes concernées.`,
			SQL_ALIAS,
		),
	);
	lignes.push(
		...section(
			"3. Événements sans organisation",
			"Tous les événements dont `org_id` est NULL, avec le sous-ensemble `regional = true` (les faits locaux non rattachés sont les plus coûteux à qualifier manuellement).",
			`${nf.format(Number(evenements.sans_org))} événements sans organisation sur ${nf.format(Number(evenements.total))} (${pct(Number(evenements.sans_org), Number(evenements.total))}), dont ${nf.format(Number(evenements.sans_org_regional))} régionaux sur ${nf.format(Number(evenements.regional_total))}.`,
			SQL_EVENEMENTS,
		),
	);
	lignes.push(
		...section(
			"4. Sources rouges et sources mortes",
			"Rouge : aucune date de fait `COALESCE(observed_at, collected_at)` au cours des 7 derniers jours, ou aucun fait — définition de `GET /api/health/detail` et `scripts/probe-red-sources.mts`. Morte : `source.statut = 'morte'` (décision explicite, migration 042). Les deux notions sont comptées par deux requêtes distinctes ; une source morte n'est pas retirée du décompte rouge.",
			`${nf.format(Number(rouges.rouges))} sources rouges, dont ${nf.format(Number(rouges.sans_fait))} n'ont jamais produit de fait et ${nf.format(Number(rouges.rouges_activees))} sont encore actives ; ${nf.format(Number(mortes.mortes))} sources déclarées mortes.`,
			[SQL_ROUGES, SQL_MORTES],
		),
	);
	lignes.push(
		...section(
			"5. Indices de file par famille",
			"File = `quarantine_raw` avec `promoted = false`, `kind = 'claim'`, `status = 'pending'`. La classification est entièrement faite en SQL (aucun appel à `classifierIndice` sur des lignes ramenées) : normalisation du domaine (schéma, chemin, port, points finaux, `www.`), regex d'hôte, liste blanche de TLD publics et liste noire des suffixes locaux, puis sigle = 2 à 6 lettres majuscules après compaction, au plus deux groupes de voyelles, hors vocabulaires génériques importés de `apps/api/src/match/generique.ts` (mêmes listes que le classifieur). Les listes de TLD sont celles de `famille-indice.ts`. Écart documenté : la normalisation JS de l'accentuation n'a pas d'effet ici, car un indice accentué ne peut pas correspondre à `^[A-Z]{2,6}$` ; la gestion des espaces unicode inhabituels suit `[[:space:]]` de PostgreSQL. La somme des quatre familles est vérifiée égale au total de la file.",
			`${nf.format(totalFile)} lignes en attente : ${FAMILLES.map((f) => `\`${f}\` ${nf.format(comptes[f]!)} (${pct(comptes[f]!, totalFile)})`).join(", ")}. Sans indice : ${nf.format(sansIndice)} ; somme des familles = ${nf.format(familles.reduce((s, f) => s + Number(f.nb), 0))} = total.`,
			SQL_FAMILLES,
		),
	);

	return `${lignes.join("\n")}\n`;
}

interface Options {
	out: string;
	json: boolean;
}

function parseArgs(argv: string[]): Options {
	let out = SORTIE_PAR_DEFAUT;
	let json = false;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--json") json = true;
		else if (arg === "--out") {
			const cible = argv[i + 1];
			if (cible === undefined || cible.startsWith("--")) throw new Error("--out attend un chemin de fichier");
			out = fileURLToPath(new URL(cible, `file://${process.cwd()}/`));
			i++;
		} else throw new Error(`argument inconnu : ${arg}`);
	}
	if (json && out !== SORTIE_PAR_DEFAUT) throw new Error("--json et --out sont exclusifs");
	return { out, json };
}

try {
	const options = parseArgs(process.argv.slice(2));
	const rapport: Rapport = { base: BASE_TEST, generatedAt: dateParis(), ...(await mesure()) };
	if (options.json) {
		process.stdout.write(`${JSON.stringify(rapport, null, 2)}\n`);
	} else {
		mkdirSync(dirname(options.out), { recursive: true });
		writeFileSync(options.out, render(rapport), "utf8");
		process.stdout.write(`rapport écrit : ${options.out}\n`);
	}
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`qualite-donnees: ${message}\n`);
	await closePools().catch(() => {});
	process.exit(1);
}
await closePools();
