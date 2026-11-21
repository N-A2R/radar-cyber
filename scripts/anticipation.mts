/**
 * Corpus d'anticipation — instantané à J-21.
 *
 * Pour chaque incident du corpus de couverture
 * (`bench/fixtures/corpus-reference-na.json`), on écrit une ligne JSONL avec
 * l'état du radar 21 jours avant le fait : événements des 21 jours précédant
 * cette date, sources actives et organisations citées par ces événements.
 *
 * Règle d'or : aucune donnée postérieure à J-21 ne sort du script. La borne
 * haute est **exclusive** et porte sur `event.valid_at` (date à laquelle le
 * fait était vrai), pas sur `observed_at`/`collected_at`/`created_at`, qui
 * peuvent être remplis bien plus tard. Les champs des sources qui portent une
 * date d'activité postérieure sont tronqués à la borne ; les métadonnées de
 * l'incident lui-même ne sont pas des données du instantané et restent
 * limitées à son identifiant, son nom et sa date de référence.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/anticipation.mts
 *   apps/api/node_modules/.bin/tsx scripts/anticipation.mts --sortie=bench/anticipation/J-21.jsonl
 *
 * Lecture seule sur la base ; seule la sortie JSONL est écrite.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
function option(nom: string, defaut: string): string {
	return argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3) ?? defaut;
}

const CHEMIN_CORPUS = option("corpus", fileURLToPath(new URL("../bench/fixtures/corpus-reference-na.json", import.meta.url)));
const CHEMIN_SORTIE = option("sortie", fileURLToPath(new URL("../bench/anticipation/J-21.jsonl", import.meta.url)));
const JOURS = 21;

// Les autres scripts de mesure pointent sur la base de développement 5433 ;
// db.ts lit DATABASE_URL au moment de son import, donc on le pose avant.
process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
const { closePools, query } = await import("../apps/api/src/db.js");

type Incident = {
	id: string;
	entite: string;
	dateIncident: string | null;
	datePublique: string;
};

type Evenement = {
	id: number;
	family: string;
	assertion_type: string;
	titre: string;
	valid_at: Date;
	source_id: string;
	org_id: number | null;
};

type Source = {
	id: string;
	name: string;
	family: string | null;
	url: string | null;
	dernier_ok: Date | null;
	evenements_fenetre: number;
	evenements_avant: number;
};

type Organisation = {
	id: number;
	name: string;
	kind: string | null;
	sector: string | null;
	dept: string | null;
	city: string | null;
	evenements_fenetre: number;
};

/** Date UTC d'un `YYYY-MM-DD` du corpus, sans fuseau ni heure locale. */
function dateDuJour(valeur: string): Date {
	return new Date(`${valeur.slice(0, 10)}T00:00:00.000Z`);
}

function iso(date: Date): string {
	return date.toISOString();
}

/** J-21 : 21 jours calendaires avant la date de référence, à 00:00 UTC. */
function veille(dateReference: Date): Date {
	const j21 = new Date(dateReference.getTime());
	j21.setUTCDate(j21.getUTCDate() - JOURS);
	return j21;
}

function jour(date: Date): string {
	return iso(date).slice(0, 10);
}

