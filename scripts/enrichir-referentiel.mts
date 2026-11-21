#!/usr/bin/env -S npx tsx
/**
 * Enrichissement du référentiel (1 673 151 organisations mesurées le 2026-11-21).
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/enrichir-referentiel.mts [options]
 *
 * Par défaut : MODE RAPPORT, aucune écriture. `--appliquer` est la seule porte
 * d'écriture : il trace chaque valeur retenue dans `org_enrichment` (source +
 * confiance) puis remplit les colonnes vides de `org`, sans jamais écraser une
 * valeur existante. Le rapport mesure le taux de couverture avant/après par
 * champ, projeté en mode rapport et remesuré en mode --appliquer.
 *
 * Sources :
 *   - domaine : nom de domaine candidat vérifié par un HTTP 200 final sur le
 *     même domaine (timeout, retries, refus des hôtes privés) ;
 *   - SIREN   : API recherche-entreprises.api.gouv.fr, repli sur le snapshot
 *     SIRENE versionné si l'API ne répond pas ou avec --offline ;
 *   - secteur : code NAF de la même fiche, ramené à un secteur éditorial ;
 *   - géo     : code postal résolu par le référentiel communal versionné.
 *
 * Options :
 *   --appliquer            écrit la provenance et les colonnes vides
 *   --rapport              explicite, identique au défaut
 *   --champ=domain,siren,secteur,geo   champs à traiter
 *   --seuil=0.70           confiance minimale [0,1]
 *   --limite=N             nombre max d'orgs examinées (0 = toutes)
 *   --dept=16,17           filtre département
 *   --offline              aucun appel HTTP/API ; désactive le domaine
 *   --source-siren=api|snapshot      source prioritaire (défaut api)
 *   --timeout-ms=5000      timeout par requête réseau
 *   --concurrence=4        organisations analysées en parallèle
 *   --reessais=2           reprises sur 429/5xx
 *   --json=chemin          écrit aussi le rapport JSON (opt-in explicite)
 *   --help                 affiche cette aide
 */

import { readFile, writeFile } from "node:fs/promises";
import { closePools } from "../apps/api/src/db.js";
import {
	analyserOrganisation,
	CHAMPS,
	indexerCommunes,
	indexerEntreprises,
	LIBELLE_CHAMP,
	type Champ,
	type Commune,
	type ContexteEnrichissement,
	type EntrepriseSnapshot,
	type FetchLike,
	type Proposition,
	type ReponseLike,
} from "../apps/api/src/referentiel/enrichissement.js";
import {
	appliquerLot,
	lireOrganisations,
	mesurerCouverture,
} from "../apps/api/src/referentiel/enrichissement-db.js";

const API_BASE = "https://recherche-entreprises.api.gouv.fr/search";
const REFERENTIEL_JSON = new URL("../db/data/referentiel-na.json", import.meta.url);
const ENTREPRISES_JSON = new URL("../db/data/entreprises-na.json", import.meta.url);
const Pagination = 500;

interface Options {
	appliquer: boolean;
	champs: Champ[];
	seuil: number;
	limite: number;
	depts: string[];
	offline: boolean;
	modeSiren: "api" | "snapshot";
	timeoutMs: number;
	concurrence: number;
	reessais: number;
	jsonPath: string | null;
}

function texteErreur(e: unknown): string {
	const s = e instanceof Error ? e.message : String(e);
	return s.replace(/\s+/g, " ").slice(0, 200);
}

function usage(code: number): never {
	console.error(
		"usage : apps/api/node_modules/.bin/tsx scripts/enrichir-referentiel.mts " +
			"[--appliquer|--rapport] [--champ=domain,siren,secteur,geo] [--seuil=0.70] " +
			"[--limite=N] [--dept=16,17] [--offline] [--source-siren=api|snapshot] " +
			"[--timeout-ms=5000] [--concurrence=4] [--reessais=2] [--json=chemin]",
	);
	process.exit(code);
}

function valeurArg(args: string[], nom: string): string | null {
	const prefix = `--${nom}=`;
	const trouve = args.find((a) => a.startsWith(prefix));
	return trouve ? trouve.slice(prefix.length) : null;
}

function nombreArg(args: string[], nom: string, defaut: number): number {
	const brut = valeurArg(args, nom);
	if (brut === null) return defaut;
	const n = Number(brut);
	if (!Number.isFinite(n)) throw new Error(`--${nom} doit être un nombre : « ${brut} »`);
	return n;
}

