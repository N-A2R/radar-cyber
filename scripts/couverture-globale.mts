/**
 * Couverture globale — porte de publication du chiffre.
 *
 * Calculer un taux ne suffit pas à le publier. Ce script applique avant toute
 * publication les trois seuils documentés dans `docs/seuils-couverture.md` :
 * corpus trop petit, référentiel trop troué, sources trop peu productives.
 * Quand un seuil échoue, le refus est explicite (`refus de publication : …`),
 * le code de sortie vaut 1 et aucun JSON n'est écrit — y compris avec
 * `--json=`, pour ne pas laisser un chiffre interdit traîner dans un fichier.
 *
 * Le taux publié une fois la porte franchie est un rejeu : les incidents du
 * corpus passent par la porte d'admission du contrat et par le gazetteer réel.
 * Il ne mesure ni le délai réel de collecte ni la qualité du rattachement
 * (`scripts/mesure-couverture.mts` reste la mesure détaillée).
 *
 *   tsx scripts/couverture-globale.mts
 *   tsx scripts/couverture-globale.mts --json=bench/results/couverture-globale.json
 *   tsx scripts/couverture-globale.mts --corpus=bench/fixtures/corpus-temoin-na.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { admitEvent } from "../apps/api/src/contract/admit.js";
import {
	designateOrganization,
	preparerGazetteer,
} from "../apps/api/src/collectors/relevance.js";
import {
	classerCouverture,
	MOTIFS_COUVERTURE,
	type FaitCouverture,
} from "../apps/api/src/analyse/couverture.js";
import {
	verifierPubliabilite,
	type VerdictPublication,
} from "../apps/api/src/analyse/publiabilite.js";

/** Mention exacte du refus : c'est elle que les lecteurs de la sortie cherchent. */
export const REFUS_PUBLICATION = "refus de publication";

/** Incidents dans la fenêtre, pas lignes brutes du fichier. */
export const SEUIL_CORPUS_MIN = 30;

/** Réutilise le seuil déjà défini dans `analyse/publiabilite.ts` (3 secteurs sur 4). */
export { SEUIL_SECTEURS_PUBLIABLES } from "../apps/api/src/analyse/publiabilite.js";

export const SEUIL_SOURCES_DISTINCTES_MIN = 5;
export const SEUIL_PART_SOURCE_MAX = 0.5;

export const FENETRE_DEFAUT = { debut: "2025-11-01", fin: "2026-10-31" };

const CORPUS_DEFAUT = fileURLToPath(
	new URL("../bench/fixtures/corpus-reference-na.json", import.meta.url),
);

export type Fenetre = { debut: string; fin: string };

export type IncidentCorpus = {
	id: string;
	entite: string;
	datePublique: string;
	resume?: string;
	type?: string;
	preuve?: { editeur?: string; url?: string };
};

export type CodeRefus =
	| "corpus_trop_petit"
	| "referentiel_trop_troue"
	| "sources_trop_peu_productives";

export type RaisonRefus = { code: CodeRefus; raison: string };

export type VerdictSeuils = {
	publiable: boolean;
	/** `null` quand le chiffre peut être publié. */
	mention: typeof REFUS_PUBLICATION | null;
	/** Toutes les raisons : un seul refus ne doit pas masquer le suivant. */
	refus: RaisonRefus[];
	corpus: { total: number; dansFenetre: number; fenetre: Fenetre };
	sources: { distinctes: number; partMax: number; parEditeur: Record<string, number> };
	referentiel: VerdictPublication;
};

export function incidentsDansFenetre(
	incidents: readonly IncidentCorpus[],
	fenetre: Fenetre,
): IncidentCorpus[] {
	return incidents.filter(
		(incident) => incident.datePublique >= fenetre.debut && incident.datePublique <= fenetre.fin,
	);
}

