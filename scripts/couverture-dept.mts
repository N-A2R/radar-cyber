/**
 * Couverture d'un département (ici la Vienne, 86) mesurée sur la base 5433.
 *
 * Principe : le corpus versionné `bench/corpus/incidents-vienne.jsonl` est
 * passé à PostgreSQL comme paramètre JSONB. Tout le reste — recherche de
 * l'événement radar, jugement cyber, rattachement à une organisation du
 * département, délai, répartition des motifs, taux et médiane — est calculé
 * par SQL. Le TypeScript ne fait que lire le résultat et l'imprimer : aucun
 * compte, aucune médiane, aucun taux n'est reconstruit côté script.
 *
 * Règles de rattachement d'un incident à un événement :
 *   - URL source identique, ou
 *   - titre proche (pg_trgm, similarité >= 0,25) dans une fenêtre de ±45
 *     jours autour de la publication. Le meilleur candidat est retenu, en
 *     priorisant un org_id dont le dept est celui du département mesuré.
 *
 * Motifs (mêmes codes que `apps/api/src/analyse/couverture.ts`) :
 *   vu              — événement jugé cyber et rattaché à une org du dept 86 ;
 *   pas_collecte    — aucun événement radar ne correspond à l'incident ;
 *   pas_juge_cyber  — événement trouvé mais famille hors du périmètre cyber ;
 *   pas_rattache    — événement trouvé, sans org du département.
 *
 * Le délai de détection est `event.created_at::date - date_publication`,
 * calculé seulement pour les incidents « vu ».
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/couverture-dept.mts
 *   apps/api/node_modules/.bin/tsx scripts/couverture-dept.mts --json=bench/results/couverture-vienne.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** La mesure est explicitement celle du port 5433, quel que soit DATABASE_URL. */
const DB_URL = "postgres://radar:radar@localhost:5433/radar";
process.env.DATABASE_URL = DB_URL;

const DEPT = "86";
const DEPT_LABEL = "Vienne";
const CORPUS = fileURLToPath(new URL("../bench/corpus/incidents-vienne.jsonl", import.meta.url));

/** Les huit familles présentes dans `event` : ce sont les familles cyber du radar. */
const FAMILLES_CYBER = [
	"cert",
	"cert_fr",
	"cti",
	"leaks",
	"paste",
	"presse_cyber",
	"ransomware",
	"vuln",
];

interface Incident {
	id: string;
	date_publication: string;
	date_incident?: string;
	organisation: string;
	departement: string;
	type: string;
	source: string;
	titre: string;
	url: string;
	resume?: string;
	extrait?: string;
}

interface LigneSql {
	id: string;
	organisation: string;
	date_publication: string;
	motif: "vu" | "pas_collecte" | "pas_juge_cyber" | "pas_rattache";
	event_id: number | null;
	event_titre: string | null;
	event_date: string | null;
	org_id: number | null;
	org_nom: string | null;
	org_dept: string | null;
	similarite: number | null;
	delai_jours: number | null;
	synthese: {
		total: number;
		vus: number;
		pas_collecte: number;
		pas_juge_cyber: number;
		pas_rattache: number;
		taux: number;
		delai_median_jours: number | null;
		orgs_du_dept: number;
	};
}

/** Une seule requête : les lignes nominatives ET la synthèse agrégée par SQL. */
const SQL = `
WITH corpus AS (
  SELECT x->>'id'                   AS id,
         (x->>'date_publication')::date AS date_publication,
         x->>'organisation'         AS organisation,
         x->>'departement'          AS departement,
         x->>'titre'                AS titre,
         x->>'url'                  AS url
    FROM jsonb_array_elements($1::jsonb) AS x
   WHERE x->>'departement' = $2
),
candidats AS (
  SELECT c.id,
         e.id AS event_id,
         e.title AS event_titre,
         e.created_at AS event_date,
         e.family AS famille,
         e.org_id,
         o.name AS org_nom,
         o.dept AS org_dept,
         similarity(e.title, c.titre) AS sim
    FROM corpus c
    JOIN event e
      ON e.source_url = c.url
      OR (e.observed_at::date BETWEEN c.date_publication - 45 AND c.date_publication + 45
          AND e.title % c.titre
          AND similarity(e.title, c.titre) >= 0.25)
    LEFT JOIN org o ON o.id = e.org_id
),
choisi AS (
  SELECT DISTINCT ON (id) *
    FROM candidats
   ORDER BY id, (org_dept = $3) DESC, sim DESC, event_date ASC, event_id ASC
),
faits AS (
  SELECT c.id,
         c.organisation,
         c.date_publication,
         ch.event_id,
         ch.event_titre,
         ch.event_date,
         ch.org_id,
         ch.org_nom,
         ch.org_dept,
         ch.sim,
         CASE
           WHEN ch.event_id IS NULL THEN 'pas_collecte'
           WHEN ch.famille IS NULL OR NOT (ch.famille = ANY($4::text[])) THEN 'pas_juge_cyber'
           WHEN ch.org_dept IS DISTINCT FROM $3 THEN 'pas_rattache'
           ELSE 'vu'
         END AS motif,
         CASE
           WHEN ch.event_id IS NOT NULL
                AND (ch.famille = ANY($4::text[]))
                AND ch.org_dept = $3
           THEN (ch.event_date::date - c.date_publication)
         END AS delai_jours
    FROM corpus c
    LEFT JOIN choisi ch USING (id)
),
synthese AS (
  SELECT jsonb_build_object(
           'total', count(*),
           'vus', count(*) FILTER (WHERE motif = 'vu'),
           'pas_collecte', count(*) FILTER (WHERE motif = 'pas_collecte'),
           'pas_juge_cyber', count(*) FILTER (WHERE motif = 'pas_juge_cyber'),
           'pas_rattache', count(*) FILTER (WHERE motif = 'pas_rattache'),
           'taux', round(100.0 * count(*) FILTER (WHERE motif = 'vu') / NULLIF(count(*), 0), 1),
           'delai_median_jours',
             round(percentile_cont(0.5) WITHIN GROUP (ORDER BY delai_jours)
                   FILTER (WHERE motif = 'vu')::numeric, 1),
           'orgs_du_dept', (SELECT count(*) FROM org WHERE dept = $3)
         ) AS valeur
    FROM faits
)
SELECT f.id,
       f.organisation,
       to_char(f.date_publication, 'YYYY-MM-DD') AS date_publication,
       f.motif,
       f.event_id,
       f.event_titre,
       to_char(f.event_date, 'YYYY-MM-DD') AS event_date,
       f.org_id,
       f.org_nom,
       f.org_dept,
       round(f.sim::numeric, 3) AS similarite,
       f.delai_jours,
       s.valeur AS synthese
  FROM faits f
  CROSS JOIN synthese s
 ORDER BY f.id
`;

