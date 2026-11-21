/**
 * Délai de détection des incidents « vus » : publication → première apparition.
 *
 * Pour chaque incident du corpus de référence classé `vu` par la dernière
 * mesure de couverture publiée, on calcule l'écart en heures entre :
 *
 *  - `datePublique` : date de publication de la pièce de preuve du corpus
 *    (l'équivalent du `date_publication` du corpus JSONL) ;
 *  - `preuve.consulteLe` : première apparition datée de l'incident dans la
 *    mémoire versionnée du projet — la date à laquelle la page a été consultée
 *    et versée dans le corpus. C'est la seule trace datée de notre première
 *    connaissance de ces incidents : la collecte automatique n'a démarré que
 *    le 13/11/2026 et aucun événement de la table `event` ne leur correspond
 *    (voir docs/comparaison-presse.md).
 *
 * Les deux dates sont des dates calendaires : l'écart est un multiple de 24 h,
 * à minuit UTC. Ce n'est pas un temps de réaction en continu, mais une borne
 * jour par jour. Un délai positif signifie que la publication a précédé notre
 * première trace — toujours le cas ici.
 *
 * Sortie : console + docs/delai-detection.md (report reproductible, pas une
 * estimation). Lecture seule sur les données ; seul le document est réécrit.
 *
 *   apps/api/node_modules/.bin/tsx scripts/delai-detection.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CORPUS = fileURLToPath(new URL("../bench/fixtures/corpus-reference-na.json", import.meta.url));
const MESURE = fileURLToPath(new URL("../bench/results/couverture-2026-11-15.json", import.meta.url));
const SORTIE = fileURLToPath(new URL("../docs/delai-detection.md", import.meta.url));

/** Largeur d'un seau de l'histogramme : 30 jours, soit 720 heures. */
const SEAU_HEURES = 720;

type IncidentCorpus = {
	id: string;
	entite: string;
	datePublique?: string;
	preuve?: { consulteLe?: string; editeur?: string };
};

type IncidentMesure = { id: string; motif: string };

type Mesure = {
	dateMesure?: string;
	incidents: IncidentMesure[];
};

type Delai = {
	id: string;
	entite: string;
	editeur: string | null;
	publication: string;
	apparition: string;
	heures: number;
};

function lireJson<T>(chemin: string): T {
	return JSON.parse(readFileSync(chemin, "utf8")) as T;
}