function entierArg(args: string[], nom: string, defaut: number, min: number): number {
	const n = nombreArg(args, nom, defaut);
	if (!Number.isInteger(n) || n < min) throw new Error(`--${nom} doit être un entier >= ${min} : « ${n} »`);
	return n;
}

function analyserArgs(args: string[]): Options {
	if (args.includes("--help") || args.includes("-h")) usage(0);
	const connus = new Set(["--appliquer", "--rapport", "--offline"]);
	const avecValeur = ["champ", "seuil", "limite", "dept", "source-siren", "timeout-ms", "concurrence", "reessais", "json"];
	for (const arg of args) {
		if (connus.has(arg)) continue;
		if (avecValeur.some((n) => arg.startsWith(`--${n}=`))) continue;
		throw new Error(`argument inconnu : ${arg}`);
	}
	if (args.includes("--appliquer") && args.includes("--rapport")) {
		throw new Error("--appliquer et --rapport sont exclusifs");
	}

	const brutChamps = valeurArg(args, "champ");
	const alias: Record<string, Champ> = { domaine: "domain", siren: "siren", secteur: "secteur", geo: "geo", geolocalisation: "geo" };
	const champs = brutChamps === null
		? [...CHAMPS]
		: [...new Set(brutChamps.split(",").map((s) => alias[s.trim().toLowerCase()] ?? s.trim().toLowerCase() as Champ))];
	for (const champ of champs) {
		if (!CHAMPS.includes(champ as (typeof CHAMPS)[number])) throw new Error(`champ inconnu : ${champ}`);
	}
	if (champs.length === 0) throw new Error("au moins un --champ est requis");

	const seuil = nombreArg(args, "seuil", 0.7);
	if (seuil <= 0 || seuil > 1) throw new Error("--seuil doit être dans ]0, 1]");

	const modeSiren = valeurArg(args, "source-siren") ?? "api";
	if (modeSiren !== "api" && modeSiren !== "snapshot") throw new Error("--source-siren vaut api ou snapshot");

	const brutDeparts = valeurArg(args, "dept");
	const depts = brutDeparts === null ? [] : brutDeparts.split(",").map((d) => d.trim()).filter(Boolean);
	for (const d of depts) {
		if (!/^(\d{2}|2[ABab])$/.test(d)) throw new Error(`département invalide : ${d}`);
	}

	return {
		appliquer: args.includes("--appliquer"),
		champs: champs as Champ[],
		seuil,
		limite: entierArg(args, "limite", 0, 0),
		depts,
		offline: args.includes("--offline"),
		modeSiren: args.includes("--offline") ? "snapshot" : modeSiren as "api" | "snapshot",
		timeoutMs: entierArg(args, "timeout-ms", 5000, 100),
		concurrence: entierArg(args, "concurrence", 4, 1),
		reessais: entierArg(args, "reessais", 2, 0),
		jsonPath: valeurArg(args, "json"),
	};
}

interface Chargement<T> {
	liste: T[];
	erreur: string | null;
}

async function chargerJson<T>(url: URL, cle: string): Promise<Chargement<T>> {
	try {
		const brut = await readFile(url, "utf8");
		const parsed = JSON.parse(brut) as Record<string, unknown>;
		const liste = parsed[cle];
		if (!Array.isArray(liste)) return { liste: [], erreur: `clé « ${cle} » absente ou non-tableau` };
		return { liste: liste as T[], erreur: null };
	} catch (e) {
		return { liste: [], erreur: texteErreur(e) };
	}
}

function texte(valeur: unknown): string | null {
	return typeof valeur === "string" && valeur.trim() ? valeur.trim() : null;
}

function nombre(valeur: unknown): number | null {
	return typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;
}

function commeCommunes(brut: Record<string, unknown>[]): Commune[] {
	return brut
		.map((c) => ({
			code: texte(c.code) ?? "",
			nom: texte(c.nom) ?? "",
			departement: texte(c.departement) ?? "",
			codesPostaux: Array.isArray(c.codesPostaux) ? c.codesPostaux.map((cp) => texte(cp) ?? "").filter(Boolean) : [],
			lat: nombre(c.lat),
			lon: nombre(c.lon),
			population: nombre(c.population),
		}))
		.filter((c) => c.code && c.nom);
}