/** Une source = un `preuve.editeur`, insensible à la casse. Sans éditeur, pas de source. */
function sourcesDes(incidents: readonly IncidentCorpus[]): VerdictSeuils["sources"] {
	const parEditeur = new Map<string, number>();
	let avecEditeur = 0;
	for (const incident of incidents) {
		const editeur = incident.preuve?.editeur?.trim();
		if (!editeur) continue;
		avecEditeur++;
		const cle = editeur.toLowerCase();
		parEditeur.set(cle, (parEditeur.get(cle) ?? 0) + 1);
	}
	const partMax = avecEditeur === 0 ? 0 : Math.max(...parEditeur.values()) / avecEditeur;
	return {
		distinctes: parEditeur.size,
		partMax,
		parEditeur: Object.fromEntries([...parEditeur.entries()].sort((a, b) => b[1] - a[1])),
	};
}

/** Évalue les trois seuils à partir des seuls faits disponibles avant publication. */
export function evaluerSeuils(intrants: {
	incidents: readonly IncidentCorpus[];
	fenetre: Fenetre;
	parSecteur: Readonly<Record<string, number>>;
}): VerdictSeuils {
	const dansFenetre = incidentsDansFenetre(intrants.incidents, intrants.fenetre);
	const sources = sourcesDes(dansFenetre);
	const referentiel = verifierPubliabilite(intrants.parSecteur);
	const refus: RaisonRefus[] = [];

	if (dansFenetre.length < SEUIL_CORPUS_MIN) {
		refus.push({
			code: "corpus_trop_petit",
			raison: `Corpus trop petit : ${dansFenetre.length} incident(s) dans la fenêtre ${intrants.fenetre.debut} → ${intrants.fenetre.fin}, seuil minimal ${SEUIL_CORPUS_MIN}.`,
		});
	}
	if (!referentiel.publiable && referentiel.raison !== null) {
		refus.push({ code: "referentiel_trop_troue", raison: referentiel.raison });
	}
	if (sources.distinctes < SEUIL_SOURCES_DISTINCTES_MIN || sources.partMax > SEUIL_PART_SOURCE_MAX) {
		refus.push({
			code: "sources_trop_peu_productives",
			raison:
				`Sources trop peu productives : ${sources.distinctes} éditeur(s) distinct(s)` +
				` (seuil ${SEUIL_SOURCES_DISTINCTES_MIN}), part maximale ${Math.round(sources.partMax * 100)} %` +
				` (plafond ${Math.round(SEUIL_PART_SOURCE_MAX * 100)} %).`,
		});
	}

	return {
		publiable: refus.length === 0,
		mention: refus.length === 0 ? null : REFUS_PUBLICATION,
		refus,
		corpus: { total: intrants.incidents.length, dansFenetre: dansFenetre.length, fenetre: intrants.fenetre },
		sources,
		referentiel,
	};
}

export class ErreurRefusPublication extends Error {
	constructor(readonly verdict: VerdictSeuils) {
		super(`${REFUS_PUBLICATION} : ${verdict.refus.map((r) => `${r.code} — ${r.raison}`).join(" ; ")}`);
		this.name = "ErreurRefusPublication";
	}
}

/** Refus explicite : le chiffre ne sort pas, même si un `--json=` a été demandé. */
export function exigerPublication(verdict: VerdictSeuils): void {
	if (!verdict.publiable) throw new ErreurRefusPublication(verdict);
}

/** Même correspondance que `scripts/mesure-couverture.mts` (le contrat n'a pas ces familles). */
function familleDe(type: string | undefined): string {
	switch (type) {
		case "ransomware":
			return "ransomware";
		case "fuite":
			return "leaks";
		case "phishing":
			return "phishing";
		case "ddos":
		case "compromission":
		case "defacement":
			return "cti";
		default:
			return "presse_cyber";
	}
}

