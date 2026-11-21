#!/usr/bin/env -S npx tsx
/**
 * Corpus des sites officiels des communes de Nouvelle-Aquitaine de plus de
 * 10 000 habitants.
 *
 *   apps/api/node_modules/.bin/tsx scripts/corpus-communes.mts
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/corpus-communes.mts --appliquer
 *
 * Les communes viennent du référentiel versionné (`db/data/referentiel-na.json`).
 * Leur site est cherché sur Wikidata (propriété P856 de l'item portant le code
 * INSEE P374), jamais deviné depuis le nom. Chaque candidat est ensuite omis
 * sauf si le serveur répond 200 avec une page qui mentionne la commune.
 *
 * Par défaut : rapport stdout + `bench/corpus/communes.jsonl` uniquement.
 * `--appliquer` est la seule porte d'écriture en base : complète `org.website`
 * et `org.domain` des communes confirmées, sans écraser une valeur existante.
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { closePools } from "../apps/api/src/db.js";
import {
	appliquerPlan,
	candidatsDepuisWikidata,
	communesCibles,
	evaluerReponse,
	ligneCorpus,
	planApplication,
	trierCandidats,
	type CandidatSite,
	type CommuneCible,
	type LigneCorpus,
	type Tentative,
	type Verification,
} from "../apps/api/src/corpus/communes.js";
import type { ReferentielNA } from "../apps/api/src/referentiel/model.js";

const argv = process.argv.slice(2);
const APPLIQUER = argv.includes("--appliquer");
const AIDE = argv.includes("--help") || argv.includes("-h");
const INCONNU = argv.find((a) => a !== "--appliquer" && a !== "--help" && a !== "-h");
if (AIDE) {
	console.log("Usage : tsx scripts/corpus-communes.mts [--appliquer]");
	process.exit(0);
}
if (INCONNU) {
	console.error(`Argument inconnu : ${INCONNU}`);
	process.exit(2);
}
if (APPLIQUER && !process.env.DATABASE_URL) {
	console.error("DATABASE_URL est requis pour --appliquer (ex. postgres://radar:radar@localhost:5433/radar)");
	process.exit(2);
}

const SORTIE = new URL("../bench/corpus/communes.jsonl", import.meta.url);
// UA navigateur standard : plusieurs WAF municipaux renvoient une page
// « Request Denied » en 200 dès que l'UA porte un suffixe non standard.
const USER_AGENT =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const DELAI_MS = 12_000;
const CONCURRENCE = 6;
const MAX_CANDIDATS = 3;

function causeReseau(error: unknown): string | null {
	if (error instanceof Error && "cause" in error) {
		const cause = error.cause;
		if (cause instanceof Error && "code" in cause && typeof cause.code === "string") return cause.code;
	}
	return null;
}

function messageErreur(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).slice(0, 140);
}

async function jsonSPARQL<T>(url: string): Promise<T> {
	const reponse = await fetch(url, {
		headers: { "User-Agent": USER_AGENT, Accept: "application/sparql-results+json" },
		signal: AbortSignal.timeout(30_000),
	});
	if (!reponse.ok) throw new Error(`Wikidata SPARQL : HTTP ${reponse.status}`);
	return (await reponse.json()) as T;
}

/** Une tentative réseau est toujours tracée, y compris en échec. */
type Sondage = { verification: Verification; tentative: Tentative };

async function sonder(candidat: CandidatSite, commune: CommuneCible): Promise<Sondage> {
	let statut: number | null = null;
	let urlFinale: string | null = null;
	try {
		const reponse = await fetch(candidat.url, {
			headers: { "User-Agent": USER_AGENT, "Accept-Language": "fr-FR,fr;q=0.9" },
			redirect: "follow",
			signal: AbortSignal.timeout(DELAI_MS),
		});
		statut = reponse.status;
		urlFinale = reponse.url;
		// Au-delà, les pages de portail ne servent plus à la cohérence : on
		// garde le coût mémoire borné pour 74 communes vérifiées en parallèle.
		const html = (await reponse.text()).slice(0, 300_000);
		const verification = evaluerReponse({ statut, urlFinale, html, nom: commune.nom });
		return {
			verification,
			tentative: { url: candidat.url, statut, issue: verification.raison },
		};
	} catch (error) {
		const code = causeReseau(error);
		const issue = `réseau ${code ? `(${code}) ` : ""}: ${messageErreur(error)}`;
		return {
			verification: {
				confirme: false,
				raison: issue,
				statut,
				urlFinale,
				extrait: null,
				correspondance: null,
			},
			tentative: { url: candidat.url, statut, issue },
		};
	}
}

