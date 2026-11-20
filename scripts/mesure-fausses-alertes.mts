/**
 * Mesure du taux de fausses alertes des agents de rupture — chantier 10.
 *
 * La question : quand les trois agents tirent une alerte, combien de fois
 * n'y a-t-il rien derrière ? Les seuils des détecteurs sont marqués « non
 * mesuré, à calibrer » depuis leur écriture ; ce script est l'instrument de
 * ce calibrage, et la publication exige qu'il soit honnête même quand le
 * taux est mauvais.
 *
 * Méthode — rejeu historique :
 *   1. Vérité terrain : le corpus de référence (60 incidents publics vérifiés,
 *      `bench/fixtures/corpus-reference-na.json`). Chaque incident y porte une
 *      entité désignable et une date publique. Le moteur de rattachement réel
 *      (`designateOrganization`) résout l'entité en organisation : ce sont les
 *      seules alertes qu'on peut déclarer vraies.
 *   2. Rejeu : les agents tournent sur la base à des instants répartis tous les
 *      14 jours sur la fenêtre mesurée. `detecterRupturesDepuisBase(instant)`
 *      regarde vraiment la semaine de cet instant (le paramètre atteint le
 *      SQL depuis le chantier 10) — c'est un rejeu, pas une simulation du
 *      moteur : mêmes requêtes, mêmes seuils.
 *   3. Classement d'une alerte : vraie si son organisation est un incident du
 *      corpus dont la date publique tombe dans sa fenêtre de veille (35 j,
 *      couvre les 30 j de nouveauté comme les 7 j de rafale) ; fausse sinon,
 *      avec un motif : `bruit_bulletins` quand tous ses faits sont des
 *      bulletins de vulnérabilité (un CVE n'est pas un incident), sinon
 *      `aucun_incident_corpus` (rien de réel derrière).
 *   4. Déduplication : une situation qui dure est vue par plusieurs rejeux ;
 *      elle compte une fois (même agent, même organisation, faits qui se
 *      recoupent).
 *
 * Fenêtre ad hoc — rejouer une sous-fenêtre (fenêtre fraîche post-incident,
 * par exemple) :
 *
 *   tsx scripts/mesure-fausses-alertes.mts --depuis=2026-10-21 --jusqua=2026-11-20
 *
 *   --depuis/--jusqua remplacent la fenêtre annuelle du chantier 10 ; --pas=N
 *   resserre l'échantillonnage (14 j par défaut). Les instants sont alors
 *   calés en arrière depuis la fin : un rejeu de fenêtre fraîche doit poser
 *   son dernier instant sur les faits les plus récents, sinon il rate le
 *   présent qu'il prétend observer. La vérité terrain s'élargit de la
 *   tolérance à gauche du début de fenêtre. Au-delà de la couverture du
 *   corpus, une alerte n'est plus classée « fausse » mais « non_classable » :
 *   la classer fausse faute de vérité terrain est exactement le piège
 *   consigné dans docs/fausses-alertes.md. La mesure rejoue aussi, agent par
 *   agent, les raisons structurelles du silence documentées dans cette même
 *   page — les confirmer ou les infirmer sur la base courante, jamais de
 *   mémoire.
 *
 *   tsx scripts/mesure-fausses-alertes.mts
 *   tsx scripts/mesure-fausses-alertes.mts --json=bench/results/fausses-alertes.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { closePools, query } from "../apps/api/src/db.js";
import {
	ANCIENNETE_REFERENTIEL_JOURS,
	detecterRupturesDepuisBase,
	ECART_GRAVITE,
	FENETRE_NOUVEAUTE_JOURS,
	FENETRE_RAFLE_JOURS,
	SEUIL_RAFLE_MIN,
} from "../apps/api/src/analyse/rupture.js";
import { mediane } from "../apps/api/src/analyse/mediane.js";
import { getGazetteer } from "../apps/api/src/collectors/org-gazetteer.js";
import { preparerGazetteer, designateOrganization } from "../apps/api/src/collectors/relevance.js";

const argv = process.argv.slice(2);
const SORTIE_JSON = argv.find((a) => a.startsWith("--json="))?.split("=")[1] ?? null;
const DEPUIS_ARG = argv.find((a) => a.startsWith("--depuis="))?.split("=")[1] ?? null;
const JUSQUA_ARG = argv.find((a) => a.startsWith("--jusqua="))?.split("=")[1] ?? null;
const CORPUS = fileURLToPath(new URL("../bench/fixtures/corpus-reference-na.json", import.meta.url));
/** Fenêtre par défaut : celle du chantier 10 (année de mesure). --depuis et
 * --jusqua la remplacent pour rejouer une sous-fenêtre ad hoc. */