function commeEntreprises(brut: Record<string, unknown>[]): EntrepriseSnapshot[] {
	return brut
		.map((e) => {
			const siege = (e.siege && typeof e.siege === "object" ? e.siege : {}) as Record<string, unknown>;
			const alternatifs = Array.isArray(e.nomsAlternatifs)
				? e.nomsAlternatifs.map((a) => texte(a)).filter((a): a is string => a !== null)
				: texte(e.nomsAlternatifs);
			return {
				siren: texte(e.siren) ?? "",
				nom: texte(e.nom) ?? "",
				sigle: texte(e.sigle),
				nomsAlternatifs: alternatifs,
				naf: texte(e.naf),
				etat: texte(e.etat),
				siege: {
					codePostal: texte(siege.codePostal),
					commune: texte(siege.commune),
					departement: texte(siege.departement),
					codeCommune: texte(siege.codeCommune),
					lat: nombre(siege.lat),
					lon: nombre(siege.lon),
				},
			};
		})
		.filter((e) => /^\d{9}$/.test(e.siren) && e.nom);
}

/** Un fetch unique, avec timeout et mémoire des réponses identiques. */
function creerFetch(options: Options): FetchLike {
	const brut: FetchLike = async (url, init) => {
		const controle = new AbortController();
		const minuteur = setTimeout(() => controle.abort(), options.timeoutMs);
		try {
			return await fetch(url, { ...init, signal: controle.signal }) as ReponseLike;
		} finally {
			clearTimeout(minuteur);
		}
	};
	const memo = new Map<string, Promise<ReponseLike>>();
	return (url, init) => {
		const enCours = memo.get(url);
		if (enCours) return enCours;
		const promesse = brut(url, init);
		memo.set(url, promesse);
		return promesse;
	};
}

async function sonderApi(fetch: FetchLike, options: Options): Promise<{ ok: boolean; motif: string | null }> {
	if (options.offline || options.modeSiren !== "api") return { ok: false, motif: "desactivee" };
	const url = `${API_BASE}?q=diagnostic&per_page=1`;
	const controle = new AbortController();
	const minuteur = setTimeout(() => controle.abort(), options.timeoutMs);
	try {
		const reponse = await fetch(url, { signal: controle.signal });
		return reponse.status === 200
			? { ok: true, motif: null }
			: { ok: false, motif: `http-${reponse.status}` };
	} catch (e) {
		return { ok: false, motif: texteErreur(e) };
	} finally {
		clearTimeout(minuteur);
	}
}