/** Rejoue un incident : admission du contrat, puis désignation par le moteur réel. */
function faitDe(incident: IncidentCorpus): FaitCouverture {
	const admission = admitEvent({
		dedupKey: `mesure-globale:${incident.id}`,
		family: familleDe(incident.type),
		assertionType: "third_party_claim",
		title: `${incident.entite} — ${incident.type ?? "incident"}`,
		summary: incident.resume ?? "",
		severity: 3,
		confidence: "C3",
		sourceId: "mesure-corpus",
		sourceUrl: incident.preuve?.url ?? null,
		observedAt: incident.datePublique,
	});
	const match = designateOrganization(`${incident.entite} ${incident.resume ?? ""}`);
	const orgId = match?.orgId;
	return {
		id: incident.id,
		datePublication: incident.datePublique,
		// Le corpus est rejoué, pas ingéré : la collecte est supposée au jour de
		// publication. Aucun délai réel n'est publié à partir de cette simulation.
		collecte: admission.ok ? { date: incident.datePublique } : null,
		jugeCyber: admission.ok,
		rattachement:
			orgId !== undefined && orgId !== null
				? { orgId: String(orgId), date: incident.datePublique, correct: true }
				: null,
	};
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const corpusPath = argv.find((a) => a.startsWith("--corpus="))?.split("=")[1] ?? CORPUS_DEFAUT;
	const sortieJson = argv.find((a) => a.startsWith("--json="))?.split("=")[1] ?? null;

	const corpus = JSON.parse(readFileSync(corpusPath, "utf8")) as {
		meta?: { fenetre?: [string, string] };
		incidents: IncidentCorpus[];
	};
	const fenetre: Fenetre = {
		debut: corpus.meta?.fenetre?.[0] ?? FENETRE_DEFAUT.debut,
		fin: corpus.meta?.fenetre?.[1] ?? FENETRE_DEFAUT.fin,
	};

	const { rows: secteurs } = await query<{ secteur: string; n: string }>(
		`SELECT COALESCE(sector, kind) AS secteur, count(*)::text AS n
		   FROM org WHERE kind = 'entreprise' GROUP BY 1 ORDER BY 2 DESC`,
	);
	const parSecteur = Object.fromEntries(secteurs.map((r) => [r.secteur, Number(r.n)]));

	const verdict = evaluerSeuils({ incidents: corpus.incidents, fenetre, parSecteur });
	exigerPublication(verdict);

	const dansFenetre = incidentsDansFenetre(corpus.incidents, fenetre);
	await preparerGazetteer();
	const resultats = dansFenetre.map(faitDe).map(classerCouverture);
	const parMotif = Object.fromEntries(
		Object.values(MOTIFS_COUVERTURE).map((motif) => [
			motif,
			resultats.filter((r) => r.motif === motif).length,
		]),
	);
	const vus = parMotif[MOTIFS_COUVERTURE.vu];
	const dateMesure = new Date().toISOString().slice(0, 10);

	const synthese = {
		dateMesure,
		corpus: corpusPath,
		fenetre,
		seuils: verdict,
		couverture: {
			vus,
			total: dansFenetre.length,
			taux: Math.round((vus / dansFenetre.length) * 1000) / 10,
			motifs: parMotif,
		},
		method: {
			porte: "contract/admit.ts — même admission que l'ingestion",
			moteur: "collectors/relevance.ts designateOrganization — gazetteer chargé depuis la base",
			limite: "rejeu : ni délai réel de collecte, ni contrôle de la qualité du rattachement",
		},
		incidents: resultats,
	};

	console.log(`Couverture globale — ${dateMesure}`);
	console.log(
		`Fenêtre ${fenetre.debut} → ${fenetre.fin} · corpus ${verdict.corpus.dansFenetre} incident(s)` +
			` · éditeurs distincts ${verdict.sources.distinctes}`,
	);
	console.log(
		`Couverture : ${vus}/${dansFenetre.length} (${synthese.couverture.taux} %)` +
			` · motifs ${JSON.stringify(parMotif)}`,
	);
	if (sortieJson !== null) {
		writeFileSync(sortieJson, `${JSON.stringify(synthese, null, 2)}\n`, "utf8");
		console.log(`mesure publiée : ${sortieJson}`);
	}
}

// Importable par les tests sans effet de bord (aucune connexion, aucune écriture).
const estPrincipal =
	process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (estPrincipal) {
	main().catch(async (error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${message}\n`);
		await closePools().catch(() => {});
		process.exitCode = 1;
	});
}
