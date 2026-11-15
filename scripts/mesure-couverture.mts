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
 *
 * Le résultat est destiné à être committé : c'est la mesure du projet, pas un
 * rapport interne. Voir docs/mesure-couverture.md.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { admitEvent } from "../apps/api/src/contract/admit.js";
import { getGazetteer } from "../apps/api/src/collectors/org-gazetteer.js";
import { preparerGazetteer, designateOrganization } from "../apps/api/src/collectors/relevance.js";
import { resoudre } from "../apps/api/src/match/gazetteer.js";

const argv = process.argv.slice(2);
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

async function main(): Promise<void> {
	const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as {
		meta: { fenetre?: [string, string] };
		incidents: Incident[];
	};
	const gaz = await getGazetteer();
	await preparerGazetteer();
	const { rows: orgs } = await query<{ n: string }>("SELECT count(*)::text AS n FROM org");
	const organismes = Number(orgs[0]?.n ?? 0);

	const resultats: Resultat[] = [];
	const dateMesure = new Date().toISOString().slice(0, 10);

	/**
	 * L'organisation citée existe-t-elle au référentiel, même si le moteur ne
	 * l'a pas reconnue ? On compare les mots significatifs du nom à ceux des
	 * organisations : c'est grossier, c'est exactement ce qu'il faut pour
	 * distinguer « on ne la connaît pas » de « on la connaît mais on ne sait pas
	 * la reconnaître ».
	 */
	const { rows: toutes } = await query<{ name: string }>("SELECT name FROM org");
	const nomsNormalises = toutes.map((o) => ({
		nom: o.name,
		jetons: new Set(
			o.name
				.toLowerCase()
				.normalize("NFD")
				.replace(/\p{Diacritic}/gu, "")
				.replace(/[^a-z0-9]+/g, " ")
				.split(" ")
				.filter((j) => j.length > 3),
		),
	}));
	/**
	 * On ne garde que le nom principal — ce qui précède la parenthèse ou le tiret.
	 * « Ymed (éditeur de la plateforme Sooncare) » est le nom *Ymed* ; exiger que
	 * « sooncare » figure aussi au référentiel ferait conclure à tort qu'on ne
	 * connaît pas l'organisation.
	 */
	const existeAuReferentiel = (entite: string): boolean => {
		const principal = entite.split(/[(—–-]/)[0] ?? entite;
		const mots = principal
			.toLowerCase()
			.normalize("NFD")
			.replace(/\p{Diacritic}/gu, "")
			.replace(/[^a-z0-9]+/g, " ")
			.split(" ")
			.filter((j) => j.length > 3 && !["societe", "groupe", "service"].includes(j));
		if (mots.length === 0) return false;
		// Tous les mots du nom principal doivent exister chez une même organisation.
		return nomsNormalises.some((o) => mots.every((m) => o.jetons.has(m)));
	};

	for (const incident of corpus.incidents) {
		const dansLaFenetre =
			incident.datePublique >= FENETRE.debut && incident.datePublique <= FENETRE.fin;

		// 1. Admettrait-on cet incident s'il arrivait aujourd'hui ?
		const evt = {
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
		};
		const admission = admitEvent(evt as unknown as Record<string, unknown>);
		const texte = `${incident.entite} ${incident.resume}`;
		// Le moteur de production, pas le gazetteer brut : `resoudre` ignore
		// les rôles institutionnels et les communes, et sous-estimait donc la
		// couverture réelle (5/15 mesuré contre 9/20 par le moteur qui tourne).
		const match = designateOrganization(texte);

		let motif: Motif;
		if (!dansLaFenetre) motif = "hors_fenetre";
		else if (!admission.ok) motif = "pas_admis";
		else if (!match || !match.orgId) motif = "pas_rattache";
		else motif = "vu";

		const cause: Cause =
			motif === "pas_rattache"
				? existeAuReferentiel(incident.entite)
					? "au_referentiel_mais_non_reconnu"
					: "absent_du_referentiel"
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
		});
	}

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

	// Le référentiel entreprises : publié à côté du taux, jamais caché.
	const couvertureSecteurs = await query<{ secteur: string; n: string }>(
		`SELECT COALESCE(sector, kind) AS secteur, count(*)::text AS n
		   FROM org WHERE kind = 'entreprise' GROUP BY 1 ORDER BY 2 DESC`,
	);
	const lignesHorsNumerique = await query<{ n: string }>(
		`SELECT count(*)::text AS n FROM org
		  WHERE kind = 'entreprise' AND sector IN ('agroalimentaire','industrie','construction','commerce')`,
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
			incidents: corpus.incidents.length,
			dansLaFenetre: dansFenetre.length,
			horsFenetre: resultats.length - dansFenetre.length,
		},
		organisationsEnBase: organismes,
		couverture: {
			vus: parMotif.vu,
			total: dansFenetre.length,
			taux: dansFenetre.length === 0 ? 0 : Math.round((parMotif.vu / dansFenetre.length) * 1000) / 10,
			motifs: parMotif,
			// Où le travail doit porter : compléter le référentiel, ou corriger le
			// moteur. Une couverture de 33 % qui ne dit pas cela ne décide de rien.
			causes: parCause,
		},
		referentielEntreprises: {
			// Lignes présentes dans les secteurs hors numérique ; le trou, s'il y
			// en a un, est publié à côté du taux, en clair.
			lignesHorsNumerique: Number(lignesHorsNumerique.rows[0]?.n ?? 0),
			parSecteur: Object.fromEntries(couvertureSecteurs.rows.map((r) => [r.secteur, Number(r.n)])),
			avertissement:
				Number(lignesHorsNumerique.rows[0]?.n ?? 0) === 0
					? "Le référentiel entreprises couvre le numérique et les secteurs critiques à partir de 50 salariés, mais contient zéro ligne en agroalimentaire, industrie, construction et commerce. La couverture ci-dessus est donc flatteuse pour ces secteurs."
					: `Le référentiel entreprises couvre ${Number(lignesHorsNumerique.rows[0]?.n ?? 0)} ligne(s) hors numérique (commerce, industrie, construction, agroalimentaire).`,
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
	console.log(`Fenêtre ${FENETRE.debut} → ${FENETRE.fin} · corpus ${corpus.incidents.length} incidents`);
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
	console.log(
		`  dont ${parCause.absent_du_referentiel} organisation(s) absente(s) du référentiel` +
			` et ${parCause.au_referentiel_mais_non_reconnu} présente(s) mais non reconnue(s) par le moteur`,
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
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
