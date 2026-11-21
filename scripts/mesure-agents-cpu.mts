/**
 * Mesure du taux de fausses alertes des trois agents CPU — chantier 4.
 *
 * La question : quand `organisation-surgissante`, `bascule-secteur` ou
 * `source-muette` tirent, combien de fois n'y a-t-il rien derrière ? Les seuils
 * des détecteurs sont calibrés par cette mesure, pas choisis à l'intuition.
 *
 * Méthode — rejeu historique, sans écriture :
 *   1. les détecteurs pur + leurs adaptateurs base tournent à chaque instant de
 *      la fenêtre (`detecterAgentsCpuDepuisBase`), donc sur les mêmes requêtes
 *      que la revue — ce n'est pas une réimplémentation des seuils ;
 *   2. vérité terrain des incidents : le corpus de référence résolu en
 *      organisations par le moteur réel (`designateUneOrganisation` sur les
 *      alias exacts candidats, pour rester dans la mémoire de la box) ;
 *   3. vérité terrain des sources : reprise de production dans les 7 jours qui
 *      suivent l'alerte (une alerte suivie d'une reprise est fausse) et runs
 *      de collecte en échec (une panne confirmée est vraie) ;
 *   4. au-delà de la couverture du corpus, une alerte incident est déclarée
 *      `non_classable`, pas fausse — faute de vérité terrain, la classer serait
 *      inventer un verdict.
 *
 * Une situation qui dure est dédupliquée : même agent, même clé, faits qui se
 * recoupent d'un instant à l'autre.
 *
 *   tsx scripts/mesure-agents-cpu.mts --json=bench/results/agents-cpu-fausses-alertes.json
 *   tsx scripts/mesure-agents-cpu.mts --depuis=2026-10-22 --jusqua=2026-11-21 --pas=1
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { closePools, query } from "../apps/api/src/db.js";
import { detecterAgentsCpuDepuisBase } from "../apps/api/src/analyse/agents-cpu.js";
import {
	FENETRE_ABSENCE_JOURS,
	FENETRE_RECENTE_JOURS as JOURS_ORG,
	HISTORIQUE_ANCIEN_MIN,
	SEUIL_EVENEMENTS_RECENTS,
	SOURCES_DISTINCTES_MIN,
} from "../apps/api/src/analyse/agent-rupture-org.js";
import {
	EFFECTIF_MIN,
	FENETRE_RECENTE_JOURS as JOURS_SECTEUR,
	FENETRE_REFERENCE_JOURS,
	OBSERVES_MIN_SECTEUR,
	SEUIL_Z,
} from "../apps/api/src/analyse/agent-rupture-secteur.js";
import {
	FENETRE_CADENCE_JOURS,
	SEUIL_SILENCE_JOURS,
} from "../apps/api/src/analyse/agent-source-muette.js";
import { buildGazetteer, designateUneOrganisation, type GazetteerRow } from "../apps/api/src/match/gazetteer.js";

const argv = process.argv.slice(2);
const SORTIE_JSON = argv.find((a) => a.startsWith("--json="))?.split("=")[1] ?? null;
const DEPUIS_ARG = argv.find((a) => a.startsWith("--depuis="))?.split("=")[1] ?? null;
const JUSQUA_ARG = argv.find((a) => a.startsWith("--jusqua="))?.split("=")[1] ?? null;
const PAS_ARG = argv.find((a) => a.startsWith("--pas="))?.split("=")[1] ?? null;
const CORPUS = fileURLToPath(new URL("../bench/fixtures/corpus-reference-na.json", import.meta.url));
const FENETRE = { debut: DEPUIS_ARG ?? "2026-10-22", fin: JUSQUA_ARG ?? "2026-11-21" };
const PAS_REJEU_JOURS = PAS_ARG === null ? 1 : Number(PAS_ARG);
const JOUR_MS = 86_400_000;
/** Couvre la fenêtre de veille des détecteurs d'incidents. */
const TOLERANCE_JOURS = 35;
/** Une reprise dans cette fenêtre rend le silence « muette » trop hâtif. */
const HORIZON_REPRISE_JOURS = 7;