async function main(): Promise<void> {
	const corpus = JSON.parse(readFileSync(CHEMIN_CORPUS, "utf8")) as { incidents: Incident[] };
	const lignes: string[] = [];

	for (const incident of corpus.incidents) {
		// Une entrée du corpus n'a pas de date d'incident. On le dit dans la
		// ligne plutôt que d'inventer une date : la date publique sert alors
		// de référence, explicitement marquée comme telle.
		const dateReference = incident.dateIncident ?? incident.datePublique;
		const typeReference = incident.dateIncident ? "dateIncident" : "datePublique";
		const j21 = veille(dateDuJour(dateReference));

		// Borne haute exclusive : toute la journée de J-21 est incluse, rien
		// d'après ne l'est. `valid_at` est le seul critère temporel des faits.
		const fin = new Date(j21.getTime() + 86_400_000);
		const debut = new Date(fin.getTime() - JOURS * 86_400_000);

		const { rows: evenements } = await query<Evenement>(
			`SELECT e.id, e.family, e.assertion_type, left(e.title, 200) AS titre,
			        e.valid_at, e.source_id, e.org_id
			   FROM event e
			  WHERE e.valid_at >= $1 AND e.valid_at < $2
			  ORDER BY e.valid_at, e.id`,
			[debut, fin],
		);

		// Une source n'est dite active ici que si elle a produit au moins un
		// événement dont `valid_at` est antérieur à J-21. On ne décide pas à
		// partir de `created_at`/`last_ok_at` : ces champs n'ont pas de
		// `valid_at` et sont des états de configuration actuels.
		const { rows: sources } = await query<Source>(
			`SELECT s.id, s.name, s.family, s.url,
			        CASE WHEN s.last_ok_at < $2 THEN s.last_ok_at END AS dernier_ok,
			        (SELECT count(*)::int FROM event e
			          WHERE e.source_id = s.id AND e.valid_at >= $1 AND e.valid_at < $2) AS evenements_fenetre,
			        (SELECT count(*)::int FROM event e
			          WHERE e.source_id = s.id AND e.valid_at < $2) AS evenements_avant
			   FROM source s
			  WHERE s.enabled = true
			    AND EXISTS (SELECT 1 FROM event e
			                 WHERE e.source_id = s.id AND e.valid_at < $2)
			  ORDER BY s.id`,
			[debut, fin],
		);

		const { rows: organisations } = await query<Organisation>(
			`SELECT o.id, o.name, o.kind, o.sector, o.dept, o.city,
			        count(*)::int AS evenements_fenetre
			   FROM event e JOIN org o ON o.id = e.org_id
			  WHERE e.valid_at >= $1 AND e.valid_at < $2
			  GROUP BY o.id, o.name, o.kind, o.sector, o.dept, o.city
			  ORDER BY o.id`,
			[debut, fin],
		);

		const { rows: totaux } = await query<{ avant: number; fenetre: number }>(
			`SELECT count(*) FILTER (WHERE valid_at < $2)::int AS avant,
			        count(*) FILTER (WHERE valid_at >= $1 AND valid_at < $2)::int AS fenetre
			   FROM event`,
			[debut, fin],
		);

		lignes.push(
			JSON.stringify({
				incident: {
					id: incident.id,
					entite: incident.entite,
					dateReference,
					typeReference,
				},
				j21: jour(j21),
				fenetre: { debut: jour(debut), fin: jour(j21), jours: JOURS },
				comptes: {
					evenements_avant_j21: totaux[0]?.avant ?? 0,
					evenements_fenetre: totaux[0]?.fenetre ?? 0,
					sources_actives: sources.length,
					organisations_citees: organisations.length,
				},
				evenements: evenements.map((e) => ({
					id: e.id,
					family: e.family,
					assertion_type: e.assertion_type,
					titre: e.titre,
					valid_at: iso(e.valid_at),
					source_id: e.source_id,
					org_id: e.org_id,
				})),
				sources_actives: sources.map((s) => ({
					id: s.id,
					name: s.name,
					family: s.family,
					url: s.url,
					dernier_ok_avant_j21: s.dernier_ok ? iso(s.dernier_ok) : null,
					evenements_fenetre: s.evenements_fenetre,
					evenements_avant: s.evenements_avant,
				})),
				organisations_citees: organisations,
			}),
		);
	}

	mkdirSync(dirname(CHEMIN_SORTIE), { recursive: true });
	writeFileSync(CHEMIN_SORTIE, `${lignes.join("\n")}\n`, "utf8");
	console.log(`${lignes.length} incident(s) → ${CHEMIN_SORTIE}`);
	await closePools();
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
