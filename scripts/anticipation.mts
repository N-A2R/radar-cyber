/**
 * Corpus d'anticipation — instantané à J-21.
 *
 * Pour chacun des 50 incidents de `bench/couverture/incidents.jsonl`, on écrit
 * une ligne JSONL avec l'état du radar 21 jours avant le fait : événements des
 * 21 jours précédant cette date, sources actives et organisations citées par
 * ces événements. Le corpus JSON historique reste accepté via `--corpus=…json`.
 *
 * Règle d'or : aucune donnée postérieure à J-21 ne sort du script. La borne
 * haute est **exclusive** et porte sur `event.valid_at` (date à laquelle le
 * fait était vrai), pas sur `observed_at`/`collected_at`/`created_at`, qui
 * peuvent être remplis bien plus tard. La borne est appliquée en SQL puis
 * revérifiée en mémoire ; tout événement rejeté est compté et publié.
 * Les champs des sources qui portent une date d'activité postérieure sont
 * tronqués à la borne ; les métadonnées de l'incident lui-même ne sont pas des
 * données de l'instantané et restent limitées à son identifiant, son nom et
 * sa date de référence.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/anticipation.mts
 *   apps/api/node_modules/.bin/tsx scripts/anticipation.mts --sortie=bench/anticipation/J-21.jsonl
 *
 * Écrit aussi `bench/anticipation/historique-reel.json` : le nombre exact de
 * jours où le radar a réellement collecté (`collected_at`), distinct de
 * l'ancienneté des dates `valid_at` remontées par les flux.
 */
import {
	SQL,
	bornesFenetre,
	construireInstantane,
	dateDuJour,
	filtrerEvenements,
	jour,
	type EvenementBrut,
	type HistoriqueReel,
	type OrganisationBrut,
	type SourceBrut,
	type TotauxBrut,
} from "../apps/api/src/analyse/instantane-anticipation.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
function option(nom: string, defaut: string): string {
	return argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3) ?? defaut;
}

const CHEMIN_CORPUS = option("corpus", fileURLToPath(new URL("../bench/couverture/incidents.jsonl", import.meta.url)));
const CHEMIN_SORTIE = option("sortie", fileURLToPath(new URL("../bench/anticipation/J-21.jsonl", import.meta.url)));
const CHEMIN_HISTORIQUE = option("historique", fileURLToPath(new URL("../bench/anticipation/historique-reel.json", import.meta.url)));

// Les autres scripts de mesure pointent sur la base de développement 5433 ;
// db.ts lit DATABASE_URL au moment de son import, donc on le pose avant.
process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
const { closePools, query } = await import("../apps/api/src/db.js");

type Incident = {
	id: string;
	entite: string;
	dateIncident: string | null;
	datePublique: string;
	departement?: string | null;
	type?: string | null;
	resume?: string | null;
	source?: string | null;
};


/** Lecture du corpus de couverture (JSONL) ou du corpus historique (JSON). */
function lireIncidents(chemin: string): Incident[] {
	const texte = readFileSync(chemin, "utf8").trim();
	if (!texte) return [];
	const objets: Record<string, unknown>[] = chemin.endsWith(".jsonl")
		? texte
				.split("\n")
				.filter((ligne) => ligne.trim().length > 0)
				.map((ligne, index) => {
					let brut: unknown;
					try {
						brut = JSON.parse(ligne);
					} catch (erreur) {
						throw new Error(`${chemin} ligne ${index + 1} : JSON illisible (${String(erreur)})`);
					}
					if (typeof brut !== "object" || brut === null || Array.isArray(brut)) {
						throw new Error(`${chemin} ligne ${index + 1} : entrée non objet`);
					}
					return brut as Record<string, unknown>;
				})
		: (() => {
				const brut = JSON.parse(texte) as { incidents?: unknown[] };
				if (!Array.isArray(brut.incidents)) throw new Error(`${chemin} : clé incidents manquante`);
				return brut.incidents as Record<string, unknown>[];
			})();

	const vus = new Set<string>();
	return objets.map((objet, index) => {
		const chaine = (cle: string) => (typeof objet[cle] === "string" ? (objet[cle] as string) : "");
		const id = chaine("id");
		const entite = chaine("organisation") || chaine("entite");
		const dateIncident = chaine("date_incident") || chaine("dateIncident") || null;
		const datePublique = chaine("date_publication") || chaine("datePublique");
		if (!id || !entite || (!dateIncident && !datePublique)) {
			throw new Error(`${chemin} entrée ${index + 1} : id, entité et une date sont requis`);
		}
		if (vus.has(id)) throw new Error(`${chemin} : id d'incident dupliqué ${id}`);
		vus.add(id);
		const dateReference = dateIncident ?? datePublique;
		const reference = dateDuJour(dateReference);
		if (Number.isNaN(reference.getTime()) || jour(reference) !== dateReference.slice(0, 10)) {
			throw new Error(`${chemin} entrée ${index + 1} : date de référence invalide (${dateReference})`);
		}
		return {
			id,
			entite,
			dateIncident,
			datePublique,
			departement: chaine("departement") || null,
			type: chaine("type") || null,
			resume: chaine("resume") || null,
			source: chaine("source") || null,
		};
	});
}