const COMMANDE_REJEU = [
	"tsx scripts/mesure-agents-cpu.mts",
	DEPUIS_ARG ? `--depuis=${DEPUIS_ARG}` : null,
	JUSQUA_ARG ? `--jusqua=${JUSQUA_ARG}` : null,
	PAS_ARG !== null ? `--pas=${PAS_REJEU_JOURS}` : null,
	SORTIE_JSON ? `--json=${SORTIE_JSON}` : null,
].filter((p): p is string => p !== null).join(" ");

export type Fenetre = { debut: number; fin: number; pasJours: number };
export type Classement = "vraie" | "fausse" | "non_classable";

/** Refuse une fenêtre inversée ou un pas non positif avant toute requête. */
export function parserFenetre(debut: string, fin: string, pasJours: number): Fenetre {
	const d = Date.parse(`${debut}T00:00:00Z`);
	const f = Date.parse(`${fin}T23:59:59Z`);
	if (!Number.isFinite(d) || !Number.isFinite(f)) throw new Error(`fenêtre invalide : ${debut} → ${fin}`);
	if (!(pasJours >= 1)) throw new Error(`pas de rejeu invalide : ${pasJours}`);
	if (f < d) throw new Error(`fenêtre inversée : ${debut} après ${fin}`);
	return { debut: d, fin: f, pasJours };
}

/** Instants calés en arrière depuis la fin : le dernier voit les faits les plus récents. */
export function genererInstants(fenetre: Fenetre): number[] {
	const instants: number[] = [];
	for (let t = fenetre.fin; t >= fenetre.debut; t -= fenetre.pasJours * JOUR_MS) instants.push(t);
	const dernier = instants[instants.length - 1];
	if (dernier !== undefined && dernier > fenetre.debut) instants.push(fenetre.debut);
	return instants;
}

/**
 * État de la base au moment de la mesure : un taux publié sans le volume
 * observé n'est pas reproductible. Une seule requête, annotée ici, fournit
 * les trois compteurs et la dernière date d'observation des faits en base.
 */
async function compterBase(): Promise<{
	evenements: number;
	organisations: number;
	sources: number;
	derniereObservation: string | null;
}> {
	const r = await query<{
		evenements: string;
		organisations: string;
		sources: string;
		derniereObservation: string | null;
	}>(
		`SELECT (SELECT count(*) FROM event)::text AS evenements,
		        (SELECT count(*) FROM org)::text AS organisations,
		        (SELECT count(*) FROM source)::text AS sources,
		        (SELECT max(observed_at)::date::text FROM event) AS "derniereObservation"`,
	);
	const ligne = r.rows[0];
	return {
		evenements: Number(ligne?.evenements ?? 0),
		organisations: Number(ligne?.organisations ?? 0),
		sources: Number(ligne?.sources ?? 0),
		derniereObservation: ligne?.derniereObservation ?? null,
	};
}

/** Au-delà de la couverture du corpus + tolérance, on ne peut pas classer. */
export function estClassable(instant: number, maxDateCorpus: number, toleranceJours: number): boolean {
	return instant <= maxDateCorpus + toleranceJours * JOUR_MS;
}

type ContexteClassement = {
	instant: number;
	agent: string;
	faits: number[];
	/** Dates des incidents du corpus pour l'organisation (agent organisation). */
	datesCorpusOrg?: readonly number[];
	/** Dates des incidents du corpus pour le secteur (agent secteur). */
	datesCorpusSecteur?: readonly number[];
	/** Vrai si le corpus fournit au moins un incident dans ce secteur. */
	secteurCouvert?: boolean;
	maxDateCorpus: number;
	famillesFaits: readonly string[];
	/** Premier événement produit après l'alerte, pour l'agent source. */
	repriseApres: number | null;
	erreurCollecte: boolean;
	horizonAtteint: boolean;
};

export type Verdict = { classement: Classement; raison: string | null };

/**
 * Classement d'une alerte, pure et testable. Les deux agents d'incident ont une
 * vérité terrain externalisée (le corpus) ; l'agent source a une vérité
 * comportementale (reprise ou panne de collecte), explicitement plus faible.
 */