const FENETRE = { debut: DEPUIS_ARG ?? "2025-11-01", fin: JUSQUA_ARG ?? "2026-10-31" };
/** Pas du rejeu : deux semaines, la granularité d'une revue élargie
 * (--pas=N pour resserrer l'échantillonnage d'une sous-fenêtre). */
const PAS_REJEU_JOURS = Number(argv.find((a) => a.startsWith("--pas="))?.split("=")[1] ?? 14);
/** Fenêtre de veille déclarée vraie : couvre les 30 j du détecteur de
 * nouveauté comme les 7 j de la rafale. */
const TOLERANCE_JOURS = 35;

const JOUR_MS = 86_400_000;

export type Fenetre = { debut: number; fin: number; pasJours: number };

/** Bornes de la fenêtre en ms : refuse un pas non positif et une fenêtre
 * inversée — un mauvais argument doit planter avant toute requête, pas
 * produire un rejeu vide publié comme mesure. */
export function parserFenetre(debut: string, fin: string, pasJours: number): Fenetre {
	const d = Date.parse(`${debut}T00:00:00Z`);
	const f = Date.parse(`${fin}T23:59:59Z`);
	if (!Number.isFinite(d) || !Number.isFinite(f)) {
		throw new Error(`fenêtre invalide : ${debut} → ${fin}`);
	}
	if (!(pasJours >= 1)) throw new Error(`pas de rejeu invalide : ${pasJours}`);
	if (f < d) throw new Error(`fenêtre inversée : ${debut} après ${fin}`);
	return { debut: d, fin: f, pasJours };
}

/** Instants du rejeu. Fenêtre annuelle par défaut : en avant depuis le début.
 * Sous-fenêtre ad hoc : en arrière depuis la fin — le dernier instant porte
 * sur les faits les plus récents de la fenêtre. */
export function genererInstants(fenetre: Fenetre, adHoc: boolean): number[] {
	const instants: number[] = [];
	if (adHoc) {
		for (let t = fenetre.fin; t >= fenetre.debut; t -= fenetre.pasJours * JOUR_MS) instants.push(t);
	} else {
		for (let t = fenetre.debut; t <= fenetre.fin; t += fenetre.pasJours * JOUR_MS) instants.push(t);
	}
	return instants;
}

/** Une alerte n'est classable que si la vérité terrain peut la déclarer vraie :
 * au-delà de la couverture du corpus écartée de la tolérance de veille, la
 * classer « fausse » reviendrait à inventer un verdict faute de vérité
 * terrain — le piège consigné dans docs/fausses-alertes.md. */
export function estClassable(instant: number, maxDateCorpus: number, toleranceJours: number): boolean {
	return instant <= maxDateCorpus + toleranceJours * JOUR_MS;
}

// ---------------------------------------------------------------------------
// Vérification des raisons structurelles du silence (docs/fausses-alertes.md)
// ---------------------------------------------------------------------------

type VerificationRaisons = {
	nouvelleOrganisation: {
		candidats30j: number;
		tireraient: number;
		maxAgeReferentielJours: number | null;
		referentielDepuisMin: string | null;
		referentielDepuisMax: string | null;
		seuilJours: number;
		confirme: boolean;
	};
	rafale: {
		combosAuSeuil: Array<{
			dept: string;
			family: string;
			recents: number;
			medianeHistorique: number | null;
			tirerait: boolean;
		}>;
		confirme: boolean;
	};
	changementNature: {
		candidats: number;
		faitsVuln: number;
		confirme: boolean;
	};
};

/**
 * Rejoue sur la base courante les raisons structurelles documentées dans
 * docs/fausses-alertes.md : les confirmer ou les infirmer sur données, jamais
 * de mémoire. Utile quand aucun agent n'a tiré — elle explique le silence,
 * agent par agent, à l'instant le plus récent de la fenêtre.
 *
 * Les requêtes reprennent celles de `detecterRupturesDepuisBase` avec ses
 * propres constantes (importées d'ici rupture.ts) : c'est un audit du
 * détecteur, pas une réimplémentation de ses seuils.
 */