async function main(): Promise<void> {
	const incidents = lireIncidents(CHEMIN_CORPUS);
	const lignes: string[] = [];
	let horsBorne = 0;

	// Une seule mesure globale : les jours où le radar a réellement collecté.
	// Les flux peuvent remonter des `valid_at` anciens ; ce n'est pas de
	// l'historique d'observation et le rapport ne doit pas les confondre.
	const { rows: historiqueRows } = await query<HistoriqueReel>(SQL.historique, [null]);
	const historique = historiqueRows[0];
	if (!historique) throw new Error("historique réel : aucune mesure retournée");

	for (const incident of incidents) {
		// Une entrée du corpus n'a pas de date d'incident. On le dit dans la
		// ligne plutôt que d'inventer une date : la date publique sert alors
		// de référence, explicitement marquée comme telle.
		const dateReference = incident.dateIncident ?? incident.datePublique;
		const typeReference = incident.dateIncident ? "dateIncident" : "datePublique";
		const bornes = bornesFenetre(dateDuJour(dateReference));
		const params = [bornes.debut, bornes.fin];

		// Borne haute exclusive : toute la journée de J-21 est incluse, rien
		// d'après ne l'est. `valid_at` est le seul critère temporel des faits.
		const { rows: evenements } = await query<EvenementBrut>(SQL.evenements, params);

		// Deuxième barrière, côté machine : même si une requête était modifiée
		// plus tard, aucun événement postérieur à J-21 ne peut sortir d'ici.
		const { retenus, horsBorne: rejetes } = filtrerEvenements(evenements, bornes);
		horsBorne += rejetes;

		// Une source n'est dite active ici que si elle a produit au moins un
		// événement dont `valid_at` est antérieur à J-21. On ne décide pas à
		// partir de `created_at`/`last_ok_at` : ces champs n'ont pas de
		// `valid_at` et sont des états de configuration actuels.
		const { rows: sources } = await query<SourceBrut>(SQL.sources, params);
		const { rows: organisations } = await query<OrganisationBrut>(SQL.organisations, params);
		const { rows: totaux } = await query<TotauxBrut>(SQL.totaux, params);

		lignes.push(
			JSON.stringify(
				construireInstantane(
					{ id: incident.id, entite: incident.entite, dateReference, typeReference },
					bornes,
					retenus,
					sources,
					organisations,
					totaux,
				),
			),
		);
	}

	mkdirSync(dirname(CHEMIN_SORTIE), { recursive: true });
	writeFileSync(CHEMIN_SORTIE, `${lignes.join("\n")}\n`, "utf8");
	writeFileSync(CHEMIN_HISTORIQUE, `${JSON.stringify(historique, null, 2)}\n`, "utf8");
	console.log(
		`${lignes.length} incident(s) → ${CHEMIN_SORTIE} ; ` +
			`${horsBorne} événement(s) rejeté(s) par la borne J-21 sur valid_at`,
	);
	console.log(
		`Historique réel : ${historique.jours_avec_collecte} journée(s) avec collecte sur ` +
			`${historique.jours_calendaires} jour(s) calendaires (${historique.premiere_collecte} → ` +
			`${historique.derniere_collecte}) → ${CHEMIN_HISTORIQUE}`,
	);

	await closePools();
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
