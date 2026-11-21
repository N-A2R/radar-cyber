#!/usr/bin/env -S npx tsx
/**
 * Étend le corpus santé/enseignement avec les fiches publiques de Santé.fr.
 *
 *   apps/api/node_modules/.bin/tsx scripts/corpus-sante-extension.mts
 *   apps/api/node_modules/.bin/tsx scripts/corpus-sante-extension.mts \
 *     --departements=Gironde,Charente --appliquer
 *
 * Sans `--appliquer` : rapport seul, aucun fichier modifié. Les fiches sont
 * découvertes via l'API publique du moteur de recherche de Santé.fr, puis
 * chaque URL est chargée : seules les pages HTTP 200 mentionnant au moins
 * deux jetons du nom sont ajoutées. Le rapport JSON garde la preuve par ligne.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
	estEtablissementSante,
	DEPARTEMENTS_NA,
	evaluerPageSante,
	extraireCandidatsSante,
	TERMES_SANTE,
	ligneCorpusSante,
	nouveauxCandidats,
	typeSante,
	urlRechercheSante,
	type CandidatSante,
	type VerificationSante,
} from "../apps/api/src/corpus/sante.js";

const CORPUS = fileURLToPath(new URL("../bench/corpus/sante-enseignement.jsonl", import.meta.url));
const RAPPORT = fileURLToPath(new URL("../bench/results/extension-sante-enseignement.json", import.meta.url));
const USER_AGENT =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const argv = process.argv.slice(2);
const option = (nom: string): string | undefined =>
	argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);
const appliquer = argv.includes("--appliquer");
const aide = argv.includes("--help") || argv.includes("-h");
const concurrence = Number(option("concurrence") ?? "10");
const pages = Number(option("pages") ?? "1");
const limite = option("limite") ? Number(option("limite")) : null;
const departements = option("departements")?.split(",").map((d) => d.trim()) ?? [...DEPARTEMENTS_NA];

if (aide) {
	console.log("Usage : tsx scripts/corpus-sante-extension.mts [--appliquer] [--departements=A,B] [--pages=N] [--limite=N] [--concurrence=N]");
	process.exit(0);
}
for (const [nom, valeur] of [["concurrence", concurrence], ["pages", pages]] as const) {
	if (!Number.isInteger(valeur) || valeur < 1) throw new Error(`--${nom} doit être un entier positif`);
}
for (const d of departements) {
	if (!(DEPARTEMENTS_NA as readonly string[]).includes(d)) throw new Error(`Département inconnu : ${d}`);
}

async function enParallele<T, R>(elements: T[], nb: number, tache: (e: T) => Promise<R>): Promise<R[]> {
	const resultats = new Array<R>(elements.length);
	let curseur = 0;
	await Promise.all(Array.from({ length: Math.min(nb, elements.length) }, async () => {
		for (;;) {
			const i = curseur++;
			if (i >= elements.length) return;
			resultats[i] = await tache(elements[i]!);
		}
	}));
	return resultats;
}

async function getJson(url: string): Promise<unknown | null> {
	for (let essai = 0; essai < 2; essai++) {
		try {
			const reponse = await fetch(url, {
				headers: { "User-Agent": USER_AGENT, Accept: "application/json", Referer: "https://www.sante.fr/" },
				signal: AbortSignal.timeout(25_000),
			});
			if (reponse.ok) return await reponse.json();
		} catch {
			/* nouvel essai */
		}
	}
	return null;
}

type CandidatVerifie = { candidat: CandidatSante; type: ReturnType<typeof typeSante>; verification: VerificationSante };

async function sonder(candidat: CandidatSante): Promise<CandidatVerifie> {
	let statut: number | null = null;
	let urlFinale: string | null = null;
	try {
		const reponse = await fetch(candidat.url, {
			headers: { "User-Agent": USER_AGENT, "Accept-Language": "fr-FR,fr;q=0.9" },
			signal: AbortSignal.timeout(15_000),
		});
		statut = reponse.status;
		urlFinale = reponse.url;
		const html = (await reponse.text()).slice(0, 400_000);
		return { candidat, type: typeSante(candidat.types, candidat.nom), verification: evaluerPageSante(html, statut, urlFinale, candidat.nom) };
	} catch (error) {
		return {
			candidat,
			type: typeSante(candidat.types, candidat.nom),
			verification: {
				confirme: false,
				raison: `réseau : ${error instanceof Error ? error.message.slice(0, 100) : "erreur"}`,
				statut,
				urlFinale,
				jetonsTrouves: [],
				extrait: null,
			},
		};
	}
}

