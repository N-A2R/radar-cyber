#!/usr/bin/env -S npx tsx
/**
 * Générateur de la série de référence 180 jours du backtest STL.
 *
 * La base de travail ne contient que quelques jours de collecte fraîche : un
 * backtest de 180 jours sur l'activité réelle y serait une mesure de
 * rattrapage, pas de détection. Cette fixture versionnée fournit une série
 * quotidienne reproductible (graine fixe), avec saison hebdomadaire, bruit,
 * 20 pics annotés et quatre imports historiques volontairement non annotés
 * que le garde-fou de fraîcheur doit écarter.
 *
 * Aucun fait réel, aucune organisation, aucune donnée personnelle : seuls des
 * volumes par famille sont simulés. Le fichier produit est lu par
 * scripts/mesure-stl-pics.mts, qui l'injecte dans une table `event` de
 * benchmark le temps de la mesure.
 *
 *   apps/api/node_modules/.bin/tsx scripts/genere-serie-stl-180j.mts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addDays } from "../apps/api/src/detect/stl-peaks.js";

const OUTPUT = fileURLToPath(new URL("../bench/stl/serie-180j.json", import.meta.url));

const START = "2026-05-26";
const DAYS = 180;
const SEED = 2026_11_22;

const FAMILIES: Record<string, number> = {
	vuln: 55,
	cti: 12,
	ransomware: 6,
	leaks: 4,
	cert_fr: 3,
	cert: 2,
};

type Peak = { family: string; dayIndex: number; factor: number; duration: number };
type Batch = { family: string; dayIndex: number; factor: number; lagDays: number };

/** 20 départs d'activité simulés, répartis sur les 180 jours. */
const PEAKS: Peak[] = [
	{ family: "vuln", dayIndex: 61, factor: 4.2, duration: 1 },
	{ family: "ransomware", dayIndex: 66, factor: 5.5, duration: 1 },
	{ family: "cti", dayIndex: 72, factor: 4.0, duration: 1 },
	{ family: "leaks", dayIndex: 75, factor: 5.0, duration: 1 },
	{ family: "cert_fr", dayIndex: 80, factor: 4.5, duration: 1 },
	{ family: "vuln", dayIndex: 88, factor: 3.8, duration: 1 },
	{ family: "ransomware", dayIndex: 95, factor: 6.0, duration: 1 },
	{ family: "cti", dayIndex: 99, factor: 4.3, duration: 1 },
	{ family: "leaks", dayIndex: 104, factor: 4.0, duration: 1 },
	{ family: "cert", dayIndex: 111, factor: 5.5, duration: 1 },
	{ family: "vuln", dayIndex: 117, factor: 4.5, duration: 1 },
	{ family: "ransomware", dayIndex: 123, factor: 5.0, duration: 1 },
	{ family: "cti", dayIndex: 128, factor: 3.9, duration: 1 },
	{ family: "leaks", dayIndex: 132, factor: 4.6, duration: 1 },
	{ family: "cert_fr", dayIndex: 138, factor: 4.2, duration: 1 },
	{ family: "vuln", dayIndex: 144, factor: 4.1, duration: 1 },
	{ family: "ransomware", dayIndex: 151, factor: 5.8, duration: 1 },
	{ family: "cti", dayIndex: 157, factor: 4.7, duration: 1 },
	{ family: "leaks", dayIndex: 163, factor: 4.3, duration: 1 },
	{ family: "ransomware", dayIndex: 171, factor: 5.2, duration: 1 },
];

/** Imports historiques : gros volumes, collectés bien après coup (non annotés). */
const BATCH: Batch[] = [
	{ family: "vuln", dayIndex: 69, factor: 14, lagDays: 14 },
	{ family: "cti", dayIndex: 107, factor: 20, lagDays: 21 },
	{ family: "leaks", dayIndex: 146, factor: 16, lagDays: 12 },
	{ family: "vuln", dayIndex: 160, factor: 12, lagDays: 25 },
];

function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function main(): void {
	const random = mulberry32(SEED);
	const base = new Date(`${START}T00:00:00Z`).getTime();
	const counts: Record<string, number[]> = {};
	for (const [family, baseline] of Object.entries(FAMILIES)) {
		const values: number[] = [];
		for (let day = 0; day < DAYS; day++) {
			const weekday = new Date(base + day * 86_400_000).getUTCDay();
			const weekly = weekday === 0 || weekday === 6 ? 0.62 : 1.12;
			const trend = 1 + 0.0025 * day;
			const mean = baseline * weekly * trend;
			const noise = (random() + random() + random() - 1.5) * Math.sqrt(mean + 1) * 1.6;
			values.push(Math.max(0, Math.round(mean + noise)));
		}
		counts[family] = values;
	}

	for (const peak of PEAKS) {
		const values = counts[peak.family];
		if (!values) throw new Error(`famille inconnue : ${peak.family}`);
		for (let offset = 0; offset < peak.duration; offset++) {
			const index = peak.dayIndex + offset;
			values[index] = Math.max(values[index] ?? 0, Math.round((values[index] ?? 0) * peak.factor));
		}
	}
	for (const batch of BATCH) {
		const values = counts[batch.family];
		if (!values) throw new Error(`famille inconnue : ${batch.family}`);
		values[batch.dayIndex] = Math.max(values[batch.dayIndex] ?? 0, Math.round((values[batch.dayIndex] ?? 0) * batch.factor));
	}

	const description =
		"Fixture de benchmark STL : volumes quotidiens simulés par famille, saison hebdomadaire, " +
		"bruit surdispersé, 20 pics annotés et 4 imports historiques non annotés. Aucun fait réel, " +
		"aucune organisation, aucune donnée personnelle.";
	const fixture = {
		version: "stl-180j-v1",
		description,
		start: START,
		days: DAYS,
		period: 7,
		seed: SEED,
		source: "benchmark-stl-180j",
		families: Object.fromEntries(
			Object.entries(counts).map(([family, values]) => [family, { baseline: FAMILIES[family], counts: values }]),
		),
		peaks: PEAKS.map((peak) => ({
			family: peak.family,
			day: addDays(START, peak.dayIndex),
			factor: peak.factor,
			duration_days: peak.duration,
			rationale: `vague simulée : pic ${peak.factor}× la ligne de base`,
		})),
		batch: BATCH.map((batch) => ({
			family: batch.family,
			day: addDays(START, batch.dayIndex),
			factor: batch.factor,
			lag_days: batch.lagDays,
			rationale: `import historique simulé : collecté ${batch.lagDays} j après le jour observé`,
		})),
	};
	writeFileSync(OUTPUT, `${JSON.stringify(fixture, null, 2)}\n`);
	console.log(`fixture écrite : ${OUTPUT} (${DAYS} jours, ${PEAKS.length} pics annotés, ${BATCH.length} imports)`);
}

main();
