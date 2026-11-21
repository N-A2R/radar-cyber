/**
 * Mesure de couverture — chantier 6 du programme (`docs/programme.md`).
 *
 * Répond à la seule question qui justifie le projet :
 *
 *   Sur les incidents publics de Nouvelle-Aquitaine des douze derniers mois,
 *   quelle part le radar a-t-il vue, et à quelle date ?
 *
 * Méthode, volontairement brutale :
 *
 *  1. **On ne mesure pas un texte, on mesure une collecte.** Chaque incident du
 *     corpus est transformé en événement normalisé, exactement comme s'il avait
 *     été publié le jour de sa parution, puis passé à la porte d'admission du
 *     contrat (`admitEvent`) — la même que celle de l'ingestion.
 *  2. **On interroge le moteur pour de vrai.** Le texte de l'incident traverse
 *     le gazetteer sur les 34 330 organisations réelles. Pas de simulation.
 *  3. **Tout refus est motivé.** « Pas vu » n'est jamais une case vide : c'est
 *     une des quatre raisons connues (`pas_collecte`, `pas_admis`,
 *     `pas_rattache`, `hors_fenetre`). Un chiffre sans motif n'est pas publiable.
 *
 *   tsx scripts/mesure-couverture.mts                 # affiche
 *   tsx scripts/mesure-couverture.mts --json=out.json # publie dans un fichier
 *   tsx scripts/mesure-couverture.mts --cout              # + coût par phase
 *
 * Le résultat est destiné à être committé : c'est la mesure du projet, pas un
 * rapport interne. Voir docs/mesure-couverture.md.
 * Le JSON publié et la sortie console citent le SHA-256 du corpus consolidé
 * (`bench/corpus/HASH`, calculé par `scripts/corpus-hash.mts`).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { admitEvent } from "../apps/api/src/contract/admit.js";
import { getGazetteer } from "../apps/api/src/collectors/org-gazetteer.js";
import { preparerGazetteer, designateOrganization } from "../apps/api/src/collectors/relevance.js";
import { resoudre } from "../apps/api/src/match/gazetteer.js";
import { SECTEURS_ATTENDUS, verifierPubliabilite } from "../apps/api/src/analyse/publiabilite.js";
import { lireHashCorpus } from "./corpus-hash.mjs";

const argv = process.argv.slice(2);
const COUT = argv.includes("--cout");
const SORTIE_JSON = argv.find((a) => a.startsWith("--json="))?.split("=")[1] ?? null;
const CORPUS = fileURLToPath(new URL("../bench/fixtures/corpus-reference-na.json", import.meta.url));

/** Fenêtre mesurée : les douze derniers mois clos du corpus. */
const FENETRE = { debut: "2025-11-01", fin: "2026-10-31" };

type Incident = {
	id: string;
	entite: string;
	entiteType: string;
	departement: string | null;
	commune: string | null;
	codeCommune: string | null;
	dateIncident: string;
	datePublique: string;
	type: string;
	resume: string;
	confiance: string;
	preuve?: { url?: string; editeur?: string };
};

type Motif = "vu" | "pas_admis" | "pas_rattache" | "hors_fenetre";

/**
 * Deuxième niveau de diagnostic pour les non-rattachés. Un chiffre de couverture
 * ne sert à rien s'il ne dit pas *où* est le problème : dans le référentiel ou
 * dans le moteur.
 */
type Cause = "au_referentiel_mais_non_reconnu" | "absent_du_referentiel" | null;

/**
 * Niveau du rattachement pour un « vu ».
 *
 * Un incident « Intermarché de Gradignan » rattaché à la commune de La Teste
 * de Buch comptait comme vu : le taux s'en trouvait gonflé par des
 * rattachements qui ne désignent pas la bonne organisation. Le taux brut ne
 * vaut que si l'on publie, à côté, combien de ces rattachements sont au bon
 * niveau.
 */
