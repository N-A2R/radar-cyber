/**
 * Vérifie le corpus des sources d'information du secteur santé en Nouvelle-Aquitaine.
 *
 * Pour chaque ligne de bench/corpus/sources-sante.jsonl, recharge réellement
 * le site, la page d'actualités, le flux (quand il existe) et l'article cyber
 * cité, en suivant les redirections. Seules les sources dont TOUTES les URLs
 * répondent HTTP 200 sont retenues dans le rapport.
 *
 * Usage :
 *   npx tsx scripts/verifier-sources-sante.mts
 *   npx tsx scripts/verifier-sources-sante.mts --input=bench/corpus/xxx.jsonl \
 *       --out=bench/results/xxx.json
 *   npx tsx scripts/verifier-sources-sante.mts --strict  # code 1 si anomalie
 */
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface Source {
	nom: string;
	type: string;
	secteur: string;
	url_site: string;
	url_actualites: string;
	url_flux: string;
	code_http: number;
	exemple_cyber: string;
}

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string =>
	argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const INPUT = arg("input", "bench/corpus/sources-sante.jsonl");
const OUTPUT = arg("out", "bench/results/validation-sante-sources.json");
const STRICT = argv.includes("--strict");
const UA =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
	"Chrome/131.0.0.0 Safari/537.36";

async function codeHttp(url: string): Promise<number | null> {
	if (!url) return null;
	try {
		const { stdout } = await execFileAsync(
			"curl",
			[
				"-L",
				"-s",
				"-o",
				"/dev/null",
				"-w",
				"%{http_code}",
				"--max-time",
				"30",
				"-A",
				UA,
				url,
			],
			{ timeout: 35_000 },
		);
		const code = Number(stdout.trim());
		return Number.isInteger(code) && code > 0 ? code : null;
	} catch {
		return null;
	}
}

function articleUrl(exemple: string): string {
	return exemple.match(/https?:\/\/\S+/)?.[0] ?? "";
}

async function main(): Promise<void> {
	const lignes = readFileSync(INPUT, "utf8")
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	const sources: Source[] = lignes.map((l) => JSON.parse(l) as Source);

	// Jusqu'à 8 requêtes simultanées : assez rapide sans écraser les serveurs.
	const taches: Array<() => Promise<number | null>> = [];
	for (const source of sources) {
		for (const url of [
			source.url_site,
			source.url_actualites,
			source.url_flux,
			articleUrl(source.exemple_cyber),
		]) {
			taches.push(() => codeHttp(url));
		}
	}
	const mesures: Array<number | null> = new Array(taches.length);
	let curseur = 0;
	const worker = async (): Promise<void> => {
		while (curseur < taches.length) {
			const i = curseur++;
			const tache = taches[i];
			if (tache) mesures[i] = await tache();
		}
	};
	await Promise.all(Array.from({ length: Math.min(8, taches.length) }, worker));

	const doublons: string[] = [];
	const vus = new Set<string>();
	const mortes: string[] = [];
	const rejets: string[] = [];
	const rapport: Array<Record<string, unknown>> = [];

	for (const [i, source] of sources.entries()) {
		const [site, actualites, flux, article] = mesures.slice(i * 4, i * 4 + 4);
		const cle = source.url_site.replace(/\/$/, "");
		if (vus.has(cle)) doublons.push(source.nom);
		vus.add(cle);
		if (site !== 200 || actualites !== 200 || (source.url_flux && flux !== 200) || article !== 200) {
			mortes.push(`${source.nom} : site=${site} actualites=${actualites} flux=${flux} article=${article}`);
		}
		if (!source.exemple_cyber || !articleUrl(source.exemple_cyber)) {
			rejets.push(`${source.nom} : exemple cyber absent`);
		}
		rapport.push({
			nom: source.nom,
			type: source.type,
			url_site: source.url_site,
			code_http: site,
			code_actualites: actualites,
			code_flux: source.url_flux ? flux : null,
			code_article: article,
			exemple_cyber: source.exemple_cyber,
		});
	}

	const retenues = rapport.filter(
		(r) =>
			r.code_http === 200 &&
			r.code_actualites === 200 &&
			r.code_article === 200 &&
			(r.code_flux === null || r.code_flux === 200),
	).length;
	const resultat = {
		genereLe: new Date().toISOString(),
		corpus: INPUT,
		protocole:
			"curl -L, user-agent navigateur, redirections suivies, HTTP 200 final pour site, actualités, flux et article",
		totaux: {
			lues: sources.length,
			retenues,
			avecExempleCyber: sources.filter((s) => articleUrl(s.exemple_cyber)).length,
			avecFlux: sources.filter((s) => s.url_flux).length,
			doublons: doublons.length,
			mortes: mortes.length,
			rejets: rejets.length,
			urlsVerifiees: sources.reduce(
				(n, s) => n + 2 + (s.url_flux ? 1 : 0) + (articleUrl(s.exemple_cyber) ? 1 : 0),
				0,
			),
		},
		sources: rapport,
		anomalies: { doublons, mortes, rejets },
	};
	writeFileSync(OUTPUT, `${JSON.stringify(resultat, null, 2)}\n`);
	console.log(
		`${retenues}/${sources.length} sources retenues en HTTP 200 — ${resultat.totaux.urlsVerifiees} URLs vérifiées — rapport ${OUTPUT}`,
	);
	for (const anomalie of [...doublons, ...mortes, ...rejets]) console.error(anomalie);
	if (STRICT && (retenues !== sources.length || doublons.length || mortes.length || rejets.length)) {
		process.exitCode = 1;
	}
}

await main();