async function main(): Promise<void> {
	const brut = await readFile(CORPUS, "utf8");
	const existants = brut.split("\n").flatMap((ligne) => {
		if (!ligne.trim()) return [];
		try {
			const o = JSON.parse(ligne) as Record<string, unknown>;
			return typeof o.nom === "string" && typeof o.url === "string"
				? [{ nom: o.nom, url: o.url }]
				: [];
		} catch {
			return [];
		}
	});
	const ids = new Set(
		brut.split("\n").flatMap((ligne) => {
			const m = ligne.match(/"id"\s*:\s*"na-sante-(\d+)"/);
			return m ? [Number(m[1])!] : [];
		}),
	);
	let prochainId = ids.size ? Math.max(...ids) + 1 : 1;

	const jobs = departements.flatMap((d) =>
		TERMES_SANTE.flatMap((t) => Array.from({ length: pages }, (_, i) => ({ departement: d, terme: t, page: i + 1 }))),
	);
	const reponses = await enParallele(jobs, concurrence, (j) => getJson(urlRechercheSante(j.terme, j.departement, j.page)));
	const bruts: CandidatSante[] = [];
	for (let i = 0; i < jobs.length; i++) {
		if (reponses[i]) bruts.push(...extraireCandidatsSante(reponses[i], jobs[i]!.departement));
	}
	const uniques = nouveauxCandidats(bruts, existants)
		.filter((c) => typeSante(c.types, c.nom) !== null && estEtablissementSante(c))
		.sort((a, b) =>
			a.departement.localeCompare(b.departement, "fr") ||
			a.commune.localeCompare(b.commune, "fr") ||
			a.nom.localeCompare(b.nom, "fr"));
	const candidats = limite === null ? uniques : uniques.slice(0, limite);
	const verifies = await enParallele(candidats, concurrence, sonder);
	const retenus = verifies.filter((v) => v.verification.confirme && v.type !== null);
	const date = new Date().toISOString().slice(0, 10);
	const lignes = retenus.map((v) => ligneCorpusSante(v.candidat, v.type!, `na-sante-${String(prochainId++).padStart(4, "0")}`, v.verification, date));

	const comptes = (cle: (v: CandidatVerifie) => string): Record<string, number> =>
		Object.fromEntries([...new Set(verifies.map(cle))].sort().map((k) => [k, verifies.filter((v) => cle(v) === k).length]));
	const rapport = {
		genereLe: new Date().toISOString(),
		corpus: CORPUS,
		protocole: {
			source: "Santé.fr, annuaire public des établissements (API solr/request/ajax)",
			criteres: "HTTP 200 et au moins deux jetons distincts du nom dans le texte visible",
			timeoutMs: 15_000,
			concurrence,
			pages,
			departements,
		},
		totaux: {
			fichesVues: bruts.length,
			candidatsNouveaux: candidats.length,
			verifies: verifies.length,
			valides: retenus.length,
			tauxValidite: verifies.length ? Number((retenus.length / verifies.length).toFixed(4)) : 0,
		},
		parDepartement: comptes((v) => v.candidat.departement),
		parType: comptes((v) => v.type ?? "ignore"),
		ajouts: retenus.map((v, i) => ({
			id: lignes[i]!.id,
			nom: v.candidat.nom,
			type: v.type,
			commune: v.candidat.commune,
			département: v.candidat.departement,
			url: v.candidat.url,
			jetonsTrouves: v.verification.jetonsTrouves,
		})),
		echecs: verifies.filter((v) => !v.verification.confirme).map((v) => ({
			url: v.candidat.url,
			raison: v.verification.raison,
		})),
	};
	console.log(JSON.stringify({
		totaux: rapport.totaux,
		parDepartement: rapport.parDepartement,
		parType: rapport.parType,
		ajouts: rapport.ajouts.length,
	}, null, 2));
	if (appliquer && lignes.length) {
		await writeFile(CORPUS, `${brut.replace(/\s*$/, "")}\n${lignes.map((l) => JSON.stringify(l)).join("\n")}\n`, "utf8");
	}
	if (appliquer) {
		const apres = await readFile(CORPUS, "utf8");
		const ajoutes = apres.split("\n").flatMap((ligne) => {
			if (!ligne.trim()) return [];
			try {
				const o = JSON.parse(ligne) as Record<string, unknown>;
				if (o.source !== "sante.fr fiche établissement") return [];
				return [{
					id: o.id,
					nom: o.nom,
					type: o.type,
					commune: o.commune,
					département: o["département"],
					url: o.url,
					jetons_trouves: o.jetons_trouves,
					verifie_le: o.verifie_le,
				}];
			} catch {
				return [];
			}
		});
		const compte = (cle: (a: (typeof ajoutes)[number]) => unknown): Record<string, number> =>
			Object.fromEntries([...new Set(ajoutes.map((a) => String(cle(a))))].sort().map((k) =>
				[k, ajoutes.filter((a) => String(cle(a)) === k).length]));
		await writeFile(RAPPORT, `${JSON.stringify({
			...rapport,
			totaux: { ...rapport.totaux, ajoutsCumules: ajoutes.length },
			parDepartementCumul: compte((a) => a.département),
			parTypeCumul: compte((a) => a.type),
			ajouts: ajoutes,
		}, null, 2)}\n`, "utf8");
	}
}

await main();
