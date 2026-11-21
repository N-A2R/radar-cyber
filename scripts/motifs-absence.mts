/**
 * Motifs d'absence — diagnostic des incidents non vus, rejoué sur la base.
 *
 * La mesure de couverture (`scripts/mesure-couverture.mts`) dit *si* un incident
 * est vu. Ce script dit *pourquoi* il ne l'est pas, sans deviner :
 *
 *  1. la source du média est-elle déclarée et a-t-elle été collectée le jour
 *     de publication (table `source`, exécutions `collector_run`, événements
 *     horodatés du même jour) ?
 *  2. un événement correspond-il à l'article avec `org_id` NULL (`event` et
 *     `event_archive`) ?
 *  3. le filtre cyber de production (`classifyFamily`) renvoie-t-il `presse`
 *     pour ce texte et cette source ?
 *
 * Priorité du motif final : `vu` (événement rattaché) → `pas_rattache`
 * (événement sans org) → `pas_juge_cyber` (source collectée, filtre refusé) →
 * `pas_collecte` (aucune preuve de collecte ce jour-là) → `indetermine`.
 * Les trois réponses brutes sont publiées pour chaque incident, y compris
 * quand le motif final est ailleurs dans la chaîne.
 *
 * Reproductibilité : aucun appel réseau, aucune date courante, aucun tri
 * aléatoire. Le corpus est identifié par son SHA-256 et la base par une
 * empreinte de toutes les lignes lues. À corpus et base égaux, les deux
 * fichiers publiés sont octet pour octet identiques.
 *
 *   apps/api/node_modules/.bin/tsx scripts/motifs-absence.mts
 *   apps/api/node_modules/.bin/tsx scripts/motifs-absence.mts \
 *     --corpus=bench/couverture/incidents.jsonl --json=/tmp/motifs.json --md=/tmp/motifs.md
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { classifyFamily, isCyberText, type Family } from "../apps/api/src/collectors/classify.js";

const RACINE = fileURLToPath(new URL("..", import.meta.url));

interface Options {
	corpus: string;
	json: string;
	md: string;
}

function parseArgs(argv: string[]): Options {
	const opts: Options = {
		corpus: "bench/fixtures/corpus-reference-na.json",
		json: "bench/results/motifs-absence.json",
		md: "bench/results/motifs-absence.md",
	};
	for (const arg of argv) {
		if (arg.startsWith("--corpus=")) opts.corpus = arg.slice("--corpus=".length);
		else if (arg.startsWith("--json=")) opts.json = arg.slice("--json=".length);
		else if (arg.startsWith("--md=")) opts.md = arg.slice("--md=".length);
		else if (arg === "--help") {
			console.log("Usage: tsx scripts/motifs-absence.mts [--corpus=...] [--json=...] [--md=...]");
			process.exit(0);
		} else throw new Error(`Option inconnue : ${arg}`);
	}
	return opts;
}

interface Incident {
	id: string;
	entite: string;
	datePublication: string;
	titre: string;
	resume: string;
	url: string;
	editeur: string;
}

interface SourceRow {
	id: string;
	name: string;
	family: string;
	url: string | null;
	enabled: boolean;
	relevance: string | null;
	last_ok_at: unknown;
}

interface RunRow {
	id: string;
	source_id: string;
	started_at: unknown;
	status: string;
	items_in: number;
	items_new: number;
}

interface EventRow {
	id: string;
	dedup_key: string | null;
	source_id: string;
	source_url: string | null;
	title: string | null;
	org_id: number | null;
	observed_at: unknown;
	collected_at: unknown;
}

interface SourceEvidence {
	id: string;
	nom: string;
	url: string | null;
	famille: string;
	active: boolean;
	relevance: string | null;
	derniereReussite: string | null;
}

interface ExecutionEvidence {
	id: string;
	sourceId: string;
	debut: string | null;
	statut: string;
	itemsIn: number;
	itemsNew: number;
}

interface EvenementEvidence {
	table: "event" | "event_archive";
	id: string;
	dedupKey: string | null;
	sourceId: string;
	orgId: number | null;
	titre: string | null;
	url: string | null;
	observeLe: string | null;
	collecteLe: string | null;
	regle: "url" | "titre+date";
}

type Motif = "vu" | "pas_collecte" | "pas_juge_cyber" | "pas_rattache" | "indetermine";

interface Resultat {
	id: string;
	entite: string;
	datePublication: string;
	editeur: string;
	url: string;
	vu: boolean;
	motif: Motif;
	collecte: {
		sourceDeclaree: boolean;
		collecteeCeJour: boolean;
		date: string;
		sources: SourceEvidence[];
		executionsDuJour: ExecutionEvidence[];
		evenementsDuJour: number;
		derniereExecution: string | null;
	};
	evenement: {
		avecOrg: boolean;
		sansOrg: boolean;
		correspondances: EvenementEvidence[];
	};
	filtreCyber: {
		sourceFamille: string | null;
		texteCyber: boolean;
		familleSortie: string | null;
		rejette: boolean | null;
	};
	preuve: string;
}

function sha256(valeur: string | Buffer): string {
	return createHash("sha256").update(valeur).digest("hex");
}

function horodatage(valeur: unknown): string | null {
	if (valeur === null || valeur === undefined) return null;
	return valeur instanceof Date ? valeur.toISOString() : String(valeur);
}

function jour(valeur: unknown): string | null {
	return horodatage(valeur)?.slice(0, 10) ?? null;
}

function sansAccents(valeur: string): string {
	return valeur.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function normaliserNom(valeur: string): string {
	return sansAccents(valeur).replace(/[^a-z0-9]+/g, " ").trim();
}

function normaliserTitre(valeur: string): string {
	return normaliserNom(valeur);
}

function normaliserUrl(valeur: string): string {
	try {
		const u = new URL(valeur);
		return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`;
	} catch {
		return sansAccents(valeur).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
	}
}

function domaine(valeur: string | null): string | null {
	if (!valeur) return null;
	try {
		return new URL(valeur).hostname.toLowerCase().replace(/^www\./, "").split(".").slice(-2).join(".");
	} catch {
		return null;
	}
}

/** Charge le corpus versionné (JSON de 60 incidents ou JSONL de 20 incidents). */
function chargerCorpus(chemin: string): { incidents: Incident[]; sha256: string } {
	const cheminAbsolu = resolve(RACINE, chemin);
	const brut = readFileSync(cheminAbsolu);
	const contenu = brut.toString("utf8");
	const incidents: Incident[] = [];

	if (chemin.endsWith(".jsonl")) {
		contenu.split(/\r?\n/).forEach((ligne, index) => {
			if (!ligne.trim()) return;
			let objet: Record<string, unknown>;
			try {
				objet = JSON.parse(ligne) as Record<string, unknown>;
			} catch {
				throw new Error(`${chemin}: ligne ${index + 1} invalide`);
			}
			const texte = (cle: string): string =>
				typeof objet[cle] === "string" ? (objet[cle] as string) : "";
			const entite = texte("organisation");
			const titre = texte("titre");
			const url = texte("url");
			if (!texte("id") || !texte("date_publication") || !url) {
				throw new Error(`${chemin}: ligne ${index + 1} incomplète`);
			}
			incidents.push({
				id: texte("id"),
				entite,
				datePublication: texte("date_publication"),
				titre: titre || entite,
				resume: texte("resume") || texte("extrait"),
				url,
				editeur: texte("source"),
			});
		});
	} else {
		const donnees = JSON.parse(contenu) as {
			incidents?: Array<Record<string, any>>;
		};
		if (!Array.isArray(donnees.incidents)) throw new Error(`${chemin}: champ incidents absent`);
		for (const objet of donnees.incidents) {
			const preuve = (objet.preuve ?? {}) as Record<string, unknown>;
			const chaine = (valeur: unknown): string => (typeof valeur === "string" ? valeur : "");
			const id = chaine(objet.id);
			const datePublication = chaine(objet.datePublique);
			const url = chaine(preuve.url);
			if (!id || !datePublication || !url) throw new Error(`${chemin}: incident ${id} incomplet`);
			incidents.push({
				id,
				entite: chaine(objet.entite),
				datePublication,
				titre: chaine(preuve.titre) || chaine(objet.titre) || chaine(objet.entite),
				resume: chaine(objet.resume),
				url,
				editeur: chaine(preuve.editeur) || chaine(objet.editeur) || "",
			});
		}
	}

	incidents.sort((a, b) => a.id.localeCompare(b.id, "fr"));
	return { incidents, sha256: sha256(brut) };
}