/** Une seule variante : le même hôte, l'autre protocole. Jamais un nom deviné. */
function varianteProtocole(candidat: CandidatSite): CandidatSite | null {
	let url: URL;
	try {
		url = new URL(candidat.url);
	} catch {
		return null;
	}
	url.protocol = url.protocol === "http:" ? "https:" : "http:";
	return { ...candidat, url: url.toString() };
}

async function traiter(
	commune: CommuneCible,
	parCode: Map<string, CandidatSite[]>,
	verifieLe: string,
): Promise<LigneCorpus> {
	const candidats = trierCandidats(parCode.get(commune.code) ?? [], commune.nom);
	if (candidats.length === 0) {
		return ligneCorpus(
			commune,
			null,
			{
				confirme: false,
				raison: "aucun site officiel référencé (Wikidata P856)",
				statut: null,
				urlFinale: null,
				extrait: null,
				correspondance: null,
			},
			[],
			verifieLe,
		);
	}

	const tentatives: Tentative[] = [];
	let meilleur: Sondage | null = null;
	let meilleurCandidat = candidats[0]!;
	for (const candidat of candidats.slice(0, MAX_CANDIDATS)) {
		for (const essai of [candidat, varianteProtocole(candidat)].filter((c): c is CandidatSite => c !== null)) {
			const sondage = await sonder(essai, commune);
			tentatives.push(sondage.tentative);
			if (sondage.verification.confirme) {
				return ligneCorpus(commune, essai, sondage.verification, tentatives, verifieLe);
			}
			// Un statut HTTP est plus informatif qu'une panne réseau : c'est lui
			// qu'on publie comme raison si aucune tentative n'aboutit.
			if (!meilleur || (meilleur.verification.statut === null && sondage.verification.statut !== null)) {
				meilleur = sondage;
				meilleurCandidat = essai;
			}
		}
	}
	return ligneCorpus(commune, meilleurCandidat, meilleur!.verification, tentatives, verifieLe);
}

function pct(n: number, d: number): string {
	return d === 0 ? "—" : `${((n / d) * 100).toFixed(1)} %`;
}

async function main(): Promise<void> {
	const ref = JSON.parse(
		readFileSync(new URL("../db/data/referentiel-na.json", import.meta.url), "utf8"),
	) as ReferentielNA;
	const communes = communesCibles(ref);
	const codes = communes.map((c) => c.code);
	console.log(`Communes de NA > ${10_000} habitants : ${communes.length}`);

	const requete = `SELECT ?item ?insee ?site WHERE {
		VALUES ?insee { ${codes.map((c) => `"${c}"`).join(" ")} }
		?item wdt:P374 ?insee .
		OPTIONAL { ?item wdt:P856 ?site }
	}`;
	const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(requete)}&format=json`;
	const parCode = candidatsDepuisWikidata(await jsonSPARQL<unknown>(url));
	console.log(`Sites candidats Wikidata : ${[...parCode.values()].reduce((n, l) => n + l.length, 0)}`);

	const verifieLe = new Date().toISOString().slice(0, 10);
	const lignes: LigneCorpus[] = [];
	for (let i = 0; i < communes.length; i += CONCURRENCE) {
		const lot = await Promise.all(communes.slice(i, i + CONCURRENCE).map((c) => traiter(c, parCode, verifieLe)));
		lignes.push(...lot);
	}
	lignes.sort((a, b) => a.code_insee.localeCompare(b.code_insee));

	await mkdir(new URL("./", SORTIE), { recursive: true });
	await writeFile(SORTIE, lignes.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
	console.log(`Corpus écrit : ${fileURLToPath(SORTIE)} (${lignes.length} lignes)`);

	const confirmes = lignes.filter((l) => l.confirme);
	const echecs = lignes.filter((l) => !l.confirme);
	console.log(`\nSites confirmés : ${confirmes.length}/${lignes.length} (${pct(confirmes.length, lignes.length)})`);
	console.log(`Échecs : ${echecs.length}`);
	for (const e of echecs) {
		console.log(`  - ${e.code_insee} ${e.nom} (${e.departement}) : ${e.raison} — ${e.url_candidate || "aucune URL"}`);
	}

	if (APPLIQUER) {
		const plan = planApplication(lignes);
		const resultat = await appliquerPlan(plan);
		console.log(
			`\nBase : ${resultat.organisations} organisation(s) mise(s) à jour sur ${plan.length} site(s) confirmé(s).`,
		);
	} else {
		console.log("\nMode rapport : aucune écriture en base (ajouter --appliquer).");
	}
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