async function verifierRaisonsStructurelles(instants: readonly number[]): Promise<VerificationRaisons> {
	const instantRecent = new Date(Math.max(...instants)).toISOString();

	// 1. nouvelle-organisation : l'âge au référentiel est approché par
	//    org.created_at (chargement en bloc). Combien d'organisations
	//    candidates (premier fait dans les 30 j) auraient un created_at assez
	//    vieux pour franchir les 180 j, et quel est leur âge maximum.
	const nova = await query<{ candidats: number; tireraient: number; maxAge: number | null }>(
		`WITH c AS (
		   SELECT o.id, o.created_at
		     FROM org o
		     JOIN (SELECT org_id, min(observed_at) AS premiere FROM event GROUP BY org_id) p
		       ON p.org_id = o.id
		    WHERE p.premiere >= $1::timestamptz - make_interval(days => $2)
		 )
		 SELECT count(*)::int AS candidats,
		        count(*) FILTER (WHERE created_at <= $1::timestamptz - make_interval(days => $3))::int AS tireraient,
		        max(extract(epoch FROM ($1::timestamptz - created_at)) / 86400.0)::float8 AS "maxAge"
		   FROM c`,
		[instantRecent, FENETRE_NOUVEAUTE_JOURS, ANCIENNETE_REFERENTIEL_JOURS],
	);
	const bornes = await query<{ min: string | null; max: string | null }>(
		`SELECT min(created_at)::text AS min, max(created_at)::text AS max FROM org`,
	);

	// 2. rafale : combos département × famille atteignant le seuil de faits sur
	//    la dernière fenêtre ; l'historique et le test « strictement plus du
	//    double de la médiane » sont ceux du détecteur.
	const combos = await query<{ dept: string; family: string; recents: number }>(
		`SELECT o.dept, e.family, count(*)::int AS recents
		   FROM event e JOIN org o ON o.id = e.org_id
		  WHERE e.observed_at >= $1::timestamptz - make_interval(days => $2) AND o.dept IS NOT NULL
		  GROUP BY o.dept, e.family
		 HAVING count(*) >= $3`,
		[instantRecent, FENETRE_RAFLE_JOURS, SEUIL_RAFLE_MIN],
	);
	const combosAuSeuil: VerificationRaisons["rafale"]["combosAuSeuil"] = [];
	for (const c of combos.rows) {
		const hist = await query<{ n: number }>(
			`SELECT count(*)::int AS n
			   FROM event e JOIN org o ON o.id = e.org_id
			  WHERE o.dept = $1 AND e.family = $2
			    AND e.observed_at < $3::timestamptz - make_interval(days => $4)
			  GROUP BY width_bucket(
			           extract(epoch FROM ($3::timestamptz - e.observed_at)),
			           extract(epoch FROM make_interval(days => $4)),
			           extract(epoch FROM make_interval(days => $4)) * 13, 12)`,
			[c.dept, c.family, instantRecent, FENETRE_RAFLE_JOURS],
		);
		const med = mediane(hist.rows.map((h) => h.n));
		combosAuSeuil.push({
			dept: c.dept,
			family: c.family,
			recents: c.recents,
			medianeHistorique: med,
			tirerait: med !== null && c.recents > 2 * med,
		});
	}

	// 3. changement-nature : la requête des candidats du détecteur, sans
	//    paramètre temporel — elle porte sur le dernier fait de chaque
	//    organisation, quelle que soit sa date.
	const candidats = await query<{ n: number }>(
		`WITH dernier AS (
		   SELECT DISTINCT ON (e.org_id)
		          e.org_id, e.id, e.family, e.severity, e.observed_at
		     FROM event e
		    WHERE e.org_id IS NOT NULL AND e.severity IS NOT NULL
		    ORDER BY e.org_id, e.observed_at DESC, e.id DESC
		 )
		 SELECT count(*)::int AS n
		   FROM dernier d
		   JOIN (SELECT h.org_id, max(h.severity) AS max_prev
		           FROM event h
		           JOIN dernier d2 ON d2.org_id = h.org_id
		                  AND (h.observed_at < d2.observed_at
		                       OR (h.observed_at = d2.observed_at AND h.id < d2.id))
		          WHERE h.severity IS NOT NULL
		          GROUP BY h.org_id) h ON h.org_id = d.org_id
		  WHERE NOT EXISTS (SELECT 1 FROM event e2
		                     WHERE e2.org_id = d.org_id AND e2.family = d.family
		                       AND (e2.observed_at < d.observed_at
		                            OR (e2.observed_at = d.observed_at AND e2.id < d.id)))
		    AND d.severity >= h.max_prev + $1`,
		[ECART_GRAVITE],
	);
	const vuln = await query<{ n: number }>(
		`SELECT count(*)::int AS n FROM event WHERE family = 'vuln'`,
	);

	const novaRow = nova.rows[0];
	const candidatsRow = candidats.rows[0];
	return {
		nouvelleOrganisation: {
			candidats30j: novaRow?.candidats ?? 0,
			tireraient: novaRow?.tireraient ?? 0,
			maxAgeReferentielJours: novaRow?.maxAge ?? null,
			referentielDepuisMin: bornes.rows[0]?.min ?? null,
			referentielDepuisMax: bornes.rows[0]?.max ?? null,
			seuilJours: ANCIENNETE_REFERENTIEL_JOURS,
			confirme: (novaRow?.tireraient ?? 0) === 0,
		},
		rafale: {
			combosAuSeuil,
			confirme: combosAuSeuil.every((c) => !c.tirerait),
		},
		changementNature: {
			candidats: candidatsRow?.n ?? 0,
			faitsVuln: vuln.rows[0]?.n ?? 0,
			confirme: (candidatsRow?.n ?? 0) === 0,
		},
	};
}