type Qualite = "exacte" | "partielle" | "hors_sujet";

/** Mots qui ne distinguent aucune organisation : ils ne comptent pas. */
const MOTS_GENERIQUES = new Set([
	"mairie", "ville", "commune", "conseil", "general", "regionale", "region",
	"departement", "departemental", "office", "national", "nationale", "federation",
	"association", "groupement", "societe", "groupe", "service", "services",
	"magasin", "magasins", "supermarche", "supermarches", "hypermarche", "enseigne",
	"etablissement", "etablissements", "centre", "centres", "reseau", "editeur",
	"logiciel", "plateforme", "france", "francais", "francaise", "des", "les", "aux",
]);

/** Minuscules, sans accents, ponctuation réduite à des espaces. */
function normaliserPhrase(texte: string): string {
	return texte
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function motsDiscriminants(texte: string): string[] {
	return texte
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((mot) => mot.length >= 4 && !MOTS_GENERIQUES.has(mot));
}

/**
 * Compare l'organisation attendue et celle qui a été trouvée.
 *
 * - `exacte` : le nom trouvé est celui attendu (ou son début) ;
 * - `partielle` : le nom trouvé est une enseigne citée dans l'attendu, mais pas
 *   l'établissement — « Hyper U » pour « Supermarchés des Deux-Sèvres (Hyper U
 *   Parthenay) » ;
 * - `hors_sujet` : aucun mot discriminant commun (« la teste de buch » pour
 *   « Intermarché de Gradignan, Parempuyre, Macau »).
 */
function qualiteRattachement(attendu: string, trouve: string): Qualite | null {
	if (!trouve) return null;
	const a = motsDiscriminants(attendu);
	const t = motsDiscriminants(trouve);
	if (t.length === 0) return "partielle";
	const toutPresents = t.every((mot) => a.includes(mot));
	if (!toutPresents) {
		// Le nom attendu peut être collé (« FFRandonnée ») quand le trouvé est
		// développé (« Fédération française de la randonnée pédestre ») : le
		// sigle dit que c'est la même organisation. Faux positif de mesure, pas
		// de rattachement.
		const sigle = t.map((mot) => mot[0]).join("");
		const sigleReconnu = sigle.length >= 3 && a.some((mot) => mot.startsWith(sigle) || sigle.startsWith(mot));
		return sigleReconnu ? "partielle" : "hors_sujet";
	}
	// La phrase trouvée préfixe celle de l'attendu : « ville de gradignan »
	// pour « Ville de Gradignan — police municipale ». Les mots en plus
	// décrivent l'incident, pas une autre organisation.
	const prefixe = a.slice(0, t.length).every((mot, i) => mot === t[i]);
	if (prefixe || t.length === a.length) return "exacte";
	return "partielle";
}

type Resultat = {
	id: string;
	entite: string;
	datePublique: string;
	organismeAttendu: string;
	motif: Motif;
	/** Délai entre publication et rattachement. `null` quand non vu. */
	delaiJours: number | null;
	organismeTrouve: string | null;
	/** Ce que la porte d'admission a objecté, quand elle a refusé. */
	refusAdmission: string[] | null;
	/** Ce que le moteur a répondu : raison et alias. */
	raisonMoteur: string | null;
	cause: Cause;
	/** Niveau du rattachement pour un « vu » : exacte, partielle, hors_sujet. */
	qualite: Qualite | null;
};

function hashKey(value: string): string {
	return createHash("sha256").update(value).digest("base64url").slice(0, 24);
}

/**
 * Les types du corpus ramenés aux familles du contrat (`FAMILIES`).
 *
 * Le corpus décrit des incidents ; le contrat décrit des sources. Le pont est
 * imparfait et on l'assume : une attaque par déni de service n'a pas de famille
 * propre côté collecte, elle entre en `cti` (signal de renseignement). Ce qui
 * compte, c'est qu'aucun incident ne soit refusé pour une raison qui n'a rien
 * voir avec sa nature — c'était le cas au premier passage, où `ddos` et
 * `intrusion` n'existaient pas au contrat et 3 incidents étaient « non admis »
 * pour une erreur de notre mesure, pas du radar.
 */
function familleDe(type: string): string {
	switch (type) {
		case "ransomware":
			return "ransomware";
		case "fuite":
			return "leaks";
		case "phishing":
			return "phishing";
		case "ddos":
			return "cti";
		case "compromission":
		case "defacement":
			return "cti";
		default:
			return "presse_cyber";
	}
}

function joursEntre(depuis: string, jusqua: string): number {
	const a = Date.parse(`${depuis}T00:00:00Z`);
	const b = Date.parse(`${jusqua}T00:00:00Z`);
	return Math.round((b - a) / 86_400_000);
}

type Phase = "collecte" | "index" | "moteur" | "sondes" | "mesure";
const phases: Record<Phase, number> = { collecte: 0, index: 0, moteur: 0, sondes: 0, mesure: 0 };

/** Instruments désactivés par défaut : le chemin normal reste identique. */
function chrono<T>(phase: Phase, fn: () => T): T {
	if (!COUT) return fn();
	const debut = performance.now();
	try {
		return fn();
	} finally {
		phases[phase] += performance.now() - debut;
	}
}

async function chronoAsync<T>(phase: Phase, fn: () => Promise<T>): Promise<T> {
	if (!COUT) return fn();
	const debut = performance.now();
	try {
		return await fn();
	} finally {
		phases[phase] += performance.now() - debut;
	}
}

function resourceSnapshot() {
	const u = process.resourceUsage();
	return {
		cpuMs: (u.userCPUTime + u.systemCPUTime) / 1000,
		maxRssKib: u.maxRSS,
		rssKib: process.memoryUsage().rss / 1024,
		fsRead: u.fsRead,
		fsWrite: u.fsWrite,
		minorPageFault: u.minorPageFault,
		majorPageFault: u.majorPageFault,
	};
}

async function main(): Promise<void> {
	const debutTotal = performance.now();
	const ressourcesAvant = COUT ? resourceSnapshot() : null;
	const corpus = await chronoAsync("collecte", async () =>
		JSON.parse(readFileSync(CORPUS, "utf8")) as {
			meta: { fenetre?: [string, string] };
			incidents: Incident[];
		},
	);
	const gaz = await chronoAsync("index", () => getGazetteer());
	await chronoAsync("index", () => preparerGazetteer());
	const { rows: orgs } = await chronoAsync("index", () =>
		query<{ n: string }>("SELECT count(*)::text AS n FROM org"),
	);
	const organismes = Number(orgs[0]?.n ?? 0);

	const resultats: Resultat[] = [];
	const dateMesure = new Date().toISOString().slice(0, 10);
	const sha256Corpus = lireHashCorpus();

	/**
	 * L'organisation citée existe-t-elle au référentiel ?
	 *
	 * Vérifié par requête, pas par une heuristique de jetons : « Ministère de
	 * l'Intérieur » trouvait « …DU MINISTERE DE L'INTERIEUR ET DE L'AMENAGEMENT
	 * DU TERRITOIRE », un comité départemental, et était donc classé « présent
	 * mais non reconnu » alors qu'il est absent.
	 *
	 * Un nom de plusieurs mots doit être le début du nom de l'organisation ;
	 * un sigle (un seul mot) peut apparaître n'importe où — « ERNAT » dans
	 * « Études Réalisations Négoce Assistance Technique (ERNAT) ».
	 */
	const existeAuReferentiel = async (entite: string): Promise<boolean> => {
		const principal = (entite.split(/[(—–]/)[0] ?? entite).trim();
		const mots = normaliserPhrase(principal)
			.split(" ")
			.filter((m) => m.length > 1 && !["de", "du", "des", "la", "le", "les", "et"].includes(m));
		if (mots.length === 0) return false;
		// Sonde : le mot le plus long, pour que l'index trigramme fasse le tri.
		const sonde = mots.reduce((a, b) => (b.length > a.length ? b : a));
		const { rows } = await query<{ name: string }>("SELECT name FROM org WHERE name ILIKE $1 LIMIT 300", [
			`%${sonde}%`,
		]);
		const cible = mots.join(" ");
		return rows.some((o) => {
			const nom = normaliserPhrase(o.name);
			if (mots.length === 1) return nom.split(" ").includes(cible);
			return nom === cible || nom.startsWith(`${cible} `);
		});
	};

	for (const incident of corpus.incidents) {
		const dansLaFenetre =
			incident.datePublique >= FENETRE.debut && incident.datePublique <= FENETRE.fin;

		// 1. Admettrait-on cet incident s'il arrivait aujourd'hui ?
		const evt = chrono("collecte", () => ({
			dedupKey: `feed:mesure:${hashKey(incident.preuve?.url ?? incident.id)}`,
			family: familleDe(incident.type),
			assertionType: "third_party_claim",
			title: `${incident.entite} — ${incident.type}`,
			summary: incident.resume,
			severity: 3,
			confidence: "C3",
			sourceId: "mesure-corpus",
			sourceUrl: incident.preuve?.url ?? null,
			observedAt: incident.datePublique,
		}));
		const admission = chrono("collecte", () =>
			admitEvent(evt as unknown as Record<string, unknown>),
		);
		const texte = `${incident.entite} ${incident.resume}`;
		// Le moteur de production, pas le gazetteer brut : `resoudre` ignore
		// les rôles institutionnels et les communes, et sous-estimait donc la
		// couverture réelle (5/15 mesuré contre 9/20 par le moteur qui tourne).
		const match = chrono("moteur", () => designateOrganization(texte));

		let motif: Motif;
		if (!dansLaFenetre) motif = "hors_fenetre";
		else if (!admission.ok) motif = "pas_admis";
		else if (!match || !match.orgId) motif = "pas_rattache";
		else motif = "vu";

		const cause: Cause =
			motif === "pas_rattache"
				? (await chronoAsync("sondes", () => existeAuReferentiel(incident.entite)))
					? "au_referentiel_mais_non_reconnu"
					: "absent_du_referentiel"
				: null;

		const qualite =
			motif === "vu"
				? chrono("mesure", () =>
						qualiteRattachement(incident.entite, match?.explication?.alias ?? ""),
					)
				: null;
		resultats.push({
			id: incident.id,
			entite: incident.entite,
			datePublique: incident.datePublique,
			organismeAttendu: incident.entite,
			motif,
			// Le délai n'est PAS mesurable ici : le corpus est rejoué contre le
			// moteur, il n'est pas ingéré. La formule précédente multipliait par
			// zéro et publiait donc un délai médian de 0 jour — un chiffre faux
			// qui avait l'air d'une mesure. Le délai réel se mesure sur le flux
			// collecté (`scripts/mesure-delai.mts`), pas sur une simulation.
			delaiJours: null,
			organismeTrouve: match?.explication?.alias ?? null,
			refusAdmission: admission.ok ? null : (admission.rejections as string[]),
			raisonMoteur: match?.explication?.motif ?? null,
			cause,
			qualite,
		});
	}
	const apresBoucle = performance.now();

	const dansFenetre = resultats.filter((r) => r.motif !== "hors_fenetre");
	const vus = dansFenetre.filter((r) => r.motif === "vu");
	const parMotif = {
		vu: vus.length,
		pas_admis: dansFenetre.filter((r) => r.motif === "pas_admis").length,
		pas_rattache: dansFenetre.filter((r) => r.motif === "pas_rattache").length,
	};
	const parCause = {
		absent_du_referentiel: dansFenetre.filter((r) => r.cause === "absent_du_referentiel").length,
		au_referentiel_mais_non_reconnu: dansFenetre.filter(
			(r) => r.cause === "au_referentiel_mais_non_reconnu",
		).length,
	};
	// Qualité du rattachement : un « vu » qui désigne une autre organisation
	// n'est pas une couverture, c'est un faux positif. On publie les deux
	// chiffres côte à côte plutôt que de choisir le flatteur.
	const parQualite = {
		exacte: vus.filter((r) => r.qualite === "exacte").length,
		partielle: vus.filter((r) => r.qualite === "partielle").length,
		hors_sujet: vus.filter((r) => r.qualite === "hors_sujet").length,
	};
	const vusDefendables = parQualite.exacte + parQualite.partielle;

	// Le référentiel entreprises : publié à côté du taux, jamais caché.
	const parSecteur = Object.fromEntries(
		(await query<{ secteur: string; n: string }>(
			`SELECT COALESCE(sector, kind) AS secteur, count(*)::text AS n
			   FROM org WHERE kind = 'entreprise' GROUP BY 1 ORDER BY 2 DESC`,
		)).rows.map((r) => [r.secteur, Number(r.n)]),
	);
	const publication = verifierPubliabilite(parSecteur);
	const listeSecteurs = SECTEURS_ATTENDUS.map((s) => `'${s}'`).join(", ");
	const lignesHorsNumerique = await query<{ n: string }>(
		`SELECT count(*)::text AS n FROM org
		  WHERE kind = 'entreprise' AND sector IN (${listeSecteurs})`,
	);

	// Précision : parmi ce qu'on a rattaché, combien de fois au bon organisme ?
	// On compare la commune attendue au code INSEE de l'organisation trouvée.
	const attendus = new Map<string, string | null>();
	for (const incident of corpus.incidents) attendus.set(incident.id, incident.codeCommune);
	const { rows: orgsCommune } = await query<{ id: number; code: string | null }>(
		"SELECT id, entity_code AS code FROM org WHERE entity_source = 'referentiel-na'",
	);
	const codeParOrg = new Map(orgsCommune.map((r) => [Number(r.id), r.code]));

	const synthese = {
		dateMesure,
		fenetre: FENETRE,
		corpus: {
			sha256: sha256Corpus,
			incidents: corpus.incidents.length,
			dansLaFenetre: dansFenetre.length,
			horsFenetre: resultats.length - dansFenetre.length,
		},
		organisationsEnBase: organismes,
		couverture: {
			vus: parMotif.vu,
			qualite: parQualite,
			vusDefendables,
			total: dansFenetre.length,
			taux: dansFenetre.length === 0 ? 0 : Math.round((parMotif.vu / dansFenetre.length) * 1000) / 10,
			motifs: parMotif,
			// Où le travail doit porter : compléter le référentiel, ou corriger le
			// moteur. Une couverture de 33 % qui ne dit pas cela ne décide de rien.
			causes: parCause,
		},
		publication,
		referentielEntreprises: {
			// Lignes présentes dans les secteurs hors numérique ; le trou, s'il y
			// en a un, est publié à côté du taux, en clair.
			lignesHorsNumerique: Number(lignesHorsNumerique.rows[0]?.n ?? 0),
			parSecteur,
			avertissement:
				publication.raison ??
				`Le référentiel entreprises couvre ${Number(lignesHorsNumerique.rows[0]?.n ?? 0)} ligne(s) hors numérique (commerce, industrie, construction, agroalimentaire).`,
		},
		method: {
			porte: "contract/admit.ts — même admission que l'ingestion",
			moteur: "match/gazetteer.ts — 34 330 organisations réelles",
			limite:
				"La mesure suppose que la source publie le jour de l'incident et que le texte désigne l'organisation. Elle ne mesure pas le délai réel de collecte, seulement la capacité à reconnaître un incident publié.",
		},
		incidents: resultats,
	};

	console.log(`Mesure de couverture — ${dateMesure}`);
	console.log(`Fenêtre ${FENETRE.debut} → ${FENETRE.fin} · corpus ${corpus.incidents.length} incidents · SHA-256 ${sha256Corpus}`);
	console.log(`Organisations en base : ${organismes}\n`);

	for (const r of dansFenetre) {
		const marque = r.motif === "vu" ? "VU " : " — ";
		const detail =
			r.motif === "vu"
				? `→ ${r.organismeTrouve}`
				: r.motif === "pas_admis"
					? `refusé : ${(r.refusAdmission ?? []).join(", ")}`
					: `non rattaché — ${r.cause === "absent_du_referentiel" ? "absent du référentiel" : "présent mais non reconnu"} (${r.raisonMoteur})`;
		console.log(`  ${marque} ${r.id.padEnd(12)} ${r.entite.slice(0, 40).padEnd(40)} ${detail}`);
	}

	console.log(
		`\nCouverture : ${parMotif.vu}/${dansFenetre.length} (${synthese.couverture.taux} %)` +
			` · non admis ${parMotif.pas_admis} · non rattachés ${parMotif.pas_rattache}`,
	);
	if (!publication.publiable) console.log(`  ${publication.mention} : ${publication.raison}`);
	console.log(
		`  dont ${parCause.absent_du_referentiel} organisation(s) absente(s) du référentiel` +
			` et ${parCause.au_referentiel_mais_non_reconnu} présente(s) mais non reconnue(s) par le moteur`,
	);
	console.log(
		`Qualité du rattachement : ${parQualite.exacte} exacte(s), ${parQualite.partielle} partielle(s)` +
			`, ${parQualite.hors_sujet} hors sujet — ${vusDefendables}/${dansFenetre.length}` +
			` (${Math.round((vusDefendables / Math.max(1, dansFenetre.length)) * 1000) / 10} %) défendable(s)`,
	);
	console.log(
		`Référentiel entreprises : ${synthese.referentielEntreprises.lignesHorsNumerique} ligne(s) en agro/industrie/BTP/commerce`,
	);
	console.log("(trou publié à côté du taux, jamais masqué)");

	if (SORTIE_JSON) {
		writeFileSync(SORTIE_JSON, `${JSON.stringify(synthese, null, 2)}\n`, "utf8");
		console.log(`\nmesure publiée : ${SORTIE_JSON}`);
	}
	await closePools();
	if (COUT && ressourcesAvant) {
		const ressourcesApres = resourceSnapshot();
		const wallMs = performance.now() - debutTotal;
		phases.mesure = performance.now() - apresBoucle;
		const arrondi = (n: number) => Math.round(n * 10) / 10;
		console.log(
			`COUT ${JSON.stringify({
				corpus: corpus.incidents.length,
				dansLaFenetre: dansFenetre.length,
				wallMs: arrondi(wallMs),
				phasesMs: {
					collecte: arrondi(phases.collecte),
					rattachement: arrondi(phases.index + phases.moteur + phases.sondes),
					mesure: arrondi(phases.mesure),
				},
				sousPhasesRattachementMs: {
					index: arrondi(phases.index),
					moteur: arrondi(phases.moteur),
					sondesReferentiel: arrondi(phases.sondes),
				},
				cpuMs: arrondi(ressourcesApres.cpuMs - ressourcesAvant.cpuMs),
				maxRssKib: ressourcesApres.maxRssKib,
				rssKibFinal: arrondi(ressourcesApres.rssKib),
				fsReadBytes: ressourcesApres.fsRead - ressourcesAvant.fsRead,
				fsWriteBytes: ressourcesApres.fsWrite - ressourcesAvant.fsWrite,
				minorPageFaults: ressourcesApres.minorPageFault - ressourcesAvant.minorPageFault,
				majorPageFaults: ressourcesApres.majorPageFault - ressourcesAvant.majorPageFault,
			})}`,
		);
	}
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