export function classerAlerteCpu(a: ContexteClassement): Verdict {
	if (a.agent === "source-muette") {
		if (a.repriseApres !== null) return { classement: "fausse", raison: "reprise_transitoire" };
		if (!a.horizonAtteint) return { classement: "non_classable", raison: "horizon_trop_court" };
		return a.erreurCollecte
			? { classement: "vraie", raison: "panne_collecte_confirmee" }
			: { classement: "vraie", raison: "silence_persistant" };
	}

	if (a.agent === "bascule-secteur" && a.secteurCouvert !== true) {
		return { classement: "non_classable", raison: "secteur_sans_verite" };
	}
	const dates = a.agent === "bascule-secteur" ? a.datesCorpusSecteur ?? [] : a.datesCorpusOrg ?? [];
	if (dates.some((d) => Math.abs(d - a.instant) <= TOLERANCE_JOURS * JOUR_MS)) {
		return { classement: "vraie", raison: null };
	}
	if (!estClassable(a.instant, a.maxDateCorpus, TOLERANCE_JOURS)) {
		return { classement: "non_classable", raison: "hors_couverture_corpus" };
	}
	if (a.famillesFaits.length > 0 && a.famillesFaits.every((f) => f === "vuln")) {
		return { classement: "fausse", raison: "bruit_bulletins" };
	}
	return {
		classement: "fausse",
		raison: a.agent === "bascule-secteur" ? "aucun_incident_corpus_secteur" : "aucun_incident_corpus",
	};
}

export function tauxFaussesAlertes(alertes: readonly { classement: Classement }[]): number | null {
	const classables = alertes.filter((a) => a.classement !== "non_classable");
	if (classables.length === 0) return null;
	return Math.round((classables.filter((a) => a.classement === "fausse").length / classables.length) * 1000) / 10;
}


/** Candidats d'alias exacts à tester, du plus spécifique au plus général. */
export function candidatsAlias(entite: string): string[] {
	const brut = [entite, ...entite.split(/[—(,)/]+/)]
		.map((part) => part.trim().toLowerCase().replace(/\s+/g, " "))
		.filter((part) => part.length >= 4);
	return [...new Set(brut)].slice(0, 8);
}
type AlerteClassee = {
	agent: string;
	cle: string;
	instant: string;
	motif: string;
	classement: Classement;
	raison: string | null;
	faits: number[];
};