/** Date calendaire UTC : on ne fabrique aucune heure là où la source n'en donne pas. */
function dateUtc(valeur: string | undefined): number | null {
	if (typeof valeur !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return null;
	const ms = Date.parse(`${valeur}T00:00:00.000Z`);
	return Number.isFinite(ms) ? ms : null;
}

function quantile(tri: readonly number[], q: number): number {
	if (tri.length === 0) return 0;
	return tri[Math.min(tri.length - 1, Math.floor(q * (tri.length - 1)))] ?? 0;
}

function jours(heures: number): string {
	return (heures / 24).toFixed(0);
}

function histogramme(delais: readonly Delai[]): string[] {
	if (delais.length === 0) return ["(aucun délai mesuré)"];
	const max = Math.max(...delais.map((d) => d.heures));
	const seaux = Math.floor(max / SEAU_HEURES) + 1;
	const comptes = new Array<number>(seaux).fill(0);
	for (const d of delais) {
		const index = Math.min(seaux - 1, Math.floor(d.heures / SEAU_HEURES));
		comptes[index] = (comptes[index] ?? 0) + 1;
	}
	const plusGrand = Math.max(...comptes, 1);
	const lignes: string[] = [];
	for (let i = 0; i < seaux; i++) {
		const n = comptes[i] ?? 0;
		const debut = i * (SEAU_HEURES / 24);
		const fin = debut + SEAU_HEURES / 24;
		const barre = "#".repeat(Math.round((n / plusGrand) * 48));
		lignes.push(
			`${`${debut}–${fin} j`.padStart(10)} | ${barre.padEnd(48)} ${String(n).padStart(3)}`,
		);
	}
	return lignes;
}

function tableauExtremes(delais: readonly Delai[]): string[] {
	const lignes = ["| Incident | Organisation | Publication | 1ʳᵉ apparition | Délai (h) | Délai (j) |", "| --- | --- | --- | --- | ---: | ---: |"];
	for (const d of delais) {
		lignes.push(
			`| \`${d.id}\` | ${d.entite} | ${d.publication} | ${d.apparition} | ${d.heures} | ${jours(d.heures)} |`,
		);
	}
	return lignes;
}

function main(): void {
	const corpus = lireJson<{ incidents?: IncidentCorpus[] }>(CORPUS);
	const mesure = lireJson<Mesure>(MESURE);
	const vus = new Set(
		(mesure.incidents ?? []).filter((i) => i.motif === "vu").map((i) => i.id),
	);

	const delais: Delai[] = [];
	const ignores: string[] = [];
	for (const incident of corpus.incidents ?? []) {
		if (!vus.has(incident.id)) continue;
		const publication = dateUtc(incident.datePublique);
		const apparition = dateUtc(incident.preuve?.consulteLe);
		if (publication === null || apparition === null || apparition < publication) {
			ignores.push(incident.id);
			continue;
		}
		delais.push({
			id: incident.id,
			entite: incident.entite,
			editeur: incident.preuve?.editeur ?? null,
			publication: incident.datePublique as string,
			apparition: incident.preuve?.consulteLe as string,
			heures: Math.round((apparition - publication) / 3_600_000),
		});
	}

	if (delais.length === 0) throw new Error("aucun incident « vu » avec deux dates exploitables");

	const trie = [...delais].sort((a, b) => a.heures - b.heures || a.id.localeCompare(b.id));
	const valeurs = trie.map((d) => d.heures);
	const p50 = quantile(valeurs, 0.5);
	const p90 = quantile(valeurs, 0.9);
	const max = valeurs[valeurs.length - 1] ?? 0;
	const min = valeurs[0] ?? 0;
	const dateMesure = mesure.dateMesure ?? "non datée";
	const hist = histogramme(trie);
	const rapides = trie.slice(0, 3);
	const lents = trie.slice(-3).reverse();

	const contenu = [
		"# Délai de détection — publication → première apparition",
		"",
		`Mesure du ${dateMesure} sur les incidents **vus** de la dernière mesure de couverture publiée (\`bench/results/couverture-2026-11-15.json\`).`,
		"",
		"## Méthode",
		"",
		"- **Périmètre** : les incidents dont le motif est `vu` dans la mesure de couverture, soit " +
			`${String(vus.size)} incident(s) ; ${String(delais.length)} avec une date de publication et une première apparition exploitables` +
			(ignores.length > 0 ? `, ${String(ignores.length)} écarté(s) (${ignores.join(", ")}).` : "."),
		"- **Publication** : `datePublique` du corpus (`bench/fixtures/corpus-reference-na.json`), champ équivalent au `date_publication` du corpus JSONL. C'est la date de la pièce de preuve, pas la date de survenue de l'attaque.",
		"- **Première apparition** : `preuve.consulteLe`, date à laquelle la page a été consultée et l'incident versé dans la base versionnée du projet. Aucun événement de la table `event` ne correspond à ces incidents : la collecte automatique a commencé le 13/11/2026. Cette date est donc une **borne supérieure** de notre connaissance, pas un horodatage de détecteur.",
		"- **Délai** : `(première apparition − publication) / 3 600 000`, en heures. Les deux bornes sont des dates à minuit UTC : les valeurs sont des multiples de 24 h, pas une latence continue.",
		"- **Quantiles** : rang `floor(q × (n − 1))` sur la liste triée, comme dans `scripts/mesure-delai.mts`.",
		"",
		"## Résultats",
		"",
		"| Statistique | Heures | Jours |",
		"| --- | ---: | ---: |",
		`| p50 | ${p50} | ${jours(p50)} |`,
		`| p90 | ${p90} | ${jours(p90)} |`,
		`| max | ${max} | ${jours(max)} |`,
		`| min | ${min} | ${jours(min)} |`,
		`| moyenne | ${Math.round(valeurs.reduce((a, b) => a + b, 0) / valeurs.length)} | ${jours(Math.round(valeurs.reduce((a, b) => a + b, 0) / valeurs.length))} |`,
		"",
		"Histogramme (seau de 30 jours) :",
		"",
		"```",
		...hist,
		"```",
		"",
		"## Cas extrêmes nommés",
		"",
		`Le délai le plus court concerne \`${rapides[0]?.id ?? "—"}\` — ${rapides[0]?.entite ?? "—"} : ` +
			`${String(min)} h (${jours(min)} j), publié le ${rapides[0]?.publication ?? "—"} et apparu le ${rapides[0]?.apparition ?? "—"}.`,
		`Le délai le plus long concerne \`${lents[0]?.id ?? "—"}\` — ${lents[0]?.entite ?? "—"} : ` +
			`${String(max)} h (${jours(max)} j), publié le ${lents[0]?.publication ?? "—"} et apparu le ${lents[0]?.apparition ?? "—"}.`,
		"",
		"Trois délais les plus courts :",
		"",
		...tableauExtremes(rapides),
		"",
		"Trois délais les plus longs :",
		"",
		...tableauExtremes(lents),
		"",
		"## Ce que ce chiffre ne mesure pas",
		"",
		"- Il ne mesure pas la vitesse de détection automatique : la première trace est une consultation humaine de la source pour constituer le corpus versionné. Le radar n'a détecté aucun de ces incidents par ses flux sur la période.",
		"- Il ne mesure pas le retard de l'éditeur à publier : la borne de départ est la publication de la pièce de preuve retenue, pas la date de l'incident.",
		"- Les dates étant journalières, deux incidents à un mois d'écart mais consultés le même jour ont le même délai : l'histogramme doit se lire par blocs de 30 jours, pas au près.",
		"",
		"## Reproduire",
		"",
		"```bash",
		"apps/api/node_modules/.bin/tsx scripts/delai-detection.mts",
		"```",
		"",
		"Sources : `bench/fixtures/corpus-reference-na.json` (`datePublique`, `preuve.consulteLe`), " +
			"`bench/results/couverture-2026-11-15.json` (`motif: vu`).",
		"",
	].join("\n");

	writeFileSync(SORTIE, contenu, "utf8");

	console.log(`Délai de détection — ${dateMesure}`);
	console.log(`${String(delais.length)} incident(s) « vu » daté(s) · min ${min} h · p50 ${p50} h · p90 ${p90} h · max ${max} h`);
	console.log("");
	console.log(hist.join("\n"));
	console.log("");
	console.log(`le plus rapide : ${rapides[0]?.id} — ${String(min)} h`);
	console.log(`le plus lent   : ${lents[0]?.id} — ${String(max)} h`);
	console.log(`rapport écrit : ${SORTIE}`);
}

try {
	main();
} catch (error) {
	console.error(`delai-detection: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}
