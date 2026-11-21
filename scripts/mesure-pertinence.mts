/**
 * Mesure reproductible du taux de faux positifs du filtre de pertinence.
 *
 * Rejoue le moteur réel (`collectors/filter.ts`) sur le corpus gelé de 100
 * items réels (`bench/pertinence/corpus-100.json`), sans écrire en base.
 * Le corpus ne contient que des titres extraits de `event` : la mesure porte
 * sur le contenu déjà admis par l'ancienne porte, pas sur les flux bruts.
 *
 *   tsx scripts/mesure-pertinence.mts
 *   tsx scripts/mesure-pertinence.mts --json=bench/pertinence/resultat.json
 *   RADAR_CYBER_EXCLUSIONS="virus hivernaux,attaques de loup" tsx scripts/mesure-pertinence.mts
 *
 * Faux positif : item étiqueté `hors_sujet` que le filtre admet.
 * Contrefactuel : même lexique avec un seuil de 1, c'est-à-dire l'ancienne
 * règle « présence d'un mot = pertinence ».
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { evaluatePertinence, loadRelevanceConfig } from "../apps/api/src/collectors/filter.js";

type Label = "cyber" | "hors_sujet";
interface CorpusItem {
	id: number;
	source: string;
	titre: string;
	label: Label;
}

const CORPUS = fileURLToPath(new URL("../bench/pertinence/corpus-100.json", import.meta.url));

function assertCorpus(items: unknown[], taille: number): asserts items is CorpusItem[] {
	if (items.length !== taille) {
		throw new Error(`corpus : attendu ${taille} items, reçu ${items.length}`);
	}
	for (const [i, item] of items.entries()) {
		if (typeof item?.titre !== "string" || !item.titre.trim()) {
			throw new Error(`corpus #${i + 1} : titre manquant`);
		}
		if (item.label !== "cyber" && item.label !== "hors_sujet") {
			throw new Error(`corpus #${i + 1} : étiquette inconnue (${String(item.label)})`);
		}
	}
}

const pct = (v: number | null): string => v === null ? "n/a" : `${(v * 100).toFixed(1)} %`;
const corpus = JSON.parse(await readFile(CORPUS, "utf8")) as { meta: Record<string, unknown>; items: unknown[] };
assertCorpus(corpus.items, 100);
const config = loadRelevanceConfig();
const simple = { ...config, minScore: 1 };
const detail: Array<{ id: number; titre: string; label: Label; score: number; admis: boolean }> = [];
let tp = 0;
let fp = 0;
let tn = 0;
let fn = 0;
let fpSeuilUn = 0;

for (const item of corpus.items) {
	const verdict = evaluatePertinence({ title: item.titre }, { config });
	const admis = verdict.relevant;
	detail.push({ id: item.id, titre: item.titre, label: item.label, score: verdict.score, admis });
	if (item.label === "cyber") {
		if (admis) tp++;
		else fn++;
	} else {
		if (admis) fp++;
		else tn++;
		if (evaluatePertinence({ title: item.titre }, { config: simple }).relevant) fpSeuilUn++;
	}
}

const tauxFp = fp + tn === 0 ? null : fp / (fp + tn);
const tauxSeuilUn = fp + tn === 0 ? null : fpSeuilUn / (fp + tn);
const precision = tp + fp === 0 ? null : tp / (tp + fp);
const rappel = tp + fn === 0 ? null : tp / (tp + fn);

console.log(`Corpus : ${corpus.items.length} items réels (${tp + fn} cyber, ${fp + tn} hors sujet)`);
console.log(`Configuration : ${config.keywords.length} termes, ${config.exclusions.length} exclusions, seuil ${config.minScore}`);
console.log(`Matrice : TP=${tp} FP=${fp} TN=${tn} FN=${fn}`);
console.log(`Taux de faux positifs : ${pct(tauxFp)} (${fp}/${fp + tn})`);
console.log(`Précision : ${pct(precision)} — rappel : ${pct(rappel)}`);
console.log(`Contrefactuel (seuil 1, « présence d'un mot ») : ${pct(tauxSeuilUn)} (${fpSeuilUn}/${fp + tn})`);
for (const faux of detail.filter((d) => d.admis && d.label === "hors_sujet")) {
	console.log(`  FP #${faux.id} score=${faux.score} — ${faux.titre.slice(0, 120)}`);
}
for (const manque of detail.filter((d) => !d.admis && d.label === "cyber")) {
	console.log(`  FN #${manque.id} score=${manque.score} — ${manque.titre.slice(0, 120)}`);
}

const jsonArg = process.argv.find((a) => a.startsWith("--json="));
if (jsonArg) {
	const path = jsonArg.slice("--json=".length);
	await writeFile(path, `${JSON.stringify({
		date: new Date().toISOString(),
		corpus: CORPUS,
		configuration: { termes: config.keywords.length, exclusions: [...config.exclusions], seuil: config.minScore },
		matrice: { tp, fp, tn, fn },
		tauxFauxPositifs: tauxFp,
		tauxFauxPositifsSeuilUn: tauxSeuilUn,
		precision,
		rappel,
		detail,
	}, null, 2)}\n`);
	console.log(`Résultat écrit : ${path}`);
}