function formatTaux(taux: number): string {
	return `${(taux * 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

function formatNombre(n: number): string {
	return n.toLocaleString("fr-FR");
}

async function main(): Promise<void> {
	const options = analyserArgs(process.argv.slice(2).filter((arg) => arg !== "--"));
	const fetchReseau = creerFetch(options);
	const [brutCommunes, brutEntreprises] = await Promise.all([
		chargerJson<Record<string, unknown>>(REFERENTIEL_JSON, "communes"),
		chargerJson<Record<string, unknown>>(ENTREPRISES_JSON, "entreprises"),
	]);
	const communes = commeCommunes(brutCommunes.liste);
	const entreprises = commeEntreprises(brutEntreprises.liste);
	const indexEntreprises = indexerEntreprises(entreprises);
	const indexCommunes = indexerCommunes(communes);

	const sondage = await sonderApi(fetchReseau, options);
	const modeSiren: "api" | "snapshot" = sondage.ok ? "api" : "snapshot";
	const ctx: ContexteEnrichissement = {
		champs: new Set(options.champs),
		seuil: options.seuil,
		modeSiren,
		verifierHttp: !options.offline,
		apiBase: API_BASE,
		timeoutMs: options.timeoutMs,
		retries: options.reessais,
		fetchHttp: options.offline ? undefined : fetchReseau,
		fetchApi: options.offline ? undefined : fetchReseau,
		entreprisesParNom: indexEntreprises.parNom,
		entreprisesParSiren: indexEntreprises.parSiren,
		communesParCp: indexCommunes.parCp,
		communesParNom: indexCommunes.parNom,
	};

	console.log(`[enrichissement] ${options.appliquer ? "APPLICATION (écritures)" : "RAPPORT (aucune écriture)"}`);
	console.log(
		`[enrichissement] champs : ${options.champs.join(", ")} | seuil ${options.seuil} | ` +
			`limite ${options.limite === 0 ? "aucune" : options.limite} | ${options.offline ? "hors ligne" : "réseau actif"}`,
	);
	if (brutCommunes.erreur) console.log(`[enrichissement] communes indisponibles : ${brutCommunes.erreur}`);
	if (brutEntreprises.erreur) console.log(`[enrichissement] entreprises indisponibles : ${brutEntreprises.erreur}`);
	if (!sondage.ok && !options.offline && options.modeSiren === "api") {
		console.log(`[enrichissement] API SIREN indisponible (${sondage.motif}) — repli sur le snapshot local`);
	}

	const avant = await mesurerCouverture();
	const propositions: Proposition[] = [];
	const rejets = new Map<string, number>();
	const erreurs: string[] = [];
	let examines = 0;
	let apresId = 0;
	let tentativesHttp = 0;
	let appelsApi = 0;

	while (true) {
		const restant = options.limite === 0 ? Pagination : Math.min(Pagination, options.limite - examines);
		if (restant <= 0) break;
		const orgs = await lireOrganisations({
			champs: ctx.champs,
			apresId,
			limite: restant,
			depts: options.depts.length ? options.depts : undefined,
		});
		if (orgs.length === 0) break;
		for (let i = 0; i < orgs.length; i += options.concurrence) {
			const lots = await Promise.all(orgs.slice(i, i + options.concurrence).map((org) => analyserOrganisation(org, ctx)));
			for (const lot of lots) {
				propositions.push(...lot.propositions);
				tentativesHttp += lot.tentativesHttp;
				appelsApi += lot.appelsApi;
				for (const r of lot.rejets) rejets.set(r.motif, (rejets.get(r.motif) ?? 0) + 1);
			}
		}
		examines += orgs.length;
		apresId = orgs[orgs.length - 1]!.id;
	}

	const application = { valeursTracees: 0, colonnesMisesAJour: 0, lots: 0, echecs: 0 };
	if (options.appliquer && propositions.length > 0) {
		for (let i = 0; i < propositions.length; i += Pagination) {
			try {
				const lot = await appliquerLot(propositions.slice(i, i + Pagination));
				application.valeursTracees += lot.valeursTracees;
				application.colonnesMisesAJour += lot.colonnesMisesAJour;
				application.lots++;
			} catch (e) {
				application.echecs++;
				erreurs.push(`lot ${i / Pagination + 1}: ${texteErreur(e)}`);
			}
		}
	}

	const apres = options.appliquer && application.echecs === 0 ? await mesurerCouverture() : null;
	const parChamp = Object.fromEntries(options.champs.map((champ) => {
		const avantChamp = avant.avant[champ];
		const nombreAvant = avantChamp.remplis;
		const tauxAvant = avant.total > 0 ? nombreAvant / avant.total : 0;
		const retenues = propositions.filter((p) => p.champ === champ);
		const nombreApres = apres ? apres.avant[champ].remplis : nombreAvant + retenues.length;
		return [champ, {
			avant: nombreAvant,
			tauxAvant: Math.round(tauxAvant * 1_000_000) / 1_000_000,
			apres: nombreApres,
			tauxApres: avant.total > 0 ? Math.round((nombreApres / avant.total) * 1_000_000) / 1_000_000 : 0,
			gain: nombreApres - nombreAvant,
			propositions: retenues.length,
			tracesAvant: avantChamp.traces,
			tracesApres: apres ? apres.avant[champ].traces : avantChamp.traces + retenues.length,
		}];
	}));

	const confiances = propositions.map((p) => p.confiance);
	const rapport = {
		genereLe: new Date().toISOString(),
		mode: options.appliquer ? "application" : "rapport (aucune écriture)",
		parametres: {
			champs: options.champs,
			seuil: options.seuil,
			limite: options.limite,
			depts: options.depts,
			offline: options.offline,
			concurrence: options.concurrence,
		},
		totalOrganisations: avant.total,
		organisationsExaminees: examines,
		sources: {
			api: {
				mode: modeSiren,
				diagnostic: sondage.ok ? "ok" : sondage.motif,
				appels: appelsApi,
			},
			http: {
				verifications: tentativesHttp,
				retenues: propositions.filter((p) => p.champ === "domain").length,
				note: options.offline ? "vérification HTTP désactivée (--offline)" : "HTTP 200 final sur le même domaine",
			},
			snapshots: {
				entreprises: entreprises.length,
				entreprisesIndice: indexEntreprises.parNom.size,
				entreprisesErreur: brutEntreprises.erreur,
				communes: communes.length,
				codesPostaux: indexCommunes.parCp.size,
				communesErreur: brutCommunes.erreur,
			},
		},
		couverture: parChamp,
		propositions: {
			total: propositions.length,
			parChamp: Object.fromEntries(options.champs.map((c) => [c, propositions.filter((p) => p.champ === c).length])),
			parSource: Object.fromEntries(
				[...new Set(propositions.map((p) => p.source))]
					.map((s): [string, number] => [s, propositions.filter((p) => p.source === s).length])
					.sort((a, b) => b[1] - a[1]),
			),
			confiance: {
				min: confiances.length ? Math.min(...confiances) : null,
				max: confiances.length ? Math.max(...confiances) : null,
				moyenne: confiances.length ? Math.round((confiances.reduce((a, b) => a + b, 0) / confiances.length) * 1000) / 1000 : null,
			},
		},
		rejets: {
			total: [...rejets.values()].reduce((a, b) => a + b, 0),
			parMotif: Object.fromEntries([...rejets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)),
		},
		application,
		erreurs: erreurs.slice(0, 20),
		echantillon: propositions.slice(0, 10),
	};

	console.log(`[enrichissement] ${formatNombre(avant.total)} organisations, ${formatNombre(examines)} examinées`);
	for (const champ of options.champs) {
		const c = parChamp[champ]!;
		console.log(
			`[enrichissement] ${LIBELLE_CHAMP[champ].padEnd(17)} : ${formatNombre(c.avant)} (${formatTaux(c.tauxAvant)}) ` +
				`→ ${formatNombre(c.apres)} (${formatTaux(c.tauxApres)})  ${c.gain >= 0 ? "+" : ""}${formatNombre(c.gain)}`,
		);
	}
	console.log(
		`[enrichissement] propositions : ${rapport.propositions.total} ` +
			`(${Object.entries(rapport.propositions.parChamp).map(([k, v]) => `${k}=${v}`).join(", ") || "aucune"})`,
	);
	console.log(
		`[enrichissement] vérifications HTTP : ${rapport.sources.http.verifications}, appels API SIREN : ${appelsApi}, ` +
			`rejets : ${rapport.rejets.total}`,
	);
	if (options.appliquer) {
		console.log(
			`[enrichissement] application : ${application.valeursTracees} valeur(s) tracée(s), ` +
				`${application.colonnesMisesAJour} colonne(s) remplie(s), ${application.echecs} lot(s) en échec`,
		);
	}
	if (examines === 0) console.log("[enrichissement] état vide : aucune organisation à examiner sur ces champs.");
	if (propositions.length === 0) console.log("[enrichissement] état vide : aucune proposition retenue.");
	if (options.offline && ctx.champs.has("domain")) console.log("[enrichissement] domaines sans proposition : HTTP désactivé par --offline.");
	if (entreprises.length === 0 && (ctx.champs.has("siren") || ctx.champs.has("secteur"))) console.log("[enrichissement] état vide : aucun snapshot entreprise, SIREN/secteur non enrichis.");
	if (communes.length === 0 && ctx.champs.has("geo")) console.log("[enrichissement] état vide : aucun snapshot communal, géo non enrichie.");
	for (const e of erreurs) console.error(`[enrichissement] erreur : ${e}`);
	for (const p of rapport.echantillon) {
		console.log(
			`  ${String(p.orgId).padStart(8)}  ${p.confiance.toFixed(3)}  ${p.champ.padEnd(7)} ` +
				`${JSON.stringify(p.valeur)}  ← ${p.source}`,
		);
	}
	if (options.jsonPath) {
		await writeFile(options.jsonPath, `${JSON.stringify(rapport, null, 2)}\n`, "utf8");
		console.log(`[enrichissement] rapport JSON écrit : ${options.jsonPath}`);
	}
	console.log(JSON.stringify(rapport));
}

try {
	await main();
} catch (e) {
	console.error(`[enrichissement] erreur fatale : ${texteErreur(e)}`);
	process.exitCode = 1;
} finally {
	await closePools();
}