/** Source déclarée pour un article : hôte du flux d'abord, nom de média ensuite. */
function sourcesPour(
	incident: Incident,
	sources: SourceRow[],
): SourceEvidence[] {
	const domaineArticle = domaine(incident.url);
	const nomArticle = normaliserNom(incident.editeur);
	const retenues = sources.filter((source) => {
		const domaineSource = domaine(source.url);
		if (domaineArticle && domaineSource && domaineArticle === domaineSource) return true;
		if (!nomArticle || nomArticle.length < 4) return false;
		const nomSource = normaliserNom(source.name);
		return nomSource.includes(nomArticle) || nomArticle.includes(nomSource);
	});
	return retenues.map((source) => ({
		id: source.id,
		nom: source.name,
		url: source.url,
		famille: source.family,
		active: source.enabled,
		relevance: source.relevance,
		derniereReussite: horodatage(source.last_ok_at),
	}));
}

/** Une correspondance est prouvée par URL, ou par titre identique + même jour (les archives n'ont pas de titre). */
function regleCorrespondance(evenement: EventRow, incident: Incident): "url" | "titre+date" | null {
	if (evenement.source_url && normaliserUrl(evenement.source_url) === normaliserUrl(incident.url)) {
		return "url";
	}
	if (!evenement.title) return null;
	const titreEvenement = normaliserTitre(evenement.title);
	const titreIncident = normaliserTitre(incident.titre);
	if (!titreEvenement || !titreIncident) return null;
	const memeTitre =
		titreEvenement === titreIncident ||
		(Math.min(titreEvenement.length, titreIncident.length) >= 30 &&
			(titreEvenement.includes(titreIncident) || titreIncident.includes(titreEvenement)));
	if (!memeTitre) return null;
	const memeJour =
		jour(evenement.observed_at) === incident.datePublication ||
		jour(evenement.collected_at) === incident.datePublication;
	return memeJour ? "titre+date" : null;
}