async function main(): Promise<void> {
	const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as {
		incidents: Array<{ id: string; entite: string; resume: string; datePublique: string }>;
	};
	const fenetre = parserFenetre(FENETRE.debut, FENETRE.fin, PAS_REJEU_JOURS);
	const instants = genererInstants(fenetre);
	const maintenant = Date.now();
	const maxDateCorpus = Math.max(
		...corpus.incidents.map((i) => Date.parse(`${i.datePublique}T00:00:00Z`)),
	);

	// La base 5433 n'a pas la colonne matérialisée `org_alias.nom_normalise`
	// (migration 045 non appliquée) ; charger les 1,6 M d'alias pour reconstruire
	// tout le gazetteer tuerait le processus par OOM. On ne lit que les alias
	// exacts candidats des 60 entités du corpus, via l'index lower(alias), puis
	// on applique le moteur de correspondance à ce petit sous-ensemble.
	const candidats = [...new Set(corpus.incidents.flatMap((i) => candidatsAlias(i.entite)))];
	const alias = await query<GazetteerRow>(
		`SELECT a.org_id, o.name, o.kind, o.dept, o.city, o.sector, a.alias, a.source
		   FROM org_alias a JOIN org o ON o.id = a.org_id
		  WHERE a.status = 'active' AND lower(btrim(a.alias)) = ANY($1::text[])`,
		[candidats],
	);
	const parAlias = new Map<string, GazetteerRow[]>();
	for (const row of alias.rows) {
		const cle = row.alias.trim().toLowerCase();
		const lignes = parAlias.get(cle) ?? [];
		lignes.push(row);
		parAlias.set(cle, lignes);
	}
	const resoluer = (entite: string, texte: string): number | null => {
		for (const cle of candidatsAlias(entite)) {
			const lignes = parAlias.get(cle) ?? [];
			if (lignes.length === 0) continue;
			if (lignes.length === 1) return Number(lignes[0]?.org_id);
			const resultat = designateUneOrganisation(buildGazetteer(lignes), texte);
			if (resultat.org !== null) return Number(resultat.org.id);
		}
		return null;
	};

	// Vérité terrain : organisations résolues du corpus, élargies de la
	// tolérance à gauche de la fenêtre pour les alertes de son début.
	const debutVerite = fenetre.debut - TOLERANCE_JOURS * JOUR_MS;
	const veriteTerrain = new Map<number, number[]>();
	let incidentsNonResolus = 0;
	for (const incident of corpus.incidents) {
		const date = Date.parse(`${incident.datePublique}T00:00:00Z`);
		if (date < debutVerite || date > fenetre.fin) continue;
		const orgId = resoluer(incident.entite, `${incident.entite} ${incident.resume}`);
		if (orgId === null) {
			incidentsNonResolus++;
			continue;
		}
		const dates = veriteTerrain.get(orgId) ?? [];
		dates.push(date);
		veriteTerrain.set(orgId, dates);
	}

	// Un seul passage sur les faits : familles pour le motif de faux positif,
	// production par source pour vérifier le silence, horizon d'observation.
	const depuisFaits = new Date(fenetre.debut - (JOURS_SECTEUR + FENETRE_REFERENCE_JOURS) * JOUR_MS).toISOString();
	const jusquauxFaits = new Date(fenetre.fin + HORIZON_REPRISE_JOURS * JOUR_MS).toISOString();
	const faits = await query<{ id: string; source_id: string; family: string; observed_at: string }>(
		`SELECT id::text AS id, source_id, family, observed_at::text AS observed_at
		   FROM event WHERE observed_at >= $1::timestamptz AND observed_at <= $2::timestamptz`,
		[depuisFaits, jusquauxFaits],
	);
	const familles = new Map<string, string>();
	const instantsParSource = new Map<string, number[]>();
	let maxObservation = 0;
	for (const f of faits.rows) {
		familles.set(String(f.id), f.family);
		const t = Date.parse(f.observed_at);
		if (!Number.isFinite(t)) continue;
		maxObservation = Math.max(maxObservation, t);
		const dates = instantsParSource.get(f.source_id) ?? [];
		dates.push(t);
		instantsParSource.set(f.source_id, dates);
	}
	for (const dates of instantsParSource.values()) dates.sort((a, b) => a - b);

	// Secteur des organisations du corpus : la vérité terrain de la bascule.
	const orgIds = [...veriteTerrain.keys()];
	const secteursOrg = new Map<number, string>();
	if (orgIds.length > 0) {
		const r = await query<{ id: number; secteur: string }>(
			`SELECT id, COALESCE(NULLIF(btrim(sector), ''), NULLIF(btrim(kind), ''), 'inconnu') AS secteur
			   FROM org WHERE id = ANY($1)`,
			[orgIds],
		);
		for (const row of r.rows) secteursOrg.set(Number(row.id), row.secteur);
	}
	const datesCorpusSecteur = new Map<string, number[]>();
	for (const [orgId, dates] of veriteTerrain) {
		const secteur = secteursOrg.get(orgId);
		if (!secteur) continue;
		const connus = datesCorpusSecteur.get(secteur) ?? [];
		connus.push(...dates);
		datesCorpusSecteur.set(secteur, connus);
	}

	const runs = await query<{ source_id: string; started_at: string; status: string }>(
		`SELECT source_id, started_at::text AS started_at, status
		   FROM collector_run WHERE started_at >= $1::timestamptz AND started_at <= $2::timestamptz
		     AND status = 'error'`,
		[new Date(fenetre.debut).toISOString(), jusquauxFaits],
	);
	const erreursParSource = new Map<string, number[]>();
	for (const run of runs.rows) {
		const t = Date.parse(run.started_at);
		if (!Number.isFinite(t)) continue;
		const dates = erreursParSource.get(run.source_id) ?? [];
		dates.push(t);
		erreursParSource.set(run.source_id, dates);
	}

	const vue = new Map<string, Set<number>>();
	const classees: AlerteClassee[] = [];
	let rejeux = 0;
	for (const t of instants) {
		const alertes = await detecterAgentsCpuDepuisBase(t);
		rejeux++;
		for (const a of alertes) {
			const vus = vue.get(`${a.agent}:${a.cle}`);
			if (vus && a.faits.some((id) => vus.has(id))) continue;
			vue.set(`${a.agent}:${a.cle}`, new Set([...(vus ?? []), ...a.faits]));

			const sourceId = typeof a.evidence.sourceId === "string" ? a.evidence.sourceId : "";
			const reprise = (instantsParSource.get(sourceId) ?? []).find(
				(instant) => instant > t && instant <= t + HORIZON_REPRISE_JOURS * JOUR_MS,
			);
			const erreur = (erreursParSource.get(sourceId) ?? []).some(
				(instant) => instant >= t && instant <= t + HORIZON_REPRISE_JOURS * JOUR_MS,
			);
			const secteur = typeof a.evidence.secteur === "string" ? a.evidence.secteur : "";
			const verdict = classerAlerteCpu({
				instant: t,
				agent: a.agent,
				faits: a.faits,
				datesCorpusOrg: veriteTerrain.get(Number(a.orgId)) ?? [],
				datesCorpusSecteur: datesCorpusSecteur.get(secteur) ?? [],
				secteurCouvert: datesCorpusSecteur.has(secteur),
				maxDateCorpus,
				famillesFaits: a.faits.map((id) => familles.get(String(id)) ?? ""),
				repriseApres: reprise ?? null,
				erreurCollecte: erreur,
				horizonAtteint: t + HORIZON_REPRISE_JOURS * JOUR_MS <= Math.min(maintenant, maxObservation),
			});
			classees.push({
				agent: a.agent,
				cle: a.cle,
				instant: new Date(t).toISOString().slice(0, 10),
				motif: a.titre,
				classement: verdict.classement,
				raison: verdict.raison,
				faits: a.faits,
			});
		}
	}

	// Pourquoi l'agent source peut rester muet : au dernier instant, combien
	// de sources actives avaient une production réellement quotidienne avant
	// le silence ? Un zéro ici est une information, pas un détecteur cassé.
	const dernierInstant = instants[0] ?? maintenant;
	const finCadence = dernierInstant - SEUIL_SILENCE_JOURS * JOUR_MS;
	const debutCadence = finCadence - FENETRE_CADENCE_JOURS * JOUR_MS;
	let sourcesQuotidiennes = 0;
	for (const dates of instantsParSource.values()) {
		const cases = new Set(
			dates
				.filter((t) => t >= debutCadence && t < finCadence)
				.map((t) => Math.ceil((finCadence - t) / JOUR_MS)),
		);
		if (cases.size === FENETRE_CADENCE_JOURS) sourcesQuotidiennes++;
	}
	const diagnosticSources = {
		instant: new Date(dernierInstant).toISOString().slice(0, 10),
		sourcesAvecEvenementsRecents: instantsParSource.size,
		sourcesQuotidiennesSurCadence: sourcesQuotidiennes,
	};

	const parAgent = new Map<string, { emises: number; vraies: number; fausses: number; nonClassables: number; taux: number | null; raisons: Record<string, number> }>();
	for (const agent of ["organisation-surgissante", "bascule-secteur", "source-muette"] as const) {
		const propres = classees.filter((c) => c.agent === agent);
		const raisons: Record<string, number> = {};
		for (const c of propres) {
			if (c.raison) raisons[c.raison] = (raisons[c.raison] ?? 0) + 1;
		}
		parAgent.set(agent, {
			emises: propres.length,
			vraies: propres.filter((c) => c.classement === "vraie").length,
			fausses: propres.filter((c) => c.classement === "fausse").length,
			nonClassables: propres.filter((c) => c.classement === "non_classable").length,
			taux: tauxFaussesAlertes(propres),
			raisons,
		});
	}

	console.log("Mesure du taux de fausses alertes — agents CPU (chantier 4)");
	console.log(`Fenêtre ${FENETRE.debut} → ${FENETRE.fin} · rejeu tous les ${PAS_REJEU_JOURS} j (${rejeux} instants, calés depuis la fin)`);
	console.log(`Vérité terrain : ${veriteTerrain.size} organisation(s) du corpus résolue(s), ${incidentsNonResolus} incident(s) non résolu(s) · corpus couvert jusqu'au ${new Date(maxDateCorpus).toISOString().slice(0, 10)}`);
	console.log(`Seuils : organisation ${SEUIL_EVENEMENTS_RECENTS} faits/${JOURS_ORG} j après ${FENETRE_ABSENCE_JOURS} j d'absence, ≥${HISTORIQUE_ANCIEN_MIN} fait antérieur et ${SOURCES_DISTINCTES_MIN} sources distinctes · secteur |z|>${SEUIL_Z}, n≥${EFFECTIF_MIN}, ≥${OBSERVES_MIN_SECTEUR} faits · source ${SEUIL_SILENCE_JOURS} j de silence après ${FENETRE_CADENCE_JOURS} j de cadence\n`);

	for (const [agent, s] of parAgent) {
		console.log(`  ${agent.padEnd(26)} émises ${String(s.emises).padStart(3)} · vraies ${String(s.vraies).padStart(3)} · fausses ${String(s.fausses).padStart(3)} · non classables ${String(s.nonClassables).padStart(3)} · taux ${s.taux === null ? "—" : `${s.taux} %`}`);
		for (const [raison, n] of Object.entries(s.raisons)) {
			console.log(`    ${raison.padEnd(28)} ${n}`);
		}
	}

	const taux = tauxFaussesAlertes(classees);
	const vraies = classees.filter((c) => c.classement === "vraie").length;
	const fausses = classees.filter((c) => c.classement === "fausse").length;
	const nonClassables = classees.length - vraies - fausses;
	console.log(`\nTotal : ${classees.length} alerte(s) dédupliquée(s), ${vraies} vraie(s), ${fausses} fausse(s), ${nonClassables} non classable(s) · taux ${taux === null ? "non calculable" : `${taux} %`} sur ${classees.length - nonClassables} classable(s)`);
	for (const e of classees.filter((c) => c.classement === "fausse").slice(0, 12)) {
		console.log(`  FAUSSE [${e.agent}] ${e.instant} ${e.cle} (${e.raison}) — ${e.motif}`);
	}
	console.log(`Diagnostic source au ${diagnosticSources.instant} : ${diagnosticSources.sourcesAvecEvenementsRecents} source(s) avec faits récents, ${diagnosticSources.sourcesQuotidiennesSurCadence} avec une cadence quotidienne sur ${FENETRE_CADENCE_JOURS} j — sans cadence, aucun silence n'est mesurable.`);
	// Comptée avant l'écriture : le JSON publié porte l'état de la base qui a
	// produit ses taux, pas un volume relevé après coup.
	const base = await compterBase();
	console.log(`Base au rejeu : ${base.evenements} événements, ${base.organisations} organisations, ${base.sources} sources · derniers faits observés le ${base.derniereObservation ?? "inconnu"}`);
	if (classees.length === 0) {
		console.log("Aucune alerte émise sur la fenêtre : les seuils en place ne tirent pas sur cette base — taux non calculable par absence, pas par qualité.");
	}

	if (SORTIE_JSON) {
		writeFileSync(SORTIE_JSON, `${JSON.stringify({
			dateMesure: new Date().toISOString().slice(0, 10),
			commande: COMMANDE_REJEU,
			base,
			fenetre: FENETRE,
			pasJours: PAS_REJEU_JOURS,
			rejeux,
			toleranceJours: TOLERANCE_JOURS,
			seuils: {
				organisation: { evenements: SEUIL_EVENEMENTS_RECENTS, fenetreJours: JOURS_ORG, absenceJours: FENETRE_ABSENCE_JOURS, historiqueAncienMin: HISTORIQUE_ANCIEN_MIN, sourcesDistinctesMin: SOURCES_DISTINCTES_MIN },
				secteur: { z: SEUIL_Z, effectifMin: EFFECTIF_MIN, observesMin: OBSERVES_MIN_SECTEUR, fenetreJours: JOURS_SECTEUR, referenceJours: FENETRE_REFERENCE_JOURS },
				source: { silenceJours: SEUIL_SILENCE_JOURS, cadenceJours: FENETRE_CADENCE_JOURS, horizonRepriseJours: HORIZON_REPRISE_JOURS },
			},
			couvertureCorpus: {
				maxDatePublique: new Date(maxDateCorpus).toISOString().slice(0, 10),
				couvreFenetre: fenetre.fin <= maxDateCorpus,
			},
			veriteTerrain: { organisations: veriteTerrain.size, incidentsNonResolus, secteurs: datesCorpusSecteur.size },
			diagnosticSources,
			total: { emises: classees.length, vraies, fausses, nonClassables, classables: classees.length - nonClassables, tauxFaussesAlertes: taux },
			parAgent: Object.fromEntries(parAgent),
			alertes: classees,
		}, null, 2)}\n`, "utf8");
		console.log(`\nmesure publiée : ${SORTIE_JSON}`);
	}

	await closePools();
}

// L'import par un test ne doit ni connecter ni écrire.
const estPrincipal = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (estPrincipal) await main();