async function main(): Promise<void> {
	const corpus = JSON.parse(readFileSync(CORPUS, "utf8")) as {
		incidents: Array<{
			id: string;
			entite: string;
			resume: string;
			datePublique: string;
			entiteType: string;
		}>;
	};

	await getGazetteer();
	await preparerGazetteer();

	const fenetre = parserFenetre(FENETRE.debut, FENETRE.fin, PAS_REJEU_JOURS);
	const adHoc = DEPUIS_ARG !== null || JUSQUA_ARG !== null;

	// Couverture du corpus : au-delà de sa dernière date publique, la vérité
	// terrain n'existe plus — les alertes y deviennent non classables.
	const maxDateCorpus = Math.max(
		...corpus.incidents.map((i) => Date.parse(`${i.datePublique}T00:00:00Z`)),
	);

	// Vérité terrain : organisation → dates publiques des incidents du corpus.
	// Sous-fenêtre ad hoc : le début s'élargit de la tolérance de veille — un
	// incident juste avant la fenêtre peut rendre vraie une alerte du début de
	// fenêtre. Fenêtre par défaut : filtre inchangé (rejeu annuel du chantier 10).
	const debutVerite = adHoc ? fenetre.debut - TOLERANCE_JOURS * JOUR_MS : fenetre.debut;
	const veriteTerrain = new Map<number, number[]>();
	let resolutionRatee = 0;
	for (const incident of corpus.incidents) {
		const date = Date.parse(`${incident.datePublique}T00:00:00Z`);
		if (date < debutVerite || date > fenetre.fin) {
			continue;
		}
		const match = designateOrganization(`${incident.entite} ${incident.resume}`);
		if (!match || match.orgId === null) {
			resolutionRatee++;
			continue;
		}
		const dates = veriteTerrain.get(match.orgId) ?? [];
		dates.push(date);
		veriteTerrain.set(match.orgId, dates);
	}

	// Familles des faits cités par les alertes : pour séparer le bruit de
	// bulletins (CVE) d'un événement sans incident derrière.
	const familleDesFaits = async (ids: number[]): Promise<string[]> => {
		if (ids.length === 0) return [];
		const { rows } = await query<{ family: string }>(
			"SELECT family FROM event WHERE id = ANY($1)",
			[ids],
		);
		return rows.map((r) => r.family);
	};

	const dejavu = new Set<string>();
	const faitsDejaVus = new Map<string, Set<number>>();
	type AlerteClassee = {
		agent: string;
		orgId: number;
		instant: string;
		motif: string;
		classement: "vraie" | "fausse" | "non_classable";
		raison: string | null;
		faits: number[];
	};
	const classees: AlerteClassee[] = [];

	const instants = genererInstants(fenetre, adHoc);

	let rejeux = 0;
	for (const t of instants) {
		const alertes = await detecterRupturesDepuisBase(t);
		rejeux++;
		for (const a of alertes) {
			const ids = a.faits.map(Number);
			// Déduplication : une situation qui dure recoupe ses faits d'un
			// rejeu à l'autre — elle ne compte qu'une fois.
			const cle = `${a.agent}:${a.orgId}:${[...ids].sort((x, y) => x - y).join(",")}`;
			const vus = faitsDejaVus.get(`${a.agent}:${a.orgId}`);
			if (dejavu.has(cle) || (vus && ids.some((id) => vus.has(id)))) continue;
			dejavu.add(cle);
			faitsDejaVus.set(`${a.agent}:${a.orgId}`, new Set([...(vus ?? []), ...ids]));

			const dates = veriteTerrain.get(a.orgId) ?? [];
			const proches = dates.filter((d) => Math.abs(t - d) <= TOLERANCE_JOURS * JOUR_MS);
			const familles = await familleDesFaits(ids);
			const vraie = proches.length > 0;
			const classable = estClassable(t, maxDateCorpus, TOLERANCE_JOURS);
			classees.push({
				agent: a.agent,
				orgId: a.orgId,
				instant: new Date(t).toISOString().slice(0, 10),
				motif: a.motif,
				classement: vraie ? "vraie" : classable ? "fausse" : "non_classable",
				raison: vraie
					? null
					: !classable
						? "hors_couverture_corpus"
						: familles.length > 0 && familles.every((f) => f === "vuln")
							? "bruit_bulletins"
							: "aucun_incident_corpus",
				faits: ids,
			});
		}
	}

	const parAgent = new Map<string, { emises: number; vraies: number; fausses: number; nonClassables: number; raisons: Record<string, number> }>();
	for (const c of classees) {
		const s = parAgent.get(c.agent) ?? { emises: 0, vraies: 0, fausses: 0, nonClassables: 0, raisons: {} };
		s.emises++;
		if (c.classement === "vraie") s.vraies++;
		else if (c.classement === "fausse") {
			s.fausses++;
			s.raisons[c.raison ?? "?"] = (s.raisons[c.raison ?? "?"] ?? 0) + 1;
		} else s.nonClassables++;
		parAgent.set(c.agent, s);
	}

	const total = classees.length;
	const nonClassables = classees.filter((c) => c.classement === "non_classable").length;
	const classables = total - nonClassables;
	const vraies = classees.filter((c) => c.classement === "vraie").length;
	const fausses = classables - vraies;
	const taux = classables === 0 ? null : Math.round((fausses / classables) * 1000) / 10;

	console.log(`Mesure du taux de fausses alertes — agents de rupture (chantier 10)`);
	console.log(`Fenêtre ${FENETRE.debut} → ${FENETRE.fin} · rejeu tous les ${PAS_REJEU_JOURS} j (${rejeux} instants${adHoc ? ", calés depuis la fin de fenêtre" : ""})`);
	console.log(`Vérité terrain : ${veriteTerrain.size} organisation(s) du corpus résolues, ${resolutionRatee} incident(s) non résolus · corpus couvert jusqu'au ${new Date(maxDateCorpus).toISOString().slice(0, 10)}\n`);

	for (const [agent, s] of parAgent) {
		const classablesAgent = s.vraies + s.fausses;
		const tauxAgent = classablesAgent === 0 ? "—" : `${Math.round((s.fausses / classablesAgent) * 1000) / 10} %`;
		const supplement = s.nonClassables > 0 ? ` · non classables ${String(s.nonClassables).padStart(3)}` : "";
		console.log(`  ${agent.padEnd(22)} émises ${String(s.emises).padStart(4)} · vraies ${String(s.vraies).padStart(3)} · fausses ${String(s.fausses).padStart(3)}${supplement} · taux de fausses alertes ${tauxAgent}`);
		for (const [raison, n] of Object.entries(s.raisons)) {
			console.log(`    ${raison.padEnd(24)} ${n}`);
		}
	}

	const verif = await verifierRaisonsStructurelles(instants);
	const nova = verif.nouvelleOrganisation;
	console.log(`\nRaisons structurelles du silence (docs/fausses-alertes.md), rejouées sur la base courante :`);
	console.log(`  nouvelle-organisation  ${nova.confirme ? "confirmée" : "INFIRMÉE"} · ${nova.candidats30j} candidate(s) (premier fait dans les ${FENETRE_NOUVEAUTE_JOURS} j), ${nova.tireraient} franchiraient les ${nova.seuilJours} j · âge max du référentiel ${nova.maxAgeReferentielJours === null ? "—" : `${Math.round(nova.maxAgeReferentielJours)} j`} · référentiel chargé ${nova.referentielDepuisMin ?? "?"} → ${nova.referentielDepuisMax ?? "?"}`);
	console.log(`  rafale                 ${verif.rafale.confirme ? "confirmée" : "INFIRMÉE"} · ${verif.rafale.combosAuSeuil.length} combo(s) à ≥ ${SEUIL_RAFLE_MIN} faits/${FENETRE_RAFLE_JOURS} j sur la dernière fenêtre`);
	for (const c of verif.rafale.combosAuSeuil) {
		console.log(`    ${c.dept} × ${c.family} : ${c.recents} récents · médiane historique ${c.medianeHistorique === null ? "absente (aucun fait antérieur)" : c.medianeHistorique} → ${c.tirerait ? "TIRERAIT" : "sous le double de sa médiane"}`);
	}
	const nat = verif.changementNature;
	console.log(`  changement-nature      ${nat.confirme ? "confirmée" : "INFIRMÉE"} · ${nat.candidats} candidat(s) saut de ≥ ${ECART_GRAVITE} crans · ${nat.faitsVuln} faits vuln qui restent dans leur famille`);

	if (total === 0) {
		console.log("\nAucune alerte émise sur la fenêtre : rien à mesurer, et c'est une information (les seuils en place ne tirent pas sur cette base).");
	} else {
		console.log(`\nTotal : ${total} alerte(s) dédupliquée(s), ${vraies} vraie(s), ${fausses} fausse(s)${nonClassables > 0 ? `, ${nonClassables} non classable(s) hors couverture du corpus` : ""}, taux de fausses alertes ${taux === null ? "non calculable" : `${taux} %`} sur ${classables} classable(s)`);
		const exemples = classees.filter((c) => c.classement === "fausse").slice(0, 12);
		for (const e of exemples) {
			console.log(`  FAUSSE [${e.agent}] ${e.instant} org ${e.orgId} (${e.raison}) — ${e.motif}`);
		}
	}

	if (SORTIE_JSON) {
		writeFileSync(
			SORTIE_JSON,
			`${JSON.stringify({
				dateMesure: new Date().toISOString().slice(0, 10),
				fenetre: FENETRE,
				fenetreAdHoc: adHoc,
				rejeux,
				pasJours: PAS_REJEU_JOURS,
				toleranceJours: TOLERANCE_JOURS,
				couvertureCorpus: {
					maxDatePublique: new Date(maxDateCorpus).toISOString().slice(0, 10),
					// Couverture lue telle quelle : la fin de fenêtre est-elle
					// atteinte par la dernière date publique du corpus ? La
					// tolérance de veille reste l'affaire du classement des
					// alertes (estClassable), pas de cette affirmation.
					couvreFenetre: fenetre.fin <= maxDateCorpus,
				},
				veriteTerrain: { organisations: veriteTerrain.size, incidentsNonResolus: resolutionRatee },
				total: { emises: total, vraies, fausses, nonClassables, classables, tauxFaussesAlertes: taux },
				parAgent: Object.fromEntries(parAgent),
				verifRaisons: verif,
				alertes: classees,
			}, null, 2)}\n`,
			"utf8",
		);
		console.log(`\nmesure publiée : ${SORTIE_JSON}`);
	}

	await closePools();
}

// Point d'entrée : la mesure ne tourne que si le script est le processus
// principal — l'import par un test reste sans effet (ni connexion, ni écriture).
const estPrincipal =
	process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (estPrincipal) await main();