function cellule(valeur: string): string {
	return valeur.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function motifTexte(motif: Motif): string {
	switch (motif) {
		case "vu": return "vu";
		case "pas_collecte": return "pas collecté";
		case "pas_juge_cyber": return "pas jugé cyber";
		case "pas_rattache": return "pas rattaché";
		case "indetermine": return "indéterminé";
	}
}

async function main(): Promise<void> {
	try {
		const opts = parseArgs(process.argv.slice(2));
		const corpus = chargerCorpus(opts.corpus);
		const [sources, runs, evenements, archives, orgs] = await Promise.all([
			query<SourceRow>(
				`SELECT id, name, family, url, enabled, relevance, last_ok_at
				   FROM source ORDER BY id`,
			),
			query<RunRow>(
				`SELECT id::text AS id, source_id, started_at, status, items_in, items_new
				   FROM collector_run ORDER BY id`,
			),
			query<EventRow>(
				`SELECT id::text AS id, dedup_key, source_id, source_url, title, org_id,
				        observed_at, collected_at
				   FROM event ORDER BY id`,
			),
			query<EventRow>(
				`SELECT id::text AS id, dedup_key, source_id, source_url, NULL::text AS title, org_id,
				        observed_at, collected_at
				   FROM event_archive ORDER BY id`,
			),
			query<{ n: string }>("SELECT count(*)::text AS n FROM org"),
		]);

		const empreinteBase = sha256(JSON.stringify({
			sources: sources.rows.map((s) => [s.id, s.name, s.family, s.url, s.enabled, s.relevance, horodatage(s.last_ok_at)]),
			executions: runs.rows.map((r) => [r.id, r.source_id, horodatage(r.started_at), r.status, r.items_in, r.items_new]),
			evenements: evenements.rows.map((e) => [e.id, e.source_id, e.source_url, e.title, e.org_id, horodatage(e.observed_at), horodatage(e.collected_at)]),
			archives: archives.rows.map((e) => [e.id, e.source_id, e.source_url, e.title, e.org_id, horodatage(e.observed_at), horodatage(e.collected_at)]),
		}));
		const joursExecutions = runs.rows
			.map((r) => jour(r.started_at))
			.filter((v): v is string => v !== null)
			.sort();

		const tousEvenements = [
			...evenements.rows.map((e) => ({ table: "event" as const, ligne: e })),
			...archives.rows.map((e) => ({ table: "event_archive" as const, ligne: e })),
		];

		const resultats: Resultat[] = corpus.incidents.map((incident) => {
			const sourcesTrouvees = sourcesPour(incident, sources.rows);
			const idsSources = new Set(sourcesTrouvees.map((s) => s.id));
			const executionsDuJour = runs.rows
				.filter((r) => idsSources.has(r.source_id) && jour(r.started_at) === incident.datePublication)
				.map((r) => ({
					id: r.id,
					sourceId: r.source_id,
					debut: horodatage(r.started_at),
					statut: r.status,
					itemsIn: Number(r.items_in),
					itemsNew: Number(r.items_new),
				}))
				.sort((a, b) => a.id.localeCompare(b.id, "fr"));
			const evenementsDuJour = tousEvenements.filter(
				({ ligne }) => idsSources.has(ligne.source_id) && jour(ligne.collected_at) === incident.datePublication,
			).length;
			const reussitesDuJour = sourcesTrouvees.some(
				(s) => s.derniereReussite?.slice(0, 10) === incident.datePublication,
			);
			const collecteeCeJour = executionsDuJour.length > 0 || evenementsDuJour > 0 || reussitesDuJour;
			const dernierRun = runs.rows
				.filter((r) => idsSources.has(r.source_id))
				.map((r) => horodatage(r.started_at))
				.filter((v): v is string => v !== null)
				.sort()
				.at(-1) ?? null;

			const correspondances: EvenementEvidence[] = tousEvenements.flatMap(({ table, ligne }) => {
				const regle = regleCorrespondance(ligne, incident);
				if (!regle) return [];
				if (idsSources.size > 0 && !idsSources.has(ligne.source_id)) return [];
				return [{
					table,
					id: ligne.id,
					dedupKey: ligne.dedup_key,
					sourceId: ligne.source_id,
					orgId: ligne.org_id === null ? null : Number(ligne.org_id),
					titre: ligne.title,
					url: ligne.source_url,
					observeLe: horodatage(ligne.observed_at),
					collecteLe: horodatage(ligne.collected_at),
					regle,
				}];
			});
			const avecOrg = correspondances.some((e) => e.orgId !== null);
			const sansOrg = correspondances.some((e) => e.orgId === null);

			const sourceReference = sourcesTrouvees[0] ?? null;
			const texteCyber = isCyberText(incident.titre, incident.resume || null);
			const familleSortie = sourceReference
				? classifyFamily({
					title: incident.titre,
					summary: incident.resume || null,
					sourceFamily: sourceReference.famille as Family,
					sourceName: sourceReference.nom,
				})
				: null;
			const rejette = familleSortie === null ? null : familleSortie === "presse";

			let motif: Motif;
			if (avecOrg) motif = "vu";
			else if (sansOrg) motif = "pas_rattache";
			else if (collecteeCeJour) motif = rejette === true ? "pas_juge_cyber" : "indetermine";
			else motif = "pas_collecte";

			let preuve: string;
			if (avecOrg) {
				preuve = `événement ${correspondances.find((e) => e.orgId !== null)?.table}#${
					correspondances.find((e) => e.orgId !== null)?.id
				} rattaché`;
			} else if (sansOrg) {
				const trouv = correspondances.find((e) => e.orgId === null);
				preuve = `événement ${trouv?.table}#${trouv?.id} sans org`;
			} else if (!sourceReference) {
				preuve = "média absent de la table source";
			} else if (collecteeCeJour) {
				preuve = rejette === true
					? `filtre cyber ${sourceReference.famille} → presse`
					: `collecté le ${incident.datePublication}, aucun événement correspondant`;
			} else {
				preuve = `aucune collecte le ${incident.datePublication} (${executionsDuJour.length} exécution(s))`;
			}

			return {
				id: incident.id,
				entite: incident.entite,
				datePublication: incident.datePublication,
				editeur: incident.editeur,
				url: incident.url,
				vu: avecOrg,
				motif,
				collecte: {
					sourceDeclaree: sourcesTrouvees.length > 0,
					collecteeCeJour,
					date: incident.datePublication,
					sources: sourcesTrouvees,
					executionsDuJour,
					evenementsDuJour,
					derniereExecution: dernierRun,
				},
				evenement: {
					avecOrg,
					sansOrg,
					correspondances,
				},
				filtreCyber: {
					sourceFamille: sourceReference?.famille ?? null,
					texteCyber,
					familleSortie,
					rejette,
				},
				preuve,
			};
		});

		const nonVus = resultats.filter((r) => !r.vu);
		const motifs = Object.fromEntries(
			(["pas_collecte", "pas_juge_cyber", "pas_rattache", "indetermine"] as Motif[]).map(
				(motif) => [motif, nonVus.filter((r) => r.motif === motif).length],
			),
		);
		const rapport = {
			regles: {
				vu: "un événement correspondant porte un org_id non nul dans event ou event_archive",
				priorite: ["vu", "pas_rattache", "pas_juge_cyber", "pas_collecte", "indetermine"],
				collecte: "exécution collector_run, événement collecté ou last_ok_at le jour de publication",
				correspondance: "URL normalisée identique, ou titre normalisé identique et même jour",
				filtreCyber: "classifyFamily() du collecteur : une sortie 'presse' est refusée à l'entrée",
			},
			corpus: {
				fichier: relative(RACINE, resolve(RACINE, opts.corpus)).replace(/\\/g, "/"),
				sha256: corpus.sha256,
				incidents: corpus.incidents.length,
			},
			base: {
				empreinte: empreinteBase,
				sources: sources.rows.length,
				executions: runs.rows.length,
				fenetreExecutions: [joursExecutions[0] ?? null, joursExecutions.at(-1) ?? null],
				evenements: evenements.rows.length,
				evenementsArchives: archives.rows.length,
				organisations: Number(orgs.rows[0]?.n ?? 0),
			},
			resume: {
				incidents: resultats.length,
				vus: resultats.length - nonVus.length,
				nonVus: nonVus.length,
				motifs,
				sourcesDeclarees: nonVus.filter((r) => r.collecte.sourceDeclaree).length,
				collecteesCeJour: nonVus.filter((r) => r.collecte.collecteeCeJour).length,
				evenementsSansOrg: nonVus.filter((r) => r.evenement.sansOrg).length,
				filtreCyberRefuse: nonVus.filter((r) => r.filtreCyber.rejette === true).length,
			},
			incidents: resultats,
		};

		const lignes = [
			"| Incident | Entité | Publication | Motif | Source collectée ce jour | Événement sans org | Filtre cyber | Preuve |",
			"| --- | --- | --- | --- | --- | --- | --- | --- |",
			...nonVus.map((r) => {
				const collecte = r.collecte.sourceDeclaree
					? r.collecte.collecteeCeJour ? "oui" : "non"
					: "source non déclarée";
				const evenement = r.evenement.sansOrg
					? `oui (${r.evenement.correspondances.filter((e) => e.orgId === null).length})`
					: "non";
				const filtre = r.filtreCyber.rejette === null
					? "—"
					: r.filtreCyber.rejette
						? `oui (${r.filtreCyber.sourceFamille} → presse)`
						: `non (${r.filtreCyber.familleSortie})`;
				return `| ${cellule(r.id)} | ${cellule(r.entite)} | ${r.datePublication} | ${motifTexte(r.motif)} | ${collecte} | ${evenement} | ${cellule(filtre)} | ${cellule(r.preuve)} |`;
			}),
		];
		const markdown = [
			"# Motifs d'absence — incidents non vus",
			"",
			`Corpus \`${rapport.corpus.fichier}\` — ${rapport.corpus.incidents} incidents — SHA-256 \`${rapport.corpus.sha256}\`.`,
			`Base : ${rapport.base.sources} sources, ${rapport.base.executions} exécutions, ${rapport.base.evenements} événements, ${rapport.base.evenementsArchives} archivés — empreinte \`${rapport.base.empreinte}\`.`,
			`Historique de collecte en base : ${rapport.base.fenetreExecutions[0] ?? "—"} → ${rapport.base.fenetreExecutions[1] ?? "—"} ; en dehors de cette fenêtre, « pas collecté » signifie « aucune preuve de collecte ce jour-là ».`,
			"",
			`${rapport.resume.vus} vus, ${rapport.resume.nonVus} non vus : ` +
				Object.entries(rapport.resume.motifs).map(([motif, n]) => `${motif} ${n}`).join(", ") + ".",
			`Sur ces non vus : ${rapport.resume.sourcesDeclarees} sources déclarées, ${rapport.resume.collecteesCeJour} collectées le jour de publication, ${rapport.resume.evenementsSansOrg} événements sans org, ${rapport.resume.filtreCyberRefuse} refus du filtre cyber.`,
			"",
			"Classement : la source est-elle déclarée et collectée le jour de publication ; un événement existe-t-il sans `org_id` ; le filtre cyber renvoie-t-il `presse`. Priorité : événement rattaché → événement sans org → filtre refusé (si collecté) → absence de collecte → indéterminé.",
			"",
			...lignes,
			"",
		].join("\n");

		for (const [chemin, contenu] of [
			[opts.json, `${JSON.stringify(rapport, null, 2)}\n`],
			[opts.md, markdown],
		]) {
			const cible = resolve(RACINE, chemin);
			mkdirSync(dirname(cible), { recursive: true });
			writeFileSync(cible, contenu, "utf8");
			console.log(`publié : ${chemin}`);
		}
		console.log(
			`${rapport.resume.vus}/${rapport.resume.incidents} vus · ${rapport.resume.nonVus} non vus · ` +
				Object.entries(rapport.resume.motifs).map(([k, v]) => `${k}=${v}`).join(" · "),
		);
	} finally {
		await closePools();
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
