#!/usr/bin/env -S npx tsx
/**
 * Mesure précision/rappel des campagnes multi-organismes sur 20 campagnes
 * annotées, puis écrit le résultat dans `campaign_eval`.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-campaign-quality.mts
 *
 * Le jeu annoté est dérivé de `bench/gold/incidents-na-500.jsonl` (incidents
 * relus le 22 novembre 2026) : acteur revendiqué + mois civil + au moins deux
 * organisations distinctes. Seuls les identifiants d'incidents, l'acteur, le
 * mois et le nombre d'organisations sont conservés dans le jeu annoté.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	evaluerCampagnes,
	type AnnotationCampagne,
} from "../apps/api/src/analyse/campaign-quality.js";
import { analyserCampagnes, type EvenementCampagne } from "../apps/api/src/analyse/campagnes.js";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
const { closePools, query } = await import("../apps/api/src/db.js");

const MODELE = "multi-org-month@1";
const GOLD = fileURLToPath(new URL("../bench/gold/incidents-na-500.jsonl", import.meta.url));
const ANNOTATIONS = fileURLToPath(new URL("../bench/gold/campagnes-multi-org-20.json", import.meta.url));

type IncidentGold = {
	id: string;
	title: string;
	organisation: string;
	observedAt: string;
	incidentType: string;
	sourceUrl: string | null;
};

async function principal(): Promise<void> {
	const incidents = readFileSync(GOLD, "utf8")
		.split("\n")
		.filter((ligne) => ligne.trim().length > 0)
		.map((ligne) => JSON.parse(ligne) as IncidentGold);
	const organisations = [...new Set(incidents.map((i) => i.organisation))].sort();
	const idsOrganisations = new Map(organisations.map((nom, index) => [nom, index + 1]));
	const evenements: EvenementCampagne[] = incidents.map((incident, index) => ({
		id: index + 1,
		family: incident.incidentType,
		title: incident.title,
		observedAt: incident.observedAt,
		sourceId: "ransomwatch-gold",
		sourceUrl: incident.sourceUrl,
		orgId: idsOrganisations.get(incident.organisation) ?? null,
		sector: null,
		evidence: { claimed_at: incident.observedAt },
	}));

	const jeu = JSON.parse(readFileSync(ANNOTATIONS, "utf8")) as {
		meta: { count: number };
		campaigns: AnnotationCampagne[];
	};
	if (jeu.meta.count !== 20 || jeu.campaigns.length !== 20) {
		throw new Error(`jeu annoté : attendu 20 campagnes, reçu ${jeu.campaigns.length}`);
	}

	const analyse = analyserCampagnes(evenements);
	const mesure = evaluerCampagnes(evenements, analyse.campagnes, jeu.campaigns);
	await query("DELETE FROM campaign_eval WHERE model = $1", [MODELE]);
	await query(
		`INSERT INTO campaign_eval (model, dataset, annotated, tp, fp, fn)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		[MODELE, "bench/gold/campagnes-multi-org-20.json", mesure.annotees, mesure.tp, mesure.fp, mesure.fn],
	);
	console.log(JSON.stringify({ model: MODELE, ...mesure, detectees: mesure.detectees }, null, 2));
}

principal()
	.catch((erreur: unknown) => {
		console.error(erreur);
		process.exitCode = 1;
	})
	.finally(() => {
		void closePools();
	});