function lireCorpus(): Incident[] {
	const incidences: Incident[] = readFileSync(CORPUS, "utf8")
		.split("\n")
		.filter((ligne) => ligne.trim() !== "")
		.map((ligne) => JSON.parse(ligne) as Incident);
	const horsDepartement = incidences.filter((i) => i.departement !== DEPT_LABEL);
	if (horsDepartement.length > 0) {
		throw new Error(`${horsDepartement.length} incident(s) hors ${DEPT_LABEL} dans ${CORPUS}`);
	}
	return incidences;
}

function francais(nombre: number): string {
	return String(nombre).replace(".", ",");
}

async function main(): Promise<void> {
	const { query, closePools } = await import("../apps/api/src/db.js");
	const incidents = lireCorpus();
	const { rows } = await query<LigneSql>(SQL, [
		JSON.stringify(incidents),
		DEPT_LABEL,
		DEPT,
		FAMILLES_CYBER,
	]);
	await closePools();

	const synthese = rows[0]?.synthese;
	if (synthese === undefined || rows.length !== synthese.total) {
		throw new Error("la synthèse SQL et les lignes nominatives divergent");
	}

	const args = process.argv.slice(2);
	const sortie = args.find((a) => a.startsWith("--json="))?.slice("--json=".length) ?? null;
	if (sortie !== null) {
		writeFileSync(
			sortie,
			`${JSON.stringify(
				{
					departement: { code: DEPT, nom: DEPT_LABEL },
					base: DB_URL,
					corpus: CORPUS,
					synthese,
					incidents: rows.map(({ synthese: _synthese, ...ligne }) => ligne),
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
	}

	console.log(`Couverture ${DEPT_LABEL} (${DEPT}) — base ${DB_URL}`);
	console.log(`Corpus : ${synthese.total} incident(s) · organisations du dept : ${synthese.orgs_du_dept}`);
	console.log(
		`Rattachés : ${synthese.vus}/${synthese.total} (${francais(synthese.taux)} %) · ` +
			`délai médian : ${
				synthese.delai_median_jours === null
					? "non mesuré (aucun incident rattaché)"
					: `${francais(synthese.delai_median_jours)} j`
			}`,
	);
	console.log(
		`Motifs : pas_collecte ${synthese.pas_collecte} · pas_rattache ${synthese.pas_rattache} · ` +
			`pas_juge_cyber ${synthese.pas_juge_cyber}`,
	);
	console.log("");
	for (const ligne of rows) {
		const detail =
			ligne.event_id === null
				? "aucun événement radar"
				: `événement ${ligne.event_id} · ${
						ligne.event_titre ?? "sans titre"
					} · similarity ${francais(ligne.similarite ?? 0)}`;
		const attache =
			ligne.org_id === null ? "aucune org" : `${ligne.org_nom ?? "org ?"} (${ligne.org_dept ?? "?"})`;
		console.log(
			`${ligne.id} | ${ligne.date_publication} | ${ligne.organisation} | ${ligne.motif} | ` +
				`${detail} | ${attache} | délai ${ligne.delai_jours ?? "—"} j`,
		);
	}
	if (sortie !== null) console.log(`\nJSON : ${sortie}`);
}

main().catch((erreur: unknown) => {
	console.error(erreur instanceof Error ? erreur.message : String(erreur));
	process.exitCode = 1;
});
